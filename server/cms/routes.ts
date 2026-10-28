import { Hono } from "hono";
import type { AppBindings, User } from "../env";
import { isAdmin } from "../lib/guards";
import { clean, fail } from "../lib/http";
import { deleteImage, mediaStorage, putImage, readFontUpload, readImageUpload } from "../lib/media";
import { type IconStyle, searchIcons } from "./icons";
import { cmsPayments } from "./payments";
import { DEFAULT_CMS, FONT_FAMILY, normalizeCms, readConfig } from "./model";

/** Solo la cuenta de administración configurada en los secretos de Cloudflare administra el CMS. */
export const isCmsOwner = isAdmin;

/** Garantiza la fila del documento CMS (las tablas las crean las migraciones). */
async function ensureSite(db: D1Database) {
  const serialized = JSON.stringify(DEFAULT_CMS);
  await db.prepare("INSERT OR IGNORE INTO cms_site(id,draft_json,published_json) VALUES('main',?,?)").bind(serialized, serialized).run();
}

/** Lectura pública, sin escrituras: si falta la fila se usan los valores por defecto. */
export async function getPublishedConfig(db: D1Database) {
  try {
    const row = await db.prepare("SELECT published_json,version FROM cms_site WHERE id='main'").first<{ published_json: string; version: number }>();
    return { config: readConfig(row?.published_json), version: row?.version ?? 0 };
  } catch {
    return { config: readConfig(null), version: 0, defaultMode: true };
  }
}

async function audit(db: D1Database, user: User, action: string, details: Record<string, unknown> = {}) {
  await db.prepare("INSERT INTO cms_audit(actor_id,action,details) VALUES(?,?,?)").bind(user.id, action, JSON.stringify(details)).run();
}

export const cms = new Hono<AppBindings>();

cms.use("*", async (c, next) => {
  if (!isCmsOwner(c.get("user"), c.env)) fail(403, "Solo la administración de buscaDR puede acceder al CMS Maestro.");
  await ensureSite(c.env.DB);
  await next();
});

cms.route("/payments", cmsPayments);

cms.get("/session", (c) => {
  const user = c.get("user")!;
  return c.json({ authorized: true, user: { name: user.name, email: user.email }, mediaEnabled: true, mediaStorage: mediaStorage(c.env) });
});

cms.get("/site", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM cms_site WHERE id='main'").first<{ draft_json: string; published_json: string; version: number }>();
  return c.json({
    draft: readConfig(row?.draft_json),
    published: readConfig(row?.published_json),
    version: row?.version ?? 0,
    mediaEnabled: true,
    mediaStorage: mediaStorage(c.env),
  });
});

cms.put("/site", async (c) => {
  if (Number(c.req.header("content-length") ?? 0) > 420_000) fail(413, "Documento demasiado grande");
  const payload = await c.req.json<{ config: unknown; expectedVersion: unknown }>();
  let config: ReturnType<typeof normalizeCms>;
  try {
    config = normalizeCms(payload.config);
  } catch (error) {
    fail(400, (error as Error).message);
  }
  const expected = Number(payload.expectedVersion);
  if (!Number.isInteger(expected) || expected < 0) fail(400, "Versión de documento inválida");
  const result = await c.env.DB.prepare("UPDATE cms_site SET draft_json=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='main' AND version=?")
    .bind(JSON.stringify(config), c.get("user")!.id, expected)
    .run();
  if (!result.meta.changes) fail(409, "Otro cambio se publicó. Actualiza el CMS antes de guardar.");
  await audit(c.env.DB, c.get("user")!, "save_draft", { version: expected });
  return c.json({ saved: true, draft: config, version: expected });
});

cms.post("/publish", async (c) => {
  const db = c.env.DB;
  const row = await db.prepare("SELECT * FROM cms_site WHERE id='main'").first<{ draft_json: string; version: number }>();
  if (!row) fail(503, "CMS no inicializado");
  const config = normalizeCms(JSON.parse(row.draft_json));
  const version = row.version + 1;
  const result = await db
    .prepare("UPDATE cms_site SET published_json=?,version=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='main' AND version=?")
    .bind(JSON.stringify(config), version, c.get("user")!.id, row.version)
    .run();
  if (!result.meta.changes) fail(409, "La publicación cambió durante el guardado. Vuelve a intentarlo.");
  await db
    .prepare("INSERT INTO cms_versions(site_id,version,config_json,actor_id) VALUES(?,?,?,?)")
    .bind("main", version, JSON.stringify(config), c.get("user")!.id)
    .run();
  await audit(db, c.get("user")!, "publish", { version });
  return c.json({ published: true, version });
});

cms.get("/history", async (c) => {
  const history = (
    await c.env.DB.prepare("SELECT id,version,actor_id,created_at FROM cms_versions WHERE site_id=? ORDER BY id DESC LIMIT 30").bind("main").all()
  ).results;
  const recent = (await c.env.DB.prepare("SELECT action,details,created_at FROM cms_audit ORDER BY id DESC LIMIT 30").all()).results;
  return c.json({ history, recent });
});

cms.post("/restore", async (c) => {
  const id = Number((await c.req.json<{ id: unknown }>()).id);
  if (!Number.isInteger(id) || id <= 0) fail(400, "Versión inválida");
  const version = await c.env.DB.prepare("SELECT * FROM cms_versions WHERE site_id=? AND id=?").bind("main", id).first<{ config_json: string }>();
  if (!version) fail(404, "Versión no encontrada");
  const normalized = normalizeCms(JSON.parse(version.config_json));
  await c.env.DB.prepare("UPDATE cms_site SET draft_json=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id='main'")
    .bind(JSON.stringify(normalized), c.get("user")!.id)
    .run();
  await audit(c.env.DB, c.get("user")!, "restore_to_draft", { historyId: id });
  return c.json({ restored: true, draft: normalized });
});

cms.get("/users", async (c) => {
  const users = (
    await c.env.DB.prepare(
      `SELECT u.id,u.name,u.email,u.role,u.city,u.staff_role,u.demo,u.created_at,COALESCE(a.enabled,1) AS enabled,
              (SELECT p.status FROM practitioners p WHERE p.user_id=u.id) AS practitioner_status,
              (SELECT COUNT(*) FROM appointments a WHERE a.patient_id=u.id) AS appointments
       FROM users u LEFT JOIN cms_user_access a ON a.user_id=u.id WHERE u.demo=0 ORDER BY u.created_at DESC LIMIT 200`,
    ).all()
  ).results;
  return c.json({ users });
});

cms.post("/users/:id/access", async (c) => {
  const id = c.req.param("id");
  const input = await c.req.json<{ enabled: unknown }>();
  const user = c.get("user")!;
  if (id === user.id) fail(403, "No puedes deshabilitar tu propia cuenta");
  if (typeof input.enabled !== "boolean") fail(400, "Estado incorrecto");
  const target = await c.env.DB.prepare("SELECT id,staff_role FROM users WHERE id=?").bind(id).first<{ staff_role: string }>();
  if (!target) fail(404, "Usuario no encontrado");
  if (target.staff_role === "admin") fail(403, "La cuenta administrativa no puede gestionarse aquí");
  await c.env.DB.prepare("INSERT INTO cms_user_access(user_id,enabled) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled")
    .bind(id, input.enabled ? 1 : 0)
    .run();
  if (!input.enabled) await c.env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(id).run();
  await audit(c.env.DB, user, "user_access", { id, enabled: input.enabled });
  return c.json({ ok: true });
});

cms.get("/reviews", async (c) => {
  const reviews = (
    await c.env.DB.prepare(
      `SELECT r.id,r.rating,r.body,r.created_at,r.hidden,a.name AS author_name,trim(p.title || ' ' || p.display_name) AS target_name
       FROM reviews r JOIN users a ON a.id=r.author_id JOIN practitioners p ON p.id=r.practitioner_id ORDER BY r.id DESC LIMIT 200`,
    ).all()
  ).results;
  return c.json({ reviews });
});

/** Ocultar una opinión no la borra: queda constancia en la auditoría (Documento Maestro §7.4). */
cms.post("/reviews/:id/visibility", async (c) => {
  const id = Number(c.req.param("id"));
  const data = await c.req.json<{ hidden: unknown }>();
  if (typeof data.hidden !== "boolean") fail(400, "Valor de moderación inválido");
  const res = await c.env.DB.prepare("UPDATE reviews SET hidden=? WHERE id=?")
    .bind(data.hidden ? 1 : 0, id)
    .run();
  if (!res.meta.changes) fail(404, "Opinión no encontrada");
  await audit(c.env.DB, c.get("user")!, "moderate_review", { id, hidden: data.hidden });
  return c.json({ ok: true });
});

/** Buscador de la librería completa de Font Awesome Free (solo propietario; carga diferida). */
cms.get("/icons", async (c) => {
  const style = (["solid", "regular", "brands"] as const).includes(c.req.query("style") as IconStyle) ? (c.req.query("style") as IconStyle) : "all";
  return c.json(await searchIcons(clean(c.req.query("q"), 60), style));
});

type MediaRow = { id: string; key: string; mime: string; bytes: number; name: string; width: number | null; height: number | null; created_at: string };

const mediaView = (x: MediaRow) => ({
  id: x.id,
  url: `/api/media/${x.key}`,
  name: x.name || x.key,
  mime: x.mime,
  bytes: x.bytes,
  width: x.width,
  height: x.height,
  created_at: x.created_at,
});

cms.get("/media", async (c) => {
  const media = (await c.env.DB.prepare("SELECT * FROM cms_media ORDER BY created_at DESC, rowid DESC LIMIT 200").all<MediaRow>()).results;
  return c.json({ enabled: true, storage: mediaStorage(c.env), media: media.map(mediaView) });
});

/**
 * Sube una imagen a la biblioteca. Sin R2 se guarda en D1 (gratis). El navegador del CMS la
 * redimensiona y comprime antes de enviarla; aquí se valida la firma real del archivo.
 */
cms.post("/media", async (c) => {
  const { data, type, ext } = await readImageUpload(c.req.raw);
  const id = crypto.randomUUID();
  const key = `${id}.${ext}`;
  const name = clean(c.req.query("name"), 120).replace(/[<>"']/g, "");
  const dim = (v: string | undefined) => (Number.isInteger(Number(v)) && Number(v) > 0 && Number(v) <= 10_000 ? Number(v) : null);
  const storage = await putImage(c.env, key, data, type);
  await c.env.DB.prepare("INSERT INTO cms_media(id,owner_id,key,mime,bytes,name,width,height,storage) VALUES(?,?,?,?,?,?,?,?,?)")
    .bind(id, c.get("user")!.id, key, type, data.length, name, dim(c.req.query("w")), dim(c.req.query("h")), storage)
    .run();
  await audit(c.env.DB, c.get("user")!, "upload_media", { id, bytes: data.length, storage });
  const row = await c.env.DB.prepare("SELECT * FROM cms_media WHERE id=?").bind(id).first<MediaRow>();
  return c.json({ id, url: `/api/media/${key}`, media: mediaView(row!) }, 201);
});

/**
 * Sube un archivo de fuente (WOFF2, WOFF, TTF u OTF) a la biblioteca. Se valida la firma real y se
 * sirve desde /api/media con caché inmutable; el tema la declara con @font-face (sin CSS libre).
 */
cms.post("/fonts", async (c) => {
  const ext = String(c.req.query("ext") ?? "").toLowerCase();
  const { data, type } = await readFontUpload(c.req.raw, ext);
  const id = crypto.randomUUID();
  const key = `${id}.${ext}`;
  const name = clean(c.req.query("name"), 120).replace(/[<>"']/g, "");
  const storage = await putImage(c.env, key, data, type);
  await c.env.DB.prepare("INSERT INTO cms_media(id,owner_id,key,mime,bytes,name,width,height,storage) VALUES(?,?,?,?,?,?,?,?,?)")
    .bind(id, c.get("user")!.id, key, type, data.length, name, null, null, storage)
    .run();
  await audit(c.env.DB, c.get("user")!, "upload_font", { id, bytes: data.length, storage });
  const row = await c.env.DB.prepare("SELECT * FROM cms_media WHERE id=?").bind(id).first<MediaRow>();
  return c.json({ id, url: `/api/media/${key}`, media: mediaView(row!) }, 201);
});

/**
 * Importa una familia de Google Fonts y la aloja en buscaDR (subconjunto «latin», que incluye
 * á, é, í, ó, ú, ñ, ü, ¿ y ¡): los visitantes no se conectan a Google (privacidad, LOPDP).
 */
cms.post("/fonts/google", async (c) => {
  const family = clean((await c.req.json<{ family?: unknown }>()).family, 40).replace(/\s+/g, " ");
  if (!FONT_FAMILY.test(family)) fail(400, "Escribe el nombre exacto de la familia, por ejemplo «Poppins» u «Open Sans».");
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
  const param = encodeURIComponent(family).replace(/%20/g, "+");
  let css = "";
  for (const weights of [":wght@400;500;600;700;800", ":wght@400;600;700", ":wght@400;700", ""]) {
    const res = await fetch(`https://fonts.googleapis.com/css2?family=${param}${weights}&display=swap`, { headers: { "User-Agent": UA } }).catch(() => null);
    if (res?.ok) {
      css = await res.text();
      break;
    }
  }
  if (!css) fail(404, `No encontramos «${family}» en Google Fonts. Revisa el nombre en fonts.google.com.`);
  const blocks = [...css.matchAll(/(?:\/\*\s*([\w-]+)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/g)];
  const byUrl = new Map<string, number[]>();
  for (const [, subset, body] of blocks) {
    if (subset && subset !== "latin") continue;
    if (/font-style:\s*italic/.test(body)) continue;
    const src = /src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)\s]+)\)\s*format\('woff2'\)/.exec(body)?.[1];
    if (!src) continue;
    const weights = (/font-weight:\s*([\d ]+);/.exec(body)?.[1] ?? "400").trim().split(/\s+/).map(Number);
    byUrl.set(src, [...(byUrl.get(src) ?? []), ...weights]);
  }
  if (!byUrl.size) fail(422, `Google Fonts no devolvió archivos utilizables para «${family}».`);
  const files: { url: string; weight: number; style: "normal" }[] = [];
  for (const [src, weights] of [...byUrl].slice(0, 6)) {
    const res = await fetch(src, { headers: { "User-Agent": UA } }).catch(() => null);
    if (!res?.ok) fail(502, "No se pudo descargar la fuente desde Google Fonts. Inténtalo de nuevo.");
    const data = new Uint8Array(await res.arrayBuffer());
    if (data.length > 3 * 1024 * 1024 || String.fromCharCode(...data.slice(0, 4)) !== "wOF2") fail(422, "Google Fonts devolvió un archivo de fuente inválido.");
    const id = crypto.randomUUID();
    const key = `${id}.woff2`;
    const storage = await putImage(c.env, key, data, "font/woff2");
    await c.env.DB.prepare("INSERT INTO cms_media(id,owner_id,key,mime,bytes,name,storage) VALUES(?,?,?,?,?,?,?)")
      .bind(id, c.get("user")!.id, key, "font/woff2", data.length, `Fuente ${family} ${Math.min(...weights)}`, storage)
      .run();
    // Una fuente variable cubre varios pesos con un archivo: se registra con el peso base.
    for (const w of [...new Set(weights)].slice(0, 1)) files.push({ url: `/api/media/${key}`, weight: w, style: "normal" });
  }
  await audit(c.env.DB, c.get("user")!, "import_google_font", { family, files: files.length });
  return c.json({ family, source: "google", weights: "", files }, 201);
});

/**
 * Elimina una imagen de la biblioteca. Si el borrador o la versión publicada la usan, responde 409
 * con los lugares donde aparece (para no dejar imágenes rotas); `?force=1` la elimina igualmente.
 */
cms.delete("/media/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^[0-9a-f-]{36}$/.test(id)) fail(400, "Identificador inválido");
  const row = await c.env.DB.prepare("SELECT key FROM cms_media WHERE id=?").bind(id).first<{ key: string }>();
  if (!row) fail(404, "Imagen no encontrada");
  if (c.req.query("force") !== "1") {
    const site = await c.env.DB.prepare("SELECT draft_json,published_json FROM cms_site WHERE id='main'").first<{
      draft_json: string;
      published_json: string;
    }>();
    const url = `/api/media/${row.key}`;
    const usedIn = [site?.draft_json.includes(url) && "borrador", site?.published_json.includes(url) && "sitio publicado"].filter(Boolean);
    if (usedIn.length) fail(409, `La imagen se usa en: ${usedIn.join(" y ")}. Reemplázala antes de eliminarla.`, "MEDIA_IN_USE");
  }
  await deleteImage(c.env, row.key);
  await c.env.DB.prepare("DELETE FROM cms_media WHERE id=?").bind(id).run();
  await audit(c.env.DB, c.get("user")!, "delete_media", { id });
  return c.json({ ok: true });
});
