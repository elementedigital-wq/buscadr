import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Cada archivo de prueba arranca con las migraciones reales aplicadas sobre una D1 aislada.
await applyD1Migrations(env.DB, (env as unknown as { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] }).TEST_MIGRATIONS);
