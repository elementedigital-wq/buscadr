import { Link } from "react-router";
import type { Cms } from "../lib/types";
import { CmsIcon, Icon } from "./Icon";
import { TONE_CARD, TONE_CLASS } from "./ui";

type Tone = Cms["specialties"][number]["tone"];
export const TONE_LABEL: Record<Tone, string> = { azul: "Azul Confianza", verde: "Verde Salud", cielo: "Azul Tecnología", neutro: "Neutro" };

/** Especialidades visibles según el CMS (orden, nombres, íconos y tonos editables). */
export function visibleSpecialties(cms: Cms | null | undefined) {
  return (cms?.specialties ?? []).filter((s) => s.visible);
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
  const list = visibleSpecialties(cms).slice(0, limit ?? 99);
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
