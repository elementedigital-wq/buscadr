/**
 * Liquidaciones al profesional (ADR 0016).
 * - `/api/pro/payouts`: saldos, liquidaciones y cuenta bancaria del profesional en sesión.
 * - `/api/admin/payouts`: el propietario genera liquidaciones, exporta las transferencias y registra
 *   cada pago con su referencia bancaria.
 */
import { Hono } from "hono";
import type { AppBindings } from "../env";
import { STATUS_LABEL, type AppointmentStatus } from "../lib/appointments";
import { readJson, requireAdmin, requireUser } from "../lib/guards";
import { clean, fail } from "../lib/http";
import {
  ACCOUNT_TYPES,
  EARNING_LABEL,
  type EarningStatus,
  balances,
  cancelPayout,
  createPayout,
  markPayoutPaid,
  readAccount,
  saveAccount,
  validateAccount,
} from "../lib/payouts";
import { fullName, patientShortName } from "../lib/practitioners";
import { RULES, hit } from "../lib/rate-limit";
import { secretsKeyConfigured } from "../lib/secrets";
import { getPayoutSettings } from "../lib/settings";
import { requirePractitioner } from "./pro";

const PAYOUT_LABEL: Record<string, string> = { pendiente: "En proceso", pagada: "Transferida", anulada: "Anulada" };
const emptyBalance = { retained: 0, available: 0, releasing: 0, in_payout: 0, paid: 0 };

/* ------------------------------------------------------------------ Profesional */

export const proPayouts = new Hono<AppBindings>();

proPayouts.get("/", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  const p = await requirePractitioner(db, user);
  const [settings, bal, payouts, lines] = await Promise.all([
    getPayoutSettings(c.env),
    balances(db, p.id),
    db
      .prepare(
        "SELECT id,amount_cents,lines,status,test,account_hint,reference,created_at,paid_at FROM payouts WHERE practitioner_id=? ORDER BY id DESC LIMIT 24",
      )
      .bind(p.id)
      .all<Record<string, any>>(),
    db
      .prepare(
        `SELECT e.id,e.kind,e.appointment_id,e.gross_cents,e.fee_cents,e.net_cents,e.status,e.available_ms,e.payout_id,e.test,e.created_at,
                a.start_ms,a.status AS appointment_status,a.patient_name,a.modality
         FROM earnings e LEFT JOIN appointments a ON a.id=e.appointment_id WHERE e.practitioner_id=? ORDER BY e.id DESC LIMIT 60`,
      )
      .bind(p.id)
      .all<Record<string, any>>(),
  ]);
  const b = bal.get(p.id);
  return c.json({
    settings,
    balance: { real: b?.real ?? emptyBalance, test: b?.test ?? emptyBalance },
    account: { configured: !!p.payout_account_hint, hint: p.payout_account_hint, types: ACCOUNT_TYPES, secure: secretsKeyConfigured(c.env) },
    payouts: payouts.results.map((r) => ({ ...r, status_label: PAYOUT_LABEL[r.status] ?? r.status })),
    lines: lines.results.map((r) => ({
      ...r,
      patient_name: patientShortName(r.patient_name ?? ""),
      status_label: EARNING_LABEL[r.status as EarningStatus],
      appointment_label: r.appointment_status ? STATUS_LABEL[r.appointment_status as AppointmentStatus] : "",
    })),
  });
});

proPayouts.put("/account", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  await hit(db, `write:${user.id}`, RULES.write);
  const p = await requirePractitioner(db, user);
  const account = validateAccount(await readJson<Record<string, unknown>>(c));
  await saveAccount(c.env, p.id, account);
  // Constancia del cambio sin el número de cuenta (solo el resumen enmascarado).
  await db
    .prepare("INSERT INTO cms_audit(actor_id,action,details) VALUES(?,?,?)")
    .bind(user.id, "payout_account", JSON.stringify({ practitioner: p.id, bank: account.bank, last4: account.account_number.slice(-4) }))
    .run();
  const fresh = await db.prepare("SELECT payout_account_hint FROM practitioners WHERE id=?").bind(p.id).first<{ payout_account_hint: string }>();
  return c.json({ ok: true, account: { configured: true, hint: fresh?.payout_account_hint ?? "" }, message: "Cuenta guardada." });
});

/* ------------------------------------------------------------------ Administración */

export const adminPayouts = new Hono<AppBindings>();

adminPayouts.use("*", async (c, next) => {
  requireAdmin(c);
  await next();
});

const audit = (db: D1Database, actor: string, action: string, details: Record<string, unknown>) =>
  db.prepare("INSERT INTO cms_audit(actor_id,action,details) VALUES(?,?,?)").bind(actor, action, JSON.stringify(details)).run();

adminPayouts.get("/", async (c) => {
  const db = c.env.DB;
  const [settings, bal, pros, payouts] = await Promise.all([
    getPayoutSettings(c.env),
    balances(db, null),
    db
      .prepare(
        `SELECT p.id,p.title,p.display_name,p.city,p.payout_account_hint FROM practitioners p
         WHERE p.demo=0 AND EXISTS(SELECT 1 FROM earnings e WHERE e.practitioner_id=p.id) ORDER BY p.display_name LIMIT 500`,
      )
      .all<{ id: number; title: string; display_name: string; city: string; payout_account_hint: string }>(),
    db
      .prepare(
        `SELECT po.id,po.practitioner_id,po.amount_cents,po.lines,po.status,po.test,po.account_hint,po.reference,po.created_at,po.paid_at,
                trim(p.title || ' ' || p.display_name) AS name
         FROM payouts po JOIN practitioners p ON p.id=po.practitioner_id ORDER BY po.id DESC LIMIT 100`,
      )
      .all<Record<string, any>>(),
  ]);
  const practitioners = pros.results.map((p) => {
    const b = bal.get(p.id);
    return {
      id: p.id,
      name: fullName(p),
      city: p.city,
      account_hint: p.payout_account_hint,
      has_account: !!p.payout_account_hint,
      real: b?.real ?? emptyBalance,
      test: b?.test ?? emptyBalance,
    };
  });
  const sum = (k: keyof typeof emptyBalance) => practitioners.reduce((s, p) => s + p.real[k], 0);
  return c.json({
    settings,
    totals: { available: sum("available"), releasing: sum("releasing"), retained: sum("retained"), in_payout: sum("in_payout"), paid: sum("paid") },
    practitioners,
    payouts: payouts.results.map((r) => ({ ...r, status_label: PAYOUT_LABEL[r.status] ?? r.status })),
  });
});

/** Genera liquidaciones de lo disponible (de uno o de todos los profesionales). */
adminPayouts.post("/", async (c) => {
  const user = c.get("user")!;
  const b = await readJson<{ practitioner_id?: number; test?: boolean }>(c);
  const db = c.env.DB;
  const test = b.test === true;
  const ids = b.practitioner_id
    ? [Number(b.practitioner_id)]
    : (
        await db
          .prepare("SELECT DISTINCT practitioner_id FROM earnings WHERE status='disponible' AND test=? AND available_ms<=?")
          .bind(test ? 1 : 0, Date.now())
          .all<{ practitioner_id: number }>()
      ).results.map((r) => r.practitioner_id);
  const results = [];
  for (const id of ids) results.push(await createPayout(c.env, id, test, user.id));
  const created = results.filter((r) => r.payout_id);
  await audit(db, user.id, "payouts_created", { test, created: created.map((r) => r.payout_id) });
  return c.json({ results, created: created.length });
});

adminPayouts.post("/:id/paid", async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  const po = await c.env.DB.prepare("SELECT test FROM payouts WHERE id=?").bind(id).first<{ test: number }>();
  if (!po) fail(404, "Liquidación no encontrada");
  const reference = clean((await readJson<{ reference?: string }>(c)).reference, 60) || (po.test ? "PRUEBA" : "");
  if (reference.length < 4) fail(400, "Escribe la referencia o número de comprobante de la transferencia");
  if (!(await markPayoutPaid(c.env, new URL(c.req.url).origin, id, reference, user.id))) fail(409, "Esta liquidación ya no está pendiente.");
  await audit(c.env.DB, user.id, "payout_paid", { id, reference });
  return c.json({ ok: true });
});

adminPayouts.post("/:id/cancel", async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!(await cancelPayout(c.env, id))) fail(409, "Esta liquidación ya no está pendiente.");
  await audit(c.env.DB, user.id, "payout_cancelled", { id });
  return c.json({ ok: true });
});

/** Archivo para cargar las transferencias pendientes en la banca empresarial (con la cuenta descifrada). */
adminPayouts.get("/export", async (c) => {
  const db = c.env.DB;
  const rows = (
    await db
      .prepare(
        `SELECT po.id,po.amount_cents,po.account_enc,po.created_at,trim(p.title || ' ' || p.display_name) AS name
         FROM payouts po JOIN practitioners p ON p.id=po.practitioner_id WHERE po.status='pendiente' AND po.test=0 ORDER BY po.id`,
      )
      .all<{ id: number; amount_cents: number; account_enc: string; created_at: string; name: string }>()
  ).results;
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    ["liquidacion", "profesional", "banco", "tipo_cuenta", "numero_cuenta", "titular", "identificacion", "correo", "monto_usd", "referencia"].join(","),
  ];
  for (const r of rows) {
    const a = await readAccount(c.env, r.account_enc);
    lines.push(
      [r.id, r.name, a.bank, a.account_type, a.account_number, a.holder, a.id_number, a.email, (r.amount_cents / 100).toFixed(2), `BUSCADR-LIQ-${r.id}`]
        .map(esc)
        .join(","),
    );
  }
  await audit(db, c.get("user")!.id, "payouts_exported", { count: rows.length });
  return new Response(`﻿${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="liquidaciones-buscadr.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
