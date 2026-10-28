import { Link } from "react-router";

/** Filtros rápidos (como «Todas · Hoy · Mejor valorados · Menos de $15»): enlaces GET a Explorar. */
export const QUICK_FILTERS = [
  { key: "todas", label: "Todas", params: {} },
  { key: "hoy", label: "Disponible hoy", params: { hoy: "1" } },
  { key: "inmediata", label: "Reserva inmediata", params: { instant: "1" } },
  { key: "valorados", label: "Mejor valorados", params: { sort: "valoracion" } },
  { key: "economicos", label: "Hasta $15/día", params: { max: "1500" } },
  { key: "entrega", label: "Con entrega", params: { delivery: "entrega" } },
] as const;

export type QuickKey = (typeof QUICK_FILTERS)[number]["key"];

/** Filtro rápido activo según los parámetros actuales (solo si coincide exactamente con uno). */
export function activeQuick(p: Record<string, string>): QuickKey | null {
  const keys = Object.keys(p).filter((k) => !["q", "category", "vista", "city", "lat", "lng", "radius"].includes(k) && p[k]);
  if (!keys.length) return "todas";
  for (const f of QUICK_FILTERS) {
    const entries = Object.entries(f.params) as [string, string][];
    if (entries.length && entries.length === keys.length && entries.every(([k, v]) => p[k] === v)) return f.key;
  }
  return null;
}

export function QuickFilters({ active, base = {} }: { active: QuickKey | null; base?: Record<string, string> }) {
  return (
    <nav aria-label="Filtros rápidos" className="scroll-row gap-2 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {QUICK_FILTERS.map((f) => {
        const qs = new URLSearchParams({ ...base, ...f.params }).toString();
        const on = active === f.key;
        return (
          <Link
            key={f.key}
            to={`/explorar${qs ? `?${qs}` : ""}`}
            preventScrollReset
            aria-current={on ? "true" : undefined}
            className={`chip shrink-0 whitespace-nowrap px-4 py-2 font-semibold ring-1 ${on ? "bg-tinta text-white ring-tinta" : "bg-white text-tinta ring-black/10 hover:ring-morado/40"}`}
          >
            {f.label}
          </Link>
        );
      })}
    </nav>
  );
}
