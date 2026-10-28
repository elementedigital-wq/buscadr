import { Link } from "react-router";
import { Icon } from "../components/Icon";
import { TONE_CLASS } from "../components/ui";
import { pct } from "../lib/format";
import { useRootData } from "../root";
import type { Route } from "./+types/para-profesionales";

export const meta: Route.MetaFunction = () => [
  { title: "buscaDR para médicos, especialistas y clínicas · Agenda y cobros" },
  {
    name: "description",
    content:
      "Recibe citas presenciales y virtuales con tarifas diferenciadas, confirma desde WhatsApp, cobra en línea con buscaDR Pay y gestiona tu consultorio desde un panel personalizado.",
  },
];

const FEATURES = [
  [
    "calendar-check",
    "azul",
    "Agenda que tú controlas",
    "Define horarios por día y modalidad, duración, pausas y anticipación mínima. Bloquea vacaciones con un clic.",
  ],
  [
    "whatsapp",
    "verde",
    "Confirma desde WhatsApp",
    "Cada solicitud llega con botones Confirmar o Rechazar. El paciente recibe el aviso y los recordatorios automáticos.",
  ],
  ["video", "cielo", "Teleconsulta integrada", "Activa citas virtuales con su propia tarifa. La sala de video se crea sola y se abre 15 minutos antes."],
  ["wallet", "azul", "Cobros con buscaDR Pay", "Pago anticipado para asegurar el horario y registro de cada transacción, incluso los cobros en consultorio."],
  ["chart", "verde", "Panel de tu consultorio", "Citas del día, solicitudes pendientes, ingresos del mes, tasa de asistencia y opiniones."],
  [
    "verified",
    "cielo",
    "Perfil verificado",
    "Revisamos tu registro profesional y mostramos el sello «Verificado». Las opiniones son solo de pacientes atendidos.",
  ],
] as const;

export default function ParaProfesionales() {
  const root = useRootData();
  const user = root?.user;
  const cta = user ? "/panel" : "/cuenta?tab=registro&rol=profesional&next=/panel";
  return (
    <div>
      <section className="surface-hero">
        <div className="container-page grid items-center gap-8 py-10 sm:py-14 lg:grid-cols-2">
          <div className="min-w-0">
            <p className="label-eyebrow">Para médicos, especialistas y clínicas</p>
            <h1 className="mt-2 text-4xl font-extrabold sm:text-5xl">Llena tu agenda sin perseguir confirmaciones</h1>
            <p className="mt-4 text-lg muted">
              Pacientes que te encuentran por especialidad y ciudad, reservas que confirmas desde WhatsApp y pagos registrados en tu panel.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to={cta} className="btn-primary">
                {user?.role === "pro" ? "Ir a mi consultorio" : "Crear mi perfil gratis"} <Icon name="arrow" className="size-4" />
              </Link>
              <Link to="/planes" className="btn-outline">
                Ver planes
              </Link>
            </div>
            <p className="mt-3 text-sm muted">Sin costo de inicio · comisión de {pct(root?.catalog.fee_bps ?? 800)} solo en citas pagadas en línea.</p>
          </div>
          <img
            src="/assets/fotos/profesional.webp"
            alt="Profesional de la salud usando buscaDR"
            className="aspect-[4/3] w-full rounded-3xl object-cover shadow-xl"
          />
        </div>
      </section>
      <section className="container-page py-10">
        <h2 className="text-3xl font-extrabold">Todo tu consultorio en un panel</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([icon, tone, title, text]) => (
            <li key={title} className="card p-5">
              <span className={`grid size-12 place-items-center rounded-2xl ${TONE_CLASS[tone]}`}>
                <Icon name={icon} className="size-6" />
              </span>
              <h3 className="mt-3 text-lg font-extrabold">{title}</h3>
              <p className="mt-1 text-sm muted">{text}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="container-page pb-12">
        <div className="card grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <h2 className="text-2xl font-extrabold">Empieza en 3 pasos</h2>
            <ol className="mt-3 space-y-2 text-sm">
              <li>1. Crea tu cuenta profesional y completa tu perfil (especialidad, consultorio, tarifas presencial y virtual).</li>
              <li>2. Define tus horarios de atención y activa los avisos por WhatsApp.</li>
              <li>3. Envía tu perfil a verificación: lo revisamos y lo publicamos.</li>
            </ol>
          </div>
          <Link to={cta} className="btn-primary">
            Empezar ahora
          </Link>
        </div>
      </section>
    </div>
  );
}
