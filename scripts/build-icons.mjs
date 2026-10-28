/**
 * Genera app/lib/icon-data.ts (rutas SVG de Font Awesome Free) a partir de scripts/icon-list.mjs.
 * Uso: node scripts/build-icons.mjs. Licencia de los iconos: CC BY 4.0 (fontawesome.com/license/free).
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { GROUPS } from "./icon-list.mjs";

const require = createRequire(import.meta.url);
const packs = {
  solid: require("@fortawesome/free-solid-svg-icons"),
  regular: require("@fortawesome/free-regular-svg-icons"),
  brands: require("@fortawesome/free-brands-svg-icons"),
};
const index = Object.fromEntries(
  Object.entries(packs).map(([style, mod]) => [style, new Map(Object.values(mod).filter((v) => v?.iconName && v.icon).map((v) => [v.iconName, v.icon]))]),
);

const data = {};
const groups = {};
for (const [group, names] of Object.entries(GROUPS)) {
  groups[group] = [];
  for (const key of names) {
    const [style, name] = key.includes(":") ? key.split(":") : ["solid", key];
    const icon = index[style]?.get(name);
    if (!icon) throw new Error(`Icono inexistente: ${key}`);
    const [w, h, , , path] = icon;
    data[key] = [w, h, Array.isArray(path) ? path.join(" ") : path];
    groups[group].push(key);
  }
}
const out = `/* Generado por scripts/build-icons.mjs — no editar a mano.
 * Font Awesome Free 7.3.1 by @fontawesome - https://fontawesome.com
 * Iconos: CC BY 4.0 (https://fontawesome.com/license/free). */
export const ICON_DATA: Record<string, [number, number, string]> = ${JSON.stringify(data)};
export const ICON_GROUPS: Record<string, string[]> = ${JSON.stringify(groups)};
`;
writeFileSync(new URL("../app/lib/icon-data.ts", import.meta.url), out);
console.log(`${Object.keys(data).length} iconos, ${(out.length / 1024).toFixed(0)} KB`);
