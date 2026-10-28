import { Link } from "react-router";
import { DEFAULT_CMS } from "../../server/cms/model";
import { CmsIcon, Icon } from "../components/Icon";
import { PractitionerCard } from "../components/PractitionerCard";
import { SearchBar } from "../components/SearchBar";
import { SpecialtyChips, SpecialtyGrid } from "../components/Specialties";
import { Avatar, StatusBadge } from "../components/ui";
import { serverApiSafe } from "../lib/api.server";
import { firstName, greeting, money, whenLabel } from "../lib/format";
import type { Cms, PublicPractitioner } from "../lib/types";
import { useRootData } from "../root";
import type { Route } from "./+types/home";

type Next = {
  id: number;
  status: string;
  status_label: string;
  start_ms: number;
  modality: "presencial" | "virtual";
  payment_status: string;
  slug: string;
  name: string;
  specialty: string;
  photo: string;
  demo: boolean;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const [{ items }, home] = await Promise.all([
    serverApiSafe<{ items: (PublicPractitioner & { featured?: boolean })[] }>(context, request, "/api/practitioners?limit=24", { items: [] }),
    serverApiSafe<{ next: Next | null; counts: { unread: number } } | null>(context, request, "/api/me/home", null),
  ]);
  const now = Date.now();
  const counts: Record<string, number> = {};
  for (const p of items) counts[p.specialty] = (counts[p.specialty] ?? 0) + 1;
  return { items, counts, next: home?.next ? { ...home.next, when: whenLabel(home.next.start_ms, now) } : null, greeting: greeting(now) };
}

export const meta: Route.MetaFunction = ({ matches }) => {
  const root = matches.find((m) => m?.id === "root")?.loaderData as { origin?: string; cms?: Cms | null } | undefined;
  const origin = root?.origin ?? "";
  const seo = root?.cms?.seo ?? DEFAULT_CMS.seo;
  return [
    { title: seo.title },
    { name: "description", content: seo.description },
    { property: "og:title", content: "buscaDR · Confianza para encontrar salud" },
    { property: "og:description", content: seo.description },
    { property: "og:image", content: `${origin}/assets/hero-doctor.webp` },
    { property: "og:locale", content: "es_EC" },
    { name: "twitter:card", content: "summary_large_image" },
    { tagName: "link", rel: "canonical", href: `${origin}/` },
  ];
};

function NextAppointment({ next }: { next: Next & { when: string } }) {
  return (
    <section className="container-page mt-6" aria-labelledby="proxima">
      <div className="bg-brand relative overflow-hidden rounded-[var(--radius-card)] p-4 text-white shadow-[var(--shadow-float)] sm:p-6">
        <div className="relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
          <Avatar name={next.name} photo={next.photo} size={64} rounded="xl" />
          <div className="min-w-0">
            <p id="proxima" className="text-xs font-bold tracking-[0.14em] text-white/85 uppercase">
              Tu próxima cita
            </p>
            <p className="font-display text-xl font-extrabold break-words">{next.name}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/90">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="calendar" className="size-4" /> {next.when}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name={next.modality === "virtual" ? "video" : "clinic"} className="size-4" /> {next.modality === "virtual" ? "Virtual" : "Presencial"}
              </span>
            </p>
          </div>
          <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1">
            <StatusBadge status={next.status} label={next.status_label} />
            <Link to={`/citas/${next.id}`} className="btn btn-sm bg-white text-azul-ink hover:bg-celeste">
              Ver detalles <Icon name="arrow" className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const root = useRootData();
  const cms = root?.cms ?? (DEFAULT_CMS as Cms);
  const user = root?.user;
  const { items, counts, next } = loaderData;
  const featured = items.slice(0, cms.layout.homeDoctorCount);
  const hero = cms.hero;
  const home = cms.home;
  const spotlight = items.find((p) => p.photo) ?? items[0];
  return (
    <>
      <section className="surface-hero overflow-hidden">
        <div className="container-page grid items-center gap-8 pt-8 pb-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:pt-14 lg:pb-16">
          <div className="min-w-0">
            {user ? (
              <p className="flex items-center gap-2 text-sm font-semibold text-azul">
                <Icon name="sun" className="size-4" /> {loaderData.greeting}, {firstName(user.name)} ·{" "}
                <span data-cms="home.greetingSubtitle" className="font-medium text-tinta">
                  {home.greetingSubtitle}
                </span>
              </p>
            ) : (
              <p className="label-eyebrow" data-cms="hero.eyebrow">
                <Icon name="shield" className="mr-1.5 inline size-3.5 align-[-2px]" />
                {hero.eyebrow}
              </p>
            )}
            <h1 className="mt-3 text-4xl leading-[1.05] font-extrabold sm:text-5xl lg:text-6xl">
              <span data-cms="hero.title">{hero.title}</span>{" "}
              <span className="text-verde-ink" data-cms="hero.highlight">
                {hero.highlight}
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-lg muted" data-cms="hero.description">
              {hero.description}
            </p>
            <div className="mt-6">
              <SearchBar placeholder={home.searchPlaceholder} cities={root?.catalog.cities ?? []} cta={hero.cta} />
            </div>
            {home.suggestions.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" data-cms="home.suggestions">
                <span className="muted">Populares:</span>
                {home.suggestions.map((s) => (
                  <Link
                    key={s}
                    to={`/buscar?q=${encodeURIComponent(s)}`}
                    className="chip bg-white px-3 py-1.5 font-semibold ring-1 ring-tinta/10 hover:ring-azul/40"
                  >
                    {s}
                  </Link>
                ))}
              </div>
            )}
            <ul className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4" data-cms="home.features">
              {home.features.map((f) => (
                <li key={f.title} className="flex min-w-0 flex-col items-start gap-2">
                  <span className="grid size-11 place-items-center rounded-2xl bg-white text-azul shadow-sm ring-1 ring-tinta/5">
                    <CmsIcon value={f.icon} className="size-5" />
                  </span>
                  <span className="text-sm leading-tight font-semibold">{f.title}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative mx-auto hidden w-full max-w-md lg:block">
            <div className="blob-azul absolute inset-x-6 top-10 bottom-0 opacity-90" aria-hidden />
            <div className="blob-verde absolute -right-6 bottom-10 size-40 opacity-70" aria-hidden />
            <img
              src={hero.image}
              alt={hero.imageAlt}
              className="relative z-[1] aspect-[4/5] w-full rounded-[2.5rem] object-cover object-top shadow-[var(--shadow-float)]"
              width={420}
              height={525}
              data-cms="hero.image"
            />
            <div className="card absolute -left-10 top-16 z-[2] flex max-w-64 items-center gap-3 p-3" data-cms="hero.badgeTitle">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl tone-verde">
                <Icon name="calendar-check" className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{hero.badgeTitle}</span>
                <span className="block text-xs muted">{hero.badgeText}</span>
              </span>
            </div>
            {spotlight && (
              <Link to={`/doctor/${spotlight.slug}`} className="card absolute -right-6 bottom-10 z-[2] flex max-w-72 items-center gap-3 p-3 hover:ring-azul/30">
                <Avatar name={spotlight.name} photo={spotlight.photo} size={52} rounded="xl" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{spotlight.name}</span>
                  <span className="block truncate text-xs muted">{spotlight.specialty_name}</span>
                  {spotlight.next_slot_ms && <span className="mt-0.5 block text-xs font-semibold text-verde-ink">{whenLabel(spotlight.next_slot_ms)}</span>}
                </span>
              </Link>
            )}
          </div>
        </div>
      </section>

      {cms.layout.showUpcoming && next && <NextAppointment next={next} />}

      <section className="container-page mt-10" aria-labelledby="especialidades">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="especialidades" className="text-2xl font-extrabold sm:text-3xl" data-cms="copy.specialtiesTitle">
              {cms.copy.specialtiesTitle}
            </h2>
            <p className="mt-1 muted" data-cms="copy.specialtiesSubtitle">
              {cms.copy.specialtiesSubtitle}
            </p>
          </div>
          <Link to="/especialidades" className="btn-ghost btn-sm">
            Ver todas <Icon name="arrow" className="size-4" />
          </Link>
        </div>
        <div className="md:hidden">
          <SpecialtyChips cms={cms} />
        </div>
        <div className="hidden md:block">
          <SpecialtyGrid cms={cms} limit={cms.layout.homeSpecialtyCount} counts={counts} />
        </div>
      </section>

      <section className="container-page mt-12" aria-labelledby="destacados">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="destacados" className="text-2xl font-extrabold sm:text-3xl" data-cms="copy.doctorsTitle">
              {cms.copy.doctorsTitle}
            </h2>
            <p className="mt-1 muted" data-cms="copy.doctorsSubtitle">
              {cms.copy.doctorsSubtitle}
            </p>
          </div>
          <Link to="/buscar" className="btn-ghost btn-sm" data-cms="buttons.explore">
            {cms.buttons.explore} <Icon name="arrow" className="size-4" />
          </Link>
        </div>
        <ul className={`grid gap-4 sm:grid-cols-2 ${cms.layout.columns >= 3 ? "lg:grid-cols-3" : ""}`}>
          {featured.map((p) => (
            <li key={p.id}>
              <PractitionerCard p={p} cms={cms} layout="tile" />
            </li>
          ))}
        </ul>
      </section>

      {cms.layout.showBanners && cms.banners.some((b) => b.visible) && (
        <section className="container-page mt-12 grid gap-4 md:grid-cols-2" aria-label="Novedades">
          {cms.banners
            .filter((b) => b.visible)
            .map((b) => (
              <Link
                key={b.id}
                to={
                  b.route === "inicio"
                    ? "/"
                    : b.route === "buscar" && b.specialty
                      ? `/buscar?especialidad=${b.specialty}`
                      : b.route === "buscar"
                        ? "/buscar?modalidad=virtual"
                        : `/${b.route}`
                }
                className="group relative flex min-h-56 overflow-hidden rounded-[var(--radius-card)] bg-tinta text-white shadow-[var(--shadow-card)]"
                data-cms={`banners.${b.id}`}
              >
                {b.image && (
                  <img src={b.image} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-45 transition group-hover:scale-105" />
                )}
                <span className="absolute inset-0 bg-gradient-to-r from-tinta/95 via-tinta/75 to-transparent" aria-hidden />
                <span className="relative flex max-w-md flex-col justify-end gap-2 p-6">
                  <span className="font-display text-2xl leading-tight font-extrabold">{b.title}</span>
                  <span className="text-sm text-white/85">{b.subtitle}</span>
                  {b.button && (
                    <span className="btn btn-sm mt-2 self-start bg-white text-tinta">
                      {b.button} <Icon name="arrow" className="size-4" />
                    </span>
                  )}
                </span>
              </Link>
            ))}
        </section>
      )}

      {cms.layout.showSteps && (
        <section className="container-page mt-14" aria-labelledby="pasos">
          <h2 id="pasos" className="text-2xl font-extrabold sm:text-3xl" data-cms="home.stepsTitle">
            {home.stepsTitle}
          </h2>
          <ol className="mt-5 grid gap-4 md:grid-cols-3" data-cms="home.steps">
            {home.steps.map((s, i) => (
              <li key={s.title} className="card flex gap-4 p-5">
                <span className="relative grid size-12 shrink-0 place-items-center rounded-2xl tone-azul">
                  <CmsIcon value={s.icon} className="size-5" />
                  <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-verde text-xs font-bold text-tinta">{i + 1}</span>
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-lg font-bold">{s.title}</span>
                  <span className="mt-1 block text-sm muted">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="container-page mt-12 grid gap-4 lg:grid-cols-2">
        <article className="card flex flex-col gap-4 overflow-hidden p-6 sm:flex-row sm:items-center" data-cms="home.virtualTitle">
          <span className="grid size-16 shrink-0 place-items-center rounded-3xl tone-verde">
            <Icon name="video" className="size-7" />
          </span>
          <div className="min-w-0">
            <p className="label-eyebrow">{home.virtualEyebrow}</p>
            <h2 className="mt-1 text-xl font-extrabold">{home.virtualTitle}</h2>
            <p className="mt-1 text-sm muted">{home.virtualText}</p>
            <Link to="/buscar?modalidad=virtual" className="btn-accent btn-sm mt-3">
              Ver consultas virtuales
            </Link>
          </div>
        </article>
        {cms.layout.showWhatsapp && (
          <article className="card flex flex-col gap-4 overflow-hidden p-6 sm:flex-row sm:items-center" data-cms="home.whatsappTitle">
            <span className="grid size-16 shrink-0 place-items-center rounded-3xl tone-verde">
              <Icon name="whatsapp" className="size-8" />
            </span>
            <div className="min-w-0">
              <p className="label-eyebrow">{home.whatsappEyebrow}</p>
              <h2 className="mt-1 text-xl font-extrabold">{home.whatsappTitle}</h2>
              <p className="mt-1 text-sm muted">{home.whatsappText}</p>
              <Link to="/cuenta#whatsapp" className="btn-outline btn-sm mt-3">
                Activar avisos por WhatsApp
              </Link>
            </div>
          </article>
        )}
      </section>

      {cms.layout.showPromises && (
        <section className="container-page mt-12" aria-label="Compromisos de buscaDR">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-cms="home.promises">
            {home.promises.map((p) => (
              <li key={p.title} className="flex min-w-0 gap-3 rounded-[var(--radius-card)] bg-white p-4 ring-1 ring-tinta/5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl tone-cielo">
                  <CmsIcon value={p.icon} className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">{p.title}</span>
                  <span className="block text-sm muted">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="container-page mt-14" aria-labelledby="profesionales">
        <div className="bg-brand-dark relative grid overflow-hidden rounded-[2rem] text-white lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="relative z-[1] p-6 sm:p-10">
            <p className="text-xs font-bold tracking-[0.14em] text-[#6ee7b7] uppercase" data-cms="home.proEyebrow">
              {home.proEyebrow}
            </p>
            <h2 id="profesionales" className="mt-2 text-3xl font-extrabold text-white sm:text-4xl" data-cms="home.proTitle">
              {home.proTitle}
            </h2>
            <p className="mt-3 max-w-xl text-white/85" data-cms="home.proText">
              {home.proText}
            </p>
            <ul className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
              {["Calendario y confirmación de citas", "Confirmación desde WhatsApp", "Tarifa presencial y virtual", "Cobro con tarjeta y liquidación"].map(
                (t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Icon name="check-circle" className="size-4 text-[#6ee7b7]" /> {t}
                  </li>
                ),
              )}
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/para-profesionales" className="btn btn-sm bg-white text-tinta hover:bg-celeste" data-cms="buttons.pro">
                {cms.buttons.pro}
              </Link>
              {cms.layout.showPlans && (
                <Link to="/planes" className="btn btn-sm text-white ring-1 ring-white/40 hover:bg-white/10">
                  Planes desde {money(1500)}/mes
                </Link>
              )}
            </div>
          </div>
          <img
            src="/assets/fotos/profesional.webp"
            alt="Médico usando el panel de buscaDR"
            loading="lazy"
            className="hidden h-full w-full object-cover lg:block"
          />
        </div>
      </section>
    </>
  );
}
