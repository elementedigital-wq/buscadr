/**
 * Administración buscaDR (Documento Maestro §5.4): KPIs, verificación manual de credenciales,
 * libro de transacciones, moderación de opiniones y salud de las integraciones.
 * Solo la cuenta del propietario (elemente.digital@gmail.com). La administración NO lee chats privados.
 */
import { Hono } from "hono";
import type { AppBindings } from "../env";
import { type AppointmentStatus, STATUS_LABEL } from "../lib/appointments";
import { getTaxonomy } from "../lib/taxonomy";
import { type Stage, stageCopy } from "../lib/trace";
import { track } from "../lib/events";
import { readJson, requireAdmin } from "../lib/guards";
import { clean, fail } from "../lib/http";
import { notify, recipient } from "../lib/notify";
import { ONLINE_SQL, PAYMENT_STATUS_LABEL, type PaymentRow, collectedOnline, gatewayOf, paymentEvent } from "../lib/payments";
import { refundPayment, settlePayment } from "../lib/settle";

export const admin = new Hono<AppBindings>();

admin.use("*", async (c, next) => {
  requireAdmin(c);
  await next();
});

/** KPIs del Documento Maestro §2.3. North Star: citas realizadas gestionadas por buscaDR. Excluye perfiles de muestra. */
admin.get("/kpis", async (c) => {
  const db = c.env.DB;
  const one = <T>(sql: string, ...binds: unknown[]) =>
    db
      .prepare(sql)
      .bind(...binds)
      .first<T>();
  const all = <T>(sql: string, ...binds: unknown[]) =>
    db
      .prepare(sql)
      .bind(...binds)
      .all<T>()
      .then((r) => r.results);
  const real = "p.demo=0";
  const [northStar, byStatus, confirmations, pros, users, money, mrr, demand, notifications, funnel, bySpecialty] = await Promise.all([
    all<{ month: string; city: string; n: number }>(
      `SELECT substr(a.completed_at,1,7) AS month, p.city, COUNT(*) AS n FROM appointments a JOIN practitioners p ON p.id=a.practitioner_id
       WHERE a.status='completada' AND ${real} GROUP BY month,p.city ORDER BY month DESC LIMIT 36`,
    ),
    all<{ status: string; n: number }>(
      `SELECT a.status, COUNT(*) AS n FROM appointments a JOIN practitioners p ON p.id=a.practitioner_id WHERE ${real} GROUP BY a.status`,
    ),
    one<{ decided: number; confirmed: number; avg_minutes: number | null }>(
      `SELECT COUNT(*) AS decided, SUM(CASE WHEN e.type='confirm' THEN 1 ELSE 0 END) AS confirmed,
              AVG(CASE WHEN e.type='confirm' THEN (julianday(e.created_at)-julianday(a.created_at))*1440 END) AS avg_minutes
       FROM appointment_events e JOIN appointments a ON a.id=e.appointment_id JOIN practitioners p ON p.id=a.practitioner_id
       WHERE e.type IN ('confirm','decline') AND ${real}`,
    ),
    all<{ status: string; verification: string; n: number }>(
      "SELECT status, verification, COUNT(*) AS n FROM practitioners WHERE demo=0 GROUP BY status, verification",
    ),
    one<{ total: number; last30: number; whatsapp: number; pros: number }>(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN created_at > (strftime('%s','now')-30*86400)*1000 THEN 1 ELSE 0 END) AS last30,
              SUM(whatsapp_opt_in) AS whatsapp, SUM(CASE WHEN role='pro' THEN 1 ELSE 0 END) AS pros FROM users WHERE demo=0 AND staff_role=''`,
    ),
    one<{ gross: number; fees: number; n: number; refunded: number; office: number }>(
      `SELECT COALESCE(SUM(CASE WHEN status='aprobado' THEN amount_cents END),0) AS gross,
              COALESCE(SUM(CASE WHEN status='aprobado' THEN fee_cents END),0) AS fees,
              SUM(CASE WHEN status='aprobado' THEN 1 ELSE 0 END) AS n,
              COALESCE(SUM(CASE WHEN status='reembolsado' THEN amount_cents END),0) AS refunded,
              COALESCE(SUM(CASE WHEN status='aprobado' AND NOT ${ONLINE_SQL()} THEN amount_cents END),0) AS office
       FROM payments WHERE kind='cita'`,
    ),
    one<{ mrr: number; active: number }>(
      "SELECT COALESCE(SUM(amount_cents),0) AS mrr, COUNT(DISTINCT practitioner_id) AS active FROM subscriptions WHERE status='activa' AND period_end_ms>?",
      Date.now(),
    ),
    all<{ query: string; specialty: string; city: string; n: number }>(
      `SELECT query, specialty, city, COUNT(*) AS n FROM demand_log WHERE created_at > datetime('now','-60 days') GROUP BY lower(query), specialty, city ORDER BY n DESC LIMIT 15`,
    ),
    all<{ channel: string; status: string; n: number }>(
      "SELECT channel, status, COUNT(*) AS n FROM notification_log WHERE created_at > datetime('now','-30 days') GROUP BY channel, status",
    ),
    one<{ views: number; requests: number; completed: number }>(
      `SELECT (SELECT COALESCE(SUM(views),0) FROM practitioners WHERE demo=0) AS views,
              (SELECT COUNT(*) FROM appointments a JOIN practitioners p ON p.id=a.practitioner_id WHERE ${real}) AS requests,
              (SELECT COUNT(*) FROM appointments a JOIN practitioners p ON p.id=a.practitioner_id WHERE ${real} AND a.status='completada') AS completed`,
    ),
    all<{ specialty: string; n: number }>(
      "SELECT specialty, COUNT(*) AS n FROM practitioners WHERE status='active' AND demo=0 GROUP BY specialty ORDER BY n DESC",
    ),
  ]);
  const tax = await getTaxonomy(db);
  // Satisfacción por etapa de la atención (QR y escala 1–5), sin perfiles de muestra.
  const satisfaction = (
    await db
      .prepare(
        `SELECT r.stage, COUNT(*) AS n, ROUND(AVG(r.rating),2) AS avg FROM stage_ratings r JOIN practitioners p ON p.id=r.practitioner_id
         WHERE p.demo=0 AND r.updated_at > datetime('now','-90 days') GROUP BY r.stage`,
      )
      .all<{ stage: string; n: number; avg: number }>()
      .catch(() => ({ results: [] as { stage: string; n: number; avg: number }[] }))
  ).results;
  const tracedQr = await db
    .prepare(
      `SELECT COUNT(DISTINCT cs.appointment_id) AS n FROM care_stages cs JOIN appointments a ON a.id=cs.appointment_id JOIN practitioners p ON p.id=a.practitioner_id
       WHERE p.demo=0 AND cs.method IN ('qr','qr_recepcion') AND a.start_ms > ?`,
    )
    .bind(Date.now() - 90 * 86_400_000)
    .first<{ n: number }>()
    .catch(() => null);
  return c.json({
    northStar,
    byStatus: byStatus.map((s) => ({ ...s, label: STATUS_LABEL[s.status as AppointmentStatus] ?? s.status })),
    confirmation: {
      rate: confirmations?.decided ? (confirmations.confirmed ?? 0) / confirmations.decided : null,
      avg_minutes: confirmations?.avg_minutes == null ? null : Math.round(confirmations.avg_minutes),
    },
    practitioners: pros,
    users: users ?? { total: 0, last30: 0, whatsapp: 0, pros: 0 },
    payments: money ?? { gross: 0, fees: 0, n: 0, refunded: 0, office: 0 },
    saas: mrr ?? { mrr: 0, active: 0 },
    demand: demand.map((d) => ({ ...d, specialty_name: d.specialty ? tax.nameOf(d.specialty) : "" })),
    notifications,
    funnel: {
      views: funnel?.views ?? 0,
      requests: funnel?.requests ?? 0,
      completed: funnel?.completed ?? 0,
      conversion: funnel?.views ? (funnel.requests ?? 0) / funnel.views : null,
    },
    bySpecialty: bySpecialty.map((x) => ({ ...x, name: tax.nameOf(x.specialty) })),
    satisfaction: ["reserva", "llegada", "consulta", "cierre"].map((stage) => {
      const r = satisfaction.find((x) => x.stage === stage);
      return { stage, label: stageCopy(stage as Stage, "presencial").label, n: r?.n ?? 0, avg: r?.avg ?? null };
    }),
    traced_qr: tracedQr?.n ?? 0,
    notes:
      "Datos reales: excluye perfiles y citas de muestra. Ingresos de buscaDR = comisión de citas pagadas en línea + planes (MRR). Los pagos en modo sandbox no son dinero real.",
  });
});

/** Cola de verificación (Documento Maestro §7.1): revisión manual de credenciales con fuentes oficiales (ACESS). */
admin.get("/practitioners", async (c) => {
  const status = ["review", "active", "paused", "rejected", "draft"].includes(String(c.req.query("status"))) ? String(c.req.query("status")) : "review";
  const rows = (
    await c.env.DB.prepare(
      `SELECT p.id,p.slug,p.kind,p.title,p.display_name,p.specialty,p.subspecialty,p.license_number,p.city,p.sector,p.bio,p.photo,p.status,p.verification,p.review_note,
              p.price_in_person_cents,p.price_virtual_cents,p.in_person_enabled,p.virtual_enabled,p.plan,p.demo,p.updated_at,u.name AS account_name,u.email AS account_email
       FROM practitioners p JOIN users u ON u.id=p.user_id WHERE p.status=? ORDER BY p.updated_at ASC LIMIT 100`,
    )
      .bind(status)
      .all<Record<string, any>>()
  ).results;
  const tax = await getTaxonomy(c.env.DB);
  return c.json({ items: rows.map((r) => ({ ...r, specialty_name: tax.nameOf(r.specialty) })) });
});

admin.post("/practitioners/:id/review", async (c) => {
  const user = requireAdmin(c);
  const db = c.env.DB;
  const id = Number(c.req.param("id"));
  const b = await readJson<{ decision?: string; note?: string }>(c);
  const p = await db
    .prepare("SELECT id,user_id,slug,status,demo FROM practitioners WHERE id=?")
    .bind(id)
    .first<{ id: number; user_id: string; slug: string; status: string; demo: number }>();
  if (!p) fail(404, "Perfil no encontrado");
  const note = clean(b.note, 300);
  let title = "";
  let body = "";
  if (b.decision === "approve") {
    await db
      .prepare(
        "UPDATE practitioners SET status='active',verification='verificado',verified_at=CURRENT_TIMESTAMP,review_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      )
      .bind(note, id)
      .run();
    await track(db, "practitioner_verified", { userId: user.id, practitionerId: id });
    title = "¡Tu perfil está verificado y publicado!";
    body = "Los pacientes ya pueden encontrarte y reservar citas. Revisa tu horario y tus tarifas.";
  } else if (b.decision === "publish_unverified") {
    // Publicar sin sello (p. ej., clínica sin registro individual): visible pero sin «Verificado».
    await db.prepare("UPDATE practitioners SET status='active',review_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(note, id).run();
    title = "Tu perfil está publicado";
    body = "Ya recibes citas. El sello «Verificado» se agrega cuando buscaDR confirme tus credenciales.";
  } else if (b.decision === "reject") {
    if (note.length < 5) fail(400, "Explica al profesional qué debe corregir");
    await db
      .prepare("UPDATE practitioners SET status='rejected',verification='rechazado',review_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(note, id)
      .run();
    title = "Tu perfil necesita ajustes";
    body = note;
  } else if (b.decision === "suspend") {
    await db.prepare("UPDATE practitioners SET status='paused',review_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(note, id).run();
    title = "Tu perfil fue pausado por buscaDR";
    body = note || "Escríbenos para revisarlo.";
  } else fail(400, "Decisión inválida");
  if (!p.demo) {
    const to = await recipient(db, p.user_id);
    if (to)
      c.executionCtx.waitUntil(notify(c.env, to, { kind: `perfil_${b.decision}`, title, body, link: "/panel/perfil", origin: new URL(c.req.url).origin }));
  }
  return c.json({ ok: true });
});

/** Libro de transacciones de toda la plataforma (sin datos de tarjeta). CSV con ?format=csv. */
admin.get("/payments", async (c) => {
  const status = ["aprobado", "pendiente", "rechazado", "reembolsado", "creado", "cancelado"].includes(String(c.req.query("status")))
    ? String(c.req.query("status"))
    : null;
  const rows = (
    await c.env.DB.prepare(
      `SELECT pay.id,pay.kind,pay.plan,pay.appointment_id,pay.amount_cents,pay.fee_cents,pay.net_cents,pay.provider,pay.gateway,pay.provider_ref,pay.status,pay.method,pay.card_brand,pay.card_last4,
              pay.created_at,pay.approved_at,pay.refunded_at,u.name AS payer,trim(p.title || ' ' || p.display_name) AS practitioner
       FROM payments pay JOIN users u ON u.id=pay.payer_id LEFT JOIN practitioners p ON p.id=pay.practitioner_id
       ${status ? "WHERE pay.status=?" : "WHERE ?=?"} ORDER BY pay.created_at DESC LIMIT 300`,
    )
      .bind(...(status ? [status] : [1, 1]))
      .all<Record<string, any>>()
  ).results.map((r): Record<string, any> => ({ ...r, status_label: PAYMENT_STATUS_LABEL[r.status as PaymentRow["status"]] }));
  if (c.req.query("format") === "csv") {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["fecha", "id", "tipo", "cita", "pagador", "profesional", "proveedor", "estado", "bruto", "comision", "neto"];
    const lines = rows.map((r) =>
      [
        r.created_at,
        r.id,
        r.kind,
        r.appointment_id,
        r.payer,
        r.practitioner,
        gatewayOf(r as PaymentRow),
        r.status_label,
        (r.amount_cents / 100).toFixed(2),
        (r.fee_cents / 100).toFixed(2),
        (r.net_cents / 100).toFixed(2),
      ]
        .map(esc)
        .join(","),
    );
    return new Response(`﻿${[head.join(","), ...lines].join("\n")}\n`, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="transacciones-buscadr.csv"' },
    });
  }
  return c.json({ items: rows });
});

admin.post("/payments/:id/refund", async (c) => {
  requireAdmin(c);
  const pay = await c.env.DB.prepare("SELECT * FROM payments WHERE id=?").bind(c.req.param("id")).first<PaymentRow>();
  if (!pay) fail(404, "Pago no encontrado");
  if (pay.status !== "aprobado" || !collectedOnline(pay)) fail(409, "Solo se reembolsan pagos cobrados por buscaDR (no los del consultorio)");
  const ok = await refundPayment(c.env, pay, clean((await readJson<{ reason?: string }>(c)).reason, 160) || "Reembolso de la administración");
  if (!ok) fail(502, "La pasarela no confirmó el reembolso. Revisa el pago en el panel del proveedor.");
  return c.json({ ok: true });
});

/** Transferencia bancaria: la administración confirma (o rechaza) al ver el dinero en la cuenta. */
admin.post("/payments/:id/transfer", async (c) => {
  requireAdmin(c);
  const db = c.env.DB;
  const pay = await db.prepare("SELECT * FROM payments WHERE id=?").bind(c.req.param("id")).first<PaymentRow>();
  if (!pay) fail(404, "Pago no encontrado");
  if (gatewayOf(pay) !== "transferencia" || pay.status !== "pendiente") fail(409, "Este pago no es una transferencia pendiente");
  const b = await readJson<{ decision?: string; note?: string }>(c);
  if (b.decision !== "approve" && b.decision !== "reject") fail(400, "Decisión inválida");
  await paymentEvent(db, pay.id, b.decision === "approve" ? "transferencia_confirmada" : "transferencia_rechazada", { by: c.get("user")!.id }).run();
  const status = await settlePayment(
    c.env,
    new URL(c.req.url).origin,
    pay,
    b.decision === "approve"
      ? { approved: true, status: "aprobado", authorization: pay.provider_ref || "TRANSFERENCIA" }
      : { approved: false, status: "rechazado", error: clean(b.note, 160) || "No encontramos la transferencia en la cuenta de buscaDR." },
  );
  return c.json({ ok: true, status });
});

admin.get("/appointments", async (c) => {
  const rows = (
    await c.env.DB.prepare(
      `SELECT a.id,a.status,a.start_ms,a.modality,a.price_cents,a.payment_status,a.created_at,trim(p.title || ' ' || p.display_name) AS practitioner,p.demo,u.name AS patient
       FROM appointments a JOIN practitioners p ON p.id=a.practitioner_id JOIN users u ON u.id=a.patient_id ORDER BY a.id DESC LIMIT 150`,
    ).all<Record<string, any>>()
  ).results;
  return c.json({ items: rows.map((r) => ({ ...r, status_label: STATUS_LABEL[r.status as AppointmentStatus] ?? r.status })) });
});

/** Moderación de opiniones con constancia (§7.4): ocultar no borra; el profesional puede apelar. */
admin.get("/reviews", async (c) => {
  const rows = (
    await c.env.DB.prepare(
      `SELECT r.id,r.rating,r.body,r.hidden,r.created_at,trim(p.title || ' ' || p.display_name) AS practitioner,u.name AS author
       FROM reviews r JOIN practitioners p ON p.id=r.practitioner_id JOIN users u ON u.id=r.author_id ORDER BY r.id DESC LIMIT 150`,
    ).all()
  ).results;
  return c.json({ items: rows });
});

admin.post("/reviews/:id", async (c) => {
  requireAdmin(c);
  const hidden = (await readJson<{ hidden?: boolean }>(c)).hidden ? 1 : 0;
  await c.env.DB.prepare("UPDATE reviews SET hidden=? WHERE id=?")
    .bind(hidden, Number(c.req.param("id")))
    .run();
  return c.json({ ok: true, hidden: !!hidden });
});
