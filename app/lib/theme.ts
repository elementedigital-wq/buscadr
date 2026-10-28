/** Traduce el tema del CMS a variables CSS del front end (tokens de app/app.css). */
import type { Cms } from "./types";

const FONT_STACK: Record<string, string> = {
  Manrope: '"Manrope Variable", "Manrope", ui-sans-serif, system-ui, sans-serif',
  Inter: '"Inter Variable", "Inter", ui-sans-serif, system-ui, sans-serif',
};
/** Familias ya validadas por el servidor (letras, números y espacios). */
const stack = (family: string) => FONT_STACK[family] ?? `"${family.replace(/[^A-Za-z0-9 ]/g, "")}", ui-sans-serif, system-ui, sans-serif`;

type FontDef = Cms["theme"]["fonts"][number];
export const googleFontsHref = (f: Pick<FontDef, "family" | "weights">) =>
  `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family).replace(/%20/g, "+")}${f.weights ? `:wght@${f.weights}` : ""}&display=swap`;

/**
 * Recursos de las fuentes elegidas en el CMS: @font-face para archivos alojados en buscaDR (subidos o
 * importados de Google Fonts) y hoja de Google Fonts solo para familias de Google sin archivos propios.
 */
export function fontAssets(cms: Cms | null | undefined) {
  if (!cms) return { links: [] as string[], css: "" };
  const used = new Set([cms.theme.font, cms.theme.bodyFont]);
  const defs = cms.theme.fonts.filter((f) => used.has(f.family));
  const links = defs.filter((f) => f.source === "google" && !f.files.length).map(googleFontsHref);
  const fmt = (url: string) => ({ woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" })[url.split(".").pop() ?? ""] ?? "woff2";
  const css = defs
    .filter((f) => f.files.length)
    .flatMap((f) =>
      f.files.map(
        (file) =>
          `@font-face{font-family:"${f.family.replace(/[^A-Za-z0-9 ]/g, "")}";src:url("${file.url.replace(/[^a-zA-Z0-9/._-]/g, "")}") format("${fmt(file.url)}");font-weight:${f.source === "google" && f.files.length === 1 ? "100 900" : Number(file.weight) || 400};font-style:${file.style === "italic" ? "italic" : "normal"};font-display:swap}`,
      ),
    )
    .join("");
  return { links, css };
}

const BUTTON_RADIUS: Record<string, string> = { pill: "9999px", rounded: "0.875rem", square: "0.375rem" };

export function themeStyle(cms: Cms | null | undefined): React.CSSProperties | undefined {
  if (!cms) return undefined;
  const t = cms.theme;
  return {
    "--color-azul": t.primary,
    "--color-verde": t.secondary,
    "--color-cielo": t.accent,
    "--color-menta": t.soft,
    "--color-celeste": t.sky,
    "--color-gris": t.neutral,
    "--color-fondo": t.background,
    "--color-tinta": t.text,
    "--brand-primary": t.primary,
    "--brand-secondary": t.secondary,
    "--brand-surface": t.surface,
    "--radius-card": `${t.radius}px`,
    "--btn-radius": BUTTON_RADIUS[cms.buttons.shape] ?? BUTTON_RADIUS.pill,
    "--font-display": stack(t.font),
    "--font-sans": stack(t.bodyFont),
  } as React.CSSProperties;
}

/** Contraste WCAG 2.2 entre dos colores #RRGGBB (1 a 21). */
export function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
