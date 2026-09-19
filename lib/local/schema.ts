import { randomUUID } from "node:crypto";

export type Row = Record<string, unknown>;
export const DEFAULT_LIMITS = {
  searches_per_day: 3,
  businesses_per_search: 50,
  ai_analyses_per_day: 150,
  quality_generations_per_day: 10,
  enrichments_per_day: 5,
};

type Schema = {
  defaults: () => Row;
  keys: string[][];
  required: string[];
  enums?: Record<string, readonly unknown[]>;
};

const timestamp = () => new Date().toISOString();
const base = () => ({ id: randomUUID(), created_at: timestamp() });
const nullable = (names: string) =>
  Object.fromEntries(names.split(" ").map((name) => [name, null]));
const expires = () => ({
  fetched_at: timestamp(),
  expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
});

/** Mirrors the Supabase migrations. Unknown tables/columns fail explicitly. */
export const schemas: Record<string, Schema> = {
  profiles: {
    defaults: () => ({ ...base(), email: null, full_name: null, role: "student", limits: {} }),
    keys: [["id"], ["email"]],
    required: ["id", "email"],
    enums: { role: ["student", "admin"] },
  },
  app_settings: {
    defaults: () => ({ id: true, default_limits: { ...DEFAULT_LIMITS }, updated_at: timestamp() }),
    keys: [["id"]],
    required: ["id", "default_limits"],
    enums: { id: [true] },
  },
  invites: {
    defaults: () => ({ email: null, created_at: timestamp(), used_at: null }),
    keys: [["email"]],
    required: ["email"],
  },
  usage_counters: {
    defaults: () => ({ user_id: null, day: timestamp().slice(0, 10), kind: null, used: 0 }),
    keys: [["user_id", "day", "kind"]],
    required: ["user_id", "day", "kind", "used"],
  },
  usage_events: {
    defaults: () => ({ ...base(), user_id: null, kind: null, units: 1, cost_usd: 0, meta: {} }),
    keys: [["id"]],
    required: ["id", "user_id", "kind"],
  },
  offers: {
    defaults: () => ({
      ...base(),
      updated_at: timestamp(),
      user_id: null,
      name: null,
      what_i_sell: null,
      problem_solved: null,
    }),
    keys: [["id"]],
    required: ["id", "user_id", "what_i_sell"],
  },
  searches: {
    defaults: () => ({
      ...base(),
      updated_at: timestamp(),
      ...nullable("user_id offer_id niche country city error"),
      language: "es",
      target_count: 50,
      mode: "live",
      status: "pending",
      stage_cursor: {},
      found_count: 0,
      candidate_count: 0,
      qualified_count: 0,
    }),
    keys: [["id"]],
    required: ["id", "user_id", "niche", "country"],
    enums: {
      language: ["es", "en"],
      target_count: [25, 50, 100],
      mode: ["live", "demo"],
      status: ["pending", "discovering", "filtering", "extracting", "qualifying", "done", "failed"],
    },
  },
  search_corpus: {
    defaults: () => ({ query_key: null, place_ids: [], ...expires() }),
    keys: [["query_key"]],
    required: ["query_key", "place_ids"],
  },
  places_cache: {
    defaults: () => ({
      ...nullable(
        "place_id display_name formatted_address city primary_type website_uri phone rating user_rating_count google_maps_uri lat lng business_status types",
      ),
      ...expires(),
    }),
    keys: [["place_id"]],
    required: ["place_id"],
  },
  leads: {
    defaults: () => ({
      ...base(),
      updated_at: timestamp(),
      ...nullable(
        "user_id search_id offer_id place_id business_name city country website_url website_domain public_email public_phone main_cta extract_hash observed_problem reason confidence next_followup_at discard_reason",
      ),
      web_status: "none",
      has_booking_link: false,
      has_form: false,
      has_whatsapp: false,
      social_links: {},
      qualified: false,
      score: 0,
      score_breakdown: {},
      evidence: [],
      status: "nuevo",
      followup_count: 0,
      is_demo: false,
      saved: false,
      candidate: true,
    }),
    keys: [["id"], ["user_id", "place_id"]],
    required: ["id", "user_id", "business_name"],
    enums: {
      web_status: ["ok", "unreachable", "none"],
      status: [
        "nuevo",
        "listo",
        "contactado",
        "respondio",
        "demo",
        "conversacion",
        "cerrado",
        "descartado",
      ],
      confidence: [null, "low", "medium", "high"],
    },
  },
  lead_generations: {
    defaults: () => ({
      ...base(),
      ...nullable("lead_id user_id kind channel content model input_tokens output_tokens"),
      language: "es",
    }),
    keys: [["id"]],
    required: ["id", "lead_id", "user_id", "kind", "content"],
    enums: { kind: ["angle", "message"], channel: [null, "email", "instagram", "linkedin"] },
  },
  activities: {
    defaults: () => ({ ...base(), ...nullable("lead_id user_id type body"), meta: {} }),
    keys: [["id"]],
    required: ["id", "lead_id", "user_id", "type"],
    enums: { type: ["note", "status_change", "contacted", "followup_scheduled"] },
  },
};

export class LocalDatabaseError extends Error {
  constructor(
    message: string,
    public code = "LOCAL_DB_ERROR",
  ) {
    super(message);
    this.name = "LocalDatabaseError";
  }
}

export function schemaFor(table: string): Schema {
  const schema = Object.hasOwn(schemas, table) ? schemas[table] : undefined;
  if (!schema) throw new LocalDatabaseError(`Tabla local desconocida: ${table}`, "42P01");
  return schema;
}

export function assertColumn(table: string, column: string) {
  if (!Object.hasOwn(schemaFor(table).defaults(), column)) {
    throw new LocalDatabaseError(`Columna desconocida: ${table}.${column}`, "42703");
  }
}

export function cleanPatch(table: string, patch: Row): Row {
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    throw new LocalDatabaseError("La fila debe ser un objeto.");
  const clean: Row = {};
  for (const [key, value] of Object.entries(patch)) {
    assertColumn(table, key);
    if (value !== undefined) clean[key] = value;
  }
  return clean;
}

export function validateRow(table: string, row: Row) {
  const schema = schemaFor(table);
  for (const key of schema.required) {
    if (row[key] === null || row[key] === undefined)
      throw new LocalDatabaseError(`Falta ${table}.${key}`, "23502");
  }
  for (const [key, values] of Object.entries(schema.enums ?? {})) {
    if (!values.includes(row[key]))
      throw new LocalDatabaseError(`Valor inválido para ${table}.${key}`, "23514");
  }
  if (
    table === "leads" &&
    (!Number.isInteger(row.score) || Number(row.score) < 0 || Number(row.score) > 100)
  ) {
    throw new LocalDatabaseError("El score debe ser un entero de 0 a 100.", "23514");
  }
  if (table === "usage_counters" && (!Number.isInteger(row.used) || Number(row.used) < 0))
    throw new LocalDatabaseError("El consumo no puede ser negativo.", "23514");
}
