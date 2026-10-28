import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { CmsIcon, Icon } from "../components/Icon";
import { Avatar } from "../components/ui";
import { api } from "../lib/api";
import { isIconName } from "../lib/icons";
import type { Notification } from "../lib/types";
import { useRootData } from "../root";

/** Activo = versión sólida del ícono de contorno elegido en el CMS (si existe). */
const activeIcon = (name: string) => {
  const solid = name.startsWith("regular:") ? name.slice(8) : name;
  return isIconName(solid) ? solid : name;
};

function Bell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const location = useLocation();
  useEffect(() => {
    void location.pathname;
    api<{ items: Notification[]; unread: number }>("/api/me/notifications")
      .then((r) => {
        setItems(r.items);
        setUnread(r.unread);
      })
      .catch(() => {});
  }, [location.pathname]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: cierra el panel al navegar
  useEffect(() => setOpen(false), [location.pathname]);
  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread) {
      setUnread(0);
      await api("/api/me/notifications/read", { method: "POST" }).catch(() => {});
    }
  }
  return (
    <div className="relative">
      <button type="button" onClick={toggle} className="icon-btn size-10" aria-expanded={open} aria-label={`Avisos${unread ? `: ${unread} sin leer` : ""}`}>
        <Icon name="bell" className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-full bg-[#e11d48] px-1 text-[10px] leading-5 font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="card absolute right-0 top-12 z-40 w-[22rem] max-w-[calc(100vw-2rem)] p-2" role="dialog" aria-label="Avisos">
          <div className="flex items-center justify-between px-3 py-2">
            <p className="font-display font-bold">Avisos</p>
            <Link to="/notificaciones" className="text-sm font-semibold text-azul">
              Ver todos
            </Link>
          </div>
          {!items?.length ? (
            <p className="px-3 pb-3 text-sm muted">Aquí verás confirmaciones, recordatorios y cambios de tus citas.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.slice(0, 8).map((n) => (
                <li key={n.id}>
                  <Link to={n.link || "/notificaciones"} className="flex gap-3 rounded-xl px-3 py-2.5 hover:bg-fondo">
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-azul"}`} aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{n.title}</span>
                      <span className="line-clamp-2 block text-xs muted">{n.body}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function Shell() {
  const data = useRootData();
  const user = data?.user;
  const cms = data?.cms;
  const location = useLocation();
  const [menu, setMenu] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: cierra el menú al navegar
  useEffect(() => setMenu(false), [location.pathname]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.assign("/");
  }

  const icons = cms?.navigation.icons ?? {
    inicio: "house",
    buscar: "magnifying-glass",
    citas: "regular:calendar-check",
    favoritos: "regular:heart",
    panel: "stethoscope",
    cuenta: "regular:user",
  };
  const isPro = user?.role === "pro";
  const mobileNav = [
    { to: "/", key: "inicio" as const, end: true },
    { to: "/buscar", key: "buscar" as const },
    { to: isPro ? "/panel/agenda" : "/citas", key: (isPro ? "panel" : "citas") as "panel" | "citas" },
    { to: "/favoritos", key: "favoritos" as const },
    { to: "/cuenta", key: "cuenta" as const },
  ];
  const nav = [
    { to: "/buscar", label: cms?.navigation.buscar ?? "Buscar", cmsPath: "navigation.buscar" },
    { to: "/especialidades", label: "Especialidades", cmsPath: undefined },
    { to: "/para-profesionales", label: "Para profesionales", cmsPath: undefined },
    { to: "/planes", label: "Planes", cmsPath: undefined },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2"
      >
        Saltar al contenido
      </a>
      <aside aria-label="Aviso de emergencias" className="bg-tinta px-4 py-1.5 text-center text-xs text-white">
        <span data-cms="copy.emergencyNotice">{cms?.copy.emergencyNotice ?? "buscaDR no atiende emergencias. Ante una urgencia llama al 911."}</span>{" "}
        <a href="tel:911" className="font-bold whitespace-nowrap underline underline-offset-2">
          Llamar al 911
        </a>
      </aside>
      <header className="sticky top-0 z-30 border-b border-tinta/5 bg-white/90 backdrop-blur">
        <div className="container-page flex h-16 items-center gap-3">
          <Link to="/" className="flex shrink-0 items-center" aria-label="buscaDR, inicio">
            <img
              src={cms?.theme.logo || "/assets/buscadr-logo.png"}
              alt="buscaDR"
              className="h-9 w-auto sm:h-10"
              width={120}
              height={40}
              data-cms="theme.logo"
            />
          </Link>
          <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Principal">
            {nav.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                data-cms={l.cmsPath}
                className={({ isActive }) =>
                  `rounded-full px-3 py-2 text-sm font-semibold ${isActive ? "bg-celeste text-azul-ink" : "text-tinta hover:bg-tinta/5"}`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            {user && (
              <Link to={isPro ? "/panel/agenda" : "/citas"} className="btn-outline btn-sm hidden md:inline-flex">
                <Icon name={isPro ? "agenda" : "calendar-check"} className="size-4" />
                {isPro ? "Mi agenda" : (cms?.navigation.citas ?? "Mis citas")}
              </Link>
            )}
            {user && <Bell />}
            {user ? (
              <div className="relative">
                <button type="button" onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-haspopup="menu" className="rounded-full">
                  <span className="sr-only">Mi cuenta</span>
                  <Avatar name={user.name} photo={user.avatar} size={40} />
                </button>
                {menu && (
                  <div
                    role="menu"
                    className="card absolute right-0 top-12 z-40 w-72 max-w-[calc(100vw-2rem)] p-2 text-sm"
                    onKeyDown={(e) => e.key === "Escape" && setMenu(false)}
                  >
                    <p className="truncate px-3 pt-2 font-semibold">{user.name}</p>
                    <p className="truncate px-3 pb-2 text-xs muted">{user.email}</p>
                    {(
                      [
                        ...(isPro
                          ? ([
                              ["/panel", "Mi consultorio", icons.panel],
                              ["/panel/agenda", "Agenda y calendario", "agenda"],
                              ["/panel/ingresos", "Ingresos y pagos", "wallet"],
                            ] as const)
                          : []),
                        ["/citas", "Mis citas", icons.citas],
                        ["/favoritos", "Favoritos", icons.favoritos],
                        ["/cuenta", "Mi cuenta y WhatsApp", icons.cuenta],
                      ] as const
                    ).map(([to, label, icon]) => (
                      <Link key={to} role="menuitem" to={to} className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 hover:bg-fondo">
                        <CmsIcon value={icon} className="size-4 text-azul" /> {label}
                      </Link>
                    ))}
                    {!isPro && (
                      <Link role="menuitem" to="/panel" className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 hover:bg-fondo">
                        <Icon name="stethoscope" className="size-4 text-azul" /> Soy profesional de la salud
                      </Link>
                    )}
                    {/* Solo la cuenta del propietario (verificada en el servidor) ve estos accesos. */}
                    {user.cms && (
                      <div className="mt-1 border-t border-tinta/5 pt-1">
                        <Link role="menuitem" to="/admin" className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 hover:bg-fondo">
                          <Icon name="chart" className="size-4 text-azul" /> Administración y KPIs
                        </Link>
                        <a role="menuitem" href="/maestro" className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 hover:bg-fondo">
                          <Icon name="sparkles" className="size-4 text-azul" /> CMS Maestro
                        </a>
                      </div>
                    )}
                    <button
                      role="menuitem"
                      type="button"
                      onClick={logout}
                      className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-lg border-t border-tinta/5 px-3 py-2 text-left hover:bg-fondo"
                    >
                      <Icon name="logout" className="size-4 text-azul" /> Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link to={`/cuenta?next=${encodeURIComponent(location.pathname + location.search)}`} className="btn-ghost btn-sm hidden sm:inline-flex">
                  Ingresar
                </Link>
                <Link to="/cuenta?tab=registro" className="btn-primary btn-sm">
                  Crear cuenta
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="contenido" tabIndex={-1} className="flex-1 pb-28 lg:pb-12">
        <Outlet />
      </main>

      <footer className="bg-brand-dark pt-12 pb-32 text-sm text-white/85 lg:pb-12">
        <div className="container-page grid gap-8 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <img
              src={cms?.theme.logoDark || "/assets/buscadr-logo-blanco.png"}
              alt="buscaDR"
              className="h-11 w-auto"
              width={132}
              height={44}
              data-cms="theme.logoDark"
            />
            <p className="mt-3 max-w-xs" data-cms="copy.footer">
              {cms?.copy.footer}
            </p>
            <p className="mt-2 text-xs text-white/70" data-cms="copy.pilotNotice">
              {cms?.copy.pilotNotice}
            </p>
          </div>
          <nav aria-label="Pacientes" className="flex flex-col gap-2">
            <p className="font-semibold text-white">Pacientes</p>
            <Link to="/buscar" className="hover:text-white">
              Buscar profesionales
            </Link>
            <Link to="/buscar?modalidad=virtual" className="hover:text-white">
              Consultas virtuales
            </Link>
            <Link to="/medicos/guayaquil/pediatria" className="hover:text-white">
              Pediatras en Guayaquil
            </Link>
            <Link to="/medicos/samborondon/odontologia" className="hover:text-white">
              Odontólogos en Samborondón
            </Link>
          </nav>
          <nav aria-label="Profesionales" className="flex flex-col gap-2">
            <p className="font-semibold text-white">Profesionales y clínicas</p>
            <Link to="/para-profesionales" className="hover:text-white">
              Agenda en línea
            </Link>
            <Link to="/planes" className="hover:text-white">
              Planes y precios
            </Link>
            <Link to="/panel" className="hover:text-white">
              Mi consultorio
            </Link>
          </nav>
          <nav aria-label="buscaDR" className="flex flex-col gap-2">
            <p className="font-semibold text-white">buscaDR</p>
            <Link to="/como-funciona" className="hover:text-white">
              Cómo funciona
            </Link>
            <Link to="/privacidad" className="hover:text-white">
              Privacidad y términos
            </Link>
          </nav>
          <p className="border-t border-white/10 pt-6 text-xs text-white/70 md:col-span-4">
            © {new Date().getFullYear()} buscaDR · Ecuador. buscaDR conecta pacientes con profesionales; no diagnostica ni reemplaza la atención médica. Íconos:
            Font Awesome Free (CC BY 4.0).
          </p>
        </div>
      </footer>

      <nav
        aria-label="Navegación móvil"
        className="fixed inset-x-3 bottom-[max(0.6rem,env(safe-area-inset-bottom))] z-30 rounded-[2rem] bg-tinta/95 p-1.5 shadow-[var(--shadow-float)] backdrop-blur lg:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {mobileNav.map((n) => (
            <li key={n.to} className="min-w-0">
              <NavLink
                to={n.to}
                end={n.end}
                data-cms={`navigation.${n.key}`}
                className={({ isActive }) =>
                  `flex min-h-14 flex-col items-center justify-center gap-1 rounded-[1.6rem] px-0.5 text-[11px] leading-none font-semibold transition ${isActive ? "bg-white text-azul" : "text-white/80 hover:text-white"}`
                }
              >
                {({ isActive }) => (
                  <>
                    <CmsIcon value={isActive ? activeIcon(icons[n.key]) : icons[n.key]} className="size-5" />
                    <span className="w-full truncate px-0.5 text-center">{cms?.navigation[n.key] ?? n.key}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
