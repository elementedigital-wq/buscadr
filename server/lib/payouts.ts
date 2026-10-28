/**
 * Liquidación al profesional (ADR 0016). buscaDR cobra cada cita con tarjeta y le debe al profesional
 * su parte: el importe menos la comisión. Cada cobro aprobado crea una línea en `earnings`:
 *
 *   retenido ──(cita atendida, no asistió o cancelación tardía)──▶ disponible (tras `release_days`)
 *   disponible ──(liquidación)──▶ liquidando ──(transferencia registrada)──▶ pagado
 *   retenido/disponible ──(reembolso)──▶ anulado · liquidando/pagado ──(reembolso)──▶ línea de ajuste negativa
 *
 * La transferencia la hace buscaDR a la cuenta del profesional (guardada cifrada) y queda registrada con
 * su referencia bancaria. Los cobros del modo de prueba se liquidan aparte y se rotulan «Prueba».
 */
import type { Env } from "../env";
import { HttpError, clean } from "./http";
import { notify, recipient } from "./notify";
import { type PaymentRow, gatewayOf } from "./payments";
import { money } from "./pricing";
import { decryptJson, encryptJson, secretsKeyConfigured } from "./secrets";
import { getPayoutSettings } from "./settings";
import { DAY } from "./time";

export type EarningStatus = "retenido" | "disponible" | "liquidando" | "pagado" | "anulado";

export const EARNING_LABEL: Record<EarningStatus, string> = {
  retenido: "Cita por realizar",
  disponible: "Disponible",
  liquidando: "En liquidación",
  pagado: "Transferido",
  anulado: "Reembolsado al paciente",
};

/** Registra la parte del profesional de un cobro con tarjeta aprobado (idempotente). */
export async function recordEarning(env: Env, payment: PaymentRow) {
  if (payment.kind !== "cita" || !payment.practitioner_id) return;
  const g = gatewayOf(payment);
  if (g !== "sandbox" && g !== "payphone") return;
  const bps = payment.amount_cents > 0 ? Math.round((payment.fee_cents * 10_000) / payment.amount_cents) : 0;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO earnings(practitioner_id,payment_id,appointment_id,kind,gross_cents,fee_cents,net_cents,fee_bps,status,test)
     SELECT ?,?,?,'cita',?,?,?,?,'retenido',? WHERE EXISTS(SELECT 1 FROM practitioners WHERE id=? AND demo=0)`,
  )
    .bind(
      payment.practitioner_id,
      payment.id,
      payment.appointment_id,
      payment.amount_cents,
      payment.fee_cents,
      payment.net_cents,
      bps,
      g === "sandbox" ? 1 : 0,
      payment.practitioner_id,
    )
    .run();
}

/** La cita ya ocurrió (o se canceló tarde sin reembolso): la parte del profesional pasa a liquidable. */
export async function releaseEarnings(env: Env, appointmentId: number, now = Date.now()) {
  const s = await getPayoutSettings(env);
  await env.DB.prepare(
    "UPDATE earnings SET status='disponible',available_ms=?,updated_at=CURRENT_TIMESTAMP WHERE appointment_id=? AND kind='cita' AND status='retenido'",
  )
    .bind(now + s.release_days * DAY, appointmentId)
    .run()
    .catch(() => undefined);
}

/** Reembolso: anula la línea si aún no se liquidó; si ya se liquidó, descuenta con una línea de ajuste. */
export async function voidEarning(env: Env, payment: PaymentRow, now = Date.now()) {
  const db = env.DB;
  const res = await db
    .prepare("UPDATE earnings SET status='anulado',updated_at=CURRENT_TIMESTAMP WHERE payment_id=? AND kind='cita' AND status IN ('retenido','disponible')")
    .bind(payment.id)
    .run()
    .catch(() => null);
  if (!res || res.meta.changes) return;
  await db
    .prepare(
      `INSERT OR IGNORE INTO earnings(practitioner_id,payment_id,appointment_id,kind,gross_cents,fee_cents,net_cents,fee_bps,status,available_ms,test)
       SELECT practitioner_id,payment_id,appointment_id,'ajuste',-gross_cents,-fee_cents,-net_cents,fee_bps,'disponible',?,test
       FROM earnings WHERE payment_id=? AND kind='cita' AND status IN ('liquidando','pagado')`,
    )
    .bind(now, payment.id)
    .run();
}

/** Al reprogramar, el cobro (y su línea) acompaña a la cita nueva. */
export const moveEarnings = (db: D1Database, from: number, to: number) =>
  db.prepare("UPDATE earnings SET appointment_id=?,updated_at=CURRENT_TIMESTAMP WHERE appointment_id=?").bind(to, from);

/* ------------------------------------------------------------------ Saldos */

export type Balance = { retained: number; available: number; releasing: number; in_payout: number; paid: number };
const emptyBalance = (): Balance => ({ retained: 0, available: 0, releasing: 0, in_payout: 0, paid: 0 });

/** Saldos del profesional, separados en reales y de prueba. */
export async function balances(db: D1Database, practitionerId: number | null, now = Date.now()) {
  const rows = (
    await db
      .prepare(
        `SELECT practitioner_id, test,
           COALESCE(SUM(CASE WHEN status='retenido' THEN net_cents END),0) AS retained,
           COALESCE(SUM(CASE WHEN status='disponible' AND available_ms<=?1 THEN net_cents END),0) AS available,
           COALESCE(SUM(CASE WHEN status='disponible' AND available_ms>?1 THEN net_cents END),0) AS releasing,
           COALESCE(SUM(CASE WHEN status='liquidando' THEN net_cents END),0) AS in_payout,
           COALESCE(SUM(CASE WHEN status='pagado' THEN net_cents END),0) AS paid
         FROM earnings WHERE (?2 IS NULL OR practitioner_id=?2) GROUP BY practitioner_id, test`,
      )
      .bind(now, practitionerId)
      .all<Balance & { practitioner_id: number; test: number }>()
  ).results;
  const map = new Map<number, { real: Balance; test: Balance }>();
  for (const r of rows) {
    const entry = map.get(r.practitioner_id) ?? { real: emptyBalance(), test: emptyBalance() };
    const { practitioner_id: _p, test, ...b } = r;
    entry[test ? "test" : "real"] = b;
    map.set(r.practitioner_id, entry);
  }
  return map;
}

/* ------------------------------------------------------------------ Cuenta bancaria */

export const ACCOUNT_TYPES = ["Ahorros", "Corriente"] as const;
export type PayoutAccount = { bank: string; account_type: string; account_number: string; holder: string; id_number: string; email: string };

/** Valida y normaliza la cuenta; lanza 400 con el primer problema. */
export function validateAccount(input: Record<string, unknown>): PayoutAccount {
  const a: PayoutAccount = {
    bank: clean(input.bank, 60),
    account_type: clean(input.account_type, 20),
    account_number: clean(input.account_number, 30).replace(/[\s-]/g, ""),
    holder: clean(input.holder, 80),
    id_number: clean(input.id_number, 20).replace(/[\s-]/g, ""),
    email: clean(input.email, 120).toLowerCase(),
  };
  if (a.bank.length < 3) throw new HttpError(400, "Escribe el nombre del banco o cooperativa");
  if (!(ACCOUNT_TYPES as readonly string[]).includes(a.account_type)) throw new HttpError(400, "Elige el tipo de cuenta");
  if (!/^\d{6,20}$/.test(a.account_number)) throw new HttpError(400, "El número de cuenta tiene de 6 a 20 dígitos");
  if (a.holder.length < 3) throw new HttpError(400, "Escribe el titular como figura en el banco");
  if (!/^(\d{10}|\d{13})$/.test(a.id_number)) throw new HttpError(400, "La cédula tiene 10 dígitos y el RUC 13");
  if (a.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) throw new HttpError(400, "Revisa el correo para comprobantes");
  return a;
}

export const accountHint = (a: PayoutAccount) => `${a.bank} · ${a.account_type} ••••${a.account_number.slice(-4)} · ${a.holder}`;

export async function saveAccount(env: Env, practitionerId: number, a: PayoutAccount) {
  if (!secretsKeyConfigured(env))
    throw new HttpError(503, "Aún no podemos guardar cuentas bancarias de forma segura. Inténtalo más tarde o escribe a soporte.", "SECRETS_KEY_MISSING");
  const enc = await encryptJson(env, a);
  await env.DB.prepare("UPDATE practitioners SET payout_account_enc=?,payout_account_hint=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .bind(enc, accountHint(a), practitionerId)
    .run();
}

export const readAccount = (env: Env, enc: string) => decryptJson(env, enc) as Promise<Partial<PayoutAccount>>;

/* ------------------------------------------------------------------ Liquidaciones */

export type PayoutResult = { practitioner_id: number; payout_id?: number; amount_cents?: number; skipped?: string };

/** Genera la liquidación de lo disponible de un profesional (reales o de prueba por separado). */
export async function createPayout(env: Env, practitionerId: number, test: boolean, actor: string, now = Date.now()): Promise<PayoutResult> {
  const db = env.DB;
  const s = await getPayoutSettings(env);
  const p = await db
    .prepare("SELECT id,payout_account_enc,payout_account_hint FROM practitioners WHERE id=? AND demo=0")
    .bind(practitionerId)
    .first<{ id: number; payout_account_enc: string; payout_account_hint: string }>();
  if (!p) return { practitioner_id: practitionerId, skipped: "Profesional no encontrado" };
  if (!test && !p.payout_account_enc) return { practitioner_id: practitionerId, skipped: "Sin cuenta bancaria registrada" };
  const sum = await db
    .prepare(
      "SELECT COALESCE(SUM(net_cents),0) AS total, COUNT(*) AS n FROM earnings WHERE practitioner_id=? AND test=? AND status='disponible' AND available_ms<=?",
    )
    .bind(practitionerId, test ? 1 : 0, now)
    .first<{ total: number; n: number }>();
  if (!sum?.n || sum.total <= 0) return { practitioner_id: practitionerId, skipped: "Sin saldo disponible" };
  if (sum.total < s.min_payout_cents) return { practitioner_id: practitionerId, skipped: `Saldo menor al mínimo (${money(s.min_payout_cents)})` };
  const created = await db
    .prepare("INSERT INTO payouts(practitioner_id,status,test,account_hint,account_enc,created_by) VALUES(?,'pendiente',?,?,?,?) RETURNING id")
    .bind(practitionerId, test ? 1 : 0, test ? "Prueba: no se transfiere dinero" : p.payout_account_hint, test ? "" : p.payout_account_enc, actor)
    .first<{ id: number }>();
  const id = created!.id;
  await db.batch([
    db
      .prepare(
        "UPDATE earnings SET status='liquidando',payout_id=?,updated_at=CURRENT_TIMESTAMP WHERE practitioner_id=? AND test=? AND status='disponible' AND available_ms<=?",
      )
      .bind(id, practitionerId, test ? 1 : 0, now),
    db
      .prepare(
        "UPDATE payouts SET amount_cents=(SELECT COALESCE(SUM(net_cents),0) FROM earnings WHERE payout_id=?1),lines=(SELECT COUNT(*) FROM earnings WHERE payout_id=?1) WHERE id=?1",
      )
      .bind(id),
  ]);
  const row = await db.prepare("SELECT amount_cents FROM payouts WHERE id=?").bind(id).first<{ amount_cents: number }>();
  if (!row || row.amount_cents <= 0) {
    await cancelPayout(env, id);
    return { practitioner_id: practitionerId, skipped: "Sin saldo disponible" };
  }
  return { practitioner_id: practitionerId, payout_id: id, amount_cents: row.amount_cents };
}

/** Anula una liquidación pendiente: sus líneas vuelven a estar disponibles. */
export async function cancelPayout(env: Env, id: number) {
  const db = env.DB;
  const res = await db.prepare("UPDATE payouts SET status='anulada',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pendiente'").bind(id).run();
  if (!res.meta.changes) return false;
  await db
    .prepare("UPDATE earnings SET status='disponible',payout_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE payout_id=? AND status='liquidando'")
    .bind(id)
    .run();
  return true;
}

/** Registra la transferencia hecha al profesional y le avisa (sin datos de pacientes). */
export async function markPayoutPaid(env: Env, origin: string, id: number, reference: string, actor: string) {
  const db = env.DB;
  const res = await db
    .prepare(
      "UPDATE payouts SET status='pagada',reference=?,paid_by=?,paid_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pendiente'",
    )
    .bind(reference, actor, id)
    .run();
  if (!res.meta.changes) return false;
  await db.prepare("UPDATE earnings SET status='pagado',updated_at=CURRENT_TIMESTAMP WHERE payout_id=? AND status='liquidando'").bind(id).run();
  const po = await db
    .prepare("SELECT po.amount_cents,po.test,p.user_id FROM payouts po JOIN practitioners p ON p.id=po.practitioner_id WHERE po.id=?")
    .bind(id)
    .first<{ amount_cents: number; test: number; user_id: string }>();
  const pro = po && (await recipient(db, po.user_id));
  if (po && pro)
    await notify(env, pro, {
      kind: "liquidacion_pagada",
      title: po.test ? "Liquidación de prueba registrada" : "Te transferimos tus ingresos",
      body: po.test
        ? `Liquidación #${id} de ${money(po.amount_cents)} (modo de prueba: no se transfirió dinero).`
        : `Liquidación #${id}: ${money(po.amount_cents)} a tu cuenta registrada. Referencia ${reference}.`,
      link: "/panel/ingresos",
      origin,
      ref: `liquidacion:${id}`,
      appOnly: !!po.test,
    });
  return true;
}
