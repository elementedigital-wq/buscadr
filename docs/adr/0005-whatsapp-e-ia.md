# ADR 0005 — WhatsApp Cloud API e IA opcionales

**Estado:** aceptada (26-oct-2026)

**Decisión.** WhatsApp como canal operativo, no como dependencia: avisos con consentimiento explícito, botones Aceptar/Rechazar que actúan sobre la reserva (validando firma HMAC, idempotencia y que el número sea el del propietario de esa reserva), búsqueda por chat y publicación por foto. IA (Claude) solo para sugerir categoría, título, descripción y precio desde una foto; siempre hay alternativa por reglas y la persona revisa antes de enviar. Ambos se activan con secretos de Cloudflare.

**Consecuencias.** El piloto funciona sin costos variables; al activar WhatsApp el propietario responde en un toque, que es el principal factor de conversión.
