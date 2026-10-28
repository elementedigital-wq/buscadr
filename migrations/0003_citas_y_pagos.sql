-- buscaDR · Migración 0003: citas (presenciales y virtuales), bitácora, mensajes, reseñas,
-- pagos registrados en la app (buscaDR Pay) y suscripciones de profesionales.
-- En D1 no existe EXCLUDE GiST: la ausencia de solapes se garantiza con una inserción condicional
-- atómica (server/lib/appointments.ts) y se verifica en las pruebas de concurrencia.
CREATE TABLE IF NOT EXISTS appointments(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  patient_id TEXT NOT NULL REFERENCES users(id),
  pro_user_id TEXT NOT NULL REFERENCES users(id),
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  block_until_ms INTEGER NOT NULL,
  modality TEXT NOT NULL CHECK(modality IN ('presencial','virtual')),
  status TEXT NOT NULL DEFAULT 'solicitada' CHECK(status IN ('solicitada','confirmada','completada','cancelada','rechazada','expirada','no_asistio')),
  hold_expires_ms INTEGER,
  idempotency_key TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  fee_cents INTEGER NOT NULL DEFAULT 0,
  net_cents INTEGER NOT NULL DEFAULT 0,
  payment_mode TEXT NOT NULL DEFAULT 'consultorio' CHECK(payment_mode IN ('consultorio','en_linea')),
  payment_status TEXT NOT NULL DEFAULT 'no_requerido' CHECK(payment_status IN ('no_requerido','pendiente','pagado','reembolsado','fallido')),
  reason TEXT NOT NULL DEFAULT '',
  patient_name TEXT NOT NULL DEFAULT '',
  video_room TEXT NOT NULL DEFAULT '',
  checkin_code TEXT NOT NULL,
  cancel_reason TEXT NOT NULL DEFAULT '',
  rescheduled_from INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TEXT,
  completed_at TEXT,
  UNIQUE(patient_id, idempotency_key),
  CHECK(end_ms > start_ms)
);
CREATE INDEX IF NOT EXISTS idx_appointments_practitioner ON appointments(practitioner_id, status, start_ms, block_until_ms);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id, start_ms);
CREATE INDEX IF NOT EXISTS idx_appointments_pro ON appointments(pro_user_id, start_ms);
CREATE TABLE IF NOT EXISTS appointment_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  actor_id TEXT,
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_appointment_events ON appointment_events(appointment_id, id);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  body TEXT NOT NULL,
  masked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_messages_appointment ON messages(appointment_id, id);
-- Opiniones verificadas: solo tras una cita completada, una por cita.
CREATE TABLE IF NOT EXISTS reviews(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL UNIQUE REFERENCES appointments(id),
  practitioner_id INTEGER NOT NULL,
  author_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  body TEXT NOT NULL DEFAULT '',
  reply TEXT NOT NULL DEFAULT '',
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reviews_practitioner ON reviews(practitioner_id, hidden);
-- buscaDR Pay: cada transacción queda registrada aquí, con cualquier proveedor (Payphone, sandbox
-- o pago en consultorio registrado por el profesional). El estado «aprobado» solo lo fija el servidor
-- tras confirmar con el proveedor; nunca un parámetro del navegador.
CREATE TABLE IF NOT EXISTS payments(
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('cita','plan')),
  appointment_id INTEGER REFERENCES appointments(id),
  plan TEXT,
  payer_id TEXT NOT NULL REFERENCES users(id),
  practitioner_id INTEGER REFERENCES practitioners(id),
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  fee_cents INTEGER NOT NULL DEFAULT 0,
  net_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  provider TEXT NOT NULL CHECK(provider IN ('sandbox','payphone','consultorio')),
  provider_ref TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'creado' CHECK(status IN ('creado','pendiente','aprobado','rechazado','cancelado','reembolsado')),
  method TEXT NOT NULL DEFAULT '',
  card_brand TEXT NOT NULL DEFAULT '',
  card_last4 TEXT NOT NULL DEFAULT '',
  authorization_code TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT,
  refunded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_payments_appointment ON payments(appointment_id);
CREATE INDEX IF NOT EXISTS idx_payments_payer ON payments(payer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_practitioner ON payments(practitioner_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status, created_at);
CREATE TABLE IF NOT EXISTS payment_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payment_events ON payment_events(payment_id, id);
CREATE TABLE IF NOT EXISTS subscriptions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  plan TEXT NOT NULL CHECK(plan IN ('agenda','pro','growth','clinic')),
  status TEXT NOT NULL DEFAULT 'activa' CHECK(status IN ('activa','vencida','cancelada')),
  amount_cents INTEGER NOT NULL,
  period_start_ms INTEGER NOT NULL,
  period_end_ms INTEGER NOT NULL,
  payment_id TEXT REFERENCES payments(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_practitioner ON subscriptions(practitioner_id, period_end_ms);
