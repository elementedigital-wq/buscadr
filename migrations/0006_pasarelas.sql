-- Pasarelas de pago configurables desde el CMS (ADR 0013, como «Ajustes → Pagos» de WooCommerce).
-- Solo aditiva: la columna `provider` conserva su CHECK (sandbox | payphone | consultorio = cobro
-- fuera de una pasarela); `gateway` identifica el medio concreto (p. ej. «transferencia»). Vacío en
-- pagos anteriores = mismo valor que `provider`.
ALTER TABLE payments ADD COLUMN gateway TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS payment_gateways(
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  settings_json TEXT NOT NULL DEFAULT '{}',
  -- Credenciales cifradas con AES-GCM (clave = secreto BUSCADR_SECRETS_KEY de Cloudflare). Nunca en claro.
  secrets_enc TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO payment_gateways(id,enabled,sort) VALUES('sandbox',1,0);
INSERT OR IGNORE INTO payment_gateways(id,enabled,sort) VALUES('payphone',0,1);
INSERT OR IGNORE INTO payment_gateways(id,enabled,sort) VALUES('transferencia',0,2);
INSERT OR IGNORE INTO payment_gateways(id,enabled,sort) VALUES('consultorio',1,3);
CREATE INDEX IF NOT EXISTS idx_payments_gateway ON payments(gateway, status);
