/** Utilidades del editor del CMS Maestro: rutas de campos, pestañas y validaciones de contenido. */
import { contrast } from "../../lib/theme";
import type { Cms } from "../../lib/types";

export type TabId =
  | "resumen"
  | "marca"
  | "portada"
  | "banners"
  | "textos"
  | "componentes"
  | "especialidades"
  | "profesionales"
  | "biblioteca"
  | "seo"
  | "permisos"
  | "pagos"
  | "resenas"
  | "historial"
  | "acceso";

export const TABS: { id: TabId; label: string; icon: string; group: "Contenido" | "Operación" }[] = [
  { id: "resumen", label: "Resumen", icon: "home", group: "Contenido" },
  { id: "marca", label: "Marca, fuentes e íconos", icon: "palette", group: "Contenido" },
  { id: "portada", label: "Portada", icon: "home", group: "Contenido" },
  { id: "banners", label: "Banners", icon: "list", group: "Contenido" },
  { id: "textos", label: "Textos y botones", icon: "font", group: "Contenido" },
  { id: "componentes", label: "Componentes", icon: "chart", group: "Contenido" },
  { id: "especialidades", label: "Especialidades y categorías", icon: "stethoscope", group: "Contenido" },
  { id: "profesionales", label: "Profesionales", icon: "user-doctor", group: "Contenido" },
  { id: "biblioteca", label: "Biblioteca de medios", icon: "regular:images", group: "Contenido" },
  { id: "seo", label: "SEO y redes", icon: "search", group: "Contenido" },
  { id: "permisos", label: "Permisos", icon: "shield", group: "Operación" },
  { id: "pagos", label: "Pasarelas de pago", icon: "card", group: "Operación" },
  { id: "resenas", label: "Opiniones", icon: "star", group: "Operación" },
  { id: "historial", label: "Publicaciones", icon: "repeat", group: "Operación" },
  { id: "acceso", label: "Acceso y contraseña", icon: "lock", group: "Operación" },
];

/** Pestaña que contiene un campo, a partir del `data-cms` del sitio (p. ej. «hero.title»). */
export function tabForPath(path: string): TabId {
  const [root] = path.split(".");
  if (path === "buttons.shape" || root === "theme") return "marca";
  if (root === "hero" || root === "home") return "portada";
  if (root === "banners") return "banners";
  if (root === "copy" || root === "navigation" || root === "buttons") return "textos";
  if (root === "layout") return "componentes";
  if (root === "specialties" || root === "categories") return "especialidades";
  if (root === "practitioners") return "profesionales";
  if (root === "seo") return "seo";
  return "resumen";
}

export const fieldId = (path: string) => `cms-field-${path.replace(/[^a-zA-Z0-9]+/g, "-")}`;

export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<any>((v, k) => (v == null ? undefined : v[k]), obj);
}

/** Copia inmutable con un valor cambiado (los índices numéricos de arrays se respetan). */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split(".");
  const base: any = Array.isArray(obj) ? [...obj] : { ...(obj as object) };
  base[head] = rest.length ? setPath(base[head] ?? (/^\d+$/.test(rest[0]) ? [] : {}), rest.join("."), value) : value;
  return base;
}

/** Afirmaciones que docs/MARKETING_CLAIMS.md prohíbe en piezas públicas (salud: nada de promesas clínicas ni urgencias). */
const CLAIMS =
  /(garantizad[oa]s?|garant[ií]a total|100 ?%|24\/7|cura(?:mos|r)? |sin riesgo|el mejor m[eé]dico|los mejores m[eé]dicos|diagn[oó]stico (?:en l[ií]nea|inmediato)|atendemos emergencias|urgencias las 24|resultados asegurados|app store|google play|desc[aá]rgala|miles de (?:m[eé]dicos|doctores|especialistas))/i;

export type Warning = { path: string; text: string };

function walkStrings(value: unknown, path: string, out: Warning[]) {
  if (typeof value === "string") {
    const m = value.match(CLAIMS);
    if (m) out.push({ path, text: `«${m[0]}» no está permitido en el piloto (docs/MARKETING_CLAIMS.md).` });
  } else if (Array.isArray(value)) {
    for (const [i, v] of value.entries()) walkStrings(v, `${path}.${i}`, out);
  } else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walkStrings(v, path ? `${path}.${k}` : k, out);
}

/** Avisos de cumplimiento y accesibilidad (no bloquean, pero se muestran antes de publicar). */
export function contentWarnings(cms: Cms): Warning[] {
  const out: Warning[] = [];
  const { practitioners: _p, specialties: _s, theme: _t, trust: _tr, ...texts } = cms;
  walkStrings(texts, "", out);
  for (const sp of cms.specialties) walkStrings(sp.name, `specialties.${sp.slug}`, out);
  for (const [slug, p] of Object.entries(cms.practitioners)) walkStrings(p.headline, `practitioners.${slug}`, out);
  const t = cms.theme;
  const checks: [string, string, string, string][] = [
    ["theme.primary", t.primary, t.surface, "Azul Confianza (enlaces y precios) sobre tarjetas"],
    ["theme.primary", "#FFFFFF", t.primary, "Texto blanco sobre el azul (botones principales)"],
    ["theme.text", t.text, t.background, "Texto sobre el fondo general"],
    ["theme.text", t.text, t.surface, "Texto sobre tarjetas"],
    ["theme.secondary", t.text, t.secondary, "Texto oscuro sobre el Verde Salud (insignias y acentos)"],
    ["theme.neutral", t.neutral, t.surface, "Gris de textos secundarios sobre tarjetas"],
  ];
  for (const [path, fg, bg, label] of checks) {
    const ratio = contrast(fg, bg);
    if (ratio < 4.5) out.push({ path, text: `${label}: contraste ${ratio.toFixed(1)}:1, por debajo de 4,5:1 (WCAG AA).` });
  }
  return out;
}

export const ROUTE_LABELS: Record<string, string> = {
  inicio: "Inicio",
  buscar: "Buscar (con especialidad opcional)",
  especialidades: "Especialidades",
  citas: "Mis citas",
  panel: "Panel del profesional",
  planes: "Planes",
  "para-profesionales": "Para profesionales",
  "como-funciona": "Cómo funciona",
  cuenta: "Cuenta",
};

/** Imágenes de marca incluidas en el sitio (Brand Deck), disponibles sin subir nada. */
export const BRAND_ASSETS = [
  "/assets/buscadr-logo.png",
  "/assets/buscadr-logo-blanco.png",
  "/assets/buscadr-isotipo.png",
  "/assets/hero-doctor.webp",
  "/assets/concept-ui.webp",
  "/assets/fotos/clinica.webp",
  "/assets/fotos/paciente.webp",
  "/assets/fotos/profesional.webp",
  "/assets/fotos/consulta.webp",
  ...[
    "ana-torres",
    "carlos-mendez",
    "valeria-ruiz",
    "andres-salazar",
    "andres-morales",
    "isabel-vega",
    "gabriela-leon",
    "fernando-soto",
    "daniel-rivas",
    "paula-mora",
  ].map((n) => `/assets/medicos/${n}.webp`),
];
