-- Cobro solo con tarjeta, liquidación al profesional (ADR 0016) y citas subsecuentes (ADR 0017). Solo aditiva.

-- Ajustes de la plataforma editables en el CMS (comisión, días de retención, monto mínimo de liquidación).
CREATE TABLE IF NOT EXISTS platform_settings(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Libro de lo que buscaDR debe a cada profesional: una línea por cobro con tarjeta (su parte, sin la
-- comisión) y líneas de ajuste negativas si se reembolsa un cobro ya liquidado.
CREATE TABLE IF NOT EXISTS earnings(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  payment_id TEXT NOT NULL REFERENCES payments(id),
  appointment_id INTEGER REFERENCES appointments(id),
  kind TEXT NOT NULL DEFAULT 'cita' CHECK(kind IN ('cita','ajuste')),
  gross_cents INTEGER NOT NULL,
  fee_cents INTEGER NOT NULL,
  net_cents INTEGER NOT NULL,
  fee_bps INTEGER NOT NULL DEFAULT 0,
  -- retenido: cita aún no realizada · disponible: liquidable desde available_ms · liquidando: en una
  -- liquidación pendiente · pagado: transferido · anulado: reembolsado antes de liquidarse.
  status TEXT NOT NULL DEFAULT 'retenido' CHECK(status IN ('retenido','disponible','liquidando','pagado','anulado')),
  available_ms INTEGER,
  payout_id INTEGER REFERENCES payouts(id),
  -- Cobro del modo de prueba (sandbox): se liquida aparte y nunca mueve dinero real.
  test INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(payment_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_earnings_practitioner ON earnings(practitioner_id, status, available_ms);
CREATE INDEX IF NOT EXISTS idx_earnings_appointment ON earnings(appointment_id);
CREATE INDEX IF NOT EXISTS idx_earnings_payout ON earnings(payout_id);

-- Liquidaciones: transferencia de buscaDR a la cuenta del profesional, con la cuenta usada (cifrada).
CREATE TABLE IF NOT EXISTS payouts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  amount_cents INTEGER NOT NULL DEFAULT 0,
  lines INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK(status IN ('pendiente','pagada','anulada')),
  test INTEGER NOT NULL DEFAULT 0,
  account_hint TEXT NOT NULL DEFAULT '',
  account_enc TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  paid_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payouts_practitioner ON payouts(practitioner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status, created_at);

-- Cuenta bancaria del profesional para recibir liquidaciones: cifrada (BUSCADR_SECRETS_KEY) + resumen enmascarado.
ALTER TABLE practitioners ADD COLUMN payout_account_enc TEXT NOT NULL DEFAULT '';
ALTER TABLE practitioners ADD COLUMN payout_account_hint TEXT NOT NULL DEFAULT '';

-- Cobros con tarjeta ya aprobados antes de esta versión: entran al libro (sin perfiles de muestra).
INSERT OR IGNORE INTO earnings(practitioner_id,payment_id,appointment_id,kind,gross_cents,fee_cents,net_cents,fee_bps,status,available_ms,test)
SELECT pay.practitioner_id, pay.id, pay.appointment_id, 'cita', pay.amount_cents, pay.fee_cents, pay.net_cents,
       CASE WHEN pay.amount_cents>0 THEN pay.fee_cents*10000/pay.amount_cents ELSE 0 END,
       CASE WHEN a.status IN ('completada','no_asistio') THEN 'disponible' ELSE 'retenido' END,
       CASE WHEN a.status IN ('completada','no_asistio') THEN CAST(strftime('%s','now') AS INTEGER)*1000 ELSE NULL END,
       CASE WHEN COALESCE(NULLIF(pay.gateway,''),pay.provider)='sandbox' THEN 1 ELSE 0 END
FROM payments pay JOIN appointments a ON a.id=pay.appointment_id JOIN practitioners p ON p.id=pay.practitioner_id
WHERE pay.kind='cita' AND pay.status='aprobado' AND COALESCE(NULLIF(pay.gateway,''),pay.provider) IN ('sandbox','payphone') AND p.demo=0;

-- Citas subsecuentes: serie programada por el profesional y aceptada por el paciente.
CREATE TABLE IF NOT EXISTS followup_plans(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  practitioner_id INTEGER NOT NULL REFERENCES practitioners(id),
  patient_id TEXT NOT NULL REFERENCES users(id),
  patient_name TEXT NOT NULL DEFAULT '',
  -- Título y nota: solo para las dos partes (como el motivo de consulta); nunca en WhatsApp ni correo.
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  modality TEXT NOT NULL CHECK(modality IN ('presencial','virtual')),
  interval_days INTEGER NOT NULL CHECK(interval_days BETWEEN 1 AND 180),
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK(price_cents >= 0),
  status TEXT NOT NULL DEFAULT 'propuesta' CHECK(status IN ('propuesta','activa','rechazada','cancelada','vencida')),
  expires_ms INTEGER NOT NULL,
  source_appointment_id INTEGER REFERENCES appointments(id),
  created_by TEXT NOT NULL,
  cancel_reason TEXT NOT NULL DEFAULT '',
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_followup_plans_practitioner ON followup_plans(practitioner_id, status);
CREATE INDEX IF NOT EXISTS idx_followup_plans_patient ON followup_plans(patient_id, status);
CREATE TABLE IF NOT EXISTS followup_sessions(
  plan_id INTEGER NOT NULL REFERENCES followup_plans(id),
  seq INTEGER NOT NULL,
  start_ms INTEGER NOT NULL,
  appointment_id INTEGER REFERENCES appointments(id),
  -- propuesta: aún sin aceptar · agendada: cita creada · conflicto: el horario se ocupó, el
  -- profesional debe reagendarla · omitida: la serie terminó antes (rechazo o cancelación).
  status TEXT NOT NULL DEFAULT 'propuesta' CHECK(status IN ('propuesta','agendada','conflicto','omitida')),
  PRIMARY KEY(plan_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_followup_sessions_appointment ON followup_sessions(appointment_id);
