/** Enlace de recuperación del propietario: crea una contraseña nueva e inicia sesión en el CMS. */
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Icon } from "../components/Icon";
import { StrengthMeter } from "../components/maestro/access";
import { Notice, PasswordInput, Spinner } from "../components/ui";
import { api } from "../lib/api";
import type { Route } from "./+types/maestro-restablecer";

export const meta: Route.MetaFunction = () => [{ title: "Nueva contraseña · CMS Maestro · buscaDR" }, { name: "robots", content: "noindex, nofollow" }];

export default function Restablecer() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== repeat) return setError("Las contraseñas no coinciden.");
    setBusy(true);
    try {
      await api("/api/auth/owner/reset", { body: { token, password } });
      window.location.assign("/maestro");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-dvh place-items-center bg-fondo p-4">
      <form onSubmit={submit} className="card w-full max-w-md space-y-4 p-6 sm:p-8">
        <img src="/assets/buscadr-logo.png" alt="buscaDR" className="h-9 w-auto" width={141} height={36} />
        <div>
          <p className="label-eyebrow">CMS Maestro</p>
          <h1 className="mt-1 text-2xl font-extrabold">Crea una contraseña nueva</h1>
          <p className="mt-1 text-sm muted">El enlace vale 30 minutos y un solo uso. Al guardar se cierran las demás sesiones.</p>
        </div>
        {!token && <Notice tone="warning">Falta el código del enlace. Ábrelo desde el correo que te enviamos o pide uno nuevo en /maestro.</Notice>}
        <div className="field">
          <label htmlFor="reset-pass">Contraseña nueva</label>
          <PasswordInput id="reset-pass" name="password" autoComplete="new-password" minLength={12} value={password} onChange={setPassword} />
          <StrengthMeter value={password} />
        </div>
        <div className="field">
          <label htmlFor="reset-repeat">Repite la contraseña</label>
          <PasswordInput id="reset-repeat" name="repeat" autoComplete="new-password" minLength={12} value={repeat} onChange={setRepeat} />
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        <button type="submit" className="btn-primary w-full" disabled={busy || !token || password.length < 12}>
          {busy ? <Spinner label="Guardando" /> : <Icon name="lock" className="size-4" />} Guardar y entrar al CMS
        </button>
        <Link to="/maestro" className="block text-sm font-semibold text-azul">
          ← Volver al acceso
        </Link>
      </form>
    </main>
  );
}
