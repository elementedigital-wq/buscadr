import { Link, redirect } from "react-router";
import { PractitionerCard } from "../components/PractitionerCard";
import { EmptyState, PageHeader } from "../components/ui";
import { serverApiSafe } from "../lib/api.server";
import type { PublicPractitioner } from "../lib/types";
import { useRootData } from "../root";
import type { Route } from "./+types/favoritos";

export const meta: Route.MetaFunction = () => [{ title: "Favoritos · buscaDR" }, { name: "robots", content: "noindex" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const me = await serverApiSafe<{ user: unknown }>(context, request, "/api/auth/me", { user: null });
  if (!me.user) throw redirect("/cuenta?next=/favoritos");
  return serverApiSafe<{ items: PublicPractitioner[] }>(context, request, "/api/me/favorites", { items: [] });
}

export default function Favoritos({ loaderData }: Route.ComponentProps) {
  const root = useRootData();
  return (
    <div className="container-page">
      <PageHeader eyebrow="Tu lista" title="Favoritos">
        Profesionales que guardaste para agendar después.
      </PageHeader>
      {loaderData.items.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loaderData.items.map((p) => (
            <li key={p.id}>
              <PractitionerCard p={{ ...p }} cms={root?.cms} layout="tile" />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="Aún no guardas profesionales"
          icon="heart"
          action={
            <Link to="/buscar" className="btn-primary">
              Buscar profesionales
            </Link>
          }
        >
          Toca el corazón en cualquier perfil para guardarlo aquí.
        </EmptyState>
      )}
    </div>
  );
}
