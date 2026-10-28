/**
 * Editor del CMS Maestro (se carga aparte de la pantalla de acceso: quien no es el propietario
 * nunca descarga el editor).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Cms } from "../../lib/types";
import { api } from "../../lib/api";
import { Icon, IconLibraryContext } from "../Icon";
import { Spinner } from "../ui";
import { Preview } from "./Preview";
import { Acceso } from "./access";
import { Pagos } from "./payments";
import { EditorContext } from "./fields";
import { MediaContext, useMediaStore } from "./media";
import { TABS, type TabId, contentWarnings, fieldId, setPath, tabForPath } from "./model";
import { Banners, Biblioteca, Componentes, Especialidades, Historial, Marca, Permisos, Portada, Profesionales, Resenas, Resumen, Seo, Textos } from "./panels";

export type Site = { draft: Cms; published: Cms; version: number; mediaStorage: "d1" | "r2" };

/* ------------------------------------------------------------------ Editor */

type Toast = { text: string; tone: "ok" | "error" } | null;

export default function Editor({
  site,
  owner,
  firstDoctor,
  recoveryEmail,
}: {
  site: Site;
  owner: { name: string; email: string; role?: "owner" | "superuser" } | null;
  firstDoctor: string | null;
  recoveryEmail: boolean;
}) {
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
    { label: "Buscar", path: "/buscar" },
    { label: "Especialidades", path: "/especialidades" },
    ...(firstDoctor ? [{ label: "Perfil de un profesional", path: `/doctor/${firstDoctor}` }] : []),
    { label: "Para profesionales", path: "/para-profesionales" },
    { label: "Planes", path: "/planes" },
    { label: "Cómo funciona", path: "/como-funciona" },
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
      case "especialidades":
        return <Especialidades />;
      case "profesionales":
        return <Profesionales />;
      case "biblioteca":
        return <Biblioteca storage={site.mediaStorage} />;
      case "seo":
        return <Seo />;
      case "permisos":
        return <Permisos notify={notify} />;
      case "acceso":
        return <Acceso email={owner?.email ?? ""} role={owner?.role ?? "owner"} recoveryEmail={recoveryEmail} notify={notify} />;
      case "pagos":
        return <Pagos notify={notify} />;
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

  const contentTab = !["permisos", "pagos", "resenas", "historial"].includes(tab);

  return (
    <EditorContext.Provider value={{ config, update, focusPath }}>
      <IconLibraryContext.Provider value={config.theme.iconLibrary}>
        <MediaContext.Provider value={mediaStore}>
          <div className="flex min-h-dvh flex-col lg:flex-row">
            {/* Navegación */}
            <aside className="bg-tinta text-white lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:shrink-0 lg:overflow-y-auto">
              <div className="flex items-center gap-3 p-4">
                <img src="/assets/buscadr-isotipo.png" alt="" className="size-9 rounded-xl bg-white p-1" width={36} height={36} />
                <div>
                  <p className="font-display font-extrabold leading-tight">CMS Maestro</p>
                  <p className="text-xs text-white/80">{owner?.email}</p>
                </div>
              </div>
              <nav aria-label="Secciones del CMS" className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible">
                {(["Contenido", "Operación"] as const).map((group) => (
                  <div key={group} className="contents lg:block">
                    <p className="hidden px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70 lg:block">{group}</p>
                    {TABS.filter((t) => t.group === group).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => goTo(t.id)}
                        data-tab={t.id}
                        aria-current={tab === t.id ? "page" : undefined}
                        className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold lg:w-full ${tab === t.id ? "bg-white text-azul" : "text-white/90 hover:bg-white/10"}`}
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
              <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-tinta/5 bg-white/95 px-4 py-3 backdrop-blur">
                <div className="mr-auto">
                  <h1 className="text-lg font-extrabold">{TABS.find((t) => t.id === tab)?.label}</h1>
                  <p className="text-xs muted" aria-live="polite">
                    {dirty ? "Cambios sin guardar" : unpublished ? "Borrador guardado · sin publicar" : `Publicado · v${version}`}
                    {warnings.length ? ` · ${warnings.length} aviso(s)` : ""}
                  </p>
                </div>
                {contentTab && (
                  <button type="button" className="btn-ghost btn-sm xl:hidden" onClick={() => setShowPreview((v) => !v)} aria-pressed={showPreview}>
                    {showPreview ? "Ocultar vista previa" : "Ver vista previa"}
                  </button>
                )}
                {dirty && (
                  <button type="button" className="btn-ghost btn-sm" onClick={discard}>
                    Descartar
                  </button>
                )}
                <button type="button" className="btn-outline btn-sm" onClick={save} disabled={!dirty || !!busy}>
                  {busy === "save" ? <Spinner label="Guardando" /> : null} Guardar borrador
                </button>
                <button type="button" className="btn-primary btn-sm" onClick={publish} disabled={(!dirty && !unpublished) || !!busy}>
                  {busy === "publish" ? <Spinner label="Publicando" /> : <Icon name="arrow" className="size-4" />} Publicar
                </button>
              </header>

              <div className={`grid flex-1 ${contentTab && showPreview ? "xl:grid-cols-[minmax(0,1fr)_minmax(420px,46%)]" : ""}`}>
                <main className="min-w-0 space-y-5 p-4 sm:p-6">{panel}</main>
                {contentTab && showPreview && (
                  <aside
                    className="border-t border-tinta/5 xl:sticky xl:top-[65px] xl:h-[calc(100dvh-65px)] xl:border-l xl:border-t-0"
                    aria-label="Vista previa"
                  >
                    <Preview config={config} pages={pages} onFocusPath={onFocusPath} />
                  </aside>
                )}
              </div>
            </div>
          </div>
          {toast && (
            <div
              role={toast.tone === "error" ? "alert" : "status"}
              className={`fixed bottom-4 left-1/2 z-50 max-w-[92vw] -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-medium text-white shadow-xl ${toast.tone === "error" ? "bg-alerta" : "bg-azul"}`}
            >
              {toast.text}
            </div>
          )}
        </MediaContext.Provider>
      </IconLibraryContext.Provider>
    </EditorContext.Provider>
  );
}
