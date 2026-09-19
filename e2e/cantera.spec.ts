import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const password = "Cantera-Test-987!";
async function register(page: Page, name: string) {
  await page.goto("/login?mode=register");
  const email = `${name}-${Date.now()}@example.test`;
  await page.getByLabel("Nombre", { exact: true }).fill(name);
  await page.getByLabel("Correo electrónico", { exact: true }).fill(email);
  await page.getByLabel(/^Contraseña/).fill(password);
  await page.getByRole("button", { name: "Crear mi cuenta" }).click();
  await expect(page).toHaveURL(/\/$/);
  return email;
}

test("registro, búsqueda, evidencia, mensajes, CRM, exportación y persistencia de cuenta", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const email = await register(page, "Andrea");
  await page.goto("/buscar");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Encontrar clientes", exact: true }).click();
  await expect(page).toHaveURL(/\/buscar\/[a-f0-9-]+$/);
  await expect(page.getByRole("link", { name: /Smile Harbor Dental/ }).first()).toBeVisible({
    timeout: 60_000,
  });
  const searchUrl = page.url();
  await page
    .getByRole("link", { name: /Smile Harbor Dental/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/leads\/[a-f0-9-]+$/);
  const leadUrl = page.url();
  await expect(page.getByRole("heading", { name: /Smile Harbor Dental/ })).toBeVisible();
  await page.getByRole("button", { name: "Crear ángulo de contacto", exact: true }).click();
  await expect(page.getByText("Lo que notamos", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Escribir para Email", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copiar mensaje", exact: true })).toBeVisible();
  await page.getByLabel("Estado de la oportunidad", { exact: true }).selectOption("contactado");
  await expect(page.getByRole("button", { name: "Ya le escribí", exact: true })).toBeVisible();
  await page
    .getByLabel("Una nota para recordar", { exact: true })
    .fill("Interesado en mejorar la recepción.");
  await page.getByRole("button", { name: "Guardar nota", exact: true }).click();
  await expect(
    page.getByText("Interesado en mejorar la recepción.", { exact: true }),
  ).toBeVisible();
  await page.goto("/leads?g=todos");
  await expect(page.getByRole("link", { name: /Smile Harbor Dental/ })).toBeVisible();
  const download = await page.request.get("/api/leads/export");
  expect(download.ok()).toBeTruthy();
  expect(await download.text()).toContain("Smile Harbor Dental");
  await page.goto(searchUrl);
  expect(
    (
      await page.request.get(
        `${new URL(searchUrl).pathname.replace("/buscar/", "/api/searches/")}/run`,
      )
    ).ok(),
  ).toBeTruthy();
  await page.goto(leadUrl);
  await expect(
    page.getByText("Interesado en mejorar la recepción.", { exact: true }),
  ).toBeVisible();

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await register(otherPage, "Camilo");
  await otherPage.goto("/leads");
  await expect(otherPage.getByText("Aquí empiezan las buenas conversaciones.")).toBeVisible();
  await otherPage.goto(leadUrl);
  await expect(otherPage.getByRole("heading", { name: /Smile Harbor Dental/ })).toHaveCount(0);
  await expect(otherPage.getByText("404 · Página no encontrada", { exact: true })).toBeVisible();
  const isolatedExport = await otherPage.request.get("/api/leads/export");
  expect(await isolatedExport.text()).not.toContain("Smile Harbor Dental");
  await other.close();

  await page.request.post("/auth/signout");
  await page.goto("/login");
  await page.getByLabel("Correo electrónico", { exact: true }).fill(email);
  await page.getByLabel(/^Contraseña/).fill(password);
  await page.getByRole("button", { name: "Entrar a mi espacio" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto(leadUrl);
  await expect(
    page.getByText("Interesado en mejorar la recepción.", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("móvil y escritorio sin desbordamiento, navegación y accesibilidad", async ({ page }) => {
  await register(page, "Responsive");
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/buscar", "/leads", "/seguimientos", "/configuracion"]) {
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow, `${route} at ${width}px`).toBeFalsy();
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({ path: "test-results/cantera-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "test-results/cantera-desktop.png", fullPage: true });
});

test("rutas sensibles requieren sesión y mantenimiento requiere secreto", async ({ request }) => {
  const exportResponse = await request.get("/api/leads/export", { maxRedirects: 0 });
  expect([401, 307]).toContain(exportResponse.status());
  const cron = await request.get("/api/cron/daily", { maxRedirects: 0 });
  expect(cron.status()).toBe(401);
  const rebinding = await request.get("/login", {
    headers: { Host: "malicious.example" },
    maxRedirects: 0,
  });
  expect(rebinding.status()).toBe(403);
});
