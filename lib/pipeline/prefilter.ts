import type { PlaceResult } from "@/lib/providers/types";

/**
 * §17 — nada de IA para lo que resuelve un IF.
 *
 * Este archivo decide qué negocios llegan al modelo. Cada uno que descarta aquí
 * es dinero que no se gasta, así que las reglas son conservadoras: ante la duda,
 * pasa. Descartar un buen lead cuesta más que analizar uno mediocre.
 */

export type Verdict = { candidate: true } | { candidate: false; reason: string };

/** Tipos de Google esperados por nicho. Los nichos escritos a mano no se validan. */
const TIPOS_CRUDOS: Record<string, string[]> = {
  "clínicas dentales": ["dentist", "dental_clinic"],
  "clínicas estéticas / med spas": ["spa", "beauty_salon", "medical_clinic", "skin_care_clinic"],
  inmobiliarias: ["real_estate_agency"],
  abogados: ["lawyer", "legal_services"],
  "gimnasios y estudios": ["gym", "fitness_center", "yoga_studio"],
  "coaches y consultores": ["consultant", "coaching_center"],
  "climatización / hvac": ["hvac_contractor", "general_contractor"],
  "techos / roofing": ["roofing_contractor", "general_contractor"],
  plomería: ["plumber"],
  "agentes inmobiliarios": ["real_estate_agency"],
};

function normaliza(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Las claves se normalizan al cargar. Escritas con tilde, `normaliza("Clínicas
// dentales")` devolvía "clinicas dentales" y el lookup fallaba en silencio:
// el prefiltro dejaba pasar cualquier categoría sin avisar.
const TIPOS_POR_NICHO: Record<string, string[]> = Object.fromEntries(
  Object.entries(TIPOS_CRUDOS).map(([k, v]) => [normaliza(k), v]),
);

/** Tipos de Google esperados para un nicho, o null si no es validable. */
export function expectedTypesFor(niche: string): string[] | null {
  return TIPOS_POR_NICHO[normaliza(niche)] ?? null;
}

export function prefilter(p: PlaceResult, ctx: { niche: string; city: string | null }): Verdict {
  // Cerrado: no hay nada que vender ahí.
  if (p.businessStatus && p.businessStatus !== "OPERATIONAL") {
    return { candidate: false, reason: "El negocio figura como cerrado" };
  }

  // Sin forma de llegar y sin nada que leer: no hay materia prima.
  if (!p.websiteUri && !p.phone) {
    return { candidate: false, reason: "Sin web ni teléfono público" };
  }

  // Nombre vacío o basura.
  if (!p.displayName || p.displayName.trim().length < 2) {
    return { candidate: false, reason: "Datos insuficientes" };
  }

  // Categoría. Solo se aplica cuando conocemos el mapeo del nicho: si el alumno
  // escribió un nicho libre, no tenemos con qué comparar y no inventamos.
  const esperados = TIPOS_POR_NICHO[normaliza(ctx.niche)];
  if (esperados?.length) {
    const tipos = [p.primaryType, ...(p.types ?? [])].filter(Boolean).map((t) => normaliza(t!));
    const coincide = tipos.some((t) => esperados.some((e) => t.includes(e) || e.includes(t)));
    if (!coincide) {
      return { candidate: false, reason: "No es del tipo de negocio que buscas" };
    }
  }

  // Ciudad. Google a veces devuelve resultados de la periferia; se acepta si el
  // nombre de la ciudad aparece en la dirección o en el campo de ciudad.
  // Si el alumno no eligió ciudad, se busca en todo el país y no hay nada que
  // comparar aquí: Google ya acotó por país en la consulta.
  if (ctx.city && (p.formattedAddress || p.city)) {
    const ciudad = normaliza(ctx.city);
    const donde = normaliza(`${p.city ?? ""} ${p.formattedAddress ?? ""}`);
    if (ciudad.length > 3 && !donde.includes(ciudad)) {
      return { candidate: false, reason: "Está fuera de la ciudad que pediste" };
    }
  }

  // Señal de negocio vivo. Un solo review no descalifica: hay negocios buenos
  // recién abiertos. Solo se descarta el que no tiene ni reseñas ni web.
  if (!p.websiteUri && (p.userRatingCount ?? 0) === 0) {
    return { candidate: false, reason: "Sin presencia digital comprobable" };
  }

  return { candidate: true };
}
