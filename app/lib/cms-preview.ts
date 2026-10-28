/**
 * Puente de vista previa del CMS Maestro (ADR 0007).
 *
 * El CMS (/maestro) carga el sitio real en un iframe con `?cms_preview=1`. Por `postMessage`
 * (solo mismo origen) le envía el borrador sin guardar; el sitio lo aplica al instante en lugar
 * de la versión publicada. En modo «seleccionar», un clic sobre un elemento con `data-cms`
 * avisa al CMS qué campo editar. Fuera del iframe del CMS no hace nada.
 */
import { useSyncExternalStore } from "react";
import type { Cms } from "./types";

export const PREVIEW_PARAM = "cms_preview";

export type PreviewMessage =
  | { type: "buscadr-cms:config"; config: Cms }
  | { type: "buscadr-cms:select"; enabled: boolean }
  | { type: "buscadr-cms:ready"; path: string }
  | { type: "buscadr-cms:navigate"; path: string }
  | { type: "buscadr-cms:focus"; path: string };

let draft: Cms | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Borrador que envía el CMS, o `null` fuera de la vista previa. */
export const usePreviewCms = () =>
  useSyncExternalStore(
    subscribe,
    () => draft,
    () => null,
  );

const inPreviewFrame = () => typeof window !== "undefined" && window.parent !== window && new URL(location.href).searchParams.has(PREVIEW_PARAM);

const post = (msg: PreviewMessage) => window.parent.postMessage(msg, location.origin);

let started = false;

/** Activa el puente si la página está dentro del CMS. Idempotente. */
export function startPreviewBridge() {
  if (started || !inPreviewFrame()) return;
  started = true;
  document.documentElement.classList.add("cms-preview", "cms-select");
  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    const msg = event.data as PreviewMessage;
    if (msg?.type === "buscadr-cms:config" && msg.config && typeof msg.config === "object") {
      draft = msg.config;
      emit();
    } else if (msg?.type === "buscadr-cms:select") {
      document.documentElement.classList.toggle("cms-select", !!msg.enabled);
    }
  });
  // Clic para editar: captura antes que los enlaces para no navegar mientras se selecciona.
  document.addEventListener(
    "click",
    (event) => {
      if (!document.documentElement.classList.contains("cms-select")) return;
      const el = (event.target as Element | null)?.closest?.("[data-cms]");
      if (!el) return;
      event.preventDefault();
      event.stopPropagation();
      post({ type: "buscadr-cms:focus", path: el.getAttribute("data-cms") ?? "" });
    },
    true,
  );
  post({ type: "buscadr-cms:ready", path: location.pathname + location.search });
}

/** Informa al CMS la página que se está viendo dentro del iframe. */
export function notifyPreviewNavigation(path: string) {
  if (started) post({ type: "buscadr-cms:navigate", path });
}
