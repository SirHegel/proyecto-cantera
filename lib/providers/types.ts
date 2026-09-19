// Frontera entre la app y todo lo que cuesta dinero.
// Cambiar PROVIDER_MODE intercambia la implementación sin tocar el pipeline.

export type ProviderMode = "fixture" | "cassette" | "live";

/** Server-side dependency injection for offline integration tests. */
export type ProviderRuntime = {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  cassetteDir?: string;
};

export interface PlaceResult {
  placeId: string;
  displayName: string;
  formattedAddress?: string;
  city?: string;
  primaryType?: string;
  types: string[];
  /** OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY. Campo del SKU Pro. */
  businessStatus?: string;
  websiteUri?: string;
  phone?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  lat?: number;
  lng?: number;
}

export interface PlacesQuery {
  niche: string;
  city: string | null;
  country: string;
  language: "es" | "en";
  limit: number;
}

export interface PlacesProvider {
  readonly mode: ProviderMode;
  /** Devuelve hasta `limit` negocios. `calls` es lo que se factura. */
  search(q: PlacesQuery): Promise<{ places: PlaceResult[]; calls: number }>;
}

// --- IA ---------------------------------------------------------------------

export interface QualifyInput {
  id: string;
  businessName: string;
  primaryType?: string;
  city?: string;
  hasWebsite: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  hasBookingLink: boolean;
  hasForm: boolean;
  signals: string[];
  websiteText: string; // ya recortado a MAX_WEBSITE_CHARS
}

export interface QualifyResult {
  id: string;
  /** Solo PROBLEM FIT (0-35). El resto del score lo calcula TypeScript. */
  problemFitPoints: number;
  observedProblem: string | null;
  /** `quote` debe existir literalmente en websiteText o se descarta. */
  evidence: { claim: string; quote: string; sourceUrl: string | null }[];
  reason: string | null;
  confidence: "low" | "medium" | "high";
}

export interface AngleResult {
  observation: string;
  angle: string;
  demoIdea: string;
}

export interface OfferHint {
  problem: string;
  niches: string[];
}

export interface MessageResult {
  /** null en Instagram y LinkedIn: ahí no existe el asunto. */
  subject?: string | null;
  body: string;
}

export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AiProvider {
  readonly mode: ProviderMode;
  qualifyBatch(
    offer: { whatISell: string; problemSolved?: string; niche: string },
    items: QualifyInput[],
  ): Promise<{ results: QualifyResult[]; usage: AiUsage }>;
  generateAngle(ctx: Record<string, unknown>): Promise<{ result: AngleResult; usage: AiUsage }>;
  generateMessage(
    ctx: Record<string, unknown>,
    channel: "email" | "instagram" | "linkedin",
    language: "es" | "en",
  ): Promise<{ result: MessageResult; usage: AiUsage }>;
  /** §13 — deduce el problema y nichos plausibles a partir de la oferta. */
  inferProblem(whatISell: string): Promise<{ result: OfferHint; usage: AiUsage }>;
}

// Precios USD por 1M de tokens. Actualizar si OpenAI mueve la tabla.
export const PRICES: Record<string, { in: number; out: number }> = {
  "gpt-5.6-luna": { in: 0.2, out: 1.2 },
  "gpt-5.6-terra": { in: 2.0, out: 12.0 },
};

export function costOf(model: string, inTok: number, outTok: number): number {
  const p = PRICES[model] ?? { in: 0, out: 0 };
  return (inTok / 1e6) * p.in + (outTok / 1e6) * p.out;
}

/** Text Search Enterprise: $35 / 1000 llamadas, 20 resultados por llamada. */
export const PLACES_COST_PER_CALL = 0.035;
