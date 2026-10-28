# ADR 0002 — D1 única con migraciones aditivas automáticas

**Estado:** aceptada (26-oct-2026)

**Contexto.** La v0.3 separaba identidad (D1) y marketplace (PostgreSQL/PostGIS, nunca desplegado). Ejecutar SQL a mano en el panel generó errores de «tablas no listas».

**Decisión.** Todo en D1 `buscadr-db`. Migraciones en `migrations/`, estrictamente aditivas, ≤ 45 sentencias, aplicadas por el Worker en el primer request (registro en `d1_migrations`, compatible con Wrangler). Búsqueda geográfica con caja + haversine. PostGIS queda como referencia en `infrastructure/postgis/` si el volumen lo exige.

**Consecuencias.** Cero pasos manuales al desplegar; recuperación con D1 Time Travel. Límite práctico de D1 (10 GB, escrituras serializadas) suficiente para el piloto y bastante más.
