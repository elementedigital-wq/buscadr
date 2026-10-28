/** Verifica que wrangler.jsonc (despliegue) y wrangler.app.jsonc (fuente) declaren lo mismo. */
import { readFileSync } from "node:fs";

const parse = (file) => JSON.parse(readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gm, ""));
const deploy = parse("wrangler.jsonc");
const app = parse("wrangler.app.jsonc");
const keys = ["name", "compatibility_date", "keep_vars", "workers_dev", "vars", "d1_databases", "r2_buckets", "triggers", "observability"];
const diffs = keys.filter((k) => JSON.stringify(deploy[k] ?? null) !== JSON.stringify(app[k] ?? null));
if (diffs.length) {
  console.error(`wrangler.jsonc y wrangler.app.jsonc difieren en: ${diffs.join(", ")}`);
  process.exit(1);
}
console.log("Configuraciones de Wrangler sincronizadas (buscaDR)");
