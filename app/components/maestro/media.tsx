/**
 * Imágenes del CMS: subida con compresión en el navegador (sin APIs de pago), biblioteca y
 * selector. Las imágenes se guardan en D1 (o en R2 si el binding existe).
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { formatBytes, prepareImage } from "../../lib/image";
import { Icon } from "../Icon";
import { Spinner } from "../ui";
import { Field, useEditor } from "./fields";
import { BRAND_ASSETS, fieldId, getPath } from "./model";

export type MediaItem = { id: string; url: string; name: string; mime: string; bytes: number; width: number | null; height: number | null; created_at: string };

type MediaApi = {
  media: MediaItem[];
  loaded: boolean;
  refresh: () => Promise<void>;
  upload: (file: File, maxSide?: number) => Promise<MediaItem>;
  remove: (item: MediaItem, force?: boolean) => Promise<void>;
  notify: (text: string, tone?: "ok" | "error") => void;
};
export const MediaContext = createContext<MediaApi | null>(null);
export const useMedia = () => {
  const ctx = useContext(MediaContext);
  if (!ctx) throw new Error("MediaContext ausente");
  return ctx;
};

export function useMediaStore(notify: MediaApi["notify"]): MediaApi {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    const data = await api<{ media: MediaItem[] }>("/api/cms/media");
    setMedia(data.media);
    setLoaded(true);
  }, []);
  const upload = useCallback(async (file: File, maxSide = 1920) => {
    const prepared = await prepareImage(file, maxSide);
    const q = new URLSearchParams({ name: prepared.name, w: String(prepared.width), h: String(prepared.height) });
    const res = await api<{ media: MediaItem }>(`/api/cms/media?${q}`, { raw: prepared.blob });
    setMedia((list) => [res.media, ...list]);
    return res.media;
  }, []);
  const remove = useCallback(async (item: MediaItem, force = false) => {
    await api(`/api/cms/media/${item.id}${force ? "?force=1" : ""}`, { method: "DELETE" });
    setMedia((list) => list.filter((m) => m.id !== item.id));
  }, []);
  return { media, loaded, refresh, upload, remove, notify };
}

/** Botón de subida reutilizable (acepta varios archivos y arrastrar y soltar en la biblioteca). */
export function UploadButton({
  onUploaded,
  maxSide,
  label = "Subir imagen",
  multiple,
}: {
  onUploaded?: (m: MediaItem) => void;
  maxSide?: number;
  label?: string;
  multiple?: boolean;
}) {
  const { upload, notify } = useMedia();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function handle(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const item = await upload(file, maxSide);
        notify(`Imagen subida (${formatBytes(item.bytes)}).`);
        onUploaded?.(item);
      }
    } catch (err) {
      notify((err as Error).message, "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => handle(e.target.files)}
      />
      <button type="button" className="btn-outline min-h-10 px-4 text-sm" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? <Spinner label="Subiendo" /> : <Icon name="camera" className="size-4" />} {busy ? "Subiendo…" : label}
      </button>
    </>
  );
}

/** Selector modal: imágenes subidas + imágenes de marca incluidas. */
function Picker({ onPick, onClose }: { onPick: (url: string) => void; onClose: () => void }) {
  const { media, loaded, refresh } = useMedia();
  const [tab, setTab] = useState<"subidas" | "marca">("subidas");
  useEffect(() => {
    if (!loaded) refresh().catch(() => {});
  }, [loaded, refresh]);
  const items =
    tab === "subidas"
      ? media.filter((m) => m.mime.startsWith("image/")).map((m) => ({ url: m.url, name: m.name }))
      : BRAND_ASSETS.map((url) => ({ url, name: url.split("/").pop() ?? url }));
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-tinta/50 p-4" role="dialog" aria-modal="true" aria-label="Elegir imagen">
      <div className="flex max-h-[85dvh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-tinta/5 p-4">
          <h2 className="text-lg font-bold">Elegir imagen</h2>
          <div className="ml-4 flex gap-1 rounded-full bg-fondo p-1 text-sm">
            {(["subidas", "marca"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-full px-3 py-1.5 font-semibold ${tab === t ? "bg-white shadow" : "muted"}`}
              >
                {t === "subidas" ? "Subidas" : "De la marca"}
              </button>
            ))}
          </div>
          <button type="button" className="btn-ghost ml-auto min-h-10 px-3" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" />
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          {tab === "subidas" && (
            <div className="mb-4">
              <UploadButton onUploaded={(m) => onPick(m.url)} label="Subir una nueva" />
            </div>
          )}
          {items.length ? (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {items.map((it) => (
                <li key={it.url}>
                  <button type="button" onClick={() => onPick(it.url)} className="group w-full text-left">
                    <span className="grid aspect-square place-items-center overflow-hidden rounded-xl bg-fondo ring-1 ring-tinta/10 group-hover:ring-2 group-hover:ring-azul">
                      <img src={it.url} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
                    </span>
                    <span className="mt-1 block truncate text-xs muted">{it.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm muted">{loaded ? "Aún no has subido imágenes." : "Cargando…"}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Campo de imagen: vista previa, subir (se aplica al instante), elegir de la biblioteca o quitar. */
export function ImageField({
  path,
  label,
  hint,
  maxSide,
  allowEmpty = true,
  wide,
}: {
  path: string;
  label: string;
  hint?: string;
  maxSide?: number;
  allowEmpty?: boolean;
  wide?: boolean;
}) {
  const { config, update } = useEditor();
  const value = String(getPath(config, path) ?? "");
  const [picking, setPicking] = useState(false);
  return (
    <Field path={path} label={label} hint={hint} wide={wide}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-fondo ring-1 ring-tinta/10">
          {value ? <img src={value} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-xs muted">Sin imagen</span>}
        </span>
        <div className="flex flex-wrap gap-2">
          <UploadButton maxSide={maxSide} onUploaded={(m) => update(path, m.url)} />
          <button type="button" className="btn-ghost min-h-10 px-3 text-sm" onClick={() => setPicking(true)}>
            Elegir
          </button>
          {allowEmpty && value && (
            <button type="button" className="btn-ghost min-h-10 px-3 text-sm" onClick={() => update(path, "")}>
              Quitar
            </button>
          )}
        </div>
        <input
          id={fieldId(path)}
          className="input w-full font-mono text-xs"
          value={value}
          placeholder="/api/media/… · /assets/… · https://…"
          aria-label={`${label}: ruta de la imagen`}
          onChange={(e) => update(path, e.target.value.trim())}
        />
      </div>
      {picking && (
        <Picker
          onClose={() => setPicking(false)}
          onPick={(url) => {
            update(path, url);
            setPicking(false);
          }}
        />
      )}
    </Field>
  );
}
