# ADR 0004 — Búsqueda, orden de resultados y demanda no atendida

**Estado:** aceptada (28-oct-2026)

**Decisión.** El directorio filtra por especialidad, ciudad, modalidad y texto (sin acentos, con sinónimos por especialidad: «pediatra», «niños» → Pediatría). Orden por defecto «Recomendados»: destacados del CMS primero (siempre rotulados), luego perfiles reales antes que los de muestra, verificados, con horario disponible, valoración y cercanía. Otros órdenes: próximo horario, mejor valorados, menor tarifa, cercanía. Las búsquedas sin resultados se guardan en `demand_log` y aparecen en `/admin` para reclutar profesionales donde hay demanda.

**Consecuencias.** «Destacado» nunca se mezcla con la verificación ni con las opiniones, que no se pueden comprar (`docs/MARKETING_CLAIMS.md`).
