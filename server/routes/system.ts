import { Hono } from "hono";
import { getPublishedConfig } from "../cms/routes";
import { MIGRATIONS } from "../db/migrate";
import type { AppBindings } from "../env";
import { MEDIA_KEY, getImage, mediaStorage } from "../lib/media";
import { whatsappConfigured } from "../lib/whatsapp";
import { mailConfigured } from "../lib/mail";
import { ownerReady } from "../lib/owner";
import { activeProvider, payphoneConfigured } from "../lib/payments";
import { catalogPayload } from "./practitioners";

export const REVISION = "2026-10-28.v1.0-citas-pagos-cms";

export const system = new Hono<AppBindings>();

system.get("/ping", (c) => c.json({ ok: true, worker: "buscadr", databaseBinding: !!c.env.DB, pilot: true, workerRevision: REVISION }));

system.get("/health", async (c) => {
  if (!c.env.DB) return c.json({ code: "D1_BINDING_MISSING", error: "Falta el binding D1 «DB» en el Worker." }, 503);
  try {
    const table = await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='d1_migrations'").first();
    const applied = table
      ? new Set((await c.env.DB.prepare("SELECT name FROM d1_migrations").all<{ name: string }>()).results.map((r) => r.name))
      : new Set<string>();
    const missing = MIGRATIONS.map((m) => m.name).filter((n) => !applied.has(n));
    if (missing.length)
      return c.json({ code: "MIGRATIONS_PENDING", error: "Hay migraciones pendientes; se aplican automáticamente en los próximos requests.", missing }, 503);
    return c.json({
      ok: true,
      mode: "piloto-cloudflare",
      database: "d1",
      schema: "ready",
      migrations: [...applied].sort(),
      payments: activeProvider(c.env),
      payphone: payphoneConfigured(c.env),
      media: mediaStorage(c.env),
      whatsapp: whatsappConfigured(c.env),
      whatsappWebhook: !!(c.env.WHATSAPP_APP_SECRET && c.env.WHATSAPP_VERIFY_TOKEN),
      google: !!c.env.GOOGLE_CLIENT_ID,
      mail: mailConfigured(c.env),
      adminConfigured: await ownerReady(c.env.DB, c.env),
      workerRevision: REVISION,
    });
  } catch (error) {
    console.error("buscaDR health", error);
    return c.json({ code: "D1_UNAVAILABLE", error: "No fue posible consultar D1." }, 503);
  }
});

system.get("/cms/setup", async (c) =>
  c.json({ ownerConfigured: await ownerReady(c.env.DB, c.env), recoveryEmail: mailConfigured(c.env), databaseBinding: !!c.env.DB }),
);
system.get("/public/config", async (c) => c.json(await getPublishedConfig(c.env.DB)));
system.get("/catalog", (c) => c.json(catalogPayload(c.env)));

system.get("/media/:key", async (c) => {
  const key = c.req.param("key");
  if (!MEDIA_KEY.test(key)) return c.json({ error: "Imagen no encontrada" }, 404);
  // Las claves son inmutables: se cachean en el borde para no leer D1 en cada visita.
  const cache = typeof caches !== "undefined" ? (caches as unknown as { default: Cache }).default : null;
  const cacheKey = new Request(new URL(`/api/media/${key}`, c.req.url).toString());
  const hit = await cache?.match(cacheKey).catch(() => undefined);
  if (hit) return new Response(hit.body, hit);
  const image = await getImage(c.env, key);
  if (!image) return c.json({ error: "Imagen no encontrada" }, 404);
  const response = new Response(image.body, {
    headers: {
      "Content-Type": image.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
  if (cache) c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => {}));
  return response;
});
