# buscaDR — Confianza para encontrar salud

Directorio médico y plataforma de citas para Ecuador: pacientes encuentran médicos, especialistas, clínicas y servicios de salud, comparan tarifas **presenciales y virtuales** y agendan en un calendario que el profesional confirma. Cada profesional tiene su **panel de citas**, avisos por **WhatsApp** y cobros registrados con **buscaDR Pay**. Piloto en Guayaquil, Samborondón, Daule, Quito y Cuenca.

> v1.1 (28-oct-2026): reconstrucción sobre Cloudflare Workers + D1 y una iteración de buenas prácticas UX/UI, accesibilidad, rendimiento y observabilidad. Ver `CHANGELOG.md` y `docs/ANALISIS_2026.md`.

## Qué incluye

| Área | Funciones |
|---|---|
| Pacientes | Búsqueda por especialidad, síntoma, nombre, ciudad y modalidad; lista y mapa; perfiles con tarifas, servicios, idiomas y opiniones verificadas; **calendario de reserva** (modalidad con precio, días, horarios por franja, pago en consultorio o en línea); mis citas con estado, reprogramar, cancelar, chat, videoconsulta, `.ics` y Google Calendar; favoritos; notificaciones |
| Profesionales y clínicas | **Panel personalizado**: KPIs, solicitudes por confirmar, agenda semanal, horarios por modalidad, bloqueos, perfil y **tarifas diferenciadas presencial/virtual**, confirmación manual o automática, código de llegada, ingresos con CSV y plan |
| Citas | Reserva atómica sin dobles reservas, retención con vencimiento, confirmación del profesional (panel o **botón de WhatsApp**), recordatorios 24 h y 1 h, sala de video para citas virtuales |
| buscaDR Pay | Pasarela propia con **libro de transacciones**: checkout en la app (sandbox), adaptador Payphone, cobros en consultorio, reembolsos automáticos, comisión configurable |
| Notificaciones | Campana en la app, WhatsApp (Cloud API) y correo (Resend), con consentimiento registrado |
| Administración | `/admin`: KPIs (citas realizadas, confirmación, ingresos, MRR, demanda no atendida), verificación de profesionales, transacciones con reembolso, citas y opiniones |
| CMS Maestro | `/maestro` (solo `elemente.digital@gmail.com`): marca, **tipografías** (Google Fonts importadas o enlazadas, o subidas), **íconos Font Awesome** (catálogo + librería completa), portada, banners, textos, componentes, especialidades, profesionales destacados, biblioteca, SEO, permisos, opiniones, historial y **acceso y contraseña** con recuperación por correo |
| SEO / PWA | SSR, landings `/medicos/{ciudad}/{especialidad}`, `sitemap.xml`, PWA instalable |

Los **perfiles de muestra** (12, etiquetados en toda la interfaz, sin registro profesional ni opiniones) permiten probar el flujo; sus citas se confirman solas y no ocupan agenda real.

## Stack

Un Cloudflare Worker (`buscadr`): API **Hono** en `server/` (`/api/*`) + web **React Router 8 con SSR** en `app/`, Tailwind 4, TypeScript estricto, D1 (`DB` → `buscadr-db`) con migraciones aditivas automáticas, R2 opcional. Detalle en `docs/ARQUITECTURA.md`.

```bash
cp .dev.vars.example .dev.vars   # credenciales locales de prueba (nunca las reales)
npm ci
npm run dev                      # http://localhost:5173
npm test                         # pruebas en workerd con D1 real
npm run check                    # wrangler sincronizado + tipos + lint + pruebas + build
BASE_URL=http://localhost:5173 npm run test:e2e     # prueba de humo en navegador (Playwright)
BASE_URL=http://localhost:5173 npm run test:layout  # sin desbordes en 8 anchos (320–1440 px)
BASE_URL=http://localhost:5173 npm run test:a11y    # accesibilidad WCAG 2.2 AA (axe-core)
```

## Documentación

- `docs/ANALISIS_2026.md` — hallazgos y mejoras de esta versión.
- `docs/DESPLIEGUE.md` — Cloudflare, secretos (incluida la contraseña del propietario) y verificación.
- `docs/ARQUITECTURA.md` — módulos, páginas, seguridad y pruebas.
- `docs/CMS_MAESTRO.md` — uso, íconos, tipografías y acceso del CMS.
- `docs/WHATSAPP.md` — Meta, plantillas y webhook.
- `docs/MONETIZACION.md` — planes, comisión, KPIs y próximas palancas.
- `docs/MARKETING_CLAIMS.md` — qué se puede y qué no se puede afirmar.
- `docs/OPERACION_D1.md` — migraciones y recuperación.
- `docs/CREDITOS.md` — licencias.
- `docs/adr/` — decisiones técnicas (0001–0011).
