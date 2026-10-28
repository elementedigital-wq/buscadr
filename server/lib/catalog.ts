/**
 * Catálogo base: tonos, especialidades (taxonomía completa en `taxonomy-data.ts`), tipos de perfil,
 * ciudades del piloto y planes. La taxonomía efectiva (con lo que agrega el CMS) está en `taxonomy.ts`.
 */
import { BASE_SPECIALTIES } from "./taxonomy-data";

export const TONES = ["azul", "verde", "cielo", "neutro"] as const;
export type Tone = (typeof TONES)[number];

export type Specialty = {
  slug: string;
  name: string;
  /** Profesional en singular para SEO y tarjetas: «Pediatra», «Psicólogo/a». */
  professional: string;
  /** Categoría (`CATEGORIES`): agrupa especialidades en el sitio y en el CMS. */
  category: string;
  /** Ícono de Font Awesome Free (`app/lib/icon-data.ts`), editable en el CMS. */
  icon: string;
  tone: Tone;
  /** Visible en el directorio desde el inicio (el CMS puede ocultarla). */
  enabled: boolean;
  keywords: string[];
};

export { CATEGORIES, type Category } from "./taxonomy-data";
/** Especialidades base (taxonomía completa en `taxonomy-data.ts`; el CMS suma las propias). */
export const SPECIALTIES: Specialty[] = BASE_SPECIALTIES;

export const SPECIALTY_MAP = new Map(SPECIALTIES.map((s) => [s.slug, s]));
export const SPECIALTY_SLUGS = SPECIALTIES.map((s) => s.slug);

export const KINDS = {
  medico: "Médico/a",
  especialista: "Especialista",
  clinica: "Clínica o centro médico",
  servicio: "Servicio médico",
} as const;
export type Kind = keyof typeof KINDS;

export const TITLES = ["", "Dr.", "Dra.", "Lic.", "Psic.", "Od.", "Nut.", "Ft."] as const;

export type City = { slug: string; name: string; lat: number; lng: number; sectors: string[] };

export const CITIES: City[] = [
  {
    slug: "guayaquil",
    name: "Guayaquil",
    lat: -2.1709,
    lng: -79.9224,
    sectors: ["Kennedy", "Urdesa", "Ceibos", "Alborada", "Centro", "Puerto Santa Ana", "Garzota", "Sauces", "Samanes", "Vía a la Costa"],
  },
  { slug: "samborondon", name: "Samborondón", lat: -2.1444, lng: -79.8678, sectors: ["La Puntilla", "Entre Ríos", "Ciudad Celeste", "Río Centro", "Tornero"] },
  { slug: "daule", name: "Daule", lat: -2.0985, lng: -79.9097, sectors: ["La Aurora", "Villa Club", "Ciudad Santa María", "Matices"] },
  { slug: "quito", name: "Quito", lat: -0.1807, lng: -78.4678, sectors: ["La Carolina", "Cumbayá", "González Suárez", "Quicentro", "El Batán"] },
  { slug: "cuenca", name: "Cuenca", lat: -2.9001, lng: -79.0059, sectors: ["El Vergel", "Centro Histórico", "Ordóñez Lasso", "Monay"] },
];

export const CITY_NAMES = CITIES.map((c) => c.name);
export const cityByName = (name: string | null | undefined) => CITIES.find((c) => c.name === name) ?? null;
export const cityBySlug = (slug: string | null | undefined) => CITIES.find((c) => c.slug === slug) ?? null;

/** Normaliza texto para búsqueda: minúsculas y sin tildes. */
export const normalizeText = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Sugiere especialidad a partir de un texto libre («me duele la muela» → odontología). */
export function guessSpecialty(text: string, list: Pick<Specialty, "slug" | "name" | "professional" | "keywords">[] = SPECIALTIES): string | null {
  const n = normalizeText(text);
  if (!n) return null;
  let best: { slug: string; score: number } | null = null;
  // Cada término cuenta solo si aparece al inicio de una palabra y tiene 3+ letras («x» de «rayos x» no basta).
  const words = ` ${n.replace(/[^a-z0-9ñ]+/g, " ")} `;
  const hit = (k: string) => k.length >= 3 && words.includes(` ${k}`);
  for (const s of list) {
    const score = [normalizeText(s.name), normalizeText(s.professional), ...s.keywords].reduce((acc, k) => acc + (hit(k) ? k.length : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { slug: s.slug, score };
  }
  return best?.slug ?? null;
}

/** Slug URL-seguro a partir de un nombre («Dra. Ana Torres» → «dra-ana-torres»). */
export const slugify = (s: string) =>
  normalizeText(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "profesional";

/**
 * Planes SaaS del Documento Maestro §4.1 (precios de prueba, USD/mes, antes de impuestos).
 * La verificación y las opiniones nunca dependen del plan.
 */
export const PLANS = [
  {
    id: "free",
    name: "Free",
    price_cents: 0,
    unit: "Un perfil validado",
    features: ["Ficha pública y servicios", "Opiniones verificadas", "Hasta 15 citas al mes", "Notificaciones en la app"],
    monthly_appointments: 15,
  },
  {
    id: "agenda",
    name: "Agenda",
    price_cents: 1500,
    unit: "Profesional",
    features: ["Agenda en línea ilimitada", "Enlace público para reservar", "Confirmaciones por WhatsApp y correo", "Panel básico"],
    monthly_appointments: null,
  },
  {
    id: "pro",
    name: "Pro",
    price_cents: 2900,
    unit: "Profesional",
    features: ["Todo Agenda", "Citas virtuales con videollamada", "Cobros en línea con buscaDR Pay", "Recordatorios 24 h y 1 h", "Métricas"],
    monthly_appointments: null,
  },
  {
    id: "growth",
    name: "Growth",
    price_cents: 5900,
    unit: "Profesional",
    features: ["Todo Pro", "Varias ubicaciones", "Automatizaciones de WhatsApp ampliadas", "Analítica y reportes"],
    monthly_appointments: null,
  },
  {
    id: "clinic",
    name: "Clinic",
    price_cents: 11900,
    unit: "Organización",
    features: ["Una sede, hasta 5 profesionales", "Recepción y agendas coordinadas", "Reportes por profesional", "Extras tasados"],
    monthly_appointments: null,
  },
] as const;
export type PlanId = (typeof PLANS)[number]["id"];
export const PLAN_MAP = new Map<string, (typeof PLANS)[number]>(PLANS.map((p) => [p.id, p]));
/** Funciones que exigen plan pagado (se valida en el servidor). */
export const planAllows = (plan: string, feature: "virtual" | "online_payments" | "unlimited") =>
  feature === "unlimited" ? plan !== "free" : ["pro", "growth", "clinic"].includes(plan);
