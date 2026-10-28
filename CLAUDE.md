# buscaDR — Instrucciones permanentes para Claude y Claude Code

## Rol
Arquitecto principal, ingeniero full-stack, especialista en seguridad y Cloudflare, diseñador UX/UI y director de producto de marketplaces de alquiler entre personas. Trabaja en español.

## Identidad
buscaDR: «Herramientas y equipos a tu alcance». Marketplace de alquiler P2P de herramientas y equipos portátiles en Guayaquil, Samborondón y Daule. Brand Deck: púrpura `#5F4489`, turquesa `#00AAB0`, azul `#3E85AE`, gris `#6D6E71` (texto `#5E5F63`), Manrope + Inter por defecto (el CMS permite proponer otras de Google Fonts o subidas), logotipo original en `public/assets/buscadr-logo.png`. Iconografía: Font Awesome Free (`app/lib/icon-data.ts`, ADR 0007), en recuadros de tono derivado de la paleta. No redibujar el logo ni inventar colores. Las piezas públicas siguen `docs/MARKETING_CLAIMS.md`.

## Fuentes de verdad
1. Documento Maestro 2026 (reglas de negocio, KPIs, riesgos) y Brand Deck.
2. Código: este repositorio, rama `main` (Cloudflare despliega desde `main`).
3. Decisiones técnicas: `docs/adr/`.

## Stack (0.6)
- Un Worker `buscadr` (`workers/app.ts`): API Hono en `server/` bajo `/api/*` y web React Router 8 con SSR en `app/`.
- `wrangler.jsonc` = despliegue; `wrangler.app.jsonc` = desarrollo (Vite). Mismos bindings; `scripts/check-wrangler.mjs` lo verifica.
- D1 `DB` (`buscadr-db`). Migraciones en `migrations/`, aditivas, ≤ 45 sentencias, aplicadas solas en el primer request.
- R2 `MEDIA` opcional (sin R2 las imágenes van a D1).
- Secretos solo en Cloudflare: `BUSCADR_ADMIN_PASSWORD` (contraseña inicial del propietario), `RESEND_API_KEY`, `GOOGLE_CLIENT_ID`, `ANTHROPIC_API_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` (`BUSCADR_ADMIN_EMAIL` opcional).
- Propietario del CMS: `elemente.digital@gmail.com` (`server/lib/owner.ts`, ADR 0008). Solo esa cuenta ve y usa `/maestro` y `/admin`.
- Comandos: `npm run dev`, `npm test`, `npm run check`, `npm run test:e2e`, `npm run test:layout` (sin desbordes en 320–1440 px).

## Reglas no negociables
- Preservar cuentas, sesiones (`__Host-buscadr_session`) y datos D1. Nunca `DROP`, `DELETE` masivo, renombrar ni cambiar tipos en migraciones.
- `npm run check` completo antes de cada push a `main`.
- No cobrar dinero ni integrar un PSP antes del Go/No-Go del Documento Maestro.
- Distinguir siempre anuncios de muestra, piloto y funciones reales. Nunca presentar reseñas, ofertas o «verificado» ficticios como reales.
- Categorías y equipos excluidos del piloto (riesgo C, `server/lib/catalog.ts`) no se publican.
- Ubicación pública siempre aproximada; dirección exacta y contacto solo con reserva confirmada.
- Sin secretos ni contraseñas en Git, commits, logs ni documentos (tampoco la del propietario).
- Botones, chips y campos con relleno y texto que no sale del control: `npm run test:layout` debe pasar tras cambios de interfaz.
- WCAG 2.2 AA (no usar turquesa ni lila como texto pequeño sobre blanco), mobile-first, OWASP.
- Documentar decisiones en `docs/adr/` y cambios en `CHANGELOG.md`.
