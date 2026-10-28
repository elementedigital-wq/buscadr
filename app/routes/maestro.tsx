/**
 * CMS Maestro (ADR 0007): editor del propietario integrado en la web, con vista previa en vivo
 * del sitio real. Borrador → publicar, con control de versiones. Solo el propietario configurado
 * en los secretos de Cloudflare puede entrar (la API lo verifica en cada llamada).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useRevalidator } from "react-router";
import { DEFAULT_CMS, normalizeCms } from "../../server/cms/model";
import { Icon } from "../components/Icon";
import { EditorContext } from "../components/maestro/fields";
import { MediaContext, useMediaStore } from "../components/maestro/media";
import { TABS, type TabId, contentWarnings, fieldId, setPath, tabForPath } from "../components/maestro/model";
import {
  Banners,
  Biblioteca,
  Categorias,
  Componentes,
  Historial,
  Marca,
  Permisos,
  Anuncios,
  Portada,
  Resenas,
  Resumen,
  Seo,
  Textos,
} from "../components/maestro/panels";
import { Preview } from "../components/maestro/Preview";
import { Acceso, RecoverForm } from "../components/maestro/access";
import { Notice, PasswordInput, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { serverApiSafe } from "../lib/api.server";
import { themeStyle } from "../lib/theme";
import type { Cms, PublicListing } from "../lib/types";
import { useRootData } from "../root";
import type { Route } from "./+types/maestro";

export const meta: Route.MetaFunction = () => [{ title: "CMS Maestro · buscaDR" }, { name: "robots", content: "noindex, nofollow, noarchive" }];

type Site = { draft: Cms; published: Cms; version: number; mediaStorage: "d1" | "r2" };

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
  const [site, listings] = await Promise.all([
    serverApiSafe<Site | null>(context, request, "/api/cms/site", null),
    serverApiSafe<{ items: PublicListing[] }>(context, request, "/api/listings?limit=1&log=0", { items: [] }),
  ]);
  return { authorized: true as const, setup, owner: session.user ?? null, site, firstListing: listings.items[0]?.slug ?? null };
}

/** El CMS conserva la paleta oficial aunque el sitio publicado use otra. */
const CMS_STYLE = themeStyle(normalizeCms(structuredClone(DEFAULT_CMS)));

export default function Maestro({ loaderData }: Route.ComponentProps) {
  return (
    <div style={CMS_STYLE} className="min-h-dvh bg-fondo">
      {loaderData.authorized && loaderData.site ? (
        <Editor site={loaderData.site} owner={loaderData.owner} firstListing={loaderData.firstListing} recoveryEmail={loaderData.setup.recoveryEmail} />
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
        <p className="mt-2 text-sm muted">Solo para el propietario de buscaDR. Entra con tu correo y tu contraseña.</p>
        {!setup.ownerConfigured && (
          <div className="mt-4">
            <Notice tone="warning" title="Falta la contraseña inicial">
              Crea el secreto BUSCADR_ADMIN_PASSWORD (12+ caracteres) en Cloudflare → Workers &amp; Pages → buscadr → Settings → Variables and Secrets.
              Después podrás cambiarla desde el CMS.
            </Notice>
          </div>
        )}
        {root?.user && !root.user.admin && (
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
              <p role="alert" className="mt-3 text-sm font-medium text-alerta">
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary mt-5 w-full" disabled={busy}>
              {busy ? <Spinner label="Entrando" /> : <Icon name="lock" className="size-4" />} Entrar al CMS
            </button>
            <button type="button" className="mt-3 text-sm font-semibold text-morado underline-offset-2 hover:underline" onClick={() => setRecover(true)}>
              ¿Olvidaste tu contraseña?
            </button>
          </form>
        )}
        <Link to="/" className="mt-4 block text-sm font-semibold text-morado">
          ← Volver a buscaDR
        </Link>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ Editor */

type Toast = { text: string; tone: "ok" | "error" } | null;

function Editor({
  site,
  owner,
  firstListing,
  recoveryEmail,
}: { site: Site; owner: { name: string; email: string } | null; firstListing: string | null; recoveryEmail: boolean }) {
  const [config, setConfig] = useState<Cms>(site.draft);
  const [saved, setSaved] = useState<string>(JSON.stringify(site.draft));
  const [version, setVersion] = useState(site.version);
  const [publishedJson, setPublishedJson] = useState(JSON.stringify(site.published));
  const [tab, setTab] = useState<TabId>("resumen");
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "publish" | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [showPreview, setShowPreview] = useState(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const notify = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    setToast({ text, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  const mediaStore = useMediaStore(notify);
  // En pantallas pequeñas la vista previa empieza oculta (se abre con «Ver vista previa»).
  useEffect(() => {
    if (!window.matchMedia("(min-width: 1280px)").matches) setShowPreview(false);
  }, []);

  const json = JSON.stringify(config);
  const dirty = json !== saved;
  const unpublished = saved !== publishedJson;
  const warnings = useMemo(() => contentWarnings(config), [config]);

  const update = useCallback((path: string, value: unknown) => {
    setConfig((c) => setPath(c, path, value));
  }, []);

  /** Lleva al campo: cambia de pestaña, hace scroll, lo enfoca y lo resalta. */
  const goTo = useCallback((nextTab: TabId, path?: string) => {
    const target = path ? tabForPath(path) : nextTab;
    setTab(target);
    setFocusPath(path ?? null);
    if (!path) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.getElementById(fieldId(path)) ?? document.querySelector(`[data-field="${CSS.escape(path)}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        if (el instanceof HTMLElement && "focus" in el) el.focus({ preventScroll: true });
      }),
    );
  }, []);
  const onFocusPath = useCallback((path: string) => goTo(tabForPath(path), path), [goTo]);

  async function save(): Promise<boolean> {
    setBusy("save");
    try {
      const res = await api<{ draft: Cms; version: number }>("/api/cms/site", { method: "PUT", body: { config, expectedVersion: version } });
      setConfig(res.draft);
      setSaved(JSON.stringify(res.draft));
      notify("Borrador guardado. Los visitantes aún no lo ven.");
      return true;
    } catch (e) {
      notify((e as Error).message, "error");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (warnings.length && !confirm(`Hay ${warnings.length} aviso(s) de contenido o contraste (ver Resumen). ¿Publicar de todos modos?`)) return;
    if (!confirm("¿Publicar estos cambios en el sitio para todos los visitantes?")) return;
    if (dirty && !(await save())) return;
    setBusy("publish");
    try {
      const res = await api<{ version: number }>("/api/cms/publish", { body: {} });
      setVersion(res.version);
      setPublishedJson(JSON.stringify(config));
      notify(`Publicado: versión ${res.version}. Ya está en producción.`);
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  function discard() {
    if (!confirm("¿Descartar los cambios sin guardar?")) return;
    setConfig(JSON.parse(saved));
  }

  // Ctrl/Cmd + S guarda; aviso al salir con cambios sin guardar.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current();
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (document.body.dataset.cmsDirty === "1") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, []);
  useEffect(() => {
    document.body.dataset.cmsDirty = dirty ? "1" : "0";
  }, [dirty]);

  async function logout() {
    if (dirty && !confirm("Tienes cambios sin guardar. ¿Salir igualmente?")) return;
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/";
  }

  const pages = [
    { label: "Inicio", path: "/" },
    { label: "Explorar", path: "/explorar" },
    { label: "Categorías", path: "/categorias" },
    ...(firstListing ? [{ label: "Ficha de un equipo", path: `/equipo/${firstListing}` }] : []),
    { label: "Cómo funciona", path: "/como-funciona" },
    { label: "Publicar", path: "/publicar" },
  ];

  const panel = (() => {
    switch (tab) {
      case "marca":
        return <Marca />;
      case "portada":
        return <Portada />;
      case "banners":
        return <Banners />;
      case "textos":
        return <Textos />;
      case "componentes":
        return <Componentes />;
      case "categorias":
        return <Categorias />;
      case "anuncios":
        return <Anuncios />;
      case "biblioteca":
        return <Biblioteca storage={site.mediaStorage} />;
      case "seo":
        return <Seo />;
      case "permisos":
        return <Permisos notify={notify} />;
      case "acceso":
        return <Acceso email={owner?.email ?? ""} recoveryEmail={recoveryEmail} notify={notify} />;
      case "resenas":
        return <Resenas notify={notify} />;
      case "historial":
        return (
          <Historial
            notify={notify}
            onRestored={(draft) => {
              setConfig(draft);
              setSaved(JSON.stringify(draft));
            }}
          />
        );
      default:
        return <Resumen version={version} dirty={dirty} onGo={goTo} />;
    }
  })();

  const contentTab = !["permisos", "resenas", "historial"].includes(tab);

  return (
    <EditorContext.Provider value={{ config, update, focusPath }}>
      <MediaContext.Provider value={mediaStore}>
        <div className="flex min-h-dvh flex-col lg:flex-row">
          {/* Navegación */}
          <aside className="bg-morado text-white lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:shrink-0 lg:overflow-y-auto">
            <div className="flex items-center gap-3 p-4">
              <img src="/assets/buscadr-isotipo.png" alt="" className="size-9 rounded-xl bg-white p-1" width={36} height={36} />
              <div>
                <p className="font-display font-extrabold leading-tight">CMS Maestro</p>
                <p className="text-xs text-white/75">{owner?.email}</p>
              </div>
            </div>
            <nav aria-label="Secciones del CMS" className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible">
              {(["Contenido", "Operación"] as const).map((group) => (
                <div key={group} className="contents lg:block">
                  <p className="hidden px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white/60 lg:block">{group}</p>
                  {TABS.filter((t) => t.group === group).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => goTo(t.id)}
                      data-tab={t.id}
                      aria-current={tab === t.id ? "page" : undefined}
                      className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold lg:w-full ${tab === t.id ? "bg-white text-morado" : "text-white/90 hover:bg-white/10"}`}
                    >
                      <Icon name={t.icon} className="size-4" /> {t.label}
                    </button>
                  ))}
                </div>
              ))}
            </nav>
            <div className="hidden space-y-1 p-3 lg:block">
              <a href="/" target="_blank" rel="noopener" className="block rounded-xl px-3 py-2 text-sm text-white/90 hover:bg-white/10">
                Ver sitio publicado ↗
              </a>
              <a href="/admin" className="block rounded-xl px-3 py-2 text-sm text-white/90 hover:bg-white/10">
                Administración y KPIs
              </a>
              <button type="button" onClick={logout} className="w-full rounded-xl px-3 py-2 text-left text-sm text-white/90 hover:bg-white/10">
                Cerrar sesión
              </button>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Barra de estado y acciones */}
            <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-black/5 bg-white/95 px-4 py-3 backdrop-blur">
              <div className="mr-auto">
                <h1 className="text-lg font-extrabold">{TABS.find((t) => t.id === tab)?.label}</h1>
                <p className="text-xs muted" aria-live="polite">
                  {dirty ? "Cambios sin guardar" : unpublished ? "Borrador guardado · sin publicar" : `Publicado · v${version}`}
                  {warnings.length ? ` · ${warnings.length} aviso(s)` : ""}
                </p>
              </div>
              {contentTab && (
                <button
                  type="button"
                  className="btn-ghost min-h-10 px-3 text-sm xl:hidden"
                  onClick={() => setShowPreview((v) => !v)}
                  aria-pressed={showPreview}
                >
                  {showPreview ? "Ocultar vista previa" : "Ver vista previa"}
                </button>
              )}
              {dirty && (
                <button type="button" className="btn-ghost min-h-10 px-3 text-sm" onClick={discard}>
                  Descartar
                </button>
              )}
              <button type="button" className="btn-outline min-h-10 px-4 text-sm" onClick={save} disabled={!dirty || !!busy}>
                {busy === "save" ? <Spinner label="Guardando" /> : null} Guardar borrador
              </button>
              <button type="button" className="btn-primary min-h-10 px-4 text-sm" onClick={publish} disabled={(!dirty && !unpublished) || !!busy}>
                {busy === "publish" ? <Spinner label="Publicando" /> : <Icon name="arrow" className="size-4" />} Publicar
              </button>
            </header>

            <div className={`grid flex-1 ${contentTab && showPreview ? "xl:grid-cols-[minmax(0,1fr)_minmax(420px,46%)]" : ""}`}>
              <main className="min-w-0 space-y-5 p-4 sm:p-6">{panel}</main>
              {contentTab && showPreview && (
                <aside className="border-t border-black/5 xl:sticky xl:top-[65px] xl:h-[calc(100dvh-65px)] xl:border-l xl:border-t-0" aria-label="Vista previa">
                  <Preview config={config} pages={pages} onFocusPath={onFocusPath} />
                </aside>
              )}
            </div>
          </div>
        </div>
        {toast && (
          <div
            role={toast.tone === "error" ? "alert" : "status"}
            className={`fixed bottom-4 left-1/2 z-50 max-w-[92vw] -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-medium text-white shadow-xl ${toast.tone === "error" ? "bg-alerta" : "bg-morado"}`}
          >
            {toast.text}
          </div>
        )}
      </MediaContext.Provider>
    </EditorContext.Provider>
  );
}
