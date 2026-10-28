import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { CmsIcon, Icon } from "../components/Icon";
import { isIconName } from "../lib/icons";
import { api } from "../lib/api";
import { useRootData } from "../root";

const MOBILE_NAV = [
  { to: "/", key: "inicio", label: "Inicio", end: true },
  { to: "/explorar", key: "explorar", label: "Explorar" },
  { to: "/publicar", key: "publicar", label: "Publicar", primary: true },
  { to: "/reservas", key: "reservas", label: "Reservas" },
  { to: "/cuenta", key: "cuenta", label: "Cuenta" },
] as const;

/** Activo = versión sólida del icono de contorno elegido en el CMS (si existe). */
const activeIcon = (name: string) => {
  const solid = name.startsWith("regular:") ? name.slice(8) : name;
  return isIconName(solid) ? solid : name;
};

export default function Shell() {
  const data = useRootData();
  const user = data?.user;
  const cms = data?.cms;
  const location = useLocation();
  const [menu, setMenu] = useState(false);
  const [notice, setNotice] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem("buscadr-notice-closed") === "1") setNotice(false);
    } catch {}
  }, []);
  const closeNotice = () => {
    setNotice(false);
    try {
      localStorage.setItem("buscadr-notice-closed", "1");
    } catch {}
  };

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.assign("/");
  }

  const icons = cms?.navigation.icons ?? {
    inicio: "regular:house",
    explorar: "magnifying-glass",
    publicar: "plus",
    reservas: "regular:calendar",
    favoritos: "regular:heart",
    panel: "toolbox",
    cuenta: "regular:user",
  };

  const nav = [
    { to: "/explorar", label: cms?.navigation.explorar ?? "Explorar", cmsPath: "navigation.explorar" },
    { to: "/como-funciona", label: "Cómo funciona", cmsPath: undefined },
    { to: "/reservas", label: cms?.navigation.reservas ?? "Reservas", cmsPath: "navigation.reservas" },
    { to: "/panel", label: cms?.navigation.panel ?? "Mis equipos", cmsPath: "navigation.panel" },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2"
      >
        Saltar al contenido
      </a>
      {notice && (
        <div className="relative bg-morado py-1.5 pl-4 pr-11 text-center text-xs text-white sm:px-10">
          <span className="line-clamp-2 sm:line-clamp-none">
            <span data-cms="copy.pilotNotice">{cms?.copy.pilotNotice}</span>{" "}
            <Link to="/como-funciona#piloto" className="font-semibold underline underline-offset-2">
              Qué significa
            </Link>
          </span>
          <button
            type="button"
            onClick={closeNotice}
            className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-white/85 hover:bg-white/10 hover:text-white"
            aria-label="Cerrar aviso"
          >
            <Icon name="xmark" className="size-3.5" />
          </button>
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-black/5 bg-white/90 backdrop-blur">
        <div className="container-page flex h-16 items-center gap-3">
          <Link to="/" className="flex shrink-0 items-center" aria-label="buscaDR, inicio">
            <img src={cms?.theme.logo || "/assets/buscadr-logo.png"} alt="buscaDR" className="h-8 w-auto" width={126} height={32} data-cms="theme.logo" />
          </Link>
          <nav className="ml-6 hidden items-center gap-1 lg:flex" aria-label="Principal">
            {nav.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                data-cms={l.cmsPath}
                className={({ isActive }) => `rounded-full px-3 py-2 text-sm font-semibold ${isActive ? "bg-lila text-morado" : "text-tinta hover:bg-black/5"}`}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/publicar" className="btn-outline hidden sm:inline-flex" data-cms="navigation.publicar">
              <Icon name="plus" className="size-4" /> {cms?.navigation.publicar ?? "Publicar"}
            </Link>
            {user && (
              <Link to="/reservas" className="icon-btn size-10 shadow-none" aria-label="Avisos y reservas">
                <Icon name="regular:bell" className="size-[18px]" />
              </Link>
            )}
            {user ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenu((v) => !v)}
                  aria-expanded={menu}
                  aria-haspopup="menu"
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-morado font-display font-bold text-white ring-2 ring-white"
                >
                  <span className="sr-only">Mi cuenta: </span>
                  {user.name.slice(0, 1).toUpperCase()}
                </button>
                {menu && (
                  <div
                    role="menu"
                    className="card absolute right-0 top-12 z-40 w-64 max-w-[calc(100vw-2rem)] p-2 text-sm"
                    onClick={() => setMenu(false)}
                    onKeyDown={(e) => e.key === "Escape" && setMenu(false)}
                  >
                    <p className="truncate px-3 pt-2 font-semibold">{user.name}</p>
                    <p className="truncate px-3 pb-2 text-xs muted">{user.email}</p>
                    {(
                      [
                        ["/reservas", "Mis reservas", icons.reservas],
                        ["/panel", "Mis equipos e ingresos", icons.panel],
                        ["/favoritos", "Favoritos", icons.favoritos],
                        ["/cuenta", "Mi cuenta y WhatsApp", icons.cuenta],
                      ] as const
                    ).map(([to, label, icon]) => (
                      <Link key={to} role="menuitem" to={to} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-black/5">
                        <CmsIcon value={icon} className="size-4 text-morado" /> {label}
                      </Link>
                    ))}
                    {/* Solo la cuenta del propietario (verificada en el servidor) ve estos accesos. */}
                    {user.admin && (
                      <div className="mt-1 border-t border-black/5 pt-1">
                        <Link role="menuitem" to="/admin" className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-black/5">
                          <Icon name="chart-column" className="size-4 text-morado" /> Administración y KPIs
                        </Link>
                        <a role="menuitem" href="/maestro" className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-black/5">
                          <Icon name="wand-magic-sparkles" className="size-4 text-morado" /> CMS Maestro
                        </a>
                      </div>
                    )}
                    <button
                      role="menuitem"
                      type="button"
                      onClick={logout}
                      className="mt-1 flex w-full items-center gap-3 rounded-lg border-t border-black/5 px-3 py-2.5 text-left hover:bg-black/5"
                    >
                      <Icon name="logout" className="size-4 text-morado" /> Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link to={`/cuenta?next=${encodeURIComponent(location.pathname + location.search)}`} className="btn-ghost hidden px-3 sm:inline-flex">
                  Entrar
                </Link>
                <Link to="/cuenta?tab=registro" className="btn-primary min-h-10 px-4 text-sm sm:min-h-11 sm:text-[15px]">
                  Regístrate
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="contenido" tabIndex={-1} className="flex-1 pb-28 lg:pb-12">
        <Outlet />
      </main>

      <footer className="border-t border-black/5 bg-white py-10 text-sm">
        <div className="container-page grid gap-8 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div>
            <img src={cms?.theme.logo || "/assets/buscadr-logo.png"} alt="buscaDR" className="h-8 w-auto" width={126} height={32} />
            <p className="mt-3 max-w-xs muted" data-cms="copy.footer">
              {cms?.copy.footer}
            </p>
          </div>
          <nav aria-label="Alquilar" className="flex flex-col gap-2">
            <p className="font-semibold">Alquilar</p>
            <Link to="/explorar" className="muted hover:text-morado">
              Explorar equipos
            </Link>
            <Link to="/alquiler/guayaquil/construccion" className="muted hover:text-morado">
              Herramientas en Guayaquil
            </Link>
            <Link to="/alquiler/samborondon/eventos" className="muted hover:text-morado">
              Equipos para eventos en Samborondón
            </Link>
            <Link to="/alquiler/daule/energia" className="muted hover:text-morado">
              Energía portátil en Daule
            </Link>
          </nav>
          <nav aria-label="Publicar" className="flex flex-col gap-2">
            <p className="font-semibold">Publicar</p>
            <Link to="/publicar" className="muted hover:text-morado">
              Publicar un equipo
            </Link>
            <Link to="/como-funciona#propietarios" className="muted hover:text-morado">
              Tarifas y comisiones
            </Link>
            <Link to="/como-funciona#prohibidos" className="muted hover:text-morado">
              Equipos no admitidos
            </Link>
          </nav>
          <nav aria-label="buscaDR" className="flex flex-col gap-2">
            <p className="font-semibold">buscaDR</p>
            <Link to="/como-funciona" className="muted hover:text-morado">
              Cómo funciona
            </Link>
            <Link to="/como-funciona#seguridad" className="muted hover:text-morado">
              Confianza y seguridad
            </Link>
            <span className="muted">Términos y privacidad: en revisión legal</span>
          </nav>
          <p className="text-xs muted md:col-span-4">
            Piloto buscaDR. Disponibilidad sujeta a oferta en tu zona. Valores en USD. Fotografía ilustrativa en anuncios de muestra. Ante una emergencia llama al
            ECU 911.
          </p>
        </div>
      </footer>

      <nav
        aria-label="Navegación móvil"
        className="fixed inset-x-3 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-30 rounded-[1.75rem] bg-white/95 shadow-[0_10px_30px_rgb(28_26_58/0.16)] ring-1 ring-black/5 backdrop-blur lg:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5 px-1.5 py-1.5">
          {MOBILE_NAV.map((n) => (
            <li key={n.to} className="min-w-0">
              <NavLink
                to={n.to}
                end={"end" in n ? n.end : undefined}
                data-cms={`navigation.${n.key}`}
                className={({ isActive }) =>
                  `flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 text-[11px] font-semibold leading-none ${isActive ? "text-morado" : "text-gris"}`
                }
              >
                {({ isActive }) => (
                  <>
                    {"primary" in n ? (
                      <span className="grid size-10 place-items-center rounded-full bg-morado text-white shadow-md">
                        <CmsIcon value={icons[n.key]} className="size-5" fallback="plus" />
                      </span>
                    ) : (
                      <span className={`grid h-8 w-12 place-items-center rounded-full transition ${isActive ? "bg-lila" : ""}`}>
                        <CmsIcon value={isActive ? activeIcon(icons[n.key]) : icons[n.key]} className="size-5" />
                      </span>
                    )}
                    <span className="w-full truncate text-center">{cms?.navigation[n.key] ?? n.label}</span>
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
