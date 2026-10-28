/**
 * Selector de íconos del CMS: catálogo curado de Font Awesome Free (en el navegador), la librería
 * completa (búsqueda en el servidor, el trazado elegido se guarda en `theme.iconLibrary`) o una
 * imagen subida. El valor guardado es el nombre del ícono («stethoscope», «regular:bell») o la ruta.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ICON_GROUPS, iconLabel, isIconName } from "../../lib/icons";
import { Spinner } from "../ui";
import { CmsIcon, Icon } from "../Icon";
import { Field, useEditor } from "./fields";
import { UploadButton } from "./media";
import { fieldId, getPath } from "./model";

/** Palabras en español para encontrar íconos del catálogo por su uso («pediatría», «cita»…). */
const SYNONYMS: Record<string, string> = {
  stethoscope: "medicina general medico estetoscopio consulta",
  "user-doctor": "doctor medico profesional especialista",
  "user-nurse": "enfermeria enfermera",
  hospital: "hospital clinica centro",
  "house-medical": "clinica consultorio centro medico",
  "kit-medical": "botiquin primeros auxilios",
  "heart-pulse": "cardiologia corazon pulso",
  heart: "favoritos corazon cardiologia",
  baby: "pediatria bebe nino",
  child: "pediatria nino",
  "person-pregnant": "ginecologia obstetricia embarazo",
  "hand-dots": "dermatologia piel",
  tooth: "odontologia dentista diente",
  brain: "neurologia psicologia psiquiatria cerebro mente",
  "apple-whole": "nutricion dieta",
  "person-walking": "fisioterapia rehabilitacion",
  bone: "traumatologia hueso ortopedia",
  eye: "oftalmologia ojo vista ver",
  "ear-listen": "otorrinolaringologia oido",
  vial: "laboratorio examenes analisis",
  microscope: "laboratorio analisis",
  pills: "farmacia medicamentos receta",
  syringe: "vacuna inyeccion",
  lungs: "neumologia pulmones",
  "x-ray": "imagenologia rayos x radiologia",
  "laptop-medical": "telemedicina virtual",
  video: "videollamada virtual telemedicina",
  "calendar-check": "cita confirmada agenda",
  calendar: "calendario agenda citas",
  clock: "hora horario reloj",
  "magnifying-glass": "buscar lupa",
  "location-dot": "ubicacion mapa direccion",
  "brands:whatsapp": "whatsapp mensajes",
  "shield-halved": "seguridad confianza verificado",
  "credit-card": "pago tarjeta",
  wallet: "pago billetera ingresos",
  receipt: "recibo factura comprobante",
  bell: "notificacion aviso recordatorio",
  star: "opinion valoracion estrella",
  "comment-medical": "consulta mensaje chat",
  user: "cuenta usuario perfil paciente",
  house: "inicio casa",
};

const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

type LibraryIcon = { name: string; style: string; w: number; h: number; d: string };

/** Busca en la librería completa de Font Awesome Free (servidor, con términos en español). */
function useLibrarySearch(query: string, enabled: boolean) {
  const [state, setState] = useState<{ total: number; icons: LibraryIcon[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/cms/icons?q=${encodeURIComponent(query.trim())}`, { signal: ctl.signal, credentials: "same-origin" })
        .then((r) => (r.ok ? (r.json() as Promise<{ total: number; icons: LibraryIcon[] }>) : Promise.reject(new Error("No se pudo buscar en la librería."))))
        .then((d) => {
          setState(d);
          setError("");
        })
        .catch((e) => e.name !== "AbortError" && setError(e.message));
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [query, enabled]);
  return { state, error };
}

export function IconPickerDialog({
  value,
  onPick,
  onClose,
}: {
  value: string;
  onPick: (name: string, data?: [number, number, string]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("Todos");
  const [source, setSource] = useState<"catalogo" | "libreria">("catalogo");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const groups = ["Todos", ...Object.keys(ICON_GROUPS)];
  const list = useMemo(() => {
    const q = normalize(query.trim());
    const names = group === "Todos" ? Object.values(ICON_GROUPS).flat() : (ICON_GROUPS[group] ?? []);
    return [...new Set(names)].filter((n) => !q || normalize(`${n} ${iconLabel(n)} ${SYNONYMS[n] ?? ""}`).includes(q));
  }, [query, group]);
  const library = useLibrarySearch(query, source === "libreria");
  const tile = (name: string, content: React.ReactNode, onClick: () => void) => (
    <li key={name}>
      <button
        type="button"
        onClick={onClick}
        title={iconLabel(name)}
        aria-label={iconLabel(name)}
        aria-pressed={value === name}
        className={`flex w-full flex-col items-center gap-1.5 rounded-xl p-2 text-center transition hover:bg-celeste ${value === name ? "bg-celeste ring-2 ring-azul" : "ring-1 ring-tinta/5"}`}
      >
        {content}
        <span className="line-clamp-2 w-full break-words text-[10px] leading-tight muted">{iconLabel(name)}</span>
      </button>
    </li>
  );
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-tinta/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Elegir ícono"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-tinta/5 p-4">
          <h2 className="text-lg font-bold">Elegir ícono</h2>
          <button type="button" className="icon-btn ml-auto" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" />
          </button>
          <div className="flex w-full flex-wrap gap-1 rounded-full bg-fondo p-1" role="tablist" aria-label="Origen de los íconos">
            {(
              [
                ["catalogo", `Catálogo buscaDR (${new Set(Object.values(ICON_GROUPS).flat()).size})`],
                ["libreria", `Librería Font Awesome${library.state ? ` (${library.state.total.toLocaleString("es-EC")})` : ""}`],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={source === k}
                onClick={() => setSource(k)}
                className={`min-h-10 min-w-0 flex-1 rounded-full px-3 text-xs font-semibold sm:text-sm ${source === k ? "bg-azul text-white" : "hover:bg-tinta/5"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <label className="relative w-full">
            <span className="sr-only">Buscar ícono</span>
            <Icon name="search" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-gris" />
            <input
              ref={input}
              className="input pl-10"
              placeholder="Buscar: pediatría, corazón, cita, laboratorio, whatsapp…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {source === "catalogo" && (
            <div className="-mx-1 flex w-full gap-1.5 overflow-x-auto px-1 pb-1">
              {groups.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroup(g)}
                  className={`chip shrink-0 whitespace-nowrap text-xs font-semibold ${group === g ? "bg-azul text-white" : "bg-fondo text-tinta ring-1 ring-tinta/10"}`}
                >
                  {g}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="overflow-y-auto p-4">
          {source === "catalogo" ? (
            list.length ? (
              <ul className="grid grid-cols-3 gap-2 min-[400px]:grid-cols-4 sm:grid-cols-6 md:grid-cols-8">
                {list.map((name) => tile(name, <Icon name={name} className="size-6 text-azul" />, () => onPick(name)))}
              </ul>
            ) : (
              <p className="text-sm muted">
                No hay íconos para «{query}» en el catálogo.{" "}
                <button type="button" className="font-semibold text-azul underline" onClick={() => setSource("libreria")}>
                  Buscar en la librería completa
                </button>
              </p>
            )
          ) : library.error ? (
            <p className="text-sm text-alerta-ink">{library.error}</p>
          ) : !library.state ? (
            <Spinner label="Buscando" />
          ) : library.state.icons.length ? (
            <>
              <p className="mb-3 text-xs muted">
                {query.trim() ? `${library.state.icons.length} resultados` : "Sugerencias para salud"}. Al elegir uno, se guarda en la marca y funciona en todo
                el sitio.
              </p>
              <ul className="grid grid-cols-3 gap-2 min-[400px]:grid-cols-4 sm:grid-cols-6 md:grid-cols-8">
                {library.state.icons.map((ic) =>
                  tile(
                    ic.name,
                    <svg viewBox={`0 0 ${ic.w} ${ic.h}`} fill="currentColor" className="size-6 text-azul" aria-hidden="true">
                      <path d={ic.d} />
                    </svg>,
                    () => onPick(ic.name, [ic.w, ic.h, ic.d]),
                  ),
                )}
              </ul>
            </>
          ) : (
            <p className="text-sm muted">Sin resultados para «{query}». Prueba en inglés (p. ej. «heart», «tooth») o sube una imagen.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-tinta/5 p-4 text-sm">
          <span className="muted">¿Un ícono propio de la marca?</span>
          <UploadButton maxSide={256} label="Subir imagen" onUploaded={(m) => onPick(m.url)} />
        </div>
      </div>
    </div>
  );
}

/** Control compacto: vista del icono actual + botón «Cambiar». */
export function IconChooser({ value, onChange, label, id }: { value: string; onChange: (v: string) => void; label: string; id?: string }) {
  const [open, setOpen] = useState(false);
  const { config, update } = useEditor();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-celeste text-azul-ink">
        <CmsIcon value={value} className="size-5" />
      </span>
      <button id={id} type="button" className="btn-outline btn-sm shrink-0" onClick={() => setOpen(true)} aria-label={`${label}: cambiar ícono`}>
        Cambiar
      </button>
      <span className="min-w-0 truncate text-xs muted">{value.startsWith("/") ? "Imagen subida" : iconLabel(value)}</span>
      {open && (
        <IconPickerDialog
          value={value}
          onClose={() => setOpen(false)}
          onPick={(v, data) => {
            // Ícono de la librería completa: se guarda su trazado en la marca para que el sitio lo dibuje.
            if (data && !isIconName(v)) update("theme.iconLibrary", { ...config.theme.iconLibrary, [v]: data });
            onChange(v);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** Campo de icono enlazado a una ruta del documento CMS. */
export function IconField({ path, label, hint }: { path: string; label: string; hint?: string }) {
  const { config, update } = useEditor();
  const value = String(getPath(config, path) ?? "");
  return (
    <Field path={path} label={label} hint={hint}>
      <IconChooser id={fieldId(path)} value={value} label={label} onChange={(v) => update(path, v)} />
    </Field>
  );
}
