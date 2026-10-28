/**
 * buscaDR Pay (ADR 0004). Checkout dentro de la app y libro de transacciones.
 * - GET /api/payments/:id: resumen para el checkout (solo quien paga, el profesional o la administración).
 * - POST /api/payments/:id/sandbox: pago con tarjeta de PRUEBA (modo sandbox; no mueve dinero).
 * - POST /api/payments/payphone/confirm: retorno desde Payphone; el servidor confirma con Payphone.
 * - GET /api/payments: historial de pagos de la cuenta en sesión.
 * Nunca se recibe ni guarda el número completo de una tarjeta real: Payphone la procesa en su página.
 */
import { Hono } from "hono";
import type { AppBindings } from "../env";
import { PLAN_MAP } from "../lib/catalog";
import { isAdmin, readJson, requireUser } from "../lib/guards";
import { fail } from "../lib/http";
import { PAYMENT_STATUS_LABEL, type PaymentRow, clientTxIdOf, confirmPayphone, paymentEvent, sandboxDecision, startCheckout } from "../lib/payments";
import { RULES, hit } from "../lib/rate-limit";
import { settlePayment } from "../lib/settle";
import { formatLong } from "../lib/time";

export const payments = new Hono<AppBindings>();

const ID = /^[0-9a-f-]{36}$/;

async function loadPayment(db: D1Database, id: string) {
  if (!ID.test(id)) fail(404, "Pago no encontrado");
  const p = await db.prepare("SELECT * FROM payments WHERE id=?").bind(id).first<PaymentRow>();
  if (!p) fail(404, "Pago no encontrado");
  return p;
}

payments.get("/", async (c) => {
  const user = requireUser(c);
  const rows = (
    await c.env.DB.prepare(
      `SELECT pay.id,pay.kind,pay.plan,pay.appointment_id,pay.amount_cents,pay.provider,pay.status,pay.card_brand,pay.card_last4,pay.created_at,pay.approved_at,pay.refunded_at,
              trim(p.title || ' ' || p.display_name) AS practitioner
       FROM payments pay LEFT JOIN practitioners p ON p.id=pay.practitioner_id WHERE pay.payer_id=? ORDER BY pay.created_at DESC LIMIT 100`,
    )
      .bind(user.id)
      .all<Record<string, any>>()
  ).results;
  return c.json({ items: rows.map((r) => ({ ...r, status_label: PAYMENT_STATUS_LABEL[r.status as PaymentRow["status"]] })) });
});

payments.get("/:id", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  const pay = await loadPayment(db, c.req.param("id"));
  const owner = pay.practitioner_id
    ? await db.prepare("SELECT user_id FROM practitioners WHERE id=?").bind(pay.practitioner_id).first<{ user_id: string }>()
    : null;
  if (pay.payer_id !== user.id && owner?.user_id !== user.id && !isAdmin(user, c.env)) fail(404, "Pago no encontrado");
  const appt = pay.appointment_id
    ? await db
        .prepare(
          `SELECT a.id,a.status,a.start_ms,a.modality,a.hold_expires_ms,trim(p.title || ' ' || p.display_name) AS name,p.specialty,p.photo,p.demo
           FROM appointments a JOIN practitioners p ON p.id=a.practitioner_id WHERE a.id=?`,
        )
        .bind(pay.appointment_id)
        .first<Record<string, any>>()
    : null;
  return c.json({
    payment: {
      id: pay.id,
      kind: pay.kind,
      plan: pay.plan ? (PLAN_MAP.get(pay.plan)?.name ?? pay.plan) : null,
      amount_cents: pay.amount_cents,
      currency: pay.currency,
      provider: pay.provider,
      status: pay.status,
      status_label: PAYMENT_STATUS_LABEL[pay.status],
      card_brand: pay.card_brand,
      card_last4: pay.card_last4,
      error: pay.error,
      created_at: pay.created_at,
      approved_at: pay.approved_at,
      mine: pay.payer_id === user.id,
      description: appt ? `Cita ${appt.modality} con ${appt.name}` : `Plan ${PLAN_MAP.get(pay.plan ?? "")?.name ?? ""} · 30 días`,
      appointment: appt && { ...appt, when: formatLong(appt.start_ms), demo: !!appt.demo },
    },
  });
});

/** Reintenta el checkout (p. ej., si el paciente cerró la página de Payphone). */
payments.post("/:id/checkout", async (c) => {
  const user = requireUser(c);
  const pay = await loadPayment(c.env.DB, c.req.param("id"));
  if (pay.payer_id !== user.id) fail(404, "Pago no encontrado");
  if (!["creado", "pendiente", "rechazado"].includes(pay.status)) fail(409, "Este pago ya no admite cambios");
  const res = await startCheckout(
    c.env,
    pay,
    new URL(c.req.url).origin,
    pay.kind === "plan" ? `Plan buscaDR ${pay.plan}` : `Cita buscaDR #${pay.appointment_id}`,
  );
  if (!res) fail(502, "La pasarela no respondió. Intenta de nuevo en unos minutos.");
  return c.json({ url: res.url });
});

/** Modo sandbox: tarjetas de prueba (4111 1111 1111 1111 aprueba; terminadas en 0002 se rechazan). */
payments.post("/:id/sandbox", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  await hit(db, `pay:${user.id}`, RULES.payment);
  const pay = await loadPayment(db, c.req.param("id"));
  if (pay.payer_id !== user.id) fail(404, "Pago no encontrado");
  if (pay.provider !== "sandbox") fail(409, "Este pago se procesa con la pasarela real");
  if (pay.status === "aprobado") return c.json({ status: "aprobado" });
  if (!["creado", "pendiente", "rechazado"].includes(pay.status)) fail(409, "Este pago ya no admite cambios");
  const b = await readJson<{ number?: string; exp?: string; cvv?: string; name?: string }>(c);
  const d = sandboxDecision({ number: String(b.number ?? ""), exp: String(b.exp ?? ""), cvv: String(b.cvv ?? ""), name: String(b.name ?? "") });
  if (!d.ok && !d.declined) fail(400, d.error ?? "Revisa los datos de la tarjeta");
  // Solo se guardan marca y últimos 4 dígitos; nunca el número completo ni el CVV.
  await paymentEvent(db, pay.id, "sandbox_intento", { ok: d.ok }).run();
  const status = await settlePayment(
    c.env,
    new URL(c.req.url).origin,
    pay,
    d.ok
      ? { approved: true, status: "aprobado", brand: d.brand, last4: d.last4, authorization: d.authorization }
      : { approved: false, status: "rechazado", error: d.error },
  );
  return c.json({ status, error: d.ok ? null : d.error });
});

/** Retorno de Payphone: `id` (transacción de Payphone) y `clientTransactionId` (nuestro). */
payments.post("/payphone/confirm", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  await hit(db, `pay:${user.id}`, RULES.payment);
  const b = await readJson<{ id?: string | number; clientTransactionId?: string }>(c);
  const clientTx = String(b.clientTransactionId ?? "");
  if (!/^[0-9a-f]{32}$/.test(clientTx)) fail(400, "Referencia de pago inválida");
  const pay = await db.prepare("SELECT * FROM payments WHERE replace(id,'-','')=?").bind(clientTx).first<PaymentRow>();
  if (!pay || pay.payer_id !== user.id || pay.provider !== "payphone" || clientTxIdOf(pay.id) !== clientTx) fail(404, "Pago no encontrado");
  if (pay.status === "aprobado" || pay.status === "reembolsado") return c.json({ id: pay.id, status: pay.status });
  const result = await confirmPayphone(c.env, pay, String(b.id ?? ""));
  await paymentEvent(db, pay.id, "payphone_confirmacion", { status: result.status }).run();
  const status = await settlePayment(c.env, new URL(c.req.url).origin, pay, result);
  return c.json({ id: pay.id, status, error: result.approved ? null : result.error });
});
