import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setupEnv } from "./setup-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
let child;
let stopping = false;

export function supportedNode(version) {
  const [major, minor] = version.split(".").map(Number);
  return (major === 22 && minor >= 19) || major >= 24;
}

function run(command, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    child = spawn(command, commandArgs, {
      cwd: root,
      stdio: "inherit",
      env: process.env,
      ...options,
    });
    child.once("error", (error) => {
      child = undefined;
      reject(error);
    });
    child.once("exit", (code, signal) => {
      child = undefined;
      if (stopping || code === 0) resolve(0);
      else
        reject(
          new Error(
            `El proceso terminó ${signal ? `con señal ${signal}` : `con código ${code}`}. Revisa el error indicado arriba.`,
          ),
        );
    });
  });
}

function npmInstall() {
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) {
    return run(process.execPath, [process.env.npm_execpath, "ci", "--no-audit", "--no-fund"]);
  }
  if (process.platform === "win32") {
    return run(process.env.ComSpec || "cmd.exe", [
      "/d",
      "/s",
      "/c",
      "npm.cmd ci --no-audit --no-fund",
    ]);
  }
  return run("npm", ["ci", "--no-audit", "--no-fund"]);
}

async function availablePort(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () =>
      reject(
        new Error(
          `El puerto ${port} está ocupado. Cierra la otra instancia o usa: npm run launch -- --port ${port + 1}`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}

function browser(url) {
  // URL de host fijo y puerto entero: nunca se interpreta texto libre en una shell.
  const [command, commandArgs] =
    process.platform === "win32"
      ? ["rundll32.exe", ["url.dll,FileProtocolHandler", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  const opener = spawn(command, commandArgs, { detached: true, stdio: "ignore" });
  opener.on("error", () => console.log(`Abre ${url} en tu navegador.`));
  opener.unref();
}

async function openWhenReady(url) {
  for (let attempt = 0; attempt < 180 && child && !stopping; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        browser(url);
        return;
      }
    } catch {
      /* El servidor aún se está iniciando. */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function main() {
  if (args.includes("--help")) {
    console.log(
      "Uso: npm run launch -- [--dev] [--no-open] [--port 3001]\nCompila e inicia Cantera en 127.0.0.1. --dev activa recarga durante desarrollo.",
    );
    return;
  }
  if (!supportedNode(process.versions.node)) {
    throw new Error(
      `Node ${process.versions.node} no es compatible. Instala Node 24 LTS (o 22.19+) desde https://nodejs.org y vuelve a abrir la terminal.`,
    );
  }
  let port = Number(process.env.PORT || 3000);
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--port") port = Number(args[++index]);
    else if (!["--dev", "--no-open"].includes(args[index]))
      throw new Error(`Opción desconocida: ${args[index]}. Usa --help.`);
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("El puerto debe ser un número entre 1024 y 65535.");
  await availablePort(port);
  setupEnv();
  process.loadEnvFile(path.join(root, ".env.local"));
  if (existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));
  const mode =
    process.env.CANTERA_MODE?.trim().toLowerCase() ||
    (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? "supabase"
      : "local");
  if (!["local", "supabase"].includes(mode))
    throw new Error("CANTERA_MODE debe ser local o supabase.");
  if (mode === "supabase") {
    const required = [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ];
    const provider = process.env.PROVIDER_MODE || "fixture";
    const places = process.env.PLACES_MODE || provider;
    const ai = process.env.AI_MODE || provider;
    if (![provider, places, ai].every((value) => ["fixture", "cassette", "live"].includes(value))) {
      throw new Error("Los modos de proveedores deben ser fixture, cassette o live.");
    }
    if (places !== "fixture") required.push("GOOGLE_PLACES_API_KEY");
    if (ai !== "fixture") required.push("OPENAI_API_KEY");
    const missing = required.filter((key) => !process.env[key]?.trim());
    if (missing.length) throw new Error(`Faltan variables en .env.local: ${missing.join(", ")}`);
  }
  const lock = path.join(root, "package-lock.json");
  const stamp = path.join(root, "node_modules", ".cantera-install");
  const fingerprint = createHash("sha256")
    .update(readFileSync(lock))
    .update(process.versions.node.split(".")[0])
    .update(process.platform)
    .update(process.arch)
    .digest("hex");
  if (
    !existsSync(stamp) ||
    readFileSync(stamp, "utf8") !== fingerprint ||
    !existsSync(path.join(root, "node_modules", "next", "dist", "bin", "next"))
  ) {
    console.log("Preparando las dependencias de Cantera (la primera vez necesita internet)...");
    await npmInstall();
    if (stopping) return;
    writeFileSync(stamp, fingerprint);
  }
  const next = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const development = args.includes("--dev");
  if (!development) {
    console.log("Compilando Cantera...");
    await run(process.execPath, [next, "build"]);
    if (stopping) return;
  }
  const url = `http://127.0.0.1:${port}`;
  console.log(
    `\nCantera · ${mode === "local" ? "cuentas locales en este equipo" : "modo Supabase"}\n${url}\nMantén esta ventana abierta. Ctrl+C detiene la aplicación.\n`,
  );
  const running = run(process.execPath, [
    next,
    development ? "dev" : "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ]);
  if (!args.includes("--no-open") && !process.env.CI) void openWhenReady(url);
  await running;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      stopping = true;
      child?.kill(signal);
    });
  }
  main().catch((error) => {
    console.error(`\nNo se pudo iniciar Cantera: ${error.message}\n`);
    process.exitCode = 1;
  });
}
