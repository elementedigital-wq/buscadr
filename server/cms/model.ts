/** Esquema de contenido del CMS Maestro de buscaDR. Nunca acepta HTML, CSS ni scripts en datos editables. */
import { isIconName } from "../../app/lib/icons";
import { SPECIALTIES, TONES } from "../lib/catalog";

/** Tipografías incluidas en el sitio (Brand Deck, lámina 09: Manrope para titulares, Inter para la interfaz). */
export const BUILTIN_FONTS = ["Manrope", "Inter"] as const;
/** Sugerencias de Google Fonts para el CMS (cualquier otra familia de Google Fonts también se admite). */
export const GOOGLE_FONT_SUGGESTIONS = [
  "Plus Jakarta Sans",
  "DM Sans",
  "Poppins",
  "Outfit",
  "Sora",
  "Figtree",
  "Urbanist",
  "Lexend",
  "Nunito Sans",
  "Montserrat",
  "Work Sans",
  "Rubik",
  "Source Sans 3",
  "Lato",
  "Open Sans",
  "Roboto",
  "Raleway",
  "Quicksand",
] as const;
export type FontFile = { url: string; weight: number; style: "normal" | "italic" };
/** `google` sin archivos = hoja de Google Fonts; con archivos = importada y alojada en buscaDR. */
export type FontDef = { family: string; source: "google" | "upload"; weights: string; files: FontFile[] };
export const FONT_FAMILY = /^[A-Za-z0-9][A-Za-z0-9 ]{0,39}$/;
export const FONT_WEIGHTS = /^[1-9]00(?:;[1-9]00){0,8}$/;
export const FONT_URL = /^\/api\/media\/[0-9a-f-]{36}\.(?:woff2|woff|ttf|otf)$/;
export const ROUTES = ["inicio", "buscar", "especialidades", "citas", "panel", "planes", "para-profesionales", "como-funciona", "cuenta"] as const;
/** Nombre de ícono de Font Awesome: «stethoscope», «regular:heart», «brands:whatsapp». */
export const ICON_NAME = /^(?:(?:regular|brands):)?[a-z0-9]+(?:-[a-z0-9]+){0,6}$/;
const SVG_PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/;

/** HEX oficiales del Brand Deck buscaDR (lámina 08: Sistema de color). */
export const BRAND = {
  primary: "#0F62FE",
  secondary: "#10B981",
  accent: "#38BDF8",
  soft: "#D1FAE5",
  sky: "#E0F2FE",
  neutral: "#64748B",
  background: "#F6F9FC",
  surface: "#FFFFFF",
  text: "#0B1F3B",
};

export type CmsConfig = ReturnType<typeof normalizeCms>;
export type NavKey = "inicio" | "buscar" | "citas" | "favoritos" | "panel" | "cuenta";
export const DEFAULT_NAV_ICONS: Record<NavKey, string> = {
  inicio: "house",
  buscar: "magnifying-glass",
  citas: "regular:calendar-check",
  favoritos: "regular:heart",
  panel: "stethoscope",
  cuenta: "regular:user",
};
type Banner = { id: string; title: string; subtitle: string; image: string; button: string; route: string; specialty: string; visible: boolean };
type IconText = { title: string; text: string; icon: string };

export const DEFAULT_CMS = {
  theme: {
    ...BRAND,
    radius: 20,
    font: "Manrope",
    bodyFont: "Inter",
    fonts: [] as FontDef[],
    /** Íconos de Font Awesome fuera del catálogo curado, elegidos en el CMS: nombre → [ancho, alto, trazado]. */
    iconLibrary: {} as Record<string, [number, number, string]>,
    logo: "/assets/buscadr-logo.png",
    logoDark: "/assets/buscadr-logo-blanco.png",
    favicon: "/assets/buscadr-isotipo.png",
  },
  hero: {
    eyebrow: "Directorio médico · Ecuador",
    title: "Encuentra profesionales",
    highlight: "de la salud cerca de ti.",
    description: "Busca, compara y agenda citas con médicos y especialistas. Atención presencial o virtual, con la tarifa clara antes de reservar.",
    image: "/assets/hero-doctor.webp",
    imageAlt: "Médica sonriente con estetoscopio",
    cta: "Buscar",
    secondaryCta: "Soy profesional de la salud",
    badgeTitle: "Cita confirmada",
    badgeText: "Recibe la confirmación en la app, por correo y WhatsApp",
  },
  banners: [
    {
      id: "banner-virtual",
      title: "Consultas virtuales desde casa",
      subtitle: "Psicología, nutrición, medicina general y más por videollamada, con su propia tarifa.",
      image: "/assets/concept-ui.webp",
      button: "Ver consultas virtuales",
      route: "buscar",
      specialty: "",
      visible: true,
    },
    {
      id: "banner-profesionales",
      title: "¿Eres médico o tienes una clínica?",
      subtitle: "Agenda en línea, confirmaciones por WhatsApp, cobros registrados y un panel de citas para tu consultorio.",
      image: "/assets/hero-doctor.webp",
      button: "Conoce buscaDR para profesionales",
      route: "para-profesionales",
      specialty: "",
      visible: true,
    },
  ] as Banner[],
  copy: {
    specialtiesTitle: "Especialidades",
    specialtiesSubtitle: "Encuentra al profesional adecuado para ti y tu familia.",
    doctorsTitle: "Profesionales destacados",
    doctorsSubtitle: "Perfiles revisados por buscaDR, con horarios disponibles.",
    footer: "buscaDR · Confianza para encontrar salud.",
    pilotNotice: "Piloto en Ecuador · Guayaquil, Samborondón, Daule, Quito y Cuenca",
    emergencyNotice: "buscaDR no atiende emergencias. Ante una urgencia llama al 911.",
  },
  layout: {
    homeSpecialtyCount: 8,
    homeDoctorCount: 6,
    searchCount: 36,
    columns: 3,
    cardStyle: "spacious",
    showRatings: true,
    showBadges: true,
    showPrices: true,
    showMap: true,
    showBanners: true,
    showUpcoming: true,
    showSteps: true,
    showPromises: true,
    showWhatsapp: true,
    showPlans: true,
  },
  specialties: SPECIALTIES.map((s, order) => ({
    slug: s.slug,
    name: s.name,
    icon: s.icon,
    tone: s.tone as (typeof TONES)[number],
    visible: s.enabled,
    order: s.enabled ? order : 50 + order,
  })),
  buttons: {
    primary: "Ver perfil",
    book: "Agendar cita",
    explore: "Ver todos los profesionales",
    pro: "Registrar mi consultorio",
    shape: "pill",
  },
  navigation: {
    inicio: "Inicio",
    buscar: "Buscar",
    citas: "Mis citas",
    favoritos: "Favoritos",
    panel: "Mi consultorio",
    cuenta: "Cuenta",
    icons: DEFAULT_NAV_ICONS,
  },
  /** Ajustes por profesional: foto alternativa, frase de la tarjeta y «Destacado» (siempre rotulado). */
  practitioners: {} as Record<string, { photo: string; headline: string; featured: boolean }>,
  trust: { moderateReviews: true, showDemoBadges: true },
  home: {
    greetingSubtitle: "¿Cómo podemos ayudarte hoy?",
    searchPlaceholder: "Especialidad, nombre o síntoma… ej.: pediatra",
    suggestions: ["Pediatra", "Dermatólogo", "Psicólogo", "Ginecólogo", "Odontólogo", "Nutricionista"],
    features: [
      { title: "Profesionales verificados", text: "Credenciales revisadas a mano por buscaDR.", icon: "shield-halved" },
      { title: "Presencial o virtual", text: "Cada modalidad con su propia tarifa.", icon: "video" },
      { title: "Opiniones reales", text: "Solo de pacientes que asistieron a su cita.", icon: "star" },
      { title: "Confirmación inmediata", text: "En la app, por correo y WhatsApp.", icon: "regular:bell" },
    ] as IconText[],
    stepsTitle: "Así funciona",
    steps: [
      { title: "Busca", text: "Filtra por especialidad, ciudad, modalidad y disponibilidad real.", icon: "magnifying-glass" },
      { title: "Agenda", text: "Elige día y hora en el calendario. Ves la tarifa presencial o virtual antes de confirmar.", icon: "regular:calendar-check" },
      { title: "Confirma y asiste", text: "El profesional confirma tu cita y te recordamos 24 h y 1 h antes. Paga en línea o en el consultorio.", icon: "regular:bell" },
    ] as IconText[],
    promises: [
      { title: "Privacidad por defecto", text: "No pedimos historia clínica ni compartimos tu número con terceros.", icon: "lock" },
      { title: "Tarifas claras", text: "Precio presencial y virtual visibles antes de reservar, sin cargos ocultos.", icon: "tag" },
      { title: "Pagos registrados", text: "Cada pago queda registrado en buscaDR con su comprobante.", icon: "receipt" },
      { title: "Opiniones verificadas", text: "Solo opina quien completó una cita dentro de buscaDR.", icon: "star" },
    ] as IconText[],
    proEyebrow: "Para profesionales y clínicas",
    proTitle: "Tu agenda, tus pacientes y tus cobros en un solo lugar",
    proText: "Calendario de citas, confirmación desde WhatsApp, consultas virtuales con tarifa propia, cobros en línea registrados y métricas de tu consultorio.",
    whatsappEyebrow: "WhatsApp",
    whatsappTitle: "Confirma citas desde WhatsApp",
    whatsappText: "Con tu autorización, te avisamos de cada solicitud con botones para confirmar o rechazar. Tus pacientes reciben la confirmación y los recordatorios.",
    virtualEyebrow: "Telemedicina",
    virtualTitle: "Consultas virtuales con videollamada",
    virtualText: "Sin instalar nada: el enlace seguro se activa 15 minutos antes de tu cita.",
  },
  seo: {
    title: "buscaDR · Encuentra médicos y especialistas en Ecuador y agenda tu cita",
    description:
      "Busca médicos, especialistas y clínicas en Guayaquil, Samborondón, Quito y Cuenca. Compara tarifas presenciales y virtuales, revisa opiniones verificadas y agenda tu cita en línea.",
  },
};

const txt = (s: unknown, n = 250) =>
  String(s ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, n);

export const validAsset = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= 320 &&
  !value.includes("..") &&
  (/^\/(?:assets\/|api\/media\/)[a-zA-Z0-9_./-]+$/.test(value) || /^https:\/\/[a-zA-Z0-9.-]+\/[a-zA-Z0-9_/?&=%.-]+$/.test(value));

const image = (candidate: unknown, fallback: string) => (validAsset(candidate) ? candidate : fallback);
const color = (candidate: unknown, fallback: string) => {
  const value = String(candidate ?? "");
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : fallback;
};
const nrange = (x: unknown, lo: number, hi: number, fallback: number) =>
  Number.isInteger(Number(x)) && x !== null && x !== "" ? Math.min(hi, Math.max(lo, Number(x))) : fallback;
const pick = <T extends string>(x: unknown, options: readonly T[], fallback: T): T => (options.includes(x as T) ? (x as T) : fallback);
const route = (x: unknown) => pick(x, ROUTES, "buscar");
const bool = (x: unknown, fallback: boolean) => (typeof x === "boolean" ? x : fallback);

/** Íconos de la librería completa elegidos en el CMS: nombre válido, tamaño acotado y trazado SVG solo con comandos y números. */
function normalizeIconLibrary(input: unknown): Record<string, [number, number, string]> {
  const out: Record<string, [number, number, string]> = {};
  if (!input || typeof input !== "object") return out;
  for (const [name, raw] of Object.entries(input as Record<string, unknown>).slice(0, 150)) {
    if (!ICON_NAME.test(name) || !Array.isArray(raw)) continue;
    const [w, h, d] = raw;
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 1024 || h > 1024) continue;
    if (typeof d !== "string" || d.length > 12_000 || !SVG_PATH.test(d)) continue;
    out[name] = [w, h, d];
  }
  return out;
}

/** Biblioteca de fuentes: Google Fonts (por nombre o alojada) o archivos subidos al CMS. Sin CSS libre. */
function normalizeFonts(list: unknown): FontDef[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>(BUILTIN_FONTS);
  const out: FontDef[] = [];
  for (const raw of list.slice(0, 12)) {
    const family = txt(raw?.family, 40).replace(/\s+/g, " ");
    if (!FONT_FAMILY.test(family) || seen.has(family)) continue;
    const files = (Array.isArray(raw?.files) ? raw.files : [])
      .slice(0, 8)
      .filter((f: any) => FONT_URL.test(String(f?.url)))
      .map((f: any) => ({
        url: String(f.url),
        weight: nrange(f.weight, 100, 900, 400),
        style: f.style === "italic" ? ("italic" as const) : ("normal" as const),
      }));
    if (raw?.source === "google") {
      out.push({ family, source: "google", weights: FONT_WEIGHTS.test(String(raw.weights)) ? String(raw.weights) : "", files });
    } else if (raw?.source === "upload" && files.length) {
      out.push({ family, source: "upload", weights: "", files });
    } else continue;
    seen.add(family);
  }
  return out;
}

/** Validación por lista blanca; rechaza cargas gigantes y sanea texto, URL y números. */
export function normalizeCms(input: any) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Configuración inválida");
  if (JSON.stringify(input).length > 400_000) throw new Error("Configuración demasiado grande");
  const d = DEFAULT_CMS;
  const t = input.theme ?? {};
  const h = input.hero ?? {};
  const l = input.layout ?? {};
  const c = input.copy ?? {};
  const b = input.buttons ?? {};
  const nav = input.navigation ?? {};
  const fonts = normalizeFonts(t.fonts);
  const iconLibrary = normalizeIconLibrary(t.iconLibrary);
  /** Ícono del catálogo curado, de la librería elegida en el CMS o imagen subida. */
  const iconValue = (x: unknown, fallback: string) => (isIconName(x) || (typeof x === "string" && x in iconLibrary) || validAsset(x) ? (x as string) : fallback);
  const families = new Set<string>([...BUILTIN_FONTS, ...fonts.map((f) => f.family)]);
  const theme = {
    primary: color(t.primary, d.theme.primary),
    secondary: color(t.secondary, d.theme.secondary),
    accent: color(t.accent, d.theme.accent),
    soft: color(t.soft, d.theme.soft),
    sky: color(t.sky, d.theme.sky),
    neutral: color(t.neutral, d.theme.neutral),
    background: color(t.background, d.theme.background),
    surface: color(t.surface, d.theme.surface),
    text: color(t.text, d.theme.text),
    radius: nrange(t.radius, 8, 36, d.theme.radius),
    font: families.has(t.font) ? String(t.font) : "Manrope",
    bodyFont: families.has(t.bodyFont) ? String(t.bodyFont) : "Inter",
    fonts,
    iconLibrary,
    logo: image(t.logo, d.theme.logo),
    logoDark: image(t.logoDark, d.theme.logoDark),
    favicon: image(t.favicon, d.theme.favicon),
  };
  const hero = {
    eyebrow: txt(h.eyebrow ?? d.hero.eyebrow, 90),
    title: txt(h.title ?? d.hero.title, 110),
    highlight: txt(h.highlight ?? d.hero.highlight, 130),
    description: txt(h.description ?? d.hero.description, 450),
    image: image(h.image, d.hero.image),
    imageAlt: txt(h.imageAlt ?? d.hero.imageAlt, 140),
    cta: txt(h.cta ?? d.hero.cta, 60),
    secondaryCta: txt(h.secondaryCta ?? d.hero.secondaryCta, 60),
    badgeTitle: txt(h.badgeTitle ?? d.hero.badgeTitle, 50),
    badgeText: txt(h.badgeText ?? d.hero.badgeText, 90),
  };
  const copy = Object.fromEntries((Object.keys(d.copy) as (keyof typeof d.copy)[]).map((k) => [k, txt(c[k] ?? d.copy[k], 350)])) as typeof d.copy;
  // El aviso de emergencias no puede quedar vacío (Documento Maestro §11).
  if (!copy.emergencyNotice) copy.emergencyNotice = d.copy.emergencyNotice;
  const layout = {
    homeSpecialtyCount: nrange(l.homeSpecialtyCount, 1, 16, d.layout.homeSpecialtyCount),
    homeDoctorCount: nrange(l.homeDoctorCount, 1, 24, d.layout.homeDoctorCount),
    searchCount: nrange(l.searchCount, 1, 60, d.layout.searchCount),
    columns: nrange(l.columns, 1, 4, d.layout.columns),
    cardStyle: pick(l.cardStyle, ["compact", "spacious"] as const, "spacious"),
    showRatings: bool(l.showRatings, d.layout.showRatings),
    showBadges: bool(l.showBadges, d.layout.showBadges),
    showPrices: bool(l.showPrices, d.layout.showPrices),
    showMap: bool(l.showMap, d.layout.showMap),
    showBanners: bool(l.showBanners, d.layout.showBanners),
    showUpcoming: bool(l.showUpcoming, d.layout.showUpcoming),
    showSteps: bool(l.showSteps, d.layout.showSteps),
    showPromises: bool(l.showPromises, d.layout.showPromises),
    showWhatsapp: bool(l.showWhatsapp, d.layout.showWhatsapp),
    showPlans: bool(l.showPlans, d.layout.showPlans),
  };
  const specSlugs = new Set(SPECIALTIES.map((x) => x.slug));
  const banners: Banner[] = Array.isArray(input.banners)
    ? input.banners.slice(0, 12).map((it: any, i: number) => ({
        id: txt(it?.id || `banner-${i}`, 50).replace(/[^a-zA-Z0-9_-]/g, "") || `banner-${i}`,
        title: txt(it?.title, 130),
        subtitle: txt(it?.subtitle, 260),
        image: image(it?.image, ""),
        button: txt(it?.button, 55),
        route: route(it?.route),
        specialty: specSlugs.has(String(it?.specialty)) ? String(it.specialty) : "",
        visible: !!it?.visible,
      }))
    : d.banners;
  const incoming: any[] = Array.isArray(input.specialties) ? input.specialties : [];
  const specialties = d.specialties
    .map((base) => {
      const edit = incoming.find((x) => x?.slug === base.slug) ?? {};
      return {
        slug: base.slug,
        name: txt(edit.name ?? base.name, 55),
        icon: iconValue(edit.icon, base.icon),
        tone: pick(edit.tone, TONES, base.tone),
        visible: bool(edit.visible, base.visible),
        order: nrange(edit.order, 0, 99, base.order),
      };
    })
    .sort((x, y) => x.order - y.order);
  const buttons = {
    primary: txt(b.primary ?? d.buttons.primary, 75),
    book: txt(b.book ?? d.buttons.book, 75),
    explore: txt(b.explore ?? d.buttons.explore, 75),
    pro: txt(b.pro ?? d.buttons.pro, 75),
    shape: pick(b.shape, ["rounded", "pill", "square"] as const, "pill"),
  };
  const navKeys = Object.keys(DEFAULT_NAV_ICONS) as NavKey[];
  const navigation = {
    ...(Object.fromEntries(navKeys.map((k) => [k, txt(nav[k] ?? d.navigation[k], 55)])) as Record<NavKey, string>),
    icons: Object.fromEntries(navKeys.map((k) => [k, iconValue(nav.icons?.[k], DEFAULT_NAV_ICONS[k])])) as Record<NavKey, string>,
  };
  const practitioners: Record<string, { photo: string; headline: string; featured: boolean }> = {};
  if (input.practitioners && typeof input.practitioners === "object") {
    for (const [id, p] of Object.entries<any>(input.practitioners).slice(0, 300)) {
      if (!/^\d+$/.test(id) || !p || typeof p !== "object") continue;
      practitioners[id] = { photo: image(p.photo, ""), headline: txt(p.headline, 100), featured: !!p.featured };
    }
  }
  const hm = input.home ?? {};
  const pairs = (list: unknown, base: IconText[]) =>
    base.map((item, i) => {
      const edit = Array.isArray(list) ? (list[i] ?? {}) : {};
      return { title: txt(edit.title ?? item.title, 60), text: txt(edit.text ?? item.text, 180), icon: iconValue(edit.icon, item.icon) };
    });
  const one = (k: keyof typeof d.home, n: number) => txt(hm[k] ?? d.home[k], n);
  const home = {
    greetingSubtitle: one("greetingSubtitle", 80),
    searchPlaceholder: one("searchPlaceholder", 80),
    suggestions: ((Array.isArray(hm.suggestions) ? hm.suggestions : d.home.suggestions) as unknown[])
      .slice(0, 8)
      .map((x) => txt(x, 40))
      .filter(Boolean),
    features: pairs(hm.features, d.home.features),
    stepsTitle: one("stepsTitle", 60),
    steps: pairs(hm.steps, d.home.steps),
    promises: pairs(hm.promises, d.home.promises),
    proEyebrow: one("proEyebrow", 40),
    proTitle: one("proTitle", 100),
    proText: one("proText", 260),
    whatsappEyebrow: one("whatsappEyebrow", 40),
    whatsappTitle: one("whatsappTitle", 100),
    whatsappText: one("whatsappText", 260),
    virtualEyebrow: one("virtualEyebrow", 40),
    virtualTitle: one("virtualTitle", 100),
    virtualText: one("virtualText", 260),
  };
  const seo = {
    title: txt(input.seo?.title ?? d.seo.title, 90) || d.seo.title,
    description: txt(input.seo?.description ?? d.seo.description, 200) || d.seo.description,
  };
  return {
    theme,
    hero,
    banners,
    copy,
    layout,
    specialties,
    buttons,
    navigation,
    practitioners,
    // «Perfil de muestra» siempre visible y moderación activa: no se pueden desactivar desde el CMS.
    trust: { moderateReviews: true, showDemoBadges: true },
    home,
    seo,
  };
}

export const readConfig = (row: string | null | undefined) => {
  try {
    return normalizeCms(row ? JSON.parse(row) : structuredClone(DEFAULT_CMS));
  } catch {
    return normalizeCms(structuredClone(DEFAULT_CMS));
  }
};
