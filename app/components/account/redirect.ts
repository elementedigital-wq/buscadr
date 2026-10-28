/** Solo se permiten destinos del mismo sitio ("/ruta"), nunca "//dominio" ni URLs absolutas. */
export function safeNext(next: string | null | undefined) {
  if (!next?.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

/** Destino tras entrar: el propietario va al CMS Maestro; profesionales a su panel; pacientes a sus citas. */
export function destinationFor(role: string | undefined, next: string | null, cms = false, fresh = false) {
  return safeNext(next) ?? (cms ? "/maestro" : role === "pro" ? "/panel" : fresh ? "/buscar" : "/citas");
}
