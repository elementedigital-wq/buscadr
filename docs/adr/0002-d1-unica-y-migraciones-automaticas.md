# ADR 0002 — Una base D1 y migraciones aditivas automáticas

**Estado:** aceptada (28-oct-2026)

**Contexto.** El despliegue debe funcionar sin pasos manuales y sin riesgo para los datos existentes.

**Decisión.** Una D1 (`DB` → `buscadr-db`). Las migraciones de `migrations/` son **aditivas** (nunca `DROP`, borrados masivos, renombres ni cambios de tipo), de ≤ 45 sentencias, y se aplican solas en el primer request (`server/db/migrate.ts`). Los datos de muestra se insertan con `INSERT … SELECT … WHERE NOT EXISTS` para ser idempotentes. R2 (`MEDIA`) es opcional: sin él, imágenes y fuentes se guardan en D1 por bloques.

**Consecuencias.** Un deploy basta para actualizar el esquema. Corregir un error exige una migración nueva, nunca editar una aplicada (`docs/OPERACION_D1.md`).
