import { getUserProviderSettings } from "@/lib/settings";
import { extractSite, mapPool, type Extraction } from "@/lib/pipeline/extract";
import { qualify } from "@/lib/pipeline/qualify";
import { prefilter } from "@/lib/pipeline/prefilter";
import { getPlacesProvider } from "@/lib/providers/places";
import { PLACES_COST_PER_CALL, type PlaceResult } from "@/lib/providers/types";
import { admin, recordUsage } from "@/lib/quota";

export type Progress =
  | { type: "stage"; message: string }
  | { type: "count"; found: number; nuevos: number; repetidos: number }
  | { type: "filtered"; candidatos: number; descartados: number }
  | { type: "qualified"; analizados: number; oportunidades: number; recortado: number }
  | { type: "progress"; done: number; total: number; label: string }
  | { type: "done"; searchId: string }
  | { type: "error"; message: string };

type SearchRow = {
  id: string;
  user_id: string;
  offer_id: string | null;
  niche: string;
  city: string | null;
  country: string;
  language: "es" | "en";
  target_count: number;
  mode: "live" | "demo";
  status: string;
};

/** La clave de caché compartida. Si dos alumnos buscan lo mismo, el segundo no paga. */
export function queryKey(s: Pick<SearchRow, "niche" | "city" | "country" | "language">): string {
  return [s.niche, s.city ?? "*", s.country, s.language]
    .map((v) => v.toLowerCase().replace(/\s+/g, " ").trim())
    .join("|");
}

/**
 * Host del sitio, para deduplicar por dominio.
 *
 * Excepción: las webs de ejemplo del modo demo viven todas bajo el mismo host
 * (localhost), así que ahí se incluye la ruta. Sin esto, los 10 negocios
 * ficticios se colapsaban en uno solo y la demo mostraba "1 negocio".
 */
export function domainOf(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const esDemo = host === "localhost" || host === "127.0.0.1";
    return esDemo ? `${host}${u.pathname}`.toLowerCase() : host;
  } catch {
    return null;
  }
}

/** Los últimos 10 dígitos: así "+1 305 555 0101" y "(305) 555-0101" son el mismo. */
const digits = (s?: string | null) => {
  const d = s ? s.replace(/\D/g, "") : "";
  return d.length >= 7 ? d.slice(-10) : null;
};

/**
 * §16 — deduplicación antes de gastar nada.
 * Orden de fuerza: place_id, dominio, teléfono, nombre+ciudad.
 */
export function dedupe(places: PlaceResult[]): PlaceResult[] {
  const vistos = {
    id: new Set<string>(),
    dom: new Set<string>(),
    tel: new Set<string>(),
    nom: new Set<string>(),
  };
  const out: PlaceResult[] = [];

  for (const p of places) {
    const dom = domainOf(p.websiteUri);
    const tel = digits(p.phone);
    const nom = `${p.displayName}|${p.city ?? ""}`.toLowerCase().trim();

    if (vistos.id.has(p.placeId)) continue;
    if (dom && vistos.dom.has(dom)) continue;
    if (tel && vistos.tel.has(tel)) continue;
    if (vistos.nom.has(nom)) continue;

    vistos.id.add(p.placeId);
    if (dom) vistos.dom.add(dom);
    if (tel) vistos.tel.add(tel);
    vistos.nom.add(nom);
    out.push(p);
  }
  return out;
}

/**
 * Etapa 1 del pipeline. Es un generador: emite progreso mientras trabaja, y el
 * route handler lo convierte en SSE. Ninguna cola, ningún worker, ningún Redis.
 * Reanudable: todas las escrituras son upserts sobre claves estables.
 */
export async function* discover(search: SearchRow, origin?: string): AsyncGenerator<Progress> {
  const db = admin();
  const settings = await getUserProviderSettings(search.user_id);
  const key = `${search.mode}|${queryKey(search)}`;
  const ahora = new Date().toISOString();

  await db.from("searches").update({ status: "discovering" }).eq("id", search.id);

  yield {
    type: "stage",
    message: search.city
      ? `Buscando ${search.niche.toLowerCase()} en ${search.city}…`
      : `Buscando ${search.niche.toLowerCase()} en todo el país…`,
  };

  // --- 1. ¿Ya tenemos este corpus vigente? -----------------------------------
  let places: PlaceResult[] = [];
  let calls = 0;

  const { data: corpus } = await db
    .from("search_corpus")
    .select("place_ids, expires_at")
    .eq("query_key", key)
    .gt("expires_at", ahora)
    .maybeSingle();

  if (search.mode !== "demo" && corpus?.place_ids?.length) {
    const { data: cached } = await db
      .from("places_cache")
      .select("*")
      .in("place_id", corpus.place_ids)
      .gt("expires_at", ahora);

    if (cached && cached.length >= Math.min(search.target_count, corpus.place_ids.length) * 0.8) {
      places = cached.map(rowToPlace);
    }
  }

  // --- 2. Si no, salimos a buscar --------------------------------------------
  if (!places.length) {
    const provider = getPlacesProvider(
      search.mode === "demo" ? "fixture" : undefined,
      origin,
      settings,
    );
    const res = await provider.search({
      niche: search.niche,
      city: search.city,
      country: search.country,
      language: search.language,
      limit: search.target_count,
    });

    places = res.places;
    calls = res.calls;

    if (calls > 0) {
      await recordUsage(search.user_id, "places_call", calls, calls * PLACES_COST_PER_CALL, {
        query_key: key,
      });
    }

    if (places.length) {
      const vence = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
      await db.from("places_cache").upsert(
        places.map((p) => ({
          place_id: p.placeId,
          display_name: p.displayName,
          formatted_address: p.formattedAddress,
          city: p.city ?? search.city,
          primary_type: p.primaryType,
          types: p.types,
          website_uri: p.websiteUri,
          phone: p.phone,
          rating: p.rating,
          user_rating_count: p.userRatingCount,
          business_status: p.businessStatus ?? null,
          google_maps_uri: p.googleMapsUri,
          lat: p.lat,
          lng: p.lng,
          fetched_at: ahora,
          expires_at: vence,
        })),
        { onConflict: "place_id" },
      );

      await db.from("search_corpus").upsert(
        {
          query_key: key,
          place_ids: places.map((p) => p.placeId),
          fetched_at: ahora,
          expires_at: vence,
        },
        { onConflict: "query_key" },
      );
    }
  }

  yield { type: "stage", message: "Quitando repetidos…" };

  const unicos = dedupe(places);

  // --- 3. ¿Cuáles ya tiene este alumno? --------------------------------------
  const { data: existentes } = await db
    .from("leads")
    .select("place_id, search_id")
    .eq("user_id", search.user_id)
    .in(
      "place_id",
      unicos.map((p) => p.placeId),
    );

  const yaTiene = new Set(
    (existentes ?? []).filter((l) => l.search_id !== search.id).map((l) => l.place_id),
  );
  const nuevos = unicos.filter((p) => !yaTiene.has(p.placeId));

  yield { type: "count", found: unicos.length, nuevos: nuevos.length, repetidos: yaTiene.size };

  // --- 4. Prefiltro sin IA (§17) ---------------------------------------------
  await db.from("searches").update({ status: "filtering" }).eq("id", search.id);
  yield { type: "stage", message: "Revisando cuáles encajan…" };

  const juzgados = nuevos.map((p) => ({ place: p, verdict: prefilter(p, search) }));
  const candidatos = juzgados.filter((j) => j.verdict.candidate);

  if (juzgados.length) {
    const { error: insertError } = await db.from("leads").upsert(
      juzgados.map(({ place: p, verdict }) => ({
        user_id: search.user_id,
        search_id: search.id,
        offer_id: search.offer_id,
        place_id: p.placeId,
        business_name: p.displayName,
        city: p.city ?? search.city,
        country: search.country,
        website_url: p.websiteUri ?? null,
        website_domain: domainOf(p.websiteUri),
        public_phone: p.phone ?? null,
        web_status: "none",
        candidate: verdict.candidate,
        discard_reason: verdict.candidate ? null : verdict.reason,
        is_demo: search.mode === "demo",
        saved: false,
      })),
      { onConflict: "user_id,place_id", ignoreDuplicates: true },
    );
    if (insertError) throw new Error("No se pudieron guardar los negocios encontrados.");
  }

  yield {
    type: "filtered",
    candidatos: candidatos.length,
    descartados: juzgados.length - candidatos.length,
  };

  // --- 5. Lectura de webs (§18) ----------------------------------------------
  const conWeb = candidatos.filter((c) => c.place.websiteUri);
  const textos = new Map<string, Extraction>();

  if (conWeb.length) {
    await db.from("searches").update({ status: "extracting" }).eq("id", search.id);
    yield { type: "stage", message: `Revisando ${conWeb.length} sitios web…` };

    let leidos = 0;
    const extracciones: { placeId: string; data: Extraction }[] = [];
    const cola = [...conWeb];

    // Se lee en tandas para poder informar avance real, no una barra inventada.
    while (cola.length) {
      const tanda = cola.splice(0, 8);
      const res = await mapPool(tanda, async ({ place }) => ({
        placeId: place.placeId,
        data: await extractSite(
          place.websiteUri ?? null,
          search.mode === "demo" ? origin : undefined,
        ),
      }));
      extracciones.push(...res);
      leidos += res.length;
      yield { type: "progress", done: leidos, total: conWeb.length, label: "Revisando sitios web" };
    }

    for (const { placeId, data } of extracciones) {
      textos.set(placeId, data);
      await db
        .from("leads")
        .update({
          web_status: data.status,
          public_email: data.publicEmail,
          public_phone: data.publicPhone ?? undefined,
          has_form: data.hasForm,
          has_booking_link: data.hasBookingLink,
          has_whatsapp: data.hasWhatsapp,
          main_cta: data.mainCta,
          social_links: data.socialLinks,
          extract_hash: data.hash,
        })
        .eq("search_id", search.id)
        .eq("place_id", placeId);
    }
  }

  // --- 6. Calificación (§19) --------------------------------------------------
  yield* qualify(search, textos);

  await db
    .from("searches")
    .update({
      status: "done",
      found_count: unicos.length,
      candidate_count: candidatos.length,
    })
    .eq("id", search.id);

  yield { type: "done", searchId: search.id };
}

function rowToPlace(r: Record<string, unknown>): PlaceResult {
  return {
    placeId: r.place_id as string,
    displayName: (r.display_name as string) ?? "",
    formattedAddress: r.formatted_address as string | undefined,
    city: r.city as string | undefined,
    primaryType: r.primary_type as string | undefined,
    types: (r.types as string[]) ?? [],
    websiteUri: r.website_uri as string | undefined,
    phone: r.phone as string | undefined,
    rating: r.rating as number | undefined,
    userRatingCount: r.user_rating_count as number | undefined,
    businessStatus: r.business_status as string | undefined,
    googleMapsUri: r.google_maps_uri as string | undefined,
    lat: r.lat as number | undefined,
    lng: r.lng as number | undefined,
  };
}
