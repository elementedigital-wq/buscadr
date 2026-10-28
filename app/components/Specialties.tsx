import { useState } from "react";
import { Link } from "react-router";
import type { Catalog, Cms } from "../lib/types";
import { CmsIcon, Icon } from "./Icon";
import { TONE_CARD, TONE_CLASS } from "./ui";

type Tone = Cms["specialties"][number]["tone"];
export const TONE_LABEL: Record<Tone, string> = { azul: "Azul Confianza", verde: "Verde Salud", cielo: "Azul Tecnología", neutro: "Neutro" };

/** Especialidades visibles según el CMS (orden, nombres, íconos y tonos editables; una categoría oculta las oculta). */
export function visibleSpecialties(cms: Cms | null | undefined) {
  const hidden = new Set((cms?.categories ?? []).filter((c) => !c.visible).map((c) => c.slug));
  return (cms?.specialties ?? []).filter((s) => s.visible && !hidden.has(s.category));
}

/** Categorías visibles con sus especialidades visibles (las vacías no se muestran). */
export function specialtiesByCategory(cms: Cms | null | undefined) {
  const list = visibleSpecialties(cms);
  return (cms?.categories ?? [])
    .filter((c) => c.visible)
    .map((c) => ({ ...c, items: list.filter((s) => s.category === c.slug) }))
    .filter((c) => c.items.length);
}

export const specialtyName = (cms: Cms | null | undefined, slug: string) => cms?.specialties.find((s) => s.slug === slug)?.name ?? slug;

/** Chips de especialidad (como «All · General · Cardiología» de las referencias). */
export function SpecialtyChips({
  cms,
  active,
  base = {},
  limit,
}: {
  cms: Cms | null | undefined;
  active?: string | null;
  base?: Record<string, string>;
  limit?: number;
}) {
  const all = visibleSpecialties(cms);
  // Fila desplazable: las más buscadas primero (orden del CMS) y siempre la elegida.
  const list = all.slice(0, limit ?? 20);
  const current = active ? all.find((s) => s.slug === active) : undefined;
  if (current && !list.includes(current)) list.unshift(current);
  const href = (slug: string | null) => {
    const qs = new URLSearchParams(base);
    if (slug) qs.set("especialidad", slug);
    else qs.delete("especialidad");
    const s = qs.toString();
    return `/buscar${s ? `?${s}` : ""}`;
  };
  return (
    <nav aria-label="Especialidades" className="scroll-row">
      <Link to={href(null)} preventScrollReset aria-current={!active ? "true" : undefined} className="pill snap-start">
        <Icon name="grid" className="size-4" /> Todas
      </Link>
      {list.map((s) => (
        <Link
          key={s.slug}
          to={href(s.slug)}
          preventScrollReset
          aria-current={active === s.slug ? "true" : undefined}
          className="pill snap-start"
          data-cms={`specialties.${s.slug}`}
        >
          <CmsIcon value={s.icon} className="size-4" />
          <span className="whitespace-nowrap">{s.name}</span>
        </Link>
      ))}
      {all.length > list.length && (
        <Link to="/especialidades" className="pill snap-start">
          Ver las {all.length} <Icon name="arrow" className="size-4" />
        </Link>
      )}
    </nav>
  );
}

/** Tarjetas de especialidad: recuadro de ícono en el tono de la especialidad + nombre. */
export function SpecialtyGrid({ cms, limit, counts = {} }: { cms: Cms | null | undefined; limit?: number; counts?: Record<string, number> }) {
  const list = visibleSpecialties(cms).slice(0, limit ?? 99);
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {list.map((s) => (
        <li key={s.slug} data-cms={`specialties.${s.slug}`}>
          <Link
            to={`/buscar?especialidad=${s.slug}`}
            className={`group flex h-full min-h-32 flex-col justify-between gap-3 rounded-[var(--radius-card)] p-4 transition hover:-translate-y-0.5 hover:shadow-lg ${TONE_CARD[s.tone]}`}
          >
            <span className={`grid size-12 place-items-center rounded-2xl ${TONE_CLASS[s.tone]}`}>
              <CmsIcon value={s.icon} className="size-6" />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-base leading-tight font-bold text-tinta">{s.name}</span>
              <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-azul">
                {counts[s.slug] ? `${counts[s.slug]} ${counts[s.slug] === 1 ? "profesional" : "profesionales"}` : "Ver profesionales"}
                <Icon name="arrow" className="size-3 transition group-hover:translate-x-0.5" />
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Directorio completo agrupado por categoría, con búsqueda instantánea (página /especialidades). */
export function SpecialtyDirectory({ cms, counts = {} }: { cms: Cms | null | undefined; counts?: Record<string, number> }) {
  const [q, setQ] = useState("");
  const norm = (t: string) =>
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const needle = norm(q.trim());
  const groups = specialtiesByCategory(cms)
    .map((g) => ({ ...g, items: needle ? g.items.filter((s) => norm(`${s.name} ${s.professional} ${s.keywords}`).includes(needle)) : g.items }))
    .filter((g) => g.items.length);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <div>
      <div className="sticky top-[4.5rem] z-10 -mx-4 bg-fondo/95 px-4 py-3 backdrop-blur sm:mx-0 sm:px-0">
        <label htmlFor="buscar-especialidad" className="sr-only">
          Buscar especialidad
        </label>
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-gris" />
          <input
            id="buscar-especialidad"
            type="search"
            className="input pl-10"
            placeholder="Busca una especialidad, profesional o síntoma: «piel», «niños», «dientes»…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <p className="mt-2 text-xs muted" aria-live="polite">
          {total} {total === 1 ? "especialidad" : "especialidades"}
        </p>
      </div>
      {groups.length ? (
        <div className="mt-4 space-y-8">
          {groups.map((g) => (
            <section key={g.slug} aria-labelledby={`cat-${g.slug}`} data-cms={`categories.${g.slug}`}>
              <h2 id={`cat-${g.slug}`} className="flex items-center gap-3 text-xl font-extrabold">
                <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${TONE_CLASS[g.tone]}`}>
                  <CmsIcon value={g.icon} className="size-5" />
                </span>
                <span className="min-w-0">{g.name}</span>
              </h2>
              <ul className="mt-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {g.items.map((s) => (
                  <li key={s.slug} data-cms={`specialties.${s.slug}`}>
                    <Link
                      to={`/buscar?especialidad=${s.slug}`}
                      className="card grid h-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 p-3 transition hover:ring-azul/30"
                    >
                      <span className={`grid size-10 place-items-center rounded-xl ${TONE_CLASS[s.tone]}`}>
                        <CmsIcon value={s.icon} className="size-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block leading-tight font-bold break-words">{s.name}</span>
                        <span className="block text-xs muted">
                          {counts[s.slug] ? `${counts[s.slug]} ${counts[s.slug] === 1 ? "profesional" : "profesionales"}` : s.professional}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <p className="mt-6 rounded-2xl bg-white p-5 text-sm muted ring-1 ring-tinta/5">
          No encontramos «{q}». Prueba con otra palabra o{" "}
          <Link to={`/buscar?q=${encodeURIComponent(q)}`} className="font-semibold text-azul underline">
            búscalo en el directorio
          </Link>
          .
        </p>
      )}
    </div>
  );
}

/** Opciones de especialidad agrupadas por categoría (formularios del profesional). Conserva la actual aunque esté oculta. */
export function SpecialtyOptions({ catalog, current }: { catalog: Catalog | null | undefined; current?: string }) {
  const specs = catalog?.specialties ?? [];
  const cats = catalog?.categories ?? [];
  const grouped = cats.map((c) => ({ ...c, items: specs.filter((s) => s.category === c.slug) })).filter((c) => c.items.length);
  const orphan = specs.filter((s) => !cats.some((c) => c.slug === s.category));
  return (
    <>
      {current && !specs.some((s) => s.slug === current) && <option value={current}>{current} (actual)</option>}
      {grouped.map((c) => (
        <optgroup key={c.slug} label={c.name}>
          {c.items.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </optgroup>
      ))}
      {orphan.map((s) => (
        <option key={s.slug} value={s.slug}>
          {s.name}
        </option>
      ))}
    </>
  );
}
