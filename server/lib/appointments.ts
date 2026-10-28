/**
 * Motor de citas (Documento Maestro §7.2, Estructura §F).
 *
 * Estados: solicitada → confirmada → completada, con salidas a cancelada, rechazada, expirada y
 * no_asistio. Ocupan la agenda: confirmada y solicitada mientras su retención (`hold_expires_ms`)
 * no haya vencido. Cada cita bloquea además el margen entre consultas del profesional.
 *
 * En D1 no hay EXCLUDE GiST: la inserción es una sola sentencia condicional (atómica en SQLite) que
 * solo escribe si no hay solapes ni bloqueos. Lo mismo para la reprogramación.
 */
import { HOUR, MINUTE } from "./time";

export type AppointmentStatus = "solicitada" | "confirmada" | "completada" | "cancelada" | "rechazada" | "expirada" | "no_asistio";
export type PaymentStatus = "no_requerido" | "pendiente" | "pagado" | "reembolsado" | "fallido";

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  solicitada: "Por confirmar",
  confirmada: "Confirmada",
  completada: "Atendida",
  cancelada: "Cancelada",
  rechazada: "No disponible",
  expirada: "Vencida sin respuesta",
  no_asistio: "No asistió",
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  no_requerido: "Pago en el consultorio",
  pendiente: "Pago con tarjeta pendiente",
  pagado: "Pagada",
  reembolsado: "Reembolsada",
  fallido: "Pago no aprobado",
};

/** Etiqueta del pago; las citas sin tarifa no requieren pago («Sin costo»). */
export const paymentLabel = (a: { payment_status?: unknown; price_cents?: unknown }) =>
  a.payment_status === "no_requerido" && Number(a.price_cents) <= 0
    ? "Sin costo"
    : (PAYMENT_LABEL[a.payment_status as PaymentStatus] ?? String(a.payment_status));

/** El profesional tiene hasta 24 h (o hasta 1 h antes de la cita) para confirmar una solicitud. */
export const HOLD_MS = 24 * HOUR;
/** Una cita con pago previo retiene el horario 30 minutos mientras se paga. */
export const PAYMENT_HOLD_MS = 30 * MINUTE;
/** El paciente puede cancelar sin penalidad hasta 4 h antes (política del piloto, editable luego). */
export const FREE_CANCEL_MS = 4 * HOUR;

export const holdUntil = (now: number, start: number) => Math.max(now + 5 * MINUTE, Math.min(now + HOLD_MS, start - HOUR));

/**
 * Fragmento SQL: citas que ocupan la agenda de un profesional en [start, until). Parámetros:
 * practitioner, now, until, start. Las citas de prueba sobre perfiles de muestra no ocupan la agenda
 * (cada visitante puede probar el flujo completo).
 */
export const OVERLAP_SQL = `SELECT 1 FROM appointments a WHERE a.practitioner_id=? AND (a.status='confirmada' OR (a.status='solicitada' AND a.hold_expires_ms>?)) AND a.start_ms<? AND a.block_until_ms>?
  AND NOT EXISTS(SELECT 1 FROM practitioners dp WHERE dp.id=a.practitioner_id AND dp.demo=1)`;
/** Bloqueos del profesional. Parámetros: practitioner, until, start. */
export const BLOCK_SQL = "SELECT 1 FROM availability_blocks b WHERE b.practitioner_id=? AND b.start_ms<? AND b.end_ms>?";

export type Role = "patient" | "pro" | "admin";
export type Action = "confirm" | "decline" | "cancel" | "complete" | "no_show" | "reschedule" | "review" | "pay" | "mark_paid";

type Snapshot = {
  status: AppointmentStatus;
  start_ms: number;
  end_ms: number;
  hold_expires_ms: number | null;
  payment_mode: string;
  payment_status: PaymentStatus;
};

/** Acciones disponibles según estado y quién mira. En perfiles de muestra el paciente puede simular los pasos del profesional. */
export function availableActions(a: Snapshot, role: Role, opts: { demo: boolean; reviewed: boolean; now?: number }): Action[] {
  const now = opts.now ?? Date.now();
  const proSide = role === "pro" || role === "admin" || (opts.demo && role === "patient");
  const out: Action[] = [];
  const awaitingPayment = a.payment_mode === "en_linea" && (a.payment_status === "pendiente" || a.payment_status === "fallido");
  switch (a.status) {
    case "solicitada":
      if (role === "patient" && awaitingPayment) out.push("pay");
      if (proSide && (a.hold_expires_ms ?? 0) > now && !awaitingPayment) out.push("confirm");
      if (proSide && (a.hold_expires_ms ?? 0) > now) out.push("decline");
      if (role === "patient") out.push("cancel", "reschedule");
      break;
    case "confirmada":
      if (role === "patient" && awaitingPayment) out.push("pay");
      if (proSide && now >= a.start_ms - 30 * MINUTE) out.push("complete");
      if (proSide && now >= a.start_ms) out.push("no_show");
      if (proSide && a.payment_mode === "consultorio" && a.payment_status === "no_requerido") out.push("mark_paid");
      if (now < a.start_ms) {
        if (role !== "admin") out.push("cancel");
        if (role === "patient") out.push("reschedule");
      }
      break;
    case "completada":
      if (proSide && a.payment_mode === "consultorio" && a.payment_status === "no_requerido") out.push("mark_paid");
      if (!opts.reviewed && role === "patient") out.push("review");
      break;
  }
  return [...new Set(out)];
}

/** Transiciones permitidas (validación de servidor; cualquier otra combinación se rechaza). */
export const TRANSITIONS: Record<"confirm" | "decline" | "cancel" | "complete" | "no_show", { from: AppointmentStatus[]; to: AppointmentStatus }> = {
  confirm: { from: ["solicitada"], to: "confirmada" },
  decline: { from: ["solicitada"], to: "rechazada" },
  cancel: { from: ["solicitada", "confirmada"], to: "cancelada" },
  complete: { from: ["confirmada"], to: "completada" },
  no_show: { from: ["confirmada"], to: "no_asistio" },
};

/** La videollamada se habilita 15 min antes y hasta 1 h después del inicio, solo con la cita confirmada. */
export const videoOpen = (a: { status: string; modality: string; start_ms: number; end_ms: number }, now = Date.now()) =>
  a.modality === "virtual" && a.status === "confirmada" && now >= a.start_ms - 15 * MINUTE && now <= a.end_ms + HOUR;

/** Sala de videollamada (Jitsi Meet, gratuita y sin cuenta). Nombre aleatorio no adivinable. */
export function newVideoRoom() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `buscaDR-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
export const videoUrl = (room: string) => (room ? `https://meet.jit.si/${encodeURIComponent(room)}` : null);

/**
 * Oculta teléfonos, correos y enlaces de contacto en el chat (privacidad por defecto: buscaDR no
 * expone números privados de pacientes ni de profesionales, Documento Maestro §7.3).
 */
export function maskContact(text: string) {
  let masked = false;
  const out = text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, () => {
      masked = true;
      return "[correo oculto]";
    })
    .replace(/(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|t\.me)\/\S*/gi, () => {
      masked = true;
      return "[enlace oculto]";
    })
    .replace(/(?:\+?593|0)?[\s.-]?9(?:[\s.-]?\d){8}\b|\b\d(?:[\s.-]?\d){6,}\b/g, () => {
      masked = true;
      return "[teléfono oculto]";
    });
  return { text: out, masked };
}

/** Archivo iCalendar (.ics) de una cita para agregarla al calendario del teléfono. */
export function icsFor(a: { id: number; start_ms: number; end_ms: number; modality: string; title: string; location: string; url: string }) {
  const stamp = (ms: number) =>
    new Date(ms)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//buscaDR//Citas//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:cita-${a.id}@buscadr`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(a.start_ms)}`,
    `DTEND:${stamp(a.end_ms)}`,
    `SUMMARY:${esc(a.title)}`,
    `LOCATION:${esc(a.location)}`,
    `DESCRIPTION:${esc(`Cita ${a.modality} #${a.id} en buscaDR. Detalles: ${a.url}`)}`,
    `URL:${a.url}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Recordatorio de tu cita en buscaDR",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
