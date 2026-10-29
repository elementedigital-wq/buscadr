/**
 * Citas subsecuentes (ADR 0017): series de controles programadas por el profesional para pacientes
 * que necesitan seguimiento (controles prenatales, crónicos, terapias, curaciones…).
 *
 * El profesional propone las fechas; el paciente acepta o rechaza. Al aceptar, cada sesión es una
 * cita CONFIRMADA (el profesional ya eligió el horario). Si tiene tarifa, el paciente la paga con
 * tarjeta hasta 24 h antes (`paymentDeadline`); si no paga, el horario se libera solo (cron).
 * El título y la nota de la serie son datos de salud: solo para las dos partes, nunca en avisos.
 */
import type { User } from "../env";
import { BLOCK_SQL, OVERLAP_SQL } from "./appointments";
import { planDates } from "./plan-templates";
import type { PractitionerRow } from "./practitioners";
import { DAY, HOUR, MINUTE, localWeekday, toLocalInput } from "./time";

export const MAX_SESSIONS = 24;
export const MIN_SESSIONS = 2;
/** Una propuesta sin respuesta vence a las 72 h (o 2 h antes de la primera sesión). */
export const PROPOSAL_TTL_MS = 72 * HOUR;
/** Horizonte máximo de una serie (18 meses). */
export const MAX_HORIZON_MS = 548 * DAY;
/** Frecuencias sugeridas en el formulario (días). */
export const INTERVALS = [7, 14, 21, 28, 30, 60, 90] as const;

export type PlanStatus = "propuesta" | "activa" | "rechazada" | "cancelada" | "vencida";
export const PLAN_LABEL: Record<PlanStatus | "finalizada", string> = {
  propuesta: "Esperando al paciente",
  activa: "En curso",
  finalizada: "Finalizada",
  rechazada: "Rechazada por el paciente",
  cancelada: "Cancelada",
  vencida: "Propuesta vencida",
};

/** Fechas de la serie a partir de la primera sesión y la frecuencia. */
export const seriesDates = (first: number, intervalDays: number, sessions: number) =>
  Array.from({ length: sessions }, (_, i) => first + i * intervalDays * DAY);

/** Plazo para pagar una sesión: 24 h antes; si ya no hay margen, 1 h antes (al menos 30 min desde ahora). */
export function paymentDeadline(start: number, now = Date.now()) {
  const due = start - DAY;
  if (due >= now + 2 * HOUR) return due;
  return Math.min(start, Math.max(now + 30 * MINUTE, start - HOUR));
}

export const proposalExpiry = (first: number, now = Date.now()) => Math.max(now + HOUR, Math.min(now + PROPOSAL_TTL_MS, first - 2 * HOUR));

export type Conflict = "pasado" | "ocupado" | "bloqueado" | "fuera_horario" | "repetido" | null;
export const CONFLICT_LABEL: Record<Exclude<Conflict, null>, string> = {
  pasado: "Fecha pasada o muy próxima",
  ocupado: "Ya tienes una cita a esa hora",
  bloqueado: "Hay un bloqueo en tu agenda",
  fuera_horario: "Fuera de tu horario habitual",
  repetido: "Se cruza con otra sesión de la serie",
};
/** Conflictos que impiden enviar la propuesta (fuera de horario solo es un aviso). */
export const BLOCKING: Conflict[] = ["pasado", "ocupado", "bloqueado", "repetido"];

type Pract = { id: number; slot_minutes: number; buffer_minutes: number };

/** Revisa cada fecha contra la agenda real del profesional. */
export async function checkDates(db: D1Database, p: Pract, starts: number[], modality: "presencial" | "virtual", now = Date.now()) {
  const span = (p.slot_minutes + p.buffer_minutes) * MINUTE;
  const rules = (
    await db
      .prepare("SELECT weekday,start_min,end_min,modality FROM availability_rules WHERE practitioner_id=?")
      .bind(p.id)
      .all<{ weekday: number; start_min: number; end_min: number; modality: string }>()
  ).results;
  const out: { start_ms: number; local: string; conflict: Conflict }[] = [];
  for (const [i, start] of starts.entries()) {
    const until = start + span;
    let conflict: Conflict = null;
    if (start < now + HOUR) conflict = "pasado";
    else if (starts.some((o, j) => j !== i && o < until && o + span > start)) conflict = "repetido";
    else {
      const [busy, blocked] = await Promise.all([
        db.prepare(OVERLAP_SQL).bind(p.id, now, until, start).first(),
        db.prepare(BLOCK_SQL).bind(p.id, until, start).first(),
      ]);
      if (busy) conflict = "ocupado";
      else if (blocked) conflict = "bloqueado";
      else {
        const local = toLocalInput(start);
        const minute = Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
        const wd = localWeekday(start);
        const inRules = rules.some(
          (r) => r.weekday === wd && r.start_min <= minute && minute + p.slot_minutes <= r.end_min && (r.modality === "ambas" || r.modality === modality),
        );
        if (!inRules) conflict = "fuera_horario";
      }
    }
    out.push({ start_ms: start, local: toLocalInput(start), conflict });
  }
  return out;
}

/**
 * Plan pedido por el paciente al reservar (ADR 0019): la sesión 1 es la cita reservada y las demás
 * quedan propuestas con la misma hora, cada `interval_days`. Vence 24 h antes de la segunda sesión
 * (máximo 7 días) si el profesional no responde.
 */
export async function createPatientPlan(
  db: D1Database,
  v: {
    p: PractitionerRow;
    patient: User;
    patientName: string;
    appointmentId: number;
    start: number;
    modality: "presencial" | "virtual";
    priceCents: number;
    plan: { title: string; template: string; interval_days: number; sessions: number };
  },
  now = Date.now(),
) {
  const dates = planDates(v.start, v.plan.interval_days, v.plan.sessions);
  const expires = Math.max(now + HOUR, Math.min(now + 7 * DAY, dates[1] - DAY));
  const row = await db
    .prepare(
      `INSERT INTO followup_plans(practitioner_id,patient_id,patient_name,title,note,modality,interval_days,price_cents,status,expires_ms,source_appointment_id,created_by,requested_by,template)
       VALUES(?,?,?,?,'',?,?,?,'propuesta',?,?,?,'patient',?) RETURNING id`,
    )
    .bind(
      v.p.id,
      v.patient.id,
      v.patientName,
      v.plan.title,
      v.modality,
      v.plan.interval_days,
      v.priceCents,
      expires,
      v.appointmentId,
      v.patient.id,
      v.plan.template,
    )
    .first<{ id: number }>();
  const id = row!.id;
  await db.batch(
    dates.map((start, i) =>
      i === 0
        ? db.prepare("INSERT INTO followup_sessions(plan_id,seq,start_ms,appointment_id,status) VALUES(?,1,?,?,'agendada')").bind(id, start, v.appointmentId)
        : db.prepare("INSERT INTO followup_sessions(plan_id,seq,start_ms,status) VALUES(?,?,?,'propuesta')").bind(id, i + 1, start),
    ),
  );
  return id;
}

/** La primera cita de un plan pedido por el paciente no se realizó: el plan pendiente se cancela. */
export const cancelPendingPlanFor = (db: D1Database, appointmentId: number, reason: string) =>
  db
    .prepare(
      `UPDATE followup_plans SET status='cancelada',cancel_reason=?,updated_at=CURRENT_TIMESTAMP
       WHERE status='propuesta' AND requested_by='patient' AND id IN (SELECT plan_id FROM followup_sessions WHERE appointment_id=? AND seq=1)`,
    )
    .bind(reason, appointmentId);
