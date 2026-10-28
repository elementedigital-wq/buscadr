# Operación de D1 (`buscadr-db`)

Las migraciones de `migrations/` se aplican **solas** en el primer request tras cada despliegue (`server/db/migrate.ts`), una por request y en transacción. La tabla `d1_migrations` es la misma que usa `wrangler d1 migrations`.

## Escribir una migración

1. `migrations/000N_descripcion.sql` (el número define el orden).
2. Solo aditiva: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN`, `CREATE INDEX IF NOT EXISTS`, `INSERT`/`UPDATE` acotados. Prohibido `DROP`, `DELETE` masivo, renombrar o cambiar tipos.
3. Máximo 45 sentencias por archivo.
4. `npm test` aplica todas las migraciones sobre una D1 real de workerd.

`0001_baseline.sql` reproduce exactamente el esquema de la v0.3 con `IF NOT EXISTS`: en producción no cambia nada y en una base nueva crea lo mismo.

## Si una migración falla

No se aplica nada. La API responde `MIGRATION_FAILED` y la web una página de mantenimiento hasta publicar una corrección. Los logs del Worker muestran `buscadr_migration_failed`.

## Recuperación

```bash
npx wrangler d1 time-travel info buscadr-db
npx wrangler d1 time-travel restore buscadr-db --timestamp=2026-10-26T12:00:00Z   # devuelve TODA la base a ese momento
npx wrangler d1 export buscadr-db --remote --output=respaldo.sql                  # copia puntual
```

## Mantenimiento automático (cada 30 min, `server/cron.ts`)

Vence solicitudes sin respuesta, cierra devoluciones sin incidencias a las 48 h, envía recordatorios de retiro (una vez) y elimina sesiones vencidas, contadores de intentos y registros de límites antiguos.
