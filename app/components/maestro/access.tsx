/**
 * Acceso del propietario al CMS: cambio de contraseña (queda como hash en D1 y cierra las demás
 * sesiones) y recuperación por correo con un enlace de un solo uso.
 */
import { useState } from "react";
import { api } from "../../lib/api";
import { Icon } from "../Icon";
import { Notice, PasswordInput, Spinner } from "../ui";
import { Section } from "./fields";

const MIN = 12;

function strength(p: string) {
  let n = 0;
  if (p.length >= MIN) n++;
  if (p.length >= 16) n++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) n++;
  if (/\d/.test(p)) n++;
  if (/[^A-Za-z0-9]/.test(p)) n++;
  return n;
}

export function StrengthMeter({ value }: { value: string }) {
  const s = strength(value);
  const label = !value ? "" : s <= 2 ? "Débil" : s === 3 ? "Aceptable" : "Fuerte";
  return (
    <div className="mt-1.5" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= s ? (s <= 2 ? "bg-alerta" : s === 3 ? "bg-azul" : "bg-turquesa") : "bg-gris-claro"}`} />
        ))}
      </div>
      <p className="mt-1 text-xs muted">
        {label ? `${label} · ` : ""}Mínimo {MIN} caracteres, combina letras con números o símbolos.
      </p>
    </div>
  );
}

export function Acceso({ email, recoveryEmail, notify }: { email: string; recoveryEmail: boolean; notify: (t: string, tone?: "ok" | "error") => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== repeat) return setError("Las contraseñas nuevas no coinciden.");
    setBusy(true);
    try {
      const res = await api<{ message: string }>("/api/auth/owner/password", { body: { current, next } });
      setCurrent("");
      setNext("");
      setRepeat("");
      notify(res.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <Section title="Cuenta del propietario" description="Solo esta cuenta ve y puede abrir el CMS Maestro y la administración. Ninguna otra cuenta tiene el acceso.">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Icon name="regular:envelope" className="size-4 text-morado" />
          <strong className="break-all">{email}</strong>
        </p>
        <div className="mt-3">
          {recoveryEmail ? (
            <Notice tone="success">La recuperación por correo está activa: «¿Olvidaste tu contraseña?» envía un enlace de un solo uso a este correo.</Notice>
          ) : (
            <Notice tone="warning" title="Recuperación por correo pendiente">
              Para recibir el enlace de recuperación en tu correo, agrega el secreto <code>RESEND_API_KEY</code> en Cloudflare (ver docs/CMS_MAESTRO.md).
            </Notice>
          )}
        </div>
      </Section>
      <Section title="Cambiar contraseña" description="La nueva contraseña se guarda cifrada (hash) en D1. Se cierran las demás sesiones abiertas.">
        <form onSubmit={submit} className="grid max-w-lg gap-4">
          <div className="field">
            <label htmlFor="owner-current">Contraseña actual</label>
            <PasswordInput id="owner-current" name="current" autoComplete="current-password" value={current} onChange={setCurrent} />
          </div>
          <div className="field">
            <label htmlFor="owner-next">Contraseña nueva</label>
            <PasswordInput id="owner-next" name="next" autoComplete="new-password" minLength={MIN} value={next} onChange={setNext} />
            <StrengthMeter value={next} />
          </div>
          <div className="field">
            <label htmlFor="owner-repeat">Repite la contraseña nueva</label>
            <PasswordInput id="owner-repeat" name="repeat" autoComplete="new-password" minLength={MIN} value={repeat} onChange={setRepeat} />
          </div>
          {error && <Notice tone="danger">{error}</Notice>}
          <button type="submit" className="btn-primary justify-self-start" disabled={busy || !current || next.length < MIN}>
            {busy ? <Spinner label="Guardando" /> : <Icon name="lock" className="size-4" />} Cambiar contraseña
          </button>
        </form>
      </Section>
    </div>
  );
}

/** «¿Olvidaste tu contraseña?» en la pantalla de acceso. */
export function RecoverForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api<{ message: string }>("/api/auth/owner/recover", { body: { email } });
      setMessage(res.message);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-5 space-y-3">
      <p className="text-sm muted">Escribe el correo del propietario. Si coincide, te enviamos un enlace para crear una contraseña nueva (vale 30 minutos).</p>
      <label className="field">
        Correo del propietario
        <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {message && <Notice>{message}</Notice>}
      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? <Spinner label="Enviando" /> : <Icon name="paper-plane" className="size-4" />} Enviar enlace
      </button>
      <button type="button" className="btn-ghost w-full" onClick={onBack}>
        Volver a iniciar sesión
      </button>
    </form>
  );
}
