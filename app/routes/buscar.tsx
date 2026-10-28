import { Form, Link, useSearchParams } from "react-router";
import { ClientOnly } from "../components/ClientOnly";
import { Icon } from "../components/Icon";
import { PractitionerCard } from "../components/PractitionerCard";
import PractitionersMap from "../components/PractitionersMap";
import { SearchBar } from "../components/SearchBar";
import { SpecialtyChips, specialtyName } from "../components/Specialties";
import { EmptyState } from "../components/ui";
import { serverApiSafe } from "../lib/api.server";
import type { PublicPractitioner } from "../lib/types";
import { useRootData } from "../root";
import type { Route } from "./+types/buscar";

type Result = { items: (PublicPractitioner & { featured?: boolean })[]; specialty: string | null; city: string | null; modality: string | null; sort: string };

/** Parámetros en español en la URL (compartibles e indexables) → parámetros de la API. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const p = url.searchParams;
  const qs = new URLSearchParams();
  if (p.get("q")) qs.set("q", p.get("q")!);
  if (p.get("especialidad")) qs.set("specialty", p.get("especialidad")!);
  if (p.get("ciudad")) qs.set("city", p.get("ciudad")!);
  if (p.get("modalidad")) qs.set("modality", p.get("modalidad")!);
  if (p.get("orden")) qs.set("sort", p.get("orden")!);
  qs.set("limit", "60");
  return serverApiSafe<Result>(context, request, `/api/practitioners?${qs}`, { items: [], specialty: null, city: null, modality: null, sort: "relevancia" });
}

export const meta: Route.MetaFunction = ({ location }) => {
  const p = new URLSearchParams(location.search);
  const parts = [p.get("q"), p.get("ciudad")].filter(Boolean);
  return [{ title: `${parts.length ? `${parts.join(" en ")} · ` : ""}Buscar médicos y especialistas · buscaDR` }];
};

const SORTS = [
  ["relevancia", "Recomendados"],
  ["disponibilidad", "Próximo horario"],
  ["valoracion", "Mejor valorados"],
  ["precio", "Menor tarifa"],
  ["cercania", "Más cerca"],
] as const;

export default function Buscar({ loaderData }: Route.ComponentProps) {
  const root = useRootData();
  const cms = root?.cms;
  const [params] = useSearchParams();
  const { items, specialty, city } = loaderData;
  const view = params.get("vista") === "mapa" ? "mapa" : "lista";
  const base = Object.fromEntries([...params].filter(([k]) => k !== "vista" && k !== "especialidad"));
  const cityRow = root?.catalog.cities.find((c) => c.name === city) ?? root?.catalog.cities[0];
  const withParam = (k: string, v: string | null) => {
    const qs = new URLSearchParams(params);
    if (v) qs.set(k, v);
    else qs.delete(k);
    return `/buscar?${qs}`;
  };
  const title = specialty ? `${specialtyName(cms, specialty)}${city ? ` en ${city}` : ""}` : city ? `Profesionales en ${city}` : "Encuentra a tu profesional";
  return (
    <div className="container-page pt-6 sm:pt-8">
      <h1 className="text-3xl font-extrabold sm:text-4xl">{title}</h1>
      <p className="mt-1 muted">
        {items.length} {items.length === 1 ? "profesional" : "profesionales"} · ubicación aproximada · tarifas antes de reservar
      </p>
      <div className="mt-4">
        <SearchBar
          placeholder={cms?.home.searchPlaceholder}
          cities={root?.catalog.cities ?? []}
          defaults={{
            q: params.get("q") ?? "",
            ciudad: params.get("ciudad") ?? "",
            modalidad: params.get("modalidad") ?? "",
            especialidad: params.get("especialidad") ?? "",
          }}
        />
      </div>
      <div className="mt-4">
        <SpecialtyChips cms={cms} active={params.get("especialidad") ?? specialty} base={base} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Modalidad">
          {[
            [null, "Todas"],
            ["presencial", "Presencial"],
            ["virtual", "Virtual"],
          ].map(([v, label]) => (
            <Link
              key={label}
              to={withParam("modalidad", v)}
              preventScrollReset
              aria-current={(params.get("modalidad") ?? null) === v ? "true" : undefined}
              className="pill btn-sm min-h-10"
            >
              {v === "virtual" && <Icon name="video" className="size-4" />}
              {v === "presencial" && <Icon name="clinic" className="size-4" />}
              {label}
            </Link>
          ))}
        </div>
        <Form method="get" className="ml-auto flex min-w-0 items-center gap-2" preventScrollReset>
          {[...params]
            .filter(([k]) => k !== "orden")
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          <label htmlFor="orden" className="text-sm font-semibold whitespace-nowrap">
            Ordenar
          </label>
          <select
            id="orden"
            name="orden"
            defaultValue={params.get("orden") ?? "relevancia"}
            className="input min-h-10 w-auto py-1"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          >
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <noscript>
            <button type="submit" className="btn-outline btn-sm">
              Aplicar
            </button>
          </noscript>
        </Form>
        {(cms?.layout.showMap ?? true) && (
          <div className="flex gap-1 rounded-full bg-white p-1 ring-1 ring-tinta/10 lg:hidden">
            <Link to={withParam("vista", null)} aria-current={view === "lista" ? "true" : undefined} className="pill min-h-9 ring-0">
              <Icon name="list" className="size-4" /> Lista
            </Link>
            <Link to={withParam("vista", "mapa")} aria-current={view === "mapa" ? "true" : undefined} className="pill min-h-9 ring-0">
              <Icon name="map" className="size-4" /> Mapa
            </Link>
          </div>
        )}
      </div>

      <div className={`mt-5 grid gap-5 ${(cms?.layout.showMap ?? true) ? "lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]" : ""}`}>
        <section aria-labelledby="resultados" className={view === "mapa" ? "hidden lg:block" : ""}>
          <h2 id="resultados" className="sr-only">
            Resultados
          </h2>
          {items.length ? (
            <ul className="grid gap-3">
              {items.slice(0, cms?.layout.searchCount ?? 36).map((p) => (
                <li key={p.id}>
                  <PractitionerCard p={p} cms={cms} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No encontramos profesionales con esos filtros"
              icon="search"
              action={
                <Link to="/buscar" className="btn-primary">
                  Ver todos los profesionales
                </Link>
              }
            >
              Prueba otra ciudad, quita la modalidad o busca por especialidad. Registramos tu búsqueda para sumar profesionales en tu zona.
            </EmptyState>
          )}
        </section>
        {(cms?.layout.showMap ?? true) && (
          <aside className={`${view === "mapa" ? "" : "hidden"} lg:sticky lg:top-24 lg:block lg:self-start`} aria-label="Mapa">
            <ClientOnly>{() => <PractitionersMap items={items} center={{ lat: cityRow?.lat ?? -2.17, lng: cityRow?.lng ?? -79.92 }} />}</ClientOnly>
          </aside>
        )}
      </div>
    </div>
  );
}
