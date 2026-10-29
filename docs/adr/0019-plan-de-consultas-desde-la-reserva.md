# ADR 0019 — Plan de consultas programadas desde la reserva

**Estado:** aceptada (29-oct-2026). Complementa la ADR 0017 (series propuestas por el profesional).

**Contexto.** Muchos pacientes de pediatría, cardiología, oftalmología, nefrología, neurología y medicina interna necesitan controles periódicos y quieren programarlos al reservar, como la recurrencia de YANK («¿Con qué frecuencia?»).

**Decisión.**
- **En «Agenda tu cita»**, después de Presencial/Virtual, el paciente elige *Cita única* o *Plan de consultas*. Para el plan puede usar una plantilla de la especialidad (`server/lib/plan-templates.ts`: tres para pediatría, cardiología, oftalmología, neurología y medicina interna, y dos para nefrología; dos genéricas para el resto) o **armar su plan**: frecuencia semanal, quincenal, mensual, bimestral, trimestral o semestral, y de 2 a 12 consultas. Las plantillas son sugerencias de agenda, no indicaciones médicas, y la interfaz dice que el profesional acepta o ajusta el plan. No se ofrece en perfiles de muestra.
- **Fechas.** La primera consulta es el horario elegido. Las siguientes caen el mismo día de la semana y a la misma hora, en semanas completas (mensual = 4 semanas, trimestral = 13, semestral = 26).
- **Datos.** `followup_plans.requested_by='patient'` y `template`, sesión 1 enlazada a la cita reservada y el resto propuestas (migración aditiva `0009`). El paciente paga con tarjeta solo la primera consulta al reservar.
- **El profesional responde** en Panel → Subsecuentes → «Propuestas y solicitudes». Puede aceptar solo cuando la primera consulta esté pagada. Al **aceptar**, se agendan las demás como citas confirmadas con pago con tarjeta hasta 24 h antes (ADR 0017); los horarios ocupados quedan «por reagendar» y la primera consulta se confirma si seguía pendiente. Si **rechaza**, la primera cita se mantiene. La solicitud vence 24 h antes de la segunda consulta (máximo 7 días). El paciente puede retirarla. Si la primera cita se rechaza, se cancela o vence, el plan se cancela.
- **Privacidad.** El nombre del plan puede revelar información de salud: solo lo ven las dos partes y no aparece en los avisos.

**Consecuencias.** El paciente programa sus controles en un solo paso y el profesional mantiene el control de su agenda y de la indicación clínica. Las plantillas se editan en código; editarlas desde el CMS queda pendiente.
