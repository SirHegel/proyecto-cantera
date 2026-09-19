import type { PlaceResult } from "@/lib/providers/types";

/**
 * §21 — el score de 0 a 100.
 *
 * De los cuatro criterios, tres son deterministas: se calculan con datos que ya
 * tenemos. Solo PROBLEM FIT requiere juicio, y ese es el único que produce el
 * modelo.
 *
 * Pedirle al modelo el número final tenía tres costes: el mismo negocio salía
 * 84 en una corrida y 71 en la siguiente, el alumno no podía saber de dónde
 * venía el número, y pagábamos tokens de salida por aritmética.
 *
 * ICP FIT       30  ¿es el tipo de negocio que busca?
 * PROBLEM FIT   35  ¿hay señales del problema que resuelve?   ← modelo
 * COMMERCIAL    20  ¿parece un negocio activo?                 solo proxies públicos
 * CONTACTABILITY 15 ¿tenemos por dónde llegarle?
 */

export type ScoreParts = { icp: number; problem: number; commercial: number; contact: number };

export type ScoreInput = {
  place: Pick<PlaceResult, "primaryType" | "types" | "rating" | "userRatingCount" | "websiteUri">;
  expectedTypes: string[] | null; // null = nicho libre, no validable
  signals: {
    publicEmail: string | null;
    publicPhone: string | null;
    hasForm: boolean;
    hasWhatsapp: boolean;
    webStatus: "ok" | "unreachable" | "none";
  };
  problemFitPoints: number; // 0-35, del modelo
};

const clamp = (n: number, max: number) =>
  Math.max(0, Math.min(Number.isFinite(n) ? Math.round(n) : 0, max));

export function icpFit(place: ScoreInput["place"], expectedTypes: string[] | null): number {
  // Sin mapeo de categorías no hay nada que verificar. Se da un valor neutro en
  // vez de premiar o castigar por algo que no sabemos.
  if (!expectedTypes?.length) return 20;

  const primario = (place.primaryType ?? "").toLowerCase();
  if (expectedTypes.some((t) => primario === t)) return 30;
  if (primario && expectedTypes.some((t) => primario.includes(t) || t.includes(primario)))
    return 26;

  const secundarios = (place.types ?? []).map((t) => t.toLowerCase());
  if (secundarios.some((s) => expectedTypes.includes(s))) return 21;
  if (secundarios.some((s) => expectedTypes.some((t) => s.includes(t) || t.includes(s)))) return 16;

  return 8;
}

/**
 * Solo proxies públicos. Nunca se estima facturación, empleados ni volumen de
 * clientes: la §20 lo prohíbe y aquí es donde sería fácil colarlo.
 */
export function commercialFit(place: ScoreInput["place"], webStatus: string): number {
  const reviews = place.userRatingCount ?? 0;
  let pts = reviews >= 200 ? 12 : reviews >= 50 ? 10 : reviews >= 10 ? 7 : reviews >= 1 ? 4 : 2;

  const rating = place.rating ?? 0;
  if (rating >= 4.5) pts += 3;
  else if (rating >= 4.0) pts += 2;
  else if (rating > 0) pts += 1;

  if (webStatus === "ok") pts += 5;
  else if (place.websiteUri) pts += 2; // tiene web aunque no la pudimos leer

  return clamp(pts, 20);
}

export function contactability(s: ScoreInput["signals"]): number {
  let pts = 0;
  if (s.publicEmail) pts += 7;
  if (s.publicPhone) pts += 4;
  if (s.hasForm) pts += 2;
  if (s.hasWhatsapp) pts += 2;
  return clamp(pts, 15);
}

export function scoreLead(input: ScoreInput): {
  total: number;
  breakdown: ScoreParts;
  qualified: boolean;
} {
  const breakdown: ScoreParts = {
    icp: icpFit(input.place, input.expectedTypes),
    problem: clamp(input.problemFitPoints, 35),
    commercial: commercialFit(input.place, input.signals.webStatus),
    contact: contactability(input.signals),
  };

  const total = breakdown.icp + breakdown.problem + breakdown.commercial + breakdown.contact;

  // Un negocio sin señal de problema no es una oportunidad por muy bien que
  // puntúe en lo demás: sería escribirle sin tener nada que decirle.
  const qualified = breakdown.problem >= 12 && total >= 55;

  return { total, breakdown, qualified };
}

/**
 * Preorden barato para decidir a quién analizar cuando hay más candidatos que
 * presupuesto. Usa solo la parte determinista: los que ya se ven mejor entran
 * primero al modelo.
 */
export function preRank(input: Omit<ScoreInput, "problemFitPoints">): number {
  return (
    icpFit(input.place, input.expectedTypes) +
    commercialFit(input.place, input.signals.webStatus) +
    contactability(input.signals)
  );
}
