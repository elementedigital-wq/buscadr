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
import { pro } from "./routes/pro";
import { system } from "./routes/system";
import { whatsapp } from "./routes/whatsapp";

/** Cabecera anti-CSRF que envía la web (app/lib/api.ts). Los formularios externos no pueden añadirla. */
export const CSRF_HEADER = "BUSCADR-WEB";

/** Rutas públicas que no necesitan leer la sesión. */
const NO_SESSION = new Set(["/api/ping", "/api/health", "/api/cms/setup", "/api/public/config", "/api/catalog", "/api/auth/config"]);

/** API HTTP de buscaDR (Hono). La web la consume en el mismo Worker (app/lib/api.server.ts). */
export const api = new Hono<AppBindings>().basePath("/api");

api.use("*", async (c, next) => {
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
});

api.route("/", system);
api.route("/auth", auth);
api.route("/practitioners", practitioners);
api.route("/me/favorites", favorites);
api.route("/me", me);
api.route("/pro", pro);
api.route("/appointments", appointments);
api.route("/payments", payments);
api.route("/admin", admin);
api.route("/cms", cms);
api.route("/whatsapp", whatsapp);

api.notFound((c) => c.json({ error: "Endpoint no encontrado", code: "NOT_FOUND" }, 404));

api.onError((error, c) => {
  if (error instanceof HttpError) return c.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status as 400);
  console.error("buscaDR API error", c.req.method, c.req.path, error);
  return c.json({ error: "Error interno del servicio. Inténtalo de nuevo.", code: "INTERNAL" }, 500);
});
