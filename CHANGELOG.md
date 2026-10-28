# Cambios

## 1.3.0 — 28-oct-2026 · Trazabilidad de la atención con QR y satisfacción por etapa

### Trazabilidad
- **Cuatro etapas por cita**: reserva → llegada (o ingreso a la sala virtual) → consulta → cierre, con hora, quién confirmó y cómo. El cierre completa la cita.
- **QR de la cita** en «Mis citas» (con «Ver en grande» y código de respaldo): el profesional lo escanea para registrar llegada, inicio de consulta y cierre.
- **QR de recepción** por profesional (Panel → Calidad, póster imprimible y rotable): el paciente lo escanea al llegar y confirma su llegada.
- **Panel → Escanear QR**: escáner con la cámara (BarcodeDetector) e ingreso manual del código; página `/q/:código` con el resultado.
- Línea de tiempo con progreso y métricas: puntualidad, espera y duración de la atención. Al entrar a una videoconsulta se registra la llegada.

### Satisfacción
- **Escala de 1 a 5 por etapa** (caras con texto, etiquetas por etapa y comentario opcional), editable 14 días.
- **Panel → Calidad**: promedio, distribución y etiquetas por etapa, tiempos y comentarios, **anónimos y solo con 3+ respuestas**. Administración muestra la satisfacción por etapa y las citas trazadas con QR.

### Técnico
- Migración aditiva `0007_trazabilidad.sql` (`care_stages`, `stage_ratings`, tokens de cita y de recepción). API `/api/trace/*`. QR SVG generado en el servidor (`qrcode-generator` 1.4.4). ADR 0015.
- 56 pruebas (QR de la cita en tres etapas con controles de privacidad y seguridad, QR de recepción y rotación, cita virtual). Maquetación (8 anchos) y accesibilidad sin problemas, con las nuevas páginas del panel.

## 1.2.0 — 28-oct-2026 · Taxonomía médica completa y pasarelas de pago configurables

### Especialidades
- **83 especialidades en 11 categorías** (antes 16): atención primaria, mujer y niñez, clínicas, cirugía, salud mental, odontología, visión/oído/lenguaje, rehabilitación, nutrición y bienestar, diagnóstico y servicios de salud. Cada una con ícono, tono, profesional y palabras de búsqueda («brackets» → Ortodoncia, «várices» → Cirugía vascular).
- `/especialidades` agrupada por categoría con búsqueda instantánea; los filtros de búsqueda muestran las 20 primeras y «Ver las 83».
- Formulario del profesional con especialidades agrupadas por categoría.
- **CMS → Especialidades y categorías:** editar, ocultar, ordenar y recategorizar; **agregar categorías y especialidades propias** que el directorio, la búsqueda, WhatsApp, las landings y los profesionales usan al publicar.
- Corrección: la búsqueda libre ya no confunde «xyz» con Imagenología (ignora términos de 1–2 letras).

### Pagos
- **CMS → Pasarelas de pago** (como «WooCommerce → Ajustes → Pagos»): activar, ordenar y configurar cada medio con título y descripción para el paciente; sección «Próximamente» (Kushki, Datafast/Nuvei, Deuna!, PayPal).
- Nuevo medio **Transferencia bancaria**: datos de la cuenta con botones de copiar, referencia BDR-XXXXXXXX, registro del comprobante y confirmación desde Administración → Transacciones (o rechazo con aviso al paciente).
- El paciente **elige el medio** en el checkout. Payphone usa credenciales del CMS (cifradas) o de Cloudflare.
- Credenciales cifradas con AES-GCM (clave `BUSCADR_SECRETS_KEY` en Cloudflare); nunca se devuelven ni se auditan sus valores. Los medios que mueven dinero real piden confirmar el Go/No-Go.
- El calendario de reserva ofrece solo los medios activos (pago en consultorio activable/desactivable).
- Migración aditiva `0006_pasarelas.sql` (tabla `payment_gateways` y columna `payments.gateway`).

### Calidad
- 53 pruebas (taxonomía, especialidades propias, credenciales cifradas, transferencia de punta a punta, reglas de medios al reservar). Auditorías de maquetación (8 anchos, ahora con checkout por transferencia) y de accesibilidad sin problemas.

## 1.1.0 — 28-oct-2026 · Iteración de buenas prácticas UX/UI (front end y back end)

Basada en auditorías automáticas (axe-core WCAG 2.2 AA, maquetación en 8 anchos y métricas de carga) y revisión visual en móvil.

### Experiencia
- **Perfil del profesional:** en el celular, la agenda aparece justo después de la cabecera (antes estaba ~3.000 px más abajo, después del mapa y las opiniones). En escritorio sigue fija a la derecha.
- **El horario elegido se conserva al iniciar sesión o registrarse:** quien elige día y hora sin cuenta vuelve al perfil con su horario seleccionado y un aviso «Un paso más para confirmar tu cita».
- **Mis citas:** nueva tarjeta con fecha tipo «boleto» (día, número y hora), profesional, especialidad, modalidad, tarifa e insignias. Corrige el nombre del profesional que se reducía a una letra en móviles.
- Cabecera del detalle de cita y tarjeta de «Mi cuenta» sin columnas aplastadas.
- **Barra de progreso** al cambiar de página (respeta «reducir movimiento»).
- Aviso de emergencias con enlace directo **«Llamar al 911»**.
- Mensajes de límite de intentos con el tiempo exacto de espera.

### Rendimiento
- `/buscar` en el celular: de **1.332 KB a 218 KB** (el mapa y sus teselas se cargan solo cuando el mapa es visible).
- `/maestro`: la pantalla de acceso pasa de **645 KB a 218 KB**; el editor se descarga solo después de entrar como propietario.

### Accesibilidad (WCAG 2.2 AA)
- Azul de marca más oscuro («ink», derivado de la paleta) para texto pequeño sobre fondos celestes (4,35:1 → ≥ 4,5:1); barra lateral del CMS en Azul Profundo.
- Aviso de emergencias como región (`aside`), jerarquía de títulos en la búsqueda y lista de definiciones válida en el perfil.
- Nuevo `npm run test:a11y` (axe-core): 0 infracciones graves como visitante, paciente, profesional y propietario.
- `npm run test:layout` detecta además **texto aplastado** (columnas flexibles reducidas a pocos píxeles).

### Back end
- Cada respuesta lleva `X-Request-Id` (el de Cloudflare si existe) y `Server-Timing`; los errores incluyen `request_id` y los 500 se registran en JSON sin datos personales.
- `429` con cabecera `Retry-After` y minutos de espera en el mensaje.
- 46 pruebas (identificador de solicitud, errores y límite de intentos).

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
