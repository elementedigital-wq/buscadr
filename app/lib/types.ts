import type { CmsConfig } from "../../server/cms/model";
import type { City, Specialty } from "../../server/lib/catalog";
import type { PublicPractitioner } from "../../server/lib/practitioners";
import type { TaxCategory, TaxSpecialty } from "../../server/lib/taxonomy";

export type Cms = CmsConfig;
export type { City, PublicPractitioner, Specialty };

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "patient" | "pro";
  city: string;
  sector: string;
  phone: string;
  whatsapp_opt_in: boolean;
  email_opt_in: boolean;
  demo: boolean;
  admin: boolean;
  /** Solo true con la cuenta del propietario (elemente.digital@gmail.com). */
  cms: boolean;
  provider: "password" | "google";
  email_verified: boolean;
  google_linked: boolean;
  referral_code: string | null;
  avatar: string;
  created: number;
};

export type Plan = { id: string; name: string; price_cents: number; unit: string; features: readonly string[]; monthly_appointments: number | null };
export type Catalog = {
  categories: TaxCategory[];
  specialties: Omit<TaxSpecialty, "keywords">[];
  cities: City[];
  plans: Plan[];
  fee_bps: number;
  payments: "sandbox" | "payphone";
  /** Medios de pago activos en el CMS (orden del CMS). */
  gateways: { id: string; kind: "online" | "manual" | "offline"; title: string; description: string }[];
};

export type Slot = { start_ms: number; end_ms: number; modalities: ("presencial" | "virtual")[] };
export type Hours = { weekday: number; start_min: number; end_min: number; modality: "ambas" | "presencial" | "virtual" };

export type ProfileData = {
  practitioner: PublicPractitioner;
  preview: boolean;
  hours: Hours[];
  favorite: boolean;
  reviews: { rating: number; body: string; reply: string; created_at: string; author: string }[];
};

export type FollowupRef = { plan_id: number; seq: number; total: number };

export type AppointmentSummary = {
  id: number;
  status: string;
  status_label: string;
  start_ms: number;
  end_ms: number;
  modality: "presencial" | "virtual";
  price_cents: number;
  net_cents: number;
  payment_mode: "consultorio" | "en_linea";
  payment_status: string;
  payment_label: string;
  hold_expires_ms: number | null;
  created_at: string;
  messages: number;
  /** Sesión de una serie de citas subsecuentes (ADR 0017). */
  followup: FollowupRef | null;
  demo: boolean;
  practitioner: { slug: string; name: string; specialty: string; photo: string; city: string; sector: string };
  patient?: { name: string };
};

export type AppointmentView = {
  id: number;
  status: string;
  status_label: string;
  viewer: "patient" | "pro" | "admin";
  demo: boolean;
  start_ms: number;
  end_ms: number;
  hold_expires_ms: number | null;
  modality: "presencial" | "virtual";
  reason: string;
  price_cents: number;
  fee_cents: number;
  net_cents: number;
  payment_mode: "consultorio" | "en_linea";
  payment_status: string;
  payment_label: string;
  created_at: string;
  confirmed_at: string | null;
  completed_at: string | null;
  cancel_reason: string;
  rescheduled_from: number | null;
  followup: FollowupRef | null;
  checkin_code: string | null;
  actions: string[];
  free_cancel_until: number;
  video: { open: boolean; url: string | null; opens_at: number } | null;
  practitioner: {
    id: number;
    slug: string;
    name: string;
    specialty: string;
    photo: string;
    city: string;
    sector: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
  };
  patient: { name: string };
  whatsapp: { support: string | null; share: string };
  ics: string;
  events: { type: string; actor: string; created_at: string }[];
  messages: { id: number; mine: boolean; author: string; body: string; masked: boolean; created_at: string }[];
  review: { rating: number; body: string; reply: string; created_at: string } | null;
  payments: {
    id: string;
    status: string;
    amount_cents: number;
    provider: string;
    card_brand: string;
    card_last4: string;
    created_at: string;
    approved_at: string | null;
    refunded_at: string | null;
  }[];
};

export type Notification = { id: number; kind: string; title: string; body: string; link: string; read_at: string | null; created_at: string };

export type TraceStage = {
  stage: "reserva" | "llegada" | "consulta" | "cierre";
  label: string;
  icon: string;
  question: string;
  tags: string[];
  status: "confirmada" | "pendiente" | "sin_registro";
  confirmed_ms: number | null;
  actor_role: "paciente" | "profesional" | "sistema" | null;
  method: "qr" | "qr_recepcion" | "manual" | "auto" | null;
  rating: { rating: number; label: string; tags: string[]; comment: string } | null;
  can_rate: boolean;
  can_confirm: boolean;
  block: string | null;
};
export type TraceView = {
  appointment_id: number;
  modality: "presencial" | "virtual";
  status: string;
  stages: TraceStage[];
  next_stage: TraceStage["stage"] | null;
  metrics: { punctuality_minutes: number | null; wait_minutes: number | null; duration_minutes: number | null; delay_minutes: number | null };
  qr: { url: string; size: number; path: string; code: string } | null;
  rating_labels: string[];
};
