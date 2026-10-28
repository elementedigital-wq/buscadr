# Despliegue en Cloudflare Workers

Un solo Worker, **`buscadr`**, sirve la web (React Router con SSR) y la API (`/api/*`, Hono). Mismo nombre, mismo binding `DB` (`buscadr-db`) y misma URL que la v0.3: las cuentas y sesiones existentes siguen activas.

## Variables y secretos (Cloudflare → Workers & Pages → `buscadr` → Settings → Variables and Secrets → **Production**)

| Nombre | Tipo | Obligatorio | Uso |
|---|---|---|---|
| `DB` | Binding D1 → `buscadr-db` | Sí | Ya declarado en `wrangler.jsonc` |
| `BUSCADR_ADMIN_PASSWORD` | Secret | Sí (primer acceso al CMS) | Contraseña inicial del propietario (12+ caracteres). Al cambiarla desde el CMS se guarda como hash en D1 y el secreto deja de usarse |
| `BUSCADR_ADMIN_EMAIL` | Secret o variable | No | Solo si el propietario cambia de correo. Por defecto: `elemente.digital@gmail.com` |
| `RESEND_API_KEY` | Secret | No (recomendado) | Envío del enlace «¿Olvidaste tu contraseña?» al correo del propietario (`docs/CMS_MAESTRO.md`) |
| `BUSCADR_MAIL_FROM` | Variable | No | Remitente con dominio verificado en Resend |
| `GOOGLE_CLIENT_ID` | Variable | No | Botón «Continuar con Google» (`docs/AUTENTICACION_D1_GOOGLE.md`) |
| `ANTHROPIC_API_KEY` | Secret | No | Asistente de publicación desde la foto. Sin clave se usan reglas |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | Secret | No | Envío de avisos (`docs/WHATSAPP.md`) |
| `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | Secret | No | Webhook entrante (botones, búsqueda, publicar con foto) |
| `WHATSAPP_TEMPLATE_REQUEST`, `WHATSAPP_TEMPLATE_UPDATE` | Variable | No | Nombres de plantillas aprobadas en Meta |
| `BUSCADR_SUPPORT_WHATSAPP` | Variable | No | Número de soporte que aparece en cada reserva |
| `MEDIA` | Binding R2 | No | Sin R2 las fotos se guardan en D1 (descomentarlo en ambos `wrangler*.jsonc`) |
| `BUSCADR_OWNER_FEE_BPS`, `BUSCADR_RENTER_FEE_BPS` | Variable (en `wrangler.jsonc`) | — | 1500 = 15 % al propietario, 1000 = 10 % a quien alquila |

`wrangler.jsonc` usa `keep_vars: true`: un despliegue nunca borra lo configurado en el panel. El aviso «Update your Wrangler configuration…» es solo una recomendación.

## Workers Builds (despliegue continuo desde Git)

- Rama de producción: `main`.
- Comando de despliegue: `npx wrangler deploy`. Lee `wrangler.jsonc`, ejecuta `npm run build` y publica `build/server/index.js` + `build/client`.
- Comando de build: puede quedar vacío (si existe `npm run build`, solo se compila dos veces).
- Los antiguos `wrangler.toml`, `wrangler.worker.toml` y `wrangler.pages.toml` se eliminaron: si el panel apuntaba a alguno con `-c`, quitar esa opción.
- Migraciones: se aplican solas en el primer request (`server/db/migrate.ts`). Los primeros 1–2 requests pueden responder 503 «actualizando».
- Tarea programada cada 30 min (`server/cron.ts`): vence solicitudes sin respuesta, cierra devoluciones a las 48 h, envía recordatorios de retiro y limpia sesiones y contadores.

## Verificación tras desplegar

1. `/api/health` → `schema:"ready"`, lista de `migrations` (0001–0006), `adminConfigured:true` y qué integraciones están activas (`ai`, `whatsapp`, `google`, `mail`). Nunca muestra secretos.
2. `/diagnostico.html` resume lo anterior.
3. Iniciar sesión con una cuenta creada en la v0.3: debe entrar sin pedir nada nuevo.
4. `/maestro` con el correo del propietario y la contraseña inicial (`BUSCADR_ADMIN_PASSWORD`); luego cambiarla en «Acceso y contraseña».
5. Publicar un equipo de prueba → aprobarlo en `/admin` → reservarlo con otra cuenta → aceptar → códigos de entrega y devolución → reseñas.

## Desarrollo local

```bash
cp .dev.vars.example .dev.vars
npm ci
npm run dev        # http://localhost:5173
npm run check
BASE_URL=http://localhost:5173 npm run test:e2e      # flujo completo en navegador
BASE_URL=http://localhost:5173 npm run test:layout   # sin desbordes en 8 anchos (320–1440 px)
```
