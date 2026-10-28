/**
 * Panel profesional (Estructura §E «Profesional»): cada médico, especialista, clínica o servicio
 * médico registrado tiene su propio perfil, agenda, calendario de citas, métricas, ingresos y plan.
 * Toda consulta se filtra por la cuenta en sesión (nunca por un id enviado por el cliente).
 */
import { Hono } from "hono";
import type { AppBindings, User } from "../env";
import { type AppointmentStatus, STATUS_LABEL, paymentLabel } from "../lib/appointments";
import { CITIES, KINDS, PLAN_MAP, TITLES, cityByName, slugify } from "../lib/catalog";
import { type Taxonomy, getTaxonomy } from "../lib/taxonomy";
import { track } from "../lib/events";
import { readJson, requireUser } from "../lib/guards";
import { clean, fail, isCents } from "../lib/http";
import { storeUserImage } from "../lib/media";
import { PAYMENT_STATUS_LABEL, type PaymentRow, collectedOnline, createPayment, startCheckout } from "../lib/payments";
import { type PractitionerRow, fullName, patientShortName, publicPractitioner, reputationFor } from "../lib/practitioners";
import { getPayoutSettings } from "../lib/settings";
import { RULES, hit } from "../lib/rate-limit";
import { validateRules } from "../lib/slots";
import { DAY, addDays, isDate, localDate, localMidnight, parseLocal } from "../lib/time";
import { toE164Ecuador } from "../lib/whatsapp";

export const pro = new Hono<AppBindings>();

const mine = (db: D1Database, user: User) => db.prepare("SELECT * FROM practitioners WHERE user_id=?").bind(user.id).first<PractitionerRow>();

export async function requirePractitioner(db: D1Database, user: User) {
  const p = await mine(db, user);
  if (!p) fail(404, "Aún no tienes un perfil profesional. Créalo para activar tu agenda.", "NO_PROFILE");
  return p;
}

/** Vista privada: incluye dirección, registro profesional, ajustes de agenda y estado de revisión. */
function privateView(p: PractitionerRow, tax: Taxonomy) {
  return {
    ...publicPractitioner(p, undefined, {}, tax),
    address: p.address,
    license_number: p.license_number,
    status: p.status,
    verification: p.verification,
    review_note: p.review_note,
    plan: p.plan,
    plan_until_ms: p.plan_until_ms,
    buffer_minutes: p.buffer_minutes,
    min_notice_hours: p.min_notice_hours,
    exact_lat: p.lat,
    exact_lng: p.lng,
    views: p.views,
  };
}

pro.get("/me", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  const p = await mine(db, user);
  if (!p) return c.json({ practitioner: null, rules: [], blocks: [] });
  const [rules, blocks] = await Promise.all([
    db.prepare("SELECT id,weekday,start_min,end_min,modality FROM availability_rules WHERE practitioner_id=? ORDER BY weekday,start_min").bind(p.id).all(),
    db
      .prepare("SELECT id,start_ms,end_ms,reason FROM availability_blocks WHERE practitioner_id=? AND end_ms>? ORDER BY start_ms LIMIT 50")
      .bind(p.id, Date.now())
      .all(),
  ]);
  return c.json({ practitioner: privateView(p, await getTaxonomy(c.env.DB)), rules: rules.results, blocks: blocks.results });
});

type ProfileInput = Partial<{
  kind: string;
  title: string;
  display_name: string;
  specialty: string;
  subspecialty: string;
  headline: string;
  bio: string;
  years_experience: number;
  languages: string;
  services: string[];
  insurances: string;
  license_number: string;
  city: string;
  sector: string;
  address: string;
  lat: number | null;
  lng: number | null;
  in_person_enabled: boolean;
  virtual_enabled: boolean;
  price_in_person_cents: number;
  price_virtual_cents: number;
  slot_minutes: number;
  buffer_minutes: number;
  min_notice_hours: number;
  auto_confirm: boolean;
  prepay_virtual: boolean;
  prepay_in_person: boolean;
  phone: string;
  whatsapp_opt_in: boolean;
}>;

/** Valida y normaliza los campos editables. Cambios en nombre, especialidad o registro reabren la verificación. */
function normalizeProfile(b: ProfileInput, base: Partial<PractitionerRow>, tax: Taxonomy) {
  const pick = <K extends keyof PractitionerRow>(k: K, v: PractitionerRow[K] | undefined) => (v === undefined ? base[k] : v);
  const kind = b.kind === undefined ? base.kind : b.kind in KINDS ? (b.kind as PractitionerRow["kind"]) : fail(400, "Tipo de perfil inválido");
  const title = b.title === undefined ? base.title : (TITLES as readonly string[]).includes(b.title) ? b.title : fail(400, "Título inválido");
  const display = b.display_name === undefined ? base.display_name : clean(b.display_name, 80);
  if (!display || display.length < 3) fail(400, "Escribe el nombre público (mínimo 3 caracteres)");
  // Especialidades visibles (base o agregadas en el CMS); se conserva la actual aunque luego se haya ocultado.
  const specialty =
    b.specialty === undefined || b.specialty === base.specialty
      ? base.specialty
      : tax.map.get(b.specialty)?.visible
        ? b.specialty
        : fail(400, "Elige una especialidad de la lista");
  const city = b.city === undefined ? base.city : cityByName(b.city) ? b.city : fail(400, "Ciudad fuera del piloto");
  const cents = (v: unknown, label: string) => {
    if (v === undefined) return undefined;
    if (!isCents(v) || Number(v) > 100_000) fail(400, `${label}: escribe un valor entre $0 y $1.000`);
    return Number(v);
  };
  const int = (v: unknown, lo: number, hi: number, label: string) => {
    if (v === undefined) return undefined;
    const n = Number(v);
    if (!Number.isInteger(n) || n < lo || n > hi) fail(400, `${label}: valor entre ${lo} y ${hi}`);
    return n;
  };
  const bool = (v: unknown) => (v === undefined ? undefined : v ? 1 : 0);
  const services =
    b.services === undefined
      ? undefined
      : JSON.stringify(
          (Array.isArray(b.services) ? b.services : [])
            .map((s) => clean(s, 60))
            .filter(Boolean)
            .slice(0, 15),
        );
  const coords = (v: unknown, max: number) =>
    v === undefined
      ? undefined
      : v === null || v === ""
        ? null
        : Number.isFinite(Number(v)) && Math.abs(Number(v)) <= max
          ? Number(v)
          : fail(400, "Coordenadas inválidas");
  const cityRow = cityByName(city);
  const out = {
    kind,
    title,
    display_name: display,
    specialty,
    subspecialty: pick("subspecialty", b.subspecialty === undefined ? undefined : clean(b.subspecialty, 80)),
    headline: pick("headline", b.headline === undefined ? undefined : clean(b.headline, 120)),
    bio: pick("bio", b.bio === undefined ? undefined : clean(b.bio, 1500)),
    years_experience: pick("years_experience", int(b.years_experience, 0, 70, "Años de experiencia")),
    languages: pick("languages", b.languages === undefined ? undefined : clean(b.languages, 80) || "Español"),
    services: pick("services", services),
    insurances: pick("insurances", b.insurances === undefined ? undefined : clean(b.insurances, 200)),
    license_number: pick("license_number", b.license_number === undefined ? undefined : clean(b.license_number, 40)),
    city,
    sector: pick("sector", b.sector === undefined ? undefined : clean(b.sector, 60)),
    address: pick("address", b.address === undefined ? undefined : clean(b.address, 200)),
    lat: coords(b.lat, 90) === undefined ? (base.lat ?? cityRow?.lat ?? null) : coords(b.lat, 90),
    lng: coords(b.lng, 180) === undefined ? (base.lng ?? cityRow?.lng ?? null) : coords(b.lng, 180),
    in_person_enabled: pick("in_person_enabled", bool(b.in_person_enabled)),
    virtual_enabled: pick("virtual_enabled", bool(b.virtual_enabled)),
    price_in_person_cents: pick("price_in_person_cents", cents(b.price_in_person_cents, "Tarifa presencial")),
    price_virtual_cents: pick("price_virtual_cents", cents(b.price_virtual_cents, "Tarifa virtual")),
    slot_minutes: pick("slot_minutes", int(b.slot_minutes, 10, 180, "Duración de la consulta")),
    buffer_minutes: pick("buffer_minutes", int(b.buffer_minutes, 0, 60, "Margen entre citas")),
    min_notice_hours: pick("min_notice_hours", int(b.min_notice_hours, 0, 168, "Anticipación mínima")),
    auto_confirm: pick("auto_confirm", bool(b.auto_confirm)),
    prepay_virtual: pick("prepay_virtual", bool(b.prepay_virtual)),
    prepay_in_person: pick("prepay_in_person", bool(b.prepay_in_person)),
  };
  if (out.in_person_enabled === 0 && out.virtual_enabled === 0) fail(400, "Activa al menos una modalidad: presencial o virtual");
  return out;
}

/** Onboarding: crea el perfil profesional de la cuenta en sesión (queda en borrador). */
pro.post("/me", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  if (await mine(db, user)) fail(409, "Ya tienes un perfil profesional");
  await hit(db, `write:${user.id}`, RULES.write);
  const b = await readJson<ProfileInput>(c);
  if (!b.specialty) fail(400, "Elige tu especialidad");
  const city = cityByName(b.city) ?? CITIES[0];
  const v = normalizeProfile(
    { in_person_enabled: true, virtual_enabled: false, slot_minutes: 30, ...b, city: city.name, display_name: b.display_name ?? user.name },
    {
      languages: "Español",
      services: "[]",
      city: city.name,
      lat: city.lat,
      lng: city.lng,
      kind: "medico",
      title: "",
      buffer_minutes: 0,
      min_notice_hours: 2,
      auto_confirm: 0,
      prepay_virtual: 1,
      prepay_in_person: 0,
      years_experience: 0,
      price_in_person_cents: 0,
      price_virtual_cents: 0,
      subspecialty: "",
      headline: "",
      bio: "",
      insurances: "",
      license_number: "",
      sector: "",
      address: "",
    },
    await getTaxonomy(db),
  );
  let slug = slugify(`${v.title ?? ""} ${v.display_name}`);
  if (await db.prepare("SELECT 1 FROM practitioners WHERE slug=?").bind(slug).first()) slug = `${slug}-${crypto.randomUUID().slice(0, 6)}`;
  const cols = Object.keys(v);
  await db.batch([
    db
      .prepare(`INSERT INTO practitioners(user_id,slug,${cols.join(",")}) VALUES(?,?,${cols.map(() => "?").join(",")})`)
      .bind(user.id, slug, ...Object.values(v)),
    db.prepare("UPDATE users SET role='pro' WHERE id=?").bind(user.id),
  ]);
  const p = await mine(db, user);
  // Horario inicial sugerido (lunes a viernes 09:00–13:00 y 15:00–18:00), editable en «Horarios».
  const defaults = [1, 2, 3, 4, 5].flatMap((d) => [
    [d, 540, 780],
    [d, 900, 1080],
  ]);
  await db.batch(
    defaults.map(([d, s, e]) =>
      db.prepare("INSERT INTO availability_rules(practitioner_id,weekday,start_min,end_min,modality) VALUES(?,?,?,?,'ambas')").bind(p!.id, d, s, e),
    ),
  );
  return c.json({ practitioner: privateView(p!, await getTaxonomy(c.env.DB)), message: "Perfil creado. Completa tus datos y envíalo a verificación." }, 201);
});

pro.patch("/me", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  await hit(db, `write:${user.id}`, RULES.write);
  const p = await requirePractitioner(db, user);
  const b = await readJson<ProfileInput>(c);
  const v = normalizeProfile(b, p, await getTaxonomy(c.env.DB));
  // Cambios relevantes reabren la verificación (Documento Maestro §7.1): el sello se retira hasta revisar.
  const sensitive = v.display_name !== p.display_name || v.specialty !== p.specialty || v.license_number !== p.license_number || v.title !== p.title;
  const statements = [
    db
      .prepare(
        `UPDATE practitioners SET ${Object.keys(v)
          .map((k) => `${k}=?`)
          .join(
            ",",
          )},updated_at=CURRENT_TIMESTAMP${sensitive && p.verification === "verificado" ? ",verification='pendiente',verified_at=NULL" : ""} WHERE id=?`,
      )
      .bind(...Object.values(v), p.id),
  ];
  // Teléfono y consentimiento de WhatsApp para recibir solicitudes con botones de confirmación.
  if (b.phone !== undefined || b.whatsapp_opt_in !== undefined) {
    const phone = b.phone === undefined ? user.phone : clean(b.phone, 30);
    if (phone && !toE164Ecuador(phone)) fail(400, "Escribe un celular ecuatoriano válido (por ejemplo 0991234567)");
    const opt = b.whatsapp_opt_in === undefined ? user.whatsapp_opt_in : b.whatsapp_opt_in ? 1 : 0;
    if (opt && !phone) fail(400, "Agrega tu celular para recibir avisos por WhatsApp");
    statements.push(db.prepare("UPDATE users SET phone=?,whatsapp_opt_in=? WHERE id=?").bind(phone, opt, user.id));
    if (opt !== user.whatsapp_opt_in)
      statements.push(db.prepare("INSERT INTO consent_records(user_id,kind,value) VALUES(?,?,?)").bind(user.id, "whatsapp_avisos", opt));
  }
  await db.batch(statements);
  return c.json({
    practitioner: privateView((await mine(db, user))!, await getTaxonomy(db)),
    message:
      sensitive && p.verification === "verificado" ? "Guardado. Como cambiaste datos de identidad, buscaDR volverá a verificarlos." : "Cambios guardados",
  });
});

/** Envía el perfil a verificación (revisión manual de buscaDR antes de publicarse). */
pro.post("/me/submit", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  const p = await requirePractitioner(db, user);
  if (!["draft", "rejected", "paused"].includes(p.status)) fail(409, p.status === "review" ? "Tu perfil ya está en revisión" : "Tu perfil ya está publicado");
  const missing: string[] = [];
  if (!p.license_number) missing.push("registro profesional (ACESS/SENESCYT)");
  if (p.bio.length < 40) missing.push("descripción de al menos 40 caracteres");
  if (p.in_person_enabled && !p.price_in_person_cents) missing.push("tarifa presencial");
  if (p.virtual_enabled && !p.price_virtual_cents) missing.push("tarifa virtual");
  const rules = await db.prepare("SELECT COUNT(*) AS n FROM availability_rules WHERE practitioner_id=?").bind(p.id).first<{ n: number }>();
  if (!rules?.n) missing.push("horario de atención");
  if (missing.length && p.status !== "paused") fail(400, `Completa antes de enviar: ${missing.join(", ")}.`);
  // Un perfil pausado ya verificado vuelve a publicarse sin nueva revisión.
  const next = p.status === "paused" && p.verification === "verificado" ? "active" : "review";
  await db.prepare("UPDATE practitioners SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(next, p.id).run();
  await track(db, "practitioner_submitted", { userId: user.id, practitionerId: p.id });
  return c.json({
    ok: true,
    status: next,
    message: next === "active" ? "Tu perfil vuelve a estar publicado." : "Enviado a verificación. Te avisaremos cuando esté publicado.",
  });
});

pro.post("/me/pause", async (c) => {
  const user = requireUser(c);
  const p = await requirePractitioner(c.env.DB, user);
  if (p.status !== "active") fail(409, "Solo se pausa un perfil publicado");
  await c.env.DB.prepare("UPDATE practitioners SET status='paused',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(p.id).run();
  return c.json({ ok: true, status: "paused" });
});

pro.post("/me/photo", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  const p = await requirePractitioner(db, user);
  await hit(db, `upload:${user.id}`, RULES.upload);
  const stored = await storeUserImage(c.env, "p", user.id, c.req.raw);
  await db.batch([
    db.prepare("UPDATE practitioners SET photo=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(stored.url, p.id),
    db.prepare("UPDATE users SET avatar=? WHERE id=?").bind(stored.url, user.id),
  ]);
  return c.json({ url: stored.url }, 201);
});

/* ------------------------------------------------------------------ Horario y bloqueos */

pro.put("/schedule", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  const p = await requirePractitioner(db, user);
  const rules = validateRules((await readJson<{ rules?: unknown }>(c)).rules);
  if (typeof rules === "string") fail(400, rules);
  await db.batch([
    db.prepare("DELETE FROM availability_rules WHERE practitioner_id=?").bind(p.id),
    ...rules.map((r) =>
      db
        .prepare("INSERT INTO availability_rules(practitioner_id,weekday,start_min,end_min,modality) VALUES(?,?,?,?,?)")
        .bind(p.id, r.weekday, r.start_min, r.end_min, r.modality),
    ),
  ]);
  await track(db, "availability_published", { userId: user.id, practitionerId: p.id, props: { blocks: rules.length } });
  return c.json({ ok: true, rules });
});

pro.post("/blocks", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  const p = await requirePractitioner(db, user);
  const b = await readJson<{ start?: string; end?: string; reason?: string; all_day?: boolean }>(c);
  const start = parseLocal(b.start, 0);
  const end = b.all_day && isDate(b.end) ? localMidnight(addDays(String(b.end), 1)) : parseLocal(b.end, 23);
  if (!start || !end || end <= start) fail(400, "El bloqueo debe terminar después de empezar");
  if (end - start > 120 * DAY) fail(400, "Un bloqueo puede durar como máximo 120 días");
  const row = await db
    .prepare("INSERT INTO availability_blocks(practitioner_id,start_ms,end_ms,reason) VALUES(?,?,?,?) RETURNING id")
    .bind(p.id, start, end, clean(b.reason, 80) || "No disponible")
    .first<{ id: number }>();
  // Avisa si quedan citas activas dentro del bloqueo (no se cancelan solas: el profesional decide).
  const conflicts = await db
    .prepare("SELECT COUNT(*) AS n FROM appointments WHERE practitioner_id=? AND status IN ('solicitada','confirmada') AND start_ms<? AND end_ms>?")
    .bind(p.id, end, start)
    .first<{ n: number }>();
  return c.json({ id: row!.id, conflicts: conflicts?.n ?? 0 }, 201);
});

pro.delete("/blocks/:id", async (c) => {
  const user = requireUser(c);
  const p = await requirePractitioner(c.env.DB, user);
  await c.env.DB.prepare("DELETE FROM availability_blocks WHERE id=? AND practitioner_id=?")
    .bind(Number(c.req.param("id")), p.id)
    .run();
  return c.json({ ok: true });
});

/* ------------------------------------------------------------------ Calendario y métricas */

/** Citas y bloqueos de un rango (vista semanal o mensual del calendario del profesional). */
pro.get("/calendar", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  const p = await requirePractitioner(db, user);
  const today = localDate(Date.now());
  const from = isDate(c.req.query("from")) ? String(c.req.query("from")) : today;
  const days = Math.min(42, Math.max(1, Number(c.req.query("days")) || 7));
  const start = localMidnight(from);
  const end = localMidnight(addDays(from, days));
  const [items, blocks, rules] = await Promise.all([
    db
      .prepare(
        `SELECT id,status,start_ms,end_ms,modality,patient_name,payment_mode,payment_status,price_cents,hold_expires_ms FROM appointments
         WHERE practitioner_id=? AND start_ms<? AND end_ms>? AND status NOT IN ('expirada') ORDER BY start_ms`,
      )
      .bind(p.id, end, start)
      .all<Record<string, any>>(),
    db.prepare("SELECT id,start_ms,end_ms,reason FROM availability_blocks WHERE practitioner_id=? AND start_ms<? AND end_ms>?").bind(p.id, end, start).all(),
    db.prepare("SELECT weekday,start_min,end_min,modality FROM availability_rules WHERE practitioner_id=?").bind(p.id).all(),
  ]);
  return c.json({
    from,
    days,
    appointments: items.results.map((a) => ({
      ...a,
      patient_name: patientShortName(a.patient_name),
      status_label: STATUS_LABEL[a.status as AppointmentStatus],
      payment_label: paymentLabel(a),
    })),
    blocks: blocks.results,
    rules: rules.results,
  });
});

pro.get("/dashboard", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  const p = await requirePractitioner(db, user);
  const now = Date.now();
  const today = localDate(now);
  const dayStart = localMidnight(today);
  const monthStart = localMidnight(`${today.slice(0, 8)}01`);
  const [counts, upcoming, pending, income, reps, recent] = await Promise.all([
    db
      .prepare(
        `SELECT
           SUM(CASE WHEN start_ms>=?1 AND start_ms<?2 AND status IN ('confirmada','completada') THEN 1 ELSE 0 END) AS today,
           SUM(CASE WHEN start_ms>=?1 AND start_ms<?3 AND status IN ('confirmada','solicitada') THEN 1 ELSE 0 END) AS week,
           SUM(CASE WHEN created_at>=datetime(?4/1000,'unixepoch') THEN 1 ELSE 0 END) AS month_requests,
           SUM(CASE WHEN created_at>=datetime(?4/1000,'unixepoch') AND status IN ('confirmada','completada') THEN 1 ELSE 0 END) AS month_confirmed,
           SUM(CASE WHEN status='completada' THEN 1 ELSE 0 END) AS completed,
           SUM(CASE WHEN status='no_asistio' THEN 1 ELSE 0 END) AS no_show,
           SUM(CASE WHEN modality='virtual' AND created_at>=datetime(?4/1000,'unixepoch') THEN 1 ELSE 0 END) AS month_virtual
         FROM appointments WHERE practitioner_id=?5`,
      )
      .bind(dayStart, dayStart + DAY, dayStart + 7 * DAY, monthStart, p.id)
      .first<Record<string, number | null>>(),
    db
      .prepare(
        "SELECT id,status,start_ms,end_ms,modality,patient_name,payment_status,payment_mode FROM appointments WHERE practitioner_id=? AND end_ms>=? AND status IN ('confirmada','solicitada') ORDER BY start_ms LIMIT 8",
      )
      .bind(p.id, now)
      .all<Record<string, any>>(),
    db
      .prepare("SELECT COUNT(*) AS n FROM appointments WHERE practitioner_id=? AND status='solicitada' AND hold_expires_ms>? AND payment_status<>'pendiente'")
      .bind(p.id, now)
      .first<{ n: number }>(),
    db
      .prepare(
        "SELECT COALESCE(SUM(net_cents),0) AS net, COALESCE(SUM(amount_cents),0) AS gross, COUNT(*) AS n FROM payments WHERE practitioner_id=? AND kind='cita' AND status='aprobado' AND created_at>=datetime(?/1000,'unixepoch')",
      )
      .bind(p.id, monthStart)
      .first<{ net: number; gross: number; n: number }>(),
    reputationFor(db, [p.id]),
    db
      .prepare(
        "SELECT r.rating,r.body,r.created_at,u.name FROM reviews r JOIN users u ON u.id=r.author_id WHERE r.practitioner_id=? AND r.hidden=0 ORDER BY r.id DESC LIMIT 3",
      )
      .bind(p.id)
      .all<{ rating: number; body: string; created_at: string; name: string }>(),
  ]);
  const rep = reps.get(p.id);
  const requests = Number(counts?.month_requests ?? 0);
  const steps = [
    { key: "perfil", label: "Perfil completo", done: p.bio.length >= 40 && !!p.license_number && !!p.photo },
    {
      key: "tarifas",
      label: "Tarifas presencial y virtual",
      done: (!p.in_person_enabled || p.price_in_person_cents > 0) && (!p.virtual_enabled || p.price_virtual_cents > 0),
    },
    { key: "whatsapp", label: "Avisos por WhatsApp", done: !!(user.phone && user.whatsapp_opt_in) },
    { key: "verificacion", label: "Perfil verificado y publicado", done: p.status === "active" && p.verification === "verificado" },
  ];
  return c.json({
    practitioner: privateView(p, await getTaxonomy(c.env.DB)),
    kpis: {
      today: counts?.today ?? 0,
      week: counts?.week ?? 0,
      pending: pending?.n ?? 0,
      month_requests: requests,
      confirmation_rate: requests ? Math.round((Number(counts?.month_confirmed ?? 0) / requests) * 100) : null,
      completed: counts?.completed ?? 0,
      no_show: counts?.no_show ?? 0,
      month_virtual: counts?.month_virtual ?? 0,
      income_month_net_cents: income?.net ?? 0,
      income_month_gross_cents: income?.gross ?? 0,
      paid_appointments_month: income?.n ?? 0,
      rating: rep?.rating ?? null,
      reviews: rep?.reviews ?? 0,
      patients: rep?.patients ?? 0,
      views: p.views,
    },
    upcoming: upcoming.results.map((a) => ({
      ...a,
      patient_name: patientShortName(a.patient_name),
      status_label: STATUS_LABEL[a.status as AppointmentStatus],
    })),
    reviews: recent.results.map((r) => ({ ...r, name: patientShortName(r.name) })),
    steps,
  });
});

/** Libro de ingresos del profesional (cada transacción registrada en la app). CSV con ?format=csv. */
pro.get("/income", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  const p = await requirePractitioner(db, user);
  const month = /^\d{4}-\d{2}$/.test(String(c.req.query("month"))) ? String(c.req.query("month")) : localDate(Date.now()).slice(0, 7);
  const from = localMidnight(`${month}-01`);
  const next = localMidnight(`${addDays(`${month}-28`, 4).slice(0, 7)}-01`);
  const rows = (
    await db
      .prepare(
        `SELECT pay.id,pay.kind,pay.appointment_id,pay.amount_cents,pay.fee_cents,pay.net_cents,pay.provider,pay.gateway,pay.status,pay.method,pay.card_brand,pay.card_last4,pay.created_at,pay.approved_at,pay.refunded_at,
                a.start_ms,a.modality,a.patient_name
         FROM payments pay LEFT JOIN appointments a ON a.id=pay.appointment_id
         WHERE pay.practitioner_id=? AND pay.kind='cita' AND pay.created_at>=datetime(?/1000,'unixepoch') AND pay.created_at<datetime(?/1000,'unixepoch')
         ORDER BY pay.created_at DESC LIMIT 500`,
      )
      .bind(p.id, from, next)
      .all<Record<string, any>>()
  ).results.map(
    (r): Record<string, any> => ({
      ...r,
      patient_name: patientShortName(r.patient_name),
      status_label: PAYMENT_STATUS_LABEL[r.status as PaymentRow["status"]],
    }),
  );
  const approved = rows.filter((r) => r.status === "aprobado");
  const totals = {
    gross_cents: approved.reduce((s, r) => s + r.amount_cents, 0),
    fee_cents: approved.reduce((s, r) => s + r.fee_cents, 0),
    net_cents: approved.reduce((s, r) => s + r.net_cents, 0),
    online_cents: approved.filter((r) => collectedOnline(r as PaymentRow)).reduce((s, r) => s + r.net_cents, 0),
    office_cents: approved.filter((r) => !collectedOnline(r as PaymentRow)).reduce((s, r) => s + r.net_cents, 0),
    refunded_cents: rows.filter((r) => r.status === "reembolsado").reduce((s, r) => s + r.amount_cents, 0),
    count: approved.length,
  };
  if (c.req.query("format") === "csv") {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      ["fecha", "transaccion", "cita", "paciente", "modalidad", "proveedor", "estado", "bruto_usd", "comision_usd", "neto_usd"].join(","),
      ...rows.map((r) =>
        [
          r.created_at,
          r.id,
          r.appointment_id,
          r.patient_name,
          r.modality,
          r.gateway || r.provider,
          r.status_label,
          (r.amount_cents / 100).toFixed(2),
          (r.fee_cents / 100).toFixed(2),
          (r.net_cents / 100).toFixed(2),
        ]
          .map(esc)
          .join(","),
      ),
    ];
    return new Response(`﻿${lines.join("\n")}\n`, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ingresos-buscadr-${month}.csv"` },
    });
  }
  return c.json({ month, items: rows, totals, fee_bps: (await getPayoutSettings(c.env)).fee_bps });
});

/* ------------------------------------------------------------------ Plan SaaS */

pro.get("/plan", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  const p = await requirePractitioner(db, user);
  const subs = await db
    .prepare(
      "SELECT s.plan,s.status,s.amount_cents,s.period_start_ms,s.period_end_ms,s.created_at FROM subscriptions s WHERE s.practitioner_id=? ORDER BY s.id DESC LIMIT 24",
    )
    .bind(p.id)
    .all();
  return c.json({ plan: p.plan, plan_until_ms: p.plan_until_ms, history: subs.results, enforced: c.env.BUSCADR_ENFORCE_PLANS === "1" });
});

pro.post("/plan", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  const p = await requirePractitioner(db, user);
  await hit(db, `write:${user.id}`, RULES.write);
  const plan = PLAN_MAP.get(String((await readJson<{ plan?: string }>(c)).plan));
  if (!plan || plan.price_cents <= 0) fail(400, "Elige un plan de pago");
  const created = await createPayment(db, c.env, {
    kind: "plan",
    plan: plan.id,
    payer_id: user.id,
    practitioner_id: p.id,
    amount_cents: plan.price_cents,
    fee_cents: plan.price_cents,
    net_cents: 0,
  });
  const row = await db.prepare("SELECT * FROM payments WHERE id=?").bind(created.id).first<PaymentRow>();
  const checkout = await startCheckout(c.env, row!, new URL(c.req.url).origin, `Plan ${plan.name} buscaDR · ${fullName(p)}`);
  return c.json({ checkout: checkout?.url ?? `/pagar/${created.id}` });
});
