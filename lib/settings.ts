import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isLocalMode } from "@/lib/runtime";
import { isId } from "@/lib/validation";
import type { ProviderMode } from "@/lib/providers/types";

export type ProviderSettings = {
  placesMode: ProviderMode;
  aiMode: ProviderMode;
  googleKey?: string;
  openaiKey?: string;
};

type SavedSettings = { mode: "fixture" | "live"; googleKey: string; openaiKey: string };

function folder() {
  return path.resolve(
    /* turbopackIgnore: true */ process.env.CANTERA_DATA_DIR || path.join(process.cwd(), ".data"),
  );
}
function settingsFile(userId: string) {
  if (!isId(userId)) throw new Error("Usuario inválido.");
  return path.join(folder(), "providers", `${userId}.json`);
}
function encryptionKey() {
  const directory = folder();
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, "provider-key");
  try {
    writeFileSync(filename, randomBytes(32), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const key = readFileSync(filename);
  if (key.length !== 32)
    throw new Error(
      "La clave de cifrado local no es válida. Restaura la copia de seguridad completa.",
    );
  return key;
}
async function readSaved(userId: string): Promise<SavedSettings | null> {
  let raw: string;
  try {
    raw = await fs.readFile(settingsFile(userId), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const data = JSON.parse(raw);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(data.iv, "base64"));
  decipher.setAuthTag(Buffer.from(data.tag, "base64"));
  return JSON.parse(
    Buffer.concat([decipher.update(Buffer.from(data.data, "base64")), decipher.final()]).toString(
      "utf8",
    ),
  );
}
export async function getUserProviderSettings(userId: string): Promise<ProviderSettings> {
  const saved = isLocalMode() ? await readSaved(userId) : null;
  if (saved)
    return {
      placesMode: saved.mode,
      aiMode: saved.mode,
      googleKey: saved.googleKey,
      openaiKey: saved.openaiKey,
    };
  return {
    placesMode: (process.env.PLACES_MODE || process.env.PROVIDER_MODE || "fixture") as ProviderMode,
    aiMode: (process.env.AI_MODE || process.env.PROVIDER_MODE || "fixture") as ProviderMode,
    googleKey: process.env.GOOGLE_PLACES_API_KEY,
    openaiKey: process.env.OPENAI_API_KEY,
  };
}
export async function getProviderStatus() {
  const { supabaseServer } = await import("@/lib/supabase/server");
  const db = await supabaseServer();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return { configured: { places: false, ai: false }, mode: "fixture" as const, editable: false };
  const settings = await getUserProviderSettings(user.id);
  return {
    configured: { places: !!settings.googleKey, ai: !!settings.openaiKey },
    mode:
      settings.placesMode === "fixture" || settings.aiMode === "fixture"
        ? ("fixture" as const)
        : ("live" as const),
    editable: isLocalMode(),
  };
}
export async function storeProviderSettings(
  userId: string,
  mode: string,
  googleKey: string,
  openaiKey: string,
) {
  if (!isLocalMode())
    throw new Error(
      "En el servicio compartido, las claves las configura el administrador del servidor.",
    );
  if (!["fixture", "live"].includes(mode)) throw new Error("Modo inválido.");
  const previous = await getUserProviderSettings(userId);
  const saved: SavedSettings = {
    mode: mode as SavedSettings["mode"],
    googleKey: googleKey.trim() || previous.googleKey || "",
    openaiKey: openaiKey.trim() || previous.openaiKey || "",
  };
  if ([saved.googleKey, saved.openaiKey].some((key) => key.length > 1024 || /[\r\n\s]/.test(key)))
    throw new Error("Revisa las claves: no deben contener espacios.");
  if (mode === "live" && (!saved.googleKey || !saved.openaiKey))
    throw new Error("Añade las dos claves para activar las búsquedas reales.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(saved), "utf8"), cipher.final()]);
  const filename = settingsFile(userId);
  await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${randomBytes(8).toString("hex")}.tmp`;
  await fs.writeFile(
    temporary,
    JSON.stringify({
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    }),
    { mode: 0o600 },
  );
  await fs.rename(temporary, filename);
}
