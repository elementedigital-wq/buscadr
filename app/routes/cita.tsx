import { redirect, useSearchParams } from "react-router";
import { AppointmentDetail } from "../components/AppointmentDetail";
import { PageHeader } from "../components/ui";
import { serverApi, serverApiSafe } from "../lib/api.server";
import type { AppointmentView, TraceView } from "../lib/types";
import type { Route } from "./+types/cita";

export const meta: Route.MetaFunction = ({ params }) => [{ title: `Cita #${params.id} · buscaDR` }, { name: "robots", content: "noindex" }];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const me = await serverApiSafe<{ user: unknown }>(context, request, "/api/auth/me", { user: null });
  if (!me.user) throw redirect(`/cuenta?next=/citas/${params.id}`);
  const [data, trace] = await Promise.all([
    serverApi<{ appointment: AppointmentView }>(context, request, `/api/appointments/${encodeURIComponent(params.id)}`),
    serverApiSafe<TraceView | null>(context, request, `/api/trace/appointments/${encodeURIComponent(params.id)}`, null),
  ]);
  return { ...data, trace };
}

export default function Cita({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  return (
    <div className="container-page pb-6">
      <PageHeader eyebrow="Mis citas" title="Detalle de la cita" back="/citas" />
      <AppointmentDetail a={loaderData.appointment} trace={loaderData.trace} fresh={params.get("nueva") === "1"} />
    </div>
  );
}
