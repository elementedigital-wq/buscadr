/**
 * Acceso al CMS: cambio de contraseña (queda como hash en D1 y cierra las demás sesiones),
 * recuperación por correo con un enlace de un solo uso y, solo para el propietario, superusuarios
 * con acceso completo al CMS y a la administración (ADR 0018).
 */
import { useCallback, useEffect, useState } from "react";
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
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= s ? (s <= 2 ? "bg-alerta" : s === 3 ? "bg-azul" : "bg-verde") : "bg-gris-claro"}`} />
        ))}
      </div>
      <p className="mt-1 text-xs muted">
        {label ? `${label} · ` : ""}Mínimo {MIN} caracteres, combina letras con números o símbolos.
      </p>
    </div>
  );
}

export function Acceso({
  email,
  role,
  recoveryEmail,
  notify,
}: {
  email: string;
  role: "owner" | "superuser";
  recoveryEmail: boolean;
  notify: (t: string, tone?: "ok" | "error") => void;
}) {
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
      <Section
        title={role === "owner" ? "Cuenta del propietario" : "Tu cuenta de superusuario"}
        description={
          role === "owner"
            ? "El propietario y los superusuarios que agregues abajo son las únicas cuentas que abren el CMS Maestro y la administración."
            : "Tienes acceso completo al CMS Maestro y a la administración. Solo el propietario agrega o retira superusuarios."
        }
      >
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Icon name="regular:envelope" className="size-4 text-azul" />
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
      {role === "owner" && <Superusers notify={notify} />}
    </div>
  );
}

type Superuser = { id: string; email: string; name: string; created_at: number; last_session: number | null };

/** Solo el propietario: agregar y retirar superusuarios del CMS. */
function Superusers({ notify }: { notify: (t: string, tone?: "ok" | "error") => void }) {
  const [items, setItems] = useState<Superuser[] | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api<{ superusers: Superuser[] }>("/api/cms/superusers")
      .then((r) => setItems(r.superusers))
      .catch((e) => setError((e as Error).message));
  }, []);
  useEffect(load, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ superusers: Superuser[]; message: string }>("/api/cms/superusers", { body: { email, name, password } });
      setItems(r.superusers);
      setEmail("");
      setName("");
      setPassword("");
      notify(r.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(u: Superuser) {
    if (!confirm(`¿Retirar el acceso de ${u.email} al CMS y a la administración? Se cerrarán sus sesiones.`)) return;
    try {
      const r = await api<{ superusers: Superuser[]; message: string }>(`/api/cms/superusers/${u.id}`, { method: "DELETE" });
      setItems(r.superusers);
      notify(r.message);
    } catch (err) {
      notify((err as Error).message, "error");
    }
  }
  return (
    <Section
      title="Superusuarios"
      description="Cuentas con acceso completo al CMS Maestro y a la administración (no pueden agregar ni retirar superusuarios). Entran en /maestro con su correo y la contraseña que definas; luego pueden cambiarla o recuperarla por correo."
    >
      {!items ? (
        <Spinner />
      ) : items.length ? (
        <ul className="mb-4 divide-y divide-tinta/5 rounded-xl ring-1 ring-tinta/10">
          {items.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <span className="min-w-0">
                <span className="block font-semibold break-all">{u.email}</span>
                <span className="block text-xs muted">
                  {u.name} · {u.last_session ? `último acceso ${new Date(u.last_session).toLocaleString("es-EC")}` : "aún no ha entrado"}
                </span>
              </span>
              <button type="button" className="btn-outline btn-sm" onClick={() => remove(u)}>
                Retirar acceso
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm muted">Aún no hay superusuarios.</p>
      )}
      <form onSubmit={add} className="grid max-w-lg gap-4">
        <div className="field">
          <label htmlFor="su-email">Correo</label>
          <input id="su-email" type="email" className="input" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="su-name">Nombre</label>
          <input id="su-name" className="input" maxLength={80} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="su-pass">Contraseña inicial</label>
          <PasswordInput id="su-pass" name="su-pass" autoComplete="new-password" minLength={MIN} value={password} onChange={setPassword} />
          <StrengthMeter value={password} />
          <span className="text-xs muted">
            Mínimo {MIN} caracteres, con letras y números o símbolos. Se guarda cifrada (hash); compártela por un canal seguro.
          </span>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        <button type="submit" className="btn-primary justify-self-start" disabled={busy || !email || password.length < MIN}>
          {busy ? <Spinner label="Guardando" /> : <Icon name="user-plus" className="size-4" />} Agregar superusuario
        </button>
      </form>
    </Section>
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
