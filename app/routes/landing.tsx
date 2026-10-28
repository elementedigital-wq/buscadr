import { Link, data } from "react-router";
import { CITIES, SPECIALTY_MAP } from "../../server/lib/catalog";
import { Icon } from "../components/Icon";
import { PractitionerCard } from "../components/PractitionerCard";
import { EmptyState, PageHeader } from "../components/ui";
import { serverApiSafe } from "../lib/api.server";
import type { PublicPractitioner } from "../lib/types";
import { useRootData } from "../root";
import type { Route } from "./+types/landing";

/** Páginas SEO por ciudad y especialidad (Documento Maestro §14.2): solo con oferta real o de muestra rotulada. */
export async function loader({ request, context, params }: Route.LoaderArgs) {
  const city = CITIES.find((c) => c.slug === params.ciudad);
  const sp = SPECIALTY_MAP.get(params.especialidad);
  if (!city || !sp) throw data({ message: "Página no encontrada" }, { status: 404 });
  const { items } = await serverApiSafe<{ items: PublicPractitioner[] }>(
    context,
    request,
    `/api/practitioners?specialty=${sp.slug}&city=${encodeURIComponent(city.name)}&limit=36`,
    {
      items: [],
    },
  );
  return { city: city.name, citySlug: city.slug, specialty: sp.name, specialtySlug: sp.slug, professional: sp.professional, items };
}

export const meta: Route.MetaFunction = ({ loaderData: d, matches }) => {
  if (!d) return [{ title: "buscaDR" }];
  const origin = (matches.find((m) => m?.id === "root")?.loaderData as { origin?: string } | undefined)?.origin ?? "";
  const real = d.items.filter((i) => !i.demo).length;
  return [
    { title: `${d.specialty} en ${d.city}: agenda tu cita · buscaDR` },
    {
      name: "description",
      content: `Encuentra ${d.professional.toLowerCase()} en ${d.city}. Compara tarifas presenciales y virtuales, horarios disponibles y opiniones verificadas.`,
    },
    { tagName: "link", rel: "canonical", href: `${origin}/medicos/${d.citySlug}/${d.specialtySlug}` },
    ...(real ? [] : [{ name: "robots", content: "noindex" }]),
  ];
};

export default function Landing({ loaderData: d }: Route.ComponentProps) {
  const root = useRootData();
  return (
    <div className="container-page pb-6">
      <PageHeader eyebrow={d.city} title={`${d.specialty} en ${d.city}`} back="/especialidades">
        {d.professional} con horarios disponibles, tarifa presencial y virtual, y confirmación de tu cita en la app y por WhatsApp.
      </PageHeader>
      {d.items.length ? (
        <ul className="grid gap-3">
          {d.items.map((p) => (
            <li key={p.id}>
              <PractitionerCard p={p} cms={root?.cms} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={`Aún no hay ${d.professional.toLowerCase()} publicados en ${d.city}`}
          action={
            <Link to={`/buscar?especialidad=${d.specialtySlug}&modalidad=virtual`} className="btn-primary">
              <Icon name="video" className="size-4" /> Ver consultas virtuales
            </Link>
          }
        >
          Mientras tanto, puedes agendar una consulta virtual con profesionales de otras ciudades.
        </EmptyState>
      )}
    </div>
  );
}
