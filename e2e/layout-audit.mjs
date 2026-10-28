/**
 * Auditoría de maquetación (Playwright): recorre las páginas en varios anchos (móvil, tableta y
 * escritorio) y falla si encuentra:
 *  - desplazamiento horizontal de la página;
 *  - texto que se sale de su botón, chip, campo o tarjeta;
 *  - elementos que pasan el borde de la pantalla (fuera de filas con scroll horizontal);
 *  - botones o chips con texto y sin relleno horizontal.
 *
 *   BASE_URL=http://127.0.0.1:5173 npm run test:layout
 *
 * Crea cuentas de prueba nuevas (no usa credenciales reales). Para auditar el CMS define
 * ADMIN_EMAIL y ADMIN_PASSWORD (las de .dev.vars en local).
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const base = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const WIDTHS = (process.env.WIDTHS ?? "320,375,390,414,768,1024,1280,1440").split(",").map(Number);

const PUBLIC = [
  "/",
  "/buscar",
  "/buscar?modalidad=virtual&orden=precio",
  "/buscar?vista=mapa",
  "/buscar?q=xyz-sin-resultados",
  "/especialidades",
  "/doctor/dr-andres-salazar",
  "/doctor/clinica-del-parque",
  "/medicos/guayaquil/pediatria",
  "/planes",
  "/para-profesionales",
  "/como-funciona",
  "/privacidad",
  "/cuenta",
  "/cuenta?tab=registro&rol=profesional",
  "/maestro",
  "/no-existe",
];
const PATIENT = ["/", "/citas", "/favoritos", "/notificaciones", "/cuenta", "/doctor/dr-andres-salazar"];
const PRO = ["/panel", "/panel/agenda", "/panel/subsecuentes", "/panel/escanear", "/panel/calidad", "/panel/horarios", "/panel/perfil", "/panel/ingresos", "/panel/plan"];

/** Corre en la página: devuelve problemas de maquetación visibles. */
function audit() {
  const vw = document.documentElement.clientWidth;
  const issues = [];
  const label = (el) => {
    const cls = typeof el.className === "string" ? el.className.split(/\s+/).slice(0, 3).join(".") : "";
    const text = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""} «${text}»`;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none" && !el.closest(".sr-only,[aria-hidden='true']");
  };
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true;
    }
    return false;
  };
  /** ¿Algún texto visible del control queda fuera de su caja? Ignora texto solo para lectores y texto recortado a propósito. */
  const textOutside = (el, r) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue;
      let skip = false;
      for (let p = node.parentElement; p && p !== el.parentElement; p = p.parentElement) {
        const ps = getComputedStyle(p);
        if (p.classList.contains("sr-only") || (p !== el && ["hidden", "clip"].includes(ps.overflowX)) || ps.textOverflow === "ellipsis") {
          skip = true;
          break;
        }
      }
      if (skip) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const t of range.getClientRects()) {
        if (t.width < 1) continue;
        if (t.right > r.right + 1.5 || t.left < r.left - 1.5 || t.bottom > r.bottom + 1.5 || t.top < r.top - 1.5) return true;
      }
    }
    return false;
  };
  // 5. Texto aplastado: una columna flexible que quedó tan angosta que el texto se parte en sílabas
  //    o palabras sueltas (p. ej. un nombre reducido a «I» junto a insignias que no se encogen).
  for (const el of document.querySelectorAll("p, h1, h2, h3, h4, dd, dt, li, a, strong, span")) {
    if (!visible(el) || el.closest("svg, [aria-hidden='true'], .sr-only")) continue;
    const text = (el.innerText || "").trim();
    if (text.length < 8 || el.children.length > 3) continue;
    const st = getComputedStyle(el);
    const fs = Number.parseFloat(st.fontSize) || 16;
    const lh = Number.parseFloat(st.lineHeight) || fs * 1.4;
    const r = el.getBoundingClientRect();
    const longest = Math.max(...text.split(/\s+/).map((w) => w.length));
    if (r.width < Math.min(longest, 6) * fs * 0.5 && r.height > lh * 1.8) issues.push(`texto aplastado (${Math.round(r.width)}px): ${label(el)}`);
    else if (st.textOverflow === "ellipsis" && r.width < fs * 2.5) issues.push(`texto recortado casi por completo (${Math.round(r.width)}px): ${label(el)}`);
  }
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`la página se desplaza en horizontal (${document.documentElement.scrollWidth}px > ${vw}px)`);

  const controls = document.querySelectorAll("button, a, input, select, textarea, label, .chip, [class*='btn'], [class*='card']");
  for (const el of controls) {
    if (!visible(el)) continue;
    const st = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    // 1. Fuera de la pantalla (salvo dentro de contenedores con scroll o recorte).
    if ((r.right > vw + 1 || r.left < -1) && !clipped(el) && st.position !== "fixed") issues.push(`sale de la pantalla: ${label(el)} (${Math.round(r.left)}→${Math.round(r.right)})`);
    // 2. Contenido más ancho que la caja, sin recorte intencional (ellipsis/overflow hidden).
    const intentional = ["hidden", "clip", "auto", "scroll"].includes(st.overflowX) || st.textOverflow === "ellipsis";
    if (!intentional && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && !["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName))
      issues.push(`el contenido desborda: ${label(el)} (${el.scrollWidth}px > ${el.clientWidth}px)`);
    // 3. Texto fuera del borde (botones, chips y enlaces con forma de botón).
    const shaped = el.matches("button, .chip, [class*='btn']") || (st.backgroundColor !== "rgba(0, 0, 0, 0)" && el.matches("a"));
    if (shaped && !intentional) {
      if (textOutside(el, r)) issues.push(`texto fuera del borde: ${label(el)}`);
      // 4. Sin relleno: el texto toca el borde de un control con fondo o borde visible.
      const hasBox = st.backgroundColor !== "rgba(0, 0, 0, 0)" || Number.parseFloat(st.borderLeftWidth) > 0 || st.boxShadow !== "none";
      const text = (el.innerText || "").trim();
      if (hasBox && text.length > 1 && r.width > 40 && Number.parseFloat(st.paddingLeft) < 4 && Number.parseFloat(st.paddingRight) < 4 && el.children.length === 0)
        issues.push(`sin relleno: ${label(el)}`);
    }
  }
  return [...new Set(issues)];
}

const browser = await chromium.launch();
const report = [];
/** Ejecuta la auditoría; si la página navega a mitad (redirección o recarga), espera y reintenta una vez. */
async function auditPage(page) {
  try {
    return await page.evaluate(audit);
  } catch {
    await page.waitForLoadState("networkidle").catch(() => {});
    return page.evaluate(audit);
  }
}
async function run(name, setup, paths) {
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => report.push(`[${name} ${w}px] error JS: ${e.message}`));
    if (setup) await setup(page);
    for (const path of paths) {
      await page.goto(base + path, { waitUntil: "networkidle" }).catch(() => {});
      await page.waitForTimeout(250);
      for (const issue of await auditPage(page)) report.push(`[${name} ${w}px] ${path}: ${issue}`);
      // Administración: cada pestaña (KPIs, transacciones, liquidaciones…).
      if (path === "/admin") {
        const tabs = await page.$$("[role=tab]");
        for (let i = 0; i < tabs.length; i++) {
          await (await page.$$("[role=tab]"))[i]?.click().catch(() => {});
          await page.waitForTimeout(400);
          for (const issue of await auditPage(page)) report.push(`[${name} ${w}px] /admin#${i}: ${issue}`);
        }
      }
      // CMS: además de la portada del editor, cada pestaña.
      if (path === "/maestro") {
        for (const tab of await page.$$eval("[data-tab]", (els) => els.map((e) => e.getAttribute("data-tab")))) {
          await page.click(`[data-tab="${tab}"]`).catch(() => {});
          await page.waitForTimeout(300);
          for (const issue of await auditPage(page)) report.push(`[${name} ${w}px] /maestro#${tab}: ${issue}`);
        }
      }
    }
    await ctx.close();
  }
}

const login = (email, password) => async (page) => {
  await page.goto(base);
  const status = await page.evaluate(
    async ([e, p]) =>
      (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "BUSCADR-WEB" }, body: JSON.stringify({ email: e, password: p }) })).status,
    [email, password],
  );
  if (status !== 200) throw new Error(`No se pudo iniciar sesión con ${email} (${status})`);
};

/** Llamadas a la API desde el navegador (cookie de sesión + cabecera CSRF). */
async function setupAccounts() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(base);
  const stamp = Date.now();
  const out = await page.evaluate(async ([stamp, admin]) => {
    const h = { "Content-Type": "application/json", "X-Requested-With": "BUSCADR-WEB" };
    const call = (method, path, body) => fetch(path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
    const weekday = (minDays, hour) => {
      for (let i = minDays; i < minDays + 10; i++) {
        const d = new Date(Date.now() - 5 * 3_600_000 + i * 86_400_000);
        if (d.getUTCDay() >= 1 && d.getUTCDay() <= 5) return `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00`;
      }
    };
    const key = () => crypto.randomUUID().replace(/-/g, "");
    // Profesional con perfil en borrador (panel completo).
    const pro = `layout-pro-${stamp}@test.ec`;
    await call("POST", "/api/auth/register", { name: "Dra. Prueba Maquetación", email: pro, password: "contrasena-prueba-123", role: "pro", acceptTerms: true, phone: "0991234567", whatsapp_opt_in: true });
    const created = await call("POST", "/api/pro/me", { title: "Dra.", display_name: "Prueba Maquetación Con Un Nombre Bastante Largo", specialty: "pediatria", city: "Guayaquil", sector: "Urdesa" });
    await call("PATCH", "/api/pro/me", { bio: "Pediatra con experiencia.", license_number: "ACESS-000000", price_in_person_cents: 4000, price_virtual_cents: 3000, virtual_enabled: true, address: "Av. Principal 123" });
    await call("POST", "/api/pro/me/submit");
    await call("POST", "/api/auth/logout");
    // Con credenciales del propietario se publica el perfil de prueba para auditar el panel con solicitudes reales.
    const proId = created?.practitioner?.id;
    if (admin.email && admin.password && proId) {
      await call("POST", "/api/auth/login", admin);
      await call("POST", `/api/admin/practitioners/${proId}/review`, { decision: "approve" });
      await call("POST", "/api/auth/logout");
    }
    const card = { number: "4111 1111 1111 1111", exp: "12/30", cvv: "123", name: "Maria Villavicencio" };
    const pay = (checkout) => (checkout?.startsWith("/pagar/") ? call("POST", `/api/payments/${checkout.split("/").pop()}/sandbox`, card) : null);
    // Paciente con una cita presencial pagada (perfil de muestra: se confirma sola) y una virtual con pago pendiente.
    const patient = `layout-pac-${stamp}@test.ec`;
    await call("POST", "/api/auth/register", { name: "María Fernanda Villavicencio Altamirano", email: patient, password: "contrasena-prueba-123", role: "patient", acceptTerms: true });
    const a = await call("POST", "/api/appointments", { practitioner_id: 4, start: weekday(2, 10), modality: "presencial", idempotency_key: key(), reason: "Control general y revisión de exámenes de laboratorio recientes." });
    await pay(a.checkout);
    if (a.id) await call("POST", `/api/appointments/${a.id}/messages`, { body: "Hola doctor, ¿debo llevar los exámenes impresos o basta con el PDF en el celular?" });
    const v = await call("POST", "/api/appointments", { practitioner_id: 4, start: weekday(3, 16), modality: "virtual", idempotency_key: key() });
    await call("PUT", "/api/me/favorites/4");
    let proAppointment = null;
    const plans = [];
    if (admin.email && proId) {
      const booked = await call("POST", "/api/appointments", { practitioner_id: proId, start: weekday(2, 11), modality: "presencial", idempotency_key: key(), reason: "Control de niño sano" });
      proAppointment = booked.id;
      await pay(booked.checkout);
      await call("POST", "/api/appointments", { practitioner_id: proId, start: weekday(3, 9), modality: "presencial", idempotency_key: key() });
      // El profesional confirma y programa dos series de citas subsecuentes (una se acepta, otra queda propuesta).
      await call("POST", "/api/auth/logout");
      await call("POST", "/api/auth/login", { email: pro, password: "contrasena-prueba-123" });
      await call("POST", `/api/appointments/${proAppointment}/actions/confirm`);
      for (const [first, days, n, price, title] of [
        [weekday(6, 9), 7, 4, 3500, "Control de crecimiento y desarrollo con nombre extenso"],
        [weekday(9, 15), 30, 6, 0, "Control mensual"],
      ]) {
        const r = await call("POST", "/api/pro/followups", { patient_ref: proAppointment, title, note: "Traer el carné de vacunas.", modality: "presencial", interval_days: days, first_start: first, sessions: n, price_cents: price });
        if (r.id) plans.push(r.id);
      }
      await call("POST", "/api/auth/logout");
      await call("POST", "/api/auth/login", { email: patient, password: "contrasena-prueba-123" });
      if (plans[0]) await call("POST", `/api/followups/${plans[0]}/accept`);
    }
    return { pro, patient, appointment: a.id, virtual: v.id, checkout: v.checkout, proAppointment, plans };
  }, [stamp, { email: process.env.ADMIN_EMAIL ?? "", password: process.env.ADMIN_PASSWORD ?? "" }]);
  await ctx.close();
  return out;
}

try {
  await run("visitante", null, PUBLIC);
  const acc = await setupAccounts();
  await run("paciente", login(acc.patient, "contrasena-prueba-123"), [
    ...PATIENT,
    ...(acc.appointment ? [`/citas/${acc.appointment}`] : []),
    ...(acc.virtual ? [`/citas/${acc.virtual}`] : []),
    ...(acc.checkout?.startsWith("/") ? [acc.checkout] : []),
    ...acc.plans.map((id) => `/seguimientos/${id}`),
  ]);
  await run("profesional", login(acc.pro, "contrasena-prueba-123"), [
    ...PRO,
    ...(acc.proAppointment ? [`/panel/citas/${acc.proAppointment}`, `/panel/subsecuentes?cita=${acc.proAppointment}`] : []),
  ]);
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) await run("propietario", login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD), ["/maestro", "/admin"]);
} finally {
  await browser.close();
}

if (report.length) {
  console.log(report.join("\n"));
  console.log(`\n✗ ${report.length} problemas de maquetación`);
  process.exitCode = 1;
} else console.log(`✓ Sin problemas de maquetación en ${WIDTHS.length} anchos`);
