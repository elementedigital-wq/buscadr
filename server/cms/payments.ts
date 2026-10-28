/**
 * CMS · Pasarelas de pago (ADR 0013): equivalente a «WooCommerce → Ajustes → Pagos». Solo el
 * propietario. Las credenciales se reciben una vez, se guardan CIFRADAS (BUSCADR_SECRETS_KEY) y nunca
 * se devuelven: el CMS solo ve «configurada ••••1234» y su origen (CMS o Cloudflare).
 */
import { Hono } from "hono";
import type { AppBindings, Env } from "../env";
import { CARD_ONLY_REASON, GATEWAY_MAP, adminView, getGateways, isGatewayId } from "../lib/gateways";
import { isAdmin, readJson } from "../lib/guards";
import { clean, fail } from "../lib/http";
import { decryptJson, encryptJson, secretsKeyConfigured } from "../lib/secrets";
import { getPayoutSettings, savePayoutSettings } from "../lib/settings";

export const cmsPayments = new Hono<AppBindings>();

cmsPayments.use("*", async (c, next) => {
  if (!isAdmin(c.get("user"), c.env)) fail(403, "Solo la administración de buscaDR puede configurar los pagos.");
  await next();
});

const audit = (db: D1Database, actor: string, action: string, details: Record<string, unknown>) =>
  db.prepare("INSERT INTO cms_audit(actor_id,action,details) VALUES(?,?,?)").bind(actor, action, JSON.stringify(details));

/** Vista del CMS: medios, ajustes de comisión y liquidación. */
const view = async (env: Env) => {
  const [v, settings] = await Promise.all([adminView(env), getPayoutSettings(env)]);
  return { ...v, settings, fee_bps: settings.fee_bps };
};

cmsPayments.get("/", async (c) => c.json(await view(c.env)));

/** Comisión de buscaDR, días de retención y monto mínimo de liquidación (ADR 0016). */
cmsPayments.put("/settings", async (c) => {
  const b = await readJson<{ fee_bps?: unknown; release_days?: unknown; min_payout_cents?: unknown }>(c);
  const user = c.get("user")!;
  const { error } = await savePayoutSettings(c.env, user.id, b);
  if (error === "fee_bps") fail(400, "La comisión va de 0 % a 30 %.");
  if (error === "release_days") fail(400, "Los días de retención van de 0 a 30.");
  if (error === "min_payout_cents") fail(400, "El monto mínimo va de $0 a $1.000.");
  await audit(c.env.DB, user.id, "payout_settings", { fee_bps: b.fee_bps, release_days: b.release_days, min_payout_cents: b.min_payout_cents }).run();
  return c.json({ ...(await view(c.env)), message: "Ajustes de cobro guardados." });
});

cmsPayments.put("/:id", async (c) => {
  const id = c.req.param("id");
  if (!isGatewayId(id)) fail(404, "Pasarela no encontrada");
  const def = GATEWAY_MAP.get(id)!;
  const db = c.env.DB;
  const user = c.get("user")!;
  const b = await readJson<{
    enabled?: boolean;
    title?: string;
    description?: string;
    settings?: Record<string, unknown>;
    secrets?: Record<string, string | null>;
    confirm_live?: boolean;
  }>(c);
  if (b.enabled === true && !def.card) fail(409, CARD_ONLY_REASON, "CARD_ONLY");
  const row = await db
    .prepare("SELECT * FROM payment_gateways WHERE id=?")
    .bind(id)
    .first<{ enabled: number; title: string; description: string; settings_json: string; secrets_enc: string }>();

  // Datos visibles (cuenta bancaria, instrucciones): solo los campos definidos, saneados.
  let settings: Record<string, string> = {};
  try {
    settings = JSON.parse(row?.settings_json || "{}");
  } catch {}
  if (b.settings && typeof b.settings === "object") {
    for (const f of def.fields) {
      if (!(f.key in b.settings)) continue;
      const v = clean(b.settings[f.key], f.max);
      if (f.options && v && !f.options.includes(v)) fail(400, `${f.label}: elige una opción de la lista`);
      settings[f.key] = v;
    }
  }

  // Credenciales: vacío = sin cambios; null = borrar; texto = reemplazar (cifrado).
  let secretsEnc = row?.secrets_enc ?? "";
  const changedSecrets: string[] = [];
  if (b.secrets && typeof b.secrets === "object") {
    const current = await decryptJson(c.env, secretsEnc);
    for (const s of def.secrets) {
      if (!(s.key in b.secrets)) continue;
      const v = b.secrets[s.key];
      if (v === null) {
        delete current[s.key];
        changedSecrets.push(s.key);
      } else if (typeof v === "string" && v.trim()) {
        if (!secretsKeyConfigured(c.env))
          fail(409, "Para guardar credenciales en el CMS, crea primero el secreto BUSCADR_SECRETS_KEY en Cloudflare (32+ caracteres).", "SECRETS_KEY_MISSING");
        current[s.key] = v.trim().slice(0, 500);
        changedSecrets.push(s.key);
      }
    }
    if (changedSecrets.length) secretsEnc = Object.keys(current).length ? await encryptJson(c.env, current) : "";
  }

  const title = b.title === undefined ? (row?.title ?? "") : clean(b.title, 80);
  const description = b.description === undefined ? (row?.description ?? "") : clean(b.description, 300);
  const enabled = b.enabled === undefined ? !!row?.enabled : !!b.enabled;
  await db
    .prepare(
      `INSERT INTO payment_gateways(id,enabled,sort,title,description,settings_json,secrets_enc,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,settings_json=excluded.settings_json,secrets_enc=excluded.secrets_enc,
       updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`,
    )
    .bind(id, row?.enabled ?? 0, [...GATEWAY_MAP.keys()].indexOf(id), title, description, JSON.stringify(settings), secretsEnc, user.id)
    .run();

  // Activar: solo con datos completos; las que mueven dinero real piden confirmación expresa.
  if (enabled !== !!row?.enabled) {
    if (!enabled && def.card) {
      const others = (await getGateways(c.env)).filter((g) => g.card && g.active && g.id !== id);
      if (!others.length) fail(409, "Debe quedar al menos un medio con tarjeta activo: sin él nadie podría reservar ni pagar su plan.", "LAST_CARD_GATEWAY");
    }
    if (enabled) {
      const g = (await getGateways(c.env)).find((x) => x.id === id)!;
      if (g.missing.length) fail(400, `Para activar ${def.name} completa: ${g.missing.join(", ")}.`, "GATEWAY_INCOMPLETE");
      if (def.live && b.confirm_live !== true)
        fail(409, `${def.name} cobra dinero real. Confirma que buscaDR aprobó el Go/No-Go del Documento Maestro para activarla.`, "CONFIRM_LIVE");
    }
    await db
      .prepare("UPDATE payment_gateways SET enabled=? WHERE id=?")
      .bind(enabled ? 1 : 0, id)
      .run();
  }
  // La auditoría registra qué cambió, nunca los valores de las credenciales.
  await audit(db, user.id, "payment_gateway", { id, enabled, fields: Object.keys(b.settings ?? {}), secrets: changedSecrets }).run();
  return c.json({ ...(await view(c.env)), message: "Medio de pago guardado." });
});

/** Orden en que el paciente ve los medios (el primero activo es el predeterminado). */
cmsPayments.post("/order", async (c) => {
  const ids = (await readJson<{ ids?: unknown }>(c)).ids;
  if (!Array.isArray(ids) || !ids.every(isGatewayId) || new Set(ids).size !== ids.length) fail(400, "Orden inválido");
  const db = c.env.DB;
  await db.batch(
    ids.map((id, i) => db.prepare("INSERT INTO payment_gateways(id,sort) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET sort=excluded.sort").bind(id, i)),
  );
  await audit(db, c.get("user")!.id, "payment_gateway_order", { ids }).run();
  return c.json(await view(c.env));
});
