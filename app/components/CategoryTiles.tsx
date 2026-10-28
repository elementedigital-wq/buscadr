import { Link } from "react-router";
import { money } from "../lib/format";
import type { Cms } from "../lib/types";
import { CmsIcon } from "./Icon";

type Tone = Cms["categories"][number]["tone"];
export const TONE_CLASS: Record<Tone, string> = { morado: "tone-morado", turquesa: "tone-turquesa", azul: "tone-azul", neutro: "tone-neutro" };
export const TONE_CARD: Record<Tone, string> = {
  morado: "tone-card-morado",
  turquesa: "tone-card-turquesa",
  azul: "tone-card-azul",
  neutro: "tone-card-neutro",
};
export const TONE_LABEL: Record<Tone, string> = { morado: "Morado", turquesa: "Turquesa", azul: "Azul", neutro: "Neutro" };

/** Categorías visibles según el CMS (orden, nombres, iconos y tonos editables). */
export function visibleCategories(cms: Cms | null | undefined) {
  return (cms?.categories ?? []).filter((c) => c.visible);
}

const href = (slug: string) => `/explorar?category=${slug}`;

/** Fila de accesos con icono (portada): recuadro de tono suave + nombre debajo. */
export function ServicesRow({ cms, limit }: { cms: Cms | null | undefined; limit?: number }) {
  const cats = visibleCategories(cms).slice(0, limit ?? 99);
  return (
    <ul className="scroll-row lg:mx-0 lg:grid lg:grid-cols-10 lg:overflow-visible lg:px-0">
      {cats.map((c) => (
        <li key={c.slug} className="w-[5.25rem] shrink-0 snap-start lg:w-auto" data-cms={`categories.${c.slug}`}>
          <Link to={href(c.slug)} className="group flex flex-col items-center gap-2 rounded-2xl p-1 text-center">
            <span
              className={`grid size-16 place-items-center rounded-[1.35rem] ring-1 ring-black/5 transition group-hover:-translate-y-0.5 group-hover:shadow-md ${TONE_CLASS[c.tone]}`}
            >
              <CmsIcon value={c.icon} className="size-7" />
            </span>
            <span className="line-clamp-2 w-full text-xs font-semibold leading-tight text-tinta">{c.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export type CategoryStats = { stats: Record<string, { count: number; from_cents: number }>; top: string | null };

/** Tarjetas de categoría (página de categorías): icono, nombre, «desde $X · N equipos» y foto opcional. */
export function CategoryCards({ cms, stats }: { cms: Cms | null | undefined; stats: CategoryStats }) {
  const cats = visibleCategories(cms);
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
      {cats.map((c) => {
        const s = stats.stats[c.slug];
        return (
          <li key={c.slug} data-cms={`categories.${c.slug}`}>
            <Link
              to={href(c.slug)}
              className={`group flex h-full min-h-40 flex-col gap-4 rounded-[var(--radius-card)] p-3.5 transition hover:-translate-y-0.5 hover:shadow-lg sm:min-h-44 sm:p-5 ${TONE_CARD[c.tone]}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={`grid size-11 shrink-0 place-items-center rounded-2xl sm:size-12 ${TONE_CLASS[c.tone]}`}>
                  <CmsIcon value={c.icon} className="size-5 sm:size-6" />
                </span>
                {c.photo && (
                  <img
                    src={c.photo}
                    alt=""
                    loading="lazy"
                    width={96}
                    height={96}
                    className="size-16 shrink-0 rounded-2xl object-cover shadow-sm ring-2 ring-white transition group-hover:scale-105 sm:size-20"
                  />
                )}
              </div>
              <div className="mt-auto min-w-0">
                {stats.top === c.slug && (
                  <span className="chip mb-1.5 bg-morado px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">Más reservada</span>
                )}
                <p className="font-display text-base leading-tight font-bold break-words text-tinta sm:text-lg">{c.name}</p>
                <p className="mt-1 text-xs leading-snug muted sm:text-sm">
                  {s ? `desde ${money(s.from_cents)}/día · ${s.count} ${s.count === 1 ? "equipo" : "equipos"}` : "Próximamente en tu zona"}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
