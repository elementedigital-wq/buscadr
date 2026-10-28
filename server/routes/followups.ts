/**
 * Citas subsecuentes (ADR 0017).
 * - `/api/pro/followups`: el profesional programa series de controles para sus pacientes, revisa la
 *   adherencia y reagenda las sesiones que quedaron en conflicto.
 * - `/api/followups`: el paciente ve la propuesta y la acepta (se agendan todas las sesiones) o la
 *   rechaza; puede cancelar las sesiones que faltan.
 */
import { Hono } from "hono";
import type { AppBindings, Env, User } from "../env";
import { type AppointmentStatus, FREE_CANCEL_MS, STATUS_LABEL, paymentLabel } from "../lib/appointments";
import {
  BLOCKING,
  CONFLICT_LABEL,
  INTERVALS,
  MAX_HORIZON_MS,
  MAX_SESSIONS,
  MIN_SESSIONS,
  PLAN_LABEL,
  type PlanStatus,
  checkDates,
  paymentDeadline,
  proposalExpiry,
  seriesDates,
} from "../lib/followups";
import { readJson, requireUser } from "../lib/guards";
import { clean, fail, isCents } from "../lib/http";
import { notify, recipient } from "../lib/notify";
import { releaseEarnings } from "../lib/payouts";
import { type PractitionerRow, fullName, patientShortName } from "../lib/practitioners";
import { money } from "../lib/pricing";
import { RULES, hit } from "../lib/rate-limit";
import { refundPayment } from "../lib/settle";
import { getPayoutSettings } from "../lib/settings";
import { DAY, HOUR, formatLong, parseLocal } from "../lib/time";
import { type AppointmentRow, approvedPayment, insertAppointment } from "./appointments";
import { requirePractitioner } from "./pro";

type PlanRow = {
  id: number;
  practitioner_id: number;
  patient_id: string;
  patient_name: string;
  title: string;
  note: string;
  modality: "presencial" | "virtual";
  interval_days: number;
  price_cents: number;
  status: PlanStatus;
  expires_ms: number;
  source_appointment_id: number | null;
  created_by: string;
  cancel_reason: string;
  accepted_at: string | null;
  created_at: string;
};

type SessionRow = {
  seq: number;
  start_ms: number;
  status: "propuesta" | "agendada" | "conflicto" | "omitida";
  appointment_id: number | null;
  a_status: AppointmentStatus | null;
  a_start: number | null;
  payment_status: string | null;
  a_price: number | null;
  hold_expires_ms: number | null;
};

const origin = (c: { req: { url: string } }) => new URL(c.req.url).origin;

const sessionsOf = (db: D1Database, planId: number) =>
  db
    .prepare(
      `SELECT s.seq,s.start_ms,s.status,s.appointment_id,a.status AS a_status,a.start_ms AS a_start,a.payment_status,a.price_cents AS a_price,a.hold_expires_ms
       FROM followup_sessions s LEFT JOIN appointments a ON a.id=s.appointment_id WHERE s.plan_id=? ORDER BY s.seq`,
    )
    .bind(planId)
    .all<SessionRow>()
    .then((r) => r.results);

/** Vista de una serie con sus sesiones, adherencia y próxima cita. */
function planView(
  plan: PlanRow,
  sessions: SessionRow[],
  p: Pick<PractitionerRow, "title" | "display_name" | "slug" | "photo">,
  as: "patient" | "pro",
  now = Date.now(),
) {
  const items = sessions.map((s) => {
    const start = s.a_start ?? s.start_ms;
    const upcoming = s.a_status === "confirmada" && start > now;
    const unpaid = upcoming && (s.payment_status === "pendiente" || s.payment_status === "fallido");
    return {
      seq: s.seq,
      start_ms: start,
      session_status: s.status,
      appointment_id: s.appointment_id,
      status: s.a_status,
      status_label: s.a_status ? STATUS_LABEL[s.a_status] : s.status === "conflicto" ? "Por reagendar" : s.status === "omitida" ? "Sin agendar" : "Propuesta",
      payment_label: s.a_status ? paymentLabel({ payment_status: s.payment_status, price_cents: s.a_price }) : "",
      upcoming,
      unpaid,
      pay_before_ms: unpaid ? s.hold_expires_ms : null,
    };
  });
  const count = (f: (x: (typeof items)[number]) => boolean) => items.filter(f).length;
  const attended = count((x) => x.status === "completada");
  const noShow = count((x) => x.status === "no_asistio");
  const upcoming = items.filter((x) => x.upcoming);
  const conflicts = count((x) => x.session_status === "conflicto");
  const expired = plan.status === "propuesta" && plan.expires_ms < now;
  const state = expired ? "vencida" : plan.status === "activa" && !upcoming.length && !conflicts ? "finalizada" : plan.status;
  return {
    id: plan.id,
    title: plan.title,
    note: plan.note,
    modality: plan.modality,
    interval_days: plan.interval_days,
    price_cents: plan.price_cents,
    total_cents: plan.price_cents * items.length,
    status: state,
    status_label: PLAN_LABEL[state],
    expires_ms: plan.status === "propuesta" ? plan.expires_ms : null,
    created_at: plan.created_at,
    accepted_at: plan.accepted_at,
    cancel_reason: plan.cancel_reason,
    practitioner: { name: fullName(p), slug: p.slug, photo: p.photo },
    patient_name: as === "pro" ? plan.patient_name : patientShortName(plan.patient_name),
    sessions: items,
    summary: {
      total: items.length,
      attended,
      no_show: noShow,
      cancelled: count((x) => x.status === "cancelada" || x.session_status === "omitida"),
      upcoming: upcoming.length,
      unpaid: count((x) => x.unpaid),
      conflicts,
      /** Asistencia sobre las sesiones ya ocurridas. */
      adherence: attended + noShow ? Math.round((attended / (attended + noShow)) * 100) : null,
      next: upcoming[0] ? { start_ms: upcoming[0].start_ms, appointment_id: upcoming[0].appointment_id, unpaid: upcoming[0].unpaid } : null,
    },
    can: {
      accept: as === "patient" && plan.status === "propuesta" && !expired,
      decline: as === "patient" && plan.status === "propuesta" && !expired,
      cancel: (plan.status === "propuesta" && as === "pro" && !expired) || (plan.status === "activa" && (upcoming.length > 0 || conflicts > 0)),
    },
  };
}

/** Crea la cita de una sesión: confirmada y, si tiene tarifa, con pago con tarjeta pendiente hasta el plazo. */
async function scheduleSession(env: Env, plan: PlanRow, p: PractitionerRow, seq: number, start: number, feeBps: number, now = Date.now()) {
  const price = plan.price_cents;
  const fee = Math.round((price * feeBps) / 10_000);
  const inserted = await insertAppointment(env.DB, {
    p,
    patient: { id: plan.patient_id } as User,
    start,
    modality: plan.modality,
    status: "confirmada",
    hold: price > 0 ? paymentDeadline(start, now) : null,
    key: `fu-${plan.id}-${seq}-${start}`,
    price: { price_cents: price, fee_cents: fee, net_cents: price - fee },
    paymentMode: price > 0 ? "en_linea" : "consultorio",
    paymentStatus: price > 0 ? "pendiente" : "no_requerido",
    reason: "",
    patientName: plan.patient_name,
  });
  if (!inserted) return null;
  await env.DB.batch([
    env.DB.prepare("UPDATE followup_sessions SET status='agendada',appointment_id=?,start_ms=? WHERE plan_id=? AND seq=?").bind(
      inserted.id,
      start,
      plan.id,
      seq,
    ),
    env.DB.prepare("INSERT INTO appointment_events(appointment_id,type,actor_id,detail) VALUES(?,?,?,?)").bind(
      inserted.id,
      "subsecuente_agendada",
      null,
      JSON.stringify({ plan: plan.id, seq }),
    ),
  ]);
  return inserted.id;
}

/** Cancela las sesiones futuras de una serie (reembolso según quién cancela y la política de 4 h). */
async function cancelRemaining(env: Env, plan: PlanRow, by: "patient" | "pro", reason: string, now = Date.now()) {
  const db = env.DB;
  const rows = (
    await db
      .prepare(
        `SELECT a.* FROM followup_sessions s JOIN appointments a ON a.id=s.appointment_id
         WHERE s.plan_id=? AND a.status IN ('solicitada','confirmada') AND a.start_ms>?`,
      )
      .bind(plan.id, now)
      .all<AppointmentRow>()
  ).results;
  let cancelled = 0;
  let refunded = 0;
  for (const a of rows) {
    // El paciente no puede anular en bloque las sesiones de las próximas 4 h (puede cancelarlas una a una).
    if (by === "patient" && a.start_ms - now < FREE_CANCEL_MS) continue;
    const res = await db
      .prepare("UPDATE appointments SET status='cancelada',cancel_reason=?,hold_expires_ms=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=?")
      .bind(`${by === "patient" ? "Paciente" : "Profesional"}: ${reason}`.slice(0, 280), a.id, a.status)
      .run();
    if (!res.meta.changes) continue;
    cancelled++;
    await db
      .prepare(
        "UPDATE payments SET status='cancelado',error='Serie cancelada antes del pago',updated_at=CURRENT_TIMESTAMP WHERE appointment_id=? AND status IN ('creado','pendiente')",
      )
      .bind(a.id)
      .run();
    const paid = await approvedPayment(db, a.id);
    if (paid) {
      if (await refundPayment(env, paid, "Serie de citas subsecuentes cancelada")) refunded++;
      else await releaseEarnings(env, a.id);
    }
    await db
      .prepare("INSERT INTO appointment_events(appointment_id,type,actor_id,detail) VALUES(?,?,?,?)")
      .bind(a.id, "cancel", null, JSON.stringify({ plan: plan.id, by }))
      .run();
  }
  await db.prepare("UPDATE followup_sessions SET status='omitida' WHERE plan_id=? AND status IN ('propuesta','conflicto')").bind(plan.id).run();
  return { cancelled, refunded };
}

/* ------------------------------------------------------------------ Profesional */

export const proFollowups = new Hono<AppBindings>();

const loadProPlan = async (db: D1Database, p: PractitionerRow, raw: string) => {
  const plan = await db.prepare("SELECT * FROM followup_plans WHERE id=? AND practitioner_id=?").bind(Number(raw), p.id).first<PlanRow>();
  if (!plan) fail(404, "Serie no encontrada");
  return plan;
};

proFollowups.get("/", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  const p = await requirePractitioner(db, user);
  const now = Date.now();
  const [plans, recent, settings] = await Promise.all([
    db.prepare("SELECT * FROM followup_plans WHERE practitioner_id=? ORDER BY id DESC LIMIT 100").bind(p.id).all<PlanRow>(),
    db
      .prepare(
        `SELECT id,patient_id,patient_name,start_ms,modality FROM appointments WHERE practitioner_id=? AND status IN ('confirmada','completada')
         AND start_ms>? ORDER BY start_ms DESC LIMIT 400`,
      )
      .bind(p.id, now - 365 * DAY)
      .all<{ id: number; patient_id: string; patient_name: string; start_ms: number; modality: string }>(),
    getPayoutSettings(c.env),
  ]);
  const views = [];
  for (const plan of plans.results) views.push(planView(plan, await sessionsOf(db, plan.id), p, "pro", now));
  // Pacientes atendidos o con cita confirmada en el último año (uno por persona, el más reciente).
  const seen = new Set<string>();
  const patients = recent.results
    .filter((r) => !seen.has(r.patient_id) && seen.add(r.patient_id))
    .map((r) => ({ ref: r.id, name: r.patient_name || "Paciente", last_ms: r.start_ms, modality: r.modality }));
  const ref = Number(c.req.query("cita"));
  const fromAppointment = ref ? recent.results.find((r) => r.id === ref) : undefined;
  const active = views.filter((v) => v.status === "activa");
  const followed = views.filter((v) => ["activa", "propuesta"].includes(v.status));
  const past = views.flatMap((v) => v.sessions).filter((s) => s.status === "completada" || s.status === "no_asistio");
  const in30 = views.flatMap((v) => v.sessions).filter((s) => s.upcoming && s.start_ms < now + 30 * DAY);
  return c.json({
    plans: views,
    patients,
    prefill: fromAppointment ? { ref: fromAppointment.id, modality: fromAppointment.modality } : null,
    defaults: {
      price_in_person_cents: p.price_in_person_cents,
      price_virtual_cents: p.price_virtual_cents,
      in_person: !!p.in_person_enabled,
      virtual: !!p.virtual_enabled,
      slot_minutes: p.slot_minutes,
      intervals: INTERVALS,
      min_sessions: MIN_SESSIONS,
      max_sessions: MAX_SESSIONS,
      fee_bps: settings.fee_bps,
    },
    kpis: {
      active: active.length,
      patients: new Set(followed.map((v) => v.patient_name)).size,
      proposals: views.filter((v) => v.status === "propuesta").length,
      next30: in30.length,
      unpaid: in30.filter((s) => s.unpaid).length,
      conflicts: views.reduce((s, v) => s + v.summary.conflicts, 0),
      adherence: past.length ? Math.round((past.filter((s) => s.status === "completada").length / past.length) * 100) : null,
    },
  });
});

type SeriesInput = { first_start?: string | number; interval_days?: number; sessions?: number; modality?: string; starts?: unknown };

function readSeries(b: SeriesInput, p: PractitionerRow) {
  const modality = b.modality === "virtual" ? "virtual" : "presencial";
  if (modality === "virtual" && !p.virtual_enabled) fail(400, "Activa las citas virtuales en tu perfil para programarlas");
  if (modality === "presencial" && !p.in_person_enabled) fail(400, "Tu perfil solo ofrece citas virtuales");
  const interval = Number(b.interval_days);
  if (!Number.isInteger(interval) || interval < 1 || interval > 180) fail(400, "La frecuencia va de 1 a 180 días");
  let starts: number[];
  if (Array.isArray(b.starts)) {
    starts = b.starts.map((s) => parseLocal(s) ?? Number.NaN);
    if (starts.some((s) => !Number.isFinite(s))) fail(400, "Revisa las fechas de las sesiones");
  } else {
    const first = parseLocal(b.first_start);
    if (!first) fail(400, "Elige la fecha y hora de la primera sesión");
    const n = Number(b.sessions);
    if (!Number.isInteger(n)) fail(400, "Indica cuántas sesiones");
    starts = seriesDates(first, interval, n);
  }
  if (starts.length < MIN_SESSIONS || starts.length > MAX_SESSIONS) fail(400, `Una serie tiene de ${MIN_SESSIONS} a ${MAX_SESSIONS} sesiones`);
  if (starts.some((s, i) => i > 0 && s <= starts[i - 1])) fail(400, "Las sesiones deben ir en orden de fecha");
  if (starts[starts.length - 1] > Date.now() + MAX_HORIZON_MS) fail(400, "La serie no puede pasar de 18 meses");
  return { modality, interval, starts } as const;
}

/** Revisa la serie contra la agenda antes de enviarla (conflictos y avisos por fecha). */
proFollowups.post("/preview", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  const p = await requirePractitioner(db, user);
  const s = readSeries(await readJson<SeriesInput>(c), p);
  const sessions = (await checkDates(db, p, s.starts, s.modality)).map((x, i) => ({
    seq: i + 1,
    ...x,
    blocking: BLOCKING.includes(x.conflict),
    conflict_label: x.conflict ? CONFLICT_LABEL[x.conflict] : "",
  }));
  return c.json({ sessions, ok: !sessions.some((x) => x.blocking) });
});

proFollowups.post("/", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  await hit(db, `write:${user.id}`, RULES.write);
  const p = await requirePractitioner(db, user);
  if (p.demo) fail(400, "Los perfiles de muestra no programan citas subsecuentes");
  if (p.status !== "active") fail(409, "Tu perfil debe estar publicado para programar citas");
  const b = await readJson<SeriesInput & { patient_ref?: number; title?: string; note?: string; price_cents?: number }>(c);
  const source = await db
    .prepare("SELECT id,patient_id,patient_name FROM appointments WHERE id=? AND practitioner_id=?")
    .bind(Number(b.patient_ref), p.id)
    .first<{ id: number; patient_id: string; patient_name: string }>();
  if (!source) fail(400, "Elige un paciente que ya haya tenido cita contigo");
  const title = clean(b.title, 80);
  if (title.length < 3) fail(400, "Ponle un nombre a la serie (por ejemplo, «Control mensual»)");
  if (!isCents(b.price_cents) || Number(b.price_cents) > 1_000_000) fail(400, "Revisa la tarifa por sesión");
  const s = readSeries(b, p);
  const checked = await checkDates(db, p, s.starts, s.modality);
  const blocking = checked.find((x) => BLOCKING.includes(x.conflict));
  if (blocking) fail(409, `La sesión del ${formatLong(blocking.start_ms)} no está disponible: ${CONFLICT_LABEL[blocking.conflict!]}.`, "FOLLOWUP_CONFLICT");
  const now = Date.now();
  const plan = await db
    .prepare(
      `INSERT INTO followup_plans(practitioner_id,patient_id,patient_name,title,note,modality,interval_days,price_cents,status,expires_ms,source_appointment_id,created_by)
       VALUES(?,?,?,?,?,?,?,?,'propuesta',?,?,?) RETURNING id`,
    )
    .bind(
      p.id,
      source.patient_id,
      source.patient_name,
      title,
      clean(b.note, 280),
      s.modality,
      s.interval,
      Number(b.price_cents),
      proposalExpiry(s.starts[0], now),
      source.id,
      user.id,
    )
    .first<{ id: number }>();
  await db.batch(
    s.starts.map((start, i) => db.prepare("INSERT INTO followup_sessions(plan_id,seq,start_ms,status) VALUES(?,?,?,'propuesta')").bind(plan!.id, i + 1, start)),
  );
  const patient = await recipient(db, source.patient_id);
  // Sin título ni nota en el aviso: pueden contener información de salud.
  if (patient)
    c.executionCtx.waitUntil(
      notify(c.env, patient, {
        kind: "subsecuentes_propuesta",
        title: "Te propusieron citas de seguimiento",
        body: `${fullName(p)} te propone ${s.starts.length} citas ${s.modality === "virtual" ? "virtuales" : "presenciales"} desde el ${formatLong(s.starts[0])}. Revísalas y acéptalas en buscaDR.`,
        link: `/seguimientos/${plan!.id}`,
        origin: origin(c),
        ref: `serie:${plan!.id}`,
      }),
    );
  return c.json({ id: plan!.id }, 201);
});

proFollowups.post("/:id/cancel", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  await hit(db, `write:${user.id}`, RULES.write);
  const p = await requirePractitioner(db, user);
  const plan = await loadProPlan(db, p, c.req.param("id"));
  if (!["propuesta", "activa"].includes(plan.status)) fail(409, "Esta serie ya no está activa.");
  const reason = clean((await readJson<{ reason?: string }>(c)).reason, 200) || "Serie cancelada";
  const res = await cancelRemaining(c.env, plan, "pro", reason);
  await db
    .prepare("UPDATE followup_plans SET status='cancelada',cancel_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .bind(`Profesional: ${reason}`, plan.id)
    .run();
  const patient = await recipient(db, plan.patient_id);
  if (patient)
    c.executionCtx.waitUntil(
      notify(c.env, patient, {
        kind: "subsecuentes_cancelada",
        title: "Se canceló tu serie de citas de seguimiento",
        body: `${fullName(p)} canceló las citas que faltaban.${res.refunded ? ` Te reembolsamos ${res.refunded} ${res.refunded === 1 ? "pago" : "pagos"}.` : ""}`,
        link: `/seguimientos/${plan.id}`,
        origin: origin(c),
        ref: `serie:${plan.id}`,
      }),
    );
  return c.json({ ok: true, ...res });
});

/** Reagenda una sesión que quedó en conflicto al aceptarse la serie. */
proFollowups.post("/:id/sessions/:seq", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  await hit(db, `write:${user.id}`, RULES.write);
  const p = await requirePractitioner(db, user);
  const plan = await loadProPlan(db, p, c.req.param("id"));
  if (plan.status !== "activa") fail(409, "La serie no está en curso.");
  const seq = Number(c.req.param("seq"));
  const session = await db
    .prepare("SELECT seq,status FROM followup_sessions WHERE plan_id=? AND seq=?")
    .bind(plan.id, seq)
    .first<{ seq: number; status: string }>();
  if (session?.status !== "conflicto") fail(409, "Esta sesión no necesita reagendarse.");
  const start = parseLocal((await readJson<{ start?: string }>(c)).start);
  if (!start) fail(400, "Elige la nueva fecha y hora");
  const [check] = await checkDates(db, p, [start], plan.modality);
  if (BLOCKING.includes(check.conflict)) fail(409, CONFLICT_LABEL[check.conflict!], "FOLLOWUP_CONFLICT");
  const settings = await getPayoutSettings(c.env);
  const id = await scheduleSession(c.env, plan, p, seq, start, settings.fee_bps);
  if (!id) fail(409, "Ese horario acaba de ocuparse. Elige otro.", "BOOKING_SLOT_TAKEN");
  const patient = await recipient(db, plan.patient_id);
  if (patient)
    c.executionCtx.waitUntil(
      notify(c.env, patient, {
        kind: "cita_confirmada",
        title: "Se agendó una cita de tu serie de seguimiento",
        body: `${fullName(p)} · ${formatLong(start)}.${plan.price_cents ? ` Págala con tarjeta antes del ${formatLong(paymentDeadline(start))}.` : ""}`,
        link: `/citas/${id}`,
        origin: origin(c),
        ref: `cita:${id}`,
      }),
    );
  return c.json({ ok: true, appointment_id: id });
});

/* ------------------------------------------------------------------ Paciente */

export const followups = new Hono<AppBindings>();

async function loadForUser(db: D1Database, user: User, raw: string) {
  const plan = await db.prepare("SELECT * FROM followup_plans WHERE id=?").bind(Number(raw)).first<PlanRow>();
  const p = plan && (await db.prepare("SELECT * FROM practitioners WHERE id=?").bind(plan.practitioner_id).first<PractitionerRow>());
  // Sin fuga de existencia: una serie ajena responde igual que una inexistente.
  if (!plan || !p || (plan.patient_id !== user.id && p.user_id !== user.id)) fail(404, "Serie no encontrada");
  return { plan, p, as: plan.patient_id === user.id ? ("patient" as const) : ("pro" as const) };
}

followups.get("/", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  const rows = (
    await db
      .prepare(
        `SELECT f.*,p.title AS p_title,p.display_name,p.slug,p.photo FROM followup_plans f JOIN practitioners p ON p.id=f.practitioner_id
         WHERE f.patient_id=? AND f.status IN ('propuesta','activa') ORDER BY f.id DESC LIMIT 30`,
      )
      .bind(user.id)
      .all<PlanRow & { p_title: string; display_name: string; slug: string; photo: string }>()
  ).results;
  const plans = [];
  for (const r of rows) {
    const v = planView(r, await sessionsOf(db, r.id), { title: r.p_title, display_name: r.display_name, slug: r.slug, photo: r.photo }, "patient");
    if (v.status !== "finalizada" && v.status !== "vencida") plans.push(v);
  }
  return c.json({ plans });
});

followups.get("/:id", async (c) => {
  const user = requireUser(c);
  const { plan, p, as } = await loadForUser(c.env.DB, user, c.req.param("id"));
  return c.json({ plan: planView(plan, await sessionsOf(c.env.DB, plan.id), p, as), role: as });
});

followups.post("/:id/accept", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  await hit(db, `booking:${user.id}`, RULES.booking);
  const { plan, p, as } = await loadForUser(db, user, c.req.param("id"));
  if (as !== "patient") fail(404, "Serie no encontrada");
  const now = Date.now();
  if (plan.status !== "propuesta" || plan.expires_ms < now) fail(409, "Esta propuesta ya no está vigente. Pide a tu profesional una nueva.");
  const taken = await db
    .prepare("UPDATE followup_plans SET status='activa',accepted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='propuesta'")
    .bind(plan.id)
    .run();
  if (!taken.meta.changes) fail(409, "Esta propuesta ya fue respondida.");
  const settings = await getPayoutSettings(c.env);
  const proposed = (
    await db
      .prepare("SELECT seq,start_ms FROM followup_sessions WHERE plan_id=? AND status='propuesta' ORDER BY seq")
      .bind(plan.id)
      .all<{ seq: number; start_ms: number }>()
  ).results;
  const scheduled: number[] = [];
  let conflicts = 0;
  for (const s of proposed) {
    const id = s.start_ms > now + HOUR ? await scheduleSession(c.env, plan, p, s.seq, s.start_ms, settings.fee_bps, now) : null;
    if (id) scheduled.push(id);
    else {
      conflicts++;
      await db.prepare("UPDATE followup_sessions SET status='conflicto' WHERE plan_id=? AND seq=?").bind(plan.id, s.seq).run();
    }
  }
  const pro = await recipient(db, p.user_id);
  if (pro)
    c.executionCtx.waitUntil(
      notify(c.env, pro, {
        kind: "subsecuentes_aceptada",
        title: "Un paciente aceptó su serie de citas",
        body: `Serie #${plan.id}: ${scheduled.length} citas agendadas${conflicts ? ` y ${conflicts} por reagendar (el horario se ocupó)` : ""}.`,
        link: "/panel/subsecuentes",
        origin: origin(c),
        ref: `serie:${plan.id}`,
      }),
    );
  const first = scheduled.length
    ? await db.prepare("SELECT id,payment_status FROM appointments WHERE id=?").bind(scheduled[0]).first<{ id: number; payment_status: string }>()
    : null;
  return c.json({
    ok: true,
    scheduled: scheduled.length,
    conflicts,
    first_appointment: first?.id ?? null,
    pay_first: first?.payment_status === "pendiente",
    total_cents: plan.price_cents * scheduled.length,
    message: plan.price_cents
      ? `Agendamos ${scheduled.length} citas. Paga cada una con tarjeta hasta 24 h antes (${money(plan.price_cents)} por cita).`
      : `Agendamos ${scheduled.length} citas.`,
  });
});

followups.post("/:id/decline", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  await hit(db, `write:${user.id}`, RULES.write);
  const { plan, p, as } = await loadForUser(db, user, c.req.param("id"));
  if (as !== "patient") fail(404, "Serie no encontrada");
  const reason = clean((await readJson<{ reason?: string }>(c)).reason, 200);
  const res = await db
    .prepare("UPDATE followup_plans SET status='rechazada',cancel_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='propuesta'")
    .bind(reason ? `Paciente: ${reason}` : "", plan.id)
    .run();
  if (!res.meta.changes) fail(409, "Esta propuesta ya fue respondida.");
  await db.prepare("UPDATE followup_sessions SET status='omitida' WHERE plan_id=? AND status='propuesta'").bind(plan.id).run();
  const pro = await recipient(db, p.user_id);
  if (pro)
    c.executionCtx.waitUntil(
      notify(c.env, pro, {
        kind: "subsecuentes_rechazada",
        title: "Un paciente no aceptó su serie de citas",
        body: `Serie #${plan.id}. Puedes proponerle otras fechas desde Subsecuentes.`,
        link: "/panel/subsecuentes",
        origin: origin(c),
        ref: `serie:${plan.id}`,
      }),
    );
  return c.json({ ok: true });
});

followups.post("/:id/cancel", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  await hit(db, `write:${user.id}`, RULES.write);
  const { plan, p, as } = await loadForUser(db, user, c.req.param("id"));
  if (as !== "patient") fail(404, "Serie no encontrada");
  if (plan.status !== "activa") fail(409, "Esta serie no está en curso.");
  const reason = clean((await readJson<{ reason?: string }>(c)).reason, 200) || "Serie cancelada";
  const res = await cancelRemaining(c.env, plan, "patient", reason);
  await db
    .prepare("UPDATE followup_plans SET status='cancelada',cancel_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .bind(`Paciente: ${reason}`, plan.id)
    .run();
  const pro = await recipient(db, p.user_id);
  if (pro)
    c.executionCtx.waitUntil(
      notify(c.env, pro, {
        kind: "subsecuentes_cancelada",
        title: "Un paciente canceló su serie de citas",
        body: `Serie #${plan.id}: ${res.cancelled} ${res.cancelled === 1 ? "cita liberada" : "citas liberadas"} en tu agenda.`,
        link: "/panel/subsecuentes",
        origin: origin(c),
        ref: `serie:${plan.id}`,
      }),
    );
  return c.json({ ok: true, ...res });
});
