import type { Env } from "./env";
import { notify, recipient } from "./lib/notify";
import { DAY, HOUR, formatLong } from "./lib/time";

type Due = { id: number; start_ms: number; modality: string; patient_id: string; pro_user_id: string; name: string };

/**
 * Mantenimiento cada 30 minutos:
 * - vence las solicitudes que el profesional no confirmó o que no se pagaron (liberan la agenda);
 * - recordatorios de citas confirmadas 24 h y 1 h antes (paciente y profesional), una sola vez;
 * - vence las propuestas de citas subsecuentes y libera las sesiones no pagadas a tiempo (con aviso previo);
 * - vence los planes no renovados (vuelven a Free sin borrar datos);
 * - limpia sesiones vencidas y contadores de intentos antiguos.
 */
export async function scheduledMaintenance(env: Env, now = Date.now()) {
  const db = env.DB;
  const origin = (env.BUSCADR_PUBLIC_URL || "https://buscadr.elemente-digital.workers.dev").replace(/\/$/, "");
  const expiring = (
    await db
      .prepare(
        `SELECT a.id,a.start_ms,a.modality,a.patient_id,a.pro_user_id,a.payment_status,trim(p.title || ' ' || p.display_name) AS name,p.demo
         FROM appointments a JOIN practitioners p ON p.id=a.practitioner_id WHERE a.status='solicitada' AND a.hold_expires_ms<? LIMIT 100`,
      )
      .bind(now)
      .all<Due & { payment_status: string; demo: number }>()
  ).results;
  const results = await db.batch([
    db.prepare("UPDATE appointments SET status='expirada',updated_at=CURRENT_TIMESTAMP WHERE status='solicitada' AND hold_expires_ms<?").bind(now),
    db.prepare(
      "UPDATE payments SET status='cancelado',error='La cita venció antes del pago',updated_at=CURRENT_TIMESTAMP WHERE status IN ('creado','pendiente') AND appointment_id IN (SELECT id FROM appointments WHERE status='expirada')",
    ),
    db
      .prepare("UPDATE practitioners SET plan='free',updated_at=CURRENT_TIMESTAMP WHERE plan<>'free' AND plan_until_ms IS NOT NULL AND plan_until_ms<?")
      .bind(now),
    db.prepare("UPDATE subscriptions SET status='vencida' WHERE status='activa' AND period_end_ms<?").bind(now),
    db.prepare("DELETE FROM sessions WHERE expires_at<?").bind(now),
    db.prepare("DELETE FROM rate_limits WHERE blocked_until<? AND window_start<?").bind(now, now - DAY),
    db.prepare("DELETE FROM owner_resets WHERE expires_at<?").bind(now - DAY),
  ]);
  for (const a of expiring) {
    if (a.demo) continue;
    const patient = await recipient(db, a.patient_id);
    if (patient)
      await notify(env, patient, {
        kind: "cita_vencida",
        title: a.payment_status === "pendiente" ? "Tu reserva venció sin pago" : "Tu solicitud de cita venció",
        body: `${a.name} · ${formatLong(a.start_ms)}. El horario quedó libre: puedes elegir otro en buscaDR.`,
        link: `/citas/${a.id}`,
        origin,
        ref: `cita:${a.id}`,
      });
  }

  // Citas subsecuentes (ADR 0017): propuestas sin respuesta vencen; sesiones no pagadas a tiempo se liberan.
  await db.prepare("UPDATE followup_plans SET status='vencida',updated_at=CURRENT_TIMESTAMP WHERE status='propuesta' AND expires_ms<?").bind(now).run();
  const unpaid = (
    await db
      .prepare(
        `SELECT a.id,a.start_ms,a.modality,a.patient_id,a.pro_user_id,trim(p.title || ' ' || p.display_name) AS name
         FROM appointments a JOIN practitioners p ON p.id=a.practitioner_id
         WHERE a.status='confirmada' AND a.payment_mode='en_linea' AND a.payment_status IN ('pendiente','fallido') AND a.hold_expires_ms IS NOT NULL AND a.hold_expires_ms<? LIMIT 100`,
      )
      .bind(now)
      .all<Due>()
  ).results;
  for (const a of unpaid) {
    const res = await db
      .prepare(
        "UPDATE appointments SET status='cancelada',cancel_reason='Liberada: no se pagó a tiempo',hold_expires_ms=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='confirmada' AND payment_status IN ('pendiente','fallido')",
      )
      .bind(a.id)
      .run();
    if (!res.meta.changes) continue;
    await db.batch([
      db
        .prepare(
          "UPDATE payments SET status='cancelado',error='La cita se liberó sin pago',updated_at=CURRENT_TIMESTAMP WHERE appointment_id=? AND status IN ('creado','pendiente')",
        )
        .bind(a.id),
      db.prepare("INSERT INTO appointment_events(appointment_id,type,detail) VALUES(?,?,?)").bind(a.id, "liberada_sin_pago", "{}"),
    ]);
    const [patient, pro] = await Promise.all([recipient(db, a.patient_id), recipient(db, a.pro_user_id)]);
    if (patient)
      await notify(env, patient, {
        kind: "cita_vencida",
        title: "Tu cita de seguimiento se liberó sin pago",
        body: `${a.name} · ${formatLong(a.start_ms)}. No se pagó a tiempo y el horario quedó libre.`,
        link: `/citas/${a.id}`,
        origin,
        ref: `cita:${a.id}`,
      });
    if (pro)
      await notify(env, pro, {
        kind: "cita_cancelada",
        title: "Una cita subsecuente se liberó sin pago",
        body: `Cita #${a.id} del ${formatLong(a.start_ms)}. El horario quedó libre.`,
        link: `/panel/citas/${a.id}`,
        origin,
        email: false,
        ref: `cita:${a.id}`,
      });
  }
  // Recordatorio de pago una vez, 48 h antes del plazo.
  const toPay = (
    await db
      .prepare(
        `SELECT a.id,a.start_ms,a.modality,a.patient_id,a.pro_user_id,a.hold_expires_ms,a.price_cents,trim(p.title || ' ' || p.display_name) AS name
         FROM appointments a JOIN practitioners p ON p.id=a.practitioner_id
         WHERE a.status='confirmada' AND a.payment_mode='en_linea' AND a.payment_status IN ('pendiente','fallido') AND a.hold_expires_ms BETWEEN ? AND ?
           AND NOT EXISTS(SELECT 1 FROM appointment_events e WHERE e.appointment_id=a.id AND e.type='recordatorio_pago') LIMIT 40`,
      )
      .bind(now, now + 2 * DAY)
      .all<Due & { hold_expires_ms: number; price_cents: number }>()
  ).results;
  for (const a of toPay) {
    const patient = await recipient(db, a.patient_id);
    if (patient)
      await notify(env, patient, {
        kind: "recordatorio_pago",
        title: "Paga tu próxima cita de seguimiento",
        body: `${a.name} · ${formatLong(a.start_ms)}. Págala con tarjeta antes del ${formatLong(a.hold_expires_ms)} para conservar el horario.`,
        link: `/citas/${a.id}`,
        origin,
        ref: `cita:${a.id}`,
      });
    await db.prepare("INSERT INTO appointment_events(appointment_id,type,detail) VALUES(?,?,?)").bind(a.id, "recordatorio_pago", "{}").run();
  }

  let reminders = 0;
  for (const [type, ahead, label] of [
    ["recordatorio_24h", DAY, "mañana"],
    ["recordatorio_1h", HOUR, "en 1 hora"],
  ] as const) {
    const due = (
      await db
        .prepare(
          `SELECT a.id,a.start_ms,a.modality,a.patient_id,a.pro_user_id,trim(p.title || ' ' || p.display_name) AS name
           FROM appointments a JOIN practitioners p ON p.id=a.practitioner_id
           WHERE a.status='confirmada' AND p.demo=0 AND a.start_ms>? AND a.start_ms<=?
             AND NOT EXISTS(SELECT 1 FROM appointment_events e WHERE e.appointment_id=a.id AND e.type=?) LIMIT 40`,
        )
        .bind(now + (type === "recordatorio_24h" ? 2 * HOUR : 0), now + ahead, type)
        .all<Due>()
    ).results;
    for (const a of due) {
      const when = formatLong(a.start_ms);
      const extra =
        a.modality === "virtual" ? "Es virtual: el enlace de la videollamada se activa 15 min antes." : "Llega 10 minutos antes con tu código de llegada.";
      const [patient, pro] = await Promise.all([recipient(db, a.patient_id), recipient(db, a.pro_user_id)]);
      if (patient)
        await notify(env, patient, {
          kind: type,
          title: `Tu cita es ${label}`,
          body: `${a.name} · ${when}. ${extra}`,
          link: `/citas/${a.id}`,
          origin,
          ref: `cita:${a.id}`,
        });
      if (pro)
        await notify(env, pro, {
          kind: type,
          title: `Cita ${a.modality} ${label}`,
          body: `Cita #${a.id} · ${when}.`,
          link: `/panel/citas/${a.id}`,
          origin,
          email: false,
          ref: `cita:${a.id}`,
        });
      await db.prepare("INSERT INTO appointment_events(appointment_id,type,detail) VALUES(?,?,?)").bind(a.id, type, "{}").run();
      reminders++;
    }
  }
  return { expired: results[0].meta.changes, released: unpaid.length, plansExpired: results[2].meta.changes, sessions: results[4].meta.changes, reminders };
}
