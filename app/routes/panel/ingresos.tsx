import { useState } from "react";
import { Form, Link, useRevalidator, useSearchParams } from "react-router";
import { Icon } from "../../components/Icon";
import { EmptyState, Notice, Spinner, Stat, StatusBadge } from "../../components/ui";
import { type ApiError, api } from "../../lib/api";
import { serverApi } from "../../lib/api.server";
import { dateTime, money, pct, shortDate } from "../../lib/format";
import type { Route } from "./+types/ingresos";

export const meta: Route.MetaFunction = () => [{ title: "Ingresos y liquidaciones · Mi consultorio" }, { name: "robots", content: "noindex" }];

type Income = {
  month: string;
  fee_bps: number;
  totals: { gross_cents: number; fee_cents: number; net_cents: number; online_cents: number; office_cents: number; refunded_cents: number; count: number };
  items: {
    id: string;
    appointment_id: number | null;
    amount_cents: number;
    fee_cents: number;
    net_cents: number;
    provider: string;
    gateway: string;
    status: string;
    status_label: string;
    card_brand: string;
    card_last4: string;
    created_at: string;
    modality: string | null;
    patient_name: string;
  }[];
};

type Balance = { retained: number; available: number; releasing: number; in_payout: number; paid: number };
type Payouts = {
  settings: { fee_bps: number; release_days: number; min_payout_cents: number };
  balance: { real: Balance; test: Balance };
  account: { configured: boolean; hint: string; types: string[]; secure: boolean };
  payouts: {
    id: number;
    amount_cents: number;
    lines: number;
    status: string;
    status_label: string;
    test: number;
    account_hint: string;
    reference: string;
    created_at: string;
    paid_at: string | null;
  }[];
  lines: {
    id: number;
    kind: "cita" | "ajuste";
    appointment_id: number | null;
    net_cents: number;
    status: string;
    status_label: string;
    available_ms: number | null;
    test: number;
    start_ms: number | null;
    appointment_label: string;
    patient_name: string;
  }[];
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const month = new URL(request.url).searchParams.get("mes");
  const [income, payouts] = await Promise.all([
    serverApi<Income>(context, request, `/api/pro/income${month ? `?month=${encodeURIComponent(month)}` : ""}`),
    serverApi<Payouts>(context, request, "/api/pro/payouts"),
  ]);
  return { income, payouts };
}

const PROVIDER: Record<string, string> = { consultorio: "En consultorio", sandbox: "Tarjeta (prueba)", payphone: "Tarjeta", transferencia: "Transferencia" };
/** Bancos y cooperativas frecuentes en Ecuador (sugerencias; se puede escribir otro). */
const BANKS = [
  "Banco Pichincha",
  "Banco Guayaquil",
  "Banco del Pacífico",
  "Produbanco",
  "Banco Internacional",
  "Banco Bolivariano",
  "Banco del Austro",
  "Banco de Machala",
  "Banco General Rumiñahui",
  "Banco Solidario",
  "Banco de Loja",
  "Banco Amazonas",
  "Banco ProCredit",
  "Cooperativa JEP",
  "Cooperativa Jardín Azuayo",
  "Cooperativa Policía Nacional",
];

export default function Ingresos({ loaderData }: Route.ComponentProps) {
  const { income: d, payouts: po } = loaderData;
  const [params] = useSearchParams();
  const b = po.balance.real;
  const t = po.balance.test;
  const hasTest = Object.values(t).some((v) => v !== 0);
  const days = po.settings.release_days;
  const pending = po.lines.filter((l) => l.status === "retenido" && l.start_ms && l.start_ms < Date.now());
  return (
    <div className="space-y-5">
      <header className="min-w-0">
        <p className="label-eyebrow">Mi consultorio</p>
        <h1 className="text-3xl font-extrabold">Ingresos y liquidaciones</h1>
        <p className="mt-1 muted">
          Tus pacientes pagan con tarjeta al reservar. buscaDR cobra, retiene su comisión de {pct(po.settings.fee_bps)} y te transfiere el resto a tu cuenta.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Saldos">
        <Stat icon="wallet" label="Disponible para liquidar" value={money(b.available)} hint="Entra en la próxima liquidación" tone="verde" />
        <Stat icon="clock" label="Por liberar" value={money(b.releasing)} hint={`${days} ${days === 1 ? "día" : "días"} después de la cita`} tone="cielo" />
        <Stat icon="calendar-check" label="Citas por realizar" value={money(b.retained)} hint="Se libera al marcarlas atendidas" tone="neutro" />
        <Stat icon="receipt" label="Transferido" value={money(b.paid)} hint={b.in_payout ? `${money(b.in_payout)} en proceso` : "Total histórico"} />
      </section>
      {hasTest && (
        <Notice tone="info" title="Cobros de prueba">
          Modo de prueba: {money(t.retained + t.releasing + t.available)} pendientes y {money(t.paid + t.in_payout)} liquidados en pruebas. No son dinero real
          ni se transfieren.
        </Notice>
      )}
      {pending.length > 0 && (
        <Notice tone="warning" title="Marca tus citas como atendidas">
          Tienes {pending.length} {pending.length === 1 ? "cita pasada" : "citas pasadas"} sin marcar. Tu parte se libera cuando la marcas «Atendida» o «No
          asistió»:{" "}
          {pending.slice(0, 5).map((l, i) => (
            <span key={l.id}>
              {i > 0 && ", "}
              <Link to={`/panel/citas/${l.appointment_id}`} className="font-semibold text-azul-ink underline">
                #{l.appointment_id}
              </Link>
            </span>
          ))}
          .
        </Notice>
      )}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <HowItWorks feeBps={po.settings.fee_bps} days={days} min={po.settings.min_payout_cents} />
        <Account account={po.account} />
      </section>

      <section className="card p-5" aria-labelledby="liq">
        <h2 id="liq" className="text-lg font-extrabold">
          Liquidaciones
        </h2>
        {po.payouts.length ? (
          <ul className="mt-3 divide-y divide-tinta/5">
            {po.payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    Liquidación #{p.id} · {money(p.amount_cents)}
                    {p.test ? <span className="ml-2 chip bg-amarillo/20 px-2 py-0.5 text-xs">Prueba</span> : null}
                  </p>
                  <p className="text-xs muted">
                    {p.lines} {p.lines === 1 ? "cobro" : "cobros"} ·{" "}
                    {p.status === "pagada" ? `transferida el ${dateTime(p.paid_at)}` : `creada el ${dateTime(p.created_at)}`}
                    {p.reference ? ` · Ref. ${p.reference}` : ""}
                  </p>
                  {p.account_hint && <p className="text-xs break-words muted">{p.account_hint}</p>}
                </div>
                <StatusBadge status={p.status} label={p.status_label} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm muted">Aún no hay liquidaciones. Cuando tengas saldo disponible, buscaDR la genera y te avisamos al transferir.</p>
        )}
      </section>

      {po.lines.length > 0 && (
        <>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: tabla con desplazamiento horizontal; WCAG 2.1.1 exige poder desplazarla con el teclado (axe scrollable-region-focusable) */}
          <section className="card overflow-x-auto" aria-labelledby="lineas" tabIndex={0}>
            <h2 id="lineas" className="p-5 pb-0 text-lg font-extrabold">
              Tu parte por cita
            </h2>
            <table className="mt-3 w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-tinta/5 text-xs uppercase muted">
                <tr>
                  <th className="p-3">Cita</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 text-right">Tu parte</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tinta/5">
                {po.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="p-3">
                      {l.kind === "ajuste" ? (
                        "Ajuste por reembolso"
                      ) : l.appointment_id ? (
                        <Link to={`/panel/citas/${l.appointment_id}`} className="font-semibold text-azul-ink underline">
                          Cita #{l.appointment_id}
                        </Link>
                      ) : (
                        "Cita"
                      )}
                      <span className="block text-xs muted">
                        {l.start_ms ? `${shortDate(l.start_ms)} · ` : ""}
                        {l.patient_name}
                        {l.appointment_label ? ` · ${l.appointment_label}` : ""}
                        {l.test ? " · prueba" : ""}
                      </span>
                    </td>
                    <td className="p-3">
                      <StatusBadge
                        status={l.status}
                        label={
                          l.status === "disponible" && l.available_ms && l.available_ms > Date.now() ? `Desde el ${shortDate(l.available_ms)}` : l.status_label
                        }
                      />
                    </td>
                    <td className={`p-3 text-right font-semibold ${l.net_cents < 0 ? "text-alerta-ink" : ""}`}>{money(l.net_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      <header className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <h2 className="text-2xl font-extrabold">Cobros del mes</h2>
        <Form method="get" className="flex flex-wrap items-center gap-2">
          <label htmlFor="mes" className="text-sm font-semibold">
            Mes
          </label>
          <input
            id="mes"
            type="month"
            name="mes"
            defaultValue={params.get("mes") ?? d.month}
            className="input w-auto"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          />
          <a href={`/api/pro/income?month=${d.month}&format=csv`} className="btn-outline btn-sm">
            <Icon name="download" className="size-4" /> CSV
          </a>
        </Form>
      </header>
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Totales del mes">
        <Stat icon="card" label="Cobrado con tarjeta" value={money(d.totals.gross_cents)} hint={`${d.totals.count} pagos aprobados`} />
        <Stat icon="wallet" label="Tu parte del mes" value={money(d.totals.net_cents)} hint={`Comisión buscaDR ${money(d.totals.fee_cents)}`} tone="verde" />
        <Stat icon="repeat" label="Reembolsado" value={money(d.totals.refunded_cents)} tone="neutro" />
      </section>
      {d.items.length ? (
        <>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: tabla con desplazamiento horizontal; WCAG 2.1.1 exige poder desplazarla con el teclado (axe scrollable-region-focusable) */}
          <section className="card overflow-x-auto" aria-label="Cobros del mes" tabIndex={0}>
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-tinta/5 text-xs uppercase muted">
                <tr>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Paciente</th>
                  <th className="p-3">Medio</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 text-right">Cobrado</th>
                  <th className="p-3 text-right">Comisión</th>
                  <th className="p-3 text-right">Tu parte</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tinta/5">
                {d.items.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3 whitespace-nowrap">{dateTime(r.created_at)}</td>
                    <td className="p-3">
                      {r.patient_name}
                      {r.appointment_id && (
                        <span className="block text-xs muted">
                          Cita #{r.appointment_id} · {r.modality}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      {PROVIDER[r.gateway || r.provider] ?? r.provider}
                      {r.card_last4 && (
                        <span className="block text-xs muted">
                          {r.card_brand} •••• {r.card_last4}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <StatusBadge status={r.status} label={r.status_label} />
                    </td>
                    <td className="p-3 text-right">{money(r.amount_cents)}</td>
                    <td className="p-3 text-right muted">{money(r.fee_cents)}</td>
                    <td className="p-3 text-right font-semibold">{money(r.net_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : (
        <EmptyState title="Sin cobros este mes" icon="wallet">
          Los pagos con tarjeta de tus pacientes aparecerán aquí, con la comisión de buscaDR y tu parte.
        </EmptyState>
      )}
      <p className="text-xs muted">Facturación electrónica SRI pendiente de activación.</p>
    </div>
  );
}

function HowItWorks({ feeBps, days, min }: { feeBps: number; days: number; min: number }) {
  const steps: [string, string, string][] = [
    ["card", "El paciente paga con tarjeta", "Crédito o débito, al reservar. buscaDR cobra por ti."],
    ["calendar-check", "Atiendes la cita", "Márcala «Atendida» (o «No asistió») para liberar tu parte."],
    [
      "wallet",
      `Tu parte: ${pct(10_000 - feeBps)} de la tarifa`,
      `buscaDR retiene ${pct(feeBps)}. Queda disponible ${days} ${days === 1 ? "día" : "días"} después.`,
    ],
    ["receipt", "Te transferimos", `En cada liquidación (desde ${money(min)}), con referencia bancaria y aviso.`],
  ];
  return (
    <div className="card p-5">
      <h2 className="text-lg font-extrabold">Cómo recibes tu dinero</h2>
      <ol className="mt-3 space-y-3">
        {steps.map(([icon, title, text], i) => (
          <li key={title} className="flex min-w-0 items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl tone-azul" aria-hidden>
              <Icon name={icon} className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">
                {i + 1}. {title}
              </span>
              <span className="block text-xs muted">{text}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs muted">Si un pago se reembolsa (cancelación a tiempo o cita no aceptada), esa parte no se liquida.</p>
    </div>
  );
}

function Account({ account }: { account: Payouts["account"] }) {
  const revalidator = useRevalidator();
  const [editing, setEditing] = useState(!account.configured);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ message: string }>("/api/pro/payouts/account", { method: "PUT", body: Object.fromEntries(f) });
      setMsg({ tone: "success", text: r.message });
      setEditing(false);
      revalidator.revalidate();
    } catch (err) {
      setMsg({ tone: "danger", text: (err as ApiError).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card p-5" id="cuenta">
      <h2 className="flex items-center gap-2 text-lg font-extrabold">
        <Icon name="building" className="size-5 text-azul" /> Cuenta para recibir tus pagos
      </h2>
      {msg && (
        <div className="mt-3">
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      )}
      {!editing ? (
        <div className="mt-3 space-y-3">
          <p className="rounded-2xl bg-fondo p-3 text-sm font-semibold break-words">{account.hint}</p>
          <p className="text-xs muted">Guardada cifrada. Solo buscaDR la usa para transferirte; nunca se muestra a pacientes.</p>
          <button type="button" className="btn-outline btn-sm" onClick={() => setEditing(true)}>
            <Icon name="edit" className="size-4" /> Cambiar cuenta
          </button>
        </div>
      ) : (
        <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={save}>
          {!account.configured && (
            <p className="text-sm sm:col-span-2 muted">Regístrala para recibir tus liquidaciones. La cuenta debe estar a tu nombre (o al de tu clínica).</p>
          )}
          <label className="field sm:col-span-2">
            Banco o cooperativa
            <input name="bank" className="input" list="bancos" required maxLength={60} autoComplete="off" />
            <datalist id="bancos">
              {BANKS.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </label>
          <label className="field">
            Tipo de cuenta
            <select name="account_type" className="input" required defaultValue="">
              <option value="" disabled>
                Elige
              </option>
              {account.types.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Número de cuenta
            <input
              name="account_number"
              className="input"
              inputMode="numeric"
              required
              minLength={6}
              maxLength={20}
              pattern="[0-9 -]{6,24}"
              autoComplete="off"
            />
          </label>
          <label className="field">
            Titular
            <input name="holder" className="input" required minLength={3} maxLength={80} autoComplete="name" />
          </label>
          <label className="field">
            Cédula o RUC del titular
            <input name="id_number" className="input" inputMode="numeric" required pattern="[0-9]{10}([0-9]{3})?" maxLength={13} autoComplete="off" />
          </label>
          <label className="field sm:col-span-2">
            Correo para comprobantes <span className="font-normal muted">(opcional)</span>
            <input name="email" type="email" className="input" maxLength={120} autoComplete="email" />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" className="btn" disabled={busy || !account.secure}>
              {busy ? <Spinner label="Guardando" /> : <Icon name="lock" className="size-4" />} Guardar cuenta
            </button>
            {account.configured && (
              <button type="button" className="btn-outline" onClick={() => setEditing(false)}>
                Cancelar
              </button>
            )}
          </div>
          {!account.secure && (
            <p className="text-xs sm:col-span-2 text-alerta-ink">El guardado seguro de cuentas aún no está activo. Inténtalo más tarde o escribe a soporte.</p>
          )}
        </form>
      )}
    </div>
  );
}
