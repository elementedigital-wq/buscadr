import { Form, useSearchParams } from "react-router";
import { Icon } from "../../components/Icon";
import { EmptyState, Stat, StatusBadge } from "../../components/ui";
import { serverApi } from "../../lib/api.server";
import { dateTime, money } from "../../lib/format";
import type { Route } from "./+types/ingresos";

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
    status: string;
    status_label: string;
    card_brand: string;
    card_last4: string;
    created_at: string;
    modality: string | null;
    patient_name: string;
  }[];
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const month = new URL(request.url).searchParams.get("mes");
  return serverApi<Income>(context, request, `/api/pro/income${month ? `?month=${encodeURIComponent(month)}` : ""}`);
}

const PROVIDER: Record<string, string> = { consultorio: "En consultorio", sandbox: "buscaDR Pay (prueba)", payphone: "buscaDR Pay" };

export default function Ingresos({ loaderData: d }: Route.ComponentProps) {
  const [params] = useSearchParams();
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="label-eyebrow">Mi consultorio</p>
          <h1 className="text-3xl font-extrabold">Ingresos y pagos</h1>
          <p className="mt-1 muted">Cada cobro queda registrado en buscaDR: en línea (con su comisión) o en el consultorio.</p>
        </div>
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
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Totales">
        <Stat icon="wallet" label="Neto del mes" value={money(d.totals.net_cents)} hint={`${d.totals.count} pagos aprobados`} tone="verde" />
        <Stat icon="card" label="En línea (neto)" value={money(d.totals.online_cents)} hint={`Comisión buscaDR ${money(d.totals.fee_cents)}`} />
        <Stat icon="receipt" label="En consultorio" value={money(d.totals.office_cents)} hint="Sin comisión" tone="cielo" />
        <Stat icon="repeat" label="Reembolsado" value={money(d.totals.refunded_cents)} tone="neutro" />
      </section>
      {d.items.length ? (
        <section className="card overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-tinta/5 text-xs uppercase muted">
              <tr>
                <th className="p-3">Fecha</th>
                <th className="p-3">Paciente</th>
                <th className="p-3">Medio</th>
                <th className="p-3">Estado</th>
                <th className="p-3 text-right">Bruto</th>
                <th className="p-3 text-right">Comisión</th>
                <th className="p-3 text-right">Neto</th>
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
                    {PROVIDER[r.provider] ?? r.provider}
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
      ) : (
        <EmptyState title="Sin movimientos este mes" icon="wallet">
          Los pagos en línea de tus pacientes y los cobros que registres en el consultorio aparecerán aquí.
        </EmptyState>
      )}
      <p className="text-xs muted">
        Comisión de buscaDR: {(d.fee_bps / 100).toLocaleString("es-EC")} % sobre citas pagadas en línea. Las liquidaciones a tu cuenta bancaria se coordinan con
        la pasarela; facturación electrónica SRI pendiente de activación.
      </p>
    </div>
  );
}
