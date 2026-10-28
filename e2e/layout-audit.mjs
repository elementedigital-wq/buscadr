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

const PUBLIC = ["/", "/categorias", "/explorar", "/explorar?vista=fotos", "/explorar?q=retroexcavadora", "/equipo/2", "/equipo/2/reservar", "/equipo/2/reservar?paso=2&dur=1d", "/equipo/2/reservar?paso=3&dur=1d", "/como-funciona", "/cuenta", "/cuenta?tab=registro", "/alquiler/guayaquil/construccion", "/maestro", "/no-existe"];
const PRIVATE = ["/", "/reservas", "/panel", "/favoritos", "/cuenta", "/publicar"];

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
async function run(name, setup, paths) {
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => report.push(`[${name} ${w}px] error JS: ${e.message}`));
    if (setup) await setup(page);
    for (const path of paths) {
      await page.goto(base + path, { waitUntil: "networkidle" }).catch(() => {});
      await page.waitForTimeout(250);
      for (const issue of await page.evaluate(audit)) report.push(`[${name} ${w}px] ${path}: ${issue}`);
      // CMS: además de la portada del editor, cada pestaña.
      if (path === "/maestro") {
        for (const tab of await page.$$eval("[data-tab]", (els) => els.map((e) => e.getAttribute("data-tab")))) {
          await page.click(`[data-tab="${tab}"]`).catch(() => {});
          await page.waitForTimeout(300);
          for (const issue of await page.evaluate(audit)) report.push(`[${name} ${w}px] /maestro#${tab}: ${issue}`);
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

try {
  await run("visitante", null, PUBLIC);
  // Cuenta nueva de prueba.
  const email = `layout-${Date.now()}@test.ec`;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(base);
  // Cuenta nueva + una reserva de prueba sobre un anuncio de muestra (para auditar el detalle y el chat).
  const bookingId = await page.evaluate(async (e) => {
    const h = { "Content-Type": "application/json", "X-Requested-With": "BUSCADR-WEB" };
    await fetch("/api/auth/register", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ name: "Prueba Maquetación", email: e, password: "contrasena-prueba-123", role: "owner", acceptTerms: true }),
    });
    const day = new Date(Date.now() - 5 * 3_600_000 + 2 * 86_400_000).toISOString().slice(0, 10);
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ listing_id: 1, start: `${day}T09:00`, end: `${day}T18:00`, idempotency_key: crypto.randomUUID().replace(/-/g, "") }),
    }).then((r) => r.json());
    if (res.id)
      await fetch(`/api/bookings/${res.id}/messages`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({ body: "Hola, ¿puedo retirarlo a las 9:00? Es para lavar el patio y la fachada de la casa." }),
      });
    return res.id;
  }, email);
  await ctx.close();
  await run("con sesión", login(email, "contrasena-prueba-123"), [...PRIVATE, ...(bookingId ? [`/reservas/${bookingId}`] : [])]);
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) await run("propietario", login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD), ["/maestro", "/admin"]);
} finally {
  await browser.close();
}

if (report.length) {
  console.log(report.join("\n"));
  console.log(`\n✗ ${report.length} problemas de maquetación`);
  process.exitCode = 1;
} else console.log(`✓ Sin problemas de maquetación en ${WIDTHS.length} anchos`);
