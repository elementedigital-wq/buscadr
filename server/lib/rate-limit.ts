import { HttpError } from "./http";

type Rule = { limit: number; windowMs: number; blockMs: number };

export const RULES = {
  /** Inicio de sesión por IP: frena pruebas masivas contra muchas cuentas. */
  loginIp: { limit: 60, windowMs: 10 * 60_000, blockMs: 15 * 60_000 },
  /** Inicio de sesión por cuenta: 8 fallos bloquean 15 min (como el piloto) pero solo para esa IP+cuenta. */
  loginAccount: { limit: 8, windowMs: 15 * 60_000, blockMs: 15 * 60_000 },
  /** Propietario del CMS: más estricto, sin excepciones. */
  owner: { limit: 5, windowMs: 15 * 60_000, blockMs: 30 * 60_000 },
  /** Recuperación de la contraseña del propietario: por IP y en total, para no inundar su correo. */
  recover: { limit: 5, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
  recoverGlobal: { limit: 10, windowMs: 24 * 60 * 60_000, blockMs: 60 * 60_000 },
  register: { limit: 10, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
  write: { limit: 120, windowMs: 60_000, blockMs: 60_000 },
  booking: { limit: 20, windowMs: 60 * 60_000, blockMs: 30 * 60_000 },
  upload: { limit: 80, windowMs: 60 * 60_000, blockMs: 30 * 60_000 },
  /** Intentos de pago (tarjetas de prueba y confirmaciones). */
  payment: { limit: 30, windowMs: 60 * 60_000, blockMs: 30 * 60_000 },
} satisfies Record<string, Rule>;

/**
 * Ventana fija persistida en D1. Se cuenta antes de ejecutar la acción;
 * `reset` se llama tras un éxito para no penalizar a usuarios legítimos.
 */
export async function hit(db: D1Database, key: string, rule: Rule, now = Date.now()) {
  const row = await db
    .prepare("SELECT hits,window_start,blocked_until FROM rate_limits WHERE key=?")
    .bind(key)
    .first<{ hits: number; window_start: number; blocked_until: number }>();
  if (row && row.blocked_until > now) {
    throw new HttpError(429, "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.", "RATE_LIMITED");
  }
  const fresh = !row || now - row.window_start > rule.windowMs;
  const hits = fresh ? 1 : row.hits + 1;
  const blockedUntil = hits > rule.limit ? now + rule.blockMs : 0;
  await db
    .prepare(
      `INSERT INTO rate_limits(key,hits,window_start,blocked_until) VALUES(?,?,?,?)
       ON CONFLICT(key) DO UPDATE SET hits=excluded.hits,window_start=excluded.window_start,blocked_until=excluded.blocked_until`,
    )
    .bind(key, hits, fresh ? now : row.window_start, blockedUntil)
    .run();
  if (blockedUntil) throw new HttpError(429, "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.", "RATE_LIMITED");
}

export async function reset(db: D1Database, key: string) {
  await db.prepare("DELETE FROM rate_limits WHERE key=?").bind(key).run();
}
