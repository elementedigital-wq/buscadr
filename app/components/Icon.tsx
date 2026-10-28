/**
 * Iconografía buscaDR sobre Font Awesome Free 7 (CC BY 4.0). Cualquier ícono del catálogo curado
 * (`app/lib/icon-data.ts`) se usa por su nombre: «stethoscope», «regular:heart», «brands:whatsapp».
 * Los íconos de la librería completa que el propietario elige en el CMS llegan con su trazado en
 * `theme.iconLibrary` y se dibujan igual, sin cargar la librería. Los nombres cortos de la interfaz
 * («search», «pin»…) son alias.
 */
import { createContext, useContext } from "react";
import { ICON_DATA, isIconName } from "../lib/icons";

export { isIconName };

/** Íconos extra elegidos en el CMS (nombre → [ancho, alto, trazado]). Lo provee app/root.tsx. */
export const IconLibraryContext = createContext<Record<string, [number, number, string]>>({});

/** Alias de la interfaz → ícono del catálogo. */
export const ICON_ALIASES: Record<string, string> = {
  search: "magnifying-glass",
  pin: "location-dot",
  calendar: "regular:calendar",
  "calendar-check": "regular:calendar-check",
  "calendar-plus": "calendar-plus",
  home: "house",
  list: "list",
  chat: "regular:comment",
  user: "regular:user",
  users: "users",
  heart: "regular:heart",
  "heart-solid": "heart",
  plus: "plus",
  check: "check",
  "check-circle": "circle-check",
  arrow: "arrow-right",
  back: "arrow-left",
  shield: "shield-halved",
  verified: "circle-check",
  star: "star",
  whatsapp: "brands:whatsapp",
  google: "brands:google",
  alert: "triangle-exclamation",
  map: "regular:map",
  locate: "location-crosshairs",
  logout: "right-from-bracket",
  repeat: "arrows-rotate",
  chart: "chart-column",
  x: "xmark",
  info: "circle-info",
  clock: "regular:clock",
  filter: "sliders",
  grid: "table-cells-large",
  tag: "tag",
  share: "share-nodes",
  minus: "minus",
  edit: "pen-to-square",
  eye: "regular:eye",
  pause: "pause",
  play: "play",
  trash: "regular:trash-can",
  flag: "regular:flag",
  money: "money-bill-wave",
  bell: "regular:bell",
  phone: "phone",
  wallet: "wallet",
  card: "regular:credit-card",
  receipt: "receipt",
  photo: "regular:image",
  chevron: "chevron-right",
  "chevron-left": "chevron-left",
  "chevron-down": "chevron-down",
  more: "ellipsis",
  settings: "gear",
  video: "video",
  doctor: "user-doctor",
  stethoscope: "stethoscope",
  hospital: "hospital",
  clinic: "house-medical",
  lock: "lock",
  download: "download",
  upload: "upload",
  mail: "regular:envelope",
  link: "link",
  copy: "regular:copy",
  sparkles: "wand-magic-sparkles",
  agenda: "calendar-week",
  sun: "sun",
  moon: "moon",
  menu: "bars",
  globe: "globe",
};

/** Nombre canónico del catálogo, o `null` si no existe. */
export function resolveIcon(name: string | null | undefined, library: Record<string, unknown> = {}): string | null {
  if (!name) return null;
  if (isIconName(name) || Object.hasOwn(library, name)) return name;
  const key = ICON_ALIASES[name];
  return key && isIconName(key) ? key : null;
}

function Svg({ data, className, label }: { data: [number, number, string]; className: string; label?: string }) {
  const [w, h, d] = data;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      fill="currentColor"
      className={`shrink-0 ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

export function Icon({ name, className = "size-5", label }: { name: string; className?: string; label?: string }) {
  const library = useContext(IconLibraryContext);
  const key = resolveIcon(name, library) ?? "circle-info";
  return <Svg data={ICON_DATA[key] ?? library[key]} className={className} label={label} />;
}

/**
 * Ícono editable desde el CMS: nombre del catálogo o de la librería (glifo) o ruta de imagen subida
 * (/api/media/…, /assets/…).
 */
export function CmsIcon({ value, className = "size-6", fallback = "stethoscope" }: { value: string | null | undefined; className?: string; fallback?: string }) {
  if (value && /^(\/|https:)/.test(value)) return <img src={value} alt="" className={`${className} object-contain`} loading="lazy" />;
  return <Icon name={value || fallback} className={className} />;
}

/** Isotipo oficial (archivo original, sin redibujar). */
export function Isotipo({ className = "size-8" }: { className?: string }) {
  return <img src="/assets/buscadr-isotipo.png" alt="" className={className} width={32} height={37} />;
}
