/**
 * Directorio público (Estructura §E «Público»): búsqueda por nombre, especialidad, ciudad, modalidad,
 * cercanía y disponibilidad; ficha pública; horarios libres; favoritos del paciente.
 * Solo se muestran perfiles publicados (status='active'). Nunca se exponen dirección exacta ni teléfonos.
 */
import { Hono } from "hono";
import type { AppBindings, Env } from "../env";
import { CITIES, PLANS, SPECIALTIES, SPECIALTY_MAP, cityByName, guessSpecialty, normalizeText } from "../lib/catalog";
import { track } from "../lib/events";
import { haversineKm } from "../lib/geo";
import { requireUser } from "../lib/guards";
import { clean, fail } from "../lib/http";
import { getPublishedConfig } from "../cms/routes";
import { activeProvider } from "../lib/payments";
import { type PractitionerRow, publicPractitioner, reputationFor } from "../lib/practitioners";
import { feeBps } from "../lib/pricing";
import { BOOKING_WINDOW_DAYS, type Interval, type Modality, type Rule, daySlots, rangeSlots } from "../lib/slots";
import { DAY, addDays, isDate, localDate } from "../lib/time";

export const practitioners = new Hono<AppBindings>();
export const favorites = new Hono<AppBindings>();

type Agenda = { rules: Map<number, Rule[]>; blocks: Map<number, Interval[]>; busy: Map<number, Interval[]> };

/** Carga en tres consultas el horario, bloqueos y citas activas de varios profesionales. */
export async function loadAgenda(db: D1Database, ids: number[], from: number, to: number, now = Date.now()): Promise<Agenda> {
  const out: Agenda = { rules: new Map(), blocks: new Map(), busy: new Map() };
  if (!ids.length) return out;
  const marks = ids.map(() => "?").join(",");
  const [rules, blocks, busy] = await Promise.all([
    db
      .prepare(`SELECT practitioner_id,weekday,start_min,end_min,modality FROM availability_rules WHERE practitioner_id IN (${marks})`)
      .bind(...ids)
      .all<Rule & { practitioner_id: number }>(),
    db
      .prepare(`SELECT practitioner_id,start_ms,end_ms FROM availability_blocks WHERE practitioner_id IN (${marks}) AND start_ms<? AND end_ms>?`)
      .bind(...ids, to, from)
      .all<Interval & { practitioner_id: number }>(),
    db
      .prepare(
        `SELECT a.practitioner_id,a.start_ms,a.block_until_ms AS end_ms FROM appointments a JOIN practitioners p ON p.id=a.practitioner_id
         WHERE a.practitioner_id IN (${marks}) AND p.demo=0 AND (a.status='confirmada' OR (a.status='solicitada' AND a.hold_expires_ms>?)) AND a.start_ms<? AND a.block_until_ms>?`,
      )
      .bind(...ids, now, to, from)
      .all<Interval & { practitioner_id: number }>(),
  ]);
  const push = <T>(m: Map<number, T[]>, id: number, v: T) => m.set(id, [...(m.get(id) ?? []), v]);
  for (const r of rules.results) push(out.rules, r.practitioner_id, { weekday: r.weekday, start_min: r.start_min, end_min: r.end_min, modality: r.modality });
  for (const b of blocks.results) push(out.blocks, b.practitioner_id, { start_ms: b.start_ms, end_ms: b.end_ms });
  for (const b of busy.results) push(out.busy, b.practitioner_id, { start_ms: b.start_ms, end_ms: b.end_ms });
  return out;
}

/** Próximo horario libre (hasta 14 días) para una modalidad opcional. */
export function nextSlot(p: PractitionerRow, agenda: Agenda, modality: Modality | null, now = Date.now()) {
  const today = localDate(now);
  for (let i = 0; i < 14; i++) {
    const slots = daySlots(addDays(today, i), agenda.rules.get(p.id) ?? [], p, agenda.busy.get(p.id) ?? [], agenda.blocks.get(p.id) ?? [], now);
    const hit = slots.find((s) => !modality || s.modalities.includes(modality));
    if (hit) return hit.start_ms;
  }
  return null;
}

/** Ajustes editoriales del CMS (foto, frase y «Destacado», siempre rotulado). No tocan verificación ni opiniones. */
async function withCms<T extends { id: number; photo: string; headline: string }>(db: D1Database, items: T[]) {
  const overrides = (await getPublishedConfig(db)).config.practitioners;
  return items.map((it) => {
    const o = overrides[String(it.id)];
    return { ...it, photo: o?.photo || it.photo, headline: o?.headline || it.headline, featured: !!o?.featured };
  });
}

export function catalogPayload(env: Env) {
  return {
    specialties: SPECIALTIES.map(({ keywords: _k, ...s }) => s),
    cities: CITIES,
    plans: PLANS,
    fee_bps: feeBps(env),
    payments: activeProvider(env),
  };
}

const SORTS = ["relevancia", "cercania", "precio", "valoracion", "disponibilidad"] as const;

practitioners.get("/", async (c) => {
  const db = c.env.DB;
  const q = clean(c.req.query("q"), 80);
  const specialtyParam = clean(c.req.query("specialty"), 40);
  const specialty = SPECIALTY_MAP.has(specialtyParam) ? specialtyParam : q ? guessSpecialty(q) : null;
  const city = cityByName(clean(c.req.query("city"), 40));
  const modality = c.req.query("modality") === "virtual" ? "virtual" : c.req.query("modality") === "presencial" ? "presencial" : null;
  const sort = (SORTS as readonly string[]).includes(String(c.req.query("sort"))) ? String(c.req.query("sort")) : "relevancia";
  const limit = Math.min(60, Math.max(1, Number(c.req.query("limit")) || 36));
  const lat = Number(c.req.query("lat"));
  const lng = Number(c.req.query("lng"));
  const origin = Number.isFinite(lat) && Number.isFinite(lng) && c.req.query("lat") ? { lat, lng } : city ? { lat: city.lat, lng: city.lng } : null;

  const where = ["p.status='active'"];
  const binds: unknown[] = [];
  if (SPECIALTY_MAP.has(specialtyParam)) {
    where.push("p.specialty=?");
    binds.push(specialtyParam);
  }
  if (city && !c.req.query("lat")) {
    where.push("p.city=?");
    binds.push(city.name);
  }
  if (modality === "virtual") where.push("p.virtual_enabled=1");
  if (modality === "presencial") where.push("p.in_person_enabled=1");
  // El texto se compara sin tildes en el Worker («mendez» encuentra «Méndez»); el volumen del piloto lo permite.
  const nq = normalizeText(q);
  const rows = (
    await db
      .prepare(`SELECT p.* FROM practitioners p WHERE ${where.join(" AND ")} LIMIT 400`)
      .bind(...binds)
      .all<PractitionerRow>()
  ).results.filter(
    (p) =>
      !nq ||
      (!SPECIALTY_MAP.has(specialtyParam) && specialty && p.specialty === specialty) ||
      normalizeText(
        [p.title, p.display_name, p.sector, p.city, p.headline, p.services, p.subspecialty, SPECIALTY_MAP.get(p.specialty)?.name ?? ""].join(" "),
      ).includes(nq),
  );
  const now = Date.now();
  const reps = await reputationFor(
    db,
    rows.map((r) => r.id),
  );
  const agenda = await loadAgenda(
    db,
    rows.map((r) => r.id),
    now,
    now + 15 * DAY,
    now,
  );
  const items0 = rows.map((p) =>
    publicPractitioner(p, reps.get(p.id), {
      distance_km: origin && p.lat != null && p.lng != null ? Math.round((haversineKm(origin.lat, origin.lng, p.lat, p.lng) ?? 0) * 10) / 10 : null,
      next_slot_ms: nextSlot(p, agenda, modality, now),
    }),
  );
  let items = await withCms(db, items0);
  const price = (x: (typeof items)[number]) => (modality === "virtual" ? x.price_virtual_cents : x.price_in_person_cents || x.price_virtual_cents);
  const sorters: Record<string, (a: (typeof items)[number], b: (typeof items)[number]) => number> = {
    cercania: (a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999),
    precio: (a, b) => price(a) - price(b),
    valoracion: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.reviews - a.reviews,
    disponibilidad: (a, b) => (a.next_slot_ms ?? Number.MAX_SAFE_INTEGER) - (b.next_slot_ms ?? Number.MAX_SAFE_INTEGER),
    // Relevancia: perfiles reales verificados primero, luego con agenda disponible, luego valoración.
    relevancia: (a, b) =>
      Number(b.featured) - Number(a.featured) ||
      Number(a.demo) - Number(b.demo) ||
      Number(b.verified) - Number(a.verified) ||
      Number(b.next_slot_ms != null) - Number(a.next_slot_ms != null) ||
      (b.rating ?? 0) - (a.rating ?? 0) ||
      (a.distance_km ?? 999) - (b.distance_km ?? 999),
  };
  items = items.sort(sorters[sort]).slice(0, limit);
  if (q || specialty) {
    c.executionCtx.waitUntil(
      Promise.all([
        track(db, items.length ? "search_submitted" : "search_empty", {
          userId: c.get("user")?.id ?? null,
          props: { specialty, city: city?.name ?? null, modality, results: items.length },
        }),
        items.length
          ? Promise.resolve()
          : db
              .prepare("INSERT INTO demand_log(query,specialty,city,results,user_id) VALUES(?,?,?,0,?)")
              .bind(q.slice(0, 80), specialty ?? "", city?.name ?? "", c.get("user")?.id ?? null)
              .run(),
      ]).then(() => undefined),
    );
  }
  return c.json({ items, total: items.length, specialty, city: city?.name ?? null, modality, sort });
});

async function bySlug(db: D1Database, slug: string) {
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) return null;
  return db.prepare("SELECT * FROM practitioners WHERE slug=?").bind(slug).first<PractitionerRow>();
}

practitioners.get("/:slug", async (c) => {
  const db = c.env.DB;
  const p = await bySlug(db, c.req.param("slug"));
  const user = c.get("user");
  // El propio profesional puede ver su ficha aunque aún esté en revisión (vista previa).
  if (!p || (p.status !== "active" && p.user_id !== user?.id)) fail(404, "No encontramos este perfil");
  const now = Date.now();
  const [reps, reviews, rules, fav] = await Promise.all([
    reputationFor(db, [p.id]),
    db
      .prepare(
        "SELECT r.rating,r.body,r.reply,r.created_at,u.name FROM reviews r JOIN users u ON u.id=r.author_id WHERE r.practitioner_id=? AND r.hidden=0 ORDER BY r.id DESC LIMIT 12",
      )
      .bind(p.id)
      .all<{ rating: number; body: string; reply: string; created_at: string; name: string }>(),
    db.prepare("SELECT weekday,start_min,end_min,modality FROM availability_rules WHERE practitioner_id=? ORDER BY weekday,start_min").bind(p.id).all<Rule>(),
    user ? db.prepare("SELECT 1 FROM favorites WHERE user_id=? AND practitioner_id=?").bind(user.id, p.id).first() : Promise.resolve(null),
  ]);
  const agenda = await loadAgenda(db, [p.id], now, now + 15 * DAY, now);
  if (p.status === "active" && p.user_id !== user?.id) {
    c.executionCtx.waitUntil(
      Promise.all([
        db.prepare("UPDATE practitioners SET views=views+1 WHERE id=?").bind(p.id).run(),
        track(db, "profile_opened", { userId: user?.id ?? null, practitionerId: p.id }),
      ]).then(() => undefined),
    );
  }
  return c.json({
    practitioner: (await withCms(db, [publicPractitioner(p, reps.get(p.id), { next_slot_ms: nextSlot(p, agenda, null, now) })]))[0],
    preview: p.status !== "active",
    hours: rules.results,
    favorite: !!fav,
    reviews: reviews.results.map((r) => ({
      rating: r.rating,
      body: r.body,
      reply: r.reply,
      created_at: r.created_at,
      // Opinión verificada: nombre y primera inicial del apellido.
      author: r.name
        .split(/\s+/)
        .slice(0, 2)
        .map((w, i) => (i ? `${w[0]}.` : w))
        .join(" "),
    })),
  });
});

/** Horarios libres por día (tira de fechas + horarios del día elegido). */
practitioners.get("/:slug/availability", async (c) => {
  const db = c.env.DB;
  const p = await bySlug(db, c.req.param("slug"));
  if (!p || p.status !== "active") fail(404, "No encontramos este perfil");
  const now = Date.now();
  const today = localDate(now);
  const from = isDate(c.req.query("from")) && String(c.req.query("from")) >= today ? String(c.req.query("from")) : today;
  const days = Math.min(14, Math.max(1, Number(c.req.query("days")) || 7));
  if (from > addDays(today, BOOKING_WINDOW_DAYS)) return c.json({ from, days: [] });
  const modality = c.req.query("modality") === "virtual" ? "virtual" : c.req.query("modality") === "presencial" ? "presencial" : null;
  const start = now;
  const end = now + (days + 1) * DAY + (Date.parse(`${from}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`));
  const agenda = await loadAgenda(db, [p.id], start, end, now);
  const result = rangeSlots(from, days, agenda.rules.get(p.id) ?? [], p, agenda.busy.get(p.id) ?? [], agenda.blocks.get(p.id) ?? [], now).map((d) => ({
    date: d.date,
    slots: d.slots.filter((s) => !modality || s.modalities.includes(modality)),
  }));
  return c.json({ from, modality, days: result });
});

/* ------------------------------------------------------------------ Favoritos */

favorites.get("/", async (c) => {
  const user = requireUser(c);
  const rows = (
    await c.env.DB.prepare(
      "SELECT p.* FROM favorites f JOIN practitioners p ON p.id=f.practitioner_id WHERE f.user_id=? AND p.status='active' ORDER BY f.created_at DESC",
    )
      .bind(user.id)
      .all<PractitionerRow>()
  ).results;
  const reps = await reputationFor(
    c.env.DB,
    rows.map((r) => r.id),
  );
  return c.json({
    items: await withCms(
      c.env.DB,
      rows.map((p) => publicPractitioner(p, reps.get(p.id))),
    ),
  });
});

favorites.put("/:id", async (c) => {
  const user = requireUser(c);
  const id = Number(c.req.param("id"));
  if (!Number.isSafeInteger(id)) fail(404, "Perfil no encontrado");
  const res = await c.env.DB.prepare("INSERT OR IGNORE INTO favorites(user_id,practitioner_id) SELECT ?,id FROM practitioners WHERE id=? AND status='active'")
    .bind(user.id, id)
    .run();
  return c.json({ ok: true, favorite: true, changed: res.meta.changes });
});

favorites.delete("/:id", async (c) => {
  const user = requireUser(c);
  await c.env.DB.prepare("DELETE FROM favorites WHERE user_id=? AND practitioner_id=?")
    .bind(user.id, Number(c.req.param("id")))
    .run();
  return c.json({ ok: true, favorite: false });
});
