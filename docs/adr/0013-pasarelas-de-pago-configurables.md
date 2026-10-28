# ADR 0013 — Pasarelas de pago configurables desde el CMS (al estilo WooCommerce)

**Estado:** aceptada (28-oct-2026). Amplía la ADR 0009 (buscaDR Pay).

**Contexto.** El propietario pidió una ventana para agregar pasarelas de pago «como en WooCommerce». Hasta ahora el medio dependía de variables de entorno (`BUSCADR_PAYMENTS`, `PAYPHONE_*`) y no había transferencia bancaria, un medio muy usado en Ecuador.

**Decisión.**
- Pestaña **CMS → Operación → Pasarelas de pago**: lista ordenable con interruptor por medio, «Gestionar» (título y descripción para el paciente, datos y credenciales) y una sección «Próximamente» (Kushki, Datafast/Nuvei, Deuna!, PayPal) sin adaptador, que no se puede activar.
- Medios: `sandbox` (tarjeta de prueba), `payphone` (tarjetas reales), `transferencia` (a la cuenta de buscaDR, confirmada por la administración con el comprobante) y `consultorio` (pago al profesional, sin comisión). El primero activo es el predeterminado; el paciente elige en `/pagar/:id`.
- Tabla `payment_gateways` (migración `0006`, aditiva). En `payments` se agrega `gateway`; `provider` conserva su `CHECK` heredado (sandbox | payphone | consultorio = cobro fuera de una pasarela): una transferencia es `provider='consultorio'`, `gateway='transferencia'`. Comisión, reembolsos e ingresos usan `gateway` (`collectedOnline`).
- **Credenciales:** se envían una vez, se guardan cifradas con AES-GCM (clave = secreto de Cloudflare `BUSCADR_SECRETS_KEY`, 32+ caracteres) y nunca se devuelven ni se registran: el CMS muestra «••••1234» y su origen. Sin la clave, se usan los secretos de Cloudflare (`PAYPHONE_TOKEN`, `PAYPHONE_STORE_ID`).
- Activar un medio exige datos completos; los que mueven dinero real piden confirmar el Go/No-Go del Documento Maestro.
- Reglas al reservar: sin medios en línea activos, la cita se paga en el consultorio; con el pago en consultorio desactivado, se paga en línea. Una transferencia retiene el horario hasta 24 h (o 1 h antes), no 30 min.

**Consecuencias.** El propietario gestiona los cobros sin tocar código ni Cloudflare (salvo crear la clave de cifrado una vez). Agregar una pasarela nueva es un adaptador en `server/lib/payments.ts` + su definición en `server/lib/gateways.ts`.
