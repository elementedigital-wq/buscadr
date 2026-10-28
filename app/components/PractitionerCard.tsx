/**
 * Tarjeta de profesional (referencias UX: foto en recuadro, nombre, especialidad, valoración real,
 * experiencia, modalidades, próximo horario y botón «Agendar»). Nada de valoraciones inventadas:
 * sin opiniones verificadas se muestra «Nuevo en buscaDR».
 */
import { Link } from "react-router";
import { money, whenLabel } from "../lib/format";
import type { Cms, PublicPractitioner } from "../lib/types";
import { FavoriteButton } from "./FavoriteButton";
import { Icon } from "./Icon";
import { Avatar, DemoBadge, Stars, VerifiedBadge } from "./ui";

type Card = PublicPractitioner & { featured?: boolean };

export function priceFrom(p: Pick<PublicPractitioner, "in_person" | "virtual" | "price_in_person_cents" | "price_virtual_cents">) {
  const prices = [p.in_person ? p.price_in_person_cents : 0, p.virtual ? p.price_virtual_cents : 0].filter((x) => x > 0);
  return prices.length ? Math.min(...prices) : null;
}

export function Rating({ p, compact = false }: { p: Pick<PublicPractitioner, "rating" | "reviews">; compact?: boolean }) {
  if (p.rating == null || !p.reviews) return <span className="chip bg-celeste px-2 py-0.5 text-xs font-semibold text-azul">Nuevo en buscaDR</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-sm">
      {compact ? <Icon name="star" className="size-4 text-[#f5b301]" /> : <Stars value={p.rating} />}
      <strong>{p.rating.toFixed(1)}</strong>
      <span className="truncate muted">
        ({p.reviews} {p.reviews === 1 ? "opinión" : "opiniones"})
      </span>
    </span>
  );
}

export function ModalityChips({ p }: { p: Pick<PublicPractitioner, "in_person" | "virtual"> }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {p.in_person && (
        <span className="chip bg-gris-claro px-2 py-0.5 text-xs font-semibold text-tinta">
          <Icon name="clinic" className="size-3" /> Presencial
        </span>
      )}
      {p.virtual && (
        <span className="chip bg-menta px-2 py-0.5 text-xs font-semibold text-[#065f46]">
          <Icon name="video" className="size-3" /> Virtual
        </span>
      )}
    </span>
  );
}

export function PractitionerCard({ p, cms, layout = "row" }: { p: Card; cms?: Cms | null; layout?: "row" | "tile" }) {
  const showRatings = cms?.layout.showRatings ?? true;
  const showBadges = cms?.layout.showBadges ?? true;
  const showPrices = cms?.layout.showPrices ?? true;
  const from = priceFrom(p);
  const href = `/doctor/${p.slug}`;
  if (layout === "tile")
    return (
      <article className="card group relative flex h-full flex-col overflow-hidden" data-cms={`practitioners.${p.id}`}>
        <Link to={href} className="relative block aspect-[4/3] overflow-hidden bg-celeste">
          {p.photo ? (
            <img src={p.photo} alt={`Foto de ${p.name}`} loading="lazy" className="size-full object-cover object-top transition group-hover:scale-[1.03]" />
          ) : (
            <span className="grid size-full place-items-center">
              <Avatar name={p.name} size={96} />
            </span>
          )}
          <span className="absolute top-3 left-3 flex flex-wrap gap-1.5">
            {p.featured && <span className="chip bg-tinta px-2.5 py-0.5 text-xs font-semibold text-white">Destacado</span>}
            {p.demo && <DemoBadge />}
          </span>
        </Link>
        <FavoriteButton id={p.id} className="absolute top-3 right-3" />
        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-lg leading-tight font-bold">
                <Link to={href} className="hover:text-azul">
                  {p.name}
                </Link>
              </h3>
              <p className="text-sm muted">{p.specialty_name}</p>
            </div>
            {showBadges && p.verified && <VerifiedBadge className="shrink-0" />}
          </div>
          {showRatings && <Rating p={p} compact />}
          <ModalityChips p={p} />
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
            {showPrices && from != null ? (
              <p className="text-sm">
                <span className="muted">desde </span>
                <strong className="font-display text-lg">{money(from)}</strong>
              </p>
            ) : (
              <span />
            )}
            <Link to={href} className="btn-primary btn-sm">
              {cms?.buttons.book ?? "Agendar cita"}
            </Link>
          </div>
        </div>
      </article>
    );
  return (
    <article className="card relative flex min-w-0 gap-3 p-3 sm:gap-4 sm:p-4" data-cms={`practitioners.${p.id}`}>
      <Link to={href} className="relative shrink-0" aria-label={`Ver perfil de ${p.name}`}>
        <Avatar name={p.name} photo={p.photo} size={88} rounded="xl" />
        {p.next_slot_ms != null && p.next_slot_ms - Date.now() < 36 * 3_600_000 && (
          <span className="absolute -top-1.5 -left-1.5 chip bg-verde px-2 py-0.5 text-[10px] font-bold text-tinta shadow">Disponible</span>
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2 pr-10">
          <div className="min-w-0">
            <h3 className="text-base leading-tight font-bold sm:text-lg">
              <Link to={href} className="hover:text-azul">
                {p.name}
              </Link>
            </h3>
            <p className="text-sm muted">
              {p.specialty_name}
              {p.subspecialty ? ` · ${p.subspecialty}` : ""}
            </p>
          </div>
        </div>
        <FavoriteButton id={p.id} className="absolute top-3 right-3" />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {showRatings && <Rating p={p} compact />}
          {p.years_experience > 0 && (
            <span className="inline-flex items-center gap-1 text-xs muted">
              <Icon name="regular:id-card" className="size-3.5" /> {p.years_experience} años de experiencia
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {p.featured && <span className="chip bg-tinta px-2 py-0.5 text-xs font-semibold text-white">Destacado</span>}
          {showBadges && p.verified && <VerifiedBadge />}
          {p.demo && <DemoBadge />}
          <ModalityChips p={p} />
        </div>
        <p className="flex min-w-0 items-center gap-1 text-xs muted">
          <Icon name="pin" className="size-3.5" />
          <span className="truncate">
            {p.sector ? `${p.sector}, ` : ""}
            {p.city}
            {p.distance_km != null && p.distance_km < 80 ? ` · a ${p.distance_km.toLocaleString("es-EC")} km aprox.` : ""}
          </span>
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 text-sm">
            {p.next_slot_ms ? (
              <span className="inline-flex items-center gap-1 font-semibold text-verde-ink">
                <Icon name="calendar-check" className="size-4" /> {whenLabel(p.next_slot_ms)}
              </span>
            ) : (
              <span className="muted">Sin horarios en los próximos días</span>
            )}
            {showPrices && from != null && (
              <span className="ml-0 block sm:ml-3 sm:inline">
                <span className="muted">desde </span>
                <strong>{money(from)}</strong>
              </span>
            )}
          </div>
          <Link to={href} className="btn-primary btn-sm">
            {cms?.buttons.book ?? "Agendar cita"}
          </Link>
        </div>
      </div>
    </article>
  );
}
