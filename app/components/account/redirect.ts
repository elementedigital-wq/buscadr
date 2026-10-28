/** Solo se permiten destinos del mismo sitio ("/ruta"), nunca "//dominio" ni URLs absolutas. */
export function safeNext(next: string | null | undefined) {
  if (!next?.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

export function destinationFor(role: string | undefined, next: string | null, admin = false) {
  return safeNext(next) ?? (admin ? "/admin" : role === "owner" ? "/panel" : "/explorar");
}

export const CITY_OPTIONS = ["Guayaquil", "Samborondón", "Daule"] as const;
