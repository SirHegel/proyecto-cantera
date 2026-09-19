import { getUserProviderSettings } from "@/lib/settings";
import { extractSite, mapPool, type Extraction } from "@/lib/pipeline/extract";
import { expectedTypesFor } from "@/lib/pipeline/prefilter";
import { preRank, scoreLead } from "@/lib/pipeline/score";
import { getAiProvider } from "@/lib/providers/ai";
import type { QualifyInput } from "@/lib/providers/types";
import { admin, consumeQuota, recordUsage, remainingQuota } from "@/lib/quota";

const MAX_POR_BUSQUEDA = Number(process.env.MAX_AI_ANALYSES_PER_SEARCH ?? 25);
const LOTE = 5;

export type QualifyProgress =
  | { type: "stage"; message: string }
  | { type: "qualified"; analizados: number; oportunidades: number; recortado: number };

type LeadRow = {
  id: string;
  place_id: string;
  business_name: string;
  city: string | null;
  website_url: string | null;
  public_email: string | null;
  public_phone: string | null;
  has_form: boolean;
  has_booking_link: boolean;
  has_whatsapp: boolean;
  main_cta: string | null;
  web_status: "ok" | "unreachable" | "none";
  extract_hash: string | null;
  score: number;
};

/**
 * §19 — el motor de calificación.
 *
 * Solo llegan aquí los candidatos que sobrevivieron al prefiltro. De ellos,
 * solo los mejores según la parte determinista del score, y como mucho
 * MAX_AI_ANALYSES_PER_SEARCH. El modelo devuelve 35 puntos de 100; los otros
 * 65 los calcula TypeScript.
 */
export async function* qualify(
  search: {
    id: string;
    user_id: string;
    niche: string;
    mode: "live" | "demo";
    offer_id: string | null;
  },
  /**
   * Texto de las webs, en memoria desde la etapa anterior.
   *
   * No se persiste a propósito: 3.500 caracteres por lead son ~175 KB por
   * búsqueda, y con 30 alumnos serían cientos de MB al mes contra los 500 MB
   * del plan gratuito de Supabase. Es dato de trabajo, no dato de negocio —
   * volver a leer una web es gratis, guardarla no.
   */
  extracciones: Map<string, Extraction>,
): AsyncGenerator<QualifyProgress> {
  const db = admin();
  const expectedTypes = expectedTypesFor(search.niche);

  const { data: offer } = search.offer_id
    ? await db
        .from("offers")
        .select("what_i_sell, problem_solved")
        .eq("id", search.offer_id)
        .maybeSingle()
    : { data: null };

  const { data: candidatos } = await db
    .from("leads")
    .select(
      "id, place_id, business_name, city, website_url, public_email, public_phone, has_form, has_booking_link, has_whatsapp, main_cta, web_status, extract_hash, score",
    )
    .eq("search_id", search.id)
    .eq("candidate", true)
    .is("confidence", null);

  const pendientes = (candidatos ?? []) as LeadRow[];
  if (!pendientes.length || !offer) return;

  // Datos de Google, vigentes, para el score determinista.
  const { data: places } = await db
    .from("places_cache")
    .select("place_id, primary_type, types, rating, user_rating_count, website_uri")
    .in(
      "place_id",
      pendientes.map((l) => l.place_id),
    );

  const porPlace = new Map((places ?? []).map((p) => [p.place_id, p]));

  const conContexto = pendientes.map((lead) => {
    const place = porPlace.get(lead.place_id);
    const contexto = {
      place: {
        primaryType: place?.primary_type ?? undefined,
        types: place?.types ?? [],
        rating: place?.rating ?? undefined,
        userRatingCount: place?.user_rating_count ?? undefined,
        websiteUri: place?.website_uri ?? undefined,
      },
      expectedTypes,
      signals: {
        publicEmail: lead.public_email,
        publicPhone: lead.public_phone,
        hasForm: lead.has_form,
        hasWhatsapp: lead.has_whatsapp,
        webStatus: lead.web_status,
      },
    };
    return { lead, contexto, rank: preRank(contexto) };
  });

  // §36 — recortar al presupuesto en vez de fallar a mitad de camino.
  const disponible =
    search.mode === "demo" ? Infinity : await remainingQuota(search.user_id, "ai_analyses_per_day");
  const tope = Math.min(MAX_POR_BUSQUEDA, disponible, conContexto.length);

  const elegidos = [...conContexto].sort((a, b) => b.rank - a.rank).slice(0, tope);
  const recortado = conContexto.length - elegidos.length;

  if (!elegidos.length) {
    yield { type: "qualified", analizados: 0, oportunidades: 0, recortado };
    return;
  }

  if (search.mode !== "demo") {
    await consumeQuota(search.user_id, "ai_analyses_per_day", elegidos.length);
  }

  // Reanudación: si el proceso se cortó tras la extracción, el mapa viene vacío.
  // Releer las webs que falten cuesta cero y evita mandar al modelo sin texto,
  // que dejaría toda la evidencia sin verificar.
  const faltantes = elegidos.filter(
    (e) => !extracciones.has(e.lead.place_id) && e.lead.website_url,
  );
  if (faltantes.length) {
    const releidas = await mapPool(faltantes, async (e) => ({
      placeId: e.lead.place_id,
      data: await extractSite(
        e.lead.website_url,
        search.mode === "demo" && e.lead.website_url
          ? new URL(e.lead.website_url).origin
          : undefined,
      ),
    }));
    for (const { placeId, data } of releidas) extracciones.set(placeId, data);
  }

  await db.from("searches").update({ status: "qualifying" }).eq("id", search.id);
  yield { type: "stage", message: "Analizando oportunidades…" };

  // §8 — lotes. Cinco y no diez: un fallo de esquema invalida cinco, no diez.
  const lotes: (typeof elegidos)[] = [];
  for (let i = 0; i < elegidos.length; i += LOTE) lotes.push(elegidos.slice(i, i + LOTE));

  const ai = getAiProvider(
    search.mode === "demo" ? "fixture" : undefined,
    await getUserProviderSettings(search.user_id),
  );
  const { count: qualifiedBefore } = await db
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("search_id", search.id)
    .eq("qualified", true);
  let oportunidades = qualifiedBefore ?? 0;
  let costo = 0;

  const resultados = await mapPool(
    lotes,
    async (lote) => {
      const items: QualifyInput[] = lote.map(({ lead, contexto }) => ({
        id: lead.id,
        businessName: lead.business_name,
        primaryType: contexto.place.primaryType,
        city: lead.city ?? undefined,
        hasWebsite: !!lead.website_url,
        hasPhone: !!lead.public_phone,
        hasEmail: !!lead.public_email,
        hasBookingLink: lead.has_booking_link,
        hasForm: lead.has_form,
        signals: [
          lead.main_cta && `CTA principal: ${lead.main_cta}`,
          lead.has_booking_link ? "tiene reserva online" : "sin reserva online visible",
          lead.has_form ? "tiene formulario de contacto" : null,
          lead.has_whatsapp ? "tiene WhatsApp" : null,
          lead.web_status === "unreachable" ? "no pudimos leer su web" : null,
        ].filter(Boolean) as string[],
        websiteText: extracciones.get(lead.place_id)?.text ?? "",
      }));

      try {
        return await ai.qualifyBatch(
          {
            whatISell: offer.what_i_sell,
            problemSolved: offer.problem_solved ?? undefined,
            niche: search.niche,
          },
          items,
        );
      } catch (e) {
        console.error("[qualify] lote falló", e);
        return null; // un lote caído no tumba la búsqueda
      }
    },
    3,
  );

  let analizados = 0;
  for (const res of resultados) {
    if (!res) continue;
    costo += res.usage.costUsd;

    for (const r of res.results) {
      const item = elegidos.find((e) => e.lead.id === r.id);
      if (!item) continue;
      analizados++;

      const { total, breakdown, qualified } = scoreLead({
        ...item.contexto,
        problemFitPoints: r.problemFitPoints,
      });
      if (qualified) oportunidades++;

      await db
        .from("leads")
        .update({
          score: total,
          score_breakdown: breakdown,
          qualified,
          observed_problem: r.observedProblem,
          evidence: r.evidence.map((ev) => ({
            ...ev,
            sourceUrl: extracciones.get(item.lead.place_id)?.sourceUrl ?? null,
          })),
          reason: r.reason,
          confidence: r.confidence,
        })
        .eq("id", item.lead.id);
    }
  }

  if (search.mode !== "demo")
    await recordUsage(search.user_id, "ai_bulk", analizados, costo, { search_id: search.id });
  if (resultados.some((result) => result === null))
    throw new Error(
      "El proveedor de IA no pudo completar todos los análisis. Reintenta para continuar con los pendientes.",
    );
  await db.from("searches").update({ qualified_count: oportunidades }).eq("id", search.id);

  yield { type: "qualified", analizados, oportunidades, recortado };
}
