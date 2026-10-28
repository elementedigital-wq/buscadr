import { Form } from "react-router";
import { toLocalDate } from "../lib/format";
import { Icon } from "./Icon";

/**
 * Buscador «Qué · Dónde · Cuándo» (mejora UX: la disponibilidad por fecha es el producto, §06).
 * Formulario GET a /explorar: funciona sin JavaScript y es indexable.
 */
export function SearchBar({
  placeholder = "¿Qué necesitas?",
  defaults = {},
  cta = "Buscar",
  compact = false,
}: {
  placeholder?: string;
  defaults?: { q?: string; city?: string; start?: string; end?: string; category?: string };
  cta?: string;
  compact?: boolean;
}) {
  const today = toLocalDate(Date.now());
  return (
    <Form
      action="/explorar"
      role="search"
      className={`card grid gap-2 p-2 ${compact ? "sm:grid-cols-[minmax(10.5rem,1.1fr)_1fr_1fr_auto]" : "md:grid-cols-[1.6fr_1fr_1fr_1fr_auto]"}`}
    >
      {defaults.category && <input type="hidden" name="category" value={defaults.category} />}
      {/* En la portada (columna estrecha) el «qué» ocupa su propia fila para que se lea el texto. */}
      <label className={`relative flex items-center ${compact ? "sm:col-span-4" : ""}`}>
        <span className="sr-only">Qué necesitas</span>
        <Icon name="search" className="pointer-events-none absolute left-3.5 size-5 text-gris" />
        <input
          name="q"
          defaultValue={defaults.q}
          placeholder={placeholder}
          className={`input border-0 bg-fondo pl-11 ${compact ? "" : "md:bg-white"}`}
          data-cms="home.searchPlaceholder"
        />
      </label>
      <label className="relative flex items-center">
        <span className="sr-only">Dónde</span>
        <Icon name="pin" className="pointer-events-none absolute left-3.5 size-5 text-gris" />
        <select name="city" defaultValue={defaults.city ?? ""} className="input border-0 bg-fondo pl-11 md:bg-white">
          <option value="">Toda la zona</option>
          <option>Guayaquil</option>
          <option>Samborondón</option>
          <option>Daule</option>
        </select>
      </label>
      <label className="flex flex-col rounded-xl bg-fondo px-3.5 py-1 md:bg-white">
        <span className="text-[11px] font-semibold uppercase tracking-wide muted">Retiro</span>
        <input type="date" name="start" min={today} defaultValue={defaults.start} className="min-h-7 bg-transparent text-[15px] outline-none" />
      </label>
      <label className="flex flex-col rounded-xl bg-fondo px-3.5 py-1 md:bg-white">
        <span className="text-[11px] font-semibold uppercase tracking-wide muted">Devolución</span>
        <input type="date" name="end" min={today} defaultValue={defaults.end} className="min-h-7 bg-transparent text-[15px] outline-none" />
      </label>
      <button type="submit" className="btn-primary" data-cms="hero.cta">
        <Icon name="search" className="size-4" /> {cta}
      </button>
    </Form>
  );
}
