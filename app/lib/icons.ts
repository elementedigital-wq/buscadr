/** Catálogo de iconos compartido por la web, el CMS y la validación del servidor. */
import { ICON_DATA, ICON_GROUPS } from "./icon-data";

export { ICON_DATA, ICON_GROUPS };
export const ICON_NAMES = Object.keys(ICON_DATA);
export const isIconName = (name: unknown): name is string => typeof name === "string" && Object.hasOwn(ICON_DATA, name);

/** Etiqueta legible para buscar en el selector: «regular:calendar-days» → «calendar days (contorno)». */
export function iconLabel(name: string) {
  const [style, base] = name.includes(":") ? name.split(":") : ["", name];
  const suffix = style === "regular" ? " (contorno)" : style === "brands" ? " (marca)" : "";
  return `${base.replace(/-/g, " ")}${suffix}`;
}
