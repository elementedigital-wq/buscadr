import { Link, data } from "react-router";
import { CATEGORIES, CITIES } from "../../server/lib/catalog";
import { ListingGrid } from "../components/ListingCard";
import { SearchBar } from "../components/SearchBar";
import { EmptyState } from "../components/ui";
import { serverApiSafe } from "../lib/api.server";
import { money } from "../lib/format";
import type { PublicListing } from "../lib/types";
import { useRootData } from "../root";
import type { Route } from "./+types/landing";

/**
 * Páginas SEO por ciudad y categoría (Documento Maestro §10: «SEO programático útil con inventario
 * real, no páginas vacías»). Sin anuncios reales se muestran, pero con noindex y fuera del sitemap.
 */
export async function loader({ params, request, context }: Route.LoaderArgs) {
  const city = CITIES.find((c) => c.slug === params.ciudad);
  const category = CATEGORIES.find((c) => c.slug === params.categoria && c.enabled);
  if (!city || !category) throw data({ message: "Esta página no existe." }, { status: 404 });
  const { items } = await serverApiSafe<{ items: PublicListing[] }>(
    context,
    request,
    `/api/listings?city=${encodeURIComponent(city.name)}&category=${category.slug}&limit=48&log=0`,
    { items: [] },
  );
  const real = items.filter((i) => !i.demo).length;
  const prices = items.map((i) => i.price_day_cents).sort((a, b) => a - b);
  return { city, category, items, real, minPrice: prices[0] ?? null };
}

export const meta: Route.MetaFunction = ({ loaderData: d, matches }) => {
  if (!d) return [{ title: "No encontrado · buscaDR" }];
  const origin = (matches.find((m) => m?.id === "root")?.loaderData as { origin?: string } | undefined)?.origin ?? "";
  const title = `Alquiler de ${d.category.plural} en ${d.city.name} · buscaDR`;
  const description = `Alquila ${d.category.plural} en ${d.city.name} por horas o días${d.minPrice ? ` desde ${money(d.minPrice)} por día` : ""}. ${d.category.examples} Precio total antes de reservar.`;
  const url = `${origin}/alquiler/${d.city.slug}/${d.category.slug}`;
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { tagName: "link", rel: "canonical", href: url },
    ...(d.real === 0 ? [{ name: "robots", content: "noindex, follow" }] : []),
    {
      "script:ld+json": {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: title,
        itemListElement: d.items.slice(0, 20).map((l, i) => ({ "@type": "ListItem", position: i + 1, url: `${origin}/equipo/${l.slug}`, name: l.title })),
      },
    },
  ];
};

export default function Landing({ loaderData }: Route.ComponentProps) {
  const { city, category, items } = loaderData;
  const root = useRootData();
  const others = CATEGORIES.filter((c) => c.enabled && c.slug !== category.slug);
  return (
    <div className="container-page">
      <nav aria-label="Ruta" className="pt-5 text-sm muted">
        <Link to="/explorar" className="hover:text-morado">
          Explorar
        </Link>{" "}
        › {city.name} › {category.name}
      </nav>
      <header className="mt-3 max-w-3xl">
        <p className="label-eyebrow">{city.name}</p>
        <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">
          Alquiler de {category.plural} en {city.name}
        </h1>
        <p className="mt-2 text-lg muted">
          {category.examples} Reserva por horas o días cerca de ti{loaderData.minPrice ? `, desde ${money(loaderData.minPrice)} por día` : ""}, con el precio
          total antes de confirmar.
        </p>
      </header>
      <div className="mt-6">
        <SearchBar placeholder={`¿Qué ${category.name.toLowerCase()} necesitas?`} defaults={{ city: city.name, category: category.slug }} />
      </div>
      <section className="mt-8">
        {items.length ? (
          <ListingGrid items={items} cms={root?.cms} />
        ) : (
          <EmptyState
            title={`Aún no hay ${category.plural} publicados en ${city.name}`}
            action={
              <Link to="/publicar" className="btn-primary">
                Publicar el primero
              </Link>
            }
          >
            Estamos sumando propietarios en {city.name}. ¿Tienes uno guardado? Publícalo gratis y empieza a recibir solicitudes.
          </EmptyState>
        )}
      </section>
      <section className="mt-12 grid gap-6 md:grid-cols-2">
        <div className="card p-6">
          <h2 className="text-xl font-bold">Cómo funciona el alquiler en buscaDR</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
            <li>Elige el equipo y tus fechas: ves alquiler, tarifa de servicio, entrega y garantía por separado.</li>
            <li>El propietario confirma (o se confirma al instante si el anuncio lo permite).</li>
            <li>Retiras con un código de entrega y fotos del estado; devuelves con otro código.</li>
            <li>Ambos se califican. Solo opinan quienes completaron el alquiler.</li>
          </ol>
        </div>
        <div className="card p-6">
          <h2 className="text-xl font-bold">Otras categorías en {city.name}</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {others.map((c) => (
              <li key={c.slug}>
                <Link to={`/alquiler/${city.slug}/${c.slug}`} className="chip bg-fondo ring-1 ring-black/10 hover:ring-morado/40">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
          <h3 className="mt-5 font-bold">{category.name} en otras ciudades</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {CITIES.filter((c) => c.slug !== city.slug).map((c) => (
              <li key={c.slug}>
                <Link to={`/alquiler/${c.slug}/${category.slug}`} className="chip bg-fondo ring-1 ring-black/10 hover:ring-morado/40">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
