# ADR 0009 — buscaDR Pay: pasarela propia con libro de transacciones

**Estado:** aceptada (28-oct-2026)

**Contexto.** Se pidió una pasarela de pago propia dentro de la app que registre cada transacción. buscaDR no debe tocar datos completos de tarjeta (PCI DSS) y en Ecuador el adquirente local más integrado es Payphone.

**Decisión.**
- **Libro de pagos** en D1 (`payments` + `payment_events`): cada cobro de cita o de plan, con monto, comisión, neto, proveedor, estado (`creado → pendiente → aprobado | rechazado | cancelado | reembolsado`), marca y últimos 4 dígitos. Nunca el número completo ni el CVV.
- **Proveedores** intercambiables (`server/lib/payments.ts`): `sandbox` (checkout de prueba dentro de la app, por defecto), `payphone` (botón de pago con confirmación de servidor a servidor: el monto y la referencia deben coincidir) y `consultorio` (cobro en efectivo o tarjeta en el consultorio registrado por el profesional, sin comisión).
- `settlePayment` y `refundPayment` son idempotentes: aprobar confirma o adelanta la cita; rechazar, expirar o cancelar a tiempo reembolsa.
- Comisión configurable `BUSCADR_FEE_BPS` (8 % por defecto) solo en citas pagadas en línea; el paciente paga la tarifa publicada.
- Exportación CSV para el profesional (`/panel/ingresos`) y la administración (`/admin`).

**Consecuencias.** Producción requiere `PAYPHONE_TOKEN` y `PAYPHONE_STORE_ID`, verificar los endpoints con la documentación vigente de Payphone y el visto bueno del Go/No-Go del Documento Maestro. Las liquidaciones y la facturación electrónica (SRI) quedan fuera de este alcance.
