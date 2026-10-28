# ADR 0005 — Notificaciones en tres canales y WhatsApp con botones

**Estado:** aceptada (28-oct-2026)

**Contexto.** La confirmación de citas es el momento crítico: el profesional debe enterarse al instante y el paciente necesita certeza y recordatorios.

**Decisión.** `notify()` (`server/lib/notify.ts`) siempre guarda la notificación en la app (campana) y, según el consentimiento de cada persona, la envía por **WhatsApp Cloud API** y por **correo (Resend)**. Cada envío queda en `notification_log`. Al profesional le llega cada solicitud con botones «Confirmar» / «Rechazar» (`acc:<id>` / `rej:<id>`), procesados por el webhook firmado con HMAC (`/api/whatsapp/webhook`). El paciente recibe confirmación, cambios, enlace de videoconsulta y recordatorios 24 h y 1 h antes (cron). Fuera de la ventana de 24 h de WhatsApp se necesitan plantillas aprobadas (`docs/WHATSAPP.md`). El consentimiento se registra con evidencia en `consent_records`.

**Consecuencias.** Sin secretos de Meta o Resend la app sigue funcionando con avisos en la app. La IA para publicar desde una foto (heredada de otro producto) se retiró: no aplica a datos de salud.
