-- buscaDR · Migración 0002: directorio de profesionales, agenda semanal, bloqueos, favoritos.
-- Importes en centavos de USD. Cada perfil profesional (médico, especialista, clínica o servicio
-- médico) pertenece a una cuenta `pro` y tiene su propia agenda y tarifas presencial/virtual.
-- La verificación (credenciales revisadas a mano por buscaDR) es independiente del plan pagado.
CREATE TABLE IF NOT EXISTS practitioners(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'medico' CHECK(kind IN ('medico','especialista','clinica','servicio')),
  title TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  subspecialty TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  years_experience INTEGER NOT NULL DEFAULT 0,
  languages TEXT NOT NULL DEFAULT 'Español',
  services TEXT NOT NULL DEFAULT '[]',
  insurances TEXT NOT NULL DEFAULT '',
  license_number TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL,
  sector TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  lat REAL,
  lng REAL,
  photo TEXT NOT NULL DEFAULT '',
  in_person_enabled INTEGER NOT NULL DEFAULT 1,
  virtual_enabled INTEGER NOT NULL DEFAULT 0,
  price_in_person_cents INTEGER NOT NULL DEFAULT 0,
  price_virtual_cents INTEGER NOT NULL DEFAULT 0,
  slot_minutes INTEGER NOT NULL DEFAULT 30 CHECK(slot_minutes BETWEEN 10 AND 180),
  buffer_minutes INTEGER NOT NULL DEFAULT 0 CHECK(buffer_minutes BETWEEN 0 AND 60),
  min_notice_hours INTEGER NOT NULL DEFAULT 2,
  auto_confirm INTEGER NOT NULL DEFAULT 0,
  prepay_virtual INTEGER NOT NULL DEFAULT 1,
  prepay_in_person INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','active','paused','rejected')),
  verification TEXT NOT NULL DEFAULT 'pendiente' CHECK(verification IN ('pendiente','verificado','rechazado')),
  verified_at TEXT,
  review_note TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free','agenda','pro','growth','clinic')),
  plan_until_ms INTEGER,
  demo INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_practitioners_search ON practitioners(status, specialty, city);
CREATE INDEX IF NOT EXISTS idx_practitioners_geo ON practitioners(lat, lng);
-- Horario semanal recurrente (minutos desde medianoche, hora de Ecuador). weekday: 0 = domingo.
CREATE TABLE IF NOT EXISTS availability_rules(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
  start_min INTEGER NOT NULL CHECK(start_min BETWEEN 0 AND 1439),
  end_min INTEGER NOT NULL CHECK(end_min BETWEEN 1 AND 1440),
  modality TEXT NOT NULL DEFAULT 'ambas' CHECK(modality IN ('ambas','presencial','virtual')),
  CHECK(end_min > start_min)
);
CREATE INDEX IF NOT EXISTS idx_rules_practitioner ON availability_rules(practitioner_id, weekday);
-- Excepciones: vacaciones, congresos, cierres. Siempre prevalecen sobre el horario.
CREATE TABLE IF NOT EXISTS availability_blocks(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  CHECK(end_ms > start_ms)
);
CREATE INDEX IF NOT EXISTS idx_blocks_practitioner ON availability_blocks(practitioner_id, start_ms, end_ms);
CREATE TABLE IF NOT EXISTS favorites(
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, practitioner_id)
);
