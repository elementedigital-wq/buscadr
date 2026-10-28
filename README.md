# buscaDR — Herramientas y equipos a tu alcance

Marketplace de alquiler de herramientas y equipos entre personas, por horas, días o semanas. Piloto en **Guayaquil, Samborondón y Daule** (Ecuador). Durante el piloto **no se procesan pagos** dentro de buscaDR: se muestra el precio total y el pago se coordina al retirar.

> v0.6 (26-oct-2026): portada personalizada, reserva en 3 pasos, iconografía Font Awesome editable, tipografías de Google Fonts o propias, y acceso exclusivo del propietario con cambio y recuperación de contraseña. Mismo Worker `buscadr` y misma D1 `buscadr-db`. Ver `CHANGELOG.md`.

## Qué incluye

| Área | Funciones |
|---|---|
| Portada | Saludo, «Resumen buscaDR» con lo más urgente de cada persona, buscador con dictado por voz, fila de categorías con iconos, seguimiento de la reserva activa |
| Búsqueda | Sugerencias, filtros rápidos (hoy, reserva inmediata, mejor valorados, precio, entrega), filtros completos, disponibilidad real por fechas, vistas Lista/Fotos/Mapa, ranking del Documento Maestro, «Pedir a la comunidad» |
| Ficha y reserva | Disponibilidad de hoy, tarifas seleccionables, galería, reseñas reales; **reserva en 3 pasos** (Cuándo · Detalles · Confirmar) con **precio total antes de confirmar** (garantía aparte) |
| Reservas | Solicitud con retención de 24 h o reserva inmediata, anti doble reserva atómica (con margen entre alquileres), código de entrega y de devolución, checklist y fotos de evidencia, extensión, cancelación, incidencias con mediación, cierre automático a las 48 h, reseñas en ambos sentidos, chat con ocultación de datos de contacto hasta confirmar |
| Propietarios | Publicación guiada con **asistente IA desde la foto** (Claude, con alternativa por reglas), precios por hora/día/semana con sugerencia, bloqueos de calendario, panel de ingresos estimados, revisión previa del equipo buscaDR |
| WhatsApp | Avisos con consentimiento, **aceptar/rechazar con un botón**, búsqueda por chat y **publicar enviando una foto** (WhatsApp Cloud API) |
| Cuentas | Correo/contraseña (compatible con la v0.3), Google, preferencias, código de referido, exportación de datos |
| Administración | `/admin`: KPIs del Documento Maestro (north star, GMV, take rate, contribución estimada, embudo, demanda), moderación, incidencias, reservas |
| CMS Maestro | `/maestro` (solo el propietario): marca, **tipografías** (Brand Deck, Google Fonts o subidas), portada, banners, textos y menú, componentes, categorías con **iconos Font Awesome** y tonos, anuncios destacados, biblioteca de medios, SEO, permisos, reseñas, historial y **acceso y contraseña**, con vista previa en vivo y clic para editar |
| SEO / PWA | SSR, landings `/alquiler/{ciudad}/{categoria}`, `sitemap.xml`, JSON-LD, PWA instalable |

Los **anuncios de muestra** (11, etiquetados en toda la interfaz) permiten probar el flujo completo; sus reservas son de prueba y no ocupan el calendario de nadie. No se presentan como oferta real.

## Stack

Un único Cloudflare Worker (`buscadr`): API **Hono** en `server/` (`/api/*`) + web **React Router 8 con SSR** en `app/`, Tailwind 4, TypeScript estricto, D1 (`DB` → `buscadr-db`) con migraciones aditivas que se aplican solas, R2 opcional. Detalle en `docs/ARQUITECTURA.md`.

```bash
cp .dev.vars.example .dev.vars   # credenciales locales de prueba
npm ci
npm run dev                      # http://localhost:5173 (las migraciones se aplican en el primer request)
npm test                         # 37 pruebas en workerd con D1 real
npm run check                    # wrangler sincronizado + tipos + lint + pruebas + build
BASE_URL=http://localhost:5173 npm run test:e2e     # prueba de humo en navegador (Playwright)
BASE_URL=http://localhost:5173 npm run test:layout  # sin desbordes en 8 anchos de pantalla
```

## Documentación

- `docs/DESPLIEGUE.md` — Cloudflare, secretos y verificación.
- `docs/ARQUITECTURA.md` — módulos, datos, reservas, ranking, seguridad.
- `docs/CMS_MAESTRO.md` — uso y seguridad del CMS.
- `docs/WHATSAPP.md` — configuración de Meta, plantillas y webhook.
- `docs/AUTENTICACION_D1_GOOGLE.md` — cuentas, compatibilidad v0.3 y Google.
- `docs/MONETIZACION.md` — comisiones, unidad económica y próximas fuentes de ingreso.
- `docs/MARKETING_CLAIMS.md` — qué se puede y qué no se puede afirmar.
- `docs/OPERACION_D1.md` — migraciones y recuperación.
- `docs/CREDITOS.md` — licencias de iconos, fuentes y mapas.
- `docs/adr/` — decisiones técnicas.
