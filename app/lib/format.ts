export const money = (cents: number | null | undefined) =>
  cents == null ? "—" : new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(cents / 100);

/** Hora de Ecuador (UTC−5 todo el año). */
export const TZ = "America/Guayaquil";

export const dateTime = (value: string | number | null | undefined) => {
  if (value == null || value === "") return "—";
  const d = typeof value === "number" ? new Date(value) : new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(d);
};

export const shortDate = (ms: number) => new Intl.DateTimeFormat("es-EC", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).format(ms);

/** «YYYY-MM-DDTHH:MM» en hora de Ecuador (para inputs datetime-local). */
export const toLocalInput = (ms: number) => new Date(ms - 5 * 3_600_000).toISOString().slice(0, 16);
export const toLocalDate = (ms: number) => toLocalInput(ms).slice(0, 10);

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

export const pct = (bps: number) => `${(bps / 100).toLocaleString("es-EC", { maximumFractionDigits: 1 })} %`;

export const hoursLabel = (h: number) => (h % 24 === 0 ? `${h / 24} ${h === 24 ? "día" : "días"}` : `${h} ${h === 1 ? "hora" : "horas"}`);

const ecDay = (ms: number) => Math.floor((ms - 5 * 3_600_000) / 86_400_000);
export const hhmm = (ms: number) => new Intl.DateTimeFormat("es-EC", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ }).format(ms);

/** «hoy 9:00», «mañana 9:00» o «jue 30 oct, 9:00» (hora de Ecuador). */
export function whenLabel(ms: number, now = Date.now()) {
  const diff = ecDay(ms) - ecDay(now);
  if (diff === 0) return `hoy ${hhmm(ms)}`;
  if (diff === 1) return `mañana ${hhmm(ms)}`;
  if (diff === -1) return `ayer ${hhmm(ms)}`;
  return `${shortDate(ms)}, ${hhmm(ms)}`;
}

/** Tiempo restante corto: «en 40 min», «en 5 h», «en 2 días». */
export function timeLeft(ms: number, now = Date.now()) {
  const m = Math.max(0, Math.round((ms - now) / 60_000));
  if (m < 60) return `en ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `en ${h} h`;
  return `en ${Math.round(h / 24)} días`;
}

/** Saludo según la hora de Ecuador. */
export function greeting(now = Date.now()) {
  const h = new Date(now - 5 * 3_600_000).getUTCHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

/** «09:30» en hora de Ecuador. */
export const timeOf = (ms: number) => hhmm(ms);

export const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const WEEKDAYS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** Minutos desde medianoche → «09:30». */
export const minutesLabel = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Suma días a «YYYY-MM-DD». */
export function addDays(date: string, n: number) {
  const ms = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) + n * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Partes de una fecha «YYYY-MM-DD» para la tira de días: «Lun», «3», «nov». */
export function dayParts(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  return {
    weekday: WEEKDAYS_SHORT[d.getUTCDay()],
    day: d.getUTCDate(),
    month: new Intl.DateTimeFormat("es-EC", { month: "short", timeZone: "UTC" }).format(d).replace(".", ""),
    long: new Intl.DateTimeFormat("es-EC", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(d),
  };
}

/** Nombre corto de un profesional para saludos: «Dra. Ana Torres» → «Ana». */
export const firstName = (name: string) => name.replace(/^(Dra?\.|Lic\.|Psic\.|Od\.|Nut\.|Ft\.)\s+/i, "").split(/\s+/)[0] ?? name;
