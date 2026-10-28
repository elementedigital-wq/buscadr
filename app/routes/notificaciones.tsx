import { Link, redirect } from "react-router";
import { Icon } from "../components/Icon";
import { EmptyState, PageHeader } from "../components/ui";
import { serverApiSafe } from "../lib/api.server";
import { dateTime } from "../lib/format";
import type { Notification } from "../lib/types";
import type { Route } from "./+types/notificaciones";

export const meta: Route.MetaFunction = () => [{ title: "Avisos · buscaDR" }, { name: "robots", content: "noindex" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const me = await serverApiSafe<{ user: unknown }>(context, request, "/api/auth/me", { user: null });
  if (!me.user) throw redirect("/cuenta?next=/notificaciones");
  return serverApiSafe<{ items: Notification[] }>(context, request, "/api/me/notifications", { items: [] });
}

const ICON: Record<string, string> = {
  cita_confirmada: "calendar-check",
  cita_solicitada: "calendar-plus",
  cita_rechazada: "x",
  cita_cancelada: "x",
  cita_completada: "star",
  cita_vencida: "clock",
  pago_aprobado: "card",
  mensaje: "chat",
  recordatorio_24h: "bell",
  recordatorio_1h: "bell",
};

export default function Notificaciones({ loaderData }: Route.ComponentProps) {
  return (
    <div className="container-page max-w-3xl">
      <PageHeader eyebrow="Tu actividad" title="Avisos">
        Confirmaciones, recordatorios y cambios de tus citas. También te llegan por correo y WhatsApp si los activaste en{" "}
        <Link to="/cuenta" className="font-semibold text-azul">
          Mi cuenta
        </Link>
        .
      </PageHeader>
      {loaderData.items.length ? (
        <ul className="card divide-y divide-tinta/5">
          {loaderData.items.map((n) => (
            <li key={n.id}>
              <Link to={n.link || "/citas"} className="flex gap-3 p-4 hover:bg-fondo">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl tone-azul">
                  <Icon name={ICON[n.kind] ?? "bell"} className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">{n.title}</span>
                  <span className="block text-sm muted">{n.body}</span>
                  <span className="block text-xs muted">{dateTime(n.created_at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Sin avisos por ahora" icon="bell">
          Cuando agendes una cita, aquí verás su confirmación y los recordatorios.
        </EmptyState>
      )}
    </div>
  );
}
