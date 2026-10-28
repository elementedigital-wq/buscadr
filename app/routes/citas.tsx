import { Link, redirect, useSearchParams } from "react-router";
import { Icon } from "../components/Icon";
import { specialtyName } from "../components/Specialties";
import { Avatar, DateTicket, DemoBadge, EmptyState, PageHeader, StatusBadge } from "../components/ui";
import { serverApiSafe } from "../lib/api.server";
import { money, whenLabel } from "../lib/format";
import type { AppointmentSummary } from "../lib/types";
import { useRootData } from "../root";
import type { Route } from "./+types/citas";

export const meta: Route.MetaFunction = () => [{ title: "Mis citas · buscaDR" }, { name: "robots", content: "noindex" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const me = await serverApiSafe<{ user: unknown }>(context, request, "/api/auth/me", { user: null });
  if (!me.user) throw redirect("/cuenta?next=/citas");
  const scope = new URL(request.url).searchParams.get("ver") === "historial" ? "past" : "upcoming";
  const data = await serverApiSafe<{ items: AppointmentSummary[] }>(context, request, `/api/appointments?scope=${scope}`, { items: [] });
  const now = Date.now();
  return { scope, items: data.items.map((a) => ({ ...a, when: whenLabel(a.start_ms, now) })) };
}

export default function Citas({ loaderData }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const past = params.get("ver") === "historial";
  const root = useRootData();
  return (
    <div className="container-page max-w-4xl pb-6">
      <PageHeader
        eyebrow="Tu salud"
        title="Mis citas"
        actions={
          <Link to="/buscar" className="btn-primary btn-sm">
            <Icon name="plus" className="size-4" /> Nueva cita
          </Link>
        }
      />
      <div className="mb-4 flex gap-2" role="tablist" aria-label="Citas">
        <Link to="/citas" role="tab" aria-selected={!past} aria-current={!past ? "true" : undefined} className="pill">
          Próximas
        </Link>
        <Link to="/citas?ver=historial" role="tab" aria-selected={past} aria-current={past ? "true" : undefined} className="pill">
          Historial
        </Link>
      </div>
      {loaderData.items.length ? (
        <ul className="grid gap-3">
          {loaderData.items.map((a) => (
            <li key={a.id}>
              <Link
                to={`/citas/${a.id}`}
                className="card grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3 transition hover:ring-azul/30 sm:gap-4 sm:p-4"
              >
                <DateTicket ms={a.start_ms} muted={past} />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar name={a.practitioner.name} photo={a.practitioner.photo} size={28} rounded="full" />
                    <p className="truncate font-bold">{a.practitioner.name}</p>
                  </div>
                  <p className="mt-1 truncate text-sm muted">
                    {specialtyName(root?.cms, a.practitioner.specialty)} · {a.modality === "virtual" ? "Virtual" : "Presencial"} · {money(a.price_cents)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={a.status} label={a.status_label} />
                    {a.payment_status === "pendiente" && <StatusBadge status="pendiente" label="Pago pendiente" />}
                    {a.demo && <DemoBadge />}
                  </div>
                </div>
                <Icon name="chevron" className="size-4 muted" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={past ? "Aún no tienes historial" : "No tienes citas próximas"}
          icon="calendar-check"
          action={
            <Link to="/buscar" className="btn-primary">
              Buscar profesionales
            </Link>
          }
        >
          Busca por especialidad o nombre, elige un horario y agenda en menos de un minuto.
        </EmptyState>
      )}
    </div>
  );
}
