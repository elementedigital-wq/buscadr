import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { PlanGrid } from "../../components/PlanGrid";
import { Notice } from "../../components/ui";
import { type ApiError, api } from "../../lib/api";
import { serverApi } from "../../lib/api.server";
import { dateTime, money } from "../../lib/format";
import { useRootData } from "../../root";
import type { Route } from "./+types/plan";

type PlanData = {
  plan: string;
  plan_until_ms: number | null;
  enforced: boolean;
  history: { plan: string; status: string; amount_cents: number; period_start_ms: number; period_end_ms: number }[];
};

export async function loader({ request, context }: Route.LoaderArgs) {
  return serverApi<PlanData>(context, request, "/api/pro/plan");
}

export default function Plan({ loaderData: d }: Route.ComponentProps) {
  const root = useRootData();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  async function buy(plan: string) {
    setError(null);
    try {
      const r = await api<{ checkout: string }>("/api/pro/plan", { body: { plan } });
      if (/^https?:/.test(r.checkout)) window.location.assign(r.checkout);
      else navigate(r.checkout);
    } catch (e) {
      setError((e as ApiError).message);
    }
  }
  const plans = root?.catalog.plans ?? [];
  return (
    <div className="space-y-5">
      <header>
        <p className="label-eyebrow">Mi consultorio</p>
        <h1 className="text-3xl font-extrabold">Tu plan</h1>
        <p className="mt-1 muted">
          Plan actual: <strong>{plans.find((p) => p.id === d.plan)?.name ?? d.plan}</strong>
          {d.plan_until_ms ? ` · vigente hasta el ${dateTime(d.plan_until_ms)}` : ""}.{" "}
          {!d.enforced && "Durante el piloto todas las funciones están disponibles en cualquier plan."}
        </p>
      </header>
      {params.get("pagado") && <Notice tone="success">¡Pago aprobado! Tu plan está activo por 30 días.</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
      <PlanGrid
        plans={plans}
        current={d.plan}
        action={(p) =>
          p.id === d.plan ? (
            <span className="btn w-full bg-gris-claro text-tinta">Plan actual</span>
          ) : p.price_cents > 0 ? (
            <button type="button" className={`w-full ${p.id === "pro" ? "btn-primary" : "btn-outline"}`} onClick={() => buy(p.id)}>
              Elegir {p.name}
            </button>
          ) : null
        }
      />
      {d.history.length > 0 && (
        <section className="card p-5">
          <h2 className="text-lg font-extrabold">Historial de suscripciones</h2>
          <ul className="mt-2 divide-y divide-tinta/5 text-sm">
            {d.history.map((h) => (
              <li key={h.period_start_ms} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {plans.find((p) => p.id === h.plan)?.name ?? h.plan} · {dateTime(h.period_start_ms)} → {dateTime(h.period_end_ms)}
                </span>
                <span className="font-semibold">{money(h.amount_cents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs muted">
        Precios de prueba del Documento Maestro, en USD antes de impuestos. La verificación y las opiniones nunca dependen del plan.
      </p>
    </div>
  );
}
