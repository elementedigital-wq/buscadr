/**
 * Trazabilidad de la atención (ADR 0015). Cada cita recorre cuatro etapas:
 *
 * 1. `reserva`  — cita confirmada (automática, a partir de `confirmed_at`).
 * 2. `llegada`  — presencial: el profesional escanea el QR del paciente o el paciente escanea el QR de
 *                 recepción del consultorio; virtual: el paciente entra a la videoconsulta.
 * 3. `consulta` — inicio de la atención (el profesional escanea de nuevo el QR o la inicia).
 * 4. `cierre`   — fin de la atención: la cita pasa a «completada».
 *
 * Cada etapa guarda quién, cuándo y cómo se confirmó, y el paciente puede calificarla de 1 a 5 con
 * etiquetas y un comentario. La satisfacción por etapa es PRIVADA (profesional y buscaDR); no es la
 * opinión pública del perfil. Con estas marcas se calculan espera, puntualidad y duración.
 */
import { HOUR, MINUTE } from "./time";

export const STAGES = ["reserva", "llegada", "consulta", "cierre"] as const;
export type Stage = (typeof STAGES)[number];
export type Method = "qr" | "qr_recepcion" | "manual" | "auto";
export type ActorRole = "paciente" | "profesional" | "sistema";

export const isStage = (x: unknown): x is Stage => typeof x === "string" && (STAGES as readonly string[]).includes(x);

type Copy = { label: string; question: string; tags: string[]; icon: string };
const COPY: Record<Stage, { presencial: Copy; virtual: Copy }> = {
  reserva: {
    presencial: {
      label: "Reserva confirmada",
      question: "¿Qué tan fácil fue agendar tu cita?",
      tags: ["Fácil de agendar", "Horarios disponibles", "Tarifa clara", "Confirmación rápida", "Demoró la confirmación"],
      icon: "calendar-check",
    },
    virtual: {
      label: "Reserva confirmada",
      question: "¿Qué tan fácil fue agendar tu cita?",
      tags: ["Fácil de agendar", "Horarios disponibles", "Tarifa clara", "Pago sencillo", "Demoró la confirmación"],
      icon: "calendar-check",
    },
  },
  llegada: {
    presencial: {
      label: "Llegada al consultorio",
      question: "¿Cómo fue tu llegada y la espera?",
      tags: ["Me atendieron a tiempo", "Buen trato en recepción", "Instalaciones limpias", "Fácil de llegar", "Esperé demasiado"],
      icon: "location-dot",
    },
    virtual: {
      label: "Ingreso a la videoconsulta",
      question: "¿Cómo fue la conexión a la videoconsulta?",
      tags: ["Buena conexión", "Enlace fácil de usar", "Empezó a tiempo", "Problemas de audio o video", "Esperé demasiado"],
      icon: "video",
    },
  },
  consulta: {
    presencial: {
      label: "Atención con el profesional",
      question: "¿Cómo te atendió el profesional?",
      tags: ["Me escuchó", "Explicación clara", "Tiempo suficiente", "Trato amable", "Consulta apresurada"],
      icon: "user-doctor",
    },
    virtual: {
      label: "Consulta por video",
      question: "¿Cómo te atendió el profesional?",
      tags: ["Me escuchó", "Explicación clara", "Tiempo suficiente", "Trato amable", "Consulta apresurada"],
      icon: "user-doctor",
    },
  },
  cierre: {
    presencial: {
      label: "Cierre y recomendaciones",
      question: "¿Te quedaron claras las indicaciones y el pago?",
      tags: ["Indicaciones claras", "Recibí receta o pedido de exámenes", "Pago sin problemas", "Seguimiento acordado", "Faltó información"],
      icon: "clipboard-check",
    },
    virtual: {
      label: "Cierre y recomendaciones",
      question: "¿Te quedaron claras las indicaciones y el pago?",
      tags: ["Indicaciones claras", "Recibí receta o pedido de exámenes", "Pago sin problemas", "Seguimiento acordado", "Faltó información"],
      icon: "clipboard-check",
    },
  },
};
export const stageCopy = (stage: Stage, modality: string) => COPY[stage][modality === "virtual" ? "virtual" : "presencial"];

export const RATING_LABELS = ["", "Muy mala", "Mala", "Regular", "Buena", "Excelente"] as const;

/** Ventana para confirmar la llegada: desde 2 h antes del inicio hasta 2 h después del fin. */
export const ARRIVAL_WINDOW = { before: 2 * HOUR, after: 2 * HOUR };
/** El paciente puede calificar (o corregir) una etapa durante 14 días. */
export const RATING_WINDOW_MS = 14 * 24 * HOUR;

export type StageRow = { stage: Stage; confirmed_ms: number; actor_role: ActorRole; method: Method };
export type RatingRow = { stage: Stage; rating: number; tags: string; comment: string; updated_at: string };
type Appt = { id: number; status: string; modality: string; start_ms: number; end_ms: number; confirmed_at: string | null };

/** Momento de la confirmación de la reserva (columna `confirmed_at`, en UTC). */
const confirmedMs = (a: Appt) => (a.confirmed_at ? Date.parse(`${a.confirmed_at.replace(" ", "T")}Z`) : null);

/** Etapas registradas + la reserva derivada de la confirmación. */
export function stagesOf(a: Appt, rows: StageRow[]) {
  const map = new Map<Stage, StageRow>(rows.map((r) => [r.stage, r]));
  const at = confirmedMs(a);
  if (!map.has("reserva") && ["confirmada", "completada", "no_asistio"].includes(a.status) && at)
    map.set("reserva", { stage: "reserva", confirmed_ms: at, actor_role: "sistema", method: "auto" });
  return map;
}

/** Siguiente etapa que confirma el profesional (o el paciente, solo la llegada). */
export function nextStage(map: Map<Stage, StageRow>): Stage | null {
  for (const s of ["llegada", "consulta", "cierre"] as const) if (!map.has(s)) return s;
  return null;
}

/**
 * ¿Puede este rol confirmar la etapa ahora? Devuelve el motivo si no.
 * `proSide`: el profesional (o el paciente en un perfil de muestra, para probar el flujo).
 */
export function confirmBlock(a: Appt, map: Map<Stage, StageRow>, stage: Stage, who: { proSide: boolean; patient: boolean }, method: Method, now = Date.now()) {
  if (stage === "reserva") return "La reserva se registra sola al confirmarse la cita.";
  if (a.status !== "confirmada") return "La cita no está confirmada.";
  if (map.has(stage)) return "Esta etapa ya está registrada.";
  if (stage !== nextStage(map)) return `Primero se registra «${stageCopy(nextStage(map) ?? "cierre", a.modality).label}».`;
  if (stage === "llegada") {
    if (now < a.start_ms - ARRIVAL_WINDOW.before) return "La llegada se confirma desde 2 horas antes de la cita.";
    if (now > a.end_ms + ARRIVAL_WINDOW.after) return "Pasó el plazo para confirmar la llegada.";
    if (who.patient && !who.proSide && method === "manual") return "Confirma tu llegada escaneando el QR de recepción.";
    if (!who.patient && !who.proSide) return "No puedes confirmar esta etapa.";
    return null;
  }
  // Consulta y cierre: solo el profesional.
  if (!who.proSide) return "El profesional confirma esta etapa al escanear tu QR.";
  if (stage === "cierre" && now < a.start_ms - 30 * MINUTE) return "La atención aún no ha comenzado.";
  return null;
}

/** Tiempos de la atención en minutos (null si faltan marcas). */
export function metrics(a: Appt, map: Map<Stage, StageRow>) {
  const t = (s: Stage) => map.get(s)?.confirmed_ms ?? null;
  const diff = (x: number | null, y: number | null) => (x != null && y != null ? Math.round((x - y) / MINUTE) : null);
  return {
    /** Llegada respecto de la hora de la cita (negativo = llegó antes). */
    punctuality_minutes: diff(t("llegada"), a.start_ms),
    /** Espera: de la llegada al inicio de la atención. */
    wait_minutes: diff(t("consulta"), t("llegada")),
    /** Duración de la atención. */
    duration_minutes: diff(t("cierre"), t("consulta")),
    /** Inicio de la atención respecto de la hora de la cita (retraso del profesional). */
    delay_minutes: diff(t("consulta"), a.start_ms),
  };
}

/** Token aleatorio de 128 bits para los QR («a_…» cita, «r_…» recepción). No es adivinable. */
export function newToken(prefix: "a" | "r") {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return `${prefix}_${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}
export const TOKEN = /^[ar]_[0-9a-f]{32}$/;

/** Etiquetas válidas para una etapa (se descartan las inventadas). */
export const cleanTags = (stage: Stage, modality: string, tags: unknown) =>
  Array.isArray(tags) ? [...new Set(tags.filter((t): t is string => typeof t === "string" && stageCopy(stage, modality).tags.includes(t)))].slice(0, 5) : [];
