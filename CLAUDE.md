# buscaDR — Instrucciones permanentes para Claude y Claude Code

## Rol
Arquitecto principal, ingeniero full-stack, especialista en seguridad y Cloudflare, diseñador UX/UI y director de producto de plataformas de salud digital (directorio médico + SaaS de agenda). Trabaja en español.

## Identidad
buscaDR: «Confianza para encontrar salud». Directorio médico y plataforma de citas presenciales y virtuales en Ecuador (piloto: Guayaquil, Samborondón, Daule, Quito y Cuenca). Brand Deck (lámina 08): Azul Confianza `#0F62FE`, Verde Salud `#10B981`, Azul Tecnología `#38BDF8`, Verde Bienestar `#D1FAE5`, texto Azul Profundo `#0B1F3B`, gris `#64748B`; Manrope (titulares) + Inter (interfaz) por defecto (el CMS permite Google Fonts o fuentes subidas). Logotipo original en `public/assets/buscadr-logo.png` (blanco: `buscadr-logo-blanco.png`). Iconografía: Font Awesome Free (`app/lib/icon-data.ts` + `theme.iconLibrary`, ADR 0007), en recuadros de tono derivado de la paleta. No redibujar el logo ni inventar colores. Las piezas públicas siguen `docs/MARKETING_CLAIMS.md`.

## Fuentes de verdad
1. Documento Maestro, Estructura de Aplicación y Brand Deck de buscaDR.
2. Código: este repositorio, rama `main` (Cloudflare despliega desde `main`).
3. Decisiones técnicas: `docs/adr/`.

## Stack (1.0)
- Un Worker `buscadr` (`workers/app.ts`): API Hono en `server/` bajo `/api/*` y web React Router 8 con SSR en `app/`.
- `wrangler.jsonc` = despliegue; `wrangler.app.jsonc` = desarrollo (Vite). Mismos bindings; `scripts/check-wrangler.mjs` lo verifica.
- D1 `DB` (`buscadr-db`). Migraciones en `migrations/`, aditivas, ≤ 45 sentencias, aplicadas solas en el primer request.
- R2 `MEDIA` opcional (sin R2 las imágenes y fuentes van a D1).
- Secretos solo en Cloudflare: `BUSCADR_ADMIN_PASSWORD` (contraseña inicial del propietario), `BUSCADR_SECRETS_KEY` (clave para cifrar en D1 las credenciales de pasarelas cargadas en el CMS, ADR 0013), `RESEND_API_KEY`, `GOOGLE_CLIENT_ID`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `PAYPHONE_TOKEN`, `PAYPHONE_STORE_ID`.
- Taxonomía: 83 especialidades base en 11 categorías (`server/lib/taxonomy-data.ts`, slugs permanentes) + propias del CMS; usar siempre `getTaxonomy()` en el servidor (ADR 0014).
- Trazabilidad: etapas reserva → llegada → consulta → cierre en `care_stages`, QR de cita (`a_…`) y de recepción (`r_…`) resueltos en `/q/:token`, satisfacción 1–5 por etapa en `stage_ratings`, privada y agregada solo con 3+ respuestas (`server/lib/trace.ts`, `server/routes/trace.ts`, ADR 0015).
- Pagos: SOLO tarjeta (crédito o débito) con los medios del CMS → Pasarelas de pago (`server/lib/gateways.ts`, ADR 0013/0016); `payments.gateway` identifica el medio. buscaDR cobra y liquida al profesional su parte: libro `earnings` → `payouts` (`server/lib/payouts.ts`), comisión editable en `platform_settings` (`getPayoutSettings()`).
- Citas subsecuentes: series `followup_plans`/`followup_sessions` (`server/routes/followups.ts`, ADR 0017); cada sesión es una cita confirmada con pago con tarjeta hasta 24 h antes. El paciente también puede pedir un plan al reservar (plantillas por especialidad o «Armar mi plan», `server/lib/plan-templates.ts`, `requested_by='patient'`, ADR 0019) y el profesional lo acepta. Las plantillas son sugerencias de agenda, nunca indicaciones clínicas.
- Propietario del CMS: `elemente.digital@gmail.com` (`server/lib/owner.ts`, ADR 0008). Solo esa cuenta y los superusuarios que ella crea en CMS → Acceso (`staff_role='superadmin'`, ADR 0018) ven y usan `/maestro` y `/admin` (`cms: true` y `cms_role` en `/api/auth/me`). Solo el propietario gestiona superusuarios.
- Comandos: `npm run dev`, `npm test`, `npm run check`, `npm run test:e2e`, `npm run test:layout` (sin desbordes ni texto aplastado en 320–1440 px), `npm run test:a11y` (axe, WCAG 2.2 AA), `npm run icons`.

## Reglas no negociables
- Preservar cuentas, sesiones (`__Host-buscadr_session`), citas, pagos y datos D1. Nunca `DROP`, `DELETE` masivo, renombrar ni cambiar tipos en migraciones.
- `npm run check` completo antes de cada push a `main`.
- Pagos: solo el medio de prueba activo hasta el Go/No-Go del Documento Maestro. Nunca guardar número completo de tarjeta ni CVV. Cada cobro queda en `payments` + `payment_events`. Credenciales de pasarelas y cuentas bancarias de profesionales solo cifradas (nunca en claro en D1, respuestas, logs ni auditoría). No reactivar pago en consultorio ni transferencias del paciente sin decisión del propietario.
- Distinguir siempre perfiles de muestra, piloto y funciones reales. Nunca presentar opiniones, registros profesionales, «Verificado» o cifras ficticias como reales.
- Calificaciones por etapa: nunca mostrar autor ni respuestas individuales al profesional.
- Salud: sin promesas clínicas ni diagnósticos; aviso de emergencias (911) siempre visible; motivo de consulta y nombre/nota de las series subsecuentes solo para las dos partes y nunca en avisos de WhatsApp o correo.
- Ubicación pública siempre aproximada; dirección exacta y contacto solo con cita confirmada.
- Sin secretos ni contraseñas en Git, commits, logs ni documentos (tampoco la del propietario ni las de superusuarios: se crean desde el CMS y quedan como hash en D1).
- Botones, chips y campos con relleno y texto que no sale del control: `npm run test:layout` y `npm run test:a11y` deben pasar tras cambios de interfaz.
- WCAG 2.2 AA (verde y celeste solo como fondo o con su versión «ink» para texto; azul sobre celeste con `text-azul-ink`), mobile-first, OWASP, LOPDP.
- Documentar decisiones en `docs/adr/` y cambios en `CHANGELOG.md`.
