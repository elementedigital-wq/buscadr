import { Link } from "react-router";
import { PageHeader } from "../components/ui";
import type { Route } from "./+types/privacidad";

export const meta: Route.MetaFunction = () => [
  { title: "Términos y privacidad · buscaDR" },
  { name: "description", content: "Cómo buscaDR trata tus datos personales y de salud según la Ley Orgánica de Protección de Datos Personales de Ecuador." },
];

const SECTIONS: [string, string, string[]][] = [
  [
    "datos",
    "Qué datos tratamos",
    [
      "Cuenta: nombre, correo, ciudad y, si lo autorizas, tu celular para avisos por WhatsApp.",
      "Citas: profesional, fecha, modalidad, motivo de consulta que escribes y mensajes del chat de la cita.",
      "Pagos: monto, estado y los últimos 4 dígitos de la tarjeta. Nunca guardamos el número completo ni el código de seguridad.",
      "Profesionales: datos del perfil público, registro profesional para verificación y datos del consultorio.",
    ],
  ],
  [
    "uso",
    "Para qué los usamos",
    [
      "Gestionar tus citas: solicitud, confirmación, recordatorios, videoconsulta y pagos.",
      "Enviar avisos por la app, correo y WhatsApp según tus preferencias.",
      "Seguridad, prevención de fraude y cumplimiento legal.",
      "Mejorar el servicio con métricas agregadas, sin vender tus datos.",
    ],
  ],
  [
    "salud",
    "Datos de salud",
    [
      "El motivo de consulta y los mensajes solo los ven tú y el profesional de tu cita.",
      "buscaDR no es una historia clínica electrónica: el profesional es responsable de su propio registro clínico.",
      "La dirección exacta del consultorio y tu contacto se comparten solo cuando la cita está confirmada.",
    ],
  ],
  [
    "derechos",
    "Tus derechos",
    [
      "Acceso, rectificación, eliminación, oposición y portabilidad (LOPDP).",
      "Descarga tus datos desde «Mi cuenta» en cualquier momento.",
      "Retira el consentimiento de WhatsApp o correo desde tus preferencias.",
    ],
  ],
  [
    "terminos",
    "Términos de uso",
    [
      "buscaDR conecta pacientes con profesionales de la salud; la atención médica es responsabilidad del profesional.",
      "buscaDR no atiende emergencias: llama al 911.",
      "Los perfiles de muestra están señalados y no atienden pacientes reales.",
      "Las cancelaciones y reembolsos siguen la política publicada en «Cómo funciona».",
    ],
  ],
];

export default function Privacidad() {
  return (
    <div className="container-page max-w-3xl pt-6 pb-12 sm:pt-8">
      <PageHeader eyebrow="Legal" title="Términos y privacidad">
        Versión piloto 2026. Documento sujeto a revisión legal antes del lanzamiento comercial.
      </PageHeader>
      <div className="space-y-4">
        {SECTIONS.map(([id, title, items]) => (
          <section key={id} id={id} className="card scroll-mt-24 p-5 sm:p-6">
            <h2 className="text-xl font-extrabold">{title}</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
              {items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-6 text-sm muted">
        ¿Preguntas sobre tus datos? Escríbenos desde{" "}
        <Link to="/cuenta" className="font-semibold text-azul underline">
          Mi cuenta
        </Link>{" "}
        o al correo de soporte de buscaDR.
      </p>
    </div>
  );
}
