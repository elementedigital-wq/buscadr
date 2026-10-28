/**
 * Disponibilidad (Documento Maestro §5.2 y Estructura §F): horario semanal recurrente por modalidad,
 * duración de la consulta, margen entre citas, anticipación mínima y bloqueos, que siempre prevalecen.
 * La disponibilidad calculada es orientativa: la reserva se valida otra vez de forma atómica.
 */
import { DAY, MINUTE, addDays, localMidnight, localWeekday } from "./time";

export type Modality = "presencial" | "virtual";
export type Rule = { weekday: number; start_min: number; end_min: number; modality: "ambas" | Modality };
export type Interval = { start_ms: number; end_ms: number };
export type SlotSettings = {
  slot_minutes: number;
  buffer_minutes: number;
  min_notice_hours: number;
  in_person_enabled: number | boolean;
  virtual_enabled: number | boolean;
};
export type Slot = { start_ms: number; end_ms: number; modalities: Modality[] };

/** Máximo de días hacia adelante que se ofrecen para reservar. */
export const BOOKING_WINDOW_DAYS = 60;

const overlaps = (a: Interval, b: Interval) => a.start_ms < b.end_ms && b.start_ms < a.end_ms;

export function modalitiesFor(rule: Rule, s: SlotSettings): Modality[] {
  const out: Modality[] = [];
  if (s.in_person_enabled && (rule.modality === "ambas" || rule.modality === "presencial")) out.push("presencial");
  if (s.virtual_enabled && (rule.modality === "ambas" || rule.modality === "virtual")) out.push("virtual");
  return out;
}

/** Horarios libres de un día local («YYYY-MM-DD»). `busy` incluye citas activas y su margen. */
export function daySlots(date: string, rules: Rule[], settings: SlotSettings, busy: Interval[], blocks: Interval[], now = Date.now()): Slot[] {
  const midnight = localMidnight(date);
  if (!Number.isFinite(midnight)) return [];
  const weekday = localWeekday(midnight + 12 * 3_600_000);
  const step = Math.max(10, settings.slot_minutes) + Math.max(0, settings.buffer_minutes);
  const earliest = now + Math.max(0, settings.min_notice_hours) * 3_600_000;
  const byStart = new Map<number, Slot>();
  for (const rule of rules.filter((r) => r.weekday === weekday)) {
    const modalities = modalitiesFor(rule, settings);
    if (!modalities.length) continue;
    for (let m = rule.start_min; m + settings.slot_minutes <= rule.end_min; m += step) {
      const slot = { start_ms: midnight + m * MINUTE, end_ms: midnight + (m + settings.slot_minutes) * MINUTE };
      if (slot.start_ms < earliest) continue;
      const guarded = { start_ms: slot.start_ms, end_ms: slot.end_ms + settings.buffer_minutes * MINUTE };
      if (blocks.some((b) => overlaps(slot, b)) || busy.some((b) => overlaps(guarded, b) || overlaps(slot, b))) continue;
      const prev = byStart.get(slot.start_ms);
      byStart.set(slot.start_ms, prev ? { ...prev, modalities: [...new Set([...prev.modalities, ...modalities])] } : { ...slot, modalities });
    }
  }
  return [...byStart.values()].sort((a, b) => a.start_ms - b.start_ms);
}

/** Resumen de varios días (para la tira de fechas): cantidad de horarios libres por día. */
export function rangeSlots(from: string, days: number, rules: Rule[], settings: SlotSettings, busy: Interval[], blocks: Interval[], now = Date.now()) {
  const out: { date: string; slots: Slot[] }[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    out.push({ date, slots: daySlots(date, rules, settings, busy, blocks, now) });
  }
  return out;
}

/** Comprueba que un inicio concreto coincide con un horario publicado para esa modalidad. */
export function isOfferedSlot(
  startMs: number,
  modality: Modality,
  rules: Rule[],
  settings: SlotSettings,
  busy: Interval[],
  blocks: Interval[],
  now = Date.now(),
) {
  const date = new Date(startMs - 5 * 3_600_000).toISOString().slice(0, 10);
  return daySlots(date, rules, settings, busy, blocks, now).some((s) => s.start_ms === startMs && s.modalities.includes(modality));
}

/** Valida un horario semanal enviado por el profesional. */
export function validateRules(input: unknown): Rule[] | string {
  if (!Array.isArray(input)) return "Horario inválido";
  if (input.length > 60) return "Demasiados bloques de horario";
  const rules: Rule[] = [];
  for (const raw of input) {
    const r = raw as Record<string, unknown>;
    const weekday = Number(r?.weekday);
    const start = Number(r?.start_min);
    const end = Number(r?.end_min);
    const modality = ["ambas", "presencial", "virtual"].includes(String(r?.modality)) ? (String(r.modality) as Rule["modality"]) : "ambas";
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return "Día de la semana inválido";
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 1440 || end <= start) return "Cada bloque debe terminar después de empezar";
    rules.push({ weekday, start_min: start, end_min: end, modality });
  }
  for (const a of rules)
    for (const b of rules)
      if (a !== b && a.weekday === b.weekday && a.start_min < b.end_min && b.start_min < a.end_min)
        return "Hay bloques de horario que se superponen el mismo día";
  return rules;
}

export const DAY_MS = DAY;
