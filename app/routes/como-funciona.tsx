import { Link } from "react-router";
import { CATEGORIES } from "../../server/lib/catalog";
import { Icon } from "../components/Icon";
import { PageHeader } from "../components/ui";
import { pct } from "../lib/format";
import { useRootData } from "../root";
import type { Route } from "./+types/como-funciona";

export const meta: Route.MetaFunction = () => [
  { title: "Cómo funciona buscaDR · Alquiler de herramientas y equipos" },
  {
    name: "description",
    content:
      "Cómo alquilar y publicar en buscaDR: precio total antes de reservar, entrega con código y fotos, comisiones claras, equipos admitidos y reglas del piloto en Guayaquil, Samborondón y Daule.",
  },
];

const CANCEL = [
  ["Antes de que el propietario acepte", "Sin costo para quien alquila."],
  ["Con anticipación", "Devolución alta o total según la política publicada (en revisión legal)."],
  ["Muy cerca del retiro", "Retención limitada solo si hay un costo demostrado y un término claro."],
  ["El propietario cancela", "Reembolso íntegro, revisión de su reputación y búsqueda de alternativa."],
  ["El equipo no coincide o está defectuoso", "Reembolso y expediente con evidencia."],
  ["Incidente disputado", "Mediación con plazos, revisión de evidencia y derecho de réplica."],
];

export default function ComoFunciona() {
  const root = useRootData();
  const fees = root?.fees ?? { owner_bps: 1500, renter_bps: 1000 };
  return (
    <div className="container-page max-w-4xl">
      <PageHeader eyebrow="Guía" title="Cómo funciona buscaDR">
        Alquila herramientas y equipos cerca de ti, por horas o días, o publica los tuyos y genera ingresos. Con condiciones claras y un proceso de entrega y
        devolución verificable.
      </PageHeader>

      <section id="piloto" className="card scroll-mt-24 p-6">
        <h2 className="text-2xl font-extrabold">Qué significa «piloto»</h2>
        <ul className="mt-3 space-y-2">
          <li>• Operamos solo en Guayaquil, Samborondón y Daule, con un catálogo de equipos portátiles de riesgo controlado.</li>
          <li>
            • <strong>buscaDR aún no procesa pagos.</strong> Ves el desglose completo (alquiler, tarifa de servicio, entrega y garantía) y el pago se coordina
            entre las partes al retirar. La integración con una pasarela autorizada en Ecuador está en preparación.
          </li>
          <li>• Los anuncios rotulados «Anuncio de muestra» son ilustrativos para conocer el flujo; no corresponden a equipos reales.</li>
          <li>• Términos, privacidad y políticas de cancelación están en revisión legal. Al registrarte aceptas las condiciones del piloto.</li>
        </ul>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="card p-6">
          <h2 className="text-xl font-extrabold">Si alquilas</h2>
          <ol className="mt-3 space-y-3 text-sm">
            {[
              ["search", "Busca por qué, dónde y cuándo. Solo ves equipos libres en tus fechas, con el total."],
              ["calendar", "Solicita la reserva. Si el anuncio tiene reserva inmediata, se confirma al instante; si no, el propietario tiene 24 h."],
              ["chat", "Coordina el retiro o la entrega por el chat de la reserva."],
              ["key", "Al recibir el equipo revisan juntos, toman fotos y dictas tu código de entrega."],
              ["repeat", "Al devolverlo, el propietario te dicta el código de devolución. Luego ambos se califican."],
            ].map(([icon, text]) => (
              <li key={text} className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-lila text-morado">
                  <Icon name={icon} className="size-5" />
                </span>
                <span className="pt-1.5">{text}</span>
              </li>
            ))}
          </ol>
        </div>
        <div id="propietarios" className="card scroll-mt-24 p-6">
          <h2 className="text-xl font-extrabold">Si publicas</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>• Publicar es gratis. Tú defines precio por hora, día o semana, mínimo de alquiler, garantía y reglas.</li>
            <li>
              • Comisión buscaDR: <strong>{pct(fees.owner_bps)}</strong> del alquiler, solo cuando se completa. Quien alquila paga una tarifa de servicio de{" "}
              <strong>{pct(fees.renter_bps)}</strong>. Antes de aceptar ves exactamente cuánto recibes.
            </li>
            <li>• La garantía es reembolsable, va aparte y no es ingreso de buscaDR.</li>
            <li>• Bloquea fechas, define un margen entre alquileres y pausa tus anuncios cuando quieras.</li>
            <li>• Acepta o rechaza solicitudes desde WhatsApp con un botón (si activas los avisos).</li>
          </ul>
          <Link to="/publicar" className="btn-primary mt-4">
            Publicar un equipo
          </Link>
        </div>
      </section>

      <section id="seguridad" className="card mt-6 scroll-mt-24 p-6">
        <h2 className="text-2xl font-extrabold">Confianza y seguridad</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {[
            ["Anuncios revisados", "Cada equipo pasa una revisión manual (fotos reales, estado, reglas y categoría permitida) antes de publicarse."],
            ["Entrega con evidencia", "Código de 6 dígitos, fotos y checklist del estado al retirar y al devolver, con fecha y hora."],
            ["Datos protegidos", "Ubicación pública aproximada (~1 km). Teléfonos y direcciones se comparten solo con reservas confirmadas."],
            ["Reseñas reales", "Solo califican quienes completaron un alquiler en buscaDR. Las reseñas se moderan."],
            ["Mediación", "Si algo sale mal, reportas desde la reserva. Ningún cargo por daños se aplica automáticamente: hay evidencia y derecho de réplica."],
            [
              "Uso responsable",
              "Mayores de 18 años. Equipos de riesgo medio requieren leer reglas y pedir demostración. Ante una emergencia, llama al ECU 911.",
            ],
          ].map(([t, d]) => (
            <div key={t} className="rounded-2xl bg-fondo p-4">
              <p className="font-display font-bold">{t}</p>
              <p className="mt-1 text-sm muted">{d}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs muted">
          buscaDR no afirma validar la competencia técnica de los usuarios ni ofrece seguros propios. La protección por daños se ofrecerá solo con una aseguradora
          autorizada.
        </p>
      </section>

      <section className="card mt-6 p-6">
        <h2 className="text-2xl font-extrabold">Cancelaciones (propuesta del piloto)</h2>
        <table className="mt-3 w-full text-left text-sm">
          <tbody className="divide-y divide-black/5">
            {CANCEL.map(([when, what]) => (
              <tr key={when}>
                <th scope="row" className="py-2 pr-4 font-semibold">
                  {when}
                </th>
                <td className="py-2 muted">{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section id="prohibidos" className="card mt-6 scroll-mt-24 p-6">
        <h2 className="text-2xl font-extrabold">Qué se puede publicar</h2>
        <p className="mt-2 text-sm">Categorías del piloto:</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {CATEGORIES.filter((c) => c.enabled).map((c) => (
            <li key={c.slug} className="chip bg-lila text-morado">
              {c.name}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm font-semibold">No se admiten en el piloto:</p>
        <p className="mt-1 text-sm muted">
          Armas, munición, explosivos o pirotecnia; maquinaria pesada o de elevación (montacargas, andamios, elevadores); motosierras y máquinas de corte de
          alto riesgo; equipos sin propiedad demostrable, defectuosos, con baterías comprometidas o sin manual; y equipos que exijan certificación no
          verificada. Los electrodomésticos llegan en una fase posterior.
        </p>
      </section>

      <section className="card mt-6 p-6">
        <h2 className="text-2xl font-extrabold">WhatsApp</h2>
        <p className="mt-2 text-sm">
          Con tu autorización, buscaDR te escribe desde su número oficial: solicitudes con botones para aceptar o rechazar, confirmaciones y recordatorios. También
          puedes escribir lo que necesitas («proyector en Samborondón») o enviar la foto de un equipo para crear el borrador del anuncio. WhatsApp conecta
          contigo y buscaDR; los datos de la otra parte se comparten solo al confirmar.
        </p>
        <Link to="/cuenta#whatsapp" className="btn-outline mt-4">
          Activar avisos
        </Link>
      </section>
    </div>
  );
}
