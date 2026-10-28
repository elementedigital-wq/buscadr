/**
 * Tipografías del CMS: Manrope e Inter (Brand Deck, incluidas), familias de Google Fonts y fuentes
 * propias subidas desde la computadora (WOFF2, WOFF, TTF u OTF). Solo se cargan en el sitio las
 * dos familias elegidas (titulares y texto).
 */
import { useState } from "react";
import { BUILTIN_FONTS, FONT_FAMILY, GOOGLE_FONT_SUGGESTIONS } from "../../../server/cms/model";
import { api } from "../../lib/api";
import { formatBytes } from "../../lib/image";
import { fontAssets, googleFontsHref } from "../../lib/theme";
import type { Cms } from "../../lib/types";
import { Icon } from "../Icon";
import { Notice, Spinner } from "../ui";
import { Field, Section, useEditor } from "./fields";
import { useMedia } from "./media";
import { fieldId } from "./model";

type FontDef = Cms["theme"]["fonts"][number];
const SAMPLE = "Encuentra a tu médico y agenda tu cita · 0123";
const WEIGHT_SETS = ["400;500;600;700;800", "400;600;700", "400;700", ""];

/** Carga en el CMS todas las fuentes de la biblioteca para ver las muestras. */
export function FontLibraryAssets({ fonts }: { fonts: FontDef[] }) {
  const links = fonts.filter((f) => f.source === "google" && !f.files.length).map(googleFontsHref);
  // fontAssets solo emite las familias en uso: se le pasa cada fuente como si estuviera elegida.
  const css = fonts
    .filter((f) => f.files.length)
    .map((f) => fontAssets({ theme: { font: f.family, bodyFont: f.family, fonts: [f] } } as unknown as Cms).css)
    .join("");
  return (
    <>
      {links.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: @font-face con familias y URL validadas */}
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
    </>
  );
}

const titleCase = (s: string) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());

/** Comprueba en Google Fonts qué pesos existen para la familia (la API falla si se pide un peso inexistente). */
async function findGoogleFont(raw: string): Promise<FontDef | null> {
  const candidates = [...new Set([raw.trim(), titleCase(raw.trim().toLowerCase())])].filter((f) => FONT_FAMILY.test(f));
  for (const family of candidates) {
    for (const weights of WEIGHT_SETS) {
      const res = await fetch(googleFontsHref({ family, weights })).catch(() => null);
      if (res?.ok) return { family, source: "google", weights, files: [] };
    }
  }
  return null;
}

/** Peso y estilo a partir del nombre del archivo («Marca-SemiBoldItalic.woff2» → 600 itálica). */
function guessFace(fileName: string) {
  const n = fileName.toLowerCase().replace(/[-_ ]/g, "");
  const weight = /black|heavy/.test(n)
    ? 900
    : /extrabold|ultrabold/.test(n)
      ? 800
      : /semibold|demibold/.test(n)
        ? 600
        : /bold/.test(n)
          ? 700
          : /medium/.test(n)
            ? 500
            : /extralight|ultralight/.test(n)
              ? 200
              : /light/.test(n)
                ? 300
                : /thin/.test(n)
                  ? 100
                  : 400;
  return { weight, style: /italic|oblique/.test(n) ? ("italic" as const) : ("normal" as const) };
}

export function FontsSection() {
  const { config, update } = useEditor();
  const { notify } = useMedia();
  const fonts = config.theme.fonts;
  const families = [...BUILTIN_FONTS, ...fonts.map((f) => f.family)];
  const [google, setGoogle] = useState("");
  const [hosted, setHosted] = useState(true);
  const [busy, setBusy] = useState<"google" | "upload" | null>(null);
  const [uploadFamily, setUploadFamily] = useState("");
  const [error, setError] = useState("");

  const setFonts = (next: FontDef[]) => update("theme.fonts", next);

  async function addGoogle(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (fonts.length >= 12) return setError("La biblioteca admite hasta 12 familias.");
    if (!FONT_FAMILY.test(google.trim())) return setError("Escribe el nombre de la familia tal como aparece en Google Fonts (letras, números y espacios).");
    if (families.some((f) => f.toLowerCase() === google.trim().toLowerCase())) return setError("Esa familia ya está en la biblioteca.");
    setBusy("google");
    let def: FontDef | null = null;
    try {
      // Importada: buscaDR descarga los WOFF2 (latin) y los sirve desde su dominio (sin depender de Google en cada visita).
      def = hosted ? await api<FontDef>("/api/cms/fonts/google", { body: { family: google.trim() } }) : await findGoogleFont(google);
    } catch (err) {
      setBusy(null);
      return setError((err as Error).message);
    }
    setBusy(null);
    if (!def) return setError(`No encontramos «${google.trim()}» en Google Fonts. Revisa el nombre en fonts.google.com.`);
    setFonts([...fonts, def]);
    setGoogle("");
    notify(`${def.family} ${hosted ? "importada y alojada en buscaDR" : "agregada"}. Elígela en Titulares o Textos para usarla.`);
  }

  async function upload(files: FileList | null) {
    setError("");
    if (!files?.length) return;
    const family = uploadFamily.trim();
    if (!FONT_FAMILY.test(family)) return setError("Escribe primero el nombre de la familia (por ejemplo «Marca Sans»).");
    if (BUILTIN_FONTS.includes(family as (typeof BUILTIN_FONTS)[number]) || fonts.some((f) => f.family === family && f.source === "google"))
      return setError("Usa un nombre distinto al de las fuentes incluidas o de Google.");
    setBusy("upload");
    try {
      const uploaded: FontDef["files"] = [];
      for (const file of Array.from(files).slice(0, 8)) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        if (!["woff2", "woff", "ttf", "otf"].includes(ext)) throw new Error(`«${file.name}» no es WOFF2, WOFF, TTF ni OTF.`);
        if (file.size > 3 * 1024 * 1024) throw new Error(`«${file.name}» supera 3 MB (${formatBytes(file.size)}).`);
        const res = await api<{ url: string }>(`/api/cms/fonts?${new URLSearchParams({ ext, name: file.name })}`, {
          raw: new Blob([await file.arrayBuffer()], { type: "application/octet-stream" }),
        });
        uploaded.push({ url: res.url, ...guessFace(file.name) });
      }
      const existing = fonts.find((f) => f.family === family && f.source === "upload");
      const next = existing
        ? fonts.map((f) => (f === existing ? { ...f, files: [...f.files, ...uploaded].slice(0, 8) } : f))
        : [...fonts, { family, source: "upload" as const, weights: "", files: uploaded }];
      setFonts(next.slice(0, 12));
      notify(`${uploaded.length} archivo(s) de «${family}» subidos.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function remove(family: string) {
    setFonts(fonts.filter((f) => f.family !== family));
    if (config.theme.font === family) update("theme.font", "Manrope");
    if (config.theme.bodyFont === family) update("theme.bodyFont", "Inter");
  }

  const option = (f: string) => (f === "Manrope" ? "Manrope (Brand Deck)" : f === "Inter" ? "Inter (Brand Deck)" : f);
  return (
    <Section
      title="Tipografía"
      description="Manrope e Inter son las del Brand Deck. Puedes proponer otras: de Google Fonts o subidas desde tu computadora. En el sitio solo se cargan las dos elegidas."
    >
      <FontLibraryAssets fonts={fonts} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
        {(
          [
            ["theme.font", "Titulares", config.theme.font],
            ["theme.bodyFont", "Textos e interfaz", config.theme.bodyFont],
          ] as const
        ).map(([path, label, current]) => (
          <Field key={path} path={path} label={label}>
            <select id={fieldId(path)} className="input" value={current} onChange={(e) => update(path, e.target.value)}>
              {families.map((f) => (
                <option key={f} value={f}>
                  {option(f)}
                </option>
              ))}
            </select>
            <p className="truncate rounded-xl bg-fondo px-3 py-2 text-lg" style={{ fontFamily: `"${current}", ui-sans-serif` }}>
              {SAMPLE}
            </p>
          </Field>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <form onSubmit={addGoogle} className="rounded-xl p-4 ring-1 ring-tinta/10">
          <p className="flex items-center gap-2 font-semibold">
            <Icon name="brands:google" className="size-4" /> Agregar de Google Fonts
          </p>
          <label htmlFor="google-font" className="mt-3 block text-sm">
            Nombre de la familia
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            <input
              id="google-font"
              list="google-font-suggestions"
              className="input min-w-0 flex-1"
              placeholder="Ej.: Plus Jakarta Sans"
              value={google}
              maxLength={40}
              onChange={(e) => setGoogle(e.target.value)}
            />
            <datalist id="google-font-suggestions">
              {GOOGLE_FONT_SUGGESTIONS.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
            <button type="submit" className="btn-primary shrink-0" disabled={busy !== null || !google.trim()}>
              {busy === "google" ? <Spinner label="Buscando" /> : <Icon name="plus" className="size-4" />} Agregar
            </button>
          </div>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={hosted}
              onChange={(e) => setHosted(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-[var(--color-azul)]"
            />
            <span>
              <strong>Importar y alojar en buscaDR</strong> (recomendado): se descarga una vez y se sirve desde tu dominio, más rápido y sin enviar datos de
              visitantes a Google. Sin marcar, se enlaza desde fonts.google.com.
            </span>
          </label>
        </form>

        <div className="rounded-xl p-4 ring-1 ring-tinta/10">
          <p className="flex items-center gap-2 font-semibold">
            <Icon name="upload" className="size-4" /> Subir desde tu computadora
          </p>
          <label htmlFor="upload-font-family" className="mt-3 block text-sm">
            Nombre de la familia
          </label>
          <input
            id="upload-font-family"
            className="input mt-1"
            placeholder="Ej.: Marca Sans"
            value={uploadFamily}
            maxLength={40}
            onChange={(e) => setUploadFamily(e.target.value)}
          />
          <label className={`btn-outline mt-3 w-full cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
            {busy === "upload" ? <Spinner label="Subiendo" /> : <Icon name="upload" className="size-4" />}
            {busy === "upload" ? "Subiendo…" : "Elegir archivos (.woff2, .woff, .ttf, .otf)"}
            <input
              type="file"
              className="sr-only"
              accept=".woff2,.woff,.ttf,.otf"
              multiple
              onChange={(e) => upload(e.target.files).finally(() => (e.target.value = ""))}
            />
          </label>
          <p className="mt-2 text-xs muted">
            Hasta 3 MB por archivo. El peso (Regular, Bold…) se detecta del nombre del archivo. Usa solo fuentes con licencia web.
          </p>
        </div>
      </div>
      {error && (
        <div className="mt-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}

      {fonts.length > 0 && (
        <ul className="mt-5 space-y-2">
          {fonts.map((f) => (
            <li key={f.family} className="flex flex-wrap items-center gap-3 rounded-xl bg-fondo p-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {f.family}
                  <span className="chip bg-white px-2 py-0.5 text-xs ring-1 ring-tinta/10">
                    {f.source === "google"
                      ? f.files.length
                        ? `Google Fonts · alojada (${f.files.length} archivo(s))`
                        : `Google Fonts · enlazada${f.weights ? ` · ${f.weights.split(";").length} pesos` : ""}`
                      : `${f.files.length} archivo(s) subidos`}
                  </span>
                  {(config.theme.font === f.family || config.theme.bodyFont === f.family) && (
                    <span className="chip bg-azul px-2 py-0.5 text-xs text-white">En uso</span>
                  )}
                </p>
                <p className="mt-1 truncate text-xl" style={{ fontFamily: `"${f.family}", ui-sans-serif` }}>
                  {SAMPLE}
                </p>
              </div>
              <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => remove(f.family)}>
                <Icon name="trash" className="size-4" /> Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
