import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, expect } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profile = await mkdtemp(path.join(tmpdir(), "cantera-desktop-smoke-"));
const executablePath = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
let application;

async function open() {
  application = await electron.launch({
    ...(executablePath ? { executablePath, args: [] } : { args: [root] }),
    cwd: root,
    env: {
      ...process.env,
      CANTERA_USER_DATA_DIR: profile,
      CANTERA_SMOKE_TEST: "1",
      PROVIDER_MODE: "fixture",
    },
    timeout: 45_000,
  });
  const page = await application.firstWindow({ timeout: 45_000 });
  await page.waitForLoadState("domcontentloaded");
  return page;
}

try {
  let page = await open();
  assert.equal(await application.evaluate(({ app }) => app.getPath("userData")), profile);
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:\d+\/login/);
  await page.goto(new URL("/login?mode=register", page.url()).href);
  await page.getByLabel("Nombre", { exact: true }).fill("Prueba de escritorio");
  await page.getByLabel("Correo electrónico", { exact: true }).fill("desktop@example.test");
  await page.getByLabel(/^Contraseña/).fill("Cantera-Desktop-Test-987!");
  await page.getByRole("button", { name: "Crear mi cuenta" }).click();
  await expect(page).toHaveURL(/\/$/);
  assert.ok((await readdir(path.join(profile, "data"))).includes("cantera.sqlite"));
  await page.goto(new URL("/configuracion", page.url()).href);
  await expect(page.locator("h1")).toBeVisible();
  await application.close();
  application = undefined;
  page = await open();
  // La sesión y la cuenta sobreviven al cierre, aunque cambie el puerto local.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("h1")).toBeVisible();
  console.log(
    "Escritorio verificado: ventana aislada, servidor utilityProcess, registro, SQLite y sesión persistente tras reiniciar.",
  );
} catch (error) {
  try {
    console.error((await readFile(path.join(profile, "server.log"), "utf8")).slice(-8000));
  } catch {
    /* Puede fallar antes de iniciar el servidor. */
  }
  throw error;
} finally {
  if (application) await application.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
