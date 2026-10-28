/**
 * Prueba de humo en un navegador real (Playwright): búsqueda → registro de paciente → cita
 * presencial con un perfil de muestra (calendario, horario, motivo) → detalle de la cita →
 * CMS protegido para cuentas que no son la del propietario.
 *
 *   BASE_URL=http://127.0.0.1:5173 npm run test:e2e
 *
 * No usa credenciales reales: crea una cuenta nueva con un correo aleatorio.
 */
import { createRequire } from "node:module";

// Playwright no es dependencia del proyecto: se usa la instalación global (o `npm i -D playwright`).
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const base = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const step = (name) => console.log(`✓ ${name}`);

try {
  await page.goto(`${base}/`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  step("portada");

  await page.goto(`${base}/buscar?q=pediatra`);
  await page.getByText(/profesional(es)? ·/).first().waitFor();
  step("búsqueda");

  await page.goto(`${base}/cuenta?tab=registro&next=/doctor/dr-andres-salazar`);
  await page.getByLabel("Nombre y apellido").fill("Prueba E2E");
  await page.getByLabel("Correo electrónico").fill(`e2e-${Date.now()}@test.ec`);
  await page.getByLabel(/^Contraseña/).fill("contrasena-e2e-123");
  await page.getByRole("checkbox", { name: /términos y la política de privacidad/i }).check();
  await page.getByRole("button", { name: /Crear mi cuenta/ }).click();
  await page.waitForURL(/\/doctor\//);
  step("registro de paciente");

  // Calendario: modalidad presencial → primer día con horarios → primer horario → confirmar.
  await page.getByRole("radio", { name: /Presencial/ }).first().click();
  const slot = page.locator("[data-slot]").first();
  for (let i = 0; i < 7 && !(await slot.count()); i++) {
    const days = page.locator("[data-day]:not([disabled])");
    if (await days.nth(i).count()) await days.nth(i).click();
    await page.waitForTimeout(300);
  }
  await slot.click();
  await page.getByLabel(/Motivo/).fill("Control general");
  await page.getByRole("button", { name: /Agendar/ }).last().click();
  await page.waitForURL(/\/citas\/\d+/);
  await page.getByText(/Confirmada|Solicitada/).first().waitFor();
  step("cita presencial reservada");

  await page.goto(`${base}/maestro`);
  await page.getByText("no tiene acceso al CMS").waitFor();
  if (await page.getByRole("button", { name: "Publicar" }).count()) throw new Error("Una cuenta normal pudo abrir el CMS");
  step("CMS protegido");

  if (errors.length) throw new Error(`Errores de página: ${errors.join(" | ")}`);
  console.log("Prueba de humo OK");
} catch (err) {
  await page.screenshot({ path: "e2e-falla.png", fullPage: true }).catch(() => {});
  console.error(`✗ ${err.message} (captura en e2e-falla.png)`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
