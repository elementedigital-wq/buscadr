import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Form, Link, useNavigate, useNavigation, useSearchParams, useSubmit } from "react-router";
import { ClientOnly } from "../components/ClientOnly";
import { TONE_CLASS } from "../components/CategoryTiles";
import { CmsIcon, Icon } from "../components/Icon";
import { ListingGrid, ListingRow } from "../components/ListingCard";
import { QuickFilters, activeQuick } from "../components/QuickFilters";
import { EmptyState, Notice, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { serverApiSafe } from "../lib/api.server";
import { money, shortDate, toLocalDate, toLocalInput } from "../lib/format";
import type { PublicListing } from "../lib/types";
import { useRootData } from "../root";
import type { Route } from "./+types/explorar";

const ListingsMap = lazy(() => import("../components/ListingsMap"));

type SearchResult = {
  items: PublicListing[];
  count: number;
  total: number;
  center: { lat: number; lng: number } | null;
  radius: number;
  range: { start: number; end: number } | null;
  rangeError: string | null;
};

const PASS = ["q", "category", "city", "lat", "lng", "radius", "start", "end", "max", "delivery", "sort", "instant"];

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const qs = new URLSearchParams();
  for (const k of PASS) {
    const v = url.searchParams.get(k);
    if (v) qs.set(k, v);
  }
  // «Disponible hoy»: desde la próxima hora en punto, por un día.
  if (url.searchParams.get("hoy") === "1" && !qs.has("start")) {
    const next = Math.ceil(Date.now() / 3_600_000) * 3_600_000;
    qs.set("start", toLocalInput(next));
    qs.set("end", toLocalInput(next + 86_400_000));
  }
  qs.set("limit", "60");
  const result = await serverApiSafe<SearchResult>(context, request, `/api/listings?${qs}`, {
    items: [],
    count: 0,
    total: 0,
    center: null,
    radius: 15,
    range: null,
    rangeError: null,
  });
  return { ...result, params: Object.fromEntries(url.searchParams) };
}

export const meta: Route.MetaFunction = ({ location }) => {
  const filtered = new URLSearchParams(location.search).toString().length > 0;
  return [
    { title: "Explorar equipos en alquiler · buscaDR" },
    { name: "description", content: "Busca herramientas y equipos por zona y fecha en Guayaquil, Samborondón y Daule. Ve el precio total antes de reservar." },
    ...(filtered ? [{ name: "robots", content: "noindex, follow" }] : []),
  ];
};

export default function Explorar({ loaderData }: Route.ComponentProps) {
  const data = useRootData();
  const cms = data?.cms;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const submit = useSubmit();
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const view = params.get("vista") === "mapa" ? "mapa" : params.get("vista") === "fotos" ? "fotos" : "lista";
  const p = loaderData.params as Record<string, string>;
  const cats = (cms?.categories ?? []).filter((c) => c.visible);
  const items = loaderData.items.slice(0, view === "mapa" ? 60 : (cms?.layout.exploreListingCount ?? 36));
  const range = loaderData.range;
  const loading = navigation.state === "loading" && navigation.location?.pathname === "/explorar";

  const setParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    navigate(`/explorar?${next}`, { preventScrollReset: true });
  };

  function locate() {
    if (!("geolocation" in navigator)) return setGeoError("Tu navegador no permite compartir ubicación.");
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setParam({ lat: pos.coords.latitude.toFixed(4), lng: pos.coords.longitude.toFixed(4), city: null, sort: "distancia" });
      },
      () => {
        setLocating(false);
        setGeoError("No pudimos obtener tu ubicación. Elige una ciudad.");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    );
  }

  const center = loaderData.center ?? { lat: -2.15, lng: -79.9 };
  const catName = cats.find((c) => c.slug === p.category)?.name;

  return (
    <div className="container-page">
      <header className="pt-6 sm:pt-8">
        <p className="label-eyebrow">Catálogo · Guayaquil, Samborondón y Daule</p>
        <h1 className="mt-1 text-[1.9rem] leading-tight font-extrabold sm:text-4xl">
          {catName ? `Alquiler de ${catName.toLowerCase()}` : "Encuentra tu próximo equipo"}
        </h1>
      </header>

      <SearchPanel params={p} loading={loading} onToggleFilters={() => setFiltersOpen((v) => !v)} filtersOpen={filtersOpen} />

      <nav aria-label="Categorías" className="scroll-row mt-4 gap-2 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        <button
          type="button"
          onClick={() => setParam({ category: null })}
          aria-pressed={!p.category}
          className={`chip min-h-10 shrink-0 px-4 font-semibold ring-1 ${!p.category ? "bg-morado text-white ring-morado" : "bg-white ring-black/10 hover:ring-morado/40"}`}
        >
          <Icon name="table-cells-large" className="size-3.5" /> Todas
        </button>
        {cats.map((c) => (
          <button
            key={c.slug}
            type="button"
            onClick={() => setParam({ category: c.slug })}
            aria-pressed={p.category === c.slug}
            className={`chip min-h-10 shrink-0 py-1 pr-4 pl-1 whitespace-nowrap ring-1 ${p.category === c.slug ? "bg-morado text-white ring-morado" : "bg-white ring-black/10 hover:ring-morado/40"}`}
          >
            <span className={`grid size-8 place-items-center rounded-full ${TONE_CLASS[c.tone]}`}>
              <CmsIcon value={c.icon} className="size-4" />
            </span>
            {c.name}
          </button>
        ))}
      </nav>
      <div className="mt-3">
        <QuickFilters active={activeQuick(p)} base={Object.fromEntries(["q", "category", "city", "lat", "lng", "radius", "vista"].filter((k) => p[k]).map((k) => [k, p[k]]))} />
      </div>

      {loaderData.rangeError && (
        <div className="mt-3">
          <Notice tone="warning">{loaderData.rangeError}. Mostramos todos los equipos sin filtrar por fecha.</Notice>
        </div>
      )}

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside aria-label="Filtros" className={filtersOpen ? "" : "hidden lg:block"}>
          <Form
            id="filtros"
            method="get"
            className={`card space-y-4 p-4 lg:block ${filtersOpen ? "block" : "hidden"}`}
            onChange={(e) => submit(e.currentTarget, { preventScrollReset: true })}
          >
            {["q", "category", "start", "end", "vista", "instant", "hoy"].map((k) => (p[k] ? <input key={k} type="hidden" name={k} value={p[k]} /> : null))}
            {p.lat && (
              <>
                <input type="hidden" name="lat" value={p.lat} />
                <input type="hidden" name="lng" value={p.lng} />
              </>
            )}
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Filtros</h2>
              <Link to="/explorar" className="text-sm font-semibold text-morado underline underline-offset-2">
                Limpiar
              </Link>
            </div>
            <label className="field">
              Ciudad
              <select name="city" defaultValue={p.lat ? "" : (p.city ?? "")} className="input" disabled={!!p.lat}>
                <option value="">Toda la zona del piloto</option>
                <option>Guayaquil</option>
                <option>Samborondón</option>
                <option>Daule</option>
              </select>
            </label>
            <div>
              <button type="button" onClick={locate} className="btn-outline w-full" disabled={locating}>
                {locating ? <Spinner label="Ubicando" /> : <Icon name="locate" className="size-4" />} {p.lat ? "Actualizar mi ubicación" : "Cerca de mí"}
              </button>
              {p.lat && (
                <button type="button" className="mt-1 text-xs font-semibold text-morado underline" onClick={() => setParam({ lat: null, lng: null })}>
                  Dejar de usar mi ubicación
                </button>
              )}
              {geoError && <p className="mt-1 text-xs text-alerta">{geoError}</p>}
              <p className="mt-1 text-xs muted">Solo la usamos para ordenar por cercanía; no se guarda.</p>
            </div>
            {p.lat && (
              <label className="field">
                Radio: {p.radius ?? 15} km
                <input type="range" name="radius" min={1} max={50} step={1} defaultValue={p.radius ?? 15} className="accent-[var(--color-morado)]" />
              </label>
            )}
            <label className="field">
              Precio máximo por día
              <select name="max" defaultValue={p.max ?? ""} className="input">
                <option value="">Sin límite</option>
                {[500, 1000, 1500, 2500, 4000].map((c) => (
                  <option key={c} value={c}>
                    Hasta {money(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="delivery"
                value="entrega"
                defaultChecked={p.delivery === "entrega"}
                className="size-4 accent-[var(--color-morado)]"
              />
              Con entrega a domicilio
            </label>
            <label className="field">
              Ordenar por
              <select name="sort" defaultValue={p.sort ?? "relevancia"} className="input">
                <option value="relevancia">Recomendados</option>
                <option value="precio">Precio más bajo</option>
                <option value="distancia">Más cercanos</option>
                <option value="valoracion">Mejor valorados</option>
                <option value="nuevos">Más nuevos</option>
              </select>
            </label>
            <noscript>
              <button type="submit" className="btn-primary w-full">
                Aplicar
              </button>
            </noscript>
          </Form>
        </aside>

        <section aria-live="polite" aria-busy={loading} className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-lg font-bold">
                {loaderData.count} {loaderData.count === 1 ? "equipo disponible" : "equipos disponibles"}
                {p.hoy === "1" ? " hoy" : ""}
              </p>
              <p className="text-sm muted">
                {range
                  ? `Del ${shortDate(range.start)} al ${shortDate(range.end)} · total con tarifa de servicio`
                  : "Elige fechas para ver disponibilidad y precio total"}
                {loaderData.center && p.lat ? " · distancia en línea recta" : ""}
              </p>
            </div>
            <div className="flex shrink-0 rounded-full bg-white p-1 ring-1 ring-black/10" role="group" aria-label="Vista">
              {(
                [
                  ["lista", "list", "Lista"],
                  ["fotos", "table-cells-large", "Fotos"],
                  ["mapa", "regular:map", "Mapa"],
                ] as const
              ).map(([v, icon, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setParam({ vista: v === "lista" ? null : v })}
                  aria-pressed={view === v}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold sm:px-4 ${view === v ? "bg-morado text-white" : "text-tinta"}`}
                >
                  <Icon name={icon} className="size-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>

          <div className={`mt-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
            {!items.length ? (
              <NoResults params={p} />
            ) : view === "mapa" && cms?.layout.showMap !== false ? (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                <Suspense fallback={<div className="h-80 rounded-[var(--radius-card)] bg-white" />}>
                  <ClientOnly>{() => <ListingsMap items={items} center={center} radiusKm={p.lat ? loaderData.radius : null} />}</ClientOnly>
                </Suspense>
                <ul className="space-y-2 xl:max-h-[calc(100dvh-12rem)] xl:overflow-y-auto">
                  {items.map((l) => (
                    <li key={l.id}>
                      <Link to={`/equipo/${l.slug}`} className="card flex items-center gap-3 p-2 hover:ring-morado/30">
                        <img src={l.photo ?? ""} alt="" className="size-16 rounded-xl object-cover" loading="lazy" width={64} height={64} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{l.title}</span>
                          <span className="block text-sm muted">
                            {money(l.price_day_cents)}/día · {l.sector || l.city}
                            {l.distance_km != null ? ` · ${l.distance_km} km` : ""}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : view === "fotos" ? (
              <ListingGrid items={items} cms={cms} range={range} fees={data?.fees} />
            ) : (
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 xl:grid-cols-2">
                {items.map((l) => (
                  <li key={l.id}>
                    <ListingRow l={l} cms={cms} range={range} fees={data?.fees} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          {items.length > 0 && <AskCommunity params={p} />}
        </section>
      </div>
    </div>
  );
}

/** Sin resultados: se ofrece guardar la búsqueda (demanda no resuelta, §10) y alternativas. */
function NoResults({ params }: { params: Record<string, string> }) {
  const data = useRootData();
  const [state, setState] = useState<string | null>(null);
  async function notify() {
    try {
      const res = await api<{ message: string }>("/api/listings/demand", {
        body: { query: params.q, category: params.category, city: params.city, start: params.start },
      });
      setState(res.message);
    } catch (e) {
      setState((e as Error).message);
    }
  }
  return (
    <EmptyState
      title="Todavía no hay equipos así en esa zona o fecha"
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {state ? (
            <p className="text-sm font-semibold text-morado">{state}</p>
          ) : (
            <button type="button" className="btn-primary" onClick={notify}>
              <Icon name="bolt" className="size-4" /> Avísame cuando haya
            </button>
          )}
          <Link to="/explorar" className="btn-outline">
            Ver todo el catálogo
          </Link>
        </div>
      }
    >
      Prueba otras fechas, amplía el radio o quita filtros. {data?.user ? "" : "Si inicias sesión, te avisamos cuando alguien publique uno cerca."} ¿Tienes este
      equipo?{" "}
      <Link to="/publicar" className="font-semibold text-morado underline">
        Publícalo y genera ingresos
      </Link>
      .
    </EmptyState>
  );
}

/** Buscador de Explorar: texto con sugerencias (categorías y búsquedas frecuentes) y fechas. */
function SearchPanel({
  params,
  loading,
  onToggleFilters,
  filtersOpen,
}: { params: Record<string, string>; loading: boolean; onToggleFilters: () => void; filtersOpen: boolean }) {
  const data = useRootData();
  const navigate = useNavigate();
  const [q, setQ] = useState(params.q ?? "");
  const [focus, setFocus] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setQ(params.q ?? ""), [params.q]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setFocus(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const today = toLocalDate(Date.now());
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const cats = (data?.cms?.categories ?? []).filter((c) => c.visible && (!q || norm(c.name).includes(norm(q))));
  const sugg = (data?.cms?.home.suggestions ?? []).filter((s) => !q || norm(s).includes(norm(q)));
  const keep = ["category", "lat", "lng", "vista", "city", "sort", "max", "delivery", "instant"];
  return (
    <Form method="get" className="card mt-5 p-2" role="search" onSubmit={() => setFocus(false)}>
      {keep.map((k) => (params[k] ? <input key={k} type="hidden" name={k} value={params[k]} /> : null))}
      <div className="flex items-center gap-2">
        <div ref={box} className="relative min-w-0 flex-1">
          <label className="relative flex items-center">
            <span className="sr-only">Qué necesitas</span>
            <Icon name="search" className="pointer-events-none absolute left-3.5 size-4 text-gris" />
            <input
              name="q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setFocus(true)}
              placeholder="Taladro, proyector, lavar el patio…"
              autoComplete="off"
              enterKeyHint="search"
              className="min-h-12 w-full min-w-0 rounded-2xl bg-fondo pr-11 pl-10 text-base outline-none ring-2 ring-transparent focus:bg-white focus:ring-morado/30"
            />
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  if (params.q) {
                    const next = new URLSearchParams(params);
                    next.delete("q");
                    navigate(`/explorar?${next}`);
                  }
                }}
                className="absolute right-2 grid size-8 place-items-center rounded-full text-gris hover:bg-black/5"
                aria-label="Borrar búsqueda"
              >
                <Icon name="circle-xmark" className="size-4" />
              </button>
            )}
          </label>
          {focus && (cats.length > 0 || sugg.length > 0) && (
            <ul className="card absolute inset-x-0 top-[calc(100%+0.5rem)] z-30 max-h-80 overflow-y-auto p-1.5 text-sm" aria-label="Sugerencias">
              {cats.slice(0, 4).map((c) => (
                <li key={c.slug}>
                  <Link
                    to={`/explorar?category=${c.slug}`}
                    onClick={() => setFocus(false)}
                    className="flex min-h-11 items-center gap-3 rounded-xl px-2.5 hover:bg-fondo"
                  >
                    <span className={`grid size-8 shrink-0 place-items-center rounded-xl ${TONE_CLASS[c.tone]}`}>
                      <CmsIcon value={c.icon} className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <Icon name="chevron-right" className="size-3 text-gris" />
                  </Link>
                </li>
              ))}
              {sugg.slice(0, 5).map((s) => (
                <li key={s}>
                  <Link
                    to={`/explorar?q=${encodeURIComponent(s)}`}
                    onClick={() => setFocus(false)}
                    className="flex min-h-11 items-center gap-3 rounded-xl px-2.5 hover:bg-fondo"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-fondo text-gris">
                      <Icon name="magnifying-glass" className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{s}</span>
                    <Icon name="chevron-right" className="size-3 text-gris" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={onToggleFilters}
          aria-expanded={filtersOpen}
          aria-controls="filtros"
          className={`icon-btn size-12 rounded-2xl shadow-none lg:hidden ${filtersOpen ? "bg-morado text-white ring-morado" : ""}`}
          aria-label="Filtros y orden"
        >
          <Icon name="sliders" className="size-4" />
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <label className="flex min-w-0 flex-col rounded-xl bg-fondo px-3.5 py-1.5">
          <span className="text-[11px] font-semibold tracking-wide uppercase muted">Retiro</span>
          <input type="date" name="start" min={today} defaultValue={params.start?.slice(0, 10)} className="min-h-7 w-full min-w-0 bg-transparent text-[15px] outline-none" />
        </label>
        <label className="flex min-w-0 flex-col rounded-xl bg-fondo px-3.5 py-1.5">
          <span className="text-[11px] font-semibold tracking-wide uppercase muted">Devolución</span>
          <input type="date" name="end" min={today} defaultValue={params.end?.slice(0, 10)} className="min-h-7 w-full min-w-0 bg-transparent text-[15px] outline-none" />
        </label>
        <button type="submit" className="btn-primary col-span-2 sm:col-span-1">
          {loading ? <Spinner label="Buscando" /> : <Icon name="search" className="size-4" />} Buscar
        </button>
      </div>
    </Form>
  );
}

/** «Pedir a la comunidad»: deja el pedido para que propietarios cercanos publiquen (demanda no resuelta). */
function AskCommunity({ params }: { params: Record<string, string> }) {
  const [state, setState] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function ask() {
    setBusy(true);
    try {
      const res = await api<{ message: string }>("/api/listings/demand", {
        body: { query: params.q, category: params.category, city: params.city, start: params.start },
      });
      setState(res.message);
    } catch (e) {
      setState((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-6 flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-dashed border-black/15 p-5 text-center">
      <p className="text-sm muted">¿No es lo que buscas? Deja tu pedido y avisamos a propietarios de tu zona.</p>
      {state ? (
        <p className="text-sm font-semibold text-morado" role="status">
          {state}
        </p>
      ) : (
        <button type="button" className="btn-outline" onClick={ask} disabled={busy}>
          {busy ? <Spinner label="Enviando" /> : <Icon name="tower-broadcast" className="size-4" />} Pedir a la comunidad
        </button>
      )}
    </div>
  );
}
