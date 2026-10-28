import { useState } from "react";
import { Link } from "react-router";
import { BookingCalendar } from "../components/BookingCalendar";
import { ClientOnly } from "../components/ClientOnly";
import { FavoriteButton } from "../components/FavoriteButton";
import { Icon } from "../components/Icon";
import { ModalityChips, Rating } from "../components/PractitionerCard";
import PractitionersMap from "../components/PractitionersMap";
import { Avatar, DemoBadge, Notice, Stars, VerifiedBadge } from "../components/ui";
import { serverApi } from "../lib/api.server";
import { WEEKDAYS, dateTime, minutesLabel, money } from "../lib/format";
import type { Cms, ProfileData } from "../lib/types";
import { useRootData } from "../root";
import type { Route } from "./+types/doctor";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  return serverApi<ProfileData>(context, request, `/api/practitioners/${encodeURIComponent(params.slug)}`);
}

export const meta: Route.MetaFunction = ({ loaderData: data, matches }) => {
  if (!data) return [{ title: "Perfil no encontrado · buscaDR" }];
  const p = data.practitioner;
  const origin = (matches.find((m) => m?.id === "root")?.loaderData as { origin?: string } | undefined)?.origin ?? "";
  const description =
    `${p.name}, ${p.specialty_name} en ${p.sector ? `${p.sector}, ` : ""}${p.city}. ${p.headline || ""} Agenda tu cita ${p.virtual ? "presencial o virtual " : ""}en buscaDR.`.trim();
  return [
    { title: `${p.name} · ${p.specialty_name} en ${p.city} · buscaDR` },
    { name: "description", content: description.slice(0, 160) },
    { property: "og:title", content: `${p.name} · ${p.specialty_name}` },
    { property: "og:image", content: p.photo ? `${origin}${p.photo}` : `${origin}/assets/hero-doctor.webp` },
    { tagName: "link", rel: "canonical", href: `${origin}/doctor/${p.slug}` },
    // Datos estructurados sin valoraciones de muestra (Documento Maestro §14.2).
    ...(p.demo
      ? [{ name: "robots", content: "noindex" }]
      : [
          {
            "script:ld+json": {
              "@context": "https://schema.org",
              "@type": p.kind === "clinica" ? "MedicalClinic" : "Physician",
              name: p.name,
              medicalSpecialty: p.specialty_name,
              address: { "@type": "PostalAddress", addressLocality: p.city, addressCountry: "EC" },
              url: `${origin}/doctor/${p.slug}`,
              ...(p.rating && p.reviews ? { aggregateRating: { "@type": "AggregateRating", ratingValue: p.rating, reviewCount: p.reviews } } : {}),
            },
          },
        ]),
  ];
};

function Share({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title: name, url }).catch(() => {});
    else {
      await navigator.clipboard?.writeText(url).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }
  return (
    <button type="button" onClick={share} className="icon-btn size-10" aria-label={copied ? "Enlace copiado" : "Compartir perfil"}>
      <Icon name={copied ? "check" : "share"} className="size-4" />
    </button>
  );
}

export default function Doctor({ loaderData }: Route.ComponentProps) {
  const root = useRootData();
  const cms = root?.cms as Cms | undefined;
  const { practitioner: p, reviews, hours, favorite, preview } = loaderData;
  const byDay = new Map<number, typeof hours>();
  for (const h of hours) byDay.set(h.weekday, [...(byDay.get(h.weekday) ?? []), h]);
  return (
    <div className="container-page pt-4 sm:pt-6">
      <nav className="mb-3 flex items-center justify-between gap-2" aria-label="Acciones del perfil">
        <Link to="/buscar" className="btn-ghost btn-sm -ml-3">
          <Icon name="back" className="size-4" /> Volver a la búsqueda
        </Link>
        <div className="flex gap-2">
          <Share name={p.name} />
          <FavoriteButton id={p.id} initial={favorite} />
        </div>
      </nav>
      {preview && (
        <div className="mb-4">
          <Notice tone="warning" title="Vista previa">
            Tu perfil aún no está publicado. Así lo verán los pacientes cuando buscaDR lo verifique.
          </Notice>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
        <section className="card min-w-0 overflow-hidden lg:col-start-1 lg:row-start-1">
          <div className="surface-hero grid gap-5 p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:p-6">
            <div className="mx-auto sm:mx-0">
              <Avatar name={p.name} photo={p.photo} size={136} rounded="xl" />
            </div>
            <div className="min-w-0 text-center sm:text-left">
              <div className="flex flex-wrap justify-center gap-1.5 sm:justify-start">
                {(cms?.layout.showBadges ?? true) && p.verified && <VerifiedBadge />}
                {p.demo && <DemoBadge />}
                <span className="chip bg-white px-2.5 py-0.5 text-xs font-semibold text-azul ring-1 ring-azul/15">{p.kind_label}</span>
              </div>
              <h1 className="mt-2 text-3xl leading-tight font-extrabold sm:text-4xl">{p.name}</h1>
              <p className="mt-1 text-lg font-semibold text-azul">
                {p.specialty_name}
                {p.subspecialty ? <span className="font-normal muted"> · {p.subspecialty}</span> : null}
              </p>
              {p.headline && <p className="mt-1 muted">{p.headline}</p>}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                <Rating p={p} />
                <ModalityChips p={p} />
              </div>
            </div>
          </div>
          <dl className="grid grid-cols-3 divide-x divide-tinta/5 border-t border-tinta/5 text-center">
            <div className="p-4">
              <dt className="text-xs muted">Experiencia</dt>
              <dd className="font-display text-lg font-extrabold">{p.years_experience ? `${p.years_experience} años` : "—"}</dd>
            </div>
            <div className="p-4">
              <dt className="text-xs muted">Pacientes en buscaDR</dt>
              <dd className="font-display text-lg font-extrabold">{p.patients || "—"}</dd>
            </div>
            <div className="p-4">
              <dt className="text-xs muted">Valoración</dt>
              <dd className="font-display text-lg font-extrabold">{p.rating ? p.rating.toFixed(1) : "Nuevo"}</dd>
            </div>
          </dl>
        </section>

        {/* En el celular la agenda va justo después de la cabecera; en escritorio, columna fija a la derecha. */}
        <aside className="min-w-0 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start" aria-label="Reservar">
          <BookingCalendar p={p} loggedIn={!!root?.user} bookLabel={cms?.buttons.book} />
        </aside>
        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-2">
          <section className="card p-5 sm:p-6" aria-labelledby="sobre">
            <h2 id="sobre" className="text-xl font-extrabold">
              Sobre {p.kind === "clinica" ? "el centro" : "el profesional"}
            </h2>
            <p className="mt-2 whitespace-pre-line text-tinta/90">{p.bio || "Perfil en preparación."}</p>
            {p.services.length > 0 && (
              <>
                <h3 className="mt-5 text-base font-bold">Servicios</h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {p.services.map((s) => (
                    <li key={s} className="chip bg-celeste px-3 py-1.5 text-sm font-semibold text-tinta">
                      <Icon name="check" className="size-3.5 text-azul" /> {s}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="flex items-center gap-2 font-semibold">
                  <Icon name="globe" className="size-4 text-azul" /> Idiomas
                </dt>
                <dd className="pl-6 muted">{p.languages}</dd>
              </div>
              {p.insurances && (
                <div>
                  <dt className="flex items-center gap-2 font-semibold">
                    <Icon name="shield" className="size-4 text-azul" /> Seguros y convenios
                  </dt>
                  <dd className="pl-6 muted">{p.insurances}</dd>
                </div>
              )}
              <div>
                <dt className="flex items-center gap-2 font-semibold">
                  <Icon name="regular:id-card" className="size-4 text-azul" /> Registro profesional
                </dt>
                <dd className="pl-6 muted">
                  {p.verified
                    ? `Verificado por buscaDR${p.verified_at ? ` el ${dateTime(p.verified_at).split(",")[0]}` : ""} (${p.license_hint})`
                    : p.demo
                      ? "Perfil ilustrativo"
                      : "En verificación"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="card p-5 sm:p-6" aria-labelledby="tarifas">
            <h2 id="tarifas" className="text-xl font-extrabold">
              Tarifas y modalidades
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {p.in_person && (
                <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-fondo p-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl tone-azul">
                    <Icon name="clinic" className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">Consulta presencial</p>
                    <p className="text-sm muted">
                      {p.price_in_person_cents ? money(p.price_in_person_cents) : "Consultar"} · {p.slot_minutes} min
                    </p>
                  </div>
                </div>
              )}
              {p.virtual && (
                <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-fondo p-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl tone-verde">
                    <Icon name="video" className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">Consulta virtual</p>
                    <p className="text-sm muted">
                      {p.price_virtual_cents ? money(p.price_virtual_cents) : "Consultar"} · {p.slot_minutes} min · videollamada
                    </p>
                  </div>
                </div>
              )}
            </div>
            {hours.length > 0 && (
              <>
                <h3 className="mt-5 text-base font-bold">Horario de atención</h3>
                <ul className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
                  {[1, 2, 3, 4, 5, 6, 0]
                    .filter((d) => byDay.has(d))
                    .map((d) => (
                      <li key={d} className="flex justify-between gap-3 rounded-xl bg-fondo px-3 py-2">
                        <span className="font-semibold">{WEEKDAYS[d]}</span>
                        <span className="text-right muted">
                          {byDay
                            .get(d)!
                            .map((h) => `${minutesLabel(h.start_min)}–${minutesLabel(h.end_min)}`)
                            .join(" · ")}
                        </span>
                      </li>
                    ))}
                </ul>
              </>
            )}
          </section>

          {p.in_person && p.lat != null && p.lng != null && (cms?.layout.showMap ?? true) && (
            <section className="card p-5 sm:p-6" aria-labelledby="ubicacion">
              <h2 id="ubicacion" className="text-xl font-extrabold">
                Ubicación
              </h2>
              <p className="mt-1 text-sm muted">
                <Icon name="pin" className="mr-1 inline size-4 align-[-3px]" />
                {p.sector ? `${p.sector}, ` : ""}
                {p.city}. La dirección exacta se comparte al confirmar tu cita.
              </p>
              <div className="mt-3">
                <ClientOnly>{() => <PractitionersMap items={[p]} center={{ lat: p.lat!, lng: p.lng! }} height="h-64" />}</ClientOnly>
              </div>
            </section>
          )}

          <section className="card p-5 sm:p-6" aria-labelledby="opiniones">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 id="opiniones" className="text-xl font-extrabold">
                Opiniones verificadas
              </h2>
              {p.rating != null && p.reviews > 0 && (
                <p className="flex items-center gap-2">
                  <Stars value={p.rating} /> <strong>{p.rating.toFixed(1)}</strong> <span className="muted">· {p.reviews}</span>
                </p>
              )}
            </div>
            <p className="mt-1 text-sm muted">Solo opinan pacientes que asistieron a una cita agendada en buscaDR.</p>
            {reviews.length ? (
              <ul className="mt-4 space-y-3">
                {reviews.map((r) => (
                  <li key={`${r.created_at}-${r.author}`} className="rounded-2xl bg-fondo p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{r.author}</p>
                      <Stars value={r.rating} />
                    </div>
                    {r.body && <p className="mt-1 text-sm text-tinta/90">{r.body}</p>}
                    {r.reply && <p className="mt-2 border-l-2 border-azul/30 pl-3 text-sm muted">Respuesta: {r.reply}</p>}
                    <p className="mt-1 text-xs muted">{dateTime(r.created_at)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-2xl bg-fondo p-4 text-sm muted">Aún no hay opiniones. Las primeras aparecerán después de citas completadas.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
