import { useEffect, useState } from "react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, isRouteErrorResponse, useLocation, useNavigation, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/root";
import "./app.css";
import { IconLibraryContext } from "./components/Icon";
import { serverApiSafe } from "./lib/api.server";
import { notifyPreviewNavigation, startPreviewBridge, usePreviewCms } from "./lib/cms-preview";
import { fontAssets, themeStyle } from "./lib/theme";
import type { Catalog, Cms, SessionUser } from "./lib/types";

export async function loader({ request, context }: Route.LoaderArgs) {
  const [me, config, google, catalog] = await Promise.all([
    serverApiSafe<{ user: SessionUser | null }>(context, request, "/api/auth/me", { user: null }),
    serverApiSafe<{ config: Cms | null }>(context, request, "/api/public/config", { config: null }),
    serverApiSafe<{ enabled: boolean; clientId: string | null }>(context, request, "/api/auth/google/config", { enabled: false, clientId: null }),
    serverApiSafe<Catalog>(context, request, "/api/catalog", { specialties: [], cities: [], plans: [], fee_bps: 800, payments: "sandbox" }),
  ]);
  return { user: me.user, cms: config.config, google, catalog, origin: new URL(request.url).origin };
}

export type RootData = Awaited<ReturnType<typeof loader>>;

/** Datos globales. Dentro de la vista previa del CMS, el borrador reemplaza la versión publicada. */
export const useRootData = () => {
  const data = useRouteLoaderData<RootData>("root");
  const preview = usePreviewCms();
  return preview && data ? { ...data, cms: preview } : data;
};

export const links: Route.LinksFunction = () => [
  { rel: "apple-touch-icon", href: "/assets/app-icon-192.png" },
  { rel: "manifest", href: "/manifest.webmanifest" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRootData();
  const theme = data?.cms?.theme;
  const fonts = fontAssets(data?.cms);
  return (
    <html lang="es-EC" style={themeStyle(data?.cms)}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content={theme?.primary ?? "#0F62FE"} />
        <link rel="icon" href={theme?.favicon || "/assets/buscadr-isotipo.png"} />
        {fonts.links.length > 0 && <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />}
        {fonts.links.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: @font-face generado con familias y URL validadas por el servidor */}
        {fonts.css && <style dangerouslySetInnerHTML={{ __html: fonts.css }} />}
        <Meta />
        <Links />
      </head>
      <body className="min-h-dvh">
        <IconLibraryContext.Provider value={theme?.iconLibrary ?? {}}>{children}</IconLibraryContext.Provider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const location = useLocation();
  useEffect(() => {
    startPreviewBridge();
    // PWA: el service worker solo cachea recursos estáticos; nunca la API ni datos personales.
    if (import.meta.env.PROD && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  useEffect(() => notifyPreviewNavigation(location.pathname + location.search), [location.pathname, location.search]);
  return (
    <>
      <NavigationProgress />
      <Outlet />
    </>
  );
}

/**
 * Barra de progreso al cambiar de página: el SSR espera los datos del servidor antes de mostrar la
 * nueva página, y sin aviso visual un toque parece no haber funcionado. Aparece tras 150 ms para no
 * parpadear en navegaciones rápidas.
 */
function NavigationProgress() {
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!busy) return setVisible(false);
    const t = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(t);
  }, [busy]);
  return (
    <div role="progressbar" aria-label="Cargando la página" aria-hidden={!visible} className={`nav-progress ${visible ? "is-active" : ""}`}>
      <span />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Algo salió mal";
  let details = "Ocurrió un error inesperado. Intenta recargar la página.";
  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? "No encontramos esta página" : error.status === 403 ? "No tienes acceso" : `Error ${error.status}`;
    details = (error.data as { message?: string })?.message ?? details;
  } else if (import.meta.env.DEV && error instanceof Error) details = error.message;
  return (
    <main className="container-page grid min-h-[70dvh] place-items-center text-center">
      <div>
        <img src="/assets/buscadr-logo.png" alt="buscaDR" className="mx-auto h-12 w-auto" width={144} height={48} />
        <h1 className="mt-6 text-3xl font-extrabold">{title}</h1>
        <p className="mt-2 muted">{details}</p>
        <a href="/" className="btn-primary mt-6">
          Volver al inicio
        </a>
      </div>
    </main>
  );
}
