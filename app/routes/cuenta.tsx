import { useId, useState } from "react";
import { Link, useRevalidator, useSearchParams } from "react-router";
import { GoogleButton } from "../components/account/GoogleButton";
import { CITY_OPTIONS, destinationFor } from "../components/account/redirect";
import { Icon } from "../components/Icon";
import { Notice, PageHeader, PasswordInput, Spinner } from "../components/ui";
import { ApiError, api } from "../lib/api";
import type { SessionUser } from "../lib/types";
import { useRootData } from "../root";
import type { Route } from "./+types/cuenta";

export const meta: Route.MetaFunction = () => [
  { title: "Mi cuenta · buscaDR" },
  { name: "description", content: "Entra o crea tu cuenta buscaDR para alquilar herramientas y equipos o publicar los tuyos en Guayaquil, Samborondón y Daule." },
  { name: "robots", content: "noindex" },
];

const ROLE_LABEL: Record<SessionUser["role"], string> = { renter: "Arrendatario", owner: "Propietario" };

function errorText(e: unknown) {
  if (e instanceof ApiError) {
    if (e.status === 429) return "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
    return e.message;
  }
  return "No se pudo completar la acción. Inténtalo de nuevo.";
}

export default function Cuenta() {
  const data = useRootData();
  const user = data?.user;
  return <div className="container-page max-w-3xl">{user ? <AccountView user={user} /> : <AuthView />}</div>;
}

/* ------------------------------ Sin sesión ------------------------------ */

function AuthView() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<"login" | "register">(params.get("tab") === "registro" || params.get("rol") === "propietario" ? "register" : "login");
  return (
    <>
      <PageHeader eyebrow="TU CUENTA buscaDR" title={tab === "login" ? "Entra a tu cuenta" : "Crea tu cuenta"}>
        Una sola cuenta para alquilar equipos cerca de ti y para publicar los tuyos.
      </PageHeader>
      <div role="tablist" aria-label="Acceso" className="mb-6 inline-flex rounded-full bg-white p-1 ring-1 ring-black/10">
        {(
          [
            ["login", "Entrar"],
            ["register", "Crear cuenta"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            onClick={() => setTab(key)}
            className={`min-h-11 rounded-full px-5 text-sm font-semibold ${tab === key ? "bg-morado text-white" : "text-tinta hover:bg-black/5"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "login" ? <LoginForm onSwitch={() => setTab("register")} /> : <RegisterForm onSwitch={() => setTab("login")} />}
      </div>
    </>
  );
}

function useGoogleAuth() {
  const data = useRootData();
  const [params] = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  async function send(credential: string, extra: Record<string, unknown>) {
    setMessage(null);
    try {
      const res = await api<{ user: SessionUser }>("/api/auth/google", { body: { credential, ...extra } });
      window.location.assign(destinationFor(res.user.role, params.get("next"), res.user.admin));
    } catch (e) {
      if (e instanceof ApiError && e.code === "GOOGLE_LINK_REQUIRED") {
        setMessage("Ese correo ya tiene una cuenta buscaDR. Entra con tu contraseña y luego vincula Google desde «Mi cuenta».");
      } else if (e instanceof ApiError && e.code === "GOOGLE_SIGNUP_REQUIRED") {
        setMessage("Todavía no tienes cuenta buscaDR con este Google. Ve a «Crear cuenta», elige tu perfil y acepta las condiciones.");
      } else setMessage(errorText(e));
    }
  }
  return { enabled: !!data?.google?.enabled && !!data.google.clientId, clientId: data?.google?.clientId ?? "", send, message };
}

function LoginForm({ onSwitch }: { onSwitch: () => void }) {
  const [params] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const google = useGoogleAuth();
  const id = useId();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ user: SessionUser }>("/api/auth/login", { body: { email: f.get("email"), password: f.get("password") } });
      window.location.assign(destinationFor(res.user.role, params.get("next"), res.user.admin));
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="card p-5 sm:p-8">
      <form onSubmit={submit} className="grid gap-4" noValidate={false}>
        <div className="field">
          <label htmlFor={`${id}-email`}>Correo electrónico</label>
          <input id={`${id}-email`} name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <div className="field">
          <label htmlFor={`${id}-pass`}>Contraseña</label>
          <PasswordInput id={`${id}-pass`} name="password" autoComplete="current-password" />
        </div>
        <div aria-live="assertive">
          {error && (
            <p role="alert" className="rounded-xl bg-alerta/5 px-4 py-3 text-sm text-alerta ring-1 ring-alerta/30">
              {error}
            </p>
          )}
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? <Spinner label="Entrando" /> : null} Entrar
        </button>
      </form>
      {google.enabled && (
        <div className="mt-6 border-t border-black/10 pt-6">
          <p className="mb-3 text-center text-sm muted">o continúa con</p>
          <GoogleButton clientId={google.clientId} onCredential={(c) => google.send(c, { intent: "login" })} />
          {google.message && (
            <p role="alert" className="mt-3 text-center text-sm">
              {google.message}
            </p>
          )}
        </div>
      )}
      <p className="mt-6 text-center text-sm muted">
        ¿Aún no tienes cuenta?{" "}
        <button type="button" onClick={onSwitch} className="font-semibold text-morado underline underline-offset-2">
          Créala gratis
        </button>
      </p>
    </div>
  );
}

function RegisterForm({ onSwitch }: { onSwitch: () => void }) {
  const [params] = useSearchParams();
  const [role, setRole] = useState<"renter" | "owner">(params.get("rol") === "propietario" ? "owner" : "renter");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [city, setCity] = useState<string>("Guayaquil");
  const google = useGoogleAuth();
  const id = useId();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (String(f.get("password") ?? "").length < 10) return setError("La contraseña necesita mínimo 10 caracteres.");
    if (!consent) return setError("Debes aceptar las condiciones del piloto y la política de privacidad.");
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ user: SessionUser }>("/api/auth/register", {
        body: {
          name: f.get("name"),
          email: f.get("email"),
          password: f.get("password"),
          role,
          city,
          phone: f.get("phone") || undefined,
          whatsapp_opt_in: f.get("whatsapp") === "on",
          referral: f.get("referral") || undefined,
          acceptTerms: true,
        },
      });
      window.location.assign(destinationFor(res.user.role, params.get("next") ?? (role === "owner" ? "/publicar" : null)));
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="card p-5 sm:p-8">
      <form onSubmit={submit} className="grid gap-5">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">¿Qué quieres hacer primero? (luego puedes hacer ambas)</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["renter", "Alquilar equipos", "Encuentra herramientas y equipos cerca de ti, por horas o días.", "search"],
                ["owner", "Publicar mis equipos", "Genera ingresos con lo que tienes guardado. Publicar es gratis.", "money"],
              ] as const
            ).map(([value, title, text, icon]) => (
              <label
                key={value}
                className={`card flex cursor-pointer gap-3 p-4 ring-2 transition ${role === value ? "ring-morado" : "ring-transparent hover:ring-morado/30"}`}
              >
                <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} className="sr-only" />
                <span className={`grid size-10 shrink-0 place-items-center rounded-full ${role === value ? "bg-morado text-white" : "bg-lila text-morado"}`}>
                  <Icon name={icon} className="size-5" />
                </span>
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="block text-sm muted">{text}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field sm:col-span-2">
            <label htmlFor={`${id}-name`}>Nombre y apellido</label>
            <input id={`${id}-name`} name="name" autoComplete="name" required minLength={2} maxLength={80} className="input" />
          </div>
          <div className="field">
            <label htmlFor={`${id}-email`}>Correo electrónico</label>
            <input id={`${id}-email`} name="email" type="email" autoComplete="email" required className="input" />
          </div>
          <div className="field">
            <label htmlFor={`${id}-pass`}>Contraseña (mínimo 10 caracteres)</label>
            <PasswordInput id={`${id}-pass`} name="password" autoComplete="new-password" minLength={10} />
          </div>
          <div className="field">
            <label htmlFor={`${id}-city`}>Ciudad</label>
            <select id={`${id}-city`} value={city} onChange={(e) => setCity(e.target.value)} className="input">
              {CITY_OPTIONS.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-phone`}>
              Celular <span className="font-normal muted">(para avisos por WhatsApp)</span>
            </label>
            <input id={`${id}-phone`} name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="09XXXXXXXX" maxLength={30} className="input" />
          </div>
          <div className="field sm:col-span-2">
            <label htmlFor={`${id}-ref`}>
              Código de invitación <span className="font-normal muted">(opcional)</span>
            </label>
            <input id={`${id}-ref`} name="referral" defaultValue={params.get("ref") ?? ""} maxLength={20} className="input uppercase" />
          </div>
        </div>

        <div className="grid gap-3 rounded-2xl bg-fondo p-4 text-sm">
          <label className="flex items-start gap-3">
            <input type="checkbox" name="whatsapp" className="mt-1 size-5 accent-[var(--color-morado)]" />
            <span>
              Acepto recibir avisos de mis reservas por <strong>WhatsApp</strong> (solicitudes, confirmaciones y recordatorios). Es opcional y puedo retirarlo
              cuando quiera desde «Mi cuenta».
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              required
              className="mt-1 size-5 accent-[var(--color-morado)]"
            />
            <span>
              Acepto las{" "}
              <Link to="/como-funciona#piloto" className="font-semibold text-morado underline underline-offset-2">
                condiciones del piloto y la política de privacidad
              </Link>
              : entorno de prueba en Guayaquil, Samborondón y Daule, sin cobros dentro de la plataforma. Soy mayor de 18 años.
            </span>
          </label>
        </div>

        <div aria-live="assertive">
          {error && (
            <p role="alert" className="rounded-xl bg-alerta/5 px-4 py-3 text-sm text-alerta ring-1 ring-alerta/30">
              {error}
            </p>
          )}
        </div>
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? <Spinner label="Creando cuenta" /> : null} {role === "owner" ? "Crear cuenta y publicar" : "Crear mi cuenta"}
        </button>
      </form>

      {google.enabled && (
        <div className="mt-6 border-t border-black/10 pt-6">
          <p className="mb-3 text-center text-sm muted">o regístrate con Google (usa el perfil y la ciudad elegidos arriba)</p>
          {consent ? (
            <GoogleButton
              clientId={google.clientId}
              text="signup_with"
              onCredential={(c) => google.send(c, { intent: "register", role, acceptTerms: true, city })}
            />
          ) : (
            <p className="text-center text-sm muted">Acepta las condiciones del piloto para habilitar el registro con Google.</p>
          )}
          {google.message && (
            <p role="alert" className="mt-3 text-center text-sm">
              {google.message}
            </p>
          )}
        </div>
      )}
      <p className="mt-6 text-center text-sm muted">
        ¿Ya tienes cuenta?{" "}
        <button type="button" onClick={onSwitch} className="font-semibold text-morado underline underline-offset-2">
          Entra aquí
        </button>
      </p>
    </div>
  );
}

/* ------------------------------ Con sesión ------------------------------ */

function AccountView({ user }: { user: SessionUser }) {
  const data = useRootData();
  const revalidator = useRevalidator();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [googleMsg, setGoogleMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const googleEnabled = !!data?.google?.enabled && !!data.google.clientId && !user.admin;
  const invite = user.referral_code ? `${data?.origin ?? ""}/cuenta?tab=registro&ref=${user.referral_code}` : null;

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setStatus(null);
    try {
      const res = await api<{ message: string }>("/api/auth/preferences", {
        method: "PATCH",
        body: {
          name: f.get("name"),
          phone: f.get("phone"),
          city: f.get("city"),
          sector: f.get("sector"),
          role: f.get("role"),
          whatsapp_opt_in: f.get("whatsapp") === "on",
        },
      });
      setStatus({ tone: "success", text: res.message });
      revalidator.revalidate();
    } catch (err) {
      setStatus({ tone: "danger", text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  async function exportData() {
    try {
      const json = await api("/api/auth/data-export");
      const url = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `buscadr-mis-datos-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setStatus({ tone: "danger", text: errorText(err) });
    }
  }

  async function linkGoogle(credential: string) {
    setGoogleMsg(null);
    try {
      const res = await api<{ message: string }>("/api/auth/google/link", { body: { credential } });
      setGoogleMsg(res.message);
    } catch (err) {
      setGoogleMsg(errorText(err));
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.assign("/");
  }

  return (
    <>
      <PageHeader eyebrow="TU CUENTA buscaDR" title={`Hola, ${user.name.split(" ")[0]}`}>
        Tus datos, tus avisos por WhatsApp y tu código de invitación.
      </PageHeader>

      <section aria-labelledby="perfil-titulo" className="card mb-6 flex flex-wrap items-center gap-4 p-5">
        <span className="grid size-14 place-items-center rounded-full bg-morado font-display text-xl font-bold text-white" aria-hidden>
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="perfil-titulo" className="truncate text-lg font-bold">
            {user.name}
          </h2>
          <p className="truncate text-sm muted">{user.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="chip bg-lila text-morado">{user.admin ? "Administración" : ROLE_LABEL[user.role]}</span>
          <span className="chip bg-gris-claro">
            <Icon name="pin" className="size-4" /> {user.city}
          </span>
        </div>
        <div className="flex w-full flex-wrap gap-2">
          <Link to="/reservas" className="btn-outline">
            Mis reservas
          </Link>
          <Link to="/panel" className="btn-outline">
            Mis equipos
          </Link>
          {user.admin && (
            <>
              <Link to="/admin" className="btn-primary">
                Administración <Icon name="arrow" className="size-4" />
              </Link>
              <a href="/maestro" className="btn-accent">
                CMS Maestro
              </a>
            </>
          )}
        </div>
      </section>

      <section id="whatsapp" aria-labelledby="pref-titulo" className="card mb-6 scroll-mt-24 p-5 sm:p-6">
        <h2 id="pref-titulo" className="text-xl font-bold">
          Datos y avisos por WhatsApp
        </h2>
        <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="field sm:col-span-2">
            <label htmlFor={`${id}-name`}>Nombre</label>
            <input id={`${id}-name`} name="name" defaultValue={user.name} required minLength={2} maxLength={80} className="input" />
          </div>
          <div className="field">
            <label htmlFor={`${id}-phone`}>Celular</label>
            <input
              id={`${id}-phone`}
              name="phone"
              type="tel"
              inputMode="tel"
              defaultValue={user.phone}
              placeholder="09XXXXXXXX"
              maxLength={30}
              className="input"
            />
          </div>
          <div className="field">
            <label htmlFor={`${id}-city`}>Ciudad</label>
            <select id={`${id}-city`} name="city" defaultValue={CITY_OPTIONS.includes(user.city as never) ? user.city : "Guayaquil"} className="input">
              {CITY_OPTIONS.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${id}-sector`}>Sector</label>
            <input
              id={`${id}-sector`}
              name="sector"
              defaultValue={user.sector}
              maxLength={60}
              className="input"
              placeholder="Urdesa, La Puntilla, Villa Club…"
            />
          </div>
          <div className="field">
            <label htmlFor={`${id}-role`}>Perfil principal</label>
            <select id={`${id}-role`} name="role" defaultValue={user.role} className="input">
              <option value="renter">Alquilo equipos</option>
              <option value="owner">Publico equipos</option>
            </select>
          </div>
          <label className="flex items-start gap-3 rounded-2xl bg-turquesa/10 p-4 text-sm sm:col-span-2">
            <input type="checkbox" name="whatsapp" defaultChecked={user.whatsapp_opt_in} className="mt-1 size-5 accent-[var(--color-morado)]" />
            <span>
              <strong>Avisos por WhatsApp.</strong> Recibe solicitudes con botones para aceptar o rechazar, confirmaciones y recordatorios de retiro. Puedes
              publicar enviando una foto al número de buscaDR. Guardamos tu decisión como registro de consentimiento; puedes retirarla cuando quieras.
            </span>
          </label>
          <div className="sm:col-span-2" aria-live="polite">
            {status && <Notice tone={status.tone}>{status.text}</Notice>}
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? <Spinner label="Guardando" /> : null} Guardar cambios
            </button>
          </div>
        </form>
      </section>

      {invite && (
        <section aria-labelledby="ref-titulo" className="card mb-6 p-5 sm:p-6">
          <h2 id="ref-titulo" className="text-xl font-bold">
            Invita a tus vecinos
          </h2>
          <p className="mt-1 text-sm muted">Comparte tu enlace. Registramos quién llegó por ti para futuros beneficios cuando completen su primer alquiler.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="rounded-xl bg-fondo px-3 py-2 font-mono text-lg font-bold tracking-wider">{user.referral_code}</code>
            <button
              type="button"
              className="btn-outline min-h-10 px-4 text-sm"
              onClick={() =>
                navigator.clipboard
                  .writeText(invite)
                  .then(() => setCopied(true))
                  .catch(() => {})
              }
            >
              <Icon name="share" className="size-4" /> {copied ? "¡Copiado!" : "Copiar enlace"}
            </button>
            <a
              className="btn-ghost min-h-10 px-4 text-sm"
              href={`https://wa.me/?text=${encodeURIComponent(`Te invito a buscaDR para alquilar herramientas y equipos cerca: ${invite}`)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="whatsapp" className="size-4" /> Compartir por WhatsApp
            </a>
          </div>
        </section>
      )}

      {googleEnabled && (
        <section aria-labelledby="google-titulo" className="card mb-6 p-5 sm:p-6">
          <h2 id="google-titulo" className="text-xl font-bold">
            Vincular Google
          </h2>
          <p className="mt-1 text-sm muted">Entra más rápido con tu cuenta de Google. Debe usar el mismo correo ({user.email}).</p>
          <div className="mt-4">
            <GoogleButton clientId={data!.google.clientId!} text="continue_with" onCredential={linkGoogle} />
          </div>
          <div aria-live="polite">{googleMsg && <p className="mt-3 text-center text-sm">{googleMsg}</p>}</div>
        </section>
      )}

      <section aria-labelledby="datos-titulo" className="card mb-6 p-5 sm:p-6">
        <h2 id="datos-titulo" className="text-xl font-bold">
          Tus datos personales
        </h2>
        <p className="mt-1 text-sm muted">
          Según la Ley Orgánica de Protección de Datos Personales puedes acceder a tus datos. Descarga una copia en JSON con tu perfil, consentimientos,
          anuncios, reservas, mensajes, reseñas y favoritos.
        </p>
        <button type="button" onClick={exportData} className="btn-outline mt-4">
          Descargar mis datos
        </button>
      </section>

      <button type="button" onClick={logout} className="btn-ghost mb-10">
        <Icon name="logout" className="size-4" /> Cerrar sesión
      </button>
    </>
  );
}
