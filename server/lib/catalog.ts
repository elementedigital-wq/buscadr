/**
 * Taxonomía sanitaria inicial y ciudades del piloto (Documento Maestro §3.1 y §14).
 * Especialidades de atención ambulatoria y demanda frecuente; la lista final se valida con
 * entrevistas y criterios de acreditación aplicables a cada profesión. Sin datos clínicos.
 */
export const TONES = ["azul", "verde", "cielo", "neutro"] as const;
export type Tone = (typeof TONES)[number];

export type Specialty = {
  slug: string;
  name: string;
  /** Profesional en singular para SEO y tarjetas: «Pediatra», «Psicólogo/a». */
  professional: string;
  /** Icono del catálogo Font Awesome Free (`app/lib/icon-data.ts`), editable en el CMS. */
  icon: string;
  tone: Tone;
  /** Visible en el directorio desde el inicio (las demás se activan en el CMS). */
  enabled: boolean;
  keywords: string[];
};

export const SPECIALTIES: Specialty[] = [
  { slug: "medicina-general", name: "Medicina general", professional: "Médico general", icon: "stethoscope", tone: "azul", enabled: true, keywords: ["medico", "general", "familiar", "chequeo", "consulta", "fiebre", "gripe", "doctor"] },
  { slug: "pediatria", name: "Pediatría", professional: "Pediatra", icon: "baby", tone: "verde", enabled: true, keywords: ["pediatra", "nino", "nina", "bebe", "infantil", "vacuna", "hijo"] },
  { slug: "ginecologia", name: "Ginecología", professional: "Ginecólogo/a", icon: "person-pregnant", tone: "cielo", enabled: true, keywords: ["ginecologo", "ginecologa", "embarazo", "obstetricia", "mujer", "control prenatal"] },
  { slug: "dermatologia", name: "Dermatología", professional: "Dermatólogo/a", icon: "hand-dots", tone: "verde", enabled: true, keywords: ["dermatologo", "piel", "acne", "lunares", "manchas", "cabello"] },
  { slug: "odontologia", name: "Odontología", professional: "Odontólogo/a", icon: "tooth", tone: "azul", enabled: true, keywords: ["odontologo", "dentista", "dientes", "muela", "limpieza dental", "ortodoncia", "brackets"] },
  { slug: "psicologia", name: "Psicología", professional: "Psicólogo/a", icon: "brain", tone: "cielo", enabled: true, keywords: ["psicologo", "psicologa", "terapia", "ansiedad", "estres", "pareja", "emocional"] },
  { slug: "nutricion", name: "Nutrición", professional: "Nutricionista", icon: "apple-whole", tone: "verde", enabled: true, keywords: ["nutricionista", "dieta", "peso", "alimentacion", "obesidad", "nutriologo"] },
  { slug: "fisioterapia", name: "Fisioterapia", professional: "Fisioterapeuta", icon: "person-walking", tone: "azul", enabled: true, keywords: ["fisioterapeuta", "rehabilitacion", "lesion", "espalda", "terapia fisica", "dolor"] },
  { slug: "cardiologia", name: "Cardiología", professional: "Cardiólogo/a", icon: "heart-pulse", tone: "azul", enabled: true, keywords: ["cardiologo", "corazon", "presion", "hipertension", "electrocardiograma", "arritmia"] },
  { slug: "traumatologia", name: "Traumatología", professional: "Traumatólogo/a", icon: "bone", tone: "neutro", enabled: true, keywords: ["traumatologo", "huesos", "rodilla", "fractura", "ortopedia", "columna"] },
  { slug: "oftalmologia", name: "Oftalmología", professional: "Oftalmólogo/a", icon: "eye", tone: "cielo", enabled: true, keywords: ["oftalmologo", "ojos", "vista", "lentes", "vision"] },
  { slug: "otorrinolaringologia", name: "Otorrinolaringología", professional: "Otorrino", icon: "ear-listen", tone: "neutro", enabled: false, keywords: ["otorrino", "oido", "nariz", "garganta", "sinusitis"] },
  { slug: "endocrinologia", name: "Endocrinología", professional: "Endocrinólogo/a", icon: "vial", tone: "verde", enabled: false, keywords: ["endocrinologo", "tiroides", "diabetes", "hormonas"] },
  { slug: "neurologia", name: "Neurología", professional: "Neurólogo/a", icon: "head-side-virus", tone: "azul", enabled: false, keywords: ["neurologo", "migrana", "cabeza", "nervios", "convulsiones"] },
  { slug: "psiquiatria", name: "Psiquiatría", professional: "Psiquiatra", icon: "comment-medical", tone: "cielo", enabled: false, keywords: ["psiquiatra", "depresion", "medicacion", "salud mental"] },
  { slug: "laboratorio", name: "Laboratorio clínico", professional: "Laboratorio", icon: "microscope", tone: "neutro", enabled: false, keywords: ["laboratorio", "examenes", "sangre", "analisis"] },
];

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
export const normalizeText = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

/** Sugiere especialidad a partir de un texto libre («me duele la muela» → odontología). */
export function guessSpecialty(text: string): string | null {
  const n = normalizeText(text);
  if (!n) return null;
  let best: { slug: string; score: number } | null = null;
  for (const s of SPECIALTIES) {
    const score = [normalizeText(s.name), normalizeText(s.professional), ...s.keywords].reduce((acc, k) => acc + (n.includes(k) ? k.length : 0), 0);
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
