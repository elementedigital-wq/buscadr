/** Tipos y utilidades del panel profesional. */
import type { PublicPractitioner } from "./types";

export type PrivatePractitioner = PublicPractitioner & {
  address: string;
  license_number: string;
  status: "draft" | "review" | "active" | "paused" | "rejected";
  verification: "pendiente" | "verificado" | "rechazado";
  review_note: string;
  plan: string;
  plan_until_ms: number | null;
  buffer_minutes: number;
  min_notice_hours: number;
  exact_lat: number | null;
  exact_lng: number | null;
  views: number;
};

export type Rule = { id?: number; weekday: number; start_min: number; end_min: number; modality: "ambas" | "presencial" | "virtual" };
export type Block = { id: number; start_ms: number; end_ms: number; reason: string };
export type ProMe = { practitioner: PrivatePractitioner | null; rules: Rule[]; blocks: Block[] };
