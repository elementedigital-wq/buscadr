# ADR 0008 — Acceso exclusivo del propietario: contraseña propia en D1 y recuperación por correo

**Estado:** aceptada (28-oct-2026)

**Decisión.** Solo `elemente.digital@gmail.com` (`server/lib/owner.ts`; `BUSCADR_ADMIN_EMAIL` solo se respeta en `test`/`development`) ve y usa `/maestro` y `/admin`. `/api/auth/me` devuelve `cms: true` únicamente para esa cuenta y la interfaz muestra los accesos solo entonces; la API lo verifica en cada llamada. La contraseña inicial es el secreto de Cloudflare `BUSCADR_ADMIN_PASSWORD`; al cambiarla desde el CMS se guarda como hash PBKDF2 en D1, el secreto deja de valer y se cierran las demás sesiones. La recuperación envía (Resend) un enlace de un solo uso de 30 minutos; en D1 solo se guarda el SHA-256 del token. Respuestas genéricas y límites de intentos. Ese correo no puede registrarse como cuenta común ni entrar con Google. **Ninguna contraseña se guarda en el repositorio.**

**Consecuencias.** El propietario gestiona su acceso sin tocar Cloudflare. Recomendado añadir Cloudflare Access con MFA para `/maestro` y `/admin` antes de abrir al público.
