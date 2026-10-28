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
  gateway: "sandbox" | "payphone" | "transferencia" | "consultorio";
  gateway_title: string;
  reference: string;
  receipt: string;
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

type Method = { id: Payment["gateway"]; kind: "online" | "manual" | "offline"; title: string; description: string; bank?: Record<string, string> };

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const me = await serverApiSafe<{ user: unknown }>(context, request, "/api/auth/me", { user: null });
  if (!me.user) throw redirect(`/cuenta?next=/pagar/${params.id}`);
  return serverApi<{ payment: Payment; methods: Method[] }>(context, request, `/api/payments/${encodeURIComponent(params.id)}`);
}

const METHOD_ICON: Record<string, string> = { sandbox: "card", payphone: "lock", transferencia: "building" };

/** Datos para transferir con botón de copiar (el paciente los pega en su banca en línea). */
function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-2">
      <div className="min-w-0">
        <dt className="text-xs muted">{label}</dt>
        <dd className="font-semibold break-words">{value}</dd>
      </div>
      <button
        type="button"
        className="btn-ghost btn-sm"
        aria-label={`Copiar ${label}`}
        onClick={() =>
          navigator.clipboard
            ?.writeText(value)
            .then(() => setCopied(true))
            .catch(() => {})
        }
      >
        <Icon name={copied ? "check" : "copy"} className="size-4" /> {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
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
  const methods = loaderData.methods;
  const current = methods.find((m) => m.id === p.gateway);
  const [receipt, setReceipt] = useState("");
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
  async function choose(id: Method["id"]) {
    if (id === p.gateway) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/payments/${p.id}/method`, { body: { gateway: id } });
      revalidator.revalidate();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }
  async function sendReceipt(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/payments/${p.id}/transfer`, { body: { receipt } });
      setReceipt("");
      revalidator.revalidate();
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
              {done || !p.mine || methods.length <= 1 ? p.gateway_title || "Pago" : "Elige cómo pagar"}
            </h2>
            <StatusBadge status={p.status} label={p.status_label} />
          </div>
          {!done && p.mine && methods.length > 1 && (
            <fieldset className="mt-3" disabled={busy}>
              <legend className="sr-only">Medio de pago</legend>
              <div className="grid gap-2">
                {methods.map((m) => (
                  <label
                    key={m.id}
                    className={`grid cursor-pointer grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-3 rounded-2xl p-3 ring-1 ${p.gateway === m.id ? "bg-white ring-2 ring-azul" : "bg-white ring-tinta/10 hover:ring-azul/40"}`}
                  >
                    <input
                      type="radio"
                      name="metodo"
                      className="mt-1 size-4 accent-[var(--color-azul)]"
                      checked={p.gateway === m.id}
                      onChange={() => choose(m.id)}
                    />
                    <span className="grid size-9 place-items-center rounded-xl tone-azul">
                      <Icon name={METHOD_ICON[m.id] ?? "card"} className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{m.title}</span>
                      <span className="block text-xs muted">{m.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
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
          ) : p.gateway === "transferencia" ? (
            <div className="mt-4 space-y-3">
              <dl className="divide-y divide-tinta/5 rounded-2xl bg-fondo px-4 py-1">
                <CopyRow label="Banco" value={current?.bank?.bank ?? ""} />
                <CopyRow label="Tipo de cuenta" value={current?.bank?.account_type ?? ""} />
                <CopyRow label="Número de cuenta" value={current?.bank?.account_number ?? ""} />
                <CopyRow label="Titular" value={current?.bank?.holder ?? ""} />
                <CopyRow label="RUC o cédula" value={current?.bank?.id_number ?? ""} />
                <CopyRow label="Valor exacto" value={money(p.amount_cents)} />
                <CopyRow label="Concepto o referencia" value={p.reference} />
              </dl>
              <p className="text-sm muted">
                {current?.bank?.instructions || "Transfiere el valor exacto con la referencia en el concepto y registra el número de comprobante."}
                {current?.bank?.email ? ` También puedes enviar el comprobante a ${current.bank.email}.` : ""}
              </p>
              {p.receipt ? (
                <Notice tone="success" title="Comprobante registrado">
                  Número {p.receipt}. Te avisaremos en cuanto confirmemos el pago; tu horario queda reservado mientras tanto.
                </Notice>
              ) : (
                <form onSubmit={sendReceipt} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <label className="field">
                    Número de comprobante
                    <input
                      className="input"
                      required
                      minLength={4}
                      maxLength={40}
                      value={receipt}
                      onChange={(e) => setReceipt(e.target.value)}
                      placeholder="Ej.: 0012345678"
                    />
                  </label>
                  <button type="submit" className="btn-primary" disabled={busy}>
                    {busy ? <Spinner /> : <Icon name="check" className="size-4" />} Ya transferí
                  </button>
                </form>
              )}
              {error && <Notice tone="danger">{error}</Notice>}
            </div>
          ) : p.gateway === "payphone" ? (
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
                    <span className="absolute top-1/2 right-2 -translate-y-1/2 chip bg-celeste px-2 py-0.5 text-xs font-bold text-azul-ink">
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
