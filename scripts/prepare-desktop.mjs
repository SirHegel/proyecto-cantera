import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, ".next", "standalone");
const destination = path.join(root, ".desktop", "server");
if (!existsSync(path.join(source, "server.js"))) {
  throw new Error(
    "Falta .next/standalone/server.js. Ejecuta npm run build con output: standalone.",
  );
}
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync(source, destination, {
  recursive: true,
  dereference: true,
  filter(file) {
    const name = path.basename(file);
    return (
      name !== ".env" &&
      !name.startsWith(".env.") &&
      ![".data", ".cassettes", "backups"].includes(name) &&
      !/\.sqlite(?:-shm|-wal)?$/.test(name)
    );
  },
});
cpSync(path.join(root, ".next", "static"), path.join(destination, ".next", "static"), {
  recursive: true,
});
if (existsSync(path.join(root, "public")))
  cpSync(path.join(root, "public"), path.join(destination, "public"), { recursive: true });
console.log(
  "Servidor de escritorio preparado en .desktop/server (sin configuración privada ni bases de datos).",
);
