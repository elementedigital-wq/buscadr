# Operación de D1 (`buscadr-db`)

Las migraciones de `migrations/` se aplican **solas** en el primer request tras cada despliegue (`server/db/migrate.ts`), una por request y en transacción. La tabla `d1_migrations` es la misma que usa `wrangler d1 migrations`.

| Migración | Contenido |
|---|---|
| `0001_cuentas.sql` | Usuarios (paciente/profesional), sesiones, límites, consentimientos, eventos, avisos, WhatsApp entrante, recuperación del propietario, demanda |
| `0002_directorio.sql` | Profesionales (tipo, especialidad, tarifas presencial/virtual, agenda, verificación, plan), reglas de disponibilidad, bloqueos, favoritos |
| `0003_citas_y_pagos.sql` | Citas, historial de cada cita, mensajes, opiniones, pagos, eventos de pago, suscripciones |
| `0004_cms_media.sql` | CMS (sitio, versiones, auditoría, permisos, moderación) y medios |
| `0005_perfiles_muestra.sql` | 12 perfiles de muestra con horarios (marcados `demo=1`, sin registro profesional ni opiniones) |
| `0006_pasarelas.sql` | Pasarelas de pago configurables (`payment_gateways`) y `payments.gateway` |
| `0008_liquidaciones_subsecuentes.sql` | Comisión editable, libro de liquidación (`earnings`, `payouts`), cuenta cifrada del profesional y citas subsecuentes (`followup_plans`, `followup_sessions`) |
| `0007_trazabilidad.sql` | Trazabilidad: `care_stages`, `stage_ratings`, `appointments.trace_token`, `practitioners.reception_token` |

## Escribir una migración

1. `migrations/000N_descripcion.sql` (el número define el orden).
2. Solo aditiva: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN`, `CREATE INDEX IF NOT EXISTS`, `INSERT`/`UPDATE` acotados. Prohibido `DROP`, `DELETE` masivo, renombrar o cambiar tipos.
3. Máximo 45 sentencias por archivo.
4. `npm test` aplica todas las migraciones sobre una D1 real de workerd.

## Si una migración falla

No se aplica nada. La API responde `MIGRATION_FAILED` y la web una página de mantenimiento hasta publicar una corrección. Los logs del Worker muestran `buscadr_migration_failed`.

## Recuperación

```bash
npx wrangler d1 time-travel info buscadr-db
npx wrangler d1 time-travel restore buscadr-db --timestamp=2026-10-28T12:00:00Z   # devuelve TODA la base a ese momento
npx wrangler d1 export buscadr-db --remote --output=respaldo.sql                  # copia puntual
```

Si el propietario pierde el acceso a su correo, este comando vuelve a habilitar el secreto `BUSCADR_ADMIN_PASSWORD` como contraseña:

```bash
npx wrangler d1 execute buscadr-db --remote --command "UPDATE users SET password_hash='cloudflare-admin-only:v1' WHERE staff_role='admin'"
```

## Mantenimiento automático (cada 30 min, `server/cron.ts`)

Vence solicitudes sin respuesta y pagos pendientes (liberando el horario), vence planes, envía recordatorios 24 h y 1 h antes de cada cita (una vez) y elimina sesiones vencidas, contadores de intentos y registros antiguos.
