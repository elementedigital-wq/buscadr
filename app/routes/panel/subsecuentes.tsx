/**
 * Citas subsecuentes (ADR 0017): el profesional programa series de controles para pacientes que
 * necesitan seguimiento, revisa las fechas contra su agenda, envía la propuesta y sigue la adherencia.
 */
import { useState } from "react";
import { Link, useRevalidator, useSearchParams } from "react-router";
import { Icon } from "../../components/Icon";
import { EmptyState, Notice, Spinner, Stat, StatusBadge } from "../../components/ui";
import { type ApiError, api } from "../../lib/api";
import { serverApi } from "../../lib/api.server";
import { FREQUENCIES, type FollowupPlan, SERIES_TITLES, frequencyLabel } from "../../lib/followups";
import { dateTime, money, pct, shortDate, timeOf } from "../../lib/format";
import type { Route } from "./+types/subsecuentes";

type Data = {
  plans: FollowupPlan[];
  patients: { ref: number; name: string; last_ms: number; modality: string }[];
  prefill: { ref: number; modality: string } | null;
  defaults: {
    price_in_person_cents: number;
    price_virtual_cents: number;
    in_person: boolean;
    virtual: boolean;
    slot_minutes: number;
    min_sessions: number;
    max_sessions: number;
    fee_bps: number;
  };
  kpis: { active: number; patients: number; proposals: number; next30: number; unpaid: number; conflicts: number; adherence: number | null };
};
type Preview = {
  ok: boolean;
  sessions: { seq: number; start_ms: number; local: string; conflict: string | null; conflict_label: string; blocking: boolean }[];
};

export const meta: Route.MetaFunction = () => [{ title: "Subsecuentes · Mi consultorio" }, { name: "robots", content: "noindex" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const cita = new URL(request.url).searchParams.get("cita");
  return serverApi<Data>(context, request, `/api/pro/followups${cita ? `?cita=${encodeURIComponent(cita)}` : ""}`);
}

const TABS = [
  ["curso", "En curso"],
  ["propuestas", "Propuestas"],
  ["otras", "Finalizadas y otras"],
] as const;

export default function Subsecuentes({ loaderData: d }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const [open, setOpen] = useState(!!d.prefill || d.plans.length === 0);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("curso");
  const [flash, setFlash] = useState<string | null>(null);
  const lists = {
    curso: d.plans.filter((p) => p.status === "activa"),
    propuestas: d.plans.filter((p) => p.status === "propuesta"),
    otras: d.plans.filter((p) => !["activa", "propuesta"].includes(p.status)),
  };
  const k = d.kpis;
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="label-eyebrow">Mi consultorio</p>
          <h1 className="text-3xl font-extrabold">Citas subsecuentes</h1>
          <p className="mt-1 max-w-2xl muted">
            Agenda programada para pacientes que necesitan seguimiento: controles prenatales o de crónicos, terapias, curaciones. Propones las fechas, el
            paciente las acepta y cada cita queda en tu agenda.
          </p>
        </div>
        <button type="button" className="btn" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="nueva-serie">
          <Icon name={open ? "x" : "calendar-plus"} className="size-4" /> {open ? "Cerrar" : "Programar serie"}
        </button>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores">
        <Stat icon="repeat" label="Series en curso" value={k.active} hint={k.proposals ? `${k.proposals} esperando respuesta` : "Sin propuestas pendientes"} />
        <Stat icon="users" label="Pacientes en seguimiento" value={k.patients} tone="cielo" />
        <Stat
          icon="calendar-check"
          label="Sesiones en 30 días"
          value={k.next30}
          hint={k.unpaid ? `${k.unpaid} sin pagar` : "Todas pagadas o sin costo"}
          tone="verde"
        />
        <Stat icon="chart" label="Asistencia" value={k.adherence == null ? "—" : `${k.adherence} %`} hint="Atendidas sobre sesiones ocurridas" tone="neutro" />
      </section>

      {flash && <Notice tone="success">{flash}</Notice>}
      {k.conflicts > 0 && (
        <Notice tone="warning" title="Sesiones por reagendar">
          {k.conflicts === 1 ? "Una sesión no pudo agendarse" : `${k.conflicts} sesiones no pudieron agendarse`} porque el horario se ocupó antes de que el
          paciente aceptara. Elige otra fecha en la serie.
        </Notice>
      )}

      {open && (
        <SeriesForm
          d={d}
          initialRef={d.prefill?.ref ?? Number(params.get("cita")) ?? 0}
          onDone={(msg) => {
            setFlash(msg);
            setOpen(false);
            setTab("propuestas");
          }}
        />
      )}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Series">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className="pill" onClick={() => setTab(id)}>
            {label} <span className="font-normal">({lists[id].length})</span>
          </button>
        ))}
      </div>
      {lists[tab].length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {lists[tab].map((p) => (
            <PlanCard key={p.id} plan={p} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={tab === "curso" ? "Sin series en curso" : tab === "propuestas" ? "Sin propuestas pendientes" : "Nada por aquí todavía"}
          icon="repeat"
        >
          {tab === "curso"
            ? "Cuando un paciente acepte una serie, verás aquí su avance, la asistencia y la próxima cita."
            : "Programa una serie desde el botón «Programar serie» o desde el detalle de una cita atendida."}
        </EmptyState>
      )}
    </div>
  );
}

function SeriesForm({ d, initialRef, onDone }: { d: Data; initialRef: number; onDone: (msg: string) => void }) {
  const revalidator = useRevalidator();
  const known = d.patients.some((p) => p.ref === initialRef);
  const [ref, setRef] = useState(known ? initialRef : (d.patients[0]?.ref ?? 0));
  const [modality, setModality] = useState<"presencial" | "virtual">(
    d.prefill?.modality === "virtual" && d.defaults.virtual ? "virtual" : d.defaults.in_person ? "presencial" : "virtual",
  );
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [first, setFirst] = useState("");
  const [interval, setIntervalDays] = useState(30);
  const [custom, setCustom] = useState(false);
  const [sessions, setSessions] = useState(4);
  const base = modality === "virtual" ? d.defaults.price_virtual_cents : d.defaults.price_in_person_cents;
  const [price, setPrice] = useState<string>(base ? (base / 100).toFixed(2) : "0");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [starts, setStarts] = useState<string[]>([]);
  const [busy, setBusy] = useState<"preview" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cents = Math.round(Number(price || 0) * 100);
  const share = Math.round(cents * (1 - d.defaults.fee_bps / 10_000));

  if (!d.patients.length)
    return (
      <section id="nueva-serie" className="card p-5">
        <EmptyState title="Aún no tienes pacientes para programar" icon="users">
          Las series se programan para pacientes que ya tuvieron una cita contigo (confirmada o atendida en el último año).
        </EmptyState>
      </section>
    );

  const body = (explicit: boolean) => ({
    patient_ref: ref,
    title,
    note,
    modality,
    interval_days: interval,
    price_cents: cents,
    ...(explicit ? { starts } : { first_start: first, sessions }),
  });

  async function review(explicit = false) {
    setBusy("preview");
    setError(null);
    try {
      const r = await api<Preview>("/api/pro/followups/preview", { body: body(explicit) });
      setPreview(r);
      setStarts(r.sessions.map((s) => s.local));
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    setBusy("send");
    setError(null);
    try {
      await api("/api/pro/followups", { body: body(true) });
      const who = d.patients.find((p) => p.ref === ref)?.name ?? "tu paciente";
      onDone(`Enviamos la propuesta de ${starts.length} citas a ${who}. Te avisaremos cuando la acepte.`);
      revalidator.revalidate();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  const edited = preview && starts.some((s, i) => s !== preview.sessions[i]?.local);
  return (
    <section id="nueva-serie" className="card space-y-4 p-5" aria-labelledby="nueva-serie-t">
      <h2 id="nueva-serie-t" className="text-lg font-extrabold">
        Programar una serie de citas
      </h2>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          review(false);
        }}
      >
        <label className="field sm:col-span-2">
          Paciente
          <select className="input" value={ref} onChange={(e) => setRef(Number(e.target.value))} required>
            {d.patients.map((p) => (
              <option key={p.ref} value={p.ref}>
                {p.name} · última cita {shortDate(p.last_ms)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Nombre de la serie
          <input
            className="input"
            list="titulos-serie"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            minLength={3}
            maxLength={80}
            placeholder="Ej.: Control mensual"
          />
          <datalist id="titulos-serie">
            {SERIES_TITLES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <span className="text-xs font-normal muted">Solo lo ven tú y el paciente; no aparece en avisos.</span>
        </label>
        <fieldset className="field">
          <legend className="mb-1.5">Tipo de atención</legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de atención">
            {(["presencial", "virtual"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={modality === m}
                className="pill"
                disabled={!(m === "presencial" ? d.defaults.in_person : d.defaults.virtual)}
                onClick={() => {
                  setModality(m);
                  const c = m === "virtual" ? d.defaults.price_virtual_cents : d.defaults.price_in_person_cents;
                  setPrice(c ? (c / 100).toFixed(2) : "0");
                }}
              >
                <Icon name={m === "presencial" ? "clinic" : "video"} className="size-4" /> {m === "presencial" ? "Presencial" : "Virtual"}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="field">
          Primera sesión
          <input type="datetime-local" className="input" value={first} onChange={(e) => setFirst(e.target.value)} required />
        </label>
        <label className="field">
          Frecuencia
          <select
            className="input"
            value={custom ? "otro" : String(interval)}
            onChange={(e) => {
              if (e.target.value === "otro") setCustom(true);
              else {
                setCustom(false);
                setIntervalDays(Number(e.target.value));
              }
            }}
          >
            {FREQUENCIES.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
            <option value="otro">Otro (en días)</option>
          </select>
        </label>
        {custom && (
          <label className="field">
            Cada cuántos días
            <input type="number" className="input" min={1} max={180} value={interval} onChange={(e) => setIntervalDays(Number(e.target.value))} required />
          </label>
        )}
        <label className="field">
          Número de sesiones
          <input
            type="number"
            className="input"
            min={d.defaults.min_sessions}
            max={d.defaults.max_sessions}
            value={sessions}
            onChange={(e) => setSessions(Number(e.target.value))}
            required
          />
        </label>
        <label className="field">
          Tarifa por sesión (USD)
          <span className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 muted">$</span>
            <input type="number" className="input pl-7" min={0} max={10000} step="0.5" value={price} onChange={(e) => setPrice(e.target.value)} required />
          </span>
          <span className="text-xs font-normal muted">
            {cents > 0
              ? `El paciente paga cada sesión con tarjeta hasta 24 h antes. Recibes ${money(share)} por sesión (comisión ${pct(d.defaults.fee_bps)}).`
              : "Sin costo: los controles gratuitos no requieren pago."}
          </span>
        </label>
        <label className="field sm:col-span-2">
          Nota para el paciente <span className="font-normal muted">(opcional, privada)</span>
          <textarea
            className="input min-h-20"
            maxLength={280}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ej.: traer exámenes de control"
          />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" className="btn-outline" disabled={busy !== null}>
            {busy === "preview" ? <Spinner label="Revisando" /> : <Icon name="calendar-check" className="size-4" />} Revisar fechas en mi agenda
          </button>
        </div>
      </form>

      {error && <Notice tone="danger">{error}</Notice>}

      {preview && (
        <div className="space-y-3">
          <h3 className="font-bold">
            {starts.length} sesiones · {frequencyLabel(interval).toLowerCase()} ·{" "}
            {cents ? `${money(cents)} c/u (total ${money(cents * starts.length)})` : "sin costo"}
          </h3>
          <ol className="grid gap-2">
            {preview.sessions.map((s, i) => (
              <li
                key={s.seq}
                className={`flex flex-wrap items-center gap-3 rounded-2xl p-3 ring-1 ${s.blocking ? "bg-alerta/5 ring-alerta/30" : s.conflict ? "bg-amarillo/10 ring-amarillo/40" : "bg-fondo ring-tinta/5"}`}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-sm font-bold ring-1 ring-tinta/10">{s.seq}</span>
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Fecha y hora de la sesión {s.seq}</span>
                  <input
                    type="datetime-local"
                    className="input"
                    value={starts[i] ?? s.local}
                    onChange={(e) => setStarts((arr) => arr.map((v, j) => (j === i ? e.target.value : v)))}
                  />
                </label>
                <span className={`text-sm font-semibold ${s.blocking ? "text-alerta-ink" : s.conflict ? "text-tinta" : "text-verde-ink"}`}>
                  {s.conflict ? s.conflict_label : "Libre"}
                </span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            {(edited || !preview.ok) && (
              <button type="button" className="btn-outline" onClick={() => review(true)} disabled={busy !== null}>
                {busy === "preview" ? <Spinner label="Revisando" /> : <Icon name="repeat" className="size-4" />} Volver a revisar
              </button>
            )}
            <button type="button" className="btn" onClick={send} disabled={busy !== null || !preview.ok || !!edited || title.trim().length < 3}>
              {busy === "send" ? <Spinner label="Enviando" /> : <Icon name="paper-plane" className="size-4" />} Enviar propuesta al paciente
            </button>
          </div>
          <p className="text-xs muted">
            El paciente recibe un aviso y acepta o rechaza la serie (tiene 72 h). Al aceptar, cada sesión queda confirmada en tu agenda
            {cents ? " y el paciente la paga con tarjeta hasta 24 h antes; si no paga, el horario se libera solo." : "."}
          </p>
        </div>
      )}
    </section>
  );
}

function PlanCard({ plan: p }: { plan: FollowupPlan }) {
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = p.summary.attended + p.summary.no_show;
  const progress = p.summary.total ? Math.round((p.summary.attended / p.summary.total) * 100) : 0;

  async function cancel() {
    const reason = prompt("¿Por qué cancelas la serie? Se cancelan las citas que faltan y se reembolsan las pagadas.", "");
    if (reason === null) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/pro/followups/${p.id}/cancel`, { body: { reason } });
      revalidator.revalidate();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function reschedule(seq: number, start: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/pro/followups/${p.id}/sessions/${seq}`, { body: { start } });
      revalidator.revalidate();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card min-w-0 space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-lg font-extrabold break-words">{p.title}</h3>
          <p className="text-sm muted">
            {p.patient_name} · {p.modality === "virtual" ? "Virtual" : "Presencial"} · {frequencyLabel(p.interval_days)} ·{" "}
            {p.price_cents ? `${money(p.price_cents)} por sesión` : "sin costo"}
          </p>
        </div>
        <StatusBadge status={p.status} label={p.status_label} />
      </div>
      {p.status !== "propuesta" && (
        <div>
          <div className="flex justify-between gap-2 text-xs font-semibold">
            <span>
              {p.summary.attended} de {p.summary.total} atendidas
            </span>
            {done > 0 && <span>Asistencia {p.summary.adherence} %</span>}
          </div>
          <div
            className="mt-1 h-2 overflow-hidden rounded-full bg-fondo"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Avance de la serie"
          >
            <div className="h-full rounded-full bg-verde" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      <p className="text-sm">
        {p.status === "propuesta" && p.expires_ms ? (
          <>Esperando respuesta del paciente hasta el {dateTime(p.expires_ms)}.</>
        ) : p.summary.next ? (
          <>
            Próxima: <strong>{dateTime(p.summary.next.start_ms)}</strong>
            {p.summary.next.unpaid ? " · pago pendiente" : ""}
          </>
        ) : p.cancel_reason ? (
          <span className="muted">{p.cancel_reason}</span>
        ) : null}
      </p>
      {p.note && <p className="rounded-2xl bg-fondo p-3 text-sm break-words">{p.note}</p>}
      {error && <Notice tone="danger">{error}</Notice>}
      <details className="group">
        <summary className="cursor-pointer text-sm font-semibold text-azul-ink">Ver las {p.summary.total} sesiones</summary>
        <ol className="mt-2 divide-y divide-tinta/5">
          {p.sessions.map((s) => (
            <li key={s.seq} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-semibold">
                  {s.seq}. {shortDate(s.start_ms)}, {timeOf(s.start_ms)}
                </span>
                {s.payment_label && <span className="block text-xs muted">{s.payment_label}</span>}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <StatusBadge status={s.status ?? s.session_status} label={s.status_label} />
                {s.appointment_id && (
                  <Link to={`/panel/citas/${s.appointment_id}`} className="text-xs font-semibold text-azul-ink underline">
                    Cita #{s.appointment_id}
                  </Link>
                )}
              </span>
              {s.session_status === "conflicto" && p.status === "activa" && <RescheduleSession seq={s.seq} busy={busy} onSave={reschedule} />}
            </li>
          ))}
        </ol>
      </details>
      {p.can.cancel && (
        <button type="button" className="btn-outline btn-sm" onClick={cancel} disabled={busy}>
          <Icon name="x" className="size-4" /> {p.status === "propuesta" ? "Retirar propuesta" : "Cancelar lo que falta"}
        </button>
      )}
    </article>
  );
}

function RescheduleSession({ seq, busy, onSave }: { seq: number; busy: boolean; onSave: (seq: number, start: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex w-full flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value) onSave(seq, value);
      }}
    >
      <label className="min-w-0 flex-1">
        <span className="sr-only">Nueva fecha de la sesión {seq}</span>
        <input type="datetime-local" className="input" value={value} onChange={(e) => setValue(e.target.value)} required />
      </label>
      <button type="submit" className="btn btn-sm" disabled={busy || !value}>
        Reagendar
      </button>
    </form>
  );
}
