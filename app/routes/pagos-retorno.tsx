import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Icon } from "../components/Icon";
import { Notice, PageHeader, Spinner } from "../components/ui";
import { type ApiError, api } from "../lib/api";
import type { Route } from "./+types/pagos-retorno";

export const meta: Route.MetaFunction = () => [{ title: "Resultado del pago · buscaDR" }, { name: "robots", content: "noindex" }];

/** Retorno desde Payphone: el servidor confirma con Payphone antes de aprobar (nunca el navegador). */
export default function PagosRetorno() {
  const [params] = useSearchParams();
  const [state, setState] = useState<{ status: string; id?: string; error?: string | null } | null>(null);
  useEffect(() => {
    if (params.get("cancelado")) {
      setState({ status: "cancelado", id: params.get("ref") ?? undefined });
      return;
    }
    api<{ id: string; status: string; error: string | null }>("/api/payments/payphone/confirm", {
      body: { id: params.get("id"), clientTransactionId: params.get("clientTransactionId") },
    })
      .then(setState)
      .catch((e) => setState({ status: "error", error: (e as ApiError).message }));
  }, [params]);
  return (
    <div className="container-page max-w-xl pb-8">
      <PageHeader eyebrow="buscaDR Pay" title="Resultado del pago" />
      {!state ? (
        <p className="card flex items-center gap-3 p-5">
          <Spinner /> Confirmando tu pago con la pasarela…
        </p>
      ) : state.status === "aprobado" ? (
        <Notice tone="success" title="¡Pago aprobado!">
          Tu transacción quedó registrada en buscaDR.{" "}
          <Link to="/citas" className="font-semibold text-azul">
            Ver mis citas
          </Link>
        </Notice>
      ) : (
        <div className="space-y-4">
          <Notice
            tone={state.status === "pendiente" ? "warning" : "danger"}
            title={state.status === "cancelado" ? "Pago cancelado" : state.status === "pendiente" ? "Pago en proceso" : "El pago no se completó"}
          >
            {state.error ?? "No se realizó ningún cobro. Puedes intentarlo de nuevo."}
          </Notice>
          {state.id && (
            <Link to={`/pagar/${state.id}`} className="btn-primary">
              <Icon name="repeat" className="size-4" /> Intentar de nuevo
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
