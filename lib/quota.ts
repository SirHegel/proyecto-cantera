import { createClient } from "@supabase/supabase-js";
import { isLocalMode } from "@/lib/runtime";
import { localSupabaseClient } from "@/lib/local/client";

export type QuotaKind =
  | "searches_per_day"
  | "ai_analyses_per_day"
  | "quality_generations_per_day"
  | "enrichments_per_day";

export class QuotaExceeded extends Error {
  constructor(
    public kind: QuotaKind,
    public limit: number,
  ) {
    super(`QUOTA_EXCEEDED:${kind}`);
  }
  /** Mensaje para el alumno. Nunca fallar feo: la §36 pide tono amable. */
  get friendly(): string {
    const m: Record<QuotaKind, string> = {
      searches_per_day: "Ya usaste tus búsquedas de hoy. Mañana tendrás nuevas.",
      ai_analyses_per_day: "Alcanzaste el límite de análisis por hoy. Mañana se renueva.",
      quality_generations_per_day: "Llegaste al máximo de ángulos y mensajes por hoy.",
      enrichments_per_day: "Llegaste al máximo de búsquedas de decisor por hoy.",
    };
    return m[this.kind];
  }
}

/** Cliente con service role. Solo en route handlers, nunca en el cliente. */
export function admin() {
  if (isLocalMode()) return localSupabaseClient({ serviceRole: true });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Configura NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para operar con Supabase.",
    );
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
    },
  );
}

/**
 * Reserva cuota ANTES de gastar. Atómico en Postgres: si excede, lanza y el
 * contador no se incrementa. Nunca llamar después de la operación pagada.
 * Devuelve cuánto queda.
 */
export async function consumeQuota(userId: string, kind: QuotaKind, n = 1): Promise<number> {
  if (!Number.isSafeInteger(n) || n < 1)
    throw new Error("El consumo de cuota debe ser un entero mayor que cero.");
  const { data, error } = await admin().rpc("consume_quota", {
    p_user_id: userId,
    p_kind: kind,
    p_n: n,
  });

  if (error) {
    if (error.message.includes("QUOTA_EXCEEDED")) {
      const limit = Number(error.message.split(":").pop() ?? 0);
      throw new QuotaExceeded(kind, limit);
    }
    throw error;
  }
  return data as number;
}

/**
 * Cuánto queda hoy, sin consumir. Sirve para recortar el trabajo al presupuesto
 * disponible en vez de fallar a mitad: si quedan 12 análisis y hay 25 candidatos,
 * se analizan los 12 mejores y se dice claramente.
 */
export async function remainingQuota(userId: string, kind: QuotaKind): Promise<number> {
  const db = admin();
  const [{ data: limit, error: limitError }, { data: counter, error: counterError }] =
    await Promise.all([
      db.rpc("get_limit", { p_user_id: userId, p_kind: kind }),
      db
        .from("usage_counters")
        .select("used")
        .eq("user_id", userId)
        .eq("kind", kind)
        .eq("day", new Date().toISOString().slice(0, 10))
        .maybeSingle(),
    ]);
  if (limitError) throw new Error(limitError.message);
  if (counterError) throw new Error(counterError.message);
  return Math.max(0, (Number(limit) || 0) - (counter?.used ?? 0));
}

/** Registro contable para el panel admin (§35). Nunca bloquea el flujo. */
export async function recordUsage(
  userId: string,
  kind: "places_call" | "ai_bulk" | "ai_quality" | "enrichment",
  units: number,
  costUsd: number,
  meta: Record<string, unknown> = {},
) {
  try {
    const { error } = await admin()
      .from("usage_events")
      .insert({ user_id: userId, kind, units, cost_usd: costUsd, meta });
    if (error) console.error("[usage] No se pudo registrar el consumo:", error.message);
  } catch (error) {
    console.error(
      "[usage] No se pudo registrar el consumo:",
      error instanceof Error ? error.message : error,
    );
  }
}
