-- buscaDR · Migración 0001: cuentas, sesiones, consentimientos, límites y avisos.
-- Solo aditiva. Tiempos de sesión en milisegundos UTC; registros de auditoría en texto UTC.
-- `role`: patient (paciente) o pro (médico, especialista, clínica o servicio médico).
-- La administración se marca aparte con `staff_role='admin'` (solo la cuenta del propietario).
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'Guayaquil',
  role TEXT NOT NULL CHECK(role IN ('patient','pro')),
  password_salt TEXT,
  password_hash TEXT,
  google_sub TEXT UNIQUE,
  provider TEXT NOT NULL CHECK(provider IN ('password','google')),
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  whatsapp_opt_in INTEGER NOT NULL DEFAULT 0,
  email_opt_in INTEGER NOT NULL DEFAULT 1,
  staff_role TEXT NOT NULL DEFAULT '',
  demo INTEGER NOT NULL DEFAULT 0,
  sector TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT '',
  referral_code TEXT,
  referred_by TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral ON users(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS auth_attempts (
  bucket TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits(
  key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS consent_records(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  value INTEGER NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_consent_user ON consent_records(user_id);
CREATE TABLE IF NOT EXISTS product_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  user_id TEXT,
  appointment_id INTEGER,
  practitioner_id INTEGER,
  props TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_events_name ON product_events(name, created_at);
-- Registro de cada aviso externo (WhatsApp o correo), enviado o no, sin contenido clínico.
CREATE TABLE IF NOT EXISTS notification_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  channel TEXT NOT NULL,
  template TEXT NOT NULL,
  status TEXT NOT NULL,
  ref TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notification_log_created ON notification_log(created_at);
-- Avisos dentro de la app (campana): confirmaciones, cambios y recordatorios de citas.
CREATE TABLE IF NOT EXISTS notifications(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, id);
CREATE TABLE IF NOT EXISTS whatsapp_inbound(
  wa_message_id TEXT PRIMARY KEY,
  from_phone TEXT NOT NULL,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Recuperación de la contraseña del propietario del CMS: solo el SHA-256 del token, 30 minutos.
CREATE TABLE IF NOT EXISTS owner_resets (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  ip TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_owner_resets_expires ON owner_resets(expires_at);
CREATE TABLE IF NOT EXISTS demand_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL DEFAULT '',
  specialty TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  results INTEGER NOT NULL,
  user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_demand_created ON demand_log(created_at);
