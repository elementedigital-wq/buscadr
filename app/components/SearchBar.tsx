import { Form } from "react-router";
import type { City } from "../lib/types";
import { Icon } from "./Icon";

/**
 * Buscador «Qué · Dónde · Modalidad». Formulario GET a /buscar: funciona sin JavaScript y es indexable.
 * Acepta especialidad, nombre o síntoma: el servidor sugiere la especialidad («dentista» → odontología).
 */
export function SearchBar({
  placeholder = "Especialidad, nombre o síntoma",
  cities = [],
  defaults = {},
  cta = "Buscar",
  layout = "full",
}: {
  placeholder?: string;
  cities?: City[];
  defaults?: { q?: string; ciudad?: string; modalidad?: string; especialidad?: string };
  cta?: string;
  layout?: "full" | "compact";
}) {
  return (
    <Form
      action="/buscar"
      role="search"
      className={`grid gap-2 rounded-[1.6rem] bg-white p-2 shadow-[var(--shadow-float)] ring-1 ring-tinta/5 ${layout === "full" ? "md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)_auto]" : "sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto]"}`}
    >
      {defaults.especialidad && <input type="hidden" name="especialidad" value={defaults.especialidad} />}
      <label className="relative flex min-w-0 items-center">
        <span className="sr-only">Qué buscas</span>
        <Icon name="search" className="pointer-events-none absolute left-4 size-5 text-gris" />
        <input
          name="q"
          defaultValue={defaults.q}
          placeholder={placeholder}
          className="input min-h-12 border-0 bg-fondo pl-12"
          data-cms="home.searchPlaceholder"
          enterKeyHint="search"
        />
      </label>
      <label className="relative flex min-w-0 items-center">
        <span className="sr-only">Ciudad</span>
        <Icon name="pin" className="pointer-events-none absolute left-4 size-5 text-gris" />
        <select name="ciudad" defaultValue={defaults.ciudad ?? ""} className="input min-h-12 border-0 bg-fondo pl-12">
          <option value="">Todas las ciudades</option>
          {cities.map((c) => (
            <option key={c.slug}>{c.name}</option>
          ))}
        </select>
      </label>
      {layout === "full" && (
        <label className="relative flex min-w-0 items-center">
          <span className="sr-only">Modalidad</span>
          <Icon name="stethoscope" className="pointer-events-none absolute left-4 size-5 text-gris" />
          <select name="modalidad" defaultValue={defaults.modalidad ?? ""} className="input min-h-12 border-0 bg-fondo pl-12">
            <option value="">Presencial o virtual</option>
            <option value="presencial">Presencial</option>
            <option value="virtual">Virtual</option>
          </select>
        </label>
      )}
      <button type="submit" className="btn-primary min-h-12" data-cms="hero.cta">
        <Icon name="search" className="size-4" /> {cta}
      </button>
    </Form>
  );
}
