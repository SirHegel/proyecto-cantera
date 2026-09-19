import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_LIMITS,
  LocalDatabaseError,
  schemaFor,
  schemas,
  validateRow,
  type Row,
} from "./schema";

/** One synchronous transaction per operation: safe across Next workers/processes. */
export class LocalStore {
  readonly database: DatabaseSync;

  constructor(readonly filename: string) {
    if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.database = new DatabaseSync(filename);
    this.database.exec(
      "PRAGMA busy_timeout = 10000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;",
    );
    const version = this.database.prepare("PRAGMA user_version").get() as { user_version: number };
    if (version.user_version > 1) {
      this.database.close();
      throw new Error("Esta base local fue creada por una versión más reciente de Cantera.");
    }
    this.database.exec(`CREATE TABLE IF NOT EXISTS cantera_records (
      table_name TEXT NOT NULL,
      row_key TEXT NOT NULL,
      document TEXT NOT NULL CHECK(json_valid(document)),
      PRIMARY KEY (table_name, row_key)
    );
    CREATE TABLE IF NOT EXISTS local_credentials (
      user_id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      blocked_until INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS local_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES local_credentials(user_id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    PRAGMA user_version = 1;`);
    this.transaction(() => {
      if (!this.rows("app_settings").length)
        this.put("app_settings", schemas.app_settings.defaults());
    });
  }

  transaction<T>(operation: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  rows(table: string): Row[] {
    schemaFor(table);
    const results = this.database
      .prepare("SELECT document FROM cantera_records WHERE table_name = ? ORDER BY rowid")
      .all(table);
    return results.map((row) => JSON.parse(String(row.document)) as Row);
  }

  private key(table: string, row: Row): string {
    return JSON.stringify(schemaFor(table).keys[0].map((key) => row[key]));
  }

  put(table: string, row: Row, previous?: Row) {
    validateRow(table, row);
    if (
      row.user_id != null &&
      !this.rows("profiles").some((profile) => profile.id === row.user_id)
    ) {
      throw new LocalDatabaseError("El usuario de esta fila no existe.", "23503");
    }
    const existing = this.rows(table);
    for (const unique of schemaFor(table).keys) {
      if (unique.some((key) => row[key] == null)) continue; // PostgreSQL UNIQUE permits nulls.
      if (
        existing.some(
          (item) =>
            (!previous || this.key(table, item) !== this.key(table, previous)) &&
            unique.every((key) => item[key] === row[key]),
        )
      ) {
        throw new LocalDatabaseError(`Ya existe ${table} con ${unique.join(", ")}.`, "23505");
      }
    }
    for (const [field, parent] of [
      ["search_id", "searches"],
      ["offer_id", "offers"],
      ["lead_id", "leads"],
    ]) {
      if (
        row[field] != null &&
        !this.rows(parent).some(
          (item) => item.id === row[field] && (row.user_id == null || item.user_id === row.user_id),
        )
      ) {
        throw new LocalDatabaseError(`No existe la referencia ${table}.${field}.`, "23503");
      }
    }
    if (previous && this.key(table, previous) !== this.key(table, row)) {
      throw new LocalDatabaseError(
        "No se puede cambiar la clave primaria de una fila local.",
        "23514",
      );
    }
    this.database
      .prepare(
        "INSERT INTO cantera_records (table_name, row_key, document) VALUES (?, ?, ?) ON CONFLICT(table_name, row_key) DO UPDATE SET document = excluded.document",
      )
      .run(table, this.key(table, row), JSON.stringify(row));
  }

  remove(table: string, row: Row) {
    if (table === "profiles" || table === "app_settings")
      throw new LocalDatabaseError(
        "El perfil y los ajustes locales no se pueden eliminar.",
        "42501",
      );
    if (table === "leads") {
      for (const child of ["activities", "lead_generations"]) {
        for (const item of this.rows(child).filter((item) => item.lead_id === row.id))
          this.remove(child, item);
      }
    }
    if (table === "searches" || table === "offers") {
      const field = table === "searches" ? "search_id" : "offer_id";
      for (const child of table === "searches" ? ["leads"] : ["leads", "searches"]) {
        for (const item of this.rows(child).filter((item) => item[field] === row.id))
          this.put(child, { ...item, [field]: null }, item);
      }
    }
    this.database
      .prepare("DELETE FROM cantera_records WHERE table_name = ? AND row_key = ?")
      .run(table, this.key(table, row));
  }

  getLimit(userId: unknown, kind: unknown): number {
    const profile = this.rows("profiles").find((row) => row.id === userId);
    if (!profile) throw new LocalDatabaseError("Perfil local desconocido.", "42501");
    if (typeof kind !== "string" || !Object.hasOwn(DEFAULT_LIMITS, kind))
      throw new LocalDatabaseError("Tipo de cuota desconocido.", "22023");
    const settings = this.rows("app_settings")[0];
    const overrides = profile.limits as Record<string, unknown>;
    const defaults = settings.default_limits as Record<string, unknown>;
    const limit = Number(overrides[kind] ?? defaults[kind] ?? 0);
    if (!Number.isSafeInteger(limit) || limit < 0)
      throw new LocalDatabaseError(
        "El límite de cuota debe ser un entero positivo o cero.",
        "22023",
      );
    return limit;
  }

  rpc(name: string, args: Row): unknown {
    return this.transaction(() => {
      if (name === "get_limit") return this.getLimit(args.p_user_id, args.p_kind);
      if (name === "consume_quota") {
        const amount = args.p_n ?? 1;
        if (!Number.isSafeInteger(amount) || Number(amount) < 1)
          throw new LocalDatabaseError("El consumo debe ser un entero mayor que cero.", "22023");
        const limit = this.getLimit(args.p_user_id, args.p_kind);
        const day = new Date().toISOString().slice(0, 10);
        const current = this.rows("usage_counters").find(
          (row) => row.user_id === args.p_user_id && row.kind === args.p_kind && row.day === day,
        );
        const used = Number(current?.used ?? 0);
        if (used + Number(amount) > limit)
          throw new LocalDatabaseError(`QUOTA_EXCEEDED:${args.p_kind}:${used}:${limit}`, "P0001");
        this.put(
          "usage_counters",
          { user_id: args.p_user_id, kind: args.p_kind, day, used: used + Number(amount) },
          current,
        );
        return limit - used - Number(amount);
      }
      if (name === "purge_expired_places") {
        let purged = 0;
        const now = new Date().toISOString();
        for (const table of ["places_cache", "search_corpus"]) {
          for (const row of this.rows(table).filter((row) => String(row.expires_at) < now)) {
            this.remove(table, row);
            if (table === "places_cache") purged++;
          }
        }
        return purged;
      }
      throw new LocalDatabaseError(`Función local no implementada: ${name}`, "42883");
    });
  }

  close() {
    this.database.close();
  }
}

// A process-wide connection survives development hot reloads; WAL coordinates
// independent server workers. No singleton is created at import/build time.
const globalStore = globalThis as typeof globalThis & {
  canteraLocalStores?: Map<string, LocalStore>;
};
const stores = (globalStore.canteraLocalStores ??= new Map<string, LocalStore>());

export function localDatabasePath(): string {
  return join(
    resolve(
      /* turbopackIgnore: true */ process.env.CANTERA_DATA_DIR || join(process.cwd(), ".data"),
    ),
    "cantera.sqlite",
  );
}

export function getLocalStore(filename = localDatabasePath()): LocalStore {
  let store = stores.get(filename);
  if (!store) {
    store = new LocalStore(filename);
    stores.set(filename, store);
  }
  return store;
}

export function closeLocalStores() {
  for (const store of stores.values()) store.close();
  stores.clear();
}
