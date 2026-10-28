/** Horario semanal por modalidad, ajustes de agenda y bloqueos (vacaciones, congresos). */
import { useState } from "react";
import { useRevalidator, useRouteLoaderData } from "react-router";
import { Icon } from "../../components/Icon";
import { Notice } from "../../components/ui";
import { type ApiError, api } from "../../lib/api";
import { WEEKDAYS, addDays, dateTime, minutesLabel, toLocalDate } from "../../lib/format";
import type { ProMe, Rule } from "../../lib/pro";

const toMin = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + (m || 0);
};
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const MODALITY = { ambas: "Presencial y virtual", presencial: "Solo presencial", virtual: "Solo virtual" } as const;

export default function Horarios() {
  const data = useRouteLoaderData("routes/panel/_layout") as ProMe;
  const p = data.practitioner!;
  const revalidator = useRevalidator();
  const [rules, setRules] = useState<Rule[]>(data.rules.map(({ weekday, start_min, end_min, modality }) => ({ weekday, start_min, end_min, modality })));
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (i: number, patch: Partial<Rule>) => setRules((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/pro/schedule", { method: "PUT", body: { rules } });
      setMsg({ tone: "success", text: "Horario guardado. Los pacientes ya ven tus nuevos horarios." });
      revalidator.revalidate();
    } catch (e) {
      setMsg({ tone: "danger", text: (e as ApiError).message });
    } finally {
      setBusy(false);
    }
  }
  async function settings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api("/api/pro/me", {
        method: "PATCH",
        body: {
          slot_minutes: Number(f.get("slot_minutes")),
          buffer_minutes: Number(f.get("buffer_minutes")),
          min_notice_hours: Number(f.get("min_notice_hours")),
          auto_confirm: f.get("auto_confirm") === "on",
        },
      });
      setMsg({ tone: "success", text: "Ajustes de agenda guardados." });
      revalidator.revalidate();
    } catch (err) {
      setMsg({ tone: "danger", text: (err as ApiError).message });
    }
  }
  async function block(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const r = await api<{ conflicts: number }>("/api/pro/blocks", {
        body: { start: `${f.get("from")}T00:00`, end: f.get("to"), all_day: true, reason: f.get("reason") },
      });
      setMsg({
        tone: "success",
        text: r.conflicts ? `Bloqueo creado. Atención: tienes ${r.conflicts} cita(s) activas en esas fechas; revísalas en tu agenda.` : "Bloqueo creado.",
      });
      e.currentTarget.reset();
      revalidator.revalidate();
    } catch (err) {
      setMsg({ tone: "danger", text: (err as ApiError).message });
    }
  }
  async function unblock(id: number) {
    await api(`/api/pro/blocks/${id}`, { method: "DELETE" }).catch(() => {});
    revalidator.revalidate();
  }
  const today = toLocalDate(Date.now());

  return (
    <div className="space-y-5">
      <header>
        <p className="label-eyebrow">Agenda</p>
        <h1 className="text-3xl font-extrabold">Horarios y bloqueos</h1>
        <p className="mt-1 muted">Define cuándo atiendes y en qué modalidad. Las citas se ofrecen cada {p.slot_minutes} minutos dentro de cada bloque.</p>
      </header>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <section className="card p-5" aria-labelledby="semana">
        <h2 id="semana" className="text-lg font-extrabold">
          Horario semanal
        </h2>
        <ul className="mt-3 divide-y divide-tinta/5">
          {ORDER.map((d) => {
            const list = rules.map((r, i) => ({ r, i })).filter(({ r }) => r.weekday === d);
            return (
              <li key={d} className="grid gap-2 py-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
                <p className="pt-2 font-semibold">{WEEKDAYS[d]}</p>
                <div className="grid gap-2">
                  {list.map(({ r, i }) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <label className="sr-only" htmlFor={`s${i}`}>
                        Desde
                      </label>
                      <input
                        id={`s${i}`}
                        type="time"
                        step={900}
                        className="input w-32"
                        value={minutesLabel(r.start_min)}
                        onChange={(e) => update(i, { start_min: toMin(e.target.value) })}
                      />
                      <span className="muted">a</span>
                      <label className="sr-only" htmlFor={`e${i}`}>
                        Hasta
                      </label>
                      <input
                        id={`e${i}`}
                        type="time"
                        step={900}
                        className="input w-32"
                        value={minutesLabel(r.end_min === 1440 ? 1439 : r.end_min)}
                        onChange={(e) => update(i, { end_min: toMin(e.target.value) })}
                      />
                      <label className="sr-only" htmlFor={`m${i}`}>
                        Modalidad
                      </label>
                      <select
                        id={`m${i}`}
                        className="input w-auto min-w-0 flex-1"
                        value={r.modality}
                        onChange={(e) => update(i, { modality: e.target.value as Rule["modality"] })}
                      >
                        {Object.entries(MODALITY).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="icon-btn size-10"
                        onClick={() => setRules((rs) => rs.filter((_, j) => j !== i))}
                        aria-label={`Quitar bloque del ${WEEKDAYS[d]}`}
                      >
                        <Icon name="trash" className="size-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn-ghost btn-sm justify-self-start"
                    onClick={() =>
                      setRules((rs) => [...rs, { weekday: d, start_min: list.length ? 900 : 540, end_min: list.length ? 1080 : 780, modality: "ambas" }])
                    }
                  >
                    <Icon name="plus" className="size-4" /> {list.length ? "Agregar otro bloque" : "Atender este día"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <button type="button" className="btn-primary mt-3" onClick={save} disabled={busy}>
          Guardar horario
        </button>
      </section>

      <form onSubmit={settings} className="card grid gap-4 p-5 sm:grid-cols-2" aria-labelledby="ajustes">
        <h2 id="ajustes" className="text-lg font-extrabold sm:col-span-2">
          Ajustes de la agenda
        </h2>
        <label className="field">
          Duración de cada consulta
          <select name="slot_minutes" className="input" defaultValue={p.slot_minutes}>
            {[15, 20, 30, 40, 45, 60, 90].map((m) => (
              <option key={m} value={m}>
                {m} minutos
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Margen entre citas
          <select name="buffer_minutes" className="input" defaultValue={p.buffer_minutes}>
            {[0, 5, 10, 15, 30].map((m) => (
              <option key={m} value={m}>
                {m ? `${m} minutos` : "Sin margen"}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Anticipación mínima para reservar
          <select name="min_notice_hours" className="input" defaultValue={p.min_notice_hours}>
            {[0, 1, 2, 4, 12, 24, 48].map((h) => (
              <option key={h} value={h}>
                {h ? `${h} ${h === 1 ? "hora" : "horas"}` : "Sin mínimo"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-start gap-3 rounded-2xl bg-fondo p-3 text-sm">
          <input type="checkbox" name="auto_confirm" defaultChecked={p.auto_confirm} className="mt-1 size-4 accent-[var(--color-azul)]" />
          <span>
            <span className="block font-semibold">Confirmar citas automáticamente</span>
            <span className="muted">Si lo desactivas, confirmas cada solicitud desde tu agenda o WhatsApp.</span>
          </span>
        </label>
        <button type="submit" className="btn-outline justify-self-start sm:col-span-2">
          Guardar ajustes
        </button>
      </form>

      <section className="card p-5" aria-labelledby="bloqueos">
        <h2 id="bloqueos" className="text-lg font-extrabold">
          Bloqueos (vacaciones, congresos, feriados)
        </h2>
        <form onSubmit={block} className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-end">
          <label className="field">
            Desde
            <input type="date" name="from" className="input" min={today} defaultValue={today} required />
          </label>
          <label className="field">
            Hasta (incluido)
            <input type="date" name="to" className="input" min={today} defaultValue={addDays(today, 1)} required />
          </label>
          <label className="field">
            Motivo
            <input name="reason" className="input" maxLength={80} placeholder="Ej.: vacaciones" />
          </label>
          <button type="submit" className="btn-primary">
            Bloquear
          </button>
        </form>
        <ul className="mt-4 grid gap-2">
          {data.blocks.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-fondo px-3 py-2 text-sm">
              <span className="min-w-0">
                <strong>{b.reason}</strong> · {dateTime(b.start_ms)} → {dateTime(b.end_ms)}
              </span>
              <button type="button" className="btn-ghost btn-sm min-h-9" onClick={() => unblock(b.id)}>
                Quitar
              </button>
            </li>
          ))}
          {!data.blocks.length && <li className="text-sm muted">No tienes bloqueos próximos.</li>}
        </ul>
      </section>
    </div>
  );
}
