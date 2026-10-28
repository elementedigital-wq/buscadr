import type { ReactNode } from "react";
import { money } from "../lib/format";
import type { Plan } from "../lib/types";
import { Icon } from "./Icon";

/** Tabla de planes SaaS (precios del Documento Maestro). `action` decide el botón de cada plan. */
export function PlanGrid({ plans, current, action }: { plans: Plan[]; current?: string; action: (p: Plan) => ReactNode }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {plans.map((p) => (
        <li key={p.id} className={`card flex min-w-0 flex-col p-5 ${p.id === "pro" ? "ring-2 ring-azul" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-extrabold">{p.name}</h2>
            {p.id === "pro" && <span className="chip bg-azul px-2.5 py-0.5 text-xs font-bold text-white">Recomendado</span>}
            {p.id === current && <span className="chip tone-verde px-2.5 py-0.5 text-xs font-bold">Tu plan</span>}
          </div>
          <p className="mt-2">
            <span className="font-display text-3xl font-extrabold">{p.price_cents ? money(p.price_cents) : "Gratis"}</span>
            {p.price_cents > 0 && <span className="muted"> /mes{p.id === "clinic" ? " desde" : ""}</span>}
          </p>
          <p className="text-xs muted">{p.unit}</p>
          <ul className="mt-4 flex-1 space-y-2 text-sm">
            {p.features.map((f) => (
              <li key={f} className="flex gap-2">
                <Icon name="check" className="mt-0.5 size-4 shrink-0 text-verde-ink" /> <span className="min-w-0">{f}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5">{action(p)}</div>
        </li>
      ))}
    </ul>
  );
}
