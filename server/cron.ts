import type { Env } from "./env";
import { notify, recipient } from "./lib/notify";
import { DAY, HOUR, formatLong } from "./lib/time";

type Due = { id: number; start_ms: number; modality: string; patient_id: string; pro_user_id: string; name: string };

/**
 * Mantenimiento cada 30 minutos:
 * - vence las solicitudes que el profesional no confirmó o que no se pagaron (liberan la agenda);
 * - recordatorios de citas confirmadas 24 h y 1 h antes (paciente y profesional), una sola vez;
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
  return { expired: results[0].meta.changes, plansExpired: results[2].meta.changes, sessions: results[4].meta.changes, reminders };
}
