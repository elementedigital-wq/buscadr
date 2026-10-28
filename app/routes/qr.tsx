/**
 * Destino de los códigos QR de buscaDR (ADR 0015). Al escanear con la cámara del celular:
 * - QR de la cita (a_…): el profesional registra la siguiente etapa (llegada → consulta → cierre);
 *   el paciente que lo abre va a su cita.
 * - QR de recepción (r_…): el paciente confirma su llegada al consultorio.
 * Sin sesión pide iniciarla y vuelve aquí. Nunca muestra datos a quien no corresponde.
 */
import { useState } from "react";
import { Link, redirect } from "react-router";
import { Icon } from "../components/Icon";
import { Notice, Spinner } from "../components/ui";
import { type ApiError, api } from "../lib/api";
import { serverApiSafe } from "../lib/api.server";
import { hhmm } from "../lib/format";
import type { Route } from "./+types/qr";

type Info =
  | { kind: "login" }
  | { kind: "invalido"; message: string }
  | { kind: "cita"; role: "patient"; appointment_id: number }
  | {
      kind: "cita";
      role: "pro";
      appointment_id: number;
      patient: string;
      when: string;
      modality: string;
      stage: string | null;
      label: string | null;
      block: string | null;
      demo: boolean;
    }
  | { kind: "recepcion"; own: true; practitioner: string }
  | { kind: "recepcion"; own: false; practitioner: string; appointment: { id: number; when: string } | null; block: string | null };

export const meta: Route.MetaFunction = () => [{ title: "Código QR · buscaDR" }, { name: "robots", content: "noindex, nofollow" }];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const info = await serverApiSafe<Info>(context, request, `/api/trace/scan/${encodeURIComponent(params.token)}`, {
    kind: "invalido",
    message: "No pudimos leer este código. Inténtalo de nuevo.",
  });
  if (info.kind === "login") throw redirect(`/cuenta?next=${encodeURIComponent(`/q/${params.token}`)}`);
  if (info.kind === "cita" && info.role === "patient") throw redirect(`/citas/${info.appointment_id}#trazabilidad`);
  return { info, token: params.token };
}

export default function Qr({ loaderData }: Route.ComponentProps) {
  const { info, token } = loaderData;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ at: number; stage: string; appointment_id: number } | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ stage: string; appointment_id: number }>(`/api/trace/scan/${token}`, { body: {} });
      setDone({ at: Date.now(), ...r });
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const shell = (children: React.ReactNode) => (
    <div className="container-page grid max-w-lg place-items-center pt-8 pb-10">
      <section className="card w-full p-6 text-center">{children}</section>
    </div>
  );
  const STAGE_DONE: Record<string, string> = { llegada: "Llegada registrada", consulta: "Inicio de la atención registrado", cierre: "Atención finalizada" };

  if (done)
    return shell(
      <>
        <span className="mx-auto grid size-16 place-items-center rounded-full tone-verde">
          <Icon name="check" className="size-8" />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold">{STAGE_DONE[done.stage] ?? "Etapa registrada"}</h1>
        <p className="mt-1 muted">A las {hhmm(done.at)}. Queda en la trazabilidad de la cita.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {info.kind === "cita" ? (
            <>
              <Link to="/panel/escanear" className="btn-primary">
                <Icon name="qrcode" className="size-4" /> Escanear otro
              </Link>
              <Link to={`/panel/citas/${done.appointment_id}`} className="btn-outline">
                Ver la cita
              </Link>
            </>
          ) : (
            <Link to={`/citas/${done.appointment_id}#trazabilidad`} className="btn-primary">
              Ver mi cita y calificar
            </Link>
          )}
        </div>
      </>,
    );

  if (info.kind === "invalido")
    return shell(
      <>
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-alerta/10 text-alerta-ink">
          <Icon name="alert" className="size-8" />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold">Código no disponible</h1>
        <p className="mt-1 muted">{info.message}</p>
        <Link to="/" className="btn-outline mt-5">
          Ir al inicio
        </Link>
      </>,
    );

  if (info.kind === "recepcion" && info.own)
    return shell(
      <>
        <Icon name="qrcode" className="mx-auto size-12 text-azul" />
        <h1 className="mt-4 text-2xl font-extrabold">Este es tu QR de recepción</h1>
        <p className="mt-1 muted">Tus pacientes lo escanean al llegar a {info.practitioner} para registrar su llegada.</p>
        <Link to="/panel/calidad#recepcion" className="btn-primary mt-5">
          Imprimir o cambiar el QR
        </Link>
      </>,
    );

  if (info.kind === "recepcion")
    return shell(
      <>
        <Icon name="door-open" className="mx-auto size-12 text-azul" />
        <p className="label-eyebrow mt-4">Recepción</p>
        <h1 className="mt-1 text-2xl font-extrabold break-words">{info.practitioner}</h1>
        {info.appointment ? <p className="mt-1 muted">Tu cita: {info.appointment.when}</p> : null}
        {info.block ? (
          <div className="mt-4 text-left">
            <Notice tone="warning">{info.block}</Notice>
          </div>
        ) : (
          <button type="button" className="btn-primary mt-5 w-full" disabled={busy} onClick={confirm}>
            {busy ? <Spinner label="Registrando" /> : <Icon name="check" className="size-4" />} Confirmar mi llegada
          </button>
        )}
        {error && (
          <div className="mt-3 text-left">
            <Notice tone="danger">{error}</Notice>
          </div>
        )}
        <Link to="/citas" className="btn-ghost mt-3">
          Ver mis citas
        </Link>
      </>,
    );

  if (info.kind !== "cita" || info.role !== "pro") return shell(<p className="muted">Código no reconocido.</p>);
  return shell(
    <>
      <p className="label-eyebrow">Cita #{info.appointment_id}</p>
      <h1 className="mt-1 text-2xl font-extrabold break-words">{info.patient}</h1>
      <p className="mt-1 muted">
        {info.when} · {info.modality === "virtual" ? "Virtual" : "Presencial"}
        {info.demo ? " · cita de prueba" : ""}
      </p>
      {info.block ? (
        <div className="mt-4 text-left">
          <Notice tone="warning">{info.block}</Notice>
        </div>
      ) : (
        <button type="button" className="btn-primary mt-5 min-h-14 w-full text-base" disabled={busy} onClick={confirm}>
          {busy ? <Spinner label="Registrando" /> : <Icon name="check" className="size-5" />} Registrar {info.label?.toLowerCase()}
        </button>
      )}
      {error && (
        <div className="mt-3 text-left">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}
      <Link to={`/panel/citas/${info.appointment_id}`} className="btn-ghost mt-3">
        Ver la cita
      </Link>
    </>,
  );
}
