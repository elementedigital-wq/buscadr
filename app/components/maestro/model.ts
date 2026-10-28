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
  | "categorias"
  | "anuncios"
  | "biblioteca"
  | "seo"
  | "permisos"
  | "resenas"
  | "historial"
  | "acceso";

export const TABS: { id: TabId; label: string; icon: string; group: "Contenido" | "Operación" }[] = [
  { id: "resumen", label: "Resumen", icon: "home", group: "Contenido" },
  { id: "marca", label: "Marca y estilo", icon: "star", group: "Contenido" },
  { id: "portada", label: "Portada", icon: "home", group: "Contenido" },
  { id: "banners", label: "Banners", icon: "list", group: "Contenido" },
  { id: "textos", label: "Textos y menú", icon: "quote", group: "Contenido" },
  { id: "componentes", label: "Componentes", icon: "chart", group: "Contenido" },
  { id: "categorias", label: "Categorías", icon: "list", group: "Contenido" },
  { id: "anuncios", label: "Anuncios", icon: "tag", group: "Contenido" },
  { id: "biblioteca", label: "Biblioteca de medios", icon: "regular:images", group: "Contenido" },
  { id: "seo", label: "SEO y redes", icon: "search", group: "Contenido" },
  { id: "permisos", label: "Permisos", icon: "shield", group: "Operación" },
  { id: "resenas", label: "Reseñas", icon: "star", group: "Operación" },
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
  if (root === "categories") return "categorias";
  if (root === "listings") return "anuncios";
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

/** Afirmaciones que docs/MARKETING_CLAIMS.md prohíbe en piezas públicas del piloto (Documento Maestro §03). */
const CLAIMS =
  /(verificad[oa]s?|certificad[oa]s?|garantizad[oa]s?|garant[ií]a total|asegurad[oa]s?|100 ?%|24\/7|siempre estamos|pagos? (?:seguros?|protegidos?)|en minutos|al instante|disponible al instante|tiempo real|app store|google play|desc[aá]rgala|miles de (?:herramientas|equipos)|sin riesgo)/i;

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
  const { listings: _l, categories: _c, theme: _t, trust: _tr, ...texts } = cms;
  walkStrings(texts, "", out);
  for (const c of cms.categories) walkStrings(c.name, `categories.${c.slug}`, out);
  for (const [id, p] of Object.entries(cms.listings)) walkStrings(p.headline, `listings.${id}`, out);
  const t = cms.theme;
  const checks: [string, string, string, string][] = [
    ["theme.primary", t.primary, t.surface, "Morado (enlaces y precios) sobre tarjetas"],
    ["theme.primary", "#FFFFFF", t.primary, "Texto blanco sobre el morado (botones principales)"],
    ["theme.text", t.text, t.background, "Texto sobre el fondo general"],
    ["theme.text", t.text, t.surface, "Texto sobre tarjetas"],
    ["theme.secondary", t.text, t.secondary, "Texto sobre el turquesa (botones secundarios)"],
    ["theme.neutral", t.neutral === "#6D6E71" ? "#5E5F63" : t.neutral, t.surface, "Gris de textos secundarios sobre tarjetas"],
  ];
  for (const [path, fg, bg, label] of checks) {
    const ratio = contrast(fg, bg);
    if (ratio < 4.5) out.push({ path, text: `${label}: contraste ${ratio.toFixed(1)}:1, por debajo de 4,5:1 (WCAG AA).` });
  }
  return out;
}

export const ROUTE_LABELS: Record<string, string> = {
  inicio: "Inicio",
  explorar: "Explorar (con categoría opcional)",
  publicar: "Publicar un equipo",
  reservas: "Reservas",
  cuenta: "Cuenta",
  "como-funciona": "Cómo funciona",
};

/** Imágenes de marca incluidas en el sitio (Brand Deck), disponibles sin subir nada. */
export const BRAND_ASSETS = [
  "/assets/buscadr-logo.png",
  "/assets/buscadr-logo-blanco.png",
  "/assets/buscadr-isotipo.png",
  "/assets/fotos/hero.webp",
  "/assets/fotos/propietario.webp",
  "/assets/fotos/carpintero.webp",
  "/assets/fotos/constructor.webp",
  "/assets/fotos/proyecto.webp",
  "/assets/fotos/comunidad.webp",
  "/assets/fotos/jardin.webp",
  "/assets/fotos/taladro.webp",
  "/assets/fotos/hidrolavadora.webp",
  "/assets/fotos/energia.webp",
  "/assets/fotos/generador.webp",
  "/assets/fotos/sonido.webp",
  "/assets/fotos/proyector.webp",
  "/assets/fotos/camara.webp",
  "/assets/fotos/laptop.webp",
  "/assets/fotos/cortasetos.webp",
  "/assets/fotos/automotriz.webp",
  "/assets/fotos/caja-herramientas.webp",
  "/assets/fotos/lavadora.webp",
  "/assets/iconos/taladro.webp",
  "/assets/iconos/sierra.webp",
  "/assets/iconos/escalera.webp",
  "/assets/iconos/pintura.webp",
  "/assets/iconos/construccion.webp",
  "/assets/iconos/hogar.webp",
  "/assets/iconos/jardin.webp",
  "/assets/iconos/eventos.webp",
  "/assets/iconos/audio.webp",
  "/assets/iconos/tecnologia.webp",
  "/assets/iconos/energia.webp",
  "/assets/iconos/limpieza.webp",
  "/assets/iconos/automotriz.webp",
  "/assets/iconos/plomeria.svg",
  "/assets/iconos/ubicacion.webp",
  "/assets/iconos/reserva.webp",
];
