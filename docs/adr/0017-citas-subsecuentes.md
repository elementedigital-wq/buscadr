# ADR 0017 — Citas subsecuentes (agenda programada de seguimiento)

**Estado:** aceptada (28-oct-2026)

**Contexto.** Los pacientes con control prenatal, enfermedades crónicas, terapias o curaciones necesitan una agenda especial: varias citas con una frecuencia fija, con el mismo profesional.

**Decisión.**
- **Series (`followup_plans` + `followup_sessions`).** El profesional las crea en Panel → Subsecuentes (o desde una cita confirmada o atendida, con «Programar subsecuentes»). Solo puede hacerlo para pacientes con cita confirmada o atendida en el último año. Cada serie tiene un nombre, una nota privada, modalidad, frecuencia (1–180 días), de 2 a 24 sesiones, un máximo de 18 meses y una tarifa por sesión (puede ser $0).
- **Revisión de la agenda antes de enviar.** Cada fecha se marca como pasada, ocupada, bloqueada o repetida (estas impiden enviar) o como fuera del horario habitual (solo un aviso). El profesional puede ajustar cada fecha y volver a revisar.
- **Consentimiento del paciente.** La propuesta vence en 72 h, o 2 h antes de la primera sesión. Al aceptar, cada sesión se convierte en una cita **confirmada** mediante la misma inserción atómica de siempre, sin solapes. Si un horario se ocupó mientras tanto, la sesión queda «por reagendar» y el profesional elige otra fecha. Rechazar avisa al profesional.
- **Pago por sesión con tarjeta.** Las sesiones con tarifa quedan con pago pendiente hasta 24 h antes (`hold_expires_ms`). El aviso de pago llega 48 h antes del plazo. Una sesión no pagada a tiempo se libera sola (cron) y se avisa a ambas partes. La comisión y la liquidación siguen la ADR 0016.
- **Cancelación.** El profesional cancela lo que falta y se reembolsa todo lo pagado. El paciente cancela en bloque las sesiones que empiezan en más de 4 h, con reembolso. Las de las próximas 4 h se cancelan una a una, con la política normal.
- **Privacidad.** El nombre y la nota de la serie son datos de salud: solo los ven las dos partes. Los avisos solo dicen «citas de seguimiento», el número de citas y la fecha.
- **Seguimiento.** El panel muestra series en curso, pacientes en seguimiento, sesiones en los próximos 30 días (con las no pagadas), asistencia (atendidas sobre sesiones ocurridas) y la próxima sesión. Cada cita lleva su referencia «Seguimiento n de N».

**Consecuencias.** Las series reutilizan el motor de citas: trazabilidad por QR, recordatorios, chat, videoconsulta y reprogramación. Agregar sesiones a una serie ya aceptada no está implementado: se crea una serie nueva.
