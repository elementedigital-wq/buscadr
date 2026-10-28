# ADR 0007 — Iconografía con Font Awesome Free, editable desde el CMS

**Estado:** aceptada (26-oct-2026)

**Contexto.** Los iconos de interfaz eran trazos SVG dibujados a mano y los de categoría, ilustraciones fijas. El propietario pidió una iconografía al estilo de una librería (Font Awesome), funcional en el front end y editable desde el CMS.

**Decisión.** Catálogo curado de Font Awesome Free 7 (sólidos, de contorno y marcas; CC BY 4.0 / MIT) generado por `scripts/build-icons.mjs` en `app/lib/icon-data.ts` (solo rutas SVG, ~52 KB comprimido). Un único componente `Icon` (con alias para los nombres históricos) y `CmsIcon` (icono del catálogo o imagen subida). El CMS guarda nombres validados en el servidor (`isIconName`) o rutas de imagen permitidas. Los recuadros de icono usan tonos derivados de la paleta de marca con `color-mix` (sin colores nuevos).

**Consecuencias.** Iconos coherentes, accesibles (`aria-hidden` o `aria-label`) y editables sin desarrollo. Ampliar el catálogo es una línea en `scripts/icon-list.mjs`. Las ilustraciones del Brand Deck siguen disponibles como imagen y como respaldo de foto.
