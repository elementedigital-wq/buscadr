import { useState } from "react";
import { Link, useRevalidator } from "react-router";
import { Icon } from "../../components/Icon";
import { Avatar, Stars, Stat, StatusBadge } from "../../components/ui";
import { type ApiError, api } from "../../lib/api";
import { serverApi } from "../../lib/api.server";
import { firstName, greeting, money, timeOf, whenLabel } from "../../lib/format";
import type { PrivatePractitioner } from "../../lib/pro";
import { useRootData } from "../../root";
import type { Route } from "./+types/resumen";

type Dashboard = {
  practitioner: PrivatePractitioner;
  kpis: Record<string, number | null>;
  upcoming: {
    id: number;
    status: string;
    status_label: string;
    start_ms: number;
    end_ms: number;
    modality: string;
    patient_name: string;
    payment_status: string;
  }[];
  reviews: { rating: number; body: string; created_at: string; name: string }[];
  steps: { key: string; label: string; done: boolean }[];
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const d = await serverApi<Dashboard>(context, request, "/api/pro/dashboard");
  const now = Date.now();
  return { ...d, greeting: greeting(now), upcoming: d.upcoming.map((u) => ({ ...u, when: whenLabel(u.start_ms, now) })) };
}

export default function Resumen({ loaderData: d }: Route.ComponentProps) {
  const root = useRootData();
  const revalidator = useRevalidator();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const k = d.kpis;
  const p = d.practitioner;
  const link = `${root?.origin ?? ""}/doctor/${p.slug}`;
  const pending = d.upcoming.filter((u) => u.status === "solicitada" && u.payment_status !== "pendiente");
  async function act(id: number, action: string) {
    setError(null);
    try {
      await api(`/api/appointments/${id}/actions/${action}`, { body: action === "decline" ? { reason: "Sin disponibilidad en ese horario" } : {} });
      revalidator.revalidate();
    } catch (e) {
      setError((e as ApiError).message);
    }
  }
  return (
    <div className="space-y-6">
      <header className="bg-brand flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] p-5 text-white sm:p-6">
        <div className="min-w-0">
          <p className="text-sm text-white/85">{d.greeting}</p>
          <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
            ¡Hola, {p.title} {firstName(p.display_name)}!
          </h1>
          <p className="mt-1 text-sm text-white/85">Este es el resumen de tu consultorio hoy.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/panel/agenda" className="btn btn-sm bg-white text-azul hover:bg-celeste">
            <Icon name="agenda" className="size-4" /> Abrir agenda
          </Link>
          <Link to="/panel/horarios" className="btn btn-sm text-white ring-1 ring-white/50 hover:bg-white/10">
            <Icon name="plus" className="size-4" /> Bloquear horario
          </Link>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores">
        <Stat icon="calendar-check" label="Citas hoy" value={k.today ?? 0} hint={`${k.week ?? 0} en los próximos 7 días`} />
        <Stat icon="bell" label="Por confirmar" value={k.pending ?? 0} hint="Solicitudes esperando tu respuesta" tone="cielo" />
        <Stat
          icon="wallet"
          label="Ingresos del mes"
          value={money(Number(k.income_month_net_cents ?? 0))}
          hint={`${k.paid_appointments_month ?? 0} citas pagadas`}
          tone="verde"
        />
        <Stat
          icon="star"
          label="Valoración"
          value={k.rating ? Number(k.rating).toFixed(1) : "—"}
          hint={`${k.reviews ?? 0} opiniones · ${k.patients ?? 0} pacientes`}
          tone="neutro"
        />
      </section>

      {d.steps.some((s) => !s.done) && (
        <section className="card p-5" aria-labelledby="pasos">
          <h2 id="pasos" className="text-lg font-extrabold">
            Completa tu consultorio
          </h2>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {d.steps.map((s) => (
              <li key={s.key} className={`flex items-center gap-3 rounded-2xl p-3 ${s.done ? "bg-menta/60" : "bg-fondo"}`}>
                <Icon name={s.done ? "check-circle" : "regular:circle-check"} className={`size-5 ${s.done ? "text-verde-ink" : "muted"}`} />
                <span className="text-sm font-semibold">{s.label}</span>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/panel/perfil" className="btn-primary btn-sm">
              Completar perfil
            </Link>
            <Link to="/cuenta#whatsapp" className="btn-outline btn-sm">
              <Icon name="whatsapp" className="size-4" /> Activar WhatsApp
            </Link>
          </div>
        </section>
      )}

      {pending.length > 0 && (
        <section className="card p-5" aria-labelledby="solicitudes">
          <h2 id="solicitudes" className="text-lg font-extrabold">
            Solicitudes por confirmar
          </h2>
          {error && <p className="mt-2 text-sm text-alerta-ink">{error}</p>}
          <ul className="mt-3 divide-y divide-tinta/5">
            {pending.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar name={u.patient_name} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{u.patient_name}</p>
                  <p className="text-sm muted">
                    {u.when} · {u.modality === "virtual" ? "Virtual" : "Presencial"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-accent btn-sm" onClick={() => act(u.id, "confirm")}>
                    Confirmar
                  </button>
                  <button type="button" className="btn-danger btn-sm" onClick={() => act(u.id, "decline")}>
                    Rechazar
                  </button>
                  <Link to={`/panel/citas/${u.id}`} className="btn-ghost btn-sm">
                    Ver
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="card p-5" aria-labelledby="proximas">
          <div className="flex items-center justify-between gap-2">
            <h2 id="proximas" className="text-lg font-extrabold">
              Próximas citas
            </h2>
            <Link to="/panel/agenda" className="text-sm font-semibold text-azul">
              Ver agenda completa
            </Link>
          </div>
          {d.upcoming.length ? (
            <ul className="mt-3 divide-y divide-tinta/5">
              {d.upcoming.map((u) => (
                <li key={u.id}>
                  <Link to={`/panel/citas/${u.id}`} className="flex flex-wrap items-center gap-3 py-3 hover:bg-fondo">
                    <span className="w-16 shrink-0 font-display text-lg font-extrabold">{timeOf(u.start_ms)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{u.patient_name}</span>
                      <span className="block text-xs muted">
                        {u.when} · {u.modality === "virtual" ? "Virtual" : "Presencial"}
                      </span>
                    </span>
                    <StatusBadge
                      status={u.payment_status === "pendiente" ? "pendiente" : u.status}
                      label={u.payment_status === "pendiente" ? "Esperando pago" : u.status_label}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-2xl bg-fondo p-4 text-sm muted">No tienes citas próximas. Comparte tu enlace para recibir reservas.</p>
          )}
        </section>
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="text-lg font-extrabold">Tu enlace para reservar</h2>
            <p className="mt-1 text-sm muted">Compártelo en tus redes, tu firma o por WhatsApp.</p>
            <p className="mt-3 rounded-xl bg-fondo px-3 py-2 text-sm break-all">{link}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-outline btn-sm"
                onClick={async () => {
                  await navigator.clipboard?.writeText(link).catch(() => {});
                  setCopied(true);
                }}
              >
                <Icon name={copied ? "check" : "copy"} className="size-4" /> {copied ? "Copiado" : "Copiar"}
              </button>
              <a
                className="btn-outline btn-sm"
                href={`https://wa.me/?text=${encodeURIComponent(`Agenda tu cita conmigo en buscaDR: ${link}`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="whatsapp" className="size-4" /> Compartir
              </a>
            </div>
          </section>
          <section className="card p-5">
            <h2 className="text-lg font-extrabold">Opiniones recientes</h2>
            {d.reviews.length ? (
              <ul className="mt-3 space-y-3">
                {d.reviews.map((r) => (
                  <li key={r.created_at} className="rounded-2xl bg-fondo p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{r.name}</span>
                      <Stars value={r.rating} />
                    </div>
                    {r.body && <p className="mt-1 text-sm muted">{r.body}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm muted">Las opiniones verificadas aparecerán después de tus primeras citas atendidas.</p>
            )}
          </section>
          <section className="card grid grid-cols-2 gap-3 p-5 text-center">
            <div>
              <p className="font-display text-2xl font-extrabold">{k.confirmation_rate == null ? "—" : `${k.confirmation_rate} %`}</p>
              <p className="text-xs muted">Confirmación este mes</p>
            </div>
            <div>
              <p className="font-display text-2xl font-extrabold">{k.views ?? 0}</p>
              <p className="text-xs muted">Visitas a tu perfil</p>
            </div>
            <div>
              <p className="font-display text-2xl font-extrabold">{k.month_virtual ?? 0}</p>
              <p className="text-xs muted">Citas virtuales del mes</p>
            </div>
            <div>
              <p className="font-display text-2xl font-extrabold">{k.no_show ?? 0}</p>
              <p className="text-xs muted">Inasistencias</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
