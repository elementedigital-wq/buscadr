import { Link } from "react-router";
import { DEFAULT_CMS } from "../../server/cms/model";
import { ServicesRow, visibleCategories } from "../components/CategoryTiles";
import { BriefCard, type BriefItem, type HomeData, QuickSearch, TrackerCard } from "../components/HomeBlocks";
import { CmsIcon, Icon } from "../components/Icon";
import { ListingGrid } from "../components/ListingCard";
import { serverApiSafe } from "../lib/api.server";
import { greeting, timeLeft, whenLabel } from "../lib/format";
import type { Cms, PublicListing } from "../lib/types";
import { useRootData } from "../root";
import type { Route } from "./+types/home";

type RawItem = Omit<BriefItem, "when" | "until" | "left"> & { hold_expires_ms: number | null };
type RawHome = { active: RawItem | null; pending: { count: number; first: RawItem | null }; waiting: number; steps: HomeData["steps"] };

export async function loader({ request, context }: Route.LoaderArgs) {
  const [{ items }, raw] = await Promise.all([
    serverApiSafe<{ items: PublicListing[] }>(context, request, "/api/listings?limit=24&log=0", { items: [] }),
    serverApiSafe<RawHome | null>(context, request, "/api/me/home", null),
  ]);
  // Textos relativos («mañana 9:00», «en 5 h») calculados en el servidor: SSR e hidratación coinciden.
  const now = Date.now();
  const enrich = (b: RawItem | null): BriefItem | null =>
    b
      ? {
          ...b,
          when: whenLabel(b.start_ms, now),
          until: whenLabel(b.end_ms, now),
          left: b.hold_expires_ms ? timeLeft(b.hold_expires_ms, now) : null,
        }
      : null;
  const home: HomeData | null = raw
    ? { active: enrich(raw.active), pending: { count: raw.pending.count, first: enrich(raw.pending.first) }, waiting: raw.waiting, steps: raw.steps }
    : null;
  return { items, home, greeting: greeting(now) };
}

export const meta: Route.MetaFunction = ({ matches }) => {
  const root = matches.find((m) => m?.id === "root")?.loaderData as { origin?: string; cms?: Cms | null } | undefined;
  const origin = root?.origin ?? "";
  const seo = root?.cms?.seo ?? DEFAULT_CMS.seo;
  return [
    { title: seo.title },
    { name: "description", content: seo.description },
    { property: "og:title", content: "buscaDR · Herramientas a tu alcance" },
    { property: "og:description", content: seo.description },
    { property: "og:image", content: `${origin}/assets/fotos/hero.webp` },
    { property: "og:locale", content: "es_EC" },
    { name: "twitter:card", content: "summary_large_image" },
    { tagName: "link", rel: "canonical", href: `${origin}/` },
  ];
};

function pendingLine(home: HomeData | null) {
  if (!home) return null;
  const n = home.pending.count + (home.active ? 1 : 0) + (home.waiting > 0 ? 1 : 0);
  if (!n) return null;
  return n === 1 ? "Una cosa necesita tu atención." : `${n} cosas necesitan tu atención.`;
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const data = useRootData();
  const cms = (data?.cms ?? null) as Cms | null;
  const user = data?.user;
  const hero = cms?.hero ?? DEFAULT_CMS.hero;
  const home = cms?.home ?? DEFAULT_CMS.home;
  const layout = cms?.layout;
  const banners = (cms?.banners ?? []).filter((b) => b.visible && layout?.showBanners);
  const items = loaderData.items.slice(0, layout?.homeListingCount ?? 8);
  const personal = loaderData.home;
  const firstName = user?.name.split(/\s+/)[0] ?? "";
  const place = [user?.sector, user?.city].filter(Boolean).join(" · ");
  const cats = visibleCategories(cms);
  // El resumen ya muestra la reserva activa salvo cuando prioriza solicitudes por responder.
  const showTracker = layout?.showTracker !== false && !!personal?.active && (!!personal.pending.first || layout?.showBrief === false);
  const bannerHref = (b: (typeof banners)[number]) =>
    b.route === "inicio" ? "/" : b.route === "explorar" && b.category ? `/explorar?category=${b.category}` : `/${b.route}`;

  return (
    <>
      <section className="relative overflow-hidden bg-white">
        <div className="blob-turquesa pointer-events-none absolute -right-24 -top-32 hidden size-[26rem] opacity-90 lg:block" aria-hidden />
        <div className="container-page relative grid items-start gap-8 pt-5 pb-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12 lg:py-12">
          <div className="min-w-0">
            {user && (
              <Link
                to={user.city ? `/explorar?city=${encodeURIComponent(user.city)}` : "/explorar"}
                className="chip max-w-full bg-lila py-1.5 text-[13px] font-semibold text-morado"
              >
                <Icon name="location-dot" className="size-3.5" />
                <span className="truncate">{place}</span>
                <Icon name="chevron-down" className="size-3" />
              </Link>
            )}

            {user ? (
              <h1 className="mt-4 text-[2rem] leading-[1.08] font-extrabold sm:text-5xl">
                {loaderData.greeting}, {firstName}.
                <span className="mt-1 block text-gris" data-cms="home.greetingSubtitle">
                  {pendingLine(personal) ?? home.greetingSubtitle}
                </span>
              </h1>
            ) : (
              <>
                <p className="label-eyebrow mt-1" data-cms="hero.eyebrow">
                  {hero.eyebrow}
                </p>
                <h1 className="mt-2 text-[2.15rem] leading-[1.05] font-extrabold sm:text-5xl lg:text-[3.4rem]">
                  <span data-cms="hero.title">{hero.title}</span>{" "}
                  <span className="text-morado" data-cms="hero.highlight">
                    {hero.highlight}
                  </span>
                </h1>
                <p className="mt-3 max-w-xl text-base muted sm:text-lg" data-cms="hero.description">
                  {hero.description}
                </p>
              </>
            )}

            <div className="mt-6">
              <QuickSearch placeholder={home.searchPlaceholder} cta={hero.cta} />
            </div>
            <ul className="scroll-row mt-3 gap-2 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" data-cms="home.suggestions">
              {home.suggestions.map((s) => (
                <li key={s} className="shrink-0">
                  <Link
                    to={`/explorar?q=${encodeURIComponent(s)}`}
                    className="chip bg-fondo whitespace-nowrap text-tinta ring-1 ring-black/10 hover:ring-morado/40"
                  >
                    {s}
                  </Link>
                </li>
              ))}
            </ul>

            {cms && layout?.showBrief !== false && (
              <div className="mt-6">
                <BriefCard home={personal} cms={cms} signedIn={!!user} />
              </div>
            )}
          </div>

          <div className="relative mx-auto hidden w-full max-w-md lg:block">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[2.2rem] bg-lila shadow-[var(--shadow-card)]" data-cms="hero.image">
              <img
                src={hero.image || "/assets/fotos/hero.webp"}
                alt={home.heroImageAlt}
                className="size-full object-cover"
                width={710}
                height={941}
                fetchPriority="high"
              />
            </div>
            <div className="card absolute -bottom-5 -left-8 flex max-w-[85%] items-center gap-3 p-3 pr-5" data-cms="home.heroBadgeTitle">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-turquesa text-tinta">
                <Icon name="tag" className="size-4" />
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{home.heroBadgeTitle}</p>
                <p className="muted">{home.heroBadgeText}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {layout?.showServicesRow !== false && cats.length > 0 && (
        <section className="container-page mt-8" aria-labelledby="servicios">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 id="servicios" className="text-xl font-extrabold sm:text-2xl" data-cms="home.servicesTitle">
              {home.servicesTitle}
            </h2>
            <Link to="/categorias" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-morado" data-cms="home.servicesLink">
              {home.servicesLink} {cats.length} <Icon name="chevron-right" className="size-3" />
            </Link>
          </div>
          <ServicesRow cms={cms} limit={layout?.homeCategoryCount ?? 10} />
        </section>
      )}

      {showTracker && personal?.active && (
        <section className="container-page mt-6" aria-label="Reserva activa">
          <TrackerCard item={personal.active} />
        </section>
      )}

      {banners.length > 0 && (
        <section className="container-page mt-10" aria-label="Campañas">
          <ul className="scroll-row md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0">
            {banners.map((b, i) => (
              <li key={b.id} className="w-[85%] shrink-0 snap-start sm:w-[60%] md:w-auto">
                <Link
                  to={bannerHref(b)}
                  className={`group relative flex h-full min-h-44 overflow-hidden rounded-[var(--radius-card)] p-5 transition hover:-translate-y-0.5 hover:shadow-lg sm:p-6 ${i % 2 ? "tone-card-turquesa" : "tone-card-morado"}`}
                  data-cms={`banners.${cms?.banners.indexOf(b)}`}
                >
                  <div className="relative z-10 flex max-w-[62%] flex-col">
                    <p className="font-display text-lg leading-tight font-extrabold sm:text-xl">{b.title}</p>
                    <p className="mt-1.5 text-sm leading-snug muted">{b.subtitle}</p>
                    {b.button && (
                      <span className="btn-primary mt-auto min-h-10 self-start px-4 text-sm">
                        {b.button} <Icon name="arrow" className="size-3.5 transition group-hover:translate-x-0.5" />
                      </span>
                    )}
                  </div>
                  {b.image && (
                    <img
                      src={b.image}
                      alt=""
                      className="absolute top-1/2 -right-6 h-[115%] w-[45%] -translate-y-1/2 rounded-l-[2rem] object-cover shadow-md"
                      loading="lazy"
                      width={300}
                      height={300}
                    />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="container-page mt-12" aria-labelledby="disponibles">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 id="disponibles" className="text-2xl font-extrabold sm:text-3xl" data-cms="copy.listingsTitle">
              {cms?.copy.listingsTitle}
            </h2>
            <p className="mt-1 muted" data-cms="copy.listingsSubtitle">
              {cms?.copy.listingsSubtitle}
            </p>
          </div>
          <Link to="/explorar" className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-morado sm:inline-flex" data-cms="buttons.explore">
            {cms?.buttons.explore} <Icon name="chevron-right" className="size-3" />
          </Link>
        </div>
        <div className="mt-5">
          <ListingGrid items={items} cms={cms} />
        </div>
        <Link to="/explorar" className="btn-outline mt-5 w-full sm:hidden">
          {cms?.buttons.explore}
        </Link>
      </section>

      <section className="container-page mt-14" aria-labelledby="pasos">
        <div className="relative grid gap-6 overflow-hidden rounded-[var(--radius-card)] bg-morado p-6 text-white shadow-[var(--shadow-card)] sm:p-10 lg:grid-cols-3">
          <div className="blob-turquesa pointer-events-none absolute -top-16 -right-16 size-48 opacity-70" aria-hidden />
          <h2 id="pasos" className="relative text-2xl font-extrabold text-white lg:col-span-3" data-cms="home.stepsTitle">
            {home.stepsTitle}
          </h2>
          {home.steps.map((step, i) => (
            <div key={step.title + String(i)} className="relative flex gap-4" data-cms={`home.steps.${i}`}>
              <span className="relative grid size-12 shrink-0 place-items-center rounded-2xl bg-white/12 ring-1 ring-white/25">
                <CmsIcon value={step.icon} className="size-5 text-white" />
                <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-turquesa text-[11px] font-extrabold text-tinta">
                  {i + 1}
                </span>
              </span>
              <div className="min-w-0">
                <p className="font-display text-lg font-bold">{step.title}</p>
                <p className="text-white/85">{step.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="container-page mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Compromisos del piloto">
        {home.promises.map((p, i) => (
          <div key={p.title + String(i)} className="card p-5" data-cms={`home.promises.${i}`}>
            <span className={`grid size-12 place-items-center rounded-2xl ${["tone-morado", "tone-turquesa", "tone-azul", "tone-morado"][i % 4]}`}>
              <CmsIcon value={p.icon} className="size-5" />
            </span>
            <p className="mt-3 font-display font-bold">{p.title}</p>
            <p className="mt-1 text-sm muted">{p.text}</p>
          </div>
        ))}
      </section>

      <section className="container-page mt-14 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="card grid overflow-hidden md:grid-cols-[1fr_0.8fr]" data-cms="home.ownerTitle">
          <div className="flex flex-col justify-between gap-4 p-6 sm:p-8">
            <div>
              <p className="label-eyebrow">{home.ownerEyebrow}</p>
              <h2 className="mt-2 text-2xl font-extrabold">{home.ownerTitle}</h2>
              <p className="mt-2 muted">{home.ownerText}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/publicar" className="btn-primary" data-cms="buttons.publish">
                <Icon name="plus" className="size-4" /> {cms?.buttons.publish}
              </Link>
              <Link to="/como-funciona#propietarios" className="btn-ghost">
                Ver comisiones
              </Link>
            </div>
          </div>
          <img src="/assets/fotos/propietario.webp" alt="" className="hidden h-full w-full object-cover md:block" loading="lazy" width={415} height={1100} />
        </div>
        <div className="grid gap-4">
          <div className="card flex flex-col justify-between gap-3 p-6 tone-card-turquesa sm:p-7" data-cms="home.whatsappTitle">
            <p className="label-eyebrow inline-flex items-center gap-1.5">
              <Icon name="whatsapp" className="size-4" /> {home.whatsappEyebrow}
            </p>
            <h2 className="text-xl font-extrabold">{home.whatsappTitle}</h2>
            <p className="text-sm text-tinta/85">{home.whatsappText}</p>
            <Link to="/cuenta#whatsapp" className="btn-outline self-start">
              <Icon name="regular:bell" className="size-4" /> Activar avisos
            </Link>
          </div>
          <div className="card flex items-stretch gap-4 overflow-hidden p-0" data-cms="home.eventsTitle">
            <img src="/assets/fotos/sonido.webp" alt="" className="w-28 shrink-0 object-cover sm:w-40" loading="lazy" width={160} height={210} />
            <div className="min-w-0 py-5 pr-5">
              <p className="label-eyebrow">{home.eventsEyebrow}</p>
              <h2 className="mt-1 text-lg font-extrabold">{home.eventsTitle}</h2>
              <p className="mt-1 text-sm muted">{home.eventsText}</p>
              <Link to="/explorar?category=eventos" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-morado">
                {home.eventsButton} <Icon name="arrow" className="size-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
