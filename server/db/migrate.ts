import { splitSqlStatements } from "./sql-split";

/**
 * Migraciones automáticas al desplegar (ADR 0006). Los archivos de `migrations/` se incluyen en
 * el bundle y se aplican en el primer request tras un despliegue, registrándose en la misma
 * tabla `d1_migrations` que usa `wrangler d1 migrations`, por lo que ambos métodos son compatibles.
 *
 * - Cada migración se aplica en un `batch` de D1 (transacción): o se aplica completa o nada.
 * - Se aplica como máximo UNA migración por invocación, para respetar el límite de consultas por
 *   invocación de D1 (50 en el plan gratuito). Las migraciones deben tener menos de 45 sentencias.
 * - Si dos instancias compiten, la segunda falla dentro de su transacción, se revierte y vuelve
 *   a leer el estado.
 * - Las migraciones deben ser SOLO ADITIVAS (CLAUDE.md): no hay respaldo manual previo.
 */
const files = import.meta.glob("../../migrations/*.sql", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export const MIGRATIONS = Object.entries(files)
  .map(([path, sql]) => ({ name: path.split("/").pop()!, statements: splitSqlStatements(sql) }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const MAX_STATEMENTS_PER_MIGRATION = 45;

let upToDate = false;

export type MigrationResult = { appliedNow: string | null; pending: string[] };

export async function ensureMigrations(db: D1Database): Promise<MigrationResult> {
  if (upToDate) return { appliedNow: null, pending: [] };
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)",
    )
    .run();
  const readApplied = async () => new Set((await db.prepare("SELECT name FROM d1_migrations").all<{ name: string }>()).results.map((r) => r.name));
  let applied = await readApplied();
  let pending = MIGRATIONS.filter((m) => !applied.has(m.name));
  if (!pending.length) {
    upToDate = true;
    return { appliedNow: null, pending: [] };
  }
  const next = pending[0];
  try {
    await db.batch([...next.statements.map((s) => db.prepare(s)), db.prepare("INSERT INTO d1_migrations(name) VALUES(?)").bind(next.name)]);
    console.log(JSON.stringify({ event: "buscadr_migration_applied", name: next.name, statements: next.statements.length }));
  } catch (error) {
    applied = await readApplied();
    if (!applied.has(next.name)) {
      console.error(JSON.stringify({ event: "buscadr_migration_failed", name: next.name, error: String(error) }));
      throw error;
    }
  }
  applied = await readApplied();
  pending = MIGRATIONS.filter((m) => !applied.has(m.name));
  if (!pending.length) upToDate = true;
  return { appliedNow: next.name, pending: pending.map((m) => m.name) };
}

/** Solo para pruebas: olvida el estado memorizado de esta instancia. */
export const resetMigrationStateForTests = () => {
  upToDate = false;
};
