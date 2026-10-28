/**
 * Citas (Documento Maestro §7.2, Estructura §E y §F).
 * - Reserva atómica: una sola sentencia condicional que solo escribe si el horario sigue libre.
 * - El profesional confirma o rechaza (en su panel o con los botones de WhatsApp).
 * - Presencial o virtual, cada una con su tarifa. Las virtuales tienen sala de videollamada propia.
 * - Pago en el consultorio o en línea con buscaDR Pay (registrado en el libro de transacciones).
 * - Autorización por objeto en cada handler: paciente, profesional dueño de la agenda o administración.
 */
import { Hono } from "hono";
import type { AppBindings, Env, User } from "../env";
import {
  type Action,
  type AppointmentStatus,
  BLOCK_SQL,
  FREE_CANCEL_MS,
  OVERLAP_SQL,
  PAYMENT_HOLD_MS,
  PAYMENT_LABEL,
  type PaymentStatus,
  type Role,
  STATUS_LABEL,
  TRANSITIONS,
  availableActions,
  holdUntil,
  icsFor,
  maskContact,
  newVideoRoom,
  videoOpen,
  videoUrl,
} from "../lib/appointments";
import { planAllows } from "../lib/catalog";
import { handoverCode } from "../lib/crypto";
import { track } from "../lib/events";
import { isAdmin, readJson, requireUser } from "../lib/guards";
import { clean, fail } from "../lib/http";
import { type PaymentRow, createPayment, nowText, startCheckout } from "../lib/payments";
import { type PractitionerRow, fullName, patientShortName } from "../lib/practitioners";
import { feeBps, priceFor } from "../lib/pricing";
import { RULES, hit } from "../lib/rate-limit";
import { notifyNewRequest, notifyPatient, refundPayment } from "../lib/settle";
import { daySlots, type Modality } from "../lib/slots";
import { DAY, MINUTE, formatLong, localDate, parseLocal } from "../lib/time";
import { whatsappLink } from "../lib/whatsapp";
import { loadAgenda } from "./practitioners";

export const appointments = new Hono<AppBindings>();

export type AppointmentRow = {
  id: number;
  practitioner_id: number;
  patient_id: string;
  pro_user_id: string;
  start_ms: number;
  end_ms: number;
  block_until_ms: number;
  modality: Modality;
  status: AppointmentStatus;
  hold_expires_ms: number | null;
  idempotency_key: string;
  price_cents: number;
  fee_cents: number;
  net_cents: number;
  payment_mode: "consultorio" | "en_linea";
  payment_status: PaymentStatus;
  reason: string;
  patient_name: string;
  video_room: string;
  checkin_code: string;
  cancel_reason: string;
  rescheduled_from: number | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  completed_at: string | null;
};

const idOf = (raw: string | undefined) => {
  const id = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isSafeInteger(id) || id <= 0) fail(404, "Cita no encontrada");
  return id;
};

function roleOf(a: AppointmentRow, user: User, env: Env): Role | null {
  if (a.patient_id === user.id) return "patient";
  if (a.pro_user_id === user.id) return "pro";
  if (isAdmin(user, env)) return "admin";
  return null;
}

async function loadFor(env: Env, user: User, id: number) {
  const a = await env.DB.prepare("SELECT * FROM appointments WHERE id=?").bind(id).first<AppointmentRow>();
  if (!a) fail(404, "Cita no encontrada");
  const role = roleOf(a, user, env);
  // Sin fuga de existencia: una cita ajena responde igual que una inexistente (Estructura §J.3).
  if (!role) fail(404, "Cita no encontrada");
  const p = await env.DB.prepare("SELECT * FROM practitioners WHERE id=?").bind(a.practitioner_id).first<PractitionerRow>();
  return { a, role, p: p! };
}

const event = (db: D1Database, id: number, type: string, actor: string | null, detail: Record<string, unknown> = {}) =>
  db.prepare("INSERT INTO appointment_events(appointment_id,type,actor_id,detail) VALUES(?,?,?,?)").bind(id, type, actor, JSON.stringify(detail));

const origin = (c: { req: { url: string } }) => new URL(c.req.url).origin;

/** Verifica que el inicio pedido sea un horario publicado y libre para esa modalidad. */
async function assertOffered(db: D1Database, p: PractitionerRow, start: number, modality: Modality, now: number) {
  // loadAgenda ya excluye las citas de prueba de los perfiles de muestra.
  const agenda = await loadAgenda(db, [p.id], start - DAY, start + DAY, now);
  const slots = daySlots(localDate(start), agenda.rules.get(p.id) ?? [], p, agenda.busy.get(p.id) ?? [], agenda.blocks.get(p.id) ?? [], now);
  const slot = slots.find((s) => s.start_ms === start);
  if (!slot) fail(409, "Ese horario ya no está disponible. Elige otro.", "BOOKING_SLOT_TAKEN");
  if (!slot.modalities.includes(modality)) fail(400, `Ese horario no admite cita ${modality}.`);
}

/** Inserción condicional ATÓMICA de una cita (sin solapes ni bloqueos). */
async function insertAppointment(
  db: D1Database,
  v: {
    p: PractitionerRow;
    patient: User;
    start: number;
    modality: Modality;
    status: AppointmentStatus;
    hold: number | null;
    key: string;
    price: { price_cents: number; fee_cents: number; net_cents: number };
    paymentMode: "consultorio" | "en_linea";
    paymentStatus: PaymentStatus;
    reason: string;
    patientName: string;
    rescheduledFrom?: number | null;
  },
) {
  const end = v.start + v.p.slot_minutes * MINUTE;
  const until = end + v.p.buffer_minutes * MINUTE;
  const now = Date.now();
  return db
    .prepare(
      `INSERT INTO appointments(practitioner_id,patient_id,pro_user_id,start_ms,end_ms,block_until_ms,modality,status,hold_expires_ms,idempotency_key,
         price_cents,fee_cents,net_cents,payment_mode,payment_status,reason,patient_name,video_room,checkin_code,rescheduled_from,confirmed_at)
       SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
       WHERE EXISTS(SELECT 1 FROM practitioners WHERE id=? AND status='active')
         AND NOT EXISTS(${OVERLAP_SQL}) AND NOT EXISTS(${BLOCK_SQL})
       RETURNING id`,
    )
    .bind(
      v.p.id,
      v.patient.id,
      v.p.user_id,
      v.start,
      end,
      until,
      v.modality,
      v.status,
      v.hold,
      v.key,
      v.price.price_cents,
      v.price.fee_cents,
      v.price.net_cents,
      v.paymentMode,
      v.paymentStatus,
      v.reason,
      v.patientName,
      v.modality === "virtual" ? newVideoRoom() : "",
      handoverCode(),
      v.rescheduledFrom ?? null,
      v.status === "confirmada" ? nowText() : null,
      v.p.id,
      v.p.id,
      now,
      until,
      v.start,
      v.p.id,
      until,
      v.start,
    )
    .first<{ id: number }>()
    .catch((e) => {
      if (String(e).includes("UNIQUE")) return null;
      throw e;
    });
}

/* ------------------------------------------------------------------ Reservar */

appointments.post("/", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  await hit(db, `booking:${user.id}`, RULES.booking);
  const b = await readJson<{
    practitioner_id?: number;
    start?: string | number;
    modality?: string;
    payment_mode?: string;
    reason?: string;
    patient_name?: string;
    idempotency_key?: string;
  }>(c);
  const key = String(b.idempotency_key ?? "");
  if (!/^[A-Za-z0-9_-]{12,80}$/.test(key)) fail(400, "Falta la clave de la solicitud. Recarga la página e inténtalo de nuevo.");
  // Idempotencia: el mismo envío repetido (doble clic, red lenta) devuelve la misma cita.
  const repeated = await db.prepare("SELECT id FROM appointments WHERE patient_id=? AND idempotency_key=?").bind(user.id, key).first<{ id: number }>();
  if (repeated) return c.json({ id: repeated.id, repeated: true });

  const p = await db.prepare("SELECT * FROM practitioners WHERE id=?").bind(Number(b.practitioner_id)).first<PractitionerRow>();
  if (p?.status !== "active") fail(404, "Este perfil no está disponible para reservar");
  if (p.user_id === user.id) fail(400, "No puedes reservar una cita contigo mismo");
  const modality: Modality = b.modality === "virtual" ? "virtual" : "presencial";
  if (modality === "virtual" && !p.virtual_enabled) fail(400, "Este profesional no ofrece citas virtuales");
  if (modality === "presencial" && !p.in_person_enabled) fail(400, "Este profesional solo atiende citas virtuales");
  if (c.env.BUSCADR_ENFORCE_PLANS === "1" && modality === "virtual" && !planAllows(p.plan, "virtual")) fail(403, "Las citas virtuales requieren el plan Pro del profesional", "PLAN_LIMIT");
  const start = parseLocal(b.start);
  if (!start) fail(400, "Elige fecha y hora de la cita");
  const now = Date.now();
  await assertOffered(db, p, start, modality, now);

  const reason = clean(b.reason, 160);
  const prepay = modality === "virtual" ? !!p.prepay_virtual : !!p.prepay_in_person;
  const basePrice = modality === "virtual" ? p.price_virtual_cents : p.price_in_person_cents;
  const online = basePrice > 0 && (prepay || b.payment_mode === "en_linea");
  const price = priceFor(p, modality, online, feeBps(c.env));
  const instant = !!p.auto_confirm || !!p.demo;
  // Con pago previo, el horario se retiene 30 min mientras se paga; luego espera la confirmación.
  const status: AppointmentStatus = instant && !online ? "confirmada" : "solicitada";
  const hold = status === "confirmada" ? null : online ? Math.min(now + PAYMENT_HOLD_MS, start) : holdUntil(now, start);
  const inserted = await insertAppointment(db, {
    p,
    patient: user,
    start,
    modality,
    status,
    hold,
    key,
    price,
    paymentMode: online ? "en_linea" : "consultorio",
    paymentStatus: online ? "pendiente" : "no_requerido",
    reason,
    patientName: clean(b.patient_name, 80) || user.name,
  });
  if (!inserted) {
    const again = await db.prepare("SELECT id FROM appointments WHERE patient_id=? AND idempotency_key=?").bind(user.id, key).first<{ id: number }>();
    if (again) return c.json({ id: again.id, repeated: true });
    fail(409, "Ese horario acaba de ocuparse. Elige otro.", "BOOKING_SLOT_TAKEN");
  }
  const id = inserted.id;
  await event(db, id, status === "confirmada" ? "creada_confirmada" : "solicitada", user.id, { modality, online }).run();
  await track(db, status === "confirmada" ? "booking_confirmed" : "booking_requested", { userId: user.id, appointmentId: id, practitionerId: p.id, props: { modality, online } });

  let checkout: string | null = null;
  if (online) {
    const pay = await createPayment(db, c.env, {
      kind: "cita",
      appointment_id: id,
      payer_id: user.id,
      practitioner_id: p.id,
      amount_cents: price.price_cents,
      fee_cents: price.fee_cents,
      net_cents: price.net_cents,
    });
    const row = await db.prepare("SELECT * FROM payments WHERE id=?").bind(pay.id).first<PaymentRow>();
    checkout = (await startCheckout(c.env, row!, origin(c), `Cita ${modality} #${id} · ${fullName(p)}`))?.url ?? `/pagar/${pay.id}`;
  } else {
    const lite = { id, status, start_ms: start, practitioner_id: p.id, patient_id: user.id, pro_user_id: p.user_id, modality, auto_confirm: p.auto_confirm, demo: p.demo, name: fullName(p) };
    c.executionCtx.waitUntil(
      Promise.all([
        notifyNewRequest(c.env, origin(c), lite, status === "confirmada"),
        notifyPatient(
          c.env,
          origin(c),
          lite,
          status === "confirmada" ? "cita_confirmada" : "cita_solicitada",
          status === "confirmada" ? "Tu cita está confirmada" : "Solicitud enviada",
          status === "confirmada"
            ? `${fullName(p)} · ${formatLong(start)}. Te recordaremos 24 h y 1 h antes.`
            : `${fullName(p)} · ${formatLong(start)}. Te avisaremos apenas el profesional la confirme.`,
        ),
      ]).then(() => undefined),
    );
  }
  return c.json({ id, status, demo: !!p.demo, checkout }, 201);
});

/* ------------------------------------------------------------------ Listas y detalle */

const LIST_SELECT = `SELECT a.id,a.status,a.start_ms,a.end_ms,a.modality,a.price_cents,a.net_cents,a.payment_mode,a.payment_status,a.hold_expires_ms,a.patient_name,a.created_at,
  p.slug,p.title,p.display_name,p.specialty,p.photo,p.city,p.sector,p.demo,
  (SELECT COUNT(*) FROM messages m WHERE m.appointment_id=a.id) AS messages
  FROM appointments a JOIN practitioners p ON p.id=a.practitioner_id`;

export function listView(r: Record<string, any>, as: "patient" | "pro") {
  return {
    id: r.id,
    status: r.status,
    status_label: STATUS_LABEL[r.status as AppointmentStatus] ?? r.status,
    start_ms: r.start_ms,
    end_ms: r.end_ms,
    modality: r.modality,
    price_cents: r.price_cents,
    net_cents: r.net_cents,
    payment_mode: r.payment_mode,
    payment_status: r.payment_status,
    payment_label: PAYMENT_LABEL[r.payment_status as PaymentStatus] ?? r.payment_status,
    hold_expires_ms: r.hold_expires_ms,
    created_at: r.created_at,
    messages: r.messages ?? 0,
    demo: !!r.demo,
    practitioner: { slug: r.slug, name: `${r.title ? `${r.title} ` : ""}${r.display_name}`, specialty: r.specialty, photo: r.photo, city: r.city, sector: r.sector },
    patient: as === "pro" ? { name: patientShortName(r.patient_name) } : undefined,
  };
}

appointments.get("/", async (c) => {
  const user = requireUser(c);
  const as = c.req.query("as") === "pro" ? "pro" : "patient";
  const scope = c.req.query("scope") === "past" ? "past" : c.req.query("scope") === "all" ? "all" : "upcoming";
  const now = Date.now();
  const filter =
    scope === "upcoming"
      ? "AND a.end_ms>=? AND a.status IN ('solicitada','confirmada')"
      : scope === "past"
        ? "AND (a.end_ms<? OR a.status NOT IN ('solicitada','confirmada'))"
        : "AND ?>0";
  const rows = (
    await c.env.DB.prepare(
      `${LIST_SELECT} WHERE ${as === "pro" ? "a.pro_user_id" : "a.patient_id"}=? ${filter} ORDER BY a.start_ms ${scope === "upcoming" ? "ASC" : "DESC"} LIMIT 100`,
    )
      .bind(user.id, now)
      .all<Record<string, any>>()
  ).results;
  return c.json({ as, scope, items: rows.map((r) => listView(r, as)) });
});

appointments.get("/:id", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  const { a, role, p } = await loadFor(c.env, user, idOf(c.req.param("id")));
  const [events, messages, review, payments, patient] = await Promise.all([
    db.prepare("SELECT type,actor_id,detail,created_at FROM appointment_events WHERE appointment_id=? ORDER BY id").bind(a.id).all<Record<string, any>>(),
    db.prepare("SELECT id,sender_id,body,masked,created_at FROM messages WHERE appointment_id=? ORDER BY id LIMIT 300").bind(a.id).all<Record<string, any>>(),
    db.prepare("SELECT rating,body,reply,created_at FROM reviews WHERE appointment_id=?").bind(a.id).first<Record<string, any>>(),
    db
      .prepare("SELECT id,status,amount_cents,provider,card_brand,card_last4,created_at,approved_at,refunded_at FROM payments WHERE appointment_id=? ORDER BY created_at DESC")
      .bind(a.id)
      .all<Record<string, any>>(),
    db.prepare("SELECT name FROM users WHERE id=?").bind(a.patient_id).first<{ name: string }>(),
  ]);
  const demo = !!p.demo;
  const confirmed = ["confirmada", "completada"].includes(a.status);
  const now = Date.now();
  const proName = fullName(p);
  const name = (id: string | null) => (!id ? "buscaDR" : id === a.patient_id ? (role === "patient" ? "Tú" : patientShortName(patient?.name)) : id === a.pro_user_id ? proName : "Equipo buscaDR");
  return c.json({
    appointment: {
      id: a.id,
      status: a.status,
      status_label: STATUS_LABEL[a.status],
      viewer: role,
      demo,
      start_ms: a.start_ms,
      end_ms: a.end_ms,
      hold_expires_ms: a.hold_expires_ms,
      modality: a.modality,
      reason: role === "patient" || role === "pro" ? a.reason : "",
      price_cents: a.price_cents,
      fee_cents: role === "patient" ? 0 : a.fee_cents,
      net_cents: role === "patient" ? a.price_cents : a.net_cents,
      payment_mode: a.payment_mode,
      payment_status: a.payment_status,
      payment_label: PAYMENT_LABEL[a.payment_status],
      created_at: a.created_at,
      confirmed_at: a.confirmed_at,
      completed_at: a.completed_at,
      cancel_reason: a.cancel_reason,
      rescheduled_from: a.rescheduled_from,
      // Código de llegada: el paciente lo muestra en recepción; el profesional lo puede verificar.
      checkin_code: confirmed && a.modality === "presencial" ? a.checkin_code : null,
      actions: availableActions(a, role, { demo, reviewed: !!review }),
      free_cancel_until: a.start_ms - FREE_CANCEL_MS,
      video: a.modality === "virtual" ? { open: videoOpen(a, now), url: videoOpen(a, now) || demo ? videoUrl(a.video_room) : null, opens_at: a.start_ms - 15 * MINUTE } : null,
      practitioner: {
        id: p.id,
        slug: p.slug,
        name: proName,
        specialty: p.specialty,
        photo: p.photo,
        city: p.city,
        sector: p.sector,
        // Dirección exacta solo con la cita confirmada (privacidad y anti-desintermediación).
        address: confirmed && a.modality === "presencial" ? p.address || `${p.sector}, ${p.city}` : null,
        lat: confirmed ? p.lat : p.lat == null ? null : Math.round(p.lat * 100) / 100,
        lng: confirmed ? p.lng : p.lng == null ? null : Math.round(p.lng * 100) / 100,
      },
      patient: { name: role === "patient" ? patient?.name : a.patient_name || patientShortName(patient?.name) },
      whatsapp: {
        // El canal de WhatsApp es siempre el número Business de buscaDR, nunca el privado del médico o del paciente.
        support: c.env.BUSCADR_SUPPORT_WHATSAPP ? whatsappLink(c.env.BUSCADR_SUPPORT_WHATSAPP, `Hola buscaDR, consulta sobre la cita #${a.id}.`) : null,
        share: `https://wa.me/?text=${encodeURIComponent(`Mi cita en buscaDR: ${proName}, ${formatLong(a.start_ms)} (${a.modality}). ${origin(c)}/citas/${a.id}`)}`,
      },
      ics: `/api/appointments/${a.id}/ics`,
      events: events.results.map((e) => ({ type: e.type, actor: name(e.actor_id), created_at: e.created_at })),
      messages: messages.results.map((m) => ({ id: m.id, mine: m.sender_id === user.id, author: name(m.sender_id), body: m.body, masked: !!m.masked, created_at: m.created_at })),
      review: review ?? null,
      payments: payments.results,
    },
  });
});

appointments.get("/:id/ics", async (c) => {
  const user = requireUser(c);
  const { a, p } = await loadFor(c.env, user, idOf(c.req.param("id")));
  const body = icsFor({
    id: a.id,
    start_ms: a.start_ms,
    end_ms: a.end_ms,
    modality: a.modality,
    title: `Cita ${a.modality} con ${fullName(p)} (buscaDR)`,
    location: a.modality === "virtual" ? "Videollamada (enlace en buscaDR)" : `${p.sector}, ${p.city}`,
    url: `${origin(c)}/citas/${a.id}`,
  });
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="cita-buscadr-${a.id}.ics"`, "Cache-Control": "no-store" } });
});

/* ------------------------------------------------------------------ Acciones */

async function transition(db: D1Database, a: AppointmentRow, to: AppointmentStatus, extra: Record<string, unknown> = {}) {
  const sets = ["status=?", "updated_at=CURRENT_TIMESTAMP", ...Object.keys(extra).map((k) => `${k}=?`)];
  const res = await db
    .prepare(`UPDATE appointments SET ${sets.join(",")} WHERE id=? AND status=?`)
    .bind(to, ...Object.values(extra), a.id, a.status)
    .run();
  if (!res.meta.changes) fail(409, "La cita cambió mientras tanto. Recarga la página.");
}

const approvedPayment = (db: D1Database, appointmentId: number) =>
  db.prepare("SELECT * FROM payments WHERE appointment_id=? AND status='aprobado' AND provider<>'consultorio' ORDER BY approved_at DESC LIMIT 1").bind(appointmentId).first<PaymentRow>();

appointments.post("/:id/actions/:action", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  await hit(db, `write:${user.id}`, RULES.write);
  const { a, role, p } = await loadFor(c.env, user, idOf(c.req.param("id")));
  const action = c.req.param("action") as Action;
  const demo = !!p.demo;
  const reviewed = !!(await db.prepare("SELECT 1 FROM reviews WHERE appointment_id=?").bind(a.id).first());
  const allowed = availableActions(a, role, { demo, reviewed });
  if (!allowed.includes(action)) fail(409, "Esta acción no está disponible para esta cita ahora.", "ACTION_NOT_ALLOWED");
  const input = await readJson<{ reason?: string; start?: string | number; rating?: number; body?: string }>(c);
  const lite = { id: a.id, patient_id: a.patient_id, start_ms: a.start_ms, name: fullName(p), demo: p.demo };
  const o = origin(c);
  const proSide = role !== "patient" || demo;
  let response: Record<string, unknown> = {};

  switch (action) {
    case "confirm":
      await transition(db, a, TRANSITIONS.confirm.to, { confirmed_at: nowText(), hold_expires_ms: null });
      c.executionCtx.waitUntil(
        notifyPatient(c.env, o, lite, "cita_confirmada", "Tu cita está confirmada", `${fullName(p)} · ${formatLong(a.start_ms)}. Te recordaremos 24 h y 1 h antes.`),
      );
      break;
    case "decline": {
      await transition(db, a, TRANSITIONS.decline.to, { cancel_reason: clean(input.reason, 280) || "El profesional no tiene disponibilidad" });
      const paid = await approvedPayment(db, a.id);
      if (paid) await refundPayment(c.env, paid, "Cita no aceptada por el profesional");
      c.executionCtx.waitUntil(
        notifyPatient(c.env, o, lite, "cita_rechazada", "El profesional no pudo aceptar tu cita", `${fullName(p)} · ${formatLong(a.start_ms)}.${paid ? " Te reembolsamos el pago." : ""} Elige otro horario en buscaDR.`),
      );
      break;
    }
    case "cancel": {
      await transition(db, a, TRANSITIONS.cancel.to, { cancel_reason: `${role === "patient" ? "Paciente" : "Profesional"}: ${clean(input.reason, 260) || "sin motivo"}`, hold_expires_ms: null });
      const paid = await approvedPayment(db, a.id);
      // Reembolso: siempre si cancela el profesional; si cancela el paciente, hasta 4 h antes.
      const refundable = paid && (role !== "patient" || Date.now() <= a.start_ms - FREE_CANCEL_MS);
      if (refundable) await refundPayment(c.env, paid, role === "patient" ? "Cancelada por el paciente a tiempo" : "Cancelada por el profesional");
      response = { refunded: !!refundable, refundable_policy: paid && !refundable ? "Cancelaste con menos de 4 h: el pago no es reembolsable." : null };
      if (role === "patient" && !demo) {
        c.executionCtx.waitUntil(
          (async () => {
            const { recipient, notify } = await import("../lib/notify");
            const pro = await recipient(db, a.pro_user_id);
            if (pro) await notify(c.env, pro, { kind: "cita_cancelada", title: "Un paciente canceló su cita", body: `Cita #${a.id} del ${formatLong(a.start_ms)}. El horario quedó libre.`, link: `/panel/citas/${a.id}`, origin: o, ref: `cita:${a.id}` });
          })(),
        );
      } else c.executionCtx.waitUntil(notifyPatient(c.env, o, lite, "cita_cancelada", "Tu cita fue cancelada", `${fullName(p)} canceló la cita del ${formatLong(a.start_ms)}.${refundable ? " Te reembolsamos el pago." : ""}`));
      break;
    }
    case "complete":
      await transition(db, a, TRANSITIONS.complete.to, { completed_at: nowText() });
      c.executionCtx.waitUntil(notifyPatient(c.env, o, lite, "cita_completada", "¿Cómo fue tu cita?", `Cuéntanos tu experiencia con ${fullName(p)}. Tu opinión verificada ayuda a otros pacientes.`));
      break;
    case "no_show":
      await transition(db, a, TRANSITIONS.no_show.to);
      break;
    case "mark_paid": {
      // Pago recibido en el consultorio: queda registrado en el libro de transacciones (sin comisión).
      if (a.price_cents <= 0) fail(400, "Esta cita no tiene tarifa");
      const id = crypto.randomUUID();
      await db.batch([
        db
          .prepare(
            "INSERT INTO payments(id,kind,appointment_id,payer_id,practitioner_id,amount_cents,fee_cents,net_cents,provider,status,method,approved_at) VALUES(?,?,?,?,?,?,0,?,'consultorio','aprobado',?,?)",
          )
          .bind(id, "cita", a.id, a.patient_id, p.id, a.price_cents, a.price_cents, ["efectivo", "tarjeta", "transferencia"].includes(String(input.body)) ? String(input.body) : "efectivo", nowText()),
        db.prepare("INSERT INTO payment_events(payment_id,type,detail) VALUES(?,?,?)").bind(id, "registrado_en_consultorio", JSON.stringify({ by: user.id })),
        db.prepare("UPDATE appointments SET payment_status='pagado',updated_at=CURRENT_TIMESTAMP WHERE id=? AND payment_status='no_requerido'").bind(a.id),
      ]);
      break;
    }
    case "pay": {
      let pay = await db.prepare("SELECT * FROM payments WHERE appointment_id=? AND status IN ('creado','pendiente','rechazado') ORDER BY created_at DESC LIMIT 1").bind(a.id).first<PaymentRow>();
      if (!pay) {
        const created = await createPayment(db, c.env, { kind: "cita", appointment_id: a.id, payer_id: a.patient_id, practitioner_id: p.id, amount_cents: a.price_cents, fee_cents: a.fee_cents, net_cents: a.net_cents });
        pay = await db.prepare("SELECT * FROM payments WHERE id=?").bind(created.id).first<PaymentRow>();
      }
      // Si el plazo para pagar venció, se renueva mientras el horario siga libre.
      if (a.status === "solicitada" && (a.hold_expires_ms ?? 0) < Date.now()) {
        const res = await db
          .prepare(`UPDATE appointments SET hold_expires_ms=?,payment_status='pendiente' WHERE id=? AND status='solicitada' AND NOT EXISTS(${OVERLAP_SQL} AND a.id<>?)`)
          .bind(Math.min(Date.now() + PAYMENT_HOLD_MS, a.start_ms), a.id, p.id, Date.now(), a.block_until_ms, a.start_ms, a.id)
          .run();
        if (!res.meta.changes) fail(409, "El horario se ocupó mientras tanto. Reprograma tu cita.", "BOOKING_SLOT_TAKEN");
      }
      response = { checkout: (await startCheckout(c.env, pay!, o, `Cita ${a.modality} #${a.id} · ${fullName(p)}`))?.url ?? `/pagar/${pay!.id}` };
      break;
    }
    case "reschedule": {
      const start = parseLocal(input.start);
      if (!start || start === a.start_ms) fail(400, "Elige un nuevo horario");
      await assertOffered(db, p, start, a.modality, Date.now());
      const confirmedBefore = a.status === "confirmada";
      const instant = !!p.auto_confirm || demo;
      const inserted = await insertAppointment(db, {
        p,
        patient: { ...user, id: a.patient_id } as User,
        start,
        modality: a.modality,
        status: instant ? "confirmada" : "solicitada",
        hold: instant ? null : holdUntil(Date.now(), start),
        key: `rep-${a.id}-${start}`,
        price: { price_cents: a.price_cents, fee_cents: a.fee_cents, net_cents: a.net_cents },
        paymentMode: a.payment_mode,
        paymentStatus: a.payment_status,
        reason: a.reason,
        patientName: a.patient_name,
        rescheduledFrom: a.id,
      });
      if (!inserted) fail(409, "Ese horario acaba de ocuparse. Elige otro.", "BOOKING_SLOT_TAKEN");
      const old = await db
        .prepare("UPDATE appointments SET status='cancelada',cancel_reason=?,hold_expires_ms=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('solicitada','confirmada')")
        .bind(`Reprogramada a la cita #${inserted.id}`, a.id)
        .run();
      if (!old.meta.changes) {
        await db.prepare("UPDATE appointments SET status='cancelada',cancel_reason='Reprogramación anulada' WHERE id=?").bind(inserted.id).run();
        fail(409, "La cita cambió mientras tanto. Recarga la página.");
      }
      // El pago (si lo hubo) acompaña a la cita nueva.
      await db.batch([
        db.prepare("UPDATE payments SET appointment_id=?,updated_at=CURRENT_TIMESTAMP WHERE appointment_id=?").bind(inserted.id, a.id),
        event(db, inserted.id, "reprogramada_desde", user.id, { from: a.id, was_confirmed: confirmedBefore }),
      ]);
      await track(db, "booking_rescheduled", { userId: user.id, appointmentId: inserted.id, practitionerId: p.id });
      if (!demo) {
        const fresh = { id: inserted.id, status: instant ? "confirmada" : "solicitada", start_ms: start, practitioner_id: p.id, patient_id: a.patient_id, pro_user_id: p.user_id, modality: a.modality, auto_confirm: p.auto_confirm, demo: p.demo, name: fullName(p) };
        c.executionCtx.waitUntil(notifyNewRequest(c.env, o, fresh, instant));
      }
      response = { id: inserted.id };
      break;
    }
    case "review": {
      const rating = Number(input.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) fail(400, "Elige de 1 a 5 estrellas");
      await db
        .prepare("INSERT INTO reviews(appointment_id,practitioner_id,author_id,rating,body) VALUES(?,?,?,?,?)")
        .bind(a.id, p.id, user.id, rating, clean(input.body, 800))
        .run();
      await track(db, "review_published", { userId: user.id, appointmentId: a.id, practitionerId: p.id, props: { rating } });
      break;
    }
  }
  await event(db, a.id, action, user.id, action === "cancel" || action === "decline" ? { reason: clean(input.reason, 200) } : {}).run();
  const names = { confirm: "booking_confirmed", decline: "booking_declined", cancel: "booking_cancelled", complete: "booking_completed", no_show: "booking_no_show" } as const;
  if (action in names) await track(db, names[action as keyof typeof names], { userId: user.id, appointmentId: a.id, practitionerId: p.id, props: { by: proSide ? "pro" : "patient" } });
  return c.json({ ok: true, action, ...response });
});

/* ------------------------------------------------------------------ Mensajes */

appointments.post("/:id/messages", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  await hit(db, `write:${user.id}`, RULES.write);
  const { a, role, p } = await loadFor(c.env, user, idOf(c.req.param("id")));
  const raw = clean((await readJson<{ body?: string }>(c)).body, 1000);
  if (!raw) fail(400, "Escribe un mensaje");
  // Los datos de contacto se ocultan siempre: la comunicación queda dentro de buscaDR (§7.3).
  const { text, masked } = maskContact(raw);
  const row = await db
    .prepare("INSERT INTO messages(appointment_id,sender_id,body,masked) VALUES(?,?,?,?) RETURNING id,created_at")
    .bind(a.id, user.id, text, masked ? 1 : 0)
    .first<{ id: number; created_at: string }>();
  if (!p.demo && role !== "admin") {
    const { recipient, notify } = await import("../lib/notify");
    const target = await recipient(db, role === "patient" ? a.pro_user_id : a.patient_id);
    if (target)
      c.executionCtx.waitUntil(
        notify(c.env, target, {
          kind: "mensaje",
          title: "Nuevo mensaje en buscaDR",
          body: `Tienes un mensaje sobre la cita #${a.id}. Ábrelo en la app (por privacidad no incluimos el texto aquí).`,
          link: role === "patient" ? `/panel/citas/${a.id}` : `/citas/${a.id}`,
          origin: origin(c),
          email: false,
          ref: `cita:${a.id}`,
        }),
      );
  }
  return c.json({ message: { id: row!.id, mine: true, author: "Tú", body: text, masked, created_at: row!.created_at } }, 201);
});

