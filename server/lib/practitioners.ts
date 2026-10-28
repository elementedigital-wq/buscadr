/** Perfiles profesionales: tipos, vista pública (sin datos privados) y agregados de reputación. */
import { approximate } from "./geo";
import { KINDS, type Kind } from "./catalog";
import { BASE_TAXONOMY, type Taxonomy } from "./taxonomy";

export type PractitionerRow = {
  id: number;
  user_id: string;
  slug: string;
  kind: Kind;
  title: string;
  display_name: string;
  specialty: string;
  subspecialty: string;
  headline: string;
  bio: string;
  years_experience: number;
  languages: string;
  services: string;
  insurances: string;
  license_number: string;
  city: string;
  sector: string;
  address: string;
  lat: number | null;
  lng: number | null;
  photo: string;
  in_person_enabled: number;
  virtual_enabled: number;
  price_in_person_cents: number;
  price_virtual_cents: number;
  slot_minutes: number;
  buffer_minutes: number;
  min_notice_hours: number;
  auto_confirm: number;
  prepay_virtual: number;
  prepay_in_person: number;
  status: "draft" | "review" | "active" | "paused" | "rejected";
  verification: "pendiente" | "verificado" | "rechazado";
  verified_at: string | null;
  review_note: string;
  plan: string;
  plan_until_ms: number | null;
  demo: number;
  views: number;
  /** Cuenta para liquidaciones: cifrada y su resumen enmascarado (ADR 0016). Nunca en la vista pública. */
  payout_account_enc: string;
  payout_account_hint: string;
  created_at: string;
  updated_at: string;
};

export type Reputation = { rating: number | null; reviews: number; patients: number };

export const fullName = (p: Pick<PractitionerRow, "title" | "display_name">) => `${p.title ? `${p.title} ` : ""}${p.display_name}`.trim();

export const parseServices = (raw: string): string[] => {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 20) : [];
  } catch {
    return [];
  }
};

/** Vista pública: coordenadas aproximadas (~1 km), sin dirección exacta, teléfono ni licencia completa. */
export function publicPractitioner(
  p: PractitionerRow,
  rep?: Reputation,
  extra: { distance_km?: number | null; next_slot_ms?: number | null } = {},
  tax: Pick<Taxonomy, "map"> = BASE_TAXONOMY,
) {
  const sp = tax.map.get(p.specialty);
  return {
    id: p.id,
    slug: p.slug,
    kind: p.kind,
    kind_label: KINDS[p.kind] ?? "Profesional",
    name: fullName(p),
    display_name: p.display_name,
    title: p.title,
    specialty: p.specialty,
    specialty_name: sp?.name ?? p.specialty,
    professional_label: sp?.professional ?? "Profesional de la salud",
    subspecialty: p.subspecialty,
    headline: p.headline,
    bio: p.bio,
    years_experience: p.years_experience,
    languages: p.languages,
    services: parseServices(p.services),
    insurances: p.insurances,
    city: p.city,
    sector: p.sector,
    lat: approximate(p.lat),
    lng: approximate(p.lng),
    photo: p.photo,
    in_person: !!p.in_person_enabled,
    virtual: !!p.virtual_enabled,
    price_in_person_cents: p.price_in_person_cents,
    price_virtual_cents: p.price_virtual_cents,
    slot_minutes: p.slot_minutes,
    auto_confirm: !!p.auto_confirm,
    prepay_virtual: !!p.prepay_virtual,
    prepay_in_person: !!p.prepay_in_person,
    verified: p.verification === "verificado",
    verified_at: p.verification === "verificado" ? p.verified_at : null,
    /** Registro profesional parcialmente oculto: confirma que existe sin exponerlo completo. */
    license_hint: p.license_number ? `•••${p.license_number.slice(-4)}` : "",
    demo: !!p.demo,
    rating: rep?.rating ?? null,
    reviews: rep?.reviews ?? 0,
    patients: rep?.patients ?? 0,
    distance_km: extra.distance_km ?? null,
    next_slot_ms: extra.next_slot_ms ?? null,
  };
}

export type PublicPractitioner = ReturnType<typeof publicPractitioner>;

/** Reputación real: solo opiniones de citas completadas y no ocultas por moderación. */
export async function reputationFor(db: D1Database, ids: number[]): Promise<Map<number, Reputation>> {
  const out = new Map<number, Reputation>();
  if (!ids.length) return out;
  const marks = ids.map(() => "?").join(",");
  const [reviews, patients] = await Promise.all([
    db
      .prepare(
        `SELECT practitioner_id AS id, AVG(rating) AS rating, COUNT(*) AS n FROM reviews WHERE hidden=0 AND practitioner_id IN (${marks}) GROUP BY practitioner_id`,
      )
      .bind(...ids)
      .all<{ id: number; rating: number; n: number }>(),
    db
      .prepare(
        `SELECT practitioner_id AS id, COUNT(DISTINCT patient_id) AS n FROM appointments WHERE status='completada' AND practitioner_id IN (${marks}) GROUP BY practitioner_id`,
      )
      .bind(...ids)
      .all<{ id: number; n: number }>(),
  ]);
  for (const id of ids) out.set(id, { rating: null, reviews: 0, patients: 0 });
  for (const r of reviews.results) out.set(r.id, { ...out.get(r.id)!, rating: Math.round(r.rating * 10) / 10, reviews: r.n });
  for (const r of patients.results) out.set(r.id, { ...out.get(r.id)!, patients: r.n });
  return out;
}

/** Nombre público de un paciente frente al profesional antes de la cita: nombre y primera inicial. */
export function patientShortName(name: string | null | undefined) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "Paciente";
  return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0];
}
