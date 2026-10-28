/**
 * Fechas del piloto: Ecuador continental usa UTC−5 todo el año (America/Guayaquil, sin horario
 * de verano). Se guardan en milisegundos UTC y se muestran en hora local.
 */
export const EC_OFFSET_MS = 5 * 3_600_000;
export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/**
 * Acepta milisegundos, «YYYY-MM-DD» (con hora por defecto) o «YYYY-MM-DDTHH:MM» en hora de Ecuador.
 * Devuelve null si el valor no es válido.
 */
export function parseLocal(value: unknown, defaultHour = 9): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" || /^\d{12,14}$/.test(String(value))) {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : null;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(String(value));
  if (!m) return null;
  const [y, mo, d, h, mi] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ? Number(m[4]) : defaultHour, m[5] ? Number(m[5]) : 0];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi) + EC_OFFSET_MS;
  const check = new Date(ms - EC_OFFSET_MS);
  return check.getUTCDate() === d ? ms : null;
}

/** «2026-11-02T09:00» en hora de Ecuador. */
export function toLocalInput(ms: number) {
  return new Date(ms - EC_OFFSET_MS).toISOString().slice(0, 16);
}

/** «2026-11-02» (fecha local de Ecuador). */
export const localDate = (ms: number) => toLocalInput(ms).slice(0, 10);
/** «09:30» (hora local de Ecuador). */
export const localTime = (ms: number) => toLocalInput(ms).slice(11, 16);
/** Medianoche local (en ms UTC) de una fecha «YYYY-MM-DD». */
export const localMidnight = (date: string) => parseLocal(`${date}T00:00`) ?? Number.NaN;
/** Día de la semana local (0 = domingo). */
export const localWeekday = (ms: number) => new Date(ms - EC_OFFSET_MS).getUTCDay();
/** Suma días a una fecha «YYYY-MM-DD». */
export function addDays(date: string, n: number) {
  const ms = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) + n * DAY;
  return new Date(ms).toISOString().slice(0, 10);
}
export const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && parseLocal(s) !== null;

export const formatLocal = (ms: number) =>
  new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Guayaquil" }).format(ms);

/** «lunes 3 de noviembre, 09:30» para avisos de WhatsApp y correo. */
export const formatLong = (ms: number) =>
  new Intl.DateTimeFormat("es-EC", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Guayaquil",
  }).format(ms);
