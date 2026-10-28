/**
 * Liquidación de pagos de buscaDR Pay: aplica un resultado confirmado por el servidor a la cita o al
 * plan, y avisa a las partes. Idempotente: un pago ya aprobado no se vuelve a aplicar.
 */
import type { Env } from "../env";
import { STATUS_LABEL, holdUntil } from "./appointments";
import { PLAN_MAP } from "./catalog";
import { track } from "./events";
import { notify, recipient } from "./notify";
import { type ConfirmResult, PLAN_PERIOD_MS, type PaymentRow, nowText, paymentEvent, refundWithProvider } from "./payments";
import { money } from "./pricing";
import { formatLong } from "./time";

type AppointmentLite = {
  id: number;
  status: string;
  start_ms: number;
  practitioner_id: number;
  patient_id: string;
  pro_user_id: string;
  modality: string;
  auto_confirm: number;
  demo: number;
  name: string;
};

const loadAppointment = (db: D1Database, id: number) =>
  db
    .prepare(
      `SELECT a.id,a.status,a.start_ms,a.practitioner_id,a.patient_id,a.pro_user_id,a.modality,p.auto_confirm,p.demo,
              trim(p.title || ' ' || p.display_name) AS name
       FROM appointments a JOIN practitioners p ON p.id=a.practitioner_id WHERE a.id=?`,
    )
    .bind(id)
    .first<AppointmentLite>();

/** Aviso al profesional de una solicitud nueva, con botones de WhatsApp para confirmar o rechazar. */
export async function notifyNewRequest(env: Env, origin: string, a: AppointmentLite, confirmed: boolean) {
  if (a.demo) return;
  const pro = await recipient(env.DB, a.pro_user_id);
  if (!pro) return;
  const when = formatLong(a.start_ms);
  const kind = a.modality === "virtual" ? "virtual" : "presencial";
  const link = `/panel/citas/${a.id}`;
  const title = confirmed ? `Nueva cita ${kind} confirmada` : `Nueva solicitud de cita ${kind}`;
  const body = confirmed
    ? `Cita #${a.id} el ${when}. Ya está en tu agenda.`
    : `Cita #${a.id} para el ${when}. Confírmala o recházala desde tu panel o con los botones de WhatsApp.`;
  await notify(env, pro, {
    kind: confirmed ? "cita_confirmada" : "cita_solicitada",
    title,
    body,
    link,
    origin,
    ref: `cita:${a.id}`,
    whatsapp: confirmed
      ? undefined
      : {
          template: env.WHATSAPP_TEMPLATE_REQUEST
            ? { kind: "template", name: env.WHATSAPP_TEMPLATE_REQUEST, params: [kind, when, `#${a.id}`], buttonPayloads: [`acc:${a.id}`, `rej:${a.id}`] }
            : undefined,
          fallback: {
            kind: "buttons",
            body: `buscaDR · ${title}: ${body}\n${origin}${link}`,
            buttons: [
              { id: `acc:${a.id}`, title: "Confirmar" },
              { id: `rej:${a.id}`, title: "Rechazar" },
            ],
          },
        },
  });
}

/** Aviso al paciente de un cambio de estado de su cita (confirmación, rechazo, cancelación…). */
export async function notifyPatient(
  env: Env,
  origin: string,
  a: { id: number; patient_id: string; start_ms: number; name: string; demo: number },
  kind: string,
  title: string,
  body?: string,
) {
  const patient = await recipient(env.DB, a.patient_id);
  if (!patient) return;
  await notify(env, patient, {
    kind,
    title,
    body: body ?? `${a.name} · ${formatLong(a.start_ms)}. Cita #${a.id}.`,
    link: `/citas/${a.id}`,
    origin,
    ref: `cita:${a.id}`,
    // Los perfiles de muestra no envían WhatsApp ni correo: solo el aviso dentro de la app.
    appOnly: !!a.demo,
  });
}

/** Aplica un resultado de pago confirmado por el servidor. */
export async function settlePayment(env: Env, origin: string, payment: PaymentRow, result: ConfirmResult) {
  const db = env.DB;
  if (payment.status === "aprobado" || payment.status === "reembolsado") return payment.status;
  if (!result.approved) {
    await db.batch([
      db
        .prepare("UPDATE payments SET status=?,error=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('creado','pendiente','rechazado')")
        .bind(result.status === "pendiente" ? "pendiente" : result.status, (result.error ?? "").slice(0, 200), payment.id),
      paymentEvent(db, payment.id, "no_aprobado", { status: result.status }),
      ...(payment.appointment_id && result.status !== "pendiente"
        ? [
            db
              .prepare("UPDATE appointments SET payment_status='fallido',updated_at=CURRENT_TIMESTAMP WHERE id=? AND payment_status='pendiente'")
              .bind(payment.appointment_id),
          ]
        : []),
    ]);
    await track(db, "payment_failed", { userId: payment.payer_id, appointmentId: payment.appointment_id, props: { provider: payment.provider } });
    return result.status;
  }
  const res = await db
    .prepare(
      "UPDATE payments SET status='aprobado',card_brand=?,card_last4=?,authorization_code=?,method=?,error='',approved_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('creado','pendiente','rechazado')",
    )
    .bind(result.brand ?? "", result.last4 ?? "", result.authorization ?? "", "tarjeta", nowText(), payment.id)
    .run();
  if (!res.meta.changes) return "aprobado";
  await paymentEvent(db, payment.id, "aprobado", { provider: payment.provider }).run();
  await track(db, "payment_approved", {
    userId: payment.payer_id,
    appointmentId: payment.appointment_id,
    props: { kind: payment.kind, amount: payment.amount_cents },
  });

  if (payment.kind === "plan" && payment.plan && payment.practitioner_id) {
    const now = Date.now();
    const current = await db
      .prepare("SELECT plan_until_ms FROM practitioners WHERE id=?")
      .bind(payment.practitioner_id)
      .first<{ plan_until_ms: number | null }>();
    const start = Math.max(now, current?.plan_until_ms ?? 0);
    await db.batch([
      db
        .prepare("INSERT INTO subscriptions(practitioner_id,plan,status,amount_cents,period_start_ms,period_end_ms,payment_id) VALUES(?,?,'activa',?,?,?,?)")
        .bind(payment.practitioner_id, payment.plan, payment.amount_cents, start, start + PLAN_PERIOD_MS, payment.id),
      db
        .prepare("UPDATE practitioners SET plan=?,plan_until_ms=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(payment.plan, start + PLAN_PERIOD_MS, payment.practitioner_id),
    ]);
    await track(db, "subscription_activated", { userId: payment.payer_id, practitionerId: payment.practitioner_id, props: { plan: payment.plan } });
    const payer = await recipient(db, payment.payer_id);
    if (payer)
      await notify(env, payer, {
        kind: "plan_activado",
        title: `Plan ${PLAN_MAP.get(payment.plan)?.name ?? payment.plan} activo`,
        body: `Pago de ${money(payment.amount_cents)} aprobado. Tu plan está activo por 30 días.`,
        link: "/panel/plan",
        origin,
        ref: `pago:${payment.id}`,
      });
    return "aprobado";
  }

  if (payment.appointment_id) {
    const a = await loadAppointment(db, payment.appointment_id);
    if (!a) return "aprobado";
    // Si la cita se canceló o venció mientras se pagaba, se reembolsa sola.
    if (!["solicitada", "confirmada"].includes(a.status)) {
      await refundPayment(env, { ...payment, status: "aprobado" }, "La cita ya no estaba activa al aprobarse el pago");
      return "reembolsado";
    }
    const now = Date.now();
    const confirm = a.status === "solicitada" && (!!a.auto_confirm || !!a.demo);
    await db.batch([
      db
        .prepare(
          `UPDATE appointments SET payment_status='pagado',updated_at=CURRENT_TIMESTAMP,
             status=CASE WHEN ?1=1 THEN 'confirmada' ELSE status END,
             confirmed_at=CASE WHEN ?1=1 THEN CURRENT_TIMESTAMP ELSE confirmed_at END,
             hold_expires_ms=CASE WHEN ?1=1 THEN NULL WHEN status='solicitada' THEN ?2 ELSE hold_expires_ms END
           WHERE id=?3`,
        )
        .bind(confirm ? 1 : 0, holdUntil(now, a.start_ms), a.id),
      db
        .prepare("INSERT INTO appointment_events(appointment_id,type,actor_id,detail) VALUES(?,?,?,?)")
        .bind(a.id, "pago_aprobado", payment.payer_id, JSON.stringify({ payment: payment.id })),
    ]);
    await notifyPatient(
      env,
      origin,
      a,
      "pago_aprobado",
      confirm ? "Pago aprobado y cita confirmada" : "Pago aprobado",
      `${money(payment.amount_cents)} · ${a.name}. ${confirm ? STATUS_LABEL.confirmada : "Esperando la confirmación del profesional"}.`,
    );
    if (a.status === "solicitada") await notifyNewRequest(env, origin, a, confirm);
  }
  return "aprobado";
}

/** Reembolso (rechazo o cancelación de una cita pagada). Deja constancia aunque el proveedor falle. */
export async function refundPayment(env: Env, payment: PaymentRow, reason: string) {
  const db = env.DB;
  if (payment.status !== "aprobado") return false;
  const ok = await refundWithProvider(env, payment);
  if (!ok) {
    await paymentEvent(db, payment.id, "reembolso_fallido", { reason }).run();
    return false;
  }
  await db.batch([
    db
      .prepare("UPDATE payments SET status='reembolsado',refunded_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='aprobado'")
      .bind(nowText(), payment.id),
    paymentEvent(db, payment.id, "reembolsado", { reason: reason.slice(0, 160) }),
    ...(payment.appointment_id
      ? [db.prepare("UPDATE appointments SET payment_status='reembolsado',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(payment.appointment_id)]
      : []),
  ]);
  await track(db, "payment_refunded", { userId: payment.payer_id, appointmentId: payment.appointment_id });
  return true;
}
