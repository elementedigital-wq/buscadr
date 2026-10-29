/**
 * Serie de citas subsecuentes vista por el paciente (ADR 0017): revisar la propuesta del profesional,
 * aceptarla (se agendan todas las sesiones) o rechazarla, pagar cada sesión con tarjeta y cancelar
 * lo que falta.
 */
import { useState } from "react";
import { Link, redirect, useNavigate, useRevalidator } from "react-router";
import { Icon } from "../components/Icon";
import { Avatar, Notice, PageHeader, Spinner, StatusBadge } from "../components/ui";
import { type ApiError, api } from "../lib/api";
import { serverApi, serverApiSafe } from "../lib/api.server";
import { type FollowupPlan, frequencyLabel } from "../lib/followups";
import { dateTime, money } from "../lib/format";
import type { Route } from "./+types/seguimiento";

export const meta: Route.MetaFunction = () => [{ title: "Citas de seguimiento · buscaDR" }, { name: "robots", content: "noindex" }];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const me = await serverApiSafe<{ user: unknown }>(context, request, "/api/auth/me", { user: null });
  if (!me.user) throw redirect(`/cuenta?next=/seguimientos/${params.id}`);
  const data = await serverApi<{ plan: FollowupPlan; role: "patient" | "pro" }>(context, request, `/api/followups/${encodeURIComponent(params.id)}`);
  if (data.role === "pro") throw redirect("/panel/subsecuentes");
  return data;
}

export default function Seguimiento({ loaderData }: Route.ComponentProps) {
  const p = loaderData.plan;
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  const pay = (appointmentId: number) =>
    run(`pay-${appointmentId}`, async () => {
      const r = await api<{ checkout: string }>(`/api/appointments/${appointmentId}/actions/pay`, { body: {} });
      if (/^https?:/.test(r.checkout)) window.location.assign(r.checkout);
      else navigate(r.checkout);
    });

  const accept = () =>
    run("accept", async () => {
      const r = await api<{ message: string; first_appointment: number | null; pay_first: boolean; conflicts: number }>(`/api/followups/${p.id}/accept`, {
        body: {},
      });
      setDone(`${r.message}${r.conflicts ? ` ${r.conflicts === 1 ? "Una sesión" : `${r.conflicts} sesiones`} se reagendará: tu profesional te avisará.` : ""}`);
      revalidator.revalidate();
    });

  const decline = () => {
    const reason = prompt("¿Quieres contarle al profesional por qué? (opcional)", "");
    if (reason === null) return;
    run("decline", async () => {
      await api(`/api/followups/${p.id}/decline`, { body: { reason } });
      revalidator.revalidate();
    });
  };

  const withdraw = p.status === "propuesta" && p.requested_by === "patient";
  const cancel = () => {
    if (
      !confirm(
        withdraw
          ? "¿Retirar tu solicitud de plan? Tu primera cita se mantiene."
          : "¿Cancelar las citas que faltan de esta serie? Las pagadas se reembolsan (las de las próximas 4 h puedes cancelarlas una a una).",
      )
    )
      return;
    run("cancel", async () => {
      await api(`/api/followups/${p.id}/cancel`, { body: { reason: "Cancelada por el paciente" } });
      revalidator.revalidate();
    });
  };

  const next = p.sessions.find((s) => s.unpaid);
  return (
    <div className="container-page max-w-3xl space-y-4 pb-6">
      <PageHeader eyebrow="Mis citas" title="Citas de seguimiento" back="/citas" />
      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={p.practitioner.name} photo={p.practitioner.photo} size={52} />
            <div className="min-w-0">
              <h2 className="text-xl font-extrabold break-words">{p.title}</h2>
              <p className="text-sm muted">
                <Link to={`/doctor/${p.practitioner.slug}`} className="font-semibold text-azul-ink underline">
                  {p.practitioner.name}
                </Link>{" "}
                · {p.modality === "virtual" ? "Virtual" : "Presencial"} · {frequencyLabel(p.interval_days)}
              </p>
            </div>
          </div>
          <StatusBadge status={p.status} label={p.status_label} />
        </div>
        {p.note && (
          <p className="rounded-2xl bg-fondo p-3 text-sm break-words">
            <span className="font-semibold">Nota de tu profesional: </span>
            {p.note}
          </p>
        )}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-fondo p-3">
            <dt className="text-xs muted">Sesiones</dt>
            <dd className="font-display text-xl font-extrabold">{p.summary.total}</dd>
          </div>
          <div className="rounded-2xl bg-fondo p-3">
            <dt className="text-xs muted">Por sesión</dt>
            <dd className="font-display text-xl font-extrabold">{p.price_cents ? money(p.price_cents) : "Sin costo"}</dd>
          </div>
          <div className="col-span-2 rounded-2xl bg-fondo p-3 sm:col-span-1">
            <dt className="text-xs muted">{p.status === "propuesta" ? "Total de la serie" : "Atendidas"}</dt>
            <dd className="font-display text-xl font-extrabold">
              {p.status === "propuesta" ? (p.price_cents ? money(p.total_cents) : "—") : `${p.summary.attended} de ${p.summary.total}`}
            </dd>
          </div>
        </dl>

        {done && <Notice tone="success">{done}</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}

        {withdraw && (
          <Notice tone="info" title="Esperando al profesional">
            Pediste este plan al reservar. Tu primera consulta ya está reservada; cuando {p.practitioner.name} acepte el plan, agendamos las siguientes
            {p.price_cents ? " y pagas cada una con tarjeta hasta 24 h antes" : ""}.
            {p.expires_ms ? ` Si no responde antes del ${dateTime(p.expires_ms)}, la solicitud vence.` : ""}
          </Notice>
        )}
        {p.can.accept && (
          <div className="space-y-3 rounded-2xl bg-celeste/60 p-4">
            <p className="text-sm">
              Al aceptar, agendamos las {p.summary.total} citas.{" "}
              {p.price_cents
                ? "Pagas cada una con tarjeta de crédito o débito hasta 24 h antes; si no se paga, ese horario se libera. Puedes cancelar con reembolso hasta 4 h antes."
                : "Son sin costo."}
              {p.expires_ms ? ` Responde antes del ${dateTime(p.expires_ms)}.` : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn" onClick={accept} disabled={busy !== null}>
                {busy === "accept" ? <Spinner label="Agendando" /> : <Icon name="check" className="size-4" />} Aceptar y agendar
              </button>
              <button type="button" className="btn-outline" onClick={decline} disabled={busy !== null}>
                No, gracias
              </button>
            </div>
          </div>
        )}

        {next?.appointment_id && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amarillo/15 p-4">
            <p className="min-w-0 text-sm">
              <strong>Paga tu próxima cita</strong> ({dateTime(next.start_ms)}) antes del {next.pay_before_ms ? dateTime(next.pay_before_ms) : "día anterior"}.
            </p>
            <button type="button" className="btn btn-sm" onClick={() => pay(next.appointment_id as number)} disabled={busy !== null}>
              {busy === `pay-${next.appointment_id}` ? <Spinner label="Abriendo pago" /> : <Icon name="card" className="size-4" />} Pagar {money(p.price_cents)}
            </button>
          </div>
        )}
      </section>

      <section className="card p-5" aria-labelledby="sesiones">
        <h2 id="sesiones" className="text-lg font-extrabold">
          Sesiones
        </h2>
        <ol className="mt-2 divide-y divide-tinta/5">
          {p.sessions.map((s) => (
            <li key={s.seq} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span className="min-w-0">
                <span className="block font-semibold">
                  {s.seq}. {dateTime(s.start_ms)}
                </span>
                {s.payment_label && <span className="block text-xs muted">{s.payment_label}</span>}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <StatusBadge status={s.status ?? s.session_status} label={s.status_label} />
                {s.unpaid && s.appointment_id && (
                  <button type="button" className="btn-outline btn-sm" onClick={() => pay(s.appointment_id as number)} disabled={busy !== null}>
                    Pagar
                  </button>
                )}
                {s.appointment_id && (
                  <Link to={`/citas/${s.appointment_id}`} className="text-sm font-semibold text-azul-ink underline">
                    Ver cita
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ol>
        {p.can.cancel && (
          <button type="button" className="btn-outline btn-sm mt-3" onClick={cancel} disabled={busy !== null}>
            <Icon name="x" className="size-4" /> {withdraw ? "Retirar solicitud" : "Cancelar las citas que faltan"}
          </button>
        )}
      </section>
      <p className="text-xs muted">
        El nombre y la nota de la serie solo los ven tú y tu profesional. buscaDR no atiende emergencias: ante una urgencia llama al 911.
      </p>
    </div>
  );
}
