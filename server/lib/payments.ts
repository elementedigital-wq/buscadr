/**
 * buscaDR Pay (ADR 0004): checkout propio dentro de la app y libro de transacciones en D1.
 *
 * Cada cobro (cita o plan) es una fila de `payments` con su bitácora (`payment_events`). El dinero lo
 * procesa un proveedor autorizado; buscaDR no guarda números de tarjeta ni CVV.
 *
 * - `sandbox` (predeterminado): checkout de prueba en /pagar/:id con tarjetas de prueba. Se rotula
 *   «Modo de prueba» y no mueve dinero. Permite probar todo el flujo de punta a punta.
 * - `payphone`: Payphone (Ecuador). El servidor prepara el cobro, el paciente paga en la página segura
 *   de Payphone y, al volver, el servidor CONFIRMA con Payphone y compara importe e identificador
 *   antes de marcar «aprobado». Un parámetro del navegador nunca aprueba un pago (Estructura §J.4).
 *   Antes de activar en producción, contrastar los endpoints con la documentación vigente de Payphone.
 */
import type { Env } from "../env";
import { GATEWAY_MAP, type GatewayId, gatewaySecrets, paymentOptions } from "./gateways";
import { HttpError } from "./http";
import { HOUR } from "./time";

export type Provider = "sandbox" | "payphone";
export type PaymentRow = {
  id: string;
  kind: "cita" | "plan";
  appointment_id: number | null;
  plan: string | null;
  payer_id: string;
  practitioner_id: number | null;
  amount_cents: number;
  fee_cents: number;
  net_cents: number;
  currency: string;
  provider: Provider | "consultorio";
  /** Medio concreto (ADR 0013); vacío en pagos anteriores = `provider`. */
  gateway: string;
  provider_ref: string;
  status: "creado" | "pendiente" | "aprobado" | "rechazado" | "cancelado" | "reembolsado";
  method: string;
  card_brand: string;
  card_last4: string;
  authorization_code: string;
  error: string;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  refunded_at: string | null;
};

export const PAYMENT_STATUS_LABEL: Record<PaymentRow["status"], string> = {
  creado: "Creado",
  pendiente: "En proceso",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  cancelado: "Cancelado",
  reembolsado: "Reembolsado",
};

/** Medio del pago: `gateway` o, en pagos anteriores a las pasarelas configurables, `provider`. */
export const gatewayOf = (p: Pick<PaymentRow, "gateway" | "provider">) => (p.gateway || p.provider) as GatewayId;
/** Pago cobrado por buscaDR (no en el consultorio): aplica comisión y se reembolsa. */
export const collectedOnline = (p: Pick<PaymentRow, "gateway" | "provider">) => gatewayOf(p) !== "consultorio";
/** SQL equivalente a `collectedOnline` (alias `pay` o sin alias). */
export const ONLINE_SQL = (alias = "") => `COALESCE(NULLIF(${alias}gateway,''),${alias}provider)<>'consultorio'`;

async function payphoneCreds(env: Env) {
  const s = await gatewaySecrets(env, "payphone");
  return s.token && s.store_id ? { token: s.token, storeId: s.store_id } : null;
}

const PAYPHONE = "https://pay.payphonetodoesposible.com/api";

export const nowText = () => new Date().toISOString().replace("T", " ").slice(0, 19);

export const paymentEvent = (db: D1Database, id: string, type: string, detail: Record<string, unknown> = {}) =>
  db.prepare("INSERT INTO payment_events(payment_id,type,detail) VALUES(?,?,?)").bind(id, type, JSON.stringify(detail));

/** Crea la transacción en el libro (estado «creado»). El importe sale del servidor, nunca del cliente. */
export async function createPayment(
  db: D1Database,
  env: Env,
  p: {
    kind: "cita" | "plan";
    appointment_id?: number | null;
    plan?: string | null;
    payer_id: string;
    practitioner_id: number | null;
    amount_cents: number;
    fee_cents: number;
    net_cents: number;
    /** Medio elegido; si falta, el primero activo para pagar en línea (orden del CMS). */
    gateway?: GatewayId;
  },
) {
  const id = crypto.randomUUID();
  const { online } = await paymentOptions(env);
  const chosen = (p.gateway && online.find((g) => g.id === p.gateway)) || online[0];
  if (!chosen) throw new HttpError(409, "Por ahora no hay medios de pago en línea activos. Elige pagar en el consultorio.", "NO_ONLINE_GATEWAY");
  const gateway = chosen.id;
  const provider = GATEWAY_MAP.get(gateway)!.provider;
  await db.batch([
    db
      .prepare(
        "INSERT INTO payments(id,kind,appointment_id,plan,payer_id,practitioner_id,amount_cents,fee_cents,net_cents,provider,gateway,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,'creado')",
      )
      .bind(id, p.kind, p.appointment_id ?? null, p.plan ?? null, p.payer_id, p.practitioner_id, p.amount_cents, p.fee_cents, p.net_cents, provider, gateway),
    paymentEvent(db, id, "creado", { gateway, amount_cents: p.amount_cents }),
  ]);
  return { id, provider, gateway };
}

/**
 * Inicia el cobro. Sandbox: checkout propio de buscaDR. Payphone: prepara la transacción y devuelve
 * la URL segura de pago con tarjeta (el número de tarjeta nunca pasa por buscaDR).
 */
export async function startCheckout(env: Env, payment: PaymentRow, origin: string, description: string, fetchFn: typeof fetch = fetch) {
  if (gatewayOf(payment) !== "payphone") return { url: `/pagar/${payment.id}` };
  const creds = await payphoneCreds(env);
  if (!creds) return null;
  const res = await fetchFn(`${PAYPHONE}/button/Prepare`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: payment.amount_cents,
      amountWithoutTax: payment.amount_cents,
      amountWithTax: 0,
      tax: 0,
      service: 0,
      tip: 0,
      currency: "USD",
      clientTransactionId: payment.id.replace(/-/g, "").slice(0, 32),
      storeId: creds.storeId,
      reference: description.slice(0, 100),
      responseUrl: `${origin}/pagos/retorno`,
      cancellationUrl: `${origin}/pagos/retorno?cancelado=1&ref=${payment.id}`,
      timeZone: -5,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  const data = (await res?.json().catch(() => null)) as {
    paymentId?: string | number;
    payWithCard?: string;
    payWithPayPhone?: string;
    message?: string;
  } | null;
  if (!res?.ok || !data?.payWithCard) {
    await env.DB.batch([
      env.DB.prepare("UPDATE payments SET status='rechazado',error=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('creado','pendiente')").bind(
        String(data?.message ?? `Payphone ${res?.status ?? "sin respuesta"}`).slice(0, 200),
        payment.id,
      ),
      paymentEvent(env.DB, payment.id, "payphone_prepare_error", { status: res?.status ?? 0 }),
    ]);
    return null;
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE payments SET status='pendiente',provider_ref=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(
      String(data.paymentId ?? ""),
      payment.id,
    ),
    paymentEvent(env.DB, payment.id, "payphone_preparado", {}),
  ]);
  return { url: data.payWithCard };
}

/**
 * Transferencia bancaria: el horario se retiene como una solicitud normal (24 h o hasta 1 h antes),
 * no 30 minutos, porque la confirmación del pago es manual.
 */
export async function holdForTransfer(db: D1Database, appointmentId: number, startMs: number, now = Date.now()) {
  const until = Math.max(now + 30 * 60_000, Math.min(now + 24 * HOUR, startMs - HOUR));
  await db
    .prepare("UPDATE appointments SET hold_expires_ms=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='solicitada' AND payment_status='pendiente'")
    .bind(Math.min(until, startMs), appointmentId)
    .run();
}

/** Identificador corto que se envía a Payphone (clientTransactionId) a partir del id del libro. */
export const clientTxIdOf = (paymentId: string) => paymentId.replace(/-/g, "").slice(0, 32);

export type ConfirmResult = { approved: boolean; status: PaymentRow["status"]; brand?: string; last4?: string; authorization?: string; error?: string };

/** Confirma con Payphone una transacción que volvió al sitio. Compara importe e identificador. */
export async function confirmPayphone(env: Env, payment: PaymentRow, transactionId: string, fetchFn: typeof fetch = fetch): Promise<ConfirmResult> {
  if (!/^\d{1,20}$/.test(transactionId)) return { approved: false, status: "rechazado", error: "Identificador de transacción inválido" };
  const creds = await payphoneCreds(env);
  if (!creds) return { approved: false, status: "pendiente", error: "Payphone no está configurado." };
  const res = await fetchFn(`${PAYPHONE}/button/V2/Confirm`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: Number(transactionId), clientTxId: clientTxIdOf(payment.id) }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  const data = (await res?.json().catch(() => null)) as {
    statusCode?: number;
    transactionStatus?: string;
    amount?: number;
    clientTransactionId?: string;
    cardBrand?: string;
    lastDigits?: string;
    authorizationCode?: string;
    message?: string;
  } | null;
  if (!res?.ok || !data) return { approved: false, status: "pendiente", error: "No se pudo confirmar con Payphone. Reintenta en unos segundos." };
  const sameTx = data.clientTransactionId === clientTxIdOf(payment.id);
  const sameAmount = Number(data.amount) === payment.amount_cents;
  const approved = data.statusCode === 3 && String(data.transactionStatus).toLowerCase() === "approved" && sameTx && sameAmount;
  if (approved)
    return {
      approved,
      status: "aprobado",
      brand: data.cardBrand ?? "",
      last4: String(data.lastDigits ?? "").slice(-4),
      authorization: data.authorizationCode ?? "",
    };
  return {
    approved: false,
    status: data.statusCode === 2 ? "cancelado" : "rechazado",
    error: !sameTx || !sameAmount ? "La respuesta del proveedor no coincide con la transacción" : (data.message ?? "Pago no aprobado"),
  };
}

/**
 * Reverso/reembolso. Sandbox: inmediato. Payphone: reverso por clientTransactionId. Transferencia:
 * se registra aquí y la administración devuelve el dinero por transferencia (queda en la bitácora).
 */
export async function refundWithProvider(env: Env, payment: PaymentRow, fetchFn: typeof fetch = fetch) {
  if (gatewayOf(payment) !== "payphone") return true;
  const creds = await payphoneCreds(env);
  if (!creds) return false;
  const res = await fetchFn(`${PAYPHONE}/Reverse/Client`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: clientTxIdOf(payment.id) }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  return !!res?.ok;
}

/* ------------------------------------------------------------ Sandbox (tarjetas de prueba) */

/** Algoritmo de Luhn: valida el formato del número de tarjeta de prueba. */
export function luhn(num: string) {
  const digits = num.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function cardBrand(num: string) {
  const d = num.replace(/\D/g, "");
  if (/^4/.test(d)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(d)) return "Mastercard";
  if (/^3[47]/.test(d)) return "American Express";
  if (/^3(0[0-5]|[68])/.test(d)) return "Diners Club";
  return "Tarjeta";
}

/** Tarjetas de prueba del sandbox: termina en 0002 → rechazada; cualquier otra válida → aprobada. */
export function sandboxDecision(card: { number: string; exp: string; cvv: string; name: string }, now = new Date()) {
  const number = card.number.replace(/\s+/g, "");
  if (!luhn(number)) return { ok: false, error: "El número de tarjeta no es válido." };
  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(card.exp.trim());
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) return { ok: false, error: "Escribe la fecha de vencimiento como MM/AA." };
  const exp = new Date(Date.UTC(2000 + Number(m[2]), Number(m[1]), 1));
  if (exp.getTime() <= now.getTime()) return { ok: false, error: "La tarjeta está vencida." };
  if (!/^\d{3,4}$/.test(card.cvv)) return { ok: false, error: "El código de seguridad tiene 3 o 4 dígitos." };
  if (card.name.trim().length < 3) return { ok: false, error: "Escribe el nombre como aparece en la tarjeta." };
  if (number.endsWith("0002")) return { ok: false, declined: true, error: "El banco rechazó el pago (tarjeta de prueba de rechazo)." };
  return { ok: true, brand: cardBrand(number), last4: number.slice(-4), authorization: `SBX${Math.floor(100000 + Math.random() * 900000)}` };
}

export const PLAN_PERIOD_MS = 30 * 24 * HOUR;
