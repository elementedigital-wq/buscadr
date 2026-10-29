/**
 * Planes de consultas programadas que el paciente puede pedir al reservar (ADR 0019), como la
 * recurrencia de YANK: plantillas orientativas por especialidad o un plan armado (frecuencia y número
 * de consultas). Son sugerencias de agenda, no indicaciones médicas: el profesional acepta o no el plan
 * y define el tratamiento en la consulta. Se usan en el servidor (validación) y en la web (reserva).
 */

export type PlanTemplate = { id: string; title: string; interval_days: number; sessions: number; hint: string };

/** Especialidades donde el plan se destaca en la reserva. */
export const FEATURED_PLAN_SPECIALTIES = ["pediatria", "cardiologia", "oftalmologia", "nefrologia", "neurologia", "medicina-interna"];

export const PLAN_TEMPLATES: Record<string, PlanTemplate[]> = {
  pediatria: [
    {
      id: "nino-sano-lactante",
      title: "Control de niño sano (primer año)",
      interval_days: 30,
      sessions: 6,
      hint: "Peso, talla, desarrollo y calendario de vacunas",
    },
    { id: "crecimiento-desarrollo", title: "Control de crecimiento y desarrollo", interval_days: 90, sessions: 4, hint: "Niñas y niños de 1 a 5 años" },
    { id: "pediatrico-escolar", title: "Control pediátrico escolar", interval_days: 180, sessions: 2, hint: "Revisión semestral en edad escolar" },
  ],
  cardiologia: [
    { id: "presion-arterial", title: "Control de presión arterial", interval_days: 90, sessions: 4, hint: "Seguimiento trimestral durante un año" },
    {
      id: "seguimiento-cardiovascular",
      title: "Seguimiento cardiovascular cercano",
      interval_days: 30,
      sessions: 3,
      hint: "Tras un cambio de tratamiento o un alta",
    },
    { id: "ritmo-cardiaco", title: "Control del ritmo cardíaco", interval_days: 60, sessions: 3, hint: "Revisión bimestral" },
  ],
  oftalmologia: [
    { id: "presion-ocular", title: "Control de presión ocular", interval_days: 90, sessions: 4, hint: "Seguimiento trimestral durante un año" },
    { id: "miopia-infantil", title: "Control visual infantil", interval_days: 180, sessions: 2, hint: "Revisión semestral de la visión" },
    { id: "retina-diabetes", title: "Control de retina en diabetes", interval_days: 180, sessions: 2, hint: "Fondo de ojo semestral" },
  ],
  nefrologia: [
    { id: "funcion-renal-cercano", title: "Control de función renal (cercano)", interval_days: 60, sessions: 6, hint: "Revisión bimestral durante un año" },
    { id: "funcion-renal", title: "Control de función renal", interval_days: 90, sessions: 4, hint: "Revisión trimestral durante un año" },
  ],
  neurologia: [
    {
      id: "neurologico-trimestral",
      title: "Control neurológico trimestral",
      interval_days: 90,
      sessions: 4,
      hint: "Seguimiento de tratamiento durante un año",
    },
    { id: "cefalea", title: "Seguimiento de dolor de cabeza", interval_days: 30, sessions: 3, hint: "Revisión mensual de la evolución" },
    { id: "neurologico-semestral", title: "Control neurológico semestral", interval_days: 180, sessions: 2, hint: "Revisión cada seis meses" },
  ],
  "medicina-interna": [
    { id: "glucosa", title: "Control de diabetes", interval_days: 90, sessions: 4, hint: "Seguimiento trimestral durante un año" },
    { id: "presion-interna", title: "Control de presión arterial", interval_days: 90, sessions: 4, hint: "Seguimiento trimestral durante un año" },
    { id: "cronicos", title: "Control de enfermedades crónicas", interval_days: 60, sessions: 6, hint: "Revisión bimestral durante un año" },
  ],
};

/** Plantillas para cualquier otra especialidad. */
export const GENERIC_PLAN_TEMPLATES: PlanTemplate[] = [
  { id: "control-mensual", title: "Control mensual", interval_days: 30, sessions: 3, hint: "Tres meses de seguimiento" },
  { id: "control-trimestral", title: "Control trimestral", interval_days: 90, sessions: 4, hint: "Un año de seguimiento" },
];

/** Frecuencias para «Armar mi plan» (como la recurrencia de YANK). */
export const PLAN_FREQUENCIES: [number, string][] = [
  [7, "Semanal"],
  [14, "Quincenal"],
  [30, "Mensual"],
  [60, "Bimestral"],
  [90, "Trimestral"],
  [180, "Semestral"],
];
export const PLAN_MIN_SESSIONS = 2;
export const PLAN_MAX_SESSIONS = 12;

/**
 * Días entre consultas de un plan pedido al reservar: se redondea a semanas completas para mantener
 * el mismo día de la semana y la misma hora (mensual = 4 semanas, trimestral = 13, semestral = 26).
 */
export const weekAlignedDays = (days: number) => Math.max(7, Math.round(days / 7) * 7);

/** Fechas de las consultas de un plan pedido al reservar, a partir de la primera. */
export const planDates = (first: number, intervalDays: number, sessions: number) =>
  Array.from({ length: sessions }, (_, i) => first + i * weekAlignedDays(intervalDays) * 86_400_000);

export const templatesFor = (specialty: string) => PLAN_TEMPLATES[specialty] ?? GENERIC_PLAN_TEMPLATES;

export const frequencyName = (days: number) => PLAN_FREQUENCIES.find(([d]) => d === days)?.[1] ?? `Cada ${days} días`;

/** Normaliza el plan pedido al reservar; devuelve un error legible si no es válido. */
export function readPlanRequest(
  input: unknown,
  specialty: string,
): { plan: { title: string; template: string; interval_days: number; sessions: number } } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Elige un plan de consultas" };
  const raw = input as { template?: unknown; interval_days?: unknown; sessions?: unknown };
  const template = typeof raw.template === "string" ? templatesFor(specialty).find((t) => t.id === raw.template) : undefined;
  if (typeof raw.template === "string" && raw.template && !template) return { error: "Esa plantilla no está disponible para esta especialidad" };
  const interval = template?.interval_days ?? Number(raw.interval_days);
  const sessions = template?.sessions ?? Number(raw.sessions);
  if (!PLAN_FREQUENCIES.some(([d]) => d === interval)) return { error: "Elige la frecuencia del plan" };
  if (!Number.isInteger(sessions) || sessions < PLAN_MIN_SESSIONS || sessions > PLAN_MAX_SESSIONS)
    return { error: `Un plan tiene de ${PLAN_MIN_SESSIONS} a ${PLAN_MAX_SESSIONS} consultas` };
  return {
    plan: {
      title: template?.title ?? `Plan ${frequencyName(interval).toLowerCase()} de ${sessions} consultas`,
      template: template?.id ?? "",
      interval_days: interval,
      sessions,
    },
  };
}
