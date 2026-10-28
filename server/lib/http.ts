/** Error con estado HTTP y código estable para el cliente. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export function fail(status: number, message: string, code?: string): never {
  throw new HttpError(status, message, code);
}

export const clean = (value: unknown, max = 500) =>
  String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);

export const isLat = (v: unknown) => v !== null && v !== "" && Number.isFinite(Number(v)) && Math.abs(Number(v)) <= 90;
export const isLng = (v: unknown) => v !== null && v !== "" && Number.isFinite(Number(v)) && Math.abs(Number(v)) <= 180;
export const isCents = (v: unknown) => Number.isSafeInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 100_000_000;

/** Detecta violaciones de UNIQUE aunque el ORM envuelva el error original en `cause`. */
export function isUniqueViolation(error: unknown): boolean {
  let e: unknown = error;
  for (let i = 0; i < 4 && e; i++) {
    if (String((e as Error).message ?? e).includes("UNIQUE")) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}
