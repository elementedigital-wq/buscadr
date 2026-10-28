/**
 * Prueba de humo en un navegador real (Playwright): registro → reserva de prueba en 3 pasos sobre
 * un anuncio de muestra → detalle con código → CMS protegido.
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

  await page.goto(`${base}/explorar?q=taladro`);
  await page.getByText(/equipos? disponibles?/).first().waitFor();
  step("búsqueda");

  await page.goto(`${base}/cuenta?tab=registro&next=/equipo/1`);
  await page.getByLabel("Nombre y apellido").fill("Prueba E2E");
  await page.getByLabel("Correo electrónico").fill(`e2e-${Date.now()}@test.ec`);
  await page.getByLabel(/^Contraseña/).fill("contrasena-e2e-123");
  await page.getByRole("checkbox", { name: /condiciones del piloto/i }).check();
  await page.getByRole("button", { name: /Crear mi cuenta/ }).click();
  await page.waitForURL(/\/equipo\//);
  step("registro");

  // Reserva en 3 pasos: Cuándo → Detalles → Confirmar.
  await page.getByRole("link", { name: /Reservar ahora|Solicitar reserva/ }).first().click();
  await page.waitForURL(/\/reservar/);
  await page.getByRole("radio", { name: "1 día" }).click();
  await page.getByRole("button", { name: /Continuar/ }).click();
  await page.getByRole("heading", { name: "Detalles" }).waitFor();
  const rules = page.getByRole("checkbox", { name: /reglas de uso/ });
  if (await rules.count()) await rules.check();
  await page.getByRole("button", { name: /Continuar/ }).click();
  await page.getByRole("heading", { name: "Revisa y confirma" }).waitFor();
  await page.getByRole("button", { name: /Reservar ·|Enviar solicitud ·/ }).click();
  await page.waitForURL(/\/reservas\/\d+/);
  await page.getByText(/\b\d{6}\b/).first().waitFor();
  step("reserva de prueba con código");

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
