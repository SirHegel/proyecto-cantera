"use server";

import { getUserProviderSettings } from "@/lib/settings";
import { boundedText } from "@/lib/validation";
import { revalidatePath } from "next/cache";
import { getAiProvider } from "@/lib/providers/ai";
import { consumeQuota, QuotaExceeded, recordUsage } from "@/lib/quota";
import { supabaseServer } from "@/lib/supabase/server";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; message: string };

/** §13 — "✨ Ayúdame a definirlo". Pasa por la frontera de proveedores como todo. */
export async function suggestProblem(
  whatISell: string,
): Promise<ActionResult<{ problem: string; niches: string[] }>> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Tu sesión caducó. Vuelve a entrar." };

  if (!boundedText(whatISell, 3000) || whatISell.trim().length < 20) {
    return { ok: false, message: "Cuéntame un poco más de lo que vendes y lo deduzco." };
  }

  try {
    await consumeQuota(user.id, "quality_generations_per_day");
  } catch (e) {
    if (e instanceof QuotaExceeded) return { ok: false, message: e.friendly };
    throw e;
  }

  try {
    const ai = getAiProvider(undefined, await getUserProviderSettings(user.id));
    const { result, usage } = await ai.inferProblem(whatISell.trim());
    await recordUsage(user.id, "ai_quality", 1, usage.costUsd, { op: "infer_problem" });
    return { ok: true, data: result };
  } catch {
    return {
      ok: false,
      message: "No pudimos preparar la sugerencia. Puedes escribir el problema y continuar.",
    };
  }
}

export type NewSearch = {
  whatISell: string;
  problemSolved: string;
  niche: string;
  country: string;
  city: string;
  language: "es" | "en";
  targetCount: number;
  demo: boolean;
};

export async function startSearch(input: NewSearch): Promise<ActionResult<{ id: string }>> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Tu sesión caducó. Vuelve a entrar." };

  if (
    !input ||
    !boundedText(input.whatISell, 3000) ||
    !boundedText(input.problemSolved, 3000) ||
    !boundedText(input.niche, 120) ||
    !boundedText(input.country, 100) ||
    !boundedText(input.city, 120) ||
    ![25, 50, 100].includes(input.targetCount) ||
    !["es", "en"].includes(input.language) ||
    typeof input.demo !== "boolean"
  ) {
    return { ok: false, message: "Revisa los campos de la búsqueda y vuelve a intentarlo." };
  }
  const settings = await getUserProviderSettings(user.id);
  const { placesMode, aiMode } = settings;
  const demo = input.demo;
  if (!demo && (placesMode === "fixture" || aiMode === "fixture")) {
    return {
      ok: false,
      message:
        "Para buscar negocios reales configura ambos proveedores (Places e IA). También puedes usar la demostración.",
    };
  }
  if (!demo && (!settings.googleKey || !settings.openaiKey)) {
    return {
      ok: false,
      message:
        "Faltan las claves de Google Places y/o OpenAI. Configúralas antes de iniciar una búsqueda real.",
    };
  }
  if (!input.country.trim()) return { ok: false, message: "Elige el país donde buscar." };

  if (!input.whatISell.trim()) return { ok: false, message: "Falta describir qué vendes." };
  if (!input.niche.trim()) return { ok: false, message: "Falta elegir a quién quieres venderle." };

  // Las búsquedas demo no gastan cuota: para eso existen.
  if (!demo) {
    try {
      await consumeQuota(user.id, "searches_per_day");
    } catch (e) {
      if (e instanceof QuotaExceeded) return { ok: false, message: e.friendly };
      throw e;
    }
  }

  // La oferta se guarda y se reutiliza en la siguiente búsqueda.
  const { data: offer, error: offerErr } = await supabase
    .from("offers")
    .insert({
      user_id: user.id,
      name: input.niche,
      what_i_sell: input.whatISell.trim(),
      problem_solved: input.problemSolved.trim() || null,
    })
    .select("id")
    .single();

  if (offerErr) return { ok: false, message: "No pudimos guardar tu oferta. Inténtalo otra vez." };

  const { data: search, error } = await supabase
    .from("searches")
    .insert({
      user_id: user.id,
      offer_id: offer.id,
      niche: demo ? "Clínicas dentales" : input.niche.trim(),
      country: demo ? "Estados Unidos" : input.country.trim(),
      city: demo ? "Miami" : input.city.trim() || null,
      language: input.language,
      target_count: input.targetCount,
      mode: demo ? "demo" : "live",
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    await supabase.from("offers").delete().eq("id", offer.id);
    return { ok: false, message: "No pudimos crear la búsqueda. Inténtalo otra vez." };
  }

  revalidatePath("/");
  return { ok: true, data: { id: search.id } };
}

/** Editor de oferta en Configuración. */
export async function saveOffer(formData: FormData): Promise<void> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const whatISell = String(formData.get("what_i_sell") ?? "").trim();
  if (!whatISell || whatISell.length > 3000)
    throw new Error("Describe tu oferta usando entre 1 y 3000 caracteres.");

  const { error } = await supabase.from("offers").insert({
    user_id: user.id,
    what_i_sell: whatISell,
    problem_solved: String(formData.get("problem_solved") ?? "").trim() || null,
  });

  if (error) throw new Error("No pudimos guardar tu oferta.");
  revalidatePath("/configuracion");
  revalidatePath("/buscar");
}
