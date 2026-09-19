import type { SupabaseClient } from "@supabase/supabase-js";
import { getLocalStore, type LocalStore } from "./store";
import { assertColumn, cleanPatch, LocalDatabaseError, schemaFor, type Row } from "./schema";

export type LocalResult<T> = {
  data: T | null;
  error: { message: string; code: string; details: string; hint: string } | null;
  count: number | null;
  status: number;
  statusText: string;
};
type Filter = (row: Row) => boolean;
type Operation = "select" | "insert" | "upsert" | "update" | "delete";
export type LocalClientOptions = {
  filename?: string;
  userId?: string | null;
  serviceRole?: boolean;
};
type Access = { userId: string | null; serviceRole: boolean; isAdmin: boolean };
const ownedTables = new Set(["offers", "searches", "leads", "lead_generations", "activities"]);

function visible(table: string, row: Row, access: Access, writing = false): boolean {
  if (access.serviceRole) return true;
  if (!access.userId) return false;
  if (ownedTables.has(table)) return row.user_id === access.userId;
  if (table === "profiles") return row.id === access.userId || (!writing && access.isAdmin);
  if (table === "usage_events" || table === "usage_counters")
    return !writing && (access.isAdmin || row.user_id === access.userId);
  if (table === "app_settings") return !writing || access.isAdmin;
  if (table === "invites") return access.isAdmin;
  if (table === "places_cache" || table === "search_corpus") return !writing;
  return false;
}

const success = <T>(data: T | null, count: number | null = null): LocalResult<T> => ({
  data,
  error: null,
  count,
  status: 200,
  statusText: "OK",
});
const failure = <T>(error: unknown): LocalResult<T> => ({
  data: null,
  count: null,
  status: 400,
  statusText: "Bad Request",
  error: {
    message: error instanceof Error ? error.message : String(error),
    code: error instanceof LocalDatabaseError ? error.code : "LOCAL_DB_ERROR",
    details: "",
    hint: "",
  },
});

function comparison(operator: string, actual: unknown, expected: unknown): boolean {
  if (operator === "is") return actual === expected;
  // SQL three-valued logic: ordinary comparisons against NULL never match.
  if (actual == null || expected == null) return false;
  switch (operator) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "gt":
      return (actual as string | number) > (expected as string | number);
    case "gte":
      return (actual as string | number) >= (expected as string | number);
    case "lt":
      return (actual as string | number) < (expected as string | number);
    case "lte":
      return (actual as string | number) <= (expected as string | number);
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
    default:
      throw new LocalDatabaseError(`Filtro local no implementado: ${operator}`, "0A000");
  }
}

function splitTerms(input: string): string[] {
  let depth = 0;
  let quote = false;
  let start = 0;
  const terms: string[] = [];
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (char === '"' && input[index - 1] !== "\\") quote = !quote;
    if (quote) continue;
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (depth < 0) throw new LocalDatabaseError("Filtro OR inválido.", "PGRST100");
    if (char === "," && depth === 0) {
      terms.push(input.slice(start, index));
      start = index + 1;
    }
  }
  if (quote || depth !== 0) throw new LocalDatabaseError("Filtro OR inválido.", "PGRST100");
  terms.push(input.slice(start));
  return terms;
}

function filterValue(input: string): unknown {
  if (input === "null") return null;
  if (input === "true" || input === "false") return input === "true";
  if (/^-?\d+(?:\.\d+)?$/.test(input)) return Number(input);
  if (input.startsWith('"')) return JSON.parse(input);
  return input;
}

function parseTerm(table: string, term: string): Filter {
  const group = /^(and|or)\((.*)\)$/.exec(term.trim());
  if (group) {
    const children = splitTerms(group[2]).map((item) => parseTerm(table, item));
    return (row) =>
      group[1] === "and"
        ? children.every((filter) => filter(row))
        : children.some((filter) => filter(row));
  }
  const match = /^([a-z_][a-z_0-9]*)\.(not\.)?(eq|neq|gt|gte|lt|lte|is|in)\.(.*)$/.exec(
    term.trim(),
  );
  if (!match) throw new LocalDatabaseError(`Filtro OR no admitido: ${term}`, "PGRST100");
  const [, column, negative, operator, raw] = match;
  assertColumn(table, column);
  if (operator === "in" && !(raw.startsWith("(") && raw.endsWith(")")))
    throw new LocalDatabaseError("El filtro in requiere paréntesis.", "PGRST100");
  const expected =
    operator === "in" ? splitTerms(raw.slice(1, -1)).map(filterValue) : filterValue(raw);
  return (row) =>
    negative
      ? (operator === "is" ||
          (row[column] != null &&
            expected != null &&
            !(Array.isArray(expected) && expected.includes(null)))) &&
        !comparison(operator, row[column], expected)
      : comparison(operator, row[column], expected);
}

/** Implements the PostgREST subset used by Cantera; unsupported syntax is an error. */
export class LocalQuery<T = Row[]> implements PromiseLike<LocalResult<T>> {
  private operation: Operation = "select";
  private payload: Row[] = [];
  private selection = "*";
  private returning = false;
  private filters: Filter[] = [];
  private orders: { column: string; ascending: boolean; nullsFirst: boolean }[] = [];
  private offset = 0;
  private maxRows = Infinity;
  private singular: "single" | "maybe" | null = null;
  private conflictColumns?: string[];
  private ignoreDuplicates = false;
  private countRequested = false;
  private head = false;
  private problem: unknown;
  private result?: Promise<LocalResult<T>>;

  constructor(
    private store: LocalStore,
    private table: string,
    private access: Access,
  ) {
    this.capture(() => {
      schemaFor(table);
    });
  }

  private capture(operation: () => void): this {
    try {
      operation();
    } catch (error) {
      this.problem ??= error;
    }
    return this;
  }

  select(columns = "*", options?: { count?: string; head?: boolean }): this {
    return this.capture(() => {
      for (const column of columns.split(",").map((item) => item.trim())) {
        if (column !== "*") assertColumn(this.table, column);
      }
      this.selection = columns;
      this.returning = true;
      this.countRequested = !!options?.count;
      this.head = !!options?.head;
    });
  }

  insert(values: Row | Row[]): this {
    return this.write("insert", values);
  }
  update(values: Row): this {
    return this.write("update", values);
  }
  delete(): this {
    this.operation = "delete";
    return this;
  }
  upsert(values: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }): this {
    this.write("upsert", values);
    return this.capture(() => {
      this.conflictColumns =
        options?.onConflict?.split(",").map((key) => key.trim()) ?? schemaFor(this.table).keys[0];
      if (
        !schemaFor(this.table).keys.some(
          (keys) =>
            keys.length === this.conflictColumns!.length &&
            keys.every((key) => this.conflictColumns!.includes(key)),
        )
      ) {
        throw new LocalDatabaseError("onConflict debe referirse a una clave única.", "42P10");
      }
      this.ignoreDuplicates = !!options?.ignoreDuplicates;
    });
  }

  private write(operation: Operation, values: Row | Row[]): this {
    this.operation = operation;
    return this.capture(() => {
      this.payload = (Array.isArray(values) ? values : [values]).map((value) =>
        cleanPatch(this.table, value),
      );
    });
  }

  private filter(column: string, operator: string, value: unknown, negate = false): this {
    return this.capture(() => {
      assertColumn(this.table, column);
      if (!["eq", "neq", "gt", "gte", "lt", "lte", "is", "in"].includes(operator))
        throw new LocalDatabaseError(`Filtro local no implementado: ${operator}`, "0A000");
      this.filters.push((row) =>
        negate
          ? (operator === "is" ||
              (row[column] != null &&
                value != null &&
                !(Array.isArray(value) && value.includes(null)))) &&
            !comparison(operator, row[column], value)
          : comparison(operator, row[column], value),
      );
    });
  }

  eq(column: string, value: unknown) {
    return this.filter(column, "eq", value);
  }
  neq(column: string, value: unknown) {
    return this.filter(column, "neq", value);
  }
  gt(column: string, value: unknown) {
    return this.filter(column, "gt", value);
  }
  gte(column: string, value: unknown) {
    return this.filter(column, "gte", value);
  }
  lt(column: string, value: unknown) {
    return this.filter(column, "lt", value);
  }
  lte(column: string, value: unknown) {
    return this.filter(column, "lte", value);
  }
  is(column: string, value: unknown) {
    return this.filter(column, "is", value);
  }
  in(column: string, values: unknown[]) {
    return this.filter(column, "in", values);
  }
  not(column: string, operator: string, value: unknown) {
    if (operator === "in" && typeof value === "string") {
      return this.capture(() => {
        if (!value.startsWith("(") || !value.endsWith(")"))
          throw new LocalDatabaseError("Filtro in inválido.", "PGRST100");
        this.filter(column, operator, splitTerms(value.slice(1, -1)).map(filterValue), true);
      });
    }
    return this.filter(column, operator, value, true);
  }
  or(expression: string): this {
    return this.capture(() => {
      const filters = splitTerms(expression).map((term) => parseTerm(this.table, term));
      this.filters.push((row) => filters.some((filter) => filter(row)));
    });
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this {
    return this.capture(() => {
      assertColumn(this.table, column);
      const ascending = options?.ascending ?? true;
      this.orders.push({ column, ascending, nullsFirst: options?.nullsFirst ?? !ascending });
    });
  }
  limit(count: number): this {
    return this.capture(() => {
      if (!Number.isSafeInteger(count) || count < 0)
        throw new LocalDatabaseError("Límite inválido.", "22023");
      this.maxRows = count;
    });
  }
  range(from: number, to: number): this {
    return this.capture(() => {
      if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from)
        throw new LocalDatabaseError("Rango inválido.", "22023");
      this.offset = from;
      this.maxRows = to - from + 1;
    });
  }
  single(): LocalQuery<Row> {
    this.singular = "single";
    return this as unknown as LocalQuery<Row>;
  }
  maybeSingle(): LocalQuery<Row> {
    this.singular = "maybe";
    return this as unknown as LocalQuery<Row>;
  }

  private execute(): LocalResult<T> {
    if (this.problem) return failure(this.problem);
    try {
      const operation = () => {
        const writing = this.operation !== "select";
        let rows = this.store
          .rows(this.table)
          .filter(
            (row) =>
              visible(this.table, row, this.access, writing) &&
              this.filters.every((filter) => filter(row)),
          );
        if (this.operation === "insert" || this.operation === "upsert") {
          rows = [];
          for (const patch of this.payload) {
            const existing =
              this.operation === "upsert"
                ? this.store
                    .rows(this.table)
                    .find((row) =>
                      this.conflictColumns!.every(
                        (key) => patch[key] != null && row[key] === patch[key],
                      ),
                    )
                : undefined;
            if (existing && this.ignoreDuplicates) continue;
            const row = { ...(existing ?? schemaFor(this.table).defaults()), ...patch };
            this.assertWrite(row, existing);
            if (existing && "updated_at" in row) row.updated_at = new Date().toISOString();
            this.store.put(this.table, row, existing);
            rows.push(row);
          }
        } else if (this.operation === "update") {
          rows = rows.map((previous) => {
            const row = { ...previous, ...this.payload[0] };
            this.assertWrite(row, previous);
            if ("updated_at" in row) row.updated_at = new Date().toISOString();
            this.store.put(this.table, row, previous);
            return row;
          });
        } else if (this.operation === "delete") {
          for (const row of rows) this.store.remove(this.table, row);
        }

        const count = this.countRequested ? rows.length : null;
        for (const order of [...this.orders].reverse()) {
          rows.sort((left, right) => {
            const a = left[order.column];
            const b = right[order.column];
            if (a === b) return 0;
            if (a == null) return order.nullsFirst ? -1 : 1;
            if (b == null) return order.nullsFirst ? 1 : -1;
            return (
              ((a as string | number) < (b as string | number) ? -1 : 1) *
              (order.ascending ? 1 : -1)
            );
          });
        }
        rows = rows.slice(
          this.offset,
          Number.isFinite(this.maxRows) ? this.offset + this.maxRows : undefined,
        );
        if (!this.selection.split(",").some((column) => column.trim() === "*")) {
          const columns = this.selection.split(",").map((column) => column.trim());
          rows = rows.map((row) =>
            Object.fromEntries(columns.map((column) => [column, row[column]])),
          );
        }
        if (
          this.singular &&
          (rows.length > 1 || (rows.length === 0 && this.singular === "single"))
        ) {
          throw new LocalDatabaseError(
            `Se esperaba una fila; se encontraron ${rows.length}.`,
            "PGRST116",
          );
        }
        const data =
          this.head || (this.operation !== "select" && !this.returning)
            ? null
            : this.singular
              ? (rows[0] ?? null)
              : rows;
        return success(data as T | null, count);
      };
      return this.operation === "select" ? operation() : this.store.transaction(operation);
    } catch (error) {
      return failure(error);
    }
  }

  private assertWrite(row: Row, existing?: Row) {
    if (this.access.serviceRole) return;
    if (
      !visible(this.table, row, this.access, true) ||
      (existing && !visible(this.table, existing, this.access, true))
    ) {
      throw new LocalDatabaseError("No tienes acceso a esta fila.", "42501");
    }
    if (
      this.table === "profiles" &&
      (!existing ||
        ["role", "limits", "email"].some(
          (key) => JSON.stringify(row[key]) !== JSON.stringify(existing[key]),
        ))
    ) {
      throw new LocalDatabaseError(
        "No se pueden modificar credenciales o permisos desde el perfil.",
        "42501",
      );
    }
  }

  then<TResult1 = LocalResult<T>, TResult2 = never>(
    onfulfilled?: ((value: LocalResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    this.result ??= Promise.resolve().then(() => this.execute());
    return this.result.then(onfulfilled, onrejected);
  }
}

export function createLocalClient(options: LocalClientOptions = {}) {
  const store = getLocalStore(options.filename);
  const profile = options.userId
    ? store.rows("profiles").find((row) => row.id === options.userId)
    : undefined;
  const access: Access = {
    userId: profile ? String(profile.id) : null,
    serviceRole: options.serviceRole ?? false,
    isAdmin: profile?.role === "admin",
  };
  return {
    from: (table: string) => new LocalQuery(store, table, access),
    rpc: async (name: string, args: Row = {}): Promise<LocalResult<unknown>> => {
      try {
        if (
          !access.serviceRole &&
          (!access.userId ||
            args.p_user_id !== access.userId ||
            !["get_limit", "consume_quota"].includes(name))
        ) {
          throw new LocalDatabaseError("No tienes acceso a esta operación.", "42501");
        }
        return success(store.rpc(name, args));
      } catch (error) {
        return failure(error);
      }
    },
    auth: {
      getUser: async () => ({
        data: {
          user: profile
            ? {
                id: String(profile.id),
                email: String(profile.email),
                role: "authenticated",
                aud: "authenticated",
                app_metadata: { provider: "local" },
                user_metadata: { full_name: profile.full_name },
                created_at: String(profile.created_at),
              }
            : null,
        },
        error: null,
      }),
      signOut: async () => ({ error: null }),
    },
  };
}

/** The existing application uses Supabase's query inference at this boundary. */
export function localSupabaseClient(options: LocalClientOptions = {}): SupabaseClient {
  return createLocalClient(options) as unknown as SupabaseClient;
}
