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
import { GATEWAY_MAP, isGatewayId, paymentOptions, publicGateway } from "../lib/gateways";
import { notify, recipient } from "../lib/notify";
import {
  PAYMENT_STATUS_LABEL,
  type PaymentRow,
  clientTxIdOf,
  confirmPayphone,
  gatewayOf,
  holdForTransfer,
  paymentEvent,
  sandboxDecision,
  startCheckout,
} from "../lib/payments";
import { RULES, hit } from "../lib/rate-limit";
import { settlePayment } from "../lib/settle";
import { formatLong } from "../lib/time";

export const payments = new Hono<AppBindings>();

const ID = /^[0-9a-f-]{36}$/;
/** Referencia corta para el concepto de la transferencia («BDR-1A2B3C4D»). */
export const transferReference = (id: string) => `BDR-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
const OPEN = ["creado", "pendiente", "rechazado"];

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
      gateway: gatewayOf(pay),
      gateway_title: (await paymentOptions(c.env)).all.find((g) => g.id === gatewayOf(pay))?.title ?? "",
      reference: transferReference(pay.id),
      receipt: gatewayOf(pay) === "transferencia" ? pay.provider_ref : "",
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
    // Medios para elegir en el checkout (orden y textos del CMS) y la cuenta para transferir.
    methods: (await paymentOptions(c.env)).online.map(publicGateway),
  });
});

/** Reintenta el checkout (p. ej., si el paciente cerró la página de Payphone). */
payments.post("/:id/checkout", async (c) => {
  const user = requireUser(c);
  const pay = await loadPayment(c.env.DB, c.req.param("id"));
  if (pay.payer_id !== user.id) fail(404, "Pago no encontrado");
  if (!OPEN.includes(pay.status)) fail(409, "Este pago ya no admite cambios");
  const res = await startCheckout(
    c.env,
    pay,
    new URL(c.req.url).origin,
    pay.kind === "plan" ? `Plan buscaDR ${pay.plan}` : `Cita buscaDR #${pay.appointment_id}`,
  );
  if (!res) fail(502, "La pasarela no respondió. Intenta de nuevo en unos minutos.");
  return c.json({ url: res.url });
});

/**
 * Cambia el medio de pago antes de pagar (como elegir método en el checkout de WooCommerce). Solo
 * medios activos en el CMS. Transferencia: queda «pendiente» y el horario se retiene más tiempo.
 */
payments.post("/:id/method", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  const pay = await loadPayment(db, c.req.param("id"));
  if (pay.payer_id !== user.id) fail(404, "Pago no encontrado");
  if (!OPEN.includes(pay.status)) fail(409, "Este pago ya no admite cambios");
  const wanted = (await readJson<{ gateway?: string }>(c)).gateway;
  const { online } = await paymentOptions(c.env);
  if (!isGatewayId(wanted) || !online.some((g) => g.id === wanted)) fail(400, "Ese medio de pago no está disponible");
  if (wanted !== gatewayOf(pay)) {
    const provider = GATEWAY_MAP.get(wanted)!.provider;
    const status = wanted === "transferencia" ? "pendiente" : "creado";
    await db.batch([
      db
        .prepare(
          "UPDATE payments SET gateway=?,provider=?,status=?,provider_ref='',error='',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('creado','pendiente','rechazado')",
        )
        .bind(wanted, provider, status, pay.id),
      paymentEvent(db, pay.id, "medio_elegido", { gateway: wanted }),
    ]);
    if (wanted === "transferencia" && pay.appointment_id) {
      const a = await db.prepare("SELECT start_ms FROM appointments WHERE id=?").bind(pay.appointment_id).first<{ start_ms: number }>();
      if (a) await holdForTransfer(db, pay.appointment_id, a.start_ms);
    }
  }
  return c.json({ ok: true, gateway: wanted });
});

/** El paciente registra el número de comprobante de su transferencia; la administración lo confirma. */
payments.post("/:id/transfer", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  await hit(db, `pay:${user.id}`, RULES.payment);
  const pay = await loadPayment(db, c.req.param("id"));
  if (pay.payer_id !== user.id) fail(404, "Pago no encontrado");
  if (gatewayOf(pay) !== "transferencia" || pay.status !== "pendiente") fail(409, "Este pago no espera una transferencia");
  const receipt = String((await readJson<{ receipt?: string }>(c)).receipt ?? "")
    .replace(/[^\w .#/-]/g, "")
    .trim()
    .slice(0, 40);
  if (receipt.length < 4) fail(400, "Escribe el número de comprobante (mínimo 4 caracteres)");
  await db.batch([
    db.prepare("UPDATE payments SET provider_ref=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(receipt, pay.id),
    paymentEvent(db, pay.id, "transferencia_reportada", { receipt }),
  ]);
  // Aviso al propietario (administración) para revisar la cuenta bancaria y confirmar.
  const owner = await db.prepare("SELECT id FROM users WHERE staff_role='admin' LIMIT 1").first<{ id: string }>();
  const to = owner ? await recipient(db, owner.id) : null;
  if (to)
    c.executionCtx.waitUntil(
      notify(c.env, to, {
        kind: "transferencia_reportada",
        title: "Transferencia por confirmar",
        body: `${transferReference(pay.id)} · $${(pay.amount_cents / 100).toFixed(2)} · comprobante ${receipt}`,
        link: "/admin",
        appOnly: true,
        origin: new URL(c.req.url).origin,
      }),
    );
  return c.json({ ok: true, receipt });
});

/** Modo sandbox: tarjetas de prueba (4111 1111 1111 1111 aprueba; terminadas en 0002 se rechazan). */
payments.post("/:id/sandbox", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  await hit(db, `pay:${user.id}`, RULES.payment);
  const pay = await loadPayment(db, c.req.param("id"));
  if (pay.payer_id !== user.id) fail(404, "Pago no encontrado");
  if (gatewayOf(pay) !== "sandbox") fail(409, "Este pago se procesa con otro medio de pago");
  if (!(await paymentOptions(c.env)).online.some((g) => g.id === "sandbox")) fail(409, "El pago de prueba está desactivado. Elige otro medio de pago.");
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
  if (!pay || pay.payer_id !== user.id || gatewayOf(pay) !== "payphone" || clientTxIdOf(pay.id) !== clientTx) fail(404, "Pago no encontrado");
  if (pay.status === "aprobado" || pay.status === "reembolsado") return c.json({ id: pay.id, status: pay.status });
  const result = await confirmPayphone(c.env, pay, String(b.id ?? ""));
  await paymentEvent(db, pay.id, "payphone_confirmacion", { status: result.status }).run();
  const status = await settlePayment(c.env, new URL(c.req.url).origin, pay, result);
  return c.json({ id: pay.id, status, error: result.approved ? null : result.error });
});
