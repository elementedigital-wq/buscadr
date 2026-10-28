/**
 * CMS Maestro (ADR 0007): editor del propietario integrado en la web, con vista previa en vivo
 * del sitio real. Borrador → publicar, con control de versiones. Solo el propietario configurado
 * en los secretos de Cloudflare puede entrar (la API lo verifica en cada llamada).
 */
import { Suspense, lazy, useState } from "react";
import { Link, useRevalidator } from "react-router";
import { DEFAULT_CMS, normalizeCms } from "../../server/cms/model";
import { Icon } from "../components/Icon";
import type { Site } from "../components/maestro/Editor";
import { RecoverForm } from "../components/maestro/access";
import { Notice, PasswordInput, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { serverApiSafe } from "../lib/api.server";
import { themeStyle } from "../lib/theme";
import type { PublicPractitioner } from "../lib/types";
import { useRootData } from "../root";
import type { Route } from "./+types/maestro";

export const meta: Route.MetaFunction = () => [{ title: "CMS Maestro · buscaDR" }, { name: "robots", content: "noindex, nofollow, noarchive" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const [session, setup] = await Promise.all([
    serverApiSafe<{ authorized: boolean; user?: { name: string; email: string } }>(context, request, "/api/cms/session", { authorized: false }),
    serverApiSafe<{ ownerConfigured: boolean; recoveryEmail: boolean; databaseBinding: boolean }>(context, request, "/api/cms/setup", {
      ownerConfigured: false,
      recoveryEmail: false,
      databaseBinding: false,
    }),
  ]);
  if (!session.authorized) return { authorized: false as const, setup };
  const [site, list] = await Promise.all([
    serverApiSafe<Site | null>(context, request, "/api/cms/site", null),
    serverApiSafe<{ items: PublicPractitioner[] }>(context, request, "/api/practitioners?limit=1&log=0", { items: [] }),
  ]);
  return { authorized: true as const, setup, owner: session.user ?? null, site, firstDoctor: list.items[0]?.slug ?? null };
}

const Editor = lazy(() => import("../components/maestro/Editor"));

/** El CMS conserva la paleta oficial aunque el sitio publicado use otra. */
const CMS_STYLE = themeStyle(normalizeCms(structuredClone(DEFAULT_CMS)));

export default function Maestro({ loaderData }: Route.ComponentProps) {
  return (
    <div style={CMS_STYLE} className="min-h-dvh bg-fondo">
      {loaderData.authorized && loaderData.site ? (
        <Suspense
          fallback={
            <div className="grid min-h-dvh place-items-center">
              <Spinner label="Cargando el CMS" />
            </div>
          }
        >
          <Editor site={loaderData.site} owner={loaderData.owner} firstDoctor={loaderData.firstDoctor} recoveryEmail={loaderData.setup.recoveryEmail} />
        </Suspense>
      ) : (
        <Login setup={loaderData.setup} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Acceso */

function Login({ setup }: { setup: { ownerConfigured: boolean; recoveryEmail: boolean; databaseBinding: boolean } }) {
  const root = useRootData();
  const revalidator = useRevalidator();
  const [recover, setRecover] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      await api("/api/auth/login", { body: { email: form.get("email"), password: form.get("password") } });
      const s = await api<{ authorized: boolean }>("/api/cms/session").catch(() => ({ authorized: false }));
      if (!s.authorized) throw new Error("Estas credenciales no son las de administración del CMS.");
      revalidator.revalidate();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="card w-full max-w-md p-6 sm:p-8">
        <img src="/assets/buscadr-logo.png" alt="buscaDR" className="h-9 w-auto" width={141} height={36} />
        <p className="label-eyebrow mt-6">Acceso exclusivo</p>
        <h1 className="mt-1 text-3xl font-extrabold">CMS Maestro</h1>
        <p className="mt-2 text-sm muted">Solo para el propietario de buscaDR (elemente.digital@gmail.com). Entra con tu correo y tu contraseña.</p>
        {!setup.ownerConfigured && (
          <div className="mt-4">
            <Notice tone="warning" title="Falta la contraseña inicial">
              Crea el secreto BUSCADR_ADMIN_PASSWORD (12+ caracteres) en Cloudflare → Workers &amp; Pages → buscadr → Settings → Variables and Secrets. Después
              podrás cambiarla desde el CMS.
            </Notice>
          </div>
        )}
        {root?.user && !root.user.cms && (
          <div className="mt-4">
            <Notice>Tu sesión actual ({root.user.email}) no tiene acceso al CMS.</Notice>
          </div>
        )}
        {recover ? (
          <RecoverForm onBack={() => setRecover(false)} />
        ) : (
          <form onSubmit={submit}>
            <div className="mt-5 space-y-3">
              <label className="field">
                Correo del propietario
                <input className="input" type="email" name="email" autoComplete="username" required />
              </label>
              <div className="field">
                <label htmlFor="cms-pass">Contraseña</label>
                <PasswordInput id="cms-pass" name="password" autoComplete="current-password" minLength={12} />
              </div>
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm font-medium text-alerta-ink">
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary mt-5 w-full" disabled={busy}>
              {busy ? <Spinner label="Entrando" /> : <Icon name="lock" className="size-4" />} Entrar al CMS
            </button>
            <button type="button" className="mt-3 text-sm font-semibold text-azul underline-offset-2 hover:underline" onClick={() => setRecover(true)}>
              ¿Olvidaste tu contraseña?
            </button>
          </form>
        )}
        <Link to="/" className="mt-4 block text-sm font-semibold text-azul">
          ← Volver a buscaDR
        </Link>
      </div>
    </main>
  );
}
