# Cambios

## 1.0.0 — 28-oct-2026 · Plataforma de citas médicas sobre Cloudflare Workers

Reconstrucción completa de la demo estática a partir del Documento Maestro, la Estructura de Aplicación y el Brand Deck. Detalle de hallazgos en `docs/ANALISIS_2026.md`.

### Pacientes
- Portada con buscador (especialidad, nombre o síntoma · ciudad · modalidad), sugerencias, chips y tarjetas de especialidad con íconos, profesionales destacados, beneficios, «Así funciona», telemedicina y WhatsApp. Saludo y próxima cita con sesión iniciada.
- Búsqueda con chips de especialidad, modalidad Presencial/Virtual, orden (recomendados, próximo horario, valoración, tarifa, cercanía), lista y mapa (ubicación aproximada) y registro de demanda no atendida.
- Perfil del profesional: foto, insignias, experiencia, servicios, idiomas, tarifas presencial y virtual, ubicación aproximada, opiniones verificadas y **calendario de reserva** (tipo de atención con su precio, píldoras de día, horarios por Mañana/Tarde/Noche, pago en consultorio o en línea, motivo opcional, barra de resumen fija).
- Mis citas: próximas y pasadas, detalle con progreso, reprogramar, cancelar (gratis hasta 4 h antes), chat, sala de video (15 min antes), código de llegada, dirección exacta solo confirmada, `.ics`, Google Calendar, WhatsApp, pagos e historial; opinión tras la cita.
- Favoritos, notificaciones (campana) y cuenta con preferencias de WhatsApp y correo, invitaciones y exportación de datos.

### Profesionales, clínicas y servicios
- Registro como profesional y **panel personalizado**: resumen con KPIs (citas de hoy, solicitudes, ingresos del mes, confirmación), solicitudes con confirmar/rechazar, agenda semanal (escritorio) o por día (móvil), detalle de cita, horarios por día y modalidad con duración, pausa y anticipación mínima, bloqueos, perfil (tipo, especialidad, foto, consultorio, idiomas, servicios, seguros), **tarifas diferenciadas presencial/virtual**, pago previo, confirmación automática, WhatsApp, ingresos con CSV y plan.
- Envío a verificación; «Verificado» solo tras revisión del registro profesional.

### Citas, pagos y notificaciones
- Reserva atómica sin dobles reservas, idempotente, con retención que vence sola (24 h o 1 h antes; 30 min si el pago está pendiente). Estados con historial.
- **buscaDR Pay**: libro de transacciones, checkout en la app (sandbox), adaptador Payphone, cobros en consultorio, reembolsos automáticos, comisión configurable (8 %), planes pagados en la app.
- Notificaciones en la app, **WhatsApp con botones Confirmar/Rechazar** para el profesional y correo; recordatorios 24 h y 1 h antes.
- Citas virtuales con sala de video propia por cita.

### Propietario
- `/admin`: KPIs del Documento Maestro, verificación de profesionales, transacciones con reembolso y CSV, citas y opiniones.
- **CMS Maestro** (`/maestro`, solo `elemente.digital@gmail.com`): marca, tipografías (Google Fonts importadas o enlazadas, o subidas desde la computadora), íconos Font Awesome (catálogo + librería completa), portada, banners, textos, componentes, especialidades, profesionales destacados, biblioteca, SEO, permisos, opiniones, historial y **cambio y recuperación de contraseña por correo**.

### Calidad
- Sistema visual del Brand Deck (Azul Confianza, Verde Salud, Azul Tecnología, Manrope + Inter), WCAG 2.2 AA, controles con relleno y alto táctil; rejillas que nunca ensanchan la página.
- `npm run test:layout`: sin desbordes ni texto fuera de botones, chips, campos o tarjetas en 8 anchos (320–1440 px), como visitante, paciente, profesional y propietario (todas las pestañas del CMS).
- 44 pruebas en workerd con D1 real (incluida la concurrencia de 20 solicitudes) y prueba de humo en navegador.

## 0.2 — oct-2026 · Demo estática
- Directorio, búsqueda geográfica, dashboards de ejemplo y API local de pruebas (reemplazados por la 1.0).
