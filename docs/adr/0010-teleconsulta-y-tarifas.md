# ADR 0010 — Citas virtuales con tarifa propia y sala de video

**Estado:** aceptada (28-oct-2026)

**Decisión.** Cada perfil activa por separado la atención presencial y la virtual, cada una con su tarifa (`price_in_person_cents`, `price_virtual_cents`) y su disponibilidad (reglas semanales `ambas | presencial | virtual`). La cita virtual se paga en línea por defecto (`prepay_virtual`) para asegurar el horario. La sala se crea al reservar (`buscaDR-<24 hex>` en Jitsi Meet, sin cuentas ni instalación) y el enlace solo se muestra a las dos partes entre 15 minutos antes y 1 hora después del inicio.

**Consecuencias.** Sin coste de video en el piloto. Para producción con volumen se recomienda una sala con autenticación (Jitsi as a Service, Daily o Whereby) detrás de la misma interfaz.
