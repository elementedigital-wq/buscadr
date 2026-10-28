# ADR 0015 — Trazabilidad de la atención con QR y satisfacción por etapa

**Estado:** aceptada (28-oct-2026)

**Contexto.** Una cita confirmada no dice cuándo llegó el paciente, cuánto esperó ni cuánto duró la consulta, y una sola opinión al final no distingue si falló la reserva, la recepción, la consulta o el cierre. Se necesita evidencia de cada etapa, confirmada por quien la vive, sin exponer datos de salud.

**Decisión.**
- **Cuatro etapas** por cita: *reserva* (derivada de `confirmed_at`), *llegada* (o ingreso a la sala virtual), *consulta* y *cierre*. Se registran en orden en `care_stages` (una fila por etapa, `PRIMARY KEY (appointment_id, stage)`) con hora, actor (`paciente`, `profesional`, `sistema`) y método (`qr`, `qr_recepcion`, `manual`, `auto`). Solo citas `confirmada`; el *cierre* marca la cita `completada` (misma transición que «Completar», que también registra el cierre).
- **Dos códigos QR** con tokens aleatorios de 128 bits sin datos personales: `a_…` por cita (lo muestra el paciente en «Mis citas») y `r_…` de recepción por profesional (póster imprimible en Panel → Calidad, rotable). Ambos apuntan a `/q/:token`; el servidor decide qué permite según quién escanea: el profesional dueño registra la siguiente etapa; el paciente con cita confirmada en la ventana de llegada (2 h antes a 2 h después) confirma su llegada con el QR de recepción. El paciente nunca registra consulta ni cierre; otro profesional recibe «código no válido». El código de respaldo (8 caracteres) se ve junto al QR.
- **QR generado en el servidor** (`qrcode-generator` fijado en 1.4.4) como un único `path` SVG: sin dependencias en el cliente, sin `innerHTML`. El escáner del panel usa `BarcodeDetector` del navegador con ingreso manual como respaldo.
- **Satisfacción por etapa**: escala de 1 a 5 (caras, con etiqueta de texto y anuncio accesible), etiquetas predefinidas por etapa y modalidad, y comentario opcional, editable durante 14 días. Las calificaciones son **privadas**: el profesional solo ve promedios, distribución y etiquetas **anónimos** cuando hay al menos 3 respuestas por etapa; los comentarios se muestran sin autor ni fecha exacta. Administración ve el promedio por etapa (sin perfiles de muestra).
- **Métricas derivadas**: puntualidad de llegada, espera (llegada → consulta), duración (consulta → cierre) y retraso sobre la hora reservada.
- Cada etapa genera un aviso en la app al paciente (nunca WhatsApp ni correo con datos clínicos) y un `appointment_event` `etapa_<etapa>`.
- Migración aditiva `0007_trazabilidad.sql` (8 sentencias): columnas `trace_token` y `reception_token` con índices únicos parciales, tablas `care_stages` y `stage_ratings`.

**Consecuencias.** Los tiempos reales de atención quedan medidos sin hardware adicional. Un QR filtrado solo sirve al profesional dueño o al paciente de la cita; la rotación del QR de recepción invalida el póster anterior. Las citas anteriores a 1.3 no tienen etapas intermedias («sin registro»).
