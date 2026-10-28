import { Link } from "react-router";
import { Icon } from "../components/Icon";
import { PlanGrid } from "../components/PlanGrid";
import { PageHeader } from "../components/ui";
import { pct } from "../lib/format";
import { useRootData } from "../root";
import type { Route } from "./+types/planes";

export const meta: Route.MetaFunction = () => [
  { title: "Planes para profesionales de la salud · buscaDR" },
  {
    name: "description",
    content:
      "Agenda en línea, confirmaciones por WhatsApp, citas virtuales y cobros con buscaDR Pay. Planes desde $0 para médicos, especialistas y clínicas en Ecuador.",
  },
];

const FAQ = [
  ["¿Puedo empezar gratis?", "Sí. El plan Gratis incluye tu ficha pública, opiniones verificadas y hasta 15 citas al mes. Cambias de plan cuando quieras."],
  ["¿Cómo se cobra el plan?", "Con buscaDR Pay, dentro de tu panel. Cada pago queda en tu historial y se renueva por 30 días."],
  ["¿El paciente paga recargos?", "No. El paciente paga la tarifa que publicas. La comisión por citas pagadas en línea la asume el profesional."],
  ["¿La verificación cuesta?", "No. La verificación y las opiniones nunca dependen del plan ni se pueden comprar."],
];

export default function Planes() {
  const root = useRootData();
  const user = root?.user;
  return (
    <div className="container-page pt-6 sm:pt-8">
      <PageHeader eyebrow="Para profesionales" title="Planes simples para llenar tu agenda">
        Software de agenda, avisos por WhatsApp y cobros en línea, en un solo lugar. Comisión de {pct(root?.catalog.fee_bps ?? 800)} solo en citas pagadas en
        línea.
      </PageHeader>
      <PlanGrid
        plans={root?.catalog.plans ?? []}
        action={(p) => (
          <Link
            to={
              user
                ? p.price_cents
                  ? "/panel/plan"
                  : "/panel"
                : `/cuenta?tab=registro&rol=profesional&next=${encodeURIComponent(p.price_cents ? "/panel/plan" : "/panel")}`
            }
            className={`w-full ${p.id === "pro" ? "btn-primary" : "btn-outline"}`}
          >
            {p.price_cents ? `Empezar con ${p.name}` : "Crear mi perfil gratis"}
          </Link>
        )}
      />
      <section className="mt-10 grid gap-3 sm:grid-cols-2">
        {FAQ.map(([q, a]) => (
          <div key={q} className="card p-5">
            <h2 className="font-extrabold">{q}</h2>
            <p className="mt-1 text-sm muted">{a}</p>
          </div>
        ))}
      </section>
      <p className="mt-6 mb-10 flex gap-2 text-xs muted">
        <Icon name="info" className="size-4 shrink-0" /> Precios en USD antes de impuestos. Durante el piloto todas las funciones están disponibles en cualquier
        plan.
      </p>
    </div>
  );
}
