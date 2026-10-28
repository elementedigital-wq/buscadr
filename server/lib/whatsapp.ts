/**
 * WhatsApp Business Platform (Cloud API). Diseño (docs/WHATSAPP.md):
 * - WhatsApp conecta a cada persona con buscaDR, nunca a las partes entre sí antes de confirmar
 *   (anti-desintermediación, Documento Maestro §04).
 * - Solo se envían mensajes a quien dio su consentimiento (opt-in registrado) y con número válido.
 * - Fuera de la ventana de 24 h, Meta exige plantillas aprobadas: si están configuradas
 *   (WHATSAPP_TEMPLATE_*), se usan; si no, se envía un mensaje interactivo (válido en ventana).
 * - Sin credenciales todo queda en enlaces wa.me y en el registro `notification_log`.
 */
import type { Env } from "../env";
import { hmacHex, timingSafeEqualText } from "./crypto";

const GRAPH = "https://graph.facebook.com/v21.0";

/** Normaliza un número ecuatoriano a formato internacional sin «+» (0991234567 → 593991234567). */
export function toE164Ecuador(phone: string | null | undefined) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (/^5939\d{8}$/.test(digits)) return digits;
  if (/^09\d{8}$/.test(digits)) return `593${digits.slice(1)}`;
  if (/^9\d{8}$/.test(digits)) return `593${digits}`;
  return null;
}

/** Enlace wa.me: no requiere cuenta empresarial y el usuario decide si envía el mensaje. */
export function whatsappLink(phone: string | null | undefined, text: string) {
  const to = toE164Ecuador(phone);
  return `${to ? `https://wa.me/${to}` : "https://wa.me/"}?text=${encodeURIComponent(text)}`;
}

export const whatsappConfigured = (env: Env) => !!(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_ID);

type Button = { id: string; title: string };
export type Outgoing =
  | { kind: "text"; body: string }
  | { kind: "buttons"; body: string; buttons: Button[] }
  | { kind: "template"; name: string; params: string[]; buttonPayloads?: string[] };

export function buildPayload(to: string, msg: Outgoing) {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to };
  if (msg.kind === "text") return { ...base, type: "text", text: { preview_url: true, body: msg.body.slice(0, 4000) } };
  if (msg.kind === "buttons")
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: msg.body.slice(0, 1000) },
        action: { buttons: msg.buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) } })) },
      },
    };
  return {
    ...base,
    type: "template",
    template: {
      name: msg.name,
      language: { code: "es" },
      components: [
        { type: "body", parameters: msg.params.map((text) => ({ type: "text", text: text.slice(0, 900) })) },
        ...(msg.buttonPayloads ?? []).map((payload, index) => ({
          type: "button",
          sub_type: "quick_reply",
          index: String(index),
          parameters: [{ type: "payload", payload }],
        })),
      ],
    },
  };
}

export async function sendWhatsApp(env: Env, to: string, msg: Outgoing, fetchFn: typeof fetch = fetch) {
  if (!whatsappConfigured(env)) return "skipped_not_configured";
  try {
    const res = await fetchFn(`${GRAPH}/${env.WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(to, msg)),
      signal: AbortSignal.timeout(6000),
    });
    return res.ok ? "sent" : `error_${res.status}`;
  } catch {
    return "error_network";
  }
}

type Recipient = { id: string; phone: string; whatsapp_opt_in?: number };

/**
 * Plantilla genérica de actualización (`WHATSAPP_TEMPLATE_UPDATE`, un parámetro de cuerpo) para avisos
 * de texto: permite escribir fuera de la ventana de 24 h de Meta. Meta no admite saltos de línea en parámetros.
 */
function updateTemplate(env: Env, msg: Outgoing): Outgoing | undefined {
  if (!env.WHATSAPP_TEMPLATE_UPDATE || msg.kind !== "text") return undefined;
  return { kind: "template", name: env.WHATSAPP_TEMPLATE_UPDATE, params: [msg.body.replace(/\s+/g, " ").trim().slice(0, 900)] };
}

/**
 * Aviso a un usuario con consentimiento. Orden: `template` específica si está configurada; si no, la
 * plantilla genérica de actualización para textos; si no, `fallback` (interactivo o texto, válido en ventana).
 * Siempre queda registro en notification_log.
 */
export async function notifyUser(env: Env, user: Recipient, kind: string, opts: { template?: Outgoing; fallback: Outgoing; ref?: string }) {
  const to = toE164Ecuador(user.phone);
  let status = "skipped_no_consent";
  if (user.whatsapp_opt_in && to) status = await sendWhatsApp(env, to, opts.template ?? updateTemplate(env, opts.fallback) ?? opts.fallback);
  else if (!to) status = "skipped_no_phone";
  await env.DB.prepare("INSERT INTO notification_log(user_id,channel,template,status,ref) VALUES(?,?,?,?,?)")
    .bind(user.id, "whatsapp", kind, status, opts.ref ?? null)
    .run();
  return status;
}

/** Verifica `X-Hub-Signature-256: sha256=<hmac>` con el App Secret de Meta. */
export async function verifySignature(secret: string | undefined, rawBody: string, header: string | null | undefined) {
  if (!secret || !header?.startsWith("sha256=")) return false;
  return timingSafeEqualText(await hmacHex(secret, rawBody), header.slice(7));
}

export type Inbound = { id: string; from: string; type: string; text?: string; buttonId?: string; imageId?: string; mime?: string; caption?: string };

/** Extrae los mensajes entrantes del webhook (texto, botones, plantillas con quick reply e imágenes). */
export function parseInbound(body: any): Inbound[] {
  const out: Inbound[] = [];
  for (const entry of Array.isArray(body?.entry) ? body.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      for (const m of Array.isArray(change?.value?.messages) ? change.value.messages : []) {
        if (typeof m?.id !== "string" || typeof m?.from !== "string") continue;
        const item: Inbound = { id: m.id, from: m.from, type: String(m.type ?? "") };
        if (m.type === "text") item.text = String(m.text?.body ?? "").slice(0, 2000);
        if (m.type === "interactive") item.buttonId = String(m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id ?? "");
        if (m.type === "button") item.buttonId = String(m.button?.payload ?? "");
        if (m.type === "image") {
          item.imageId = String(m.image?.id ?? "");
          item.mime = String(m.image?.mime_type ?? "image/jpeg");
          item.caption = String(m.image?.caption ?? "").slice(0, 1000);
        }
        out.push(item);
      }
    }
  }
  return out;
}

/** Descarga una imagen enviada por WhatsApp (dos pasos: URL temporal y contenido con el token). */
export async function downloadMedia(env: Env, mediaId: string, fetchFn: typeof fetch = fetch) {
  if (!whatsappConfigured(env) || !/^\d{5,40}$/.test(mediaId)) return null;
  try {
    const meta = await fetchFn(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` }, signal: AbortSignal.timeout(6000) });
    if (!meta.ok) return null;
    const info = (await meta.json()) as { url?: string; mime_type?: string; file_size?: number };
    if (!info.url || (info.file_size ?? 0) > 4 * 1024 * 1024) return null;
    const file = await fetchFn(info.url, { headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` }, signal: AbortSignal.timeout(10_000) });
    if (!file.ok) return null;
    const data = new Uint8Array(await file.arrayBuffer());
    return data.length <= 4 * 1024 * 1024 ? { data, mime: info.mime_type ?? "image/jpeg" } : null;
  } catch {
    return null;
  }
}
