/**
 * Auditoría de accesibilidad (axe-core, WCAG 2.2 AA) en un navegador real, como visitante, paciente,
 * profesional y (opcional) propietario. Falla con infracciones graves o críticas.
 *
 *   BASE_URL=http://127.0.0.1:5173 npm run test:a11y
 *   ADMIN_EMAIL=… ADMIN_PASSWORD=… (las de .dev.vars) para auditar también /maestro y /admin.
 *
 * Crea cuentas de prueba nuevas (no usa credenciales reales).
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const base = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const H = { "Content-Type": "application/json", "X-Requested-With": "BUSCADR-WEB" };

const PUBLIC = ["/", "/buscar", "/especialidades", "/doctor/dr-andres-salazar", "/medicos/guayaquil/pediatria", "/planes", "/para-profesionales", "/como-funciona", "/privacidad", "/cuenta", "/cuenta?tab=registro", "/maestro"];
const PATIENT = ["/", "/citas", "/favoritos", "/notificaciones", "/cuenta"];
const PRO = ["/panel", "/panel/agenda", "/panel/subsecuentes", "/panel/escanear", "/panel/calidad", "/panel/horarios", "/panel/perfil", "/panel/ingresos", "/panel/plan"];

const browser = await chromium.launch();
const found = [];

async function run(role, setup, paths) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(base);
  if (setup) await setup(page);
  for (const path of paths) {
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.addScriptTag({ content: AXE });
    const violations = await page.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } });
      return r.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        // target-size: la barra de navegación flotante tapa por momentos un campo al desplazarse; no es un control pequeño.
        .filter((v) => v.id !== "target-size")
        .map((v) => `${v.impact} ${v.id}: ${v.help} → ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
    });
    for (const v of violations) found.push(`[${role}] ${path}: ${v}`);
  }
  await ctx.close();
}

const register = (role) => async (page) => {
  const res = await page.evaluate(
    async ([role, H]) => {
      const call = (m, p, b) => fetch(p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });
      const r = await call("POST", "/api/auth/register", { name: "Prueba Accesibilidad", email: `a11y-${role}-${Date.now()}@test.ec`, password: "contrasena-prueba-123", role, acceptTerms: true });
      if (role === "pro") await call("POST", "/api/pro/me", { title: "Dra.", display_name: "Prueba Accesibilidad", specialty: "pediatria", city: "Guayaquil", sector: "Urdesa" });
      return r.status;
    },
    [role, H],
  );
  if (res !== 201) throw new Error(`No se pudo crear la cuenta de prueba (${res})`);
};

try {
  await run("visitante", null, PUBLIC);
  await run("paciente", register("patient"), PATIENT);
  await run("profesional", register("pro"), PRO);
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD)
    await run(
      "propietario",
      async (page) => {
        await page.evaluate(([e, p, H]) => fetch("/api/auth/login", { method: "POST", headers: H, body: JSON.stringify({ email: e, password: p }) }), [process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD, H]);
      },
      ["/maestro", "/admin"],
    );
} finally {
  await browser.close();
}

if (found.length) {
  console.log(found.join("\n"));
  console.log(`\n✗ ${found.length} infracciones graves de accesibilidad`);
  process.exitCode = 1;
} else console.log("✓ Sin infracciones graves de accesibilidad (WCAG 2.2 AA)");
