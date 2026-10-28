# ADR 0001 — Un Worker con API Hono y web React Router 8 (SSR)

**Estado:** aceptada (28-oct-2026). Reemplaza la demo estática (HTML/JS + API Node con SQLite) y el borrador de arquitectura con PostgreSQL/PostGIS.

**Contexto.** buscaDR necesitaba pasar de una demo sin persistencia real a un producto que guarde cuentas, citas y pagos, con SEO para el directorio médico, coste bajo y un solo despliegue. El equipo ya opera Workers + D1 en otros proyectos (Yank, Tull).

**Decisión.** Un único Cloudflare Worker `buscadr` (`workers/app.ts`): `/api/*` lo atiende Hono (`server/`) y el resto, React Router 8 con SSR (`app/`). Tailwind 4, TypeScript estricto, Zod para validar entradas, Vitest en `workerd` con D1 real y Biome. `wrangler.jsonc` despliega; `wrangler.app.jsonc` sirve para desarrollo con Vite (mismos bindings, comprobado por `scripts/check-wrangler.mjs`).

**Consecuencias.** Un deploy, sin servidores ni CORS; SSR para landings `/medicos/{ciudad}/{especialidad}` y perfiles. PostGIS deja de ser necesario: la cercanía se calcula en el Worker con coordenadas aproximadas. Si el volumen lo exige, D1 puede reemplazarse por Hyperdrive + Postgres sin cambiar la API.
