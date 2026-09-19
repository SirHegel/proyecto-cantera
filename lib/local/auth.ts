import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { getLocalStore } from "./store";
import { LocalDatabaseError, schemas, type Row } from "./schema";

const scrypt = promisify(scryptCallback);
export const LOCAL_SESSION_COOKIE = "cantera_session";
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60;
export class LocalAuthError extends Error {}

function normalizedEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
    throw new LocalAuthError("Escribe un correo electrónico válido.");
  return normalized;
}

async function passwordHash(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${hash.toString("hex")}`;
}

async function matchesPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, salt, encoded] = stored.split(":");
  if (algorithm !== "scrypt" || !salt || !encoded)
    throw new Error("Formato de credencial local inválido.");
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(encoded, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Passwords and session tokens live outside the query adapter's table allowlist. */
export async function registerLocalAccount(
  input: { email: string; password: string; fullName: string },
  filename?: string,
): Promise<Row> {
  const email = normalizedEmail(input.email);
  if (input.password.length < 8 || input.password.length > 128)
    throw new LocalAuthError("Usa una contraseña de entre 8 y 128 caracteres.");
  const fullName = input.fullName.trim();
  if (fullName.length < 2 || fullName.length > 80)
    throw new LocalAuthError("Escribe un nombre de entre 2 y 80 caracteres.");
  const hash = await passwordHash(input.password);
  const store = getLocalStore(filename);
  return store.transaction(() => {
    if (
      store.database.prepare("SELECT user_id FROM local_credentials WHERE email = ?").get(email)
    ) {
      throw new LocalAuthError(
        "Ya existe una cuenta con ese correo en este equipo. Inicia sesión.",
      );
    }
    const id = randomUUID();
    const hasAccount = !!store.database
      .prepare("SELECT user_id FROM local_credentials LIMIT 1")
      .get();
    const profile = {
      ...schemas.profiles.defaults(),
      id,
      email,
      full_name: fullName,
      role: hasAccount ? "student" : "admin",
    };
    store.database
      .prepare("INSERT INTO local_credentials (user_id, email, password_hash) VALUES (?, ?, ?)")
      .run(id, email, hash);
    store.put("profiles", profile);
    return profile;
  });
}

export async function authenticateLocalAccount(
  emailInput: string,
  password: string,
  filename?: string,
): Promise<Row> {
  const email = normalizedEmail(emailInput);
  if (password.length > 128) throw new LocalAuthError("Correo o contraseña incorrectos.");
  const store = getLocalStore(filename);
  const credential = store.database
    .prepare("SELECT * FROM local_credentials WHERE email = ?")
    .get(email) as
    | { user_id: string; password_hash: string; failed_attempts: number; blocked_until: number }
    | undefined;
  if (credential && credential.blocked_until > Date.now())
    throw new LocalAuthError("Demasiados intentos. Vuelve a intentarlo en cinco minutos.");
  // Apply the same expensive derivation to unknown addresses.
  const valid = await matchesPassword(
    password,
    credential?.password_hash ?? `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`,
  );
  if (!credential || !valid) {
    if (credential)
      store.transaction(() => {
        const current = store.database
          .prepare("SELECT failed_attempts FROM local_credentials WHERE user_id = ?")
          .get(credential.user_id)!;
        const failures = Number(current.failed_attempts) + 1;
        store.database
          .prepare(
            "UPDATE local_credentials SET failed_attempts = ?, blocked_until = ? WHERE user_id = ?",
          )
          .run(
            failures >= 5 ? 0 : failures,
            failures >= 5 ? Date.now() + 5 * 60e3 : 0,
            credential.user_id,
          );
      });
    throw new LocalAuthError("Correo o contraseña incorrectos.");
  }
  store.database
    .prepare(
      "UPDATE local_credentials SET failed_attempts = 0, blocked_until = 0 WHERE user_id = ?",
    )
    .run(credential.user_id);
  const profile = store.rows("profiles").find((row) => row.id === credential.user_id);
  if (!profile) throw new Error("No se encontró el perfil de esta cuenta.");
  return profile;
}

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export function createLocalSession(userId: string, filename?: string): string {
  const store = getLocalStore(filename);
  if (
    !store.database.prepare("SELECT user_id FROM local_credentials WHERE user_id = ?").get(userId)
  )
    throw new LocalDatabaseError("Cuenta local inexistente.", "42501");
  const token = randomBytes(32).toString("base64url");
  store.transaction(() => {
    store.database.prepare("DELETE FROM local_sessions WHERE expires_at <= ?").run(Date.now());
    store.database
      .prepare("INSERT INTO local_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
      .run(tokenHash(token), userId, Date.now() + SESSION_MAX_AGE * 1000);
  });
  return token;
}

export function localSessionUser(token: string | undefined, filename?: string): string | null {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const row = getLocalStore(filename)
    .database.prepare("SELECT user_id FROM local_sessions WHERE token_hash = ? AND expires_at > ?")
    .get(tokenHash(token), Date.now());
  return row ? String(row.user_id) : null;
}

export function revokeLocalSession(token: string | undefined, filename?: string) {
  if (token)
    getLocalStore(filename)
      .database.prepare("DELETE FROM local_sessions WHERE token_hash = ?")
      .run(tokenHash(token));
}
