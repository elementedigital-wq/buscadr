/**
 * Reserva de cita en el perfil (referencias UX: tipo de atención «Presencial / Virtual», tira de días
 * en píldoras, horarios agrupados y botón «Agendar» fijo). La disponibilidad viene del servidor y se
 * vuelve a validar de forma atómica al confirmar.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { type ApiError, api } from "../lib/api";
import {
  FEATURED_PLAN_SPECIALTIES,
  PLAN_FREQUENCIES,
  PLAN_MAX_SESSIONS,
  PLAN_MIN_SESSIONS,
  frequencyName,
  planDates,
  templatesFor,
} from "../../server/lib/plan-templates";
import { addDays, dayParts, money, shortDate, timeOf, toLocalDate } from "../lib/format";
import type { PublicPractitioner, Slot } from "../lib/types";
import { Icon } from "./Icon";
import { useRootData } from "../root";
import { Notice, Spinner } from "./ui";

type Day = { date: string; slots: Slot[] };
type Modality = "presencial" | "virtual";

const groupOf = (ms: number) => {
  const h = Number(timeOf(ms).slice(0, 2));
  return h < 12 ? "Mañana" : h < 18 ? "Tarde" : "Noche";
};

export function BookingCalendar({ p, loggedIn, bookLabel = "Agendar cita" }: { p: PublicPractitioner; loggedIn: boolean; bookLabel?: string }) {
  const navigate = useNavigate();
  const root = useRootData();
  const today = toLocalDate(Date.now());
  const [params] = useSearchParams();
  // Horario elegido antes de iniciar sesión (vuelve en la URL: ?modalidad=…&hora=…): se restaura.
  const wanted = useRef<number | null>(Number(params.get("hora")) > Date.now() ? Number(params.get("hora")) : null);
  const wantedModality = params.get("modalidad");
  const [modality, setModality] = useState<Modality>(
    wantedModality === "virtual" && p.virtual
      ? "virtual"
      : wantedModality === "presencial" && p.in_person
        ? "presencial"
        : p.in_person
          ? "presencial"
          : "virtual",
  );
  const [from, setFrom] = useState(() => (wanted.current ? toLocalDate(wanted.current) : today));
  const [days, setDays] = useState<Day[] | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  // Plan de consultas programadas (ADR 0019): cita única o plan por plantilla o armado a mano.
  const templates = templatesFor(p.specialty);
  const featured = FEATURED_PLAN_SPECIALTIES.includes(p.specialty);
  const [planMode, setPlanMode] = useState<"single" | "plan">("single");
  const [planChoice, setPlanChoice] = useState<string>(templates[0]?.id ?? "custom");
  const [customInterval, setCustomInterval] = useState(30);
  const [customSessions, setCustomSessions] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`);

  const price = modality === "virtual" ? p.price_virtual_cents : p.price_in_person_cents;
  // Solo tarjeta (ADR 0016): toda cita con tarifa se paga con tarjeta de crédito o débito al reservar.
  const cardOk = (root?.catalog.gateways ?? []).length > 0 || p.demo;
  const online = price > 0;
  const chosenTemplate = templates.find((t) => t.id === planChoice);
  const plan =
    planMode === "plan" && !p.demo
      ? chosenTemplate
        ? { title: chosenTemplate.title, interval_days: chosenTemplate.interval_days, sessions: chosenTemplate.sessions, body: { template: chosenTemplate.id } }
        : {
            title: `Plan ${frequencyName(customInterval).toLowerCase()}`,
            interval_days: customInterval,
            sessions: customSessions,
            body: { interval_days: customInterval, sessions: customSessions },
          }
      : null;
  const dates = plan && slot ? planDates(slot, plan.interval_days, plan.sessions) : [];

  useEffect(() => {
    let cancelled = false;
    setDays(null);
    api<{ days: Day[] }>(`/api/practitioners/${p.slug}/availability?from=${from}&days=7&modality=${modality}`)
      .then((r) => {
        if (cancelled) return;
        setDays(r.days);
        const first = r.days.find((d) => d.slots.length);
        const restore = wanted.current ? r.days.find((d) => d.slots.some((s) => s.start_ms === wanted.current)) : undefined;
        if (restore) return setDate(restore.date);
        setDate((prev) => (prev && r.days.some((d) => d.date === prev && d.slots.length) ? prev : (first?.date ?? r.days[0]?.date ?? null)));
      })
      .catch(() => !cancelled && setDays([]));
    return () => {
      cancelled = true;
    };
  }, [p.slug, from, modality]);

  // Al cambiar de día o modalidad se descarta el horario elegido (salvo el que se restaura tras iniciar sesión).
  // biome-ignore lint/correctness/useExhaustiveDependencies: la modalidad cambia los horarios ofrecidos aunque no se lea aquí
  useEffect(() => {
    const w = wanted.current;
    if (w && days?.some((d) => d.date === date && d.slots.some((s) => s.start_ms === w))) {
      setSlot(w);
      wanted.current = null;
    } else setSlot(null);
  }, [date, modality, days]);

  const daySlots = useMemo(() => days?.find((d) => d.date === date)?.slots ?? [], [days, date]);
  const groups = useMemo(() => {
    const out = new Map<string, Slot[]>();
    for (const s of daySlots) out.set(groupOf(s.start_ms), [...(out.get(groupOf(s.start_ms)) ?? []), s]);
    return [...out];
  }, [daySlots]);

  async function book() {
    if (!slot) return;
    if (!loggedIn) {
      navigate(`/cuenta?next=${encodeURIComponent(`/doctor/${p.slug}?modalidad=${modality}&hora=${slot}#reservar`)}&motivo=reservar`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ id: number; checkout: string | null }>("/api/appointments", {
        body: { practitioner_id: p.id, start: slot, modality, reason, idempotency_key: key.current, ...(plan ? { plan: plan.body } : {}) },
      });
      if (res.checkout) {
        if (/^https?:/.test(res.checkout)) window.location.assign(res.checkout);
        else navigate(res.checkout);
      } else navigate(`/citas/${res.id}?nueva=1`);
    } catch (e) {
      setError((e as ApiError).message);
      if ((e as ApiError).code === "BOOKING_SLOT_TAKEN") {
        key.current = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
        setDays((d) => d?.map((x) => ({ ...x, slots: x.slots.filter((s) => s.start_ms !== slot) })) ?? null);
        setSlot(null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-4 sm:p-5" aria-labelledby="reservar">
      <h2 id="reservar" className="text-xl font-extrabold">
        Agenda tu cita
      </h2>
      {(p.in_person || p.virtual) && (
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">Tipo de atención</legend>
          <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup">
            {(["presencial", "virtual"] as const).map((m) => {
              const enabled = m === "presencial" ? p.in_person : p.virtual;
              const cents = m === "presencial" ? p.price_in_person_cents : p.price_virtual_cents;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={modality === m}
                  disabled={!enabled}
                  onClick={() => setModality(m)}
                  className="pill flex-col gap-0.5 rounded-2xl py-2.5"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name={m === "presencial" ? "clinic" : "video"} className="size-4" />
                    {m === "presencial" ? "Presencial" : "Virtual"}
                  </span>
                  <span className="text-xs font-medium">{enabled ? (cents ? money(cents) : "Consultar") : "No disponible"}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {!p.demo && (
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">Tipo de consulta</legend>
          <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de consulta">
            {(
              [
                ["single", "Cita única", "calendar-check"],
                ["plan", "Plan de consultas", "repeat"],
              ] as const
            ).map(([m, label, icon]) => (
              <button key={m} type="button" role="radio" aria-checked={planMode === m} onClick={() => setPlanMode(m)} className="pill rounded-2xl py-2.5">
                <Icon name={icon} className="size-4" /> {label}
              </button>
            ))}
          </div>
          {featured && planMode === "single" && (
            <p className="mt-2 text-xs muted">¿Necesitas controles periódicos? Arma un plan de consultas programadas con este profesional.</p>
          )}
          {planMode === "plan" && (
            <div className="mt-3 space-y-2">
              <div className="grid gap-2" role="radiogroup" aria-label="Plan de consultas">
                {[
                  ...templates.map((t) => ({ ...t, custom: false })),
                  { id: "custom", title: "Armar mi plan", hint: "Elige la frecuencia y cuántas consultas", custom: true, interval_days: 0, sessions: 0 },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={planChoice === t.id}
                    onClick={() => setPlanChoice(t.id)}
                    className={`flex min-w-0 items-start gap-3 rounded-2xl p-3 text-left ring-1 transition ${planChoice === t.id ? "bg-white ring-2 ring-azul" : "bg-white ring-tinta/10 hover:ring-azul/40"}`}
                  >
                    <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${t.custom ? "tone-verde" : "tone-azul"}`} aria-hidden>
                      <Icon name={t.custom ? "sliders" : "calendar-days"} className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold break-words">{t.title}</span>
                      <span className="block text-xs muted">
                        {t.custom ? t.hint : `${frequencyName(t.interval_days)} · ${t.sessions} consultas · ${t.hint}`}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {planChoice === "custom" && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="field">
                    Frecuencia
                    <select className="input" value={customInterval} onChange={(e) => setCustomInterval(Number(e.target.value))}>
                      {PLAN_FREQUENCIES.map(([d, l]) => (
                        <option key={d} value={d}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Consultas
                    <select className="input" value={customSessions} onChange={(e) => setCustomSessions(Number(e.target.value))}>
                      {Array.from({ length: PLAN_MAX_SESSIONS - PLAN_MIN_SESSIONS + 1 }, (_, i) => i + PLAN_MIN_SESSIONS).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              <p className="text-xs muted">
                Plan orientativo: tu profesional lo acepta o lo ajusta en la consulta. La primera cita es el horario que elijas abajo; las siguientes quedan el
                mismo día de la semana y a la misma hora.
              </p>
            </div>
          )}
        </fieldset>
      )}

      <div className="mt-5 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{plan ? "Elige el día de la primera consulta" : "Elige el día"}</p>
        <div className="flex gap-1.5">
          <button
            type="button"
            className="icon-btn size-9"
            onClick={() => setFrom((f) => (f > today ? addDays(f, -7) : f))}
            disabled={from <= today}
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
        {(days ?? Array.from({ length: 7 }, (_, i) => ({ date: addDays(from, i), slots: [] as Slot[] }))).map((d) => {
          const parts = dayParts(d.date);
          const free = d.slots.length;
          return (
            <button
              key={d.date}
              type="button"
              data-day={d.date}
              aria-pressed={date === d.date}
              aria-label={`${parts.long}: ${free ? `${free} horarios` : "sin horarios"}`}
              disabled={!days || !free}
              onClick={() => setDate(d.date)}
              className="flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl bg-fondo px-0.5 py-2 text-tinta ring-1 ring-tinta/5 transition aria-pressed:bg-azul aria-pressed:text-white disabled:opacity-45"
            >
              <span className="text-[11px] font-semibold">{parts.weekday}</span>
              <span className="font-display text-lg leading-none font-extrabold">{parts.day}</span>
              <span className={`mt-0.5 size-1.5 rounded-full ${free ? "bg-verde" : "bg-transparent"}`} aria-hidden />
            </button>
          );
        })}
      </div>

      <div className="mt-5 min-h-24">
        {!days ? (
          <p className="flex items-center gap-2 text-sm muted">
            <Spinner /> Buscando horarios…
          </p>
        ) : !daySlots.length ? (
          <p className="rounded-2xl bg-fondo p-4 text-sm muted">
            No hay horarios {modality === "virtual" ? "virtuales" : "presenciales"} esta semana. Prueba la semana siguiente o cambia el tipo de atención.
          </p>
        ) : (
          groups.map(([label, slots]) => (
            <div key={label} className="mb-3">
              <p className="mb-2 text-xs font-semibold tracking-wide uppercase muted">{label}</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((s) => (
                  <button
                    key={s.start_ms}
                    type="button"
                    data-slot={s.start_ms}
                    aria-pressed={slot === s.start_ms}
                    onClick={() => setSlot(s.start_ms)}
                    className="pill px-2"
                  >
                    {timeOf(s.start_ms)}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {plan && slot && (
        <div className="mt-2 rounded-2xl bg-fondo p-3">
          <p className="text-sm font-semibold">
            Tu plan: {plan.sessions} consultas · {frequencyName(plan.interval_days).toLowerCase()}
          </p>
          <ol className="mt-2 grid gap-1 text-sm">
            {dates.map((ms, i) => (
              <li key={ms} className="flex min-w-0 items-center gap-2">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white text-xs font-bold ring-1 ring-tinta/10">{i + 1}</span>
                <span className="min-w-0 truncate">
                  {shortDate(ms)}, {timeOf(ms)}
                  {i === 0 ? " · reservas ahora" : ""}
                </span>
              </li>
            ))}
          </ol>
          {online && (
            <p className="mt-2 text-xs muted">
              Hoy pagas solo la primera ({money(price)}). Cuando el profesional acepte el plan, cada consulta siguiente se paga con tarjeta hasta 24 h antes.
            </p>
          )}
        </div>
      )}
      {online && (
        <p className="mt-2 flex items-start gap-2 rounded-2xl bg-celeste/60 p-3 text-xs">
          <Icon name="card" className="mt-0.5 size-4 shrink-0 text-azul-ink" />
          <span>
            Pagas {money(price)} con <strong>tarjeta de crédito o débito</strong> al reservar, en el pago seguro de buscaDR. Si el profesional no confirma tu
            cita, te devolvemos el dinero.
          </span>
        </p>
      )}
      {online && !cardOk && (
        <div className="mt-2">
          <Notice tone="danger">Los pagos con tarjeta no están disponibles en este momento. Inténtalo más tarde.</Notice>
        </div>
      )}

      <label className="field mt-4">
        Motivo de la cita <span className="font-normal muted">(opcional, sin datos clínicos sensibles)</span>
        <input
          className="input"
          maxLength={160}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ej.: control, primera consulta, seguimiento"
        />
      </label>

      {error && (
        <div className="mt-3">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}

      <div className="sticky bottom-24 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-tinta p-3 pl-4 text-white shadow-[var(--shadow-float)] lg:static">
        <div className="min-w-0 text-sm">
          {slot ? (
            <>
              <p className="font-semibold">
                {dayParts(toLocalDate(slot)).long}, {timeOf(slot)}
              </p>
              <p className="text-white/80">
                {modality === "virtual" ? "Virtual" : "Presencial"} · {price ? money(price) : "Tarifa por confirmar"}
                {plan ? ` · plan de ${plan.sessions} consultas` : ""}
                {online ? " · pago con tarjeta" : ""}
              </p>
            </>
          ) : (
            <p className="text-white/85">Elige un horario disponible</p>
          )}
        </div>
        <button type="button" onClick={book} disabled={!slot || busy || (online && !cardOk)} className="btn min-h-12 bg-white text-tinta hover:bg-celeste">
          {busy ? <Spinner label="Reservando" /> : <Icon name="calendar-check" className="size-4" />}
          {online ? "Pagar con tarjeta" : bookLabel}
        </button>
      </div>
      <p className="mt-3 text-xs muted">
        {p.demo
          ? "Perfil de muestra: la cita es de prueba y no se avisa a ningún profesional."
          : p.auto_confirm
            ? "Este profesional confirma al instante."
            : "El profesional confirma tu cita; te avisamos en la app, por correo y WhatsApp (si lo activaste)."}
      </p>
    </section>
  );
}
