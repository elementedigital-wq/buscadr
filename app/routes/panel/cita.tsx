import { Link } from "react-router";
import { AppointmentDetail } from "../../components/AppointmentDetail";
import { Icon } from "../../components/Icon";
import { serverApi, serverApiSafe } from "../../lib/api.server";
import type { AppointmentView, TraceView } from "../../lib/types";
import type { Route } from "./+types/cita";

export const meta: Route.MetaFunction = ({ params }) => [{ title: `Cita #${params.id} · Mi consultorio` }, { name: "robots", content: "noindex" }];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const [data, trace] = await Promise.all([
    serverApi<{ appointment: AppointmentView }>(context, request, `/api/appointments/${encodeURIComponent(params.id)}`),
    serverApiSafe<TraceView | null>(context, request, `/api/trace/appointments/${encodeURIComponent(params.id)}`, null),
  ]);
  return { ...data, trace };
}

export default function PanelCita({ loaderData }: Route.ComponentProps) {
  return (
    <div>
      <Link to="/panel/agenda" className="btn-ghost btn-sm -ml-3 mb-3">
        <Icon name="back" className="size-4" /> Volver a la agenda
      </Link>
      <AppointmentDetail a={loaderData.appointment} trace={loaderData.trace} />
    </div>
  );
}
