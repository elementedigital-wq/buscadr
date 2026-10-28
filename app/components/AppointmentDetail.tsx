/**
 * Detalle de una cita (paciente y profesional): estado, acciones permitidas por el servidor,
 * pago, videollamada, código de llegada, calendario, WhatsApp, chat y opinión verificada.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRevalidator } from "react-router";
import { type ApiError, api } from "../lib/api";
import { addDays, dateTime, dayParts, money, timeOf, toLocalDate, whenLabel } from "../lib/format";
import type { AppointmentView, Slot } from "../lib/types";
import { Icon } from "./Icon";
import { Avatar, DemoBadge, Notice, Spinner, StatusBadge } from "./ui";

const STEPS = [
  ["solicitada", "Solicitada"],
  ["confirmada", "Confirmada"],
  ["completada", "Atendida"],
] as const;

function Stepper({ status }: { status: string }) {
  const index = status === "completada" ? 2 : status === "confirmada" ? 1 : status === "solicitada" ? 0 : -1;
  if (index < 0) return null;
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Avance de la cita">
      {STEPS.map(([key, label], i) => (
        <li key={key} className="min-w-0">
          <span className={`block h-1.5 rounded-full ${i <= index ? "bg-azul" : "bg-gris-claro"}`} />
          <span className={`mt-1.5 block truncate text-xs font-semibold ${i <= index ? "text-azul" : "muted"}`}>{label}</span>
        </li>
      ))}
    </ol>
  );
}

const gcal = (a: AppointmentView) => {
  const f = (ms: number) =>
    new Date(ms)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const qs = new URLSearchParams({
    action: "TEMPLATE",
    text: `Cita ${a.modality} con ${a.practitioner.name} (buscaDR)`,
    dates: `${f(a.start_ms)}/${f(a.end_ms)}`,
    details: `Cita #${a.id} en buscaDR`,
    location: a.modality === "virtual" ? "Videollamada (enlace en buscaDR)" : (a.practitioner.address ?? `${a.practitioner.sector}, ${a.practitioner.city}`),
  });
  return `https://calendar.google.com/calendar/render?${qs}`;
};

function Reschedule({ a, onDone }: { a: AppointmentView; onDone: (id: number) => void }) {
  const [from, setFrom] = useState(toLocalDate(Date.now()));
  const [days, setDays] = useState<{ date: string; slots: Slot[] }[] | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDays(null);
    api<{ days: { date: string; slots: Slot[] }[] }>(`/api/practitioners/${a.practitioner.slug}/availability?from=${from}&days=7&modality=${a.modality}`)
      .then((r) => {
        setDays(r.days);
        setDate(r.days.find((d) => d.slots.length)?.date ?? null);
      })
      .catch(() => setDays([]));
  }, [a.practitioner.slug, a.modality, from]);
  const slots = useMemo(() => days?.find((d) => d.date === date)?.slots ?? [], [days, date]);
  async function save() {
    if (!slot) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ id: number }>(`/api/appointments/${a.id}/actions/reschedule`, { body: { start: slot } });
      onDone(r.id);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 rounded-2xl bg-fondo p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">Elige el nuevo horario</p>
        <div className="flex gap-1.5">
          <button
            type="button"
            className="icon-btn size-9"
            onClick={() => setFrom((f) => addDays(f, -7))}
            disabled={from <= toLocalDate(Date.now())}
            aria-label="Semana anterior"
          >
            <Icon name="chevron-left" className="size-4" />
          </button>
          <button type="button" className="icon-btn size-9" onClick={() => setFrom((f) => addDays(f, 7))} aria-label="Semana siguiente">
            <Icon name="chevron" className="size-4" />
          </button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1.5">
        {(days ?? []).map((d) => (
          <button
            key={d.date}
            type="button"
            disabled={!d.slots.length}
            aria-pressed={date === d.date}
            onClick={() => setDate(d.date)}
            className="flex min-h-14 flex-col items-center justify-center rounded-xl bg-white text-xs ring-1 ring-tinta/5 aria-pressed:bg-azul aria-pressed:text-white disabled:opacity-40"
          >
            <span>{dayParts(d.date).weekday}</span>
            <span className="font-display text-base font-extrabold">{dayParts(d.date).day}</span>
          </button>
        ))}
      </div>
      {!days ? (
        <p className="mt-3 flex items-center gap-2 text-sm muted">
          <Spinner /> Buscando horarios…
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {slots.map((s) => (
            <button key={s.start_ms} type="button" aria-pressed={slot === s.start_ms} onClick={() => setSlot(s.start_ms)} className="pill px-2">
              {timeOf(s.start_ms)}
            </button>
          ))}
          {!slots.length && <p className="col-span-full text-sm muted">Sin horarios ese día.</p>}
        </div>
      )}
      {error && <p className="mt-2 text-sm text-alerta-ink">{error}</p>}
      <button type="button" className="btn-primary mt-3 w-full sm:w-auto" disabled={!slot || busy} onClick={save}>
        {busy ? <Spinner /> : <Icon name="calendar-check" className="size-4" />} Confirmar nuevo horario
      </button>
    </div>
  );
}

function Review({ id, onDone }: { id: number; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/appointments/${id}/actions/review`, { body: { rating, body } });
      onDone();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={send} className="card p-5">
      <h2 className="text-lg font-extrabold">¿Cómo fue tu cita?</h2>
      <p className="text-sm muted">Tu opinión verificada ayuda a otros pacientes. No incluyas datos de salud.</p>
      <div className="mt-3 flex gap-1.5" role="radiogroup" aria-label="Calificación">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            onClick={() => setRating(n)}
            className="grid size-11 place-items-center rounded-xl ring-1 ring-tinta/10"
            aria-label={`${n} estrellas`}
          >
            <Icon name={n <= rating ? "star" : "regular:star"} className="size-5 text-[#f5b301]" />
          </button>
        ))}
      </div>
      <textarea
        className="input mt-3 min-h-24 py-2"
        maxLength={800}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Puntualidad, trato, claridad de las explicaciones…"
      />
      {error && <p className="mt-2 text-sm text-alerta-ink">{error}</p>}
      <button type="submit" className="btn-primary mt-3" disabled={busy}>
        Publicar opinión
      </button>
    </form>
  );
}

function Chat({ a, onSent }: { a: AppointmentView; onSent: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api(`/api/appointments/${a.id}/messages`, { body: { body: text } });
      setText("");
      onSent();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card p-5" aria-labelledby="mensajes">
      <h2 id="mensajes" className="text-lg font-extrabold">
        Mensajes
      </h2>
      <p className="text-sm muted">Para coordinar la cita. Por privacidad ocultamos teléfonos y correos, y no se envían diagnósticos ni datos clínicos.</p>
      <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
        {a.messages.map((m) => (
          <li key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <span className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${m.mine ? "bg-azul text-white" : "bg-fondo"}`}>
              <span className={`block text-[11px] font-semibold ${m.mine ? "text-white/80" : "muted"}`}>{m.author}</span>
              {m.body}
            </span>
          </li>
        ))}
        {!a.messages.length && <li className="text-sm muted">Aún no hay mensajes.</li>}
      </ul>
      <form onSubmit={send} className="mt-3 flex gap-2">
        <label className="sr-only" htmlFor="msg">
          Mensaje
        </label>
        <input id="msg" className="input" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="Escribe un mensaje" />
        <button type="submit" className="btn-primary shrink-0 px-4" disabled={busy || !text.trim()} aria-label="Enviar mensaje">
          <Icon name="paper-plane" className="size-4" />
        </button>
      </form>
    </section>
  );
}

export function AppointmentDetail({ a, fresh = false }: { a: AppointmentView; fresh?: boolean }) {
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const isPro = a.viewer === "pro" || a.viewer === "admin";
  const has = (x: string) => a.actions.includes(x);
  const now = Date.now();

  async function act(action: string, body: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    setInfo(null);
    try {
      const r = await api<{ checkout?: string; refunded?: boolean; refundable_policy?: string | null }>(`/api/appointments/${a.id}/actions/${action}`, {
        body,
      });
      if (r.checkout) {
        if (/^https?:/.test(r.checkout)) window.location.assign(r.checkout);
        else navigate(r.checkout);
        return;
      }
      if (action === "cancel") setInfo(r.refunded ? "Cita cancelada. Te reembolsamos el pago." : (r.refundable_policy ?? "Cita cancelada."));
      revalidator.revalidate();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  }
  const ask = (action: string, question: string) => {
    const reason = window.prompt(question);
    if (reason === null) return;
    act(action, { reason });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-5">
        {fresh && (
          <Notice tone="success" title={a.status === "confirmada" ? "¡Cita confirmada!" : "Solicitud enviada"}>
            {a.status === "confirmada"
              ? "Te recordaremos 24 h y 1 h antes. Puedes agregarla a tu calendario."
              : "El profesional la confirmará pronto. Te avisaremos en la app, por correo y por WhatsApp (si lo activaste)."}
          </Notice>
        )}
        {a.demo && (
          <Notice tone="warning" title="Cita de prueba">
            Es una cita con un perfil de muestra: no se avisó a ningún profesional. Puedes probar los pasos de confirmación y atención.
          </Notice>
        )}
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-4 p-5">
            {isPro ? <Avatar name={a.patient.name} size={64} /> : <Avatar name={a.practitioner.name} photo={a.practitioner.photo} size={64} rounded="xl" />}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold tracking-wide uppercase muted">Cita #{a.id}</p>
              <h1 className="text-2xl leading-tight font-extrabold">{isPro ? a.patient.name : a.practitioner.name}</h1>
              {!isPro && (
                <Link to={`/doctor/${a.practitioner.slug}`} className="text-sm font-semibold text-azul">
                  Ver perfil
                </Link>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge status={a.status} label={a.status_label} />
              {a.demo && <DemoBadge />}
            </div>
          </div>
          <div className="px-5">
            <Stepper status={a.status} />
          </div>
          <dl className="mt-4 grid gap-px bg-tinta/5 sm:grid-cols-3">
            <div className="bg-white p-4">
              <dt className="flex items-center gap-1.5 text-xs muted">
                <Icon name="calendar" className="size-3.5" /> Fecha
              </dt>
              <dd className="font-semibold">{whenLabel(a.start_ms)}</dd>
            </div>
            <div className="bg-white p-4">
              <dt className="flex items-center gap-1.5 text-xs muted">
                <Icon name={a.modality === "virtual" ? "video" : "clinic"} className="size-3.5" /> Modalidad
              </dt>
              <dd className="font-semibold">{a.modality === "virtual" ? "Virtual (videollamada)" : "Presencial"}</dd>
            </div>
            <div className="bg-white p-4">
              <dt className="flex items-center gap-1.5 text-xs muted">
                <Icon name="wallet" className="size-3.5" /> {isPro ? "Recibes" : "Tarifa"}
              </dt>
              <dd className="font-semibold">
                {money(isPro ? a.net_cents : a.price_cents)} <span className="text-xs font-normal muted">· {a.payment_label}</span>
              </dd>
            </div>
          </dl>
          {a.reason && (
            <p className="border-t border-tinta/5 px-5 py-3 text-sm">
              <span className="font-semibold">Motivo:</span> {a.reason}
            </p>
          )}
          {a.cancel_reason && <p className="border-t border-tinta/5 px-5 py-3 text-sm muted">{a.cancel_reason}</p>}
        </section>

        {(error || info) && <Notice tone={error ? "danger" : "success"}>{error ?? info}</Notice>}

        {a.actions.length > 0 && (
          <section className="card p-5" aria-label="Acciones">
            <div className="flex flex-wrap gap-2">
              {has("pay") && (
                <button type="button" className="btn-primary" disabled={!!busy} onClick={() => act("pay")}>
                  <Icon name="card" className="size-4" /> Pagar {money(a.price_cents)}
                </button>
              )}
              {has("confirm") && (
                <button type="button" className="btn-accent" disabled={!!busy} onClick={() => act("confirm")}>
                  <Icon name="check" className="size-4" /> Confirmar cita
                </button>
              )}
              {has("decline") && (
                <button
                  type="button"
                  className="btn-danger"
                  disabled={!!busy}
                  onClick={() => ask("decline", "¿Por qué no puedes atender? (el paciente lo verá)")}
                >
                  Rechazar
                </button>
              )}
              {has("complete") && (
                <button type="button" className="btn-accent" disabled={!!busy} onClick={() => act("complete")}>
                  <Icon name="check-circle" className="size-4" /> Marcar como atendida
                </button>
              )}
              {has("mark_paid") && (
                <button type="button" className="btn-outline" disabled={!!busy} onClick={() => act("mark_paid", { body: "efectivo" })}>
                  <Icon name="receipt" className="size-4" /> Registrar pago en consultorio
                </button>
              )}
              {has("no_show") && (
                <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => act("no_show")}>
                  No asistió
                </button>
              )}
              {has("reschedule") && (
                <button type="button" className="btn-outline" onClick={() => setRescheduling((v) => !v)} aria-expanded={rescheduling}>
                  <Icon name="repeat" className="size-4" /> Reprogramar
                </button>
              )}
              {has("cancel") && (
                <button type="button" className="btn-danger" disabled={!!busy} onClick={() => ask("cancel", "Motivo de la cancelación (opcional)")}>
                  Cancelar cita
                </button>
              )}
            </div>
            {has("cancel") && a.payment_status === "pagado" && !isPro && (
              <p className="mt-2 text-xs muted">
                Reembolso completo si cancelas hasta el {dateTime(a.free_cancel_until)}. Después, el pago no es reembolsable.
              </p>
            )}
            {rescheduling && <Reschedule a={a} onDone={(id) => navigate(`/citas/${id}?nueva=1`)} />}
          </section>
        )}

        {!isPro && has("review") && <Review id={a.id} onDone={() => revalidator.revalidate()} />}
        {a.review && (
          <section className="card p-5">
            <h2 className="font-extrabold">Opinión publicada</h2>
            <p className="mt-1 flex items-center gap-1 text-[#f5b301]">
              {Array.from({ length: a.review.rating }, (_, i) => (
                <Icon key={i} name="star" className="size-4" />
              ))}
            </p>
            {a.review.body && <p className="mt-1 text-sm">{a.review.body}</p>}
          </section>
        )}

        {a.status !== "cancelada" && a.status !== "rechazada" && a.status !== "expirada" && <Chat a={a} onSent={() => revalidator.revalidate()} />}
      </div>

      <aside className="min-w-0 space-y-5">
        {a.video && a.status === "confirmada" && (
          <section className="card bg-brand-dark p-5 text-white">
            <p className="flex items-center gap-2 font-display text-lg font-bold">
              <Icon name="video" className="size-5" /> Videollamada
            </p>
            {a.video.url ? (
              <>
                <p className="mt-1 text-sm text-white/85">
                  {a.video.open ? "La sala está abierta." : "Cita de prueba: puedes ver la sala."} Usa auriculares y un lugar privado.
                </p>
                <a href={a.video.url} target="_blank" rel="noopener noreferrer" className="btn mt-3 w-full bg-white text-tinta hover:bg-celeste">
                  Entrar a la videollamada
                </a>
              </>
            ) : (
              <p className="mt-1 text-sm text-white/85">El enlace seguro se habilita 15 minutos antes ({timeOf(a.video.opens_at)}). Te lo recordaremos.</p>
            )}
          </section>
        )}
        {a.modality === "presencial" && a.practitioner.address && (
          <section className="card p-5">
            <p className="flex items-center gap-2 font-display text-lg font-bold">
              <Icon name="pin" className="size-5 text-azul" /> Dirección
            </p>
            <p className="mt-1 text-sm">{a.practitioner.address}</p>
            {a.practitioner.lat != null && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${a.practitioner.lat},${a.practitioner.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline btn-sm mt-3"
              >
                Cómo llegar
              </a>
            )}
            {a.checkin_code && (
              <div className="mt-4 rounded-2xl bg-celeste/70 p-4 text-center">
                <p className="text-xs font-semibold tracking-wide uppercase muted">Código de llegada</p>
                <p className="font-display text-3xl font-extrabold tracking-[0.2em] text-azul">{a.checkin_code}</p>
                <p className="text-xs muted">{isPro ? "El paciente lo muestra al llegar." : "Muéstralo en recepción."}</p>
              </div>
            )}
          </section>
        )}
        {["solicitada", "confirmada"].includes(a.status) && a.start_ms > now && (
          <section className="card p-5">
            <p className="font-display text-lg font-bold">Agrega tu cita</p>
            <div className="mt-3 grid gap-2">
              <a href={a.ics} className="btn-outline btn-sm justify-start">
                <Icon name="calendar-plus" className="size-4" /> Calendario del teléfono (.ics)
              </a>
              <a href={gcal(a)} target="_blank" rel="noopener noreferrer" className="btn-outline btn-sm justify-start">
                <Icon name="google" className="size-4" /> Google Calendar
              </a>
              <a href={a.whatsapp.share} target="_blank" rel="noopener noreferrer" className="btn-outline btn-sm justify-start">
                <Icon name="whatsapp" className="size-4" /> Guardar en mi WhatsApp
              </a>
              {a.whatsapp.support && (
                <a href={a.whatsapp.support} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm justify-start">
                  <Icon name="whatsapp" className="size-4" /> Ayuda de buscaDR por WhatsApp
                </a>
              )}
            </div>
          </section>
        )}
        {a.payments.length > 0 && (
          <section className="card p-5">
            <p className="font-display text-lg font-bold">Pagos</p>
            <ul className="mt-2 space-y-2 text-sm">
              {a.payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-fondo px-3 py-2">
                  <span className="min-w-0">
                    <span className="block font-semibold">{money(p.amount_cents)}</span>
                    <span className="block text-xs muted">
                      {p.provider === "consultorio" ? "En consultorio" : p.provider === "sandbox" ? "buscaDR Pay (prueba)" : "buscaDR Pay"}
                      {p.card_last4 ? ` · ${p.card_brand} •••• ${p.card_last4}` : ""}
                    </span>
                  </span>
                  <StatusBadge status={p.status} label={p.status} />
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="card p-5">
          <p className="font-display text-lg font-bold">Historial</p>
          <ol className="mt-2 space-y-2 text-sm">
            {a.events.map((e, i) => (
              <li key={`${e.type}-${i}`} className="flex gap-2">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-azul" aria-hidden />
                <span className="min-w-0">
                  <span className="font-semibold">{EVENT_LABEL[e.type] ?? e.type}</span> <span className="muted">· {e.actor}</span>
                  <span className="block text-xs muted">{dateTime(e.created_at)}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}

const EVENT_LABEL: Record<string, string> = {
  solicitada: "Cita solicitada",
  creada_confirmada: "Cita creada y confirmada",
  confirm: "Confirmada",
  decline: "No aceptada",
  cancel: "Cancelada",
  complete: "Atendida",
  no_show: "No asistió",
  mark_paid: "Pago registrado en consultorio",
  pay: "Pago iniciado",
  pago_aprobado: "Pago aprobado",
  reschedule: "Reprogramada",
  reprogramada_desde: "Reprogramación de otra cita",
  review: "Opinión publicada",
  recordatorio_24h: "Recordatorio 24 h enviado",
  recordatorio_1h: "Recordatorio 1 h enviado",
};
