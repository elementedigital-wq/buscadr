# ADR 0001 — Un Worker con Hono + React Router SSR (mismo stack que YANK)

**Estado:** aceptada (26-oct-2026)

**Contexto.** La v0.3 era una SPA en JavaScript sin tipos (`app.js`, ~1 900 líneas) con datos en `localStorage` y varios `wrangler*.toml` en conflicto (Pages y Worker). Reservas, anuncios y mensajes no eran compartidos entre usuarios.

**Decisión.** Reescribir sobre el stack ya probado en YANK: un único Worker `buscadr` con API Hono (`/api/*`) y web React Router 8 con SSR, TypeScript estricto, Tailwind 4, Biome y Vitest en workerd. Se conservan nombre del Worker, binding y base D1.

**Consecuencias.** SEO real (SSR, landings, sitemap), un solo despliegue, pruebas con D1 real, y el mismo CMS que YANK. Se pierde el modo «solo navegador»: todo dato es compartido y persistente.
