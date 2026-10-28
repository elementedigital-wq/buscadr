# Arquitectura de buscaDR

Directorio médico + SaaS de agenda para profesionales de la salud en Ecuador. Un Cloudflare Worker (`workers/app.ts`) atiende `/api/*` con Hono (`server/`) y el resto con React Router 8 + SSR (`app/`). Datos en D1 (`buscadr-db`), medios en D1 o R2.

```
Paciente ─┐                 ┌─ Hono API ── D1: users, practitioners, availability_*, appointments,
Profesional ─ Worker buscadr ┤                  payments, notifications, cms_*, …
Propietario ┘   (SSR + API)  └─ React Router SSR ── páginas públicas, panel, CMS
          │                         │
          ├─ WhatsApp Cloud API ◄───┤ notify(): app + WhatsApp + correo (Resend)
          ├─ Payphone / sandbox ◄───┤ buscaDR Pay: libro de pagos
          └─ Jitsi Meet (enlace) ◄──┘ teleconsulta
Cron */30 → vence retenciones y pagos, planes, recordatorios 24 h / 1 h, limpieza
```

## Módulos del servidor

| Archivo | Responsabilidad |
|---|---|
| `server/routes/practitioners.ts` | Directorio: búsqueda, filtros, orden, perfil público, disponibilidad por día y modalidad, favoritos |
| `server/routes/appointments.ts` | Crear cita (atómica + idempotente), listar, detalle, `.ics`, mensajes y acciones (confirmar, rechazar, cancelar, reprogramar, completar, no asistió, marcar pagada, pagar, opinar) |
| `server/routes/pro.ts` | Panel del profesional: perfil, foto, envío a verificación, horarios, bloqueos, calendario, resumen, ingresos (CSV) y plan |
| `server/routes/payments.ts` | buscaDR Pay: pagos propios, checkout, sandbox, confirmación de Payphone |
| `server/routes/me.ts` | Portada personalizada y notificaciones |
| `server/routes/admin.ts` | KPIs, verificación, transacciones con reembolso, citas, opiniones |
| `server/routes/whatsapp.ts` | Webhook firmado: botones Confirmar/Rechazar y búsqueda por chat |
| `server/routes/auth.ts` | Registro (paciente/profesional), sesión, Google, preferencias, acceso del propietario, exportación de datos |
| `server/cms/*` | CMS Maestro: modelo validado, versiones, medios, fuentes, búsqueda de íconos |
| `server/lib/slots.ts` · `time.ts` | Horarios ofrecidos a partir de reglas semanales (UTC−5 fijo) |
| `server/lib/appointments.ts` | Estados, transiciones, retención, SQL de solapes, sala de video, `.ics` |
| `server/lib/payments.ts` · `settle.ts` | Proveedores de pago, liquidación y reembolso idempotentes |
| `server/lib/notify.ts` · `whatsapp.ts` · `mail.ts` | Notificaciones multicanal con consentimiento |
| `server/lib/practitioners.ts` | Vista pública (coordenadas aproximadas, registro enmascarado, sin dirección) y reputación |

## Páginas

- **Públicas:** `/` (portada), `/buscar` (lista y mapa), `/especialidades`, `/doctor/:slug` (perfil + calendario de reserva), `/medicos/:ciudad/:especialidad` (landing SEO), `/para-profesionales`, `/planes`, `/como-funciona`, `/privacidad`.
- **Paciente:** `/citas`, `/citas/:id` (estado, reprogramar, cancelar, chat, video, pago, opinión), `/pagar/:id`, `/favoritos`, `/notificaciones`, `/cuenta`.
- **Profesional** (`/panel`, dashboard personalizado para médicos, especialistas, clínicas y servicios): resumen con KPIs y solicitudes, agenda semanal, detalle de cita, horarios y bloqueos, perfil y tarifas, ingresos, plan.
- **Propietario:** `/admin` y `/maestro` (solo `elemente.digital@gmail.com`).

## Seguridad y privacidad

- Sesión `__Host-buscadr_session` (HttpOnly, Secure, SameSite=Lax), contraseñas PBKDF2, límites de intentos, CSRF por cabecera `X-Requested-With: BUSCADR-WEB` + mismo origen, CSP estricta, entrada validada con Zod y listas blancas.
- Datos de salud mínimos: motivo de consulta opcional, visible solo para las dos partes; los avisos no lo incluyen.
- Ubicación pública aproximada (coordenadas redondeadas a ~1 km); dirección, teléfono y WhatsApp del consultorio solo con la cita confirmada.
- Pagos sin datos completos de tarjeta en buscaDR; webhook de WhatsApp con HMAC; confirmación de Payphone servidor a servidor.
- Exportación de datos (LOPDP) y registro de consentimientos.

## Observabilidad

Cada respuesta de la API lleva `X-Request-Id` (el `cf-ray` de Cloudflare si existe) y `Server-Timing: app;dur=…`. Los errores devuelven `request_id` en el JSON y los errores internos se registran como una línea JSON (`buscadr_api_error`) sin cuerpo ni datos personales: con el código que ve la persona se encuentra el registro exacto en Workers Logs. Los `429` incluyen `Retry-After`.

## Pruebas

`npm test` (Vitest en workerd con D1 real): flujo completo de cita, 20 solicitudes concurrentes con un solo ganador, idempotencia, cita virtual con pago y reembolso, reprogramación y expiración, perfiles de muestra, WhatsApp, planes, administración, CMS y acceso del propietario. `npm run test:e2e` (navegador, incluido conservar el horario elegido al registrarse), `npm run test:layout` (sin desbordes ni texto aplastado en 320–1440 px, incluidas todas las pestañas del CMS) y `npm run test:a11y` (axe-core, WCAG 2.2 AA, sin infracciones graves).
