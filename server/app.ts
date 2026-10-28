import { Hono } from "hono";
import { cms } from "./cms/routes";
import type { AppBindings } from "./env";
import { HttpError } from "./lib/http";
import { userFromCookie } from "./lib/session";
import { admin } from "./routes/admin";
import { appointments } from "./routes/appointments";
import { auth } from "./routes/auth";
import { me } from "./routes/me";
import { payments } from "./routes/payments";
import { favorites, practitioners } from "./routes/practitioners";
import { followups, proFollowups } from "./routes/followups";
import { proPayouts } from "./routes/payouts";
import { pro } from "./routes/pro";
import { system } from "./routes/system";
import { trace } from "./routes/trace";
import { whatsapp } from "./routes/whatsapp";

/** Cabecera anti-CSRF que envía la web (app/lib/api.ts). Los formularios externos no pueden añadirla. */
export const CSRF_HEADER = "BUSCADR-WEB";

/** Rutas públicas que no necesitan leer la sesión. */
const NO_SESSION = new Set(["/api/ping", "/api/health", "/api/cms/setup", "/api/public/config", "/api/catalog", "/api/auth/config"]);

/** API HTTP de buscaDR (Hono). La web la consume en el mismo Worker (app/lib/api.server.ts). */
export const api = new Hono<AppBindings>().basePath("/api");

api.use("*", async (c, next) => {
  // Identificador de la solicitud (el de Cloudflare si existe): va en la respuesta y en los registros,
  // para encontrar en los logs el error exacto que reporta una persona.
  const started = Date.now();
  c.set("requestId", c.req.header("cf-ray")?.split("-")[0] ?? crypto.randomUUID().slice(0, 16));
  c.set("ip", c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local");
  const path = c.req.path;
  const webhook = path === "/api/whatsapp/webhook";
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) && !webhook) {
    // Protección CSRF: mismo origen + cabecera personalizada.
    const origin = c.req.header("origin");
    if (origin && origin !== new URL(c.req.url).origin) throw new HttpError(403, "Origen no permitido", "BAD_ORIGIN");
    if (c.req.header("x-requested-with") !== CSRF_HEADER) throw new HttpError(403, "Solicitud sin protección de origen", "CSRF");
  }
  const needsUser = !NO_SESSION.has(path) && !path.startsWith("/api/media/") && !webhook;
  c.set("user", needsUser && c.env.DB ? await userFromCookie(c.env.DB, c.req.header("cookie") ?? null) : null);
  await next();
  c.header("Cache-Control", c.res.headers.get("Cache-Control") ?? "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Request-Id", c.get("requestId"));
  c.header("Server-Timing", `app;dur=${Date.now() - started}`);
});

api.route("/", system);
api.route("/auth", auth);
api.route("/practitioners", practitioners);
api.route("/me/favorites", favorites);
api.route("/me", me);
api.route("/pro/payouts", proPayouts);
api.route("/pro/followups", proFollowups);
api.route("/pro", pro);
api.route("/appointments", appointments);
api.route("/payments", payments);
api.route("/admin", admin);
api.route("/cms", cms);
api.route("/whatsapp", whatsapp);
api.route("/trace", trace);
api.route("/followups", followups);

api.notFound((c) => c.json({ error: "Endpoint no encontrado", code: "NOT_FOUND", request_id: c.get("requestId") }, 404));

api.onError((error, c) => {
  const requestId = c.get("requestId") ?? "";
  c.header("X-Request-Id", requestId);
  if (error instanceof HttpError) {
    if (error.retryAfter) c.header("Retry-After", String(error.retryAfter));
    return c.json({ error: error.message, ...(error.code ? { code: error.code } : {}), request_id: requestId }, error.status as 400);
  }
  // Registro estructurado (Workers Logs): sin cuerpo de la solicitud ni datos personales.
  console.error(
    JSON.stringify({
      event: "buscadr_api_error",
      request_id: requestId,
      method: c.req.method,
      path: c.req.path,
      message: String((error as Error)?.message ?? error),
    }),
  );
  return c.json({ error: `Error interno del servicio. Inténtalo de nuevo (código ${requestId}).`, code: "INTERNAL", request_id: requestId }, 500);
});
