/**
 * Agenda del profesional: calendario semanal con las citas por estado (por confirmar, confirmadas,
 * atendidas), bloqueos y horario de atención. En móvil, vista de lista por día.
 */
import { useState } from "react";
import { Link, useRevalidator, useSearchParams } from "react-router";
import { Icon } from "../../components/Icon";
import { EmptyState, StatusBadge } from "../../components/ui";
import { type ApiError, api } from "../../lib/api";
import { serverApi } from "../../lib/api.server";
import { WEEKDAYS_SHORT, addDays, dayParts, money, timeOf, toLocalDate } from "../../lib/format";
import type { Rule } from "../../lib/pro";
import type { Route } from "./+types/agenda";

type Item = {
  id: number;
  status: string;
  status_label: string;
  start_ms: number;
  end_ms: number;
  modality: string;
  patient_name: string;
  payment_status: string;
  payment_label: string;
  price_cents: number;
};
type Calendar = { from: string; days: number; appointments: Item[]; blocks: { id: number; start_ms: number; end_ms: number; reason: string }[]; rules: Rule[] };

/** Lunes de la semana de una fecha «YYYY-MM-DD». */
const monday = (date: string) => {
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, wd === 0 ? -6 : 1 - wd);
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const desde = new URL(request.url).searchParams.get("desde");
  const from = monday(desde && /^\d{4}-\d{2}-\d{2}$/.test(desde) ? desde : toLocalDate(Date.now()));
  return serverApi<Calendar>(context, request, `/api/pro/calendar?from=${from}&days=7`);
}

const COLOR: Record<string, string> = {
  solicitada: "bg-[#fef9c3] ring-amarillo text-tinta",
  confirmada: "bg-azul ring-azul text-white",
  completada: "bg-menta ring-verde/50 text-[#065f46]",
  no_asistio: "bg-alerta/10 ring-alerta/40 text-alerta-ink",
  cancelada: "bg-gris-claro ring-gris/20 text-gris line-through",
  rechazada: "bg-gris-claro ring-gris/20 text-gris line-through",
};
const HOUR_PX = 56;
const minutesOf = (ms: number) => Math.round(((ms - 5 * 3_600_000) % 86_400_000) / 60_000);

export default function Agenda({ loaderData: cal }: Route.ComponentProps) {
  const [, setParams] = useSearchParams();
  const revalidator = useRevalidator();
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState(() => {
    const today = toLocalDate(Date.now());
    return today >= cal.from && today < addDays(cal.from, 7) ? today : cal.from;
  });
  const days = Array.from({ length: 7 }, (_, i) => addDays(cal.from, i));
  const active = cal.appointments.filter((a) => !["cancelada", "rechazada"].includes(a.status));
  const starts = [...cal.rules.map((r) => r.start_min), ...active.map((a) => minutesOf(a.start_ms))];
  const ends = [...cal.rules.map((r) => r.end_min), ...active.map((a) => minutesOf(a.end_ms))];
  const first = Math.max(0, Math.floor((starts.length ? Math.min(...starts) : 480) / 60) - 1);
  const last = Math.min(24, Math.ceil((ends.length ? Math.max(...ends) : 1080) / 60) + 1);
  const hours = Array.from({ length: last - first }, (_, i) => first + i);
  const top = (min: number) => ((min - first * 60) / 60) * HOUR_PX;
  const today = toLocalDate(Date.now());
  const pending = active.filter((a) => a.status === "solicitada" && a.payment_status !== "pendiente");
  const go = (n: number) => setParams({ desde: addDays(cal.from, n) });

  async function act(id: number, action: string) {
    setError(null);
    try {
      await api(`/api/appointments/${id}/actions/${action}`, { body: action === "decline" ? { reason: "Sin disponibilidad en ese horario" } : {} });
      revalidator.revalidate();
    } catch (e) {
      setError((e as ApiError).message);
    }
  }

  const dayItems = (d: string) => cal.appointments.filter((a) => toLocalDate(a.start_ms) === d);
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="label-eyebrow">Agenda</p>
          <h1 className="text-3xl font-extrabold">
            {dayParts(cal.from).day} {dayParts(cal.from).month} – {dayParts(addDays(cal.from, 6)).day} {dayParts(addDays(cal.from, 6)).month}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="icon-btn" onClick={() => go(-7)} aria-label="Semana anterior">
            <Icon name="chevron-left" className="size-4" />
          </button>
          <button type="button" className="btn-outline btn-sm" onClick={() => setParams({})}>
            Hoy
          </button>
          <button type="button" className="icon-btn" onClick={() => go(7)} aria-label="Semana siguiente">
            <Icon name="chevron" className="size-4" />
          </button>
          <Link to="/panel/horarios" className="btn-primary btn-sm">
            <Icon name="settings" className="size-4" /> Horarios y bloqueos
          </Link>
        </div>
      </header>

      {pending.length > 0 && (
        <section className="card p-4" aria-labelledby="pendientes">
          <h2 id="pendientes" className="font-extrabold">
            {pending.length} {pending.length === 1 ? "solicitud" : "solicitudes"} por confirmar
          </h2>
          {error && <p className="mt-1 text-sm text-alerta-ink">{error}</p>}
          <ul className="mt-2 grid gap-2 md:grid-cols-2">
            {pending.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-[#fef9c3]/70 p-3">
                <span className="min-w-0 flex-1 text-sm">
                  <strong>{a.patient_name}</strong> · {WEEKDAYS_SHORT[new Date(a.start_ms - 5 * 3_600_000).getUTCDay()]} {timeOf(a.start_ms)} · {a.modality}
                </span>
                <button type="button" className="btn-accent btn-sm min-h-9" onClick={() => act(a.id, "confirm")}>
                  Confirmar
                </button>
                <button type="button" className="btn-danger btn-sm min-h-9" onClick={() => act(a.id, "decline")}>
                  Rechazar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="flex flex-wrap gap-3 text-xs" aria-label="Leyenda">
        {[
          ["bg-[#fef9c3] ring-amarillo", "Por confirmar"],
          ["bg-azul ring-azul", "Confirmada"],
          ["bg-menta ring-verde/50", "Atendida"],
          ["bg-tinta/10 ring-tinta/10", "Bloqueado"],
        ].map(([c, l]) => (
          <li key={l} className="flex items-center gap-1.5">
            <span className={`size-3 rounded ring-1 ${c}`} aria-hidden /> {l}
          </li>
        ))}
      </ul>

      {/* Escritorio: calendario semanal. */}
      <div className="card hidden overflow-x-auto md:block">
        <div className="grid min-w-[46rem] grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
          <div className="border-b border-tinta/5" />
          {days.map((d) => (
            <div key={d} className={`border-b border-l border-tinta/5 p-2 text-center ${d === today ? "bg-celeste/60" : ""}`}>
              <p className="text-xs font-semibold muted">{dayParts(d).weekday}</p>
              <p className={`font-display text-lg font-extrabold ${d === today ? "text-azul" : ""}`}>{dayParts(d).day}</p>
            </div>
          ))}
          <div className="relative" style={{ height: hours.length * HOUR_PX }}>
            {hours.map((h) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] muted" style={{ top: (h - first) * HOUR_PX }}>
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {days.map((d) => {
            const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
            const dayStart = Date.parse(`${d}T00:00:00Z`) + 5 * 3_600_000;
            return (
              <div key={d} className="relative border-l border-tinta/5 bg-fondo/70" style={{ height: hours.length * HOUR_PX }}>
                {hours.map((h) => (
                  <span key={h} className="absolute inset-x-0 border-t border-tinta/5" style={{ top: (h - first) * HOUR_PX }} aria-hidden />
                ))}
                {cal.rules
                  .filter((r) => r.weekday === wd)
                  .map((r) => (
                    <span
                      key={`${r.start_min}-${r.end_min}`}
                      className="absolute inset-x-0 bg-white"
                      style={{ top: top(r.start_min), height: top(r.end_min) - top(r.start_min) }}
                      aria-hidden
                    />
                  ))}
                {cal.blocks
                  .filter((b) => b.start_ms < dayStart + 86_400_000 && b.end_ms > dayStart)
                  .map((b) => {
                    const s = Math.max(b.start_ms, dayStart);
                    const e = Math.min(b.end_ms, dayStart + 86_400_000);
                    const sm = (s - dayStart) / 60_000;
                    const em = (e - dayStart) / 60_000;
                    return (
                      <span
                        key={b.id}
                        className="absolute inset-x-1 overflow-hidden rounded-lg bg-tinta/10 p-1 text-[11px] font-semibold text-tinta"
                        style={{ top: Math.max(0, top(sm)), height: Math.max(18, Math.min(hours.length * HOUR_PX, top(em)) - Math.max(0, top(sm))) }}
                      >
                        {b.reason}
                      </span>
                    );
                  })}
                {dayItems(d).map((a) => {
                  const s = minutesOf(a.start_ms);
                  const e = minutesOf(a.end_ms);
                  return (
                    <Link
                      key={a.id}
                      to={`/panel/citas/${a.id}`}
                      className={`absolute inset-x-1 z-[1] overflow-hidden rounded-lg px-1.5 py-1 text-[11px] leading-tight ring-1 ${COLOR[a.status] ?? "bg-white ring-tinta/10"}`}
                      style={{ top: top(s), height: Math.max(24, top(e) - top(s) - 2) }}
                      title={`${timeOf(a.start_ms)} · ${a.patient_name} · ${a.status_label}`}
                    >
                      <span className="block truncate font-bold">
                        {timeOf(a.start_ms)} {a.modality === "virtual" ? "· virtual" : ""}
                      </span>
                      <span className="block truncate">{a.patient_name}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Móvil: tira de días + lista. */}
      <div className="md:hidden">
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={day === d}
              onClick={() => setDay(d)}
              className="relative flex min-h-16 flex-col items-center justify-center rounded-2xl bg-white text-tinta ring-1 ring-tinta/10 aria-pressed:bg-azul aria-pressed:text-white"
            >
              <span className="text-[11px] font-semibold">{dayParts(d).weekday}</span>
              <span className="font-display text-lg font-extrabold">{dayParts(d).day}</span>
              {dayItems(d).some((a) => !["cancelada", "rechazada"].includes(a.status)) && (
                <span className="absolute bottom-1.5 size-1.5 rounded-full bg-verde" aria-hidden />
              )}
            </button>
          ))}
        </div>
        <div className="mt-4">
          {dayItems(day).length ? (
            <ul className="grid gap-2">
              {dayItems(day).map((a) => (
                <li key={a.id}>
                  <Link to={`/panel/citas/${a.id}`} className="card flex items-center gap-3 p-3">
                    <span className="w-14 shrink-0 font-display text-lg font-extrabold">{timeOf(a.start_ms)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{a.patient_name}</span>
                      <span className="block text-xs muted">
                        {a.modality === "virtual" ? "Virtual" : "Presencial"} · {money(a.price_cents)}
                      </span>
                    </span>
                    <StatusBadge status={a.status} label={a.status_label} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Sin citas este día" icon="calendar">
              Comparte tu enlace de reservas o revisa tus horarios.
            </EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}
