# buscaDR — Premium MVP / Ecuador

**Estado: demo navegable + API local de desarrollo, no producción clínica.**

Basado en `01_buscaDR_Documento_Maestro`, `02_buscaDR_Estructura_de_Aplicacion` y `Brand Deck buscaDR` (octubre 2026). Directorio médico gratuito para pacientes, SaaS para médicos independientes y clínicas. La plataforma no diagnostica, no atiende emergencias ni gestiona historias clínicas.

## Qué está construido

- Landing premium con logotipo extraído del Brand Deck original, hero médico, sistema visual Inter y colores azul/verde.
- Búsqueda por nombre, ciudad, especialidad, tarifas ficticias, calificación ficticia y cercanía calculada con fórmula Haversine.
- Mapa Leaflet/OpenStreetMap cuando hay conexión; fallback informativo accesible cuando no la hay. Marcadores geográficos ficticios.
- 12 profesionales y ocho especialidades ilustrativas; fotografías de referencia, tarjetas, perfiles, reseñas y medallas inequívocamente marcados como datos de prueba.
- Registro local de prueba como **paciente** y como **profesional**, sin recoger contraseñas ni datos reales. Sesión de prueba en `sessionStorage`, información local en `localStorage`.
- Flujo demostrativo de selección de fecha/horario, solicitud de cita, prevención local de doble reserva, confirmación, atención, cancelación y reseña tras cita completada.
- Dashboards de paciente, profesional y administración; edición de perfil profesional de prueba, agenda, mensajes privados de prueba y favoritos.
- Tarjetas de planes Free, Agenda $15, Pro $29, Growth $59 y Clinic desde $119: son **hipótesis comerciales**, no pagos activados.
- Servidor HTTP Node de **desarrollo local separado**: almacenamiento real SQLite, signup/login por contraseña PBKDF2, cookie HttpOnly, controles de rol y propiedad, reserva atómica con índice único, reseñas solo tras atención, mensajes internos. No está conectado al frontend estático y no debe exponerse como API de producción.
- CI Github Actions que comprueba sintaxis y ejecuta pruebas del servidor local.

## Opción A: abrir el demo portable

Abre `public/index.html` con un navegador moderno. La mayor parte de la app funciona sin servidor; Google Fonts, Leaflet y mosaicos OpenStreetMap requieren internet. No uses información personal auténtica.

## Opción B: servir frontend

```bash
python3 -m http.server 8080 --directory public
```

Visita `http://localhost:8080`.

## Opción C: API local de desarrollo

Node 22+ (SQLite experimental, solo para entorno local):

```bash
DEMO_API=1 npm start
npm run check
npm test
```

Windows PowerShell: `$env:DEMO_API="1"; npm start`. Endpoint: `http://127.0.0.1:8787/api/v1/health`. Persistencia en `.local/buscadr.sqlite`. No expongas esta API a Internet: faltan verificación de email, verificación documental, recuperación de acceso, MFA, auditoría completa y análisis de seguridad.

## Publicación de la demo estática en Cloudflare

**Cloudflare Pages:** conecta el repositorio GitHub `elementedigital-wq/buscadr`, Framework preset `None`, Build command vacío, Build output directory `public`, rama `main`. Se publica solo la demo local, sin backend compartido.

**Cloudflare Workers con static assets:** `wrangler.jsonc` prepara `public/`; cuando haya acceso autenticado a Cloudflare, ejecutar `npx wrangler deploy` después de probar versión y cuenta de Cloudflare. No anunciar URL hasta que el despliegue se confirme.

## Arquitectura objetivo para producción (pendiente)

Según el blueprint aprobado, la transición productiva será: **Next.js/React + TypeScript** para UI/SEO, **Hono** en Cloudflare Workers como API, **PostgreSQL/PostGIS** fuente de verdad de citas y geodatos, migraciones **Drizzle**, contratos **Zod**, controles de RBAC y tenant, WhatsApp Cloud API con consentimiento y outbox, colas con reintentos y pasarela local con webhooks verificados. La API SQLite incluida es únicamente un banco de pruebas funcional, **no reemplaza** PostgreSQL/PostGIS para el producto sanitario comercial.

- Geolocalización inicial: Haversine y Leaflet. PostGIS `ST_DWithin` y GiST primero para escala; geohash/R-tree se utilizan solo si los perfiles lo justifican. A* / Dijkstra y Douglas–Peucker no son necesarios para localizar consultorios en el MVP, salvo que se añada navegación o rutas.
- No incluir Java, PHP ni microservicios separados sin una necesidad concreta: añaden despliegues y riesgo sin mejorar el MVP. El monolito modular mantiene separación por dominio.
- WhatsApp: usar cuenta Business de buscaDR, plantillas aprobadas y enlace seguro a chat interno; nunca revelar números privados ni simular envío en esta demo.
- Seguridad y regulación: revisión LOPDP/SPDP Ecuador, comprobación ACESS u otras fuentes aplicables, MFA de staff, cifrado, accesibilidad, política de reseñas verificadas y consentimiento.
- Pagos: **no implementados**; suscripciones, add-ons y clínicas tras validar costes y normativa.

## Criterios pendientes antes de producción

1. Conectar UX al backend definitivo: no confundir `localStorage` con autenticación real.
2. Validar credenciales sanitarias oficialmente, controlar el acceso y minimizar datos sensibles.
3. Reserva transaccional PostgreSQL con constraint `EXCLUDE` y prueba bajo 100 reservas simultáneas.
4. Integraciones autorizadas de correo, WhatsApp, pasarela y persistencia segura multiusuario.
5. SEO indexable con rutas de servidor (SPA de hash actual es solo demo).
6. Pruebas E2E completas, compatibilidad Cloudflare, Lighthouse, pentesting y legal.

## Carpeta principal

`public/` UI portable; `server/` API local Node + SQLite; `tests/` pruebas de integración; `.github/` CI; `wrangler.jsonc` Cloudflare. No hay dependencias npm de runtime.

**Derechos gráficos:** logotipo y elementos visuales tomados de los adjuntos aportados para este proyecto. Las imágenes y nombres de ejemplo no representan profesionales reales ni certifican habilitación profesional.