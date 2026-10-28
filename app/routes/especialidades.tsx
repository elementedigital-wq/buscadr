import { SpecialtyDirectory } from "../components/Specialties";
import { PageHeader } from "../components/ui";
import { serverApiSafe } from "../lib/api.server";
import type { PublicPractitioner } from "../lib/types";
import { useRootData } from "../root";
import type { Route } from "./+types/especialidades";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { items } = await serverApiSafe<{ items: PublicPractitioner[] }>(context, request, "/api/practitioners?limit=60", { items: [] });
  const counts: Record<string, number> = {};
  for (const p of items) counts[p.specialty] = (counts[p.specialty] ?? 0) + 1;
  return { counts };
}

export const meta: Route.MetaFunction = () => [
  { title: "Especialidades médicas · buscaDR" },
  {
    name: "description",
    content:
      "Más de 80 especialidades: medicina general, pediatría, ginecología, cardiología, odontología, psicología, terapias, laboratorio y más. Encuentra especialistas en Ecuador y agenda tu cita.",
  },
];

export default function Especialidades({ loaderData }: Route.ComponentProps) {
  const root = useRootData();
  return (
    <div className="container-page pb-6">
      <PageHeader eyebrow="Directorio médico" title={root?.cms?.copy.specialtiesTitle ?? "Especialidades"}>
        {root?.cms?.copy.specialtiesSubtitle}
      </PageHeader>
      <SpecialtyDirectory cms={root?.cms} counts={loaderData.counts} />
    </div>
  );
}
