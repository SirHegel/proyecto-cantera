import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { _electron as electron, expect } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profile = await mkdtemp(path.join(tmpdir(), "cantera-desktop-smoke-"));
const executablePath = process.argv[2] ? path.resolve(process.argv[2]) : undefined;
let application;
const note = "Contacto confirmado; conservar esta nota al reiniciar Cantera.";
const pageErrors = [];

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
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.waitForLoadState("domcontentloaded");
  return page;
}

async function navigate(page, pathname) {
  await page.goto(new URL(pathname, page.url()).href);
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
  await navigate(page, "/buscar");
  for (let step = 0; step < 3; step++)
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Encontrar clientes", exact: true }).click();
  await expect(page).toHaveURL(/\/buscar\/[a-f0-9-]+$/);
  const searchPath = new URL(page.url()).pathname;
  const businessLink = page.getByRole("link", { name: /Smile Harbor Dental/ }).first();
  await expect(businessLink).toBeVisible({ timeout: 60_000 });
  await businessLink.click();
  await expect(page).toHaveURL(/\/leads\/[a-f0-9-]+$/);
  const leadPath = new URL(page.url()).pathname;
  await page.getByRole("button", { name: "Crear ángulo de contacto", exact: true }).click();
  await expect(page.getByText("Lo que notamos", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Escribir para Email", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copiar mensaje", exact: true })).toBeVisible();

  const status = page.getByLabel("Estado de la oportunidad", { exact: true });
  await status.selectOption("contactado");
  await expect(page.getByRole("button", { name: "Ya le escribí", exact: true })).toBeVisible();
  await status.selectOption("nuevo");
  await expect(status).toHaveValue("nuevo");
  await expect(page.getByText("Sin fecha programada", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ya le escribí", exact: true })).toHaveCount(0);
  await navigate(page, "/leads?g=listo");
  await expect(page.getByRole("link", { name: /Smile Harbor Dental/ })).toBeVisible();
  await navigate(page, leadPath);
  await page.getByLabel("Estado de la oportunidad", { exact: true }).selectOption("contactado");
  await expect(page.getByRole("button", { name: "Ya le escribí", exact: true })).toBeVisible();
  await page.getByLabel("Una nota para recordar", { exact: true }).fill(note);
  await page.getByRole("button", { name: "Guardar nota", exact: true }).click();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await application.close();
  application = undefined;

  // Con la aplicación cerrada, los datos deben existir físicamente en la base
  // del perfil; la comprobación no depende de memoria, cookies ni una nube.
  const database = new DatabaseSync(path.join(profile, "data", "cantera.sqlite"));
  try {
    const rows = (table) =>
      database
        .prepare("SELECT document FROM cantera_records WHERE table_name = ?")
        .all(table)
        .map((row) => JSON.parse(row.document));
    const lead = rows("leads").find((item) => item.id === leadPath.split("/").at(-1));
    assert.equal(lead.status, "contactado");
    assert.equal(lead.saved, true);
    assert.equal(lead.followup_count, 0);
    assert.ok(lead.next_followup_at);
    assert.ok(rows("activities").some((item) => item.lead_id === lead.id && item.body === note));
    assert.ok(
      rows("lead_generations").some((item) => item.lead_id === lead.id && item.kind === "message"),
    );
    const search = rows("searches").find((item) => item.id === searchPath.split("/").at(-1));
    assert.equal(search.status, "done");
    assert.ok(rows("offers").length > 0);
    // Amplía solo este perfil temporal para comprobar acceso a búsquedas
    // anteriores a las ocho primeras, sin consumir APIs ni cuotas reales.
    const insert = database.prepare(
      "INSERT INTO cantera_records (table_name, row_key, document) VALUES ('searches', ?, ?)",
    );
    for (let index = 0; index < 8; index++) {
      const id = randomUUID();
      const additional = {
        ...search,
        id,
        niche: `Búsqueda de prueba ${index + 1}`,
        created_at: new Date(Date.parse(search.created_at) + (index + 1) * 1000).toISOString(),
      };
      insert.run(JSON.stringify([id]), JSON.stringify(additional));
    }
  } finally {
    database.close();
  }

  page = await open();
  // La sesión y la cuenta sobreviven al cierre, aunque cambie el puerto local.
  await expect(page).toHaveURL(/\/$/);
  await navigate(page, "/buscar");
  await expect(page.locator(`a[href="${searchPath}"]`)).toHaveCount(0);
  await page.getByRole("link", { name: "Página siguiente del historial", exact: true }).click();
  await expect(page.getByText("Página 2 de 2", { exact: true })).toBeVisible();
  await expect(page.locator(`a[href="${searchPath}"]`)).toBeVisible();
  await page.locator(`a[href="${searchPath}"]`).click();
  await expect(page.getByRole("link", { name: /Smile Harbor Dental/ }).first()).toBeVisible();
  await navigate(page, leadPath);
  await expect(page.getByLabel("Estado de la oportunidad", { exact: true })).toHaveValue(
    "contactado",
  );
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copiar mensaje", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ya le escribí", exact: true })).toBeVisible();
  await navigate(page, "/leads?g=esperando");
  await expect(page.getByRole("link", { name: /Smile Harbor Dental/ })).toBeVisible();
  const exported = await page.request.get(new URL("/api/leads/export", page.url()).href);
  assert.equal(exported.ok(), true);
  assert.match(await exported.text(), /Smile Harbor Dental/);
  assert.deepEqual(pageErrors, []);
  console.log(
    "Escritorio verificado: cuenta, búsqueda, oferta, cliente, estado Contactado, nota, mensaje y seguimiento persistentes en SQLite y visibles tras reiniciar; volver a Sin contactar elimina el recordatorio anterior.",
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
