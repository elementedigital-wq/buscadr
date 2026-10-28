/**
 * Vista previa en vivo: el sitio real dentro de un iframe (mismo origen) que recibe el borrador
 * por postMessage en cada cambio, sin guardar. Un clic en un elemento del sitio abre su campo.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PREVIEW_PARAM, type PreviewMessage } from "../../lib/cms-preview";
import type { Cms } from "../../lib/types";
import { Icon } from "../Icon";

type Device = "movil" | "escritorio";

const send = (frame: HTMLIFrameElement | null, msg: PreviewMessage) => frame?.contentWindow?.postMessage(msg, window.location.origin);

export function Preview({ config, pages, onFocusPath }: { config: Cms; pages: { label: string; path: string }[]; onFocusPath: (path: string) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(pages[0]?.path ?? "/");
  const [current, setCurrent] = useState(page);
  const [device, setDevice] = useState<Device>("movil");
  const [select, setSelect] = useState(true);
  const [ready, setReady] = useState(false);
  const [scale, setScale] = useState(1);
  const latest = useRef({ config, select });
  latest.current = { config, select };

  // Mensajes del sitio: listo, navegación interna y clic para editar.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      const msg = event.data as PreviewMessage;
      if (msg?.type === "buscadr-cms:ready") {
        setReady(true);
        setCurrent(msg.path);
        send(frame.current, { type: "buscadr-cms:config", config: latest.current.config });
        send(frame.current, { type: "buscadr-cms:select", enabled: latest.current.select });
      } else if (msg?.type === "buscadr-cms:navigate") setCurrent(msg.path);
      else if (msg?.type === "buscadr-cms:focus") onFocusPath(msg.path);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onFocusPath]);

  useEffect(() => {
    if (ready) send(frame.current, { type: "buscadr-cms:config", config });
  }, [config, ready]);
  useEffect(() => {
    if (ready) send(frame.current, { type: "buscadr-cms:select", enabled: select });
  }, [select, ready]);

  // En escritorio se renderiza a 1280 px y se escala al ancho del panel.
  const width = device === "movil" ? 390 : 1280;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const style = getComputedStyle(el);
      const inner = el.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
      setScale(Math.min(1, inner / width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  const src = `${page}${page.includes("?") ? "&" : "?"}${PREVIEW_PARAM}=1`;
  const height = device === "movil" ? 780 : 900;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-black/5 bg-white p-3">
        <label htmlFor="preview-page" className="sr-only">
          Página de la vista previa
        </label>
        <select
          id="preview-page"
          className="input min-h-10 w-auto py-1 text-sm"
          value={page}
          onChange={(e) => {
            setReady(false);
            setPage(e.target.value);
          }}
        >
          {pages.map((p) => (
            <option key={p.path} value={p.path}>
              {p.label}
            </option>
          ))}
        </select>
        <div className="flex gap-1 rounded-full bg-fondo p-1 text-xs font-semibold" role="group" aria-label="Dispositivo">
          {(["movil", "escritorio"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={device === d}
              onClick={() => setDevice(d)}
              className={`rounded-full px-3 py-1.5 ${device === d ? "bg-white shadow" : "muted"}`}
            >
              {d === "movil" ? "Móvil" : "Escritorio"}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={select}
          onClick={() => setSelect((v) => !v)}
          className={`chip min-h-9 text-xs font-semibold ${select ? "bg-morado text-white" : "bg-fondo text-tinta ring-1 ring-black/10"}`}
          title="Con esta opción activa, un clic en el sitio abre el campo que lo edita. Desactívala para navegar."
        >
          {select ? "Clic para editar" : "Navegar"}
        </button>
        <a
          href={current.replace(/[?&]cms_preview=1$/, "").replace("?cms_preview=1&", "?")}
          target="_blank"
          rel="noopener"
          className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-morado"
        >
          Abrir publicado <Icon name="arrow" className="size-3.5" />
        </a>
      </div>
      <div ref={box} className="relative flex-1 overflow-auto bg-gris-claro/60 p-3">
        <div className="mx-auto" style={{ width: width * scale, height: height * scale }}>
          <iframe
            ref={frame}
            key={src}
            src={src}
            title="Vista previa del sitio con el borrador"
            className="origin-top-left rounded-xl border border-black/10 bg-white shadow-lg"
            style={{ width, height, transform: `scale(${scale})` }}
          />
        </div>
        {!ready && <p className="absolute inset-x-0 top-6 text-center text-sm muted">Cargando vista previa…</p>}
      </div>
      <p className="border-t border-black/5 bg-white px-3 py-2 text-xs muted">
        Vista previa del <strong>borrador sin publicar</strong>: los visitantes siguen viendo la versión publicada.
      </p>
    </div>
  );
}
