import type { CmsConfig } from "../../server/cms/model";
import type { City, Specialty } from "../../server/lib/catalog";
import type { PublicPractitioner } from "../../server/lib/practitioners";

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
  specialties: Omit<Specialty, "keywords">[];
  cities: City[];
  plans: Plan[];
  fee_bps: number;
  payments: "sandbox" | "payphone";
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
  checkin_code: string | null;
  actions: string[];
  free_cancel_until: number;
  video: { open: boolean; url: string | null; opens_at: number } | null;
  practitioner: { id: number; slug: string; name: string; specialty: string; photo: string; city: string; sector: string; address: string | null; lat: number | null; lng: number | null };
  patient: { name: string };
  whatsapp: { support: string | null; share: string };
  ics: string;
  events: { type: string; actor: string; created_at: string }[];
  messages: { id: number; mine: boolean; author: string; body: string; masked: boolean; created_at: string }[];
  review: { rating: number; body: string; reply: string; created_at: string } | null;
  payments: { id: string; status: string; amount_cents: number; provider: string; card_brand: string; card_last4: string; created_at: string; approved_at: string | null; refunded_at: string | null }[];
};

export type Notification = { id: number; kind: string; title: string; body: string; link: string; read_at: string | null; created_at: string };
