-- Planes de consultas programadas solicitados por el paciente al reservar (ADR 0019). Solo aditiva.
-- requested_by: 'pro' = el profesional propone y el paciente acepta · 'patient' = el paciente lo pide
-- al reservar y el profesional lo acepta. template: plantilla elegida (vacío = plan armado a mano).
ALTER TABLE followup_plans ADD COLUMN requested_by TEXT NOT NULL DEFAULT 'pro';
ALTER TABLE followup_plans ADD COLUMN template TEXT NOT NULL DEFAULT '';
