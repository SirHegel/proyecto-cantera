import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Lee únicamente claves conocidas; nunca imprime la salida completa. */
export function parseEnv(output) {
  const values = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return {
    url: values.API_URL ?? null,
    anon: values.ANON_KEY || values.PUBLISHABLE_KEY || null,
    service: values.SERVICE_ROLE_KEY || values.SECRET_KEY || null,
  };
}

export function setupEnv({ root = projectRoot, supabase = false } = {}) {
  const destination = path.join(root, ".env.local");
  if (existsSync(destination)) {
    console.log(".env.local ya existe; se conserva tu configuración.");
    return false;
  }
  let contents = "# Configuración privada; este archivo no se sube a GitHub.\n";
  if (supabase) {
    // Comando y argumentos fijos. Windows necesita cmd para ejecutar npx.cmd.
    const result =
      process.platform === "win32"
        ? spawnSync(
            process.env.ComSpec || "cmd.exe",
            ["/d", "/s", "/c", "npx.cmd --no-install supabase status -o env"],
            { cwd: root, encoding: "utf8", windowsHide: true },
          )
        : spawnSync("npx", ["--no-install", "supabase", "status", "-o", "env"], {
            cwd: root,
            encoding: "utf8",
          });
    if (result.error || result.status !== 0) {
      throw new Error(
        "No se pudo consultar Supabase local. Instala su CLI y ejecuta 'supabase start'. No se modificó .env.local.",
      );
    }
    const { url, anon, service } = parseEnv(result.stdout);
    if (!url || !anon || !service) {
      throw new Error(
        "Supabase no devolvió las tres claves requeridas. Revisa su configuración local; no compartas la salida con claves.",
      );
    }
    contents += `CANTERA_MODE=supabase\nNEXT_PUBLIC_SUPABASE_URL=${url}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}\nSUPABASE_SERVICE_ROLE_KEY=${service}\n`;
  } else {
    contents +=
      "# Cuentas locales y datos persistentes en .data/. No requiere claves ni Docker para empezar.\nCANTERA_MODE=local\n";
  }
  contents +=
    "\n# Datos ficticios, sin llamadas facturadas.\nPROVIDER_MODE=fixture\nMAX_WEBSITE_CHARS=3500\nMAX_AI_ANALYSES_PER_SEARCH=25\nFETCH_TIMEOUT_MS=5000\nFETCH_CONCURRENCY=8\n";
  writeFileSync(destination, contents, { flag: "wx", mode: 0o600 });
  console.log(`.env.local creado en modo ${supabase ? "Supabase" : "local"}.`);
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--supabase")) {
    console.error("Uso: npm run setup [-- --supabase]");
    process.exitCode = 1;
  } else {
    try {
      setupEnv({ supabase: args.includes("--supabase") });
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
