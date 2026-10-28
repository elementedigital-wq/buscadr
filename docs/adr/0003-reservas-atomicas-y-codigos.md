# ADR 0003 — Reservas: inserción condicional atómica, retención y códigos de entrega

**Estado:** aceptada (26-oct-2026)

**Decisión.** Sin restricciones de exclusión en SQLite, la reserva se crea con un único `INSERT … SELECT … WHERE NOT EXISTS(solape) AND NOT EXISTS(bloqueo)`; D1 serializa las escrituras, por lo que dos solicitudes simultáneas no pueden ganar ambas. El rango ocupado incluye el margen del propietario. Idempotencia por `(renter_id, idempotency_key)`. Las solicitudes retienen 24 h y vencen por cron. La entrega y la devolución se confirman con códigos de 6 dígitos cruzados (cada parte muestra uno y la otra lo ingresa), con checklist y fotos.

**Consecuencias.** Sin doble reserva ni estados ambiguos; evidencia para mediar incidencias. Las reservas de anuncios de muestra no ocupan calendario para que cualquiera pruebe el flujo.
