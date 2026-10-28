/**
 * Checkout de buscaDR Pay dentro de la app. En modo sandbox se paga con tarjetas de PRUEBA (no mueve
 * dinero). Con Payphone configurado, el pago con tarjeta se hace en la página segura del proveedor
 * y el resultado vuelve a /pagos/retorno, donde el servidor lo confirma.
 */
import { useState } from "react";
import { Link, redirect, useNavigate, useRevalidator } from "react-router";
import { Icon } from "../components/Icon";
import { Avatar, Notice, PageHeader, Spinner, StatusBadge } from "../components/ui";
import { type ApiError, api } from "../lib/api";
import { serverApi, serverApiSafe } from "../lib/api.server";
import { money } from "../lib/format";
import type { Route } from "./+types/pagar";

type Payment = {
  id: string;
  kind: "cita" | "plan";
  plan: string | null;
  amount_cents: number;
  provider: "sandbox" | "payphone" | "consultorio";
  status: string;
  status_label: string;
  card_brand: string;
  card_last4: string;
  error: string;
  mine: boolean;
  description: string;
  appointment: { id: number; when: string; name: string; photo: string; modality: string; demo: boolean; hold_expires_ms: number | null } | null;
};

export const meta: Route.MetaFunction = () => [{ title: "Pagar · buscaDR Pay" }, { name: "robots", content: "noindex" }];

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const me = await serverApiSafe<{ user: unknown }>(context, request, "/api/auth/me", { user: null });
  if (!me.user) throw redirect(`/cuenta?next=/pagar/${params.id}`);
  return serverApi<{ payment: Payment }>(context, request, `/api/payments/${encodeURIComponent(params.id)}`);
}

const brandOf = (n: string) =>
  /^4/.test(n) ? "Visa" : /^(5[1-5]|2[2-7])/.test(n) ? "Mastercard" : /^3[47]/.test(n) ? "American Express" : /^3(0[0-5]|[68])/.test(n) ? "Diners Club" : "";
const groups = (v: string) =>
  v
    .replace(/\D/g, "")
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, "$1 ");

export default function Pagar({ loaderData }: Route.ComponentProps) {
  const p = loaderData.payment;
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [number, setNumber] = useState("");
  const [exp, setExp] = useState("");
  const [cvv, setCvv] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(p.status === "rechazado" ? p.error || "El pago anterior no fue aprobado." : null);
  const back = p.appointment ? `/citas/${p.appointment.id}` : "/panel/plan";
  const done = p.status === "aprobado" || p.status === "reembolsado";

  async function paySandbox(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ status: string; error: string | null }>(`/api/payments/${p.id}/sandbox`, { body: { number, exp, cvv, name } });
      if (r.status === "aprobado") navigate(p.appointment ? `/citas/${p.appointment.id}?nueva=1` : "/panel/plan?pagado=1");
      else {
        setError(r.error ?? "El pago no fue aprobado.");
        revalidator.revalidate();
      }
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }
  async function payPayphone() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ url: string }>(`/api/payments/${p.id}/checkout`, { method: "POST", body: {} });
      window.location.assign(r.url);
    } catch (err) {
      setError((err as ApiError).message);
      setBusy(false);
    }
  }

  return (
    <div className="container-page max-w-4xl pb-8">
      <PageHeader eyebrow="buscaDR Pay" title="Pago seguro" back={back} />
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="card h-fit p-5" aria-labelledby="resumen">
          <h2 id="resumen" className="text-lg font-extrabold">
            Resumen
          </h2>
          {p.appointment ? (
            <div className="mt-3 flex items-center gap-3">
              <Avatar name={p.appointment.name} photo={p.appointment.photo} size={56} rounded="xl" />
              <div className="min-w-0">
                <p className="font-semibold">{p.appointment.name}</p>
                <p className="text-sm muted">
                  {p.appointment.when} · {p.appointment.modality === "virtual" ? "Virtual" : "Presencial"}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-3 font-semibold">{p.description}</p>
          )}
          <dl className="mt-4 space-y-2 border-t border-tinta/5 pt-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="muted">{p.description}</dt>
              <dd className="font-semibold">{money(p.amount_cents)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="muted">Cargos adicionales</dt>
              <dd>$0,00</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-tinta/5 pt-2 text-base">
              <dt className="font-bold">Total</dt>
              <dd className="font-display text-xl font-extrabold">{money(p.amount_cents)}</dd>
            </div>
          </dl>
          <ul className="mt-4 space-y-2 text-xs muted">
            <li className="flex gap-2">
              <Icon name="lock" className="size-3.5 shrink-0 text-azul" /> buscaDR no guarda el número de tu tarjeta ni el código de seguridad.
            </li>
            <li className="flex gap-2">
              <Icon name="receipt" className="size-3.5 shrink-0 text-azul" /> La transacción queda registrada en tu cuenta con su comprobante.
            </li>
            {p.kind === "cita" && (
              <li className="flex gap-2">
                <Icon name="repeat" className="size-3.5 shrink-0 text-azul" /> Si el profesional no confirma la cita o la cancela, te devolvemos el dinero.
              </li>
            )}
          </ul>
        </section>

        <section className="card p-5" aria-labelledby="pago">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="pago" className="text-lg font-extrabold">
              Tarjeta de crédito o débito
            </h2>
            <StatusBadge status={p.status} label={p.status_label} />
          </div>
          {done ? (
            <div className="mt-4">
              <Notice tone="success" title={p.status === "aprobado" ? "Pago aprobado" : "Pago reembolsado"}>
                {p.card_last4 ? `${p.card_brand} •••• ${p.card_last4}. ` : ""}
                <Link to={back} className="font-semibold text-azul">
                  Volver a {p.appointment ? "la cita" : "mi plan"}
                </Link>
              </Notice>
            </div>
          ) : !p.mine ? (
            <p className="mt-3 text-sm muted">Este pago lo realiza el paciente.</p>
          ) : p.provider === "payphone" ? (
            <>
              <p className="mt-2 text-sm muted">Pagarás en la página segura de Payphone (Ecuador). Al terminar volverás a buscaDR con tu comprobante.</p>
              {error && (
                <div className="mt-3">
                  <Notice tone="danger">{error}</Notice>
                </div>
              )}
              <button type="button" onClick={payPayphone} disabled={busy} className="btn-primary mt-4 w-full">
                {busy ? <Spinner /> : <Icon name="lock" className="size-4" />} Pagar {money(p.amount_cents)}
              </button>
            </>
          ) : (
            <form onSubmit={paySandbox} className="mt-3 grid gap-3">
              <Notice tone="warning" title="Modo de prueba">
                Pasarela en sandbox: no se cobra dinero real. Usa <strong>4111 1111 1111 1111</strong> (aprobada) o <strong>4000 0000 0000 0002</strong>{" "}
                (rechazada), cualquier fecha futura y CVV.
              </Notice>
              <label className="field">
                Número de tarjeta
                <span className="relative">
                  <input
                    className="input pr-28 tracking-wider"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    required
                    value={number}
                    onChange={(e) => setNumber(groups(e.target.value))}
                    placeholder="0000 0000 0000 0000"
                  />
                  {brandOf(number.replace(/\s/g, "")) && (
                    <span className="absolute top-1/2 right-2 -translate-y-1/2 chip bg-celeste px-2 py-0.5 text-xs font-bold text-azul">
                      {brandOf(number.replace(/\s/g, ""))}
                    </span>
                  )}
                </span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="field">
                  Vencimiento
                  <input
                    className="input"
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    required
                    value={exp}
                    maxLength={5}
                    onChange={(e) =>
                      setExp(
                        e.target.value
                          .replace(/[^\d]/g, "")
                          .replace(/^(\d{2})(\d)/, "$1/$2")
                          .slice(0, 5),
                      )
                    }
                    placeholder="MM/AA"
                  />
                </label>
                <label className="field">
                  CVV
                  <input
                    className="input"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    required
                    value={cvv}
                    maxLength={4}
                    onChange={(e) => setCvv(e.target.value.replace(/\D/g, ""))}
                    placeholder="123"
                  />
                </label>
              </div>
              <label className="field">
                Nombre en la tarjeta
                <input
                  className="input"
                  autoComplete="cc-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Como aparece en la tarjeta"
                />
              </label>
              {error && <Notice tone="danger">{error}</Notice>}
              <button type="submit" disabled={busy} className="btn-primary mt-1 w-full">
                {busy ? <Spinner /> : <Icon name="lock" className="size-4" />} Pagar {money(p.amount_cents)}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
