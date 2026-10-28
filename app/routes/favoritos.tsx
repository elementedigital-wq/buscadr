import { Link, redirect } from "react-router";
import { ListingGrid } from "../components/ListingCard";
import { EmptyState, PageHeader } from "../components/ui";
import { serverApiSafe } from "../lib/api.server";
import type { PublicListing } from "../lib/types";
import { useRootData } from "../root";
import type { Route } from "./+types/favoritos";

export const meta: Route.MetaFunction = () => [{ title: "Favoritos · buscaDR" }, { name: "robots", content: "noindex" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const me = await serverApiSafe<{ user: unknown }>(context, request, "/api/auth/me", { user: null });
  if (!me.user) throw redirect("/cuenta?next=/favoritos");
  return serverApiSafe<{ items: PublicListing[] }>(context, request, "/api/me/favorites", { items: [] });
}

export default function Favoritos({ loaderData }: Route.ComponentProps) {
  const root = useRootData();
  return (
    <div className="container-page">
      <PageHeader eyebrow="Tu lista" title="Favoritos">
        Equipos que guardaste para alquilar después.
      </PageHeader>
      {loaderData.items.length ? (
        <ListingGrid items={loaderData.items} cms={root?.cms} />
      ) : (
        <EmptyState
          title="Aún no guardas equipos"
          action={
            <Link to="/explorar" className="btn-primary">
              Explorar equipos
            </Link>
          }
        >
          Toca el corazón en cualquier anuncio para guardarlo aquí.
        </EmptyState>
      )}
    </div>
  );
}
