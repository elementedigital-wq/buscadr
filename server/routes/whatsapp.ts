/**
 * Webhook de WhatsApp Cloud API (docs/WHATSAPP.md).
 * - GET: verificación de Meta (hub.verify_token = WHATSAPP_VERIFY_TOKEN).
 * - POST: solo se procesa si la firma X-Hub-Signature-256 es válida (WHATSAPP_APP_SECRET).
 *   Botones «Confirmar / Rechazar» del profesional y búsqueda de especialistas por texto.
 *   Cada mensaje se procesa una sola vez (whatsapp_inbound). Nunca se piden ni guardan síntomas.
 */
import { Hono } from "hono";
import type { AppBindings, Env } from "../env";
import { CITIES, SPECIALTY_MAP, guessSpecialty, normalizeText } from "../lib/catalog";
import { track } from "../lib/events";
import { notifyPatient } from "../lib/settle";
import { formatLong } from "../lib/time";
import { type Inbound, parseInbound, sendWhatsApp, verifySignature } from "../lib/whatsapp";

export const whatsapp = new Hono<AppBindings>();

whatsapp.get("/webhook", (c) => {
  const mode = c.req.query("hub.mode");
  const token = c.req.query("hub.verify_token");
  const challenge = c.req.query("hub.challenge") ?? "";
  if (mode === "subscribe" && c.env.WHATSAPP_VERIFY_TOKEN && token === c.env.WHATSAPP_VERIFY_TOKEN && /^[\w-]{1,200}$/.test(challenge)) {
    return c.text(challenge, 200);
  }
  return c.text("Forbidden", 403);
});

const reply = (env: Env, to: string, body: string) => sendWhatsApp(env, to, { kind: "text", body });
const last9 = (phone: string) => phone.replace(/\D/g, "").slice(-9);
const PHONE_SQL = "replace(replace(replace(replace(u.phone,' ',''),'-',''),'+',''),'.','') LIKE ?";

/** Profesional dueño de la cita, solo si el número que responde es el suyo. */
async function proForDecision(db: D1Database, id: number, from: string) {
  const digits = last9(from);
  if (digits.length !== 9) return null;
  return db
    .prepare(
      `SELECT u.id,a.patient_id,a.start_ms,a.status,a.payment_status,p.demo,trim(p.title || ' ' || p.display_name) AS name
       FROM appointments a JOIN users u ON u.id=a.pro_user_id JOIN practitioners p ON p.id=a.practitioner_id WHERE a.id=? AND ${PHONE_SQL}`,
    )
    .bind(id, `%${digits}`)
    .first<{ id: string; patient_id: string; start_ms: number; status: string; payment_status: string; demo: number; name: string }>();
}

async function handleDecision(env: Env, origin: string, msg: Inbound) {
  const db = env.DB;
  const m = /^(acc|rej):(\d{1,12})$/.exec(msg.buttonId ?? "");
  if (!m) return;
  const id = Number(m[2]);
  const pro = await proForDecision(db, id, msg.from);
  if (!pro) return;
  const accept = m[1] === "acc";
  const now = Date.now();
  const res = await db
    .prepare(
      accept
        ? "UPDATE appointments SET status='confirmada',confirmed_at=CURRENT_TIMESTAMP,hold_expires_ms=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND pro_user_id=? AND status='solicitada' AND hold_expires_ms>? AND payment_status<>'pendiente'"
        : "UPDATE appointments SET status='rechazada',cancel_reason='Rechazada desde WhatsApp',updated_at=CURRENT_TIMESTAMP WHERE id=? AND pro_user_id=? AND status='solicitada' AND hold_expires_ms>?",
    )
    .bind(id, pro.id, now)
    .run();
  if (!res.meta.changes) {
    await reply(env, msg.from, `La cita #${id} ya no está pendiente (pudo vencer o haberse respondido). Revísala en ${origin}/panel/citas/${id}`);
    return;
  }
  await db
    .prepare("INSERT INTO appointment_events(appointment_id,type,actor_id,detail) VALUES(?,?,?,?)")
    .bind(id, accept ? "confirm" : "decline", pro.id, JSON.stringify({ via: "whatsapp" }))
    .run();
  if (!accept && pro.payment_status === "pagado") {
    const { refundPayment } = await import("../lib/settle");
    const paid = await db.prepare("SELECT * FROM payments WHERE appointment_id=? AND status='aprobado' AND provider<>'consultorio' LIMIT 1").bind(id).first();
    if (paid) await refundPayment(env, paid as any, "Rechazada por el profesional desde WhatsApp");
  }
  await track(db, "whatsapp_action", { userId: pro.id, appointmentId: id, props: { action: accept ? "confirm" : "decline" } });
  await reply(
    env,
    msg.from,
    accept ? `✅ Confirmaste la cita #${id} del ${formatLong(pro.start_ms)}. La verás en tu calendario: ${origin}/panel/agenda` : `Rechazaste la cita #${id}. Avisamos al paciente para que elija otro horario.`,
  );
  await notifyPatient(
    env,
    origin,
    { id, patient_id: pro.patient_id, start_ms: pro.start_ms, name: pro.name, demo: pro.demo },
    accept ? "cita_confirmada" : "cita_rechazada",
    accept ? "Tu cita está confirmada" : "El profesional no pudo aceptar tu cita",
  );
}

async function handleSearch(env: Env, origin: string, msg: Inbound) {
  const text = (msg.text ?? "").trim();
  const n = normalizeText(text);
  if (!text || /^(hola|buenas|menu|menú|ayuda|info)\b/.test(n)) {
    await reply(
      env,
      msg.from,
      `¡Hola! Soy el asistente de buscaDR 🩺\n• Escribe la especialidad y la ciudad (ej.: «pediatra en Samborondón» o «psicólogo virtual») y te muestro profesionales con horarios.\n• Tus citas: ${origin}/citas\n• ¿Eres profesional de la salud? Activa tu agenda: ${origin}/para-profesionales\nbuscaDR no atiende emergencias: ante una urgencia llama al 911.`,
    );
    return;
  }
  const specialty = guessSpecialty(text);
  const city = CITIES.find((x) => n.includes(x.slug) || n.includes(normalizeText(x.name)));
  const virtual = /virtual|online|en linea|videollamada/.test(n);
  const rows = (
    await env.DB.prepare(
      `SELECT slug,title,display_name,specialty,city,sector,price_in_person_cents,price_virtual_cents,demo FROM practitioners WHERE status='active'
       ${specialty ? "AND specialty=?" : ""} ${city && !virtual ? "AND city=?" : ""} ${virtual ? "AND virtual_enabled=1" : ""}
       ORDER BY demo ASC, CASE verification WHEN 'verificado' THEN 0 ELSE 1 END, id DESC LIMIT 3`,
    )
      .bind(...[...(specialty ? [specialty] : []), ...(city && !virtual ? [city.name] : [])])
      .all<{ slug: string; title: string; display_name: string; specialty: string; city: string; sector: string; price_in_person_cents: number; price_virtual_cents: number; demo: number }>()
  ).results;
  const params = new URLSearchParams({ ...(specialty ? { especialidad: specialty } : { q: text.slice(0, 60) }), ...(city ? { ciudad: city.name } : {}), ...(virtual ? { modalidad: "virtual" } : {}) });
  if (!rows.length) {
    await env.DB.prepare("INSERT INTO demand_log(query,specialty,city,results) VALUES(?,?,?,0)")
      .bind(text.slice(0, 80), specialty ?? "", city?.name ?? "")
      .run();
    await reply(env, msg.from, `Aún no tenemos profesionales así publicados. Registré tu búsqueda. Revisa más opciones: ${origin}/buscar?${params}`);
    return;
  }
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  const lines = rows.map(
    (r) =>
      `• ${r.title} ${r.display_name} · ${SPECIALTY_MAP.get(r.specialty)?.name ?? r.specialty}${r.demo ? " (muestra)" : ""}\n  ${r.sector || r.city}${r.price_in_person_cents ? ` · presencial ${money(r.price_in_person_cents)}` : ""}${r.price_virtual_cents ? ` · virtual ${money(r.price_virtual_cents)}` : ""}\n  ${origin}/doctor/${r.slug}`,
  );
  await reply(env, msg.from, `Encontré esto para ti:\n${lines.join("\n")}\n\nVer horarios y reservar: ${origin}/buscar?${params}`);
}

whatsapp.post("/webhook", async (c) => {
  const raw = await c.req.text();
  if (raw.length > 200_000) return c.text("Payload too large", 413);
  if (!(await verifySignature(c.env.WHATSAPP_APP_SECRET, raw, c.req.header("x-hub-signature-256")))) return c.text("Invalid signature", 401);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return c.text("Bad JSON", 400);
  }
  const origin = new URL(c.req.url).origin;
  const db = c.env.DB;
  for (const msg of parseInbound(body).slice(0, 20)) {
    const fresh = await db
      .prepare("INSERT OR IGNORE INTO whatsapp_inbound(wa_message_id,from_phone,kind,summary) VALUES(?,?,?,?)")
      // Solo un resumen corto del botón o la búsqueda; nunca imágenes ni contenido clínico.
      .bind(msg.id.slice(0, 200), msg.from.slice(0, 20), msg.type.slice(0, 20), (msg.buttonId ?? msg.text ?? "").slice(0, 80))
      .run();
    if (!fresh.meta.changes) continue; // reintento de Meta: ya procesado
    const work = (async () => {
      if (msg.buttonId) await handleDecision(c.env, origin, msg);
      else if (msg.type === "text") await handleSearch(c.env, origin, msg);
      else await reply(c.env, msg.from, "Por privacidad no recibimos imágenes ni documentos por WhatsApp. Escribe la especialidad que buscas o abre tus citas en buscaDR.");
    })().catch((e) => console.error("buscaDR WhatsApp", msg.type, (e as Error).message));
    c.executionCtx.waitUntil(work);
  }
  // Meta espera 200 rápido; el trabajo continúa en segundo plano.
  return c.json({ ok: true });
});
