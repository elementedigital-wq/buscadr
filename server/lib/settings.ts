/**
 * Ajustes de cobro de la plataforma editables en el CMS (ADR 0016): comisión de buscaDR, días de
 * retención antes de liquidar y monto mínimo de una liquidación. Sin fila en D1 se usan los valores
 * predeterminados (la comisión cae en BUSCADR_FEE_BPS, 8 %).
 */
import type { Env } from "../env";
import { feeBps } from "./pricing";

export type PayoutSettings = {
  /** Comisión de buscaDR en puntos básicos (800 = 8 %). El profesional recibe el resto. */
  fee_bps: number;
  /** Días que espera un cobro tras la cita (completada o no asistió) antes de poder liquidarse. */
  release_days: number;
  /** Monto mínimo para generar una liquidación. */
  min_payout_cents: number;
};

export const SETTING_LIMITS = {
  fee_bps: { min: 0, max: 3000 },
  release_days: { min: 0, max: 30 },
  min_payout_cents: { min: 0, max: 100_000 },
} as const;

const KEYS = Object.keys(SETTING_LIMITS) as (keyof PayoutSettings)[];

export const defaultSettings = (env: Env): PayoutSettings => ({ fee_bps: feeBps(env), release_days: 2, min_payout_cents: 1000 });

export async function getPayoutSettings(env: Env): Promise<PayoutSettings> {
  const out = defaultSettings(env);
  const rows = await env.DB.prepare(`SELECT key,value FROM platform_settings WHERE key IN (${KEYS.map(() => "?").join(",")})`)
    .bind(...KEYS)
    .all<{ key: keyof PayoutSettings; value: string }>()
    .then((r) => r.results)
    .catch(() => []);
  for (const r of rows) {
    const n = Number(r.value);
    const lim = SETTING_LIMITS[r.key];
    if (lim && Number.isInteger(n) && n >= lim.min && n <= lim.max) out[r.key] = n;
  }
  return out;
}

/** Guarda solo los valores válidos; devuelve el error del primero fuera de rango. */
export async function savePayoutSettings(env: Env, actor: string, input: Partial<Record<keyof PayoutSettings, unknown>>) {
  const writes: D1PreparedStatement[] = [];
  for (const k of KEYS) {
    if (input[k] === undefined) continue;
    const n = Number(input[k]);
    const lim = SETTING_LIMITS[k];
    if (!Number.isInteger(n) || n < lim.min || n > lim.max) return { error: k };
    writes.push(
      env.DB.prepare(
        "INSERT INTO platform_settings(key,value,updated_by,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP",
      ).bind(k, String(n), actor),
    );
  }
  if (writes.length) await env.DB.batch(writes);
  return { error: null };
}
