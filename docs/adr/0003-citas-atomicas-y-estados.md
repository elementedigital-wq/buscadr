# ADR 0003 — Citas atómicas, estados y retención

**Estado:** aceptada (28-oct-2026)

**Contexto.** Dos pacientes no pueden quedarse con el mismo horario, el profesional debe poder confirmar (Documento Maestro: «agenda en tiempo real con confirmación del profesional») y un horario no puede quedar bloqueado indefinidamente.

**Decisión.**
- La cita se crea con un único `INSERT … SELECT … WHERE NOT EXISTS (solape) AND NOT EXISTS (bloqueo)` más una clave de idempotencia por paciente. Solo se aceptan horarios publicados por las reglas semanales (`server/lib/slots.ts`: modalidad, duración, pausa entre citas, anticipación mínima, ventana de 60 días). Hora de Ecuador fija (UTC−5).
- Estados: `solicitada → confirmada → completada`, con `rechazada`, `cancelada`, `expirada` y `no_asistio`. Las transiciones viven en `server/lib/appointments.ts` (`availableActions`) y se registran en `appointment_events`.
- Retención: una solicitud vence a las 24 h o 1 h antes de la cita (lo que ocurra primero); con pago en línea pendiente, a los 30 min. El cron (`*/30`) libera los horarios y cancela pagos pendientes.
- El profesional puede activar la confirmación automática. Reprogramar es atómico (mismo control de solape). Cancelar sin costo hasta 4 h antes.
- Perfiles de muestra: se confirman solos, no ocupan agenda real y no envían WhatsApp.
- Privacidad: dirección exacta y contacto solo con la cita confirmada; código de llegada de 6 dígitos para la cita presencial.

**Consecuencias.** Sin dobles reservas aunque lleguen 20 solicitudes a la vez (prueba incluida). La confirmación se puede hacer desde el panel o con un botón de WhatsApp.
