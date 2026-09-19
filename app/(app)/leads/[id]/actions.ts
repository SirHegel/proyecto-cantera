"use server";

import { getUserProviderSettings } from "@/lib/settings";
import { revalidatePath } from "next/cache";
import { EXPLICACIONES, lintMessage, sanitize } from "@/lib/pipeline/message-rules";
import { getAiProvider } from "@/lib/providers/ai";
import { consumeQuota, QuotaExceeded, recordUsage } from "@/lib/quota";
import { supabaseServer } from "@/lib/supabase/server";

export type AngleState = { ok: true } | { ok: false; message: string };

/**
 * §24 — CREAR ÁNGULO.
 *
 * Nunca automático: se dispara solo cuando el alumno decide trabajar ese lead.
 * Usa el modelo de calidad y trabaja únicamente con la evidencia ya verificada
 * que quedó guardada, así que no vuelve a leer la web ni inventa contexto.
 */
export async function createAngle(leadId: string): Promise<AngleState> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Tu sesión caducó. Vuelve a entrar." };

  const { data: lead } = await supabase
    .from("leads")
    .select(
      "id, business_name, city, offer_id, observed_problem, evidence, reason, confidence, main_cta, has_booking_link, has_form, public_email, is_demo",
    )
    .eq("id", leadId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!lead) return { ok: false, message: "No encontramos ese negocio." };

  const evidencia = (lead.evidence ?? []) as {
    claim: string;
    quote: string;
    sourceUrl: string | null;
  }[];
  if (!evidencia.length) {
    return {
      ok: false,
      message:
        "No tenemos evidencia verificada de este negocio, así que cualquier ángulo sería inventado.",
    };
  }

  if (!lead.is_demo) {
    try {
      await consumeQuota(user.id, "quality_generations_per_day");
    } catch (e) {
      if (e instanceof QuotaExceeded) return { ok: false, message: e.friendly };
      throw e;
    }
  }

  const { data: offer } = lead.offer_id
    ? await supabase
        .from("offers")
        .select("what_i_sell, problem_solved")
        .eq("id", lead.offer_id)
        .maybeSingle()
    : { data: null };

  const ai = getAiProvider(
    lead.is_demo ? "fixture" : undefined,
    await getUserProviderSettings(user.id),
  );

  try {
    const { result, usage } = await ai.generateAngle({
      negocio: lead.business_name,
      ciudad: lead.city,
      oferta: offer?.what_i_sell ?? null,
      problemaQueResuelvo: offer?.problem_solved ?? null,
      problemaObservado: lead.observed_problem,
      evidencia: evidencia.map((e) => ({ afirmacion: e.claim, cita: e.quote })),
      señales: [
        lead.main_cta && `CTA principal: ${lead.main_cta}`,
        lead.has_booking_link ? "tiene reserva online" : "sin reserva online visible",
        lead.has_form ? "tiene formulario" : null,
      ].filter(Boolean),
      confianza: lead.confidence,
    });

    const { error: saveError } = await supabase.from("lead_generations").insert({
      lead_id: lead.id,
      user_id: user.id,
      kind: "angle",
      content: result,
      model: usage.model,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
    });

    if (saveError) throw new Error("No se pudo guardar la generación");
    if (!lead.is_demo) {
      await recordUsage(user.id, "ai_quality", 1, usage.costUsd, { op: "angle", lead_id: lead.id });
    }

    revalidatePath(`/leads/${lead.id}`);
    return { ok: true };
  } catch (e) {
    console.error("[angle]", e);
    return { ok: false, message: "No pudimos preparar el ángulo. Inténtalo en un momento." };
  }
}

export type Canal = "email" | "instagram" | "linkedin";

/**
 * §27 — CREAR MENSAJE.
 *
 * Solo el canal que pidió el alumno (§28): generar los tres cuando solo quiere
 * uno es triplicar tokens para nada.
 *
 * El resultado pasa por el linter de la §29 antes de guardarse. Si falla, se
 * reintenta una vez diciéndole al modelo exactamente qué rompió; si vuelve a
 * fallar se repara mecánicamente, y si ni así pasa no se guarda nada.
 */
export async function createMessage(
  leadId: string,
  canal: Canal,
): Promise<AngleState & { adjusted?: boolean }> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Tu sesión caducó. Vuelve a entrar." };

  const { data: lead } = await supabase
    .from("leads")
    .select("id, business_name, city, search_id, is_demo, observed_problem")
    .eq("id", leadId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!lead) return { ok: false, message: "No encontramos ese negocio." };

  const { data: gen } = await supabase
    .from("lead_generations")
    .select("content")
    .eq("lead_id", lead.id)
    .eq("kind", "angle")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!gen) {
    return { ok: false, message: "Primero crea el ángulo: el mensaje se escribe a partir de él." };
  }

  const { data: search } = lead.search_id
    ? await supabase.from("searches").select("language").eq("id", lead.search_id).maybeSingle()
    : { data: null };

  if (!["email", "instagram", "linkedin"].includes(canal))
    return { ok: false, message: "Canal inválido." };

  const idioma = (search?.language ?? "es") as "es" | "en";

  if (!lead.is_demo) {
    try {
      await consumeQuota(user.id, "quality_generations_per_day");
    } catch (e) {
      if (e instanceof QuotaExceeded) return { ok: false, message: e.friendly };
      throw e;
    }
  }

  const ai = getAiProvider(
    lead.is_demo ? "fixture" : undefined,
    await getUserProviderSettings(user.id),
  );
  const ctx: Record<string, unknown> = {
    negocio: lead.business_name,
    ciudad: lead.city,
    angulo: gen.content,
    problemaObservado: lead.observed_problem,
  };

  try {
    let { result, usage } = await ai.generateMessage(ctx, canal, idioma);
    let costo = usage.costUsd;
    let veredicto = lintMessage(result.body);

    // Reintento con la falta concreta. Sale más barato que entregar basura.
    if (!veredicto.ok) {
      const correcciones = veredicto.issues.map((i) => EXPLICACIONES[i]).join("; ");
      const segundo = await ai.generateMessage(
        { ...ctx, corrigeEsto: correcciones },
        canal,
        idioma,
      );
      result = segundo.result;
      costo += segundo.usage.costUsd;
      usage = segundo.usage;
      veredicto = lintMessage(result.body);
    }

    let adjusted = false;
    if (!veredicto.ok) {
      const reparado = sanitize(result.body);
      if (lintMessage(reparado).ok) {
        result = { ...result, body: reparado };
        adjusted = true;
      } else {
        if (!lead.is_demo)
          await recordUsage(user.id, "ai_quality", 2, costo, { op: "message_failed" });
        return {
          ok: false,
          message: "El mensaje no salió como debía. Vuelve a intentarlo en un momento.",
        };
      }
    }

    const { error: saveError } = await supabase.from("lead_generations").insert({
      lead_id: lead.id,
      user_id: user.id,
      kind: "message",
      channel: canal,
      language: idioma,
      content: { ...result, adjusted },
      model: usage.model,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
    });

    if (saveError) throw new Error("No se pudo guardar la generación");
    if (!lead.is_demo) {
      await recordUsage(user.id, "ai_quality", 1, costo, {
        op: "message",
        canal,
        lead_id: lead.id,
      });
    }

    revalidatePath(`/leads/${lead.id}`);
    return { ok: true, adjusted };
  } catch (e) {
    console.error("[message]", e);
    return { ok: false, message: "No pudimos preparar el mensaje. Inténtalo en un momento." };
  }
}
