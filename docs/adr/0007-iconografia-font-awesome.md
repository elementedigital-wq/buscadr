# ADR 0007 — Iconografía Font Awesome Free: catálogo curado + librería completa desde el CMS

**Estado:** aceptada (28-oct-2026)

**Contexto.** Se pidió una iconografía «como Font Awesome», 100 % funcional en el front end y editable desde el back end.

**Decisión.**
- Catálogo curado (≈290 íconos médicos, de agenda, pagos e interfaz; sólidos, de contorno y marcas) generado por `scripts/build-icons.mjs` desde `scripts/icon-list.mjs` en `app/lib/icon-data.ts` (solo trazados SVG). Es lo único que se envía al navegador.
- El CMS también busca en la **librería completa** de Font Awesome Free (más de 2.000 íconos) desde el servidor (`GET /api/cms/icons`, términos en español: «pediatría», «corazón», «cita»…). Al elegir uno fuera del catálogo se guarda su trazado en `theme.iconLibrary` (validado: nombre, tamaño y trazado solo con comandos SVG) y el componente `Icon` lo dibuja en todo el sitio mediante `IconLibraryContext`.
- También se admite una imagen subida como ícono propio de la marca. Recuadros de ícono con tonos derivados de la paleta (`tone-*`).

**Consecuencias.** El sitio no carga la librería completa (≈2 MB): solo el catálogo y los íconos elegidos. Licencia CC BY 4.0 / MIT (`docs/CREDITOS.md`).
