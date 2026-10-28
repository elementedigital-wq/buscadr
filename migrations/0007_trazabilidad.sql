-- Trazabilidad de la atención con códigos QR y satisfacción por etapa (ADR 0015). Solo aditiva.
-- Token del QR de cada cita (se crea al mostrarlo) y QR fijo de recepción de cada consultorio.
ALTER TABLE appointments ADD COLUMN trace_token TEXT NOT NULL DEFAULT '';
ALTER TABLE practitioners ADD COLUMN reception_token TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_trace_token ON appointments(trace_token) WHERE trace_token<>'';
CREATE UNIQUE INDEX IF NOT EXISTS idx_practitioners_reception_token ON practitioners(reception_token) WHERE reception_token<>'';
-- Etapas confirmadas: quién, cuándo y cómo (QR del paciente, QR de recepción, manual o automático).
CREATE TABLE IF NOT EXISTS care_stages(
  appointment_id INTEGER NOT NULL REFERENCES appointments(id),
  stage TEXT NOT NULL CHECK(stage IN ('reserva','llegada','consulta','cierre')),
  confirmed_ms INTEGER NOT NULL,
  actor_id TEXT,
  actor_role TEXT NOT NULL CHECK(actor_role IN ('paciente','profesional','sistema')),
  method TEXT NOT NULL CHECK(method IN ('qr','qr_recepcion','manual','auto')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(appointment_id, stage)
);
CREATE INDEX IF NOT EXISTS idx_care_stages_time ON care_stages(stage, confirmed_ms);
-- Satisfacción del paciente por etapa (privada: para el profesional y buscaDR, no es una opinión pública).
CREATE TABLE IF NOT EXISTS stage_ratings(
  appointment_id INTEGER NOT NULL REFERENCES appointments(id),
  stage TEXT NOT NULL CHECK(stage IN ('reserva','llegada','consulta','cierre')),
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  tags TEXT NOT NULL DEFAULT '[]',
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(appointment_id, stage)
);
CREATE INDEX IF NOT EXISTS idx_stage_ratings_practitioner ON stage_ratings(practitioner_id, created_at);
