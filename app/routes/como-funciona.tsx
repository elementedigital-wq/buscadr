import { Link } from "react-router";
import { Icon } from "../components/Icon";
import { PageHeader, TONE_CLASS } from "../components/ui";
import { pct } from "../lib/format";
import { useRootData } from "../root";
import type { Route } from "./+types/como-funciona";

export const meta: Route.MetaFunction = () => [
  { title: "Cómo funciona buscaDR · Citas médicas presenciales y virtuales" },
  {
    name: "description",
    content:
      "Cómo reservar en buscaDR: busca por especialidad, compara tarifas presenciales y virtuales, elige un horario, el profesional confirma y recibes avisos por WhatsApp. Pagos protegidos y cancelación clara.",
  },
];

const STEPS = [
  ["search", "azul", "Busca", "Por especialidad, síntoma, nombre o ciudad. Filtra por modalidad presencial o virtual y compara tarifas."],
  ["calendar", "verde", "Elige horario", "La agenda muestra solo horarios libres del profesional. Escoges día, hora y modalidad."],
  ["check-circle", "cielo", "El profesional confirma", "Recibe tu solicitud en su panel y por WhatsApp. Te avisamos al instante cuando la confirma."],
  ["video", "azul", "Atiéndete", "Acude al consultorio con tu código de llegada o entra a la videoconsulta desde tu cita."],
] as const;

const CANCEL = [
  ["Antes de que el profesional confirme", "Sin costo. Si pagaste en línea, se reembolsa completo."],
  ["Hasta 4 horas antes de la cita", "Cancelación gratuita y reembolso íntegro del pago en línea."],
  ["Menos de 4 horas antes", "Se puede cancelar, pero el pago en línea no se reembolsa automáticamente."],
  ["El profesional rechaza o cancela", "Reembolso íntegro y aviso inmediato para que reserves otro horario."],
  ["La solicitud no se confirma a tiempo", "Expira sola (24 h o 1 h antes de la cita) y se libera el pago."],
];

export default function ComoFunciona() {
  const root = useRootData();
  const fee = root?.catalog.fee_bps ?? 800;
  return (
    <div className="container-page max-w-4xl pt-6 sm:pt-8">
      <PageHeader eyebrow="Guía" title="Cómo funciona buscaDR">
        Encuentra médicos, especialistas, clínicas y servicios de salud en Ecuador. Reserva en minutos, con tarifas claras y confirmación del profesional.
      </PageHeader>

      <ol className="grid gap-3 sm:grid-cols-2">
        {STEPS.map(([icon, tone, title, text], i) => (
          <li key={title} className="card flex gap-4 p-5">
            <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${TONE_CLASS[tone]}`}>
              <Icon name={icon} className="size-6" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide muted">Paso {i + 1}</p>
              <h2 className="text-lg font-extrabold">{title}</h2>
              <p className="text-sm muted">{text}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="card p-6">
          <h2 className="flex items-center gap-2 text-xl font-extrabold">
            <Icon name="clinic" className="size-5 text-azul" /> Cita presencial
          </h2>
          <p className="mt-2 text-sm muted">
            La dirección exacta del consultorio se muestra al confirmarse la cita. En el perfil verás el sector aproximado. Paga en el consultorio o en línea,
            según lo que acepte el profesional.
          </p>
        </div>
        <div className="card p-6">
          <h2 className="flex items-center gap-2 text-xl font-extrabold">
            <Icon name="video" className="size-5 text-azul" /> Cita virtual
          </h2>
          <p className="mt-2 text-sm muted">
            Tiene su propia tarifa. Se paga en línea para asegurar el horario y la sala de video se abre 15 minutos antes, desde tu cita en buscaDR. Solo
            necesitas un navegador.
          </p>
        </div>
      </section>

      <section id="pagos" className="card mt-8 scroll-mt-24 p-6">
        <h2 className="text-2xl font-extrabold">Pagos con buscaDR Pay</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="flex gap-2">
            <Icon name="lock" className="mt-0.5 size-4 shrink-0 text-azul" /> Cada transacción queda registrada en tu cita y en el historial de pagos. buscaDR
            no guarda los datos completos de tu tarjeta.
          </li>
          <li className="flex gap-2">
            <Icon name="receipt" className="mt-0.5 size-4 shrink-0 text-azul" /> El paciente paga la tarifa publicada; no hay recargos ocultos. buscaDR cobra al
            profesional una comisión de {pct(fee)} solo en citas pagadas en línea.
          </li>
          <li className="flex gap-2">
            <Icon name="repeat" className="mt-0.5 size-4 shrink-0 text-azul" /> Si el profesional rechaza o la cita expira, el reembolso es automático.
          </li>
        </ul>
        {root?.catalog.payments === "sandbox" && (
          <p className="mt-3 rounded-xl bg-amarillo/15 p-3 text-sm">
            Durante el piloto los pagos en línea funcionan en modo de prueba: no se cobra dinero real.
          </p>
        )}
      </section>

      <section id="cancelacion" className="mt-8 scroll-mt-24">
        <h2 className="text-2xl font-extrabold">Cancelaciones y reembolsos</h2>
        <dl className="card mt-3 divide-y divide-tinta/5">
          {CANCEL.map(([k, v]) => (
            <div key={k} className="grid gap-1 p-4 sm:grid-cols-[16rem_minmax(0,1fr)] sm:gap-4">
              <dt className="font-semibold">{k}</dt>
              <dd className="text-sm muted">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="whatsapp" className="card mt-8 scroll-mt-24 p-6">
        <h2 className="flex items-center gap-2 text-2xl font-extrabold">
          <Icon name="whatsapp" className="size-6 text-verde-ink" /> Avisos por WhatsApp
        </h2>
        <p className="mt-2 text-sm muted">
          Si lo autorizas, recibes la confirmación, los cambios y recordatorios 24 h y 1 h antes. Los profesionales reciben cada solicitud con botones para
          confirmar o rechazar sin abrir la app. Puedes retirar el consentimiento cuando quieras desde{" "}
          <Link to="/cuenta#whatsapp" className="font-semibold text-azul underline">
            Mi cuenta
          </Link>
          .
        </p>
      </section>

      <section id="confianza" className="card mt-8 scroll-mt-24 p-6">
        <h2 className="text-2xl font-extrabold">Confianza y transparencia</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li>• El sello «Verificado» aparece solo cuando buscaDR revisó el registro profesional en fuentes oficiales.</li>
          <li>• Las opiniones solo las escriben pacientes con una cita completada, una por cita.</li>
          <li>• Los «perfiles de muestra» ilustran la plataforma: están marcados y no atienden pacientes reales.</li>
          <li>• Los profesionales destacados se señalan como tales; la verificación y las opiniones nunca se compran.</li>
        </ul>
      </section>

      <Notice />

      <div className="my-10 flex flex-wrap gap-3">
        <Link to="/buscar" className="btn-primary">
          <Icon name="search" className="size-4" /> Buscar profesional
        </Link>
        <Link to="/para-profesionales" className="btn-outline">
          Soy profesional de la salud
        </Link>
      </div>
    </div>
  );
}

function Notice() {
  return (
    <p className="mt-8 flex gap-3 rounded-2xl bg-alerta/5 p-4 text-sm ring-1 ring-alerta/20">
      <Icon name="alert" className="mt-0.5 size-5 shrink-0 text-alerta-ink" />
      <span>
        <strong>buscaDR no atiende emergencias.</strong> Ante una emergencia llama al{" "}
        <a href="tel:911" className="font-bold underline">
          911
        </a>{" "}
        o acude al servicio de urgencias más cercano.
      </span>
    </p>
  );
}
