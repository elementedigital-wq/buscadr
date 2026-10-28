/**
 * Trazabilidad de la atención (ADR 0015): QR de la cita, línea de tiempo de las cuatro etapas
 * (reserva, llegada, consulta, cierre) con hora y forma de registro, tiempos de la atención y escala
 * de satisfacción 1–5 por etapa. Paciente: QR + calificar. Profesional: registrar la siguiente etapa
 * o escanear el QR.
 */
import { useState } from "react";
import { Link } from "react-router";
import { type ApiError, api } from "../lib/api";
import { dateTime } from "../lib/format";
import type { TraceStage, TraceView } from "../lib/types";
import { Icon } from "./Icon";
import { Notice, Spinner } from "./ui";

/** Código QR dibujado como trazado SVG (lo genera el servidor; sin imágenes externas). */
export function QrCode({ size, path, label, className = "size-48" }: { size: number; path: string; label: string; className?: string }) {
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className={`${className} rounded-xl bg-white`} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#FFFFFF" />
      <path d={path} fill="#0B1F3B" />
    </svg>
  );
}

const FACES = [
  { icon: "face-angry", tone: "bg-alerta/10 text-alerta-ink" },
  { icon: "face-frown", tone: "bg-alerta/10 text-alerta-ink" },
  { icon: "face-meh", tone: "bg-amarillo/20 text-tinta" },
  { icon: "face-smile", tone: "tone-verde" },
  { icon: "face-grin-stars", tone: "tone-verde" },
];

const METHOD: Record<string, string> = { qr: "QR del paciente", qr_recepcion: "QR de recepción", manual: "Registro manual", auto: "Automático" };
const ACTOR: Record<string, string> = { paciente: "paciente", profesional: "profesional", sistema: "buscaDR" };
const mins = (m: number | null) => (m == null ? "—" : `${Math.abs(m)} min`);

function RatingForm({ s, labels, onSave }: { s: TraceStage; labels: string[]; onSave: (r: number, tags: string[], comment: string) => Promise<void> }) {
  const [rating, setRating] = useState(s.rating?.rating ?? 0);
  const [tags, setTags] = useState<string[]>(s.rating?.tags ?? []);
  const [comment, setComment] = useState(s.rating?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return setError("Elige una carita para calificar.");
    setBusy(true);
    setError(null);
    try {
      await onSave(rating, tags, comment);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-3 rounded-2xl bg-fondo p-3">
      <fieldset>
        <legend className="text-sm font-semibold">{s.question}</legend>
        <div className="mt-2 grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={s.question}>
          {FACES.map((f, i) => {
            const n = i + 1;
            return (
              <button
                key={f.icon}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} de 5: ${labels[i]}`}
                title={labels[i]}
                onClick={() => setRating(n)}
                className={`grid min-h-12 min-w-0 place-items-center rounded-2xl px-1 py-2 ring-1 transition ${rating === n ? `${f.tone} ring-2 ring-azul` : "bg-white text-tinta ring-tinta/10 hover:ring-azul/40"}`}
              >
                <Icon name={f.icon} className="size-7" />
              </button>
            );
          })}
        </div>
        {/* Extremos de la escala debajo (los textos no caben dentro de los botones en pantallas angostas). */}
        <div className="mt-1 flex justify-between gap-2 text-[11px] muted" aria-hidden>
          <span>{labels[0]}</span>
          <span>{labels[4]}</span>
        </div>
        <p className="mt-1 min-h-5 text-sm font-semibold" aria-live="polite">
          {rating ? `Tu calificación: ${labels[rating - 1]} (${rating} de 5)` : ""}
        </p>
      </fieldset>
      {rating > 0 && (
        <>
          <fieldset className="mt-3">
            <legend className="text-xs font-semibold muted">¿Qué destacas? (opcional)</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {s.tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={tags.includes(t)}
                  onClick={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))}
                  className="pill btn-sm min-h-9 text-xs"
                >
                  {tags.includes(t) && <Icon name="check" className="size-3.5" />} {t}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="field mt-3">
            Comentario (opcional)
            <textarea className="input min-h-20 py-2" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
        </>
      )}
      {error && <p className="mt-2 text-sm text-alerta-ink">{error}</p>}
      <button type="submit" className="btn-primary btn-sm mt-3" disabled={busy}>
        {busy ? <Spinner label="Guardando" /> : <Icon name="check" className="size-4" />} {s.rating ? "Actualizar calificación" : "Enviar calificación"}
      </button>
    </form>
  );
}

export function CareTrace({ initial, isPro }: { initial: TraceView; isPro: boolean }) {
  const [t, setT] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [big, setBig] = useState(false);
  const done = t.stages.filter((s) => s.status === "confirmada").length;
  // Una calificación a la vez: se abre la primera etapa sin calificar; las demás, con «Calificar».
  const firstUnrated = t.stages.find((s) => s.can_rate && !s.rating)?.stage ?? null;
  const next = t.stages.find((s) => s.stage === t.next_stage);

  async function confirmNext() {
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      setT(await api<TraceView>(`/api/trace/appointments/${t.appointment_id}/stages/${next.stage}`, { body: {} }));
      if (next.stage === "cierre") window.location.reload();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }
  async function rate(stage: string, rating: number, tags: string[], comment: string) {
    setT(await api<TraceView>(`/api/trace/appointments/${t.appointment_id}/stages/${stage}/rating`, { method: "PUT", body: { rating, tags, comment } }));
    setEditing(null);
  }

  return (
    <section id="trazabilidad" className="card scroll-mt-24 p-5" aria-labelledby="trazabilidad-titulo">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="trazabilidad-titulo" className="text-lg font-extrabold">
            {isPro ? "Trazabilidad de la atención" : "Trazabilidad de tu atención"}
          </h2>
          <p className="text-sm muted">
            {done} de 4 etapas registradas{!isPro && " · califica cada una"}
          </p>
        </div>
        <span className="h-2 w-28 shrink-0 self-center rounded-full bg-gris-claro" aria-hidden>
          <span className="block h-2 rounded-full bg-verde" style={{ width: `${(done / 4) * 100}%` }} />
        </span>
      </div>

      {t.qr && (
        <div className="mt-4 grid items-center gap-4 rounded-2xl tone-card-azul p-4 sm:grid-cols-[auto_minmax(0,1fr)]">
          <button type="button" onClick={() => setBig(true)} className="mx-auto rounded-2xl p-1 ring-1 ring-tinta/10" aria-label="Ampliar el código QR">
            <QrCode size={t.qr.size} path={t.qr.path} label="Código QR de tu cita" className="size-44" />
          </button>
          <div className="min-w-0 text-sm">
            <p className="font-bold">Tu código QR para esta cita</p>
            <p className="mt-1 muted">
              Muéstralo al llegar. El consultorio lo escanea para registrar tu llegada, el inicio y el cierre de tu atención. También puedes escanear el QR de
              recepción del consultorio.
            </p>
            <p className="mt-2">
              Código de respaldo: <strong className="font-display text-lg tracking-[0.2em]">{t.qr.code}</strong>
            </p>
            <button type="button" className="btn-outline btn-sm mt-2" onClick={() => setBig(true)}>
              <Icon name="qrcode" className="size-4" /> Ver en grande
            </button>
          </div>
        </div>
      )}
      {big && t.qr && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-white p-6" role="dialog" aria-modal="true" aria-label="Código QR de tu cita">
          <div className="grid w-full max-w-sm justify-items-center gap-4 text-center">
            <QrCode size={t.qr.size} path={t.qr.path} label="Código QR de tu cita" className="aspect-square w-full" />
            <p className="text-sm muted">Sube el brillo de tu pantalla para escanearlo mejor.</p>
            <p className="font-display text-2xl font-extrabold tracking-[0.2em]">{t.qr.code}</p>
            <button type="button" className="btn-primary" onClick={() => setBig(false)}>
              Cerrar
            </button>
          </div>
        </div>
      )}

      {isPro && next && t.status === "confirmada" && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-fondo p-3">
          <p className="min-w-0 flex-1 text-sm">
            Siguiente etapa: <strong>{next.label}</strong>
            {next.block && <span className="block text-xs muted">{next.block}</span>}
          </p>
          <Link to="/panel/escanear" className="btn-outline btn-sm">
            <Icon name="qrcode" className="size-4" /> Escanear QR
          </Link>
          <button type="button" className="btn-primary btn-sm" disabled={busy || !next.can_confirm} onClick={confirmNext}>
            {busy ? <Spinner label="Registrando" /> : <Icon name="check" className="size-4" />} Registrar {next.label.toLowerCase()}
          </button>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}

      <ol className="mt-5 space-y-0">
        {t.stages.map((s, i) => {
          const last = i === t.stages.length - 1;
          const ok = s.status === "confirmada";
          return (
            <li key={s.stage} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-full ${ok ? "tone-verde" : s.status === "sin_registro" ? "bg-gris-claro text-gris ring-1 ring-tinta/10 ring-dashed" : "bg-white text-gris ring-2 ring-tinta/10"}`}
                >
                  <Icon name={ok ? "check" : s.icon} className="size-4" />
                </span>
                {!last && <span className={`w-0.5 flex-1 ${ok ? "bg-verde/50" : "bg-tinta/10"}`} aria-hidden />}
              </div>
              <div className={`min-w-0 ${last ? "" : "pb-5"}`}>
                <p className="font-semibold">{s.label}</p>
                {ok ? (
                  <p className="text-xs muted">
                    {s.confirmed_ms ? `${dateTime(s.confirmed_ms)}` : ""}
                    {s.method && ` · ${METHOD[s.method]}`}
                    {s.actor_role && s.method !== "auto" ? ` · por ${ACTOR[s.actor_role]}` : ""}
                  </p>
                ) : (
                  <p className="text-xs muted">{s.status === "sin_registro" ? "No se registró" : (s.block ?? "Pendiente")}</p>
                )}
                {!isPro && ok && s.rating && editing !== s.stage && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className={`chip px-2.5 py-0.5 text-xs font-semibold ${FACES[s.rating.rating - 1].tone}`}>
                      <Icon name={FACES[s.rating.rating - 1].icon} className="size-4" /> {s.rating.label}
                    </span>
                    {s.rating.tags.map((tag) => (
                      <span key={tag} className="chip bg-gris-claro px-2 py-0.5 text-xs">
                        {tag}
                      </span>
                    ))}
                    {s.can_rate && (
                      <button type="button" className="text-xs font-semibold text-azul-ink underline" onClick={() => setEditing(s.stage)}>
                        Editar
                      </button>
                    )}
                    {s.rating.comment && <p className="w-full text-xs muted">«{s.rating.comment}»</p>}
                  </div>
                )}
                {!isPro && s.can_rate && (editing === s.stage || (!s.rating && !editing && firstUnrated === s.stage)) && (
                  <RatingForm key={s.stage} s={s} labels={t.rating_labels} onSave={(r, tags, comment) => rate(s.stage, r, tags, comment)} />
                )}
                {!isPro && s.can_rate && !s.rating && editing !== s.stage && !(!editing && firstUnrated === s.stage) && (
                  <button type="button" className="btn-outline btn-sm mt-2" onClick={() => setEditing(s.stage)}>
                    <Icon name="face-smile" className="size-4" /> Calificar esta etapa
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {(t.metrics.punctuality_minutes != null || t.metrics.wait_minutes != null || t.metrics.duration_minutes != null) && (
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-fondo p-2">
            <dt className="text-[11px] muted">Llegada</dt>
            <dd className="text-sm font-bold">
              {t.metrics.punctuality_minutes == null
                ? "—"
                : t.metrics.punctuality_minutes <= 0
                  ? `${mins(t.metrics.punctuality_minutes)} antes`
                  : `${mins(t.metrics.punctuality_minutes)} después`}
            </dd>
          </div>
          <div className="rounded-2xl bg-fondo p-2">
            <dt className="text-[11px] muted">Espera</dt>
            <dd className="text-sm font-bold">{mins(t.metrics.wait_minutes)}</dd>
          </div>
          <div className="rounded-2xl bg-fondo p-2">
            <dt className="text-[11px] muted">Atención</dt>
            <dd className="text-sm font-bold">{mins(t.metrics.duration_minutes)}</dd>
          </div>
        </dl>
      )}
      <p className="mt-4 flex gap-2 text-xs muted">
        <Icon name="lock" className="mt-0.5 size-3.5 shrink-0" />
        {isPro
          ? "Las calificaciones por etapa son anónimas: las ves como promedios en «Calidad» cuando hay al menos 3."
          : "Tus calificaciones por etapa son privadas: el profesional solo ve promedios anónimos. Tu opinión pública es aparte."}
      </p>
    </section>
  );
}
