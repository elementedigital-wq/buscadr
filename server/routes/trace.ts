/**
 * Trazabilidad de la atención con QR y satisfacción por etapa (ADR 0015).
 *
 * - GET  /api/trace/appointments/:id                      línea de tiempo (+ QR del paciente)
 * - POST /api/trace/appointments/:id/stages/:stage        confirmar manualmente (profesional) o entrar a la videoconsulta (paciente)
 * - PUT  /api/trace/appointments/:id/stages/:stage/rating calificar una etapa (paciente)
 * - GET|POST /api/trace/scan/:token                       lo que hace un QR escaneado y su confirmación
 * - GET  /api/trace/reception · POST /api/trace/reception/rotate   QR de recepción del consultorio
 * - GET  /api/trace/quality?days=90                       métricas de calidad del profesional (anónimas)
 */
import { Hono } from "hono";
import type { AppBindings, Env, User } from "../env";
import { readJson, requireUser } from "../lib/guards";
import { clean, fail } from "../lib/http";
import { notify, recipient } from "../lib/notify";
import { type PractitionerRow, fullName, patientShortName } from "../lib/practitioners";
import { qrPath } from "../lib/qr";
import { RULES, hit } from "../lib/rate-limit";
import { DAY, formatLong } from "../lib/time";
import {
  ARRIVAL_WINDOW,
  type Method,
  RATING_LABELS,
  RATING_WINDOW_MS,
  type RatingRow,
  STAGES,
  type Stage,
  type StageRow,
  TOKEN,
  cleanTags,
  confirmBlock,
  isStage,
  metrics,
  newToken,
  nextStage,
  stageCopy,
  stagesOf,
} from "../lib/trace";
import { type AppointmentRow, completeAppointment, loadFor } from "./appointments";

export const trace = new Hono<AppBindings>();

type Role = "patient" | "pro" | "admin";
const origin = (c: { req: { url: string } }) => new URL(c.req.url).origin;
const idOf = (raw: string) => {
  const id = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(id) || id <= 0) fail(404, "Cita no encontrada");
  return id;
};
/** El profesional (o, en perfiles de muestra, el propio paciente para probar el flujo). */
const proSideOf = (role: Role, p: PractitionerRow) => role !== "patient" || !!p.demo;

async function load(db: D1Database, id: number) {
  const [rows, ratings] = await Promise.all([
    db.prepare("SELECT stage,confirmed_ms,actor_role,method FROM care_stages WHERE appointment_id=?").bind(id).all<StageRow>(),
    db.prepare("SELECT stage,rating,tags,comment,updated_at FROM stage_ratings WHERE appointment_id=?").bind(id).all<RatingRow>(),
  ]);
  return { rows: rows.results, ratings: ratings.results };
}

/** Token del QR de la cita: se crea la primera vez que se muestra. */
async function tokenFor(db: D1Database, a: AppointmentRow & { trace_token?: string }) {
  if (a.trace_token) return a.trace_token;
  const t = newToken("a");
  await db.prepare("UPDATE appointments SET trace_token=? WHERE id=? AND trace_token=''").bind(t, a.id).run();
  const row = await db.prepare("SELECT trace_token FROM appointments WHERE id=?").bind(a.id).first<{ trace_token: string }>();
  return row?.trace_token || t;
}

async function view(env: Env, o: string, a: AppointmentRow & { trace_token?: string }, role: Role, p: PractitionerRow) {
  const db = env.DB;
  const { rows, ratings } = await load(db, a.id);
  const map = stagesOf(a, rows);
  const proSide = proSideOf(role, p);
  const patient = role === "patient";
  const closed = ["completada", "no_asistio", "cancelada", "rechazada", "expirada"].includes(a.status);
  const now = Date.now();
  const stages = STAGES.map((s) => {
    const row = map.get(s);
    const copy = stageCopy(s, a.modality);
    const r = ratings.find((x) => x.stage === s);
    const block = confirmBlock(a, map, s, { proSide, patient }, patient && !proSide ? "auto" : "manual", now);
    return {
      stage: s,
      label: copy.label,
      icon: copy.icon,
      question: copy.question,
      tags: copy.tags,
      status: row ? "confirmada" : closed ? "sin_registro" : "pendiente",
      confirmed_ms: row?.confirmed_ms ?? null,
      actor_role: row?.actor_role ?? null,
      method: row?.method ?? null,
      // El paciente ve su calificación; el profesional, solo agregados anónimos (página Calidad).
      rating: patient && r ? { rating: r.rating, label: RATING_LABELS[r.rating], tags: JSON.parse(r.tags || "[]"), comment: r.comment } : null,
      can_rate: patient && !!row && now - row.confirmed_ms < RATING_WINDOW_MS,
      // Confirmación manual: el profesional; el paciente solo «entra» a la videoconsulta (llegada virtual).
      can_confirm: !block && (proSide || (s === "llegada" && a.modality === "virtual")),
      block: row ? null : block,
    };
  });
  const showQr = patient && a.modality === "presencial" && a.status === "confirmada";
  const token = showQr ? await tokenFor(db, a) : null;
  const url = token ? `${o}/q/${token}` : null;
  return {
    appointment_id: a.id,
    modality: a.modality,
    status: a.status,
    stages,
    next_stage: a.status === "confirmada" ? nextStage(map) : null,
    metrics: metrics(a, map),
    qr: url ? { url, ...qrPath(url), code: a.checkin_code } : null,
    rating_labels: RATING_LABELS.slice(1),
  };
}

/** Contexto de la solicitud: entorno, origen y tareas en segundo plano (avisos). */
type Ctx = { env: Env; origin: string; waitUntil: (p: Promise<unknown>) => void };
const ctxOf = (c: { env: Env; req: { url: string }; executionCtx: { waitUntil: (p: Promise<unknown>) => void } }): Ctx => ({
  env: c.env,
  origin: origin(c),
  waitUntil: (p) => c.executionCtx.waitUntil(p),
});

/** Confirma una etapa. Cierre = completar la cita. Avisa al paciente para calificarla. */
async function confirm(c: Ctx, user: User, role: Role, a: AppointmentRow, p: PractitionerRow, stage: Stage, method: Method) {
  const db = c.env.DB;
  const { rows } = await load(db, a.id);
  const map = stagesOf(a, rows);
  const proSide = proSideOf(role, p);
  const block = confirmBlock(a, map, stage, { proSide, patient: role === "patient" }, method);
  if (block) fail(409, block, "STAGE_BLOCKED");
  const actorRole = role === "patient" ? "paciente" : "profesional";
  if (stage === "cierre") {
    c.waitUntil((await completeAppointment(c.env, c.origin, a, p, { id: user.id, role: actorRole }, method === "qr" ? "qr" : "manual")).notice);
  } else {
    const res = await db
      .prepare("INSERT OR IGNORE INTO care_stages(appointment_id,stage,confirmed_ms,actor_id,actor_role,method) VALUES(?,?,?,?,?,?)")
      .bind(a.id, stage, Date.now(), user.id, actorRole, method)
      .run();
    if (!res.meta.changes) fail(409, "Esta etapa ya está registrada.", "STAGE_BLOCKED");
    // Invitación a calificar la etapa (solo en la app: sin datos de salud ni mensajes de más).
    if (!p.demo) {
      const to = await recipient(db, a.patient_id);
      const copy = stageCopy(stage, a.modality);
      if (to && actorRole === "profesional")
        c.waitUntil(
          notify(c.env, to, {
            kind: `etapa_${stage}`,
            title: `${copy.label}: registrada`,
            body: `${copy.question} Califícala en tu cita con ${fullName(p)}.`,
            link: `/citas/${a.id}#trazabilidad`,
            appOnly: true,
            origin: c.origin,
          }),
        );
    }
  }
  await db
    .prepare("INSERT INTO appointment_events(appointment_id,type,actor_id,detail) VALUES(?,?,?,?)")
    .bind(a.id, `etapa_${stage}`, user.id, JSON.stringify({ method }))
    .run();
  return stage;
}

trace.get("/appointments/:id", async (c) => {
  const user = requireUser(c);
  const { a, role, p } = await loadFor(c.env, user, idOf(c.req.param("id")));
  return c.json(await view(c.env, origin(c), a, role as Role, p));
});

trace.post("/appointments/:id/stages/:stage", async (c) => {
  const user = requireUser(c);
  await hit(c.env.DB, `write:${user.id}`, RULES.write);
  const stage = c.req.param("stage");
  if (!isStage(stage)) fail(404, "Etapa no encontrada");
  const { a, role, p } = await loadFor(c.env, user, idOf(c.req.param("id")));
  // El paciente solo registra su ingreso a la videoconsulta; la llegada presencial es con el QR de recepción.
  const method: Method = role === "patient" && !p.demo ? (a.modality === "virtual" && stage === "llegada" ? "auto" : "manual") : "manual";
  await confirm(ctxOf(c), user, role as Role, a, p, stage, method);
  return c.json(await view(c.env, origin(c), a.status === "confirmada" && stage === "cierre" ? { ...a, status: "completada" } : a, role as Role, p));
});

trace.put("/appointments/:id/stages/:stage/rating", async (c) => {
  const user = requireUser(c);
  await hit(c.env.DB, `write:${user.id}`, RULES.write);
  const stage = c.req.param("stage");
  if (!isStage(stage)) fail(404, "Etapa no encontrada");
  const { a, role, p } = await loadFor(c.env, user, idOf(c.req.param("id")));
  if (role !== "patient") fail(403, "Solo el paciente califica su atención.");
  const { rows } = await load(c.env.DB, a.id);
  const row = stagesOf(a, rows).get(stage);
  if (!row) fail(409, "Esta etapa aún no se ha registrado.");
  if (Date.now() - row.confirmed_ms > RATING_WINDOW_MS) fail(409, "Pasó el plazo de 14 días para calificar esta etapa.");
  const b = await readJson<{ rating?: number; tags?: unknown; comment?: string }>(c);
  const rating = Number(b.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) fail(400, "Elige una calificación de 1 a 5.");
  await c.env.DB.prepare(
    `INSERT INTO stage_ratings(appointment_id,stage,practitioner_id,author_id,rating,tags,comment) VALUES(?,?,?,?,?,?,?)
     ON CONFLICT(appointment_id,stage) DO UPDATE SET rating=excluded.rating,tags=excluded.tags,comment=excluded.comment,updated_at=CURRENT_TIMESTAMP`,
  )
    .bind(a.id, stage, p.id, user.id, rating, JSON.stringify(cleanTags(stage, a.modality, b.tags)), clean(b.comment, 500))
    .run();
  return c.json(await view(c.env, origin(c), a, "patient", p));
});

/* ------------------------------------------------------------------ Escaneo de QR */

type ScanInfo =
  | { kind: "login" }
  | { kind: "invalido"; message: string }
  | { kind: "cita"; role: "patient"; appointment_id: number }
  | {
      kind: "cita";
      role: "pro";
      appointment_id: number;
      patient: string;
      when: string;
      modality: string;
      stage: Stage | null;
      label: string | null;
      block: string | null;
      demo: boolean;
    }
  | { kind: "recepcion"; own: true; practitioner: string }
  | {
      kind: "recepcion";
      own: false;
      practitioner: string;
      appointment: { id: number; when: string } | null;
      block: string | null;
    };

async function resolve(ctx: Ctx, user: User | null, token: string): Promise<{ info: ScanInfo; act?: () => Promise<{ appointment_id: number; stage: Stage }> }> {
  const env = ctx.env;
  const db = env.DB;
  if (!TOKEN.test(token)) return { info: { kind: "invalido", message: "Este código no es de buscaDR o está incompleto." } };
  if (!user) return { info: { kind: "login" } };
  if (token.startsWith("a_")) {
    const row = await db.prepare("SELECT id FROM appointments WHERE trace_token=?").bind(token).first<{ id: number }>();
    if (!row) return { info: { kind: "invalido", message: "Este código ya no es válido." } };
    let loaded: Awaited<ReturnType<typeof loadFor>>;
    try {
      loaded = await loadFor(env, user, row.id);
    } catch {
      return { info: { kind: "invalido", message: "Este código pertenece a la cita de otra persona. Solo su profesional puede usarlo." } };
    }
    const { a, role, p } = loaded;
    if (role === "patient" && !p.demo) return { info: { kind: "cita", role: "patient", appointment_id: a.id } };
    const { rows } = await load(db, a.id);
    const map = stagesOf(a, rows);
    const stage = a.status === "confirmada" ? nextStage(map) : null;
    const block = stage
      ? confirmBlock(a, map, stage, { proSide: true, patient: role === "patient" }, "qr")
      : "La atención de esta cita ya terminó o la cita no está confirmada.";
    return {
      info: {
        kind: "cita",
        role: "pro",
        appointment_id: a.id,
        patient: patientShortName(a.patient_name),
        when: formatLong(a.start_ms),
        modality: a.modality,
        stage,
        label: stage ? stageCopy(stage, a.modality).label : null,
        block,
        demo: !!p.demo,
      },
      act: stage && !block ? async () => ({ appointment_id: a.id, stage: await confirm(ctx, user, role as Role, a, p, stage, "qr") }) : undefined,
    };
  }
  const p = await db.prepare("SELECT * FROM practitioners WHERE reception_token=?").bind(token).first<PractitionerRow>();
  if (!p) return { info: { kind: "invalido", message: "Este QR de recepción ya no es válido. Pide el código actualizado en el consultorio." } };
  if (p.user_id === user.id) return { info: { kind: "recepcion", own: true, practitioner: fullName(p) } };
  const now = Date.now();
  // La cita del paciente con este consultorio que está dentro de la ventana de llegada.
  const a = await db
    .prepare(
      `SELECT * FROM appointments WHERE practitioner_id=? AND patient_id=? AND status='confirmada' AND modality='presencial'
       AND start_ms<=? AND end_ms>=? ORDER BY abs(start_ms-?) LIMIT 1`,
    )
    .bind(p.id, user.id, now + ARRIVAL_WINDOW.before, now - ARRIVAL_WINDOW.after, now)
    .first<AppointmentRow>();
  if (!a)
    return {
      info: {
        kind: "recepcion",
        own: false,
        practitioner: fullName(p),
        appointment: null,
        block: "No encontramos una cita tuya con este consultorio para ahora. Revisa la fecha en «Mis citas».",
      },
    };
  const { rows } = await load(db, a.id);
  const block = confirmBlock(a, stagesOf(a, rows), "llegada", { proSide: false, patient: true }, "qr_recepcion", now);
  return {
    info: { kind: "recepcion", own: false, practitioner: fullName(p), appointment: { id: a.id, when: formatLong(a.start_ms) }, block },
    act: block ? undefined : async () => ({ appointment_id: a.id, stage: await confirm(ctx, user, "patient", a, p, "llegada", "qr_recepcion") }),
  };
}

trace.get("/scan/:token", async (c) => {
  const user = c.get("user");
  if (user) await hit(c.env.DB, `scan:${user.id}`, RULES.write);
  return c.json((await resolve(ctxOf(c), user, c.req.param("token"))).info);
});

trace.post("/scan/:token", async (c) => {
  const user = requireUser(c);
  await hit(c.env.DB, `scan:${user.id}`, RULES.write);
  const r = await resolve(ctxOf(c), user, c.req.param("token"));
  if (!r.act) fail(409, "block" in r.info && r.info.block ? r.info.block : "Este código no tiene una etapa por confirmar.", "STAGE_BLOCKED");
  const done = await r.act();
  return c.json({ ok: true, ...done });
});

/* ------------------------------------------------------------------ QR de recepción */

async function myPractitioner(db: D1Database, user: User) {
  const p = await db.prepare("SELECT * FROM practitioners WHERE user_id=?").bind(user.id).first<PractitionerRow & { reception_token: string }>();
  if (!p) fail(404, "Aún no tienes un perfil profesional.", "NO_PROFILE");
  return p;
}

async function receptionView(c: { env: Env; req: { url: string } }, p: PractitionerRow & { reception_token: string }) {
  let token = p.reception_token;
  if (!token) {
    token = newToken("r");
    await c.env.DB.prepare("UPDATE practitioners SET reception_token=? WHERE id=? AND reception_token=''").bind(token, p.id).run();
    token =
      (await c.env.DB.prepare("SELECT reception_token FROM practitioners WHERE id=?").bind(p.id).first<{ reception_token: string }>())?.reception_token ||
      token;
  }
  const url = `${origin(c)}/q/${token}`;
  return { practitioner: fullName(p), address: p.address, city: p.city, url, ...qrPath(url) };
}

trace.get("/reception", async (c) => {
  const user = requireUser(c);
  return c.json(await receptionView(c, await myPractitioner(c.env.DB, user)));
});

/** Cambia el QR de recepción (p. ej., si se difundió una foto del cartel): el anterior deja de valer. */
trace.post("/reception/rotate", async (c) => {
  const user = requireUser(c);
  const p = await myPractitioner(c.env.DB, user);
  const token = newToken("r");
  await c.env.DB.prepare("UPDATE practitioners SET reception_token=? WHERE id=?").bind(token, p.id).run();
  return c.json(await receptionView(c, { ...p, reception_token: token }));
});

/* ------------------------------------------------------------------ Calidad (profesional) */

/** Mínimo de calificaciones para mostrar un promedio (protege el anonimato del paciente). */
export const MIN_SAMPLE = 3;

trace.get("/quality", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  const p = await myPractitioner(db, user);
  const days = [30, 90, 365].includes(Number(c.req.query("days"))) ? Number(c.req.query("days")) : 90;
  const since = Date.now() - days * DAY;
  const sinceText = new Date(since).toISOString().replace("T", " ").slice(0, 19);
  const [ratings, times, completed] = await Promise.all([
    db
      .prepare(
        "SELECT r.stage,r.rating,r.tags,r.comment,r.updated_at,a.modality FROM stage_ratings r JOIN appointments a ON a.id=r.appointment_id WHERE r.practitioner_id=? AND r.updated_at>=?",
      )
      .bind(p.id, sinceText)
      .all<{ stage: Stage; rating: number; tags: string; comment: string; updated_at: string; modality: string }>(),
    db
      .prepare(
        `SELECT a.id,a.start_ms,a.end_ms,a.status,a.modality,a.confirmed_at,cs.stage,cs.confirmed_ms,cs.actor_role,cs.method
         FROM appointments a JOIN care_stages cs ON cs.appointment_id=a.id WHERE a.practitioner_id=? AND a.start_ms>=?`,
      )
      .bind(p.id, since)
      .all<{ id: number; start_ms: number; end_ms: number; status: string; modality: string; confirmed_at: string | null } & StageRow>(),
    db
      .prepare("SELECT COUNT(*) AS n FROM appointments WHERE practitioner_id=? AND status='completada' AND start_ms>=?")
      .bind(p.id, since)
      .first<{ n: number }>(),
  ]);
  const stages = STAGES.map((s) => {
    const list = ratings.results.filter((r) => r.stage === s);
    const tags = new Map<string, number>();
    for (const r of list) for (const t of JSON.parse(r.tags || "[]") as string[]) tags.set(t, (tags.get(t) ?? 0) + 1);
    const enough = list.length >= MIN_SAMPLE;
    return {
      stage: s,
      label: stageCopy(s, "presencial").label,
      count: list.length,
      average: enough ? Math.round((list.reduce((x, r) => x + r.rating, 0) / list.length) * 10) / 10 : null,
      distribution: enough ? [1, 2, 3, 4, 5].map((n) => list.filter((r) => r.rating === n).length) : null,
      tags: enough
        ? [...tags]
            .sort((x, y) => y[1] - x[1])
            .slice(0, 5)
            .map(([tag, n]) => ({ tag, n }))
        : [],
    };
  });
  // Tiempos por cita a partir de sus etapas.
  const byAppt = new Map<number, { a: (typeof times.results)[number]; rows: StageRow[] }>();
  for (const r of times.results) {
    const e = byAppt.get(r.id) ?? { a: r, rows: [] };
    e.rows.push({ stage: r.stage, confirmed_ms: r.confirmed_ms, actor_role: r.actor_role, method: r.method });
    byAppt.set(r.id, e);
  }
  const ms = [...byAppt.values()].map(({ a, rows }) => ({
    m: metrics(a, stagesOf(a, rows)),
    full: ["llegada", "consulta", "cierre"].every((s) => rows.some((r) => r.stage === s)),
    qr: rows.some((r) => r.method.startsWith("qr")),
  }));
  const avg = (k: keyof ReturnType<typeof metrics>) => {
    const v = ms.map((x) => x.m[k]).filter((x): x is number => x != null);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const total = ratings.results.length;
  return c.json({
    days,
    min_sample: MIN_SAMPLE,
    overall: total >= MIN_SAMPLE ? Math.round((ratings.results.reduce((x, r) => x + r.rating, 0) / total) * 10) / 10 : null,
    ratings: total,
    stages,
    times: {
      wait_minutes: avg("wait_minutes"),
      punctuality_minutes: avg("punctuality_minutes"),
      duration_minutes: avg("duration_minutes"),
      delay_minutes: avg("delay_minutes"),
    },
    traced: { completed: completed?.n ?? 0, full: ms.filter((x) => x.full).length, with_qr: ms.filter((x) => x.qr).length },
    // Comentarios anónimos (sin nombre ni fecha exacta de la cita).
    comments:
      total >= MIN_SAMPLE
        ? ratings.results
            .filter((r) => r.comment)
            .sort((x, y) => y.updated_at.localeCompare(x.updated_at))
            .slice(0, 20)
            .map((r) => ({
              stage: r.stage,
              label: stageCopy(r.stage, r.modality).label,
              rating: r.rating,
              comment: r.comment,
              month: r.updated_at.slice(0, 7),
            }))
        : [],
  });
});
