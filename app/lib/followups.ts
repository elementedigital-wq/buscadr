/** Tipos y textos compartidos de las citas subsecuentes (ADR 0017). */
export type FollowupSession = {
  seq: number;
  start_ms: number;
  session_status: "propuesta" | "agendada" | "conflicto" | "omitida";
  appointment_id: number | null;
  status: string | null;
  status_label: string;
  payment_label: string;
  upcoming: boolean;
  unpaid: boolean;
  pay_before_ms: number | null;
};

export type FollowupPlan = {
  id: number;
  title: string;
  note: string;
  modality: "presencial" | "virtual";
  interval_days: number;
  price_cents: number;
  total_cents: number;
  status: "propuesta" | "activa" | "finalizada" | "rechazada" | "cancelada" | "vencida";
  status_label: string;
  expires_ms: number | null;
  created_at: string;
  accepted_at: string | null;
  cancel_reason: string;
  practitioner: { name: string; slug: string; photo: string };
  patient_name: string;
  sessions: FollowupSession[];
  summary: {
    total: number;
    attended: number;
    no_show: number;
    cancelled: number;
    upcoming: number;
    unpaid: number;
    conflicts: number;
    adherence: number | null;
    next: { start_ms: number; appointment_id: number | null; unpaid: boolean } | null;
  };
  /** 'pro': propuesta por el profesional · 'patient': pedida por el paciente al reservar (ADR 0019). */
  requested_by: "pro" | "patient";
  can: { accept: boolean; decline: boolean; cancel: boolean };
};

export function frequencyLabel(days: number) {
  if (days === 7) return "Cada semana";
  if (days % 7 === 0 && days <= 28) return `Cada ${days / 7} semanas`;
  if (days === 30) return "Cada mes";
  if (days % 30 === 0) return `Cada ${days / 30} meses`;
  return days === 1 ? "Cada día" : `Cada ${days} días`;
}

export const FREQUENCIES: [number, string][] = [
  [7, "Cada semana"],
  [14, "Cada 2 semanas"],
  [21, "Cada 3 semanas"],
  [28, "Cada 4 semanas"],
  [30, "Cada mes (30 días)"],
  [60, "Cada 2 meses"],
  [90, "Cada 3 meses"],
];

/** Nombres sugeridos para la serie (el profesional puede escribir otro). */
export const SERIES_TITLES = [
  "Control mensual",
  "Control prenatal",
  "Control de niño sano",
  "Control de enfermedad crónica",
  "Terapia física",
  "Terapia de lenguaje",
  "Psicoterapia",
  "Curaciones",
  "Control de ortodoncia",
  "Control nutricional",
];
