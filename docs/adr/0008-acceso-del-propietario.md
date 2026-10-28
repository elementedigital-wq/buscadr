# ADR 0008 — Acceso del propietario: contraseña propia en D1 y recuperación por correo

**Estado:** aceptada (26-oct-2026). Reemplaza la parte de acceso de la ADR 0006.

**Contexto.** El acceso al CMS dependía solo de secretos de Cloudflare: cambiar la contraseña exigía entrar al panel de Cloudflare y no había recuperación. El propietario pidió poder cambiarla y recuperarla por correo, y que el acceso sea exclusivo de su correo.

**Decisión.** El correo del propietario es `elemente.digital@gmail.com` (o `BUSCADR_ADMIN_EMAIL`). La contraseña inicial es el secreto `BUSCADR_ADMIN_PASSWORD`; al cambiarla desde el CMS se guarda como hash PBKDF2 en D1 y el secreto deja de valer. La recuperación envía (con Resend, opcional) un enlace de un solo uso de 30 minutos; en D1 solo se guarda el SHA-256 del token. Las respuestas no revelan si un correo existe y hay límites de intentos. El correo del propietario no puede registrarse ni usar Google. Ninguna contraseña se guarda en el repositorio.

**Consecuencias.** El propietario gestiona su acceso sin tocar Cloudflare. Si pierde el correo, un comando de D1 devuelve el control al secreto inicial (`docs/CMS_MAESTRO.md`). Sigue recomendado Cloudflare Access con MFA antes de abrir al público.
