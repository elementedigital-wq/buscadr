/**
 * Calidad del servicio (ADR 0015): satisfacción por etapa (anónima, con mínimo de 3 calificaciones),
 * tiempos medidos con la trazabilidad (espera, puntualidad, duración) y QR de recepción imprimible.
 */
import { useState } from "react";
import { Form, useSearchParams } from "react-router";
import { QrCode } from "../../components/CareTrace";
import { Icon } from "../../components/Icon";
import { EmptyState, Notice, Spinner, Stat } from "../../components/ui";
import { type ApiError, api } from "../../lib/api";
import { serverApi, serverApiSafe } from "../../lib/api.server";
import type { Route } from "./+types/calidad";

type Quality = {
  days: number;
  min_sample: number;
  overall: number | null;
  ratings: number;
  stages: { stage: string; label: string; count: number; average: number | null; distribution: number[] | null; tags: { tag: string; n: number }[] }[];
  times: { wait_minutes: number | null; punctuality_minutes: number | null; duration_minutes: number | null; delay_minutes: number | null };
  traced: { completed: number; full: number; with_qr: number };
  comments: { stage: string; label: string; rating: number; comment: string; month: string }[];
};
type Reception = { practitioner: string; address: string; city: string; url: string; size: number; path: string };

export const meta: Route.MetaFunction = () => [{ title: "Calidad · Mi consultorio" }, { name: "robots", content: "noindex" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const days = new URL(request.url).searchParams.get("dias") ?? "90";
  const [quality, reception] = await Promise.all([
    serverApi<Quality>(context, request, `/api/trace/quality?days=${encodeURIComponent(days)}`),
    serverApiSafe<Reception | null>(context, request, "/api/trace/reception", null),
  ]);
  return { quality, reception };
}

const FACE = ["face-angry", "face-frown", "face-meh", "face-smile", "face-grin-stars"];
const faceOf = (avg: number) => FACE[Math.min(4, Math.max(0, Math.round(avg) - 1))];
const signed = (m: number | null, after: string, before: string) => (m == null ? "—" : m <= 0 ? `${Math.abs(m)} min ${before}` : `${m} min ${after}`);

export default function Calidad({ loaderData }: Route.ComponentProps) {
  const q = loaderData.quality;
  const [params] = useSearchParams();
  const [reception, setReception] = useState(loaderData.reception);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const coverage = q.traced.completed ? Math.round((q.traced.full / q.traced.completed) * 100) : null;

  async function rotate() {
    if (!confirm("¿Generar un QR de recepción nuevo? El cartel impreso actual dejará de funcionar.")) return;
    setBusy(true);
    setError(null);
    try {
      setReception(await api<Reception>("/api/trace/reception/rotate", { body: {} }));
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="min-w-0">
          <p className="label-eyebrow">Mi consultorio</p>
          <h1 className="text-3xl font-extrabold">Calidad del servicio</h1>
          <p className="mt-1 muted">Satisfacción de tus pacientes en cada etapa y tiempos medidos con los códigos QR.</p>
        </div>
        <Form method="get" className="flex items-center gap-2">
          <label htmlFor="dias" className="text-sm font-semibold">
            Periodo
          </label>
          <select
            id="dias"
            name="dias"
            className="input w-auto"
            defaultValue={params.get("dias") ?? String(q.days)}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          >
            <option value="30">30 días</option>
            <option value="90">90 días</option>
            <option value="365">12 meses</option>
          </select>
        </Form>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 print:hidden" aria-label="Indicadores">
        <Stat
          icon={q.overall ? faceOf(q.overall) : "face-smile"}
          label="Satisfacción general"
          value={q.overall ? `${q.overall.toLocaleString("es-EC")} / 5` : "—"}
          hint={`${q.ratings} ${q.ratings === 1 ? "calificación" : "calificaciones"} por etapa`}
          tone="verde"
        />
        <Stat
          icon="hourglass-half"
          label="Espera promedio"
          value={q.times.wait_minutes == null ? "—" : `${q.times.wait_minutes} min`}
          hint="De la llegada al inicio de la atención"
        />
        <Stat
          icon="stopwatch"
          label="Duración de la atención"
          value={q.times.duration_minutes == null ? "—" : `${q.times.duration_minutes} min`}
          hint={`Inicio: ${signed(q.times.delay_minutes, "tarde", "antes")} de la hora`}
          tone="cielo"
        />
        <Stat
          icon="qrcode"
          label="Atenciones trazadas"
          value={coverage == null ? "—" : `${coverage} %`}
          hint={`${q.traced.full} de ${q.traced.completed} completas · ${q.traced.with_qr} con QR`}
          tone="neutro"
        />
      </section>

      {q.ratings < q.min_sample && (
        <div className="print:hidden">
          <Notice tone="info" title="Aún pocas calificaciones">
            Mostramos promedios y comentarios desde {q.min_sample} calificaciones para proteger el anonimato de tus pacientes. Escanea su QR en cada etapa: al
            registrarla, reciben la invitación a calificarla.
          </Notice>
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-2 print:hidden" aria-label="Satisfacción por etapa">
        {q.stages.map((s) => {
          const max = Math.max(1, ...(s.distribution ?? [0]));
          return (
            <div key={s.stage} className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-extrabold">{s.label}</h2>
                <span className="text-sm muted">
                  {s.count} {s.count === 1 ? "calificación" : "calificaciones"}
                </span>
              </div>
              {s.average != null && s.distribution ? (
                <>
                  <p className="mt-2 flex items-center gap-2">
                    <Icon name={faceOf(s.average)} className="size-7 text-verde-ink" />
                    <span className="font-display text-3xl font-extrabold">{s.average.toLocaleString("es-EC")}</span>
                    <span className="muted">/ 5</span>
                  </p>
                  <ul className="mt-3 space-y-1.5" aria-label={`Distribución de ${s.label}`}>
                    {[5, 4, 3, 2, 1].map((n) => (
                      <li key={n} className="grid grid-cols-[1.5rem_minmax(0,1fr)_2rem] items-center gap-2 text-xs">
                        <span className="font-semibold">{n}</span>
                        <span className="h-2 rounded-full bg-gris-claro">
                          <span className="block h-2 rounded-full bg-azul" style={{ width: `${(s.distribution![n - 1] / max) * 100}%` }} />
                        </span>
                        <span className="text-right tabular-nums">{s.distribution![n - 1]}</span>
                      </li>
                    ))}
                  </ul>
                  {s.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {s.tags.map((t) => (
                        <span key={t.tag} className="chip bg-fondo px-2 py-0.5 text-xs ring-1 ring-tinta/10">
                          {t.tag} · {t.n}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="mt-2 text-sm muted">Sin datos suficientes todavía.</p>
              )}
            </div>
          );
        })}
      </section>

      <section className="card p-5 print:hidden" aria-labelledby="comentarios">
        <h2 id="comentarios" className="text-lg font-extrabold">
          Comentarios recientes
        </h2>
        {q.comments.length ? (
          <ul className="mt-3 divide-y divide-tinta/5">
            {q.comments.map((c, i) => (
              <li key={`${c.month}-${i}`} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 py-3">
                <Icon name={FACE[c.rating - 1]} className="mt-0.5 size-5 text-azul-ink" />
                <div className="min-w-0">
                  <p className="text-sm break-words">«{c.comment}»</p>
                  <p className="text-xs muted">
                    {c.label} · {c.month} · anónimo
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Sin comentarios por ahora" icon="comment">
            Los comentarios aparecen de forma anónima cuando tus pacientes califican las etapas de su atención.
          </EmptyState>
        )}
      </section>

      <section id="recepcion" className="card scroll-mt-24 p-5" aria-labelledby="recepcion-titulo">
        <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
          <div className="min-w-0">
            <h2 id="recepcion-titulo" className="text-lg font-extrabold">
              QR de recepción
            </h2>
            <p className="text-sm muted">Imprímelo y colócalo en la recepción: tus pacientes lo escanean al llegar para registrar su llegada.</p>
          </div>
          {reception && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary btn-sm" onClick={() => window.print()}>
                <Icon name="print" className="size-4" /> Imprimir cartel
              </button>
              <button type="button" className="btn-outline btn-sm" disabled={busy} onClick={rotate}>
                {busy ? <Spinner label="Generando" /> : <Icon name="rotate" className="size-4" />} Generar uno nuevo
              </button>
            </div>
          )}
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        {reception ? (
          <div className="print-area mx-auto mt-4 grid max-w-md justify-items-center gap-3 rounded-3xl p-6 text-center ring-1 ring-tinta/10">
            <img src="/assets/buscadr-logo.png" alt="buscaDR" className="h-10 w-auto" />
            <p className="font-display text-2xl font-extrabold">¿Llegaste a tu cita?</p>
            <p className="text-sm">Escanea este código con la cámara de tu celular para registrar tu llegada.</p>
            <QrCode
              size={reception.size}
              path={reception.path}
              label={`QR de recepción de ${reception.practitioner}`}
              className="aspect-square w-64 max-w-full"
            />
            <p className="font-bold break-words">{reception.practitioner}</p>
            <p className="text-xs muted">Necesitas tu cuenta de buscaDR y una cita confirmada para hoy.</p>
          </div>
        ) : (
          <p className="mt-3 text-sm muted">Completa tu perfil profesional para generar el QR de recepción.</p>
        )}
      </section>
    </div>
  );
}
