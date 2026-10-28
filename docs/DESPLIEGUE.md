# Despliegue en Cloudflare Workers

Un solo Worker, **`buscadr`**, sirve la web (React Router con SSR) y la API (`/api/*`, Hono), con la base D1 `buscadr-db` (binding `DB`). Cloudflare despliega desde `main`.

## Variables y secretos (Cloudflare → Workers & Pages → `buscadr` → Settings → Variables and Secrets → **Production**)

| Nombre | Tipo | Obligatorio | Uso |
|---|---|---|---|
| `DB` | Binding D1 → `buscadr-db` | Sí | Declarado en `wrangler.jsonc` (Cloudflare la crea en el primer deploy) |
| `BUSCADR_ADMIN_PASSWORD` | **Secret** | Sí (primer acceso al CMS) | Contraseña inicial del propietario `elemente.digital@gmail.com` (12+ caracteres). Escríbela solo en este panel, nunca en el repositorio. Al cambiarla desde el CMS se guarda como hash en D1 y el secreto deja de usarse |
| `RESEND_API_KEY` | Secret | Recomendado | Recuperación de contraseña del CMS por correo y avisos de citas por correo |
| `BUSCADR_MAIL_FROM` | Variable | No | Remitente con dominio verificado en Resend (`buscaDR <citas@tu-dominio>`) |
| `BUSCADR_PUBLIC_URL` | Variable | Recomendado | URL pública (`https://buscadr.com`) para los enlaces de WhatsApp y correo enviados por la tarea programada |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | Secret | No | Avisos por WhatsApp (`docs/WHATSAPP.md`) |
| `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | Secret | No | Webhook: botones Confirmar/Rechazar y búsqueda por chat |
| `WHATSAPP_TEMPLATE_REQUEST`, `WHATSAPP_TEMPLATE_UPDATE` | Variable | No | Plantillas aprobadas por Meta (fuera de la ventana de 24 h) |
| `BUSCADR_SUPPORT_WHATSAPP` | Variable | No | Número de soporte de buscaDR |
| `PAYPHONE_TOKEN`, `PAYPHONE_STORE_ID` | Secret | No (producción de pagos) | Pasarela real. Sin ellos, buscaDR Pay funciona en **sandbox** (sin dinero real) |
| `BUSCADR_PAYMENTS` | Variable (`wrangler.jsonc`) | — | `sandbox` (por defecto) o `payphone` |
| `BUSCADR_FEE_BPS` | Variable (`wrangler.jsonc`) | — | Comisión por cita pagada en línea: `800` = 8 % |
| `BUSCADR_ENFORCE_PLANS` | Variable | No | `1` limita funciones según el plan; sin ella (piloto) todo está disponible |
| `GOOGLE_CLIENT_ID` | Variable | No | Botón «Continuar con Google» |
| `MEDIA` | Binding R2 | No | Sin R2 las imágenes y fuentes se guardan en D1 (descomentarlo en ambos `wrangler*.jsonc`) |

`wrangler.jsonc` usa `keep_vars: true`: un despliegue nunca borra lo configurado en el panel.

### Configurar la contraseña del propietario

```bash
npx wrangler secret put BUSCADR_ADMIN_PASSWORD   # pega la contraseña cuando la pida (no queda en el historial)
```

O en el panel: Variables and Secrets → **Add** → tipo *Secret* → nombre `BUSCADR_ADMIN_PASSWORD`. Después entra en `/maestro` con `elemente.digital@gmail.com` y cámbiala en «Acceso y contraseña».

## Workers Builds (despliegue continuo desde Git)

- Rama de producción: `main`. Comando de despliegue: `npx wrangler deploy` (ejecuta `npm run build` y publica `build/server/index.js` + `build/client`).
- Migraciones: se aplican solas en el primer request (`server/db/migrate.ts`). Los primeros 1–2 requests pueden responder 503 «actualizando».
- Tarea programada cada 30 min (`server/cron.ts`): vence solicitudes y pagos pendientes, vence planes, envía recordatorios 24 h y 1 h antes de cada cita y limpia sesiones y contadores.

## Verificación tras desplegar

1. `/api/health` → `schema:"ready"`, migraciones `0001`–`0005`, `adminConfigured:true` y qué integraciones están activas (`payments`, `payphone`, `whatsapp`, `mail`, `google`). Nunca muestra secretos.
2. `/maestro` con el correo del propietario y la contraseña inicial; cámbiala en «Acceso y contraseña».
3. Crear una cuenta profesional → completar perfil, horarios y tarifas → enviar a verificación → aprobar en `/admin` → reservar con otra cuenta → confirmar desde el panel (o WhatsApp) → completar → opinión.
4. Cita virtual con pago sandbox (tarjeta `4111 1111 1111 1111`, cualquier fecha futura y CVV) → ver el pago en `/panel/ingresos` y `/admin`.

## Desarrollo local

```bash
cp .dev.vars.example .dev.vars   # pon una contraseña local de prueba (no la real)
npm ci
npm run dev        # http://localhost:5173
npm run check
BASE_URL=http://localhost:5173 npm run test:e2e      # flujo de cita en navegador
BASE_URL=http://localhost:5173 npm run test:layout   # sin desbordes en 8 anchos (320–1440 px)
```
