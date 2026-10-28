/**
 * Panel del profesional: cada médico, especialista, clínica o servicio médico registrado tiene su
 * propio espacio de citas (agenda, calendario, solicitudes, horarios, perfil, ingresos y plan).
 */
import { useState } from "react";
import { NavLink, Outlet, redirect, useNavigate } from "react-router";
import { SpecialtyOptions } from "../../components/Specialties";
import { Icon } from "../../components/Icon";
import { Avatar, Notice, PROFILE_STATUS, StatusBadge } from "../../components/ui";
import { type ApiError, api } from "../../lib/api";
import { serverApiSafe } from "../../lib/api.server";
import type { ProMe } from "../../lib/pro";
import { useRootData } from "../../root";
import type { Route } from "./+types/_layout";

export const meta: Route.MetaFunction = () => [{ title: "Mi consultorio · buscaDR" }, { name: "robots", content: "noindex" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const me = await serverApiSafe<{ user: unknown }>(context, request, "/api/auth/me", { user: null });
  if (!me.user) throw redirect(`/cuenta?tab=registro&rol=pro&next=${encodeURIComponent(new URL(request.url).pathname)}`);
  return serverApiSafe<ProMe>(context, request, "/api/pro/me", { practitioner: null, rules: [], blocks: [] });
}

const LINKS = [
  ["/panel", "Resumen", "chart", true],
  ["/panel/agenda", "Agenda", "agenda", false],
  ["/panel/horarios", "Horarios", "clock", false],
  ["/panel/perfil", "Perfil y tarifas", "user-doctor", false],
  ["/panel/ingresos", "Ingresos", "wallet", false],
  ["/panel/plan", "Plan", "regular:gem", false],
] as const;

function Onboarding() {
  const root = useRootData();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api("/api/pro/me", {
        body: { kind: f.get("kind"), title: f.get("title"), display_name: f.get("display_name"), specialty: f.get("specialty"), city: f.get("city") },
      });
      navigate("/panel/perfil?nuevo=1");
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="bg-brand-dark overflow-hidden rounded-[2rem] p-6 text-white sm:p-8">
        <p className="text-xs font-bold tracking-[0.14em] text-[#6ee7b7] uppercase">buscaDR para profesionales</p>
        <h1 className="mt-2 text-3xl font-extrabold text-white sm:text-4xl">Activa tu consultorio en línea</h1>
        <p className="mt-3 text-white/85">
          Crea tu perfil, publica tus horarios con tarifa presencial y virtual, y recibe citas que confirmas desde tu panel o desde WhatsApp.
        </p>
        <ul className="mt-5 space-y-2 text-sm">
          {[
            "Agenda y calendario de citas",
            "Confirmación por WhatsApp",
            "Consultas virtuales con videollamada",
            "Cobros en línea registrados",
            "Verificación gratuita de credenciales",
          ].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <Icon name="check-circle" className="size-4 text-[#6ee7b7]" /> {t}
            </li>
          ))}
        </ul>
        <img src="/assets/fotos/profesional.webp" alt="" className="mt-6 hidden w-full rounded-2xl object-cover sm:block" loading="lazy" />
      </div>
      <form onSubmit={create} className="card grid h-fit gap-4 p-6">
        <h2 className="text-xl font-extrabold">Crea tu perfil profesional</h2>
        <label className="field">
          Tipo de perfil
          <select name="kind" className="input" defaultValue="medico">
            <option value="medico">Médico/a</option>
            <option value="especialista">Especialista</option>
            <option value="clinica">Clínica o centro médico</option>
            <option value="servicio">Servicio médico (laboratorio, terapia…)</option>
          </select>
        </label>
        <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
          <label className="field">
            Título
            <select name="title" className="input" defaultValue="Dr.">
              {["", "Dr.", "Dra.", "Lic.", "Psic.", "Od.", "Nut.", "Ft."].map((t) => (
                <option key={t} value={t}>
                  {t || "Ninguno"}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Nombre público
            <input name="display_name" className="input" required minLength={3} maxLength={80} defaultValue={root?.user?.name} />
          </label>
        </div>
        <label className="field">
          Especialidad
          <select name="specialty" className="input" required defaultValue="">
            <option value="" disabled>
              Elige tu especialidad
            </option>
            <SpecialtyOptions catalog={root?.catalog} />
          </select>
        </label>
        <label className="field">
          Ciudad
          <select name="city" className="input" defaultValue={root?.user?.city || "Guayaquil"}>
            {root?.catalog.cities.map((c) => (
              <option key={c.slug}>{c.name}</option>
            ))}
          </select>
        </label>
        {error && <Notice tone="danger">{error}</Notice>}
        <button type="submit" className="btn-primary" disabled={busy}>
          Crear mi perfil <Icon name="arrow" className="size-4" />
        </button>
        <p className="text-xs muted">Gratis. Podrás completar tarifas, horarios y credenciales antes de publicar.</p>
      </form>
    </div>
  );
}

export default function PanelLayout({ loaderData }: Route.ComponentProps) {
  const p = loaderData.practitioner;
  if (!p)
    return (
      <div className="container-page pt-6 pb-8">
        <Onboarding />
      </div>
    );
  return (
    <div className="container-page grid grid-cols-1 gap-6 pt-6 pb-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start" aria-label="Menú del consultorio">
        <div className="bg-brand hidden rounded-[var(--radius-card)] p-4 text-white lg:block">
          <div className="flex items-center gap-3">
            <Avatar name={p.name} photo={p.photo} size={48} rounded="xl" />
            <div className="min-w-0">
              <p className="truncate font-bold">{p.name}</p>
              <p className="truncate text-xs text-white/85">{p.specialty_name}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <StatusBadge status={p.status} label={PROFILE_STATUS[p.status] ?? p.status} />
            {p.verified && <StatusBadge status="active" label="Verificado" />}
          </div>
        </div>
        <nav className="scroll-row mt-0 lg:mx-0 lg:mt-3 lg:flex-col lg:overflow-visible lg:px-0">
          {LINKS.map(([to, label, icon, end]) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex min-h-11 shrink-0 items-center gap-2.5 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap lg:rounded-xl ${isActive ? "bg-azul text-white" : "bg-white text-tinta ring-1 ring-tinta/10 hover:ring-azul/40 lg:bg-transparent lg:ring-0 lg:hover:bg-white"}`
              }
            >
              <Icon name={icon} className="size-4" /> {label}
            </NavLink>
          ))}
          <NavLink
            to={`/doctor/${p.slug}`}
            className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-full bg-white px-4 py-2 text-sm font-semibold whitespace-nowrap text-tinta ring-1 ring-tinta/10 lg:rounded-xl lg:bg-transparent lg:ring-0 lg:hover:bg-white"
          >
            <Icon name="eye" className="size-4" /> Ver mi perfil público
          </NavLink>
        </nav>
      </aside>
      <div className="min-w-0">
        {p.status !== "active" && (
          <div className="mb-4">
            <Notice tone={p.status === "rejected" ? "danger" : "warning"} title={`Perfil ${PROFILE_STATUS[p.status]?.toLowerCase() ?? p.status}`}>
              {p.status === "review"
                ? "buscaDR está revisando tus credenciales. Te avisaremos cuando tu perfil esté publicado."
                : p.status === "rejected"
                  ? `Revisa: ${p.review_note || "datos del perfil"}. Corrige y vuelve a enviarlo desde «Perfil y tarifas».`
                  : p.status === "paused"
                    ? "Tu perfil está pausado: los pacientes no pueden reservar."
                    : "Completa tu perfil, tarifas y horarios, y envíalo a verificación para publicarlo."}
            </Notice>
          </div>
        )}
        <Outlet />
      </div>
    </div>
  );
}
