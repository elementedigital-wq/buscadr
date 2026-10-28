# Cambios

## 0.6.0 — 26-oct-2026 · Iteración UX/UI, iconografía, tipografías y acceso del propietario

### Experiencia (inspirada en las referencias, con la línea visual buscaDR)
- **Portada personalizada:** saludo por nombre y hora, «Resumen buscaDR» con lo más urgente (solicitudes por responder con tiempo restante, reserva próxima con su código, solicitud en espera o el mensaje del CMS), progreso «2 de 3 listo» con el siguiente paso, y seguimiento de la reserva activa.
- Buscador «Describe lo que necesitas…» con **dictado por voz** (si el navegador lo permite) y sugerencias.
- **Fila de categorías** con iconos en recuadros de tono suave y nueva página **/categorias** (tarjetas con icono, foto, «desde $X/día · N equipos» y «Más reservada» solo con datos reales).
- **Explorar:** buscador con sugerencias, chips de categoría con icono, **filtros rápidos** (Disponible hoy, Reserva inmediata, Mejor valorados, Hasta $15/día, Con entrega), vista **Lista** (filas con foto, propietario, reputación, distancia, precio e insignias «Anuncio revisado» y «Ya lo alquilaste»), **Fotos** y **Mapa**, y «Pedir a la comunidad».
- **Ficha:** cabecera con propietario e insignias, franja de disponibilidad («Disponible hoy» o próxima fecha libre), **tarifas seleccionables** (hora/día/semana), galería, compartir y barra fija con precio y «Reservar».
- **Reserva en 3 pasos** (/equipo/:slug/reservar): 1 · Cuándo (días, horarios libres y duración), 2 · Detalles (entrega, mensaje, reglas), 3 · Confirmar (resumen, pago al retirar en el piloto y desglose). El estado vive en la URL y sobrevive al inicio de sesión.
- **Detalle de la reserva:** tarjeta de seguimiento («Retiro mañana 09:00», barra de progreso, contraparte con chat y WhatsApp) y chat con burbujas y separadores por día.
- **Navegación móvil flotante** con iconos editables; menú de cuenta con iconos.

### Iconografía y CMS
- Iconos de **Font Awesome Free 7** (305, sólidos, de contorno y marcas) con selector por grupos y búsqueda en español, o imagen propia. Editables en categorías, menú, «Así funciona» y compromisos. Tonos de recuadro derivados de la paleta de marca.
- **Tipografías:** además de Manrope e Inter, familias de **Google Fonts** (comprobadas) y **fuentes subidas** (WOFF2/WOFF/TTF/OTF con validación de firma).
- Nuevos campos: saludo, Resumen buscaDR, fila de categorías, página de categorías, fotos por categoría e interruptores de la portada personalizada.

### Acceso del propietario
- Solo `elemente.digital@gmail.com` (o `BUSCADR_ADMIN_EMAIL`) ve y abre el CMS y la administración; nadie puede registrarse ni entrar con Google con ese correo.
- **Cambio de contraseña** desde el CMS (hash en D1; el secreto inicial deja de valer; se cierran las demás sesiones).
- **Recuperación por correo** con enlace de un solo uso de 30 minutos (Resend, opcional). Migración `0006_acceso_propietario.sql`.

### Calidad
- Botones, chips y campos con relleno, alto táctil y texto que nunca sale del control. Corregidos desbordes en Explorar, tarjetas de categoría y CMS.
- Nueva auditoría `npm run test:layout` (Playwright): sin desplazamiento horizontal ni texto fuera de botones, chips, campos o tarjetas en 8 anchos (320–1440 px), incluidas todas las pestañas del CMS.
- 49 pruebas (acceso del propietario, fuentes, iconos, portada personalizada, filtros); prueba de humo con la reserva en 3 pasos.
- Precios con coma decimal en todo el desglose; horas en formato 24 h.

## 0.5.0 — 26-oct-2026 · Marketplace operativo + CMS Maestro

Reescritura completa sobre el mismo Worker (`buscadr`) y la misma D1 (`buscadr-db`). Cuentas, contraseñas y sesiones de la v0.3 siguen funcionando.

### Producto y UX
- Buscador «Qué · Dónde · Cuándo» con disponibilidad real, filtros, orden y mapa (ubicación aproximada).
- Ficha con galería, reglas, reseñas reales, calendario ocupado y **precio total antes de reservar**; CTA fija en móvil.
- Reservas reales y compartidas: solicitud (24 h) o inmediata, códigos de entrega y devolución, checklist y fotos, extensión, cancelación, incidencias, reseñas en ambos sentidos, chat con datos de contacto ocultos hasta confirmar.
- Publicación guiada con asistente IA desde la foto, precios por hora/día/semana con sugerencia, bloqueos de calendario y revisión previa.
- Panel del propietario, favoritos, «Mi cuenta» con WhatsApp, referidos y exportación de datos.
- Landings SEO `/alquiler/{ciudad}/{categoria}`, `sitemap.xml`, JSON-LD, PWA.
- Fotos del Brand Deck limpias (sin textos ni precios en euros incrustados); 11 anuncios de muestra etiquetados.

### Operación
- `/admin`: KPIs del Documento Maestro, moderación, incidencias, reservas, demanda no resuelta.
- **CMS Maestro** `/maestro` con las mismas opciones que YANK (+ sección Anuncios).
- WhatsApp Cloud API: avisos, aceptar/rechazar con botón, búsqueda por chat y publicar por foto.
- Tarea programada cada 30 min (vencimientos, cierres, recordatorios, limpieza).

### Técnico
- Hono + React Router 8 SSR + TypeScript + Tailwind 4; migraciones D1 aditivas automáticas.
- Anti doble reserva atómica, idempotencia, límites de intentos, CSP estricta, validación de firma real de imágenes.
- 37 pruebas en workerd con D1 real + prueba de humo en navegador; CI en GitHub Actions.
- Eliminados: SPA `app.js`, `localStorage` como base de datos, `wrangler*.toml` en conflicto, backend PostgreSQL no desplegado (referencia PostGIS en `infrastructure/`).

## 0.3 — oct-2026
Cuentas reales en D1 y Google; resto del producto como demostración local en el navegador.
