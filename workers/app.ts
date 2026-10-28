import { RouterContextProvider, createRequestHandler } from "react-router";
import { cloudflareContext } from "../app/lib/context";
import { api } from "../server/app";
import { scheduledMaintenance } from "../server/cron";
import { ensureMigrations } from "../server/db/migrate";
import type { Env } from "../server/env";

const requestHandler = createRequestHandler(() => import("virtual:react-router/server-build"), import.meta.env.MODE);

/** Cabeceras de seguridad para las páginas HTML renderizadas en el servidor. */
const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/client",
    // Google Fonts: solo si el CMS elige una familia de Google (hoja en googleapis, archivos en gstatic).
    "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style https://fonts.googleapis.com",
    // data: Vite incrusta como data URI los subconjuntos de fuente más pequeños.
    "font-src 'self' data: https://fonts.gstatic.com",
    // Imágenes del CMS: propias (/assets, /api/media) o URLs HTTPS que el propietario elija.
    "img-src 'self' data: blob: https:",
    // fonts.googleapis.com: el CMS comprueba que la familia de Google Fonts exista antes de agregarla.
    "connect-src 'self' https://accounts.google.com/gsi/ https://fonts.googleapis.com",
    // 'self': el CMS Maestro incrusta el sitio para la vista previa en vivo.
    "frame-src 'self' https://accounts.google.com/gsi/",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(self), camera=(self), microphone=(self)",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

const UPDATING_HTML = `<!doctype html><html lang="es-EC"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="2"><title>Actualizando buscaDR</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f7f7fb;color:#1c1a3a;text-align:center}</style></head><body><main><img src="/assets/buscadr-logo.png" alt="buscaDR" width="140"><h1>Estamos actualizando buscaDR</h1><p>La página se recargará en unos segundos.</p></main></body></html>`;

/**
 * Aplica migraciones pendientes tras un despliegue (ADR 0006). El request que aplica una
 * migración recibe una respuesta breve de «actualizando» para no exceder el límite de consultas.
 */
async function migrationGate(request: Request, env: Env, isApi: boolean): Promise<Response | null> {
  if (!env.DB) return null;
  try {
    const result = await ensureMigrations(env.DB);
    if (!result.appliedNow) return null;
  } catch (error) {
    console.error("buscaDR migración automática", error);
    if (isApi)
      return Response.json({ code: "MIGRATION_FAILED", error: "No se pudo actualizar la base de datos. Revisa los registros del Worker." }, { status: 503 });
    return new Response(UPDATING_HTML.replace("Estamos actualizando buscaDR", "buscaDR no está disponible por un momento"), {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  if (isApi) {
    return Response.json(
      { code: "UPDATING", error: "buscaDR se está actualizando. Reintenta en unos segundos." },
      { status: 503, headers: { "Retry-After": "2", "Cache-Control": "no-store" } },
    );
  }
  return new Response(request.method === "GET" ? UPDATING_HTML : "Actualizando", {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "2", "Cache-Control": "no-store" },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
    // /api/ping no toca la base: sirve para verificar el despliegue aunque D1 falle.
    if (url.pathname !== "/api/ping") {
      const gate = await migrationGate(request, env, isApi);
      if (gate) return gate;
    }
    if (isApi) return api.fetch(request, env, ctx);
    // Enlaces de la v0.3 (index.html con rutas #/…): se redirigen a las rutas nuevas en el navegador (app/root.tsx).
    if (url.pathname === "/index.html") return Response.redirect(new URL(`/${url.search}`, url).toString(), 301);
    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    const response = await requestHandler(request, context);
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!headers.has(k)) headers.set(k, v);
    if (url.pathname === "/maestro") {
      headers.set("Cache-Control", "no-store, private");
      headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    }
    // La vista previa del CMS Maestro carga el sitio en un iframe del mismo origen.
    if (url.searchParams.has("cms_preview")) {
      headers.set("Content-Security-Policy", (headers.get("Content-Security-Policy") ?? "").replace("frame-ancestors 'none'", "frame-ancestors 'self'"));
      headers.set("Cache-Control", "no-store");
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      ensureMigrations(env.DB)
        .then(() => scheduledMaintenance(env))
        .then((r) => console.log("buscaDR mantenimiento", JSON.stringify(r))),
    );
  },
} satisfies ExportedHandler<Env>;
