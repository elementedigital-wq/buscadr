/**
 * Selector de iconos del CMS: catálogo Font Awesome Free agrupado y con búsqueda, o una imagen
 * subida (PNG/WebP) para iconos propios de la marca. El valor guardado es el nombre del icono
 * («hammer», «regular:calendar») o la ruta de la imagen.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ICON_GROUPS, iconLabel } from "../../lib/icons";
import { CmsIcon, Icon } from "../Icon";
import { Field, useEditor } from "./fields";
import { UploadButton } from "./media";
import { fieldId, getPath } from "./model";

/** Palabras en español para encontrar iconos por su uso («taladro», «limpieza»…). */
const SYNONYMS: Record<string, string> = {
  hammer: "martillo herramienta construccion",
  "screwdriver-wrench": "herramientas taladro bricolaje reparacion",
  wrench: "llave reparacion mecanica",
  screwdriver: "destornillador",
  toolbox: "caja de herramientas",
  "paint-roller": "pintura rodillo",
  paintbrush: "pintura brocha",
  broom: "escoba limpieza",
  "spray-can-sparkles": "limpieza hidrolavadora spray",
  seedling: "jardin planta",
  leaf: "jardin hoja",
  "volume-high": "sonido parlante audio",
  microphone: "microfono voz",
  camera: "camara foto",
  laptop: "computadora portatil",
  bolt: "energia electricidad rayo",
  plug: "enchufe electricidad",
  car: "auto vehiculo automotriz",
  truck: "camion entrega",
  stairs: "escalera",
  "faucet-drip": "plomeria grifo agua",
  blender: "electrodomestico licuadora",
  "magnifying-glass": "buscar lupa",
  "location-dot": "ubicacion mapa",
  "regular:calendar": "calendario reservas",
  "regular:house": "inicio casa",
  "regular:user": "cuenta usuario perfil",
  "regular:heart": "favoritos corazon",
  "shield-halved": "seguridad confianza",
  tag: "precio etiqueta",
  star: "estrella reseña valoracion",
  key: "llave codigo entrega",
  "brands:whatsapp": "whatsapp mensajes",
  "ruler-combined": "regla medir escuadra",
  ruler: "regla medir",
  tape: "cinta",
  trowel: "llana albanil",
  "trowel-bricks": "ladrillos albanileria construccion",
  "helmet-safety": "casco seguridad obra",
  "person-digging": "excavar pala obra",
  gears: "engranajes mecanica motor",
  magnet: "iman",
  dolly: "carretilla mudanza",
  "cart-flatbed": "carretilla plataforma carga",
  "fire-extinguisher": "extintor",
  "oil-can": "aceite lubricante",
  "gas-pump": "gasolina combustible",
  box: "caja",
  "boxes-stacked": "cajas bodega",
  pallet: "palet carga",
  dumpster: "basura escombros",
  "road-barrier": "barrera via",
  "spray-can": "pintura aerosol",
  "fill-drip": "pintura balde",
  palette: "paleta colores pintura",
  soap: "jabon limpieza",
  "pump-soap": "jabon dispensador",
  bucket: "balde cubeta",
  "jug-detergent": "detergente limpieza",
  sink: "lavabo fregadero",
  faucet: "grifo llave agua",
  shower: "ducha",
  bath: "tina baño",
  toilet: "inodoro baño",
  droplet: "gota agua",
  water: "agua",
  house: "casa hogar",
  couch: "sofa mueble",
  chair: "silla",
  bed: "cama",
  rug: "alfombra",
  "kitchen-set": "cocina ollas",
  fan: "ventilador",
  "temperature-high": "calor temperatura",
  snowflake: "frio aire acondicionado",
  recycle: "reciclaje",
  "trash-can": "basura eliminar",
  lightbulb: "foco luz idea",
  tree: "arbol",
  "plant-wilt": "planta",
  sun: "sol",
  tractor: "tractor campo",
  scissors: "tijeras podar cortar",
  tent: "carpa camping",
  campground: "camping",
  music: "musica",
  headphones: "audifonos",
  guitar: "guitarra",
  drum: "tambor bateria",
  "champagne-glasses": "fiesta brindis evento",
  "cake-candles": "cumpleaños fiesta",
  gift: "regalo",
  ticket: "entrada boleto",
  video: "video camara",
  film: "pelicula",
  desktop: "computadora pc",
  display: "pantalla monitor",
  tv: "televisor pantalla",
  "tablet-screen-button": "tablet",
  "mobile-screen": "celular telefono",
  print: "impresora",
  wifi: "internet",
  gamepad: "consola juegos",
  robot: "robot",
  "battery-full": "bateria carga",
  "charging-station": "cargador",
  "solar-panel": "panel solar energia",
  "car-battery": "bateria auto",
  "power-off": "apagar encender",
  "car-side": "auto",
  "truck-pickup": "camioneta",
  "truck-moving": "mudanza camion",
  "van-shuttle": "furgoneta",
  trailer: "remolque",
  motorcycle: "moto",
  bicycle: "bicicleta",
  road: "carretera",
  route: "ruta seguimiento",
  users: "personas comunidad",
  handshake: "acuerdo trato",
  "hand-holding-dollar": "dinero ingresos",
  "thumbs-up": "me gusta",
  award: "premio",
  lock: "candado seguro",
  wallet: "billetera pago",
  "credit-card": "tarjeta pago",
  receipt: "recibo factura",
  "piggy-bank": "ahorro",
  store: "tienda",
  "cart-shopping": "carrito compra",
  "chart-line": "grafico estadisticas",
  "map-location-dot": "mapa ubicacion",
  clock: "reloj hora",
  "regular:clock": "reloj hora",
  heart: "favoritos corazon",
  comment: "mensaje chat",
  "regular:comment": "mensaje chat",
  bell: "notificacion aviso",
  "regular:bell": "notificacion aviso",
  gear: "ajustes configuracion",
  sliders: "filtros ajustes",
  check: "listo ok",
  "circle-check": "listo verificado ok",
  "arrow-right": "flecha siguiente",
  "share-nodes": "compartir",
  "pen-to-square": "editar",
  eye: "ver",
  "regular:eye": "ver",
  flag: "reportar bandera",
  phone: "telefono llamar",
  envelope: "correo email",
  "regular:envelope": "correo email",
  font: "letra tipografia",
  "paper-plane": "enviar",
  "regular:images": "fotos galeria",
  image: "foto imagen",
  upload: "subir",
  download: "descargar",
};

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function IconPickerDialog({ value, onPick, onClose }: { value: string; onPick: (name: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("Todos");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const groups = ["Todos", ...Object.keys(ICON_GROUPS)];
  const list = useMemo(() => {
    const q = normalize(query.trim());
    const names = group === "Todos" ? Object.values(ICON_GROUPS).flat() : (ICON_GROUPS[group] ?? []);
    return [...new Set(names)].filter((n) => !q || normalize(`${iconLabel(n)} ${SYNONYMS[n] ?? ""}`).includes(q));
  }, [query, group]);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-tinta/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Elegir icono"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-black/5 p-4">
          <h2 className="text-lg font-bold">Elegir icono</h2>
          <span className="text-xs muted">Font Awesome Free · {Object.values(ICON_GROUPS).flat().length} iconos</span>
          <button type="button" className="btn-ghost ml-auto min-h-10 px-3" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" />
          </button>
          <label className="relative w-full">
            <span className="sr-only">Buscar icono</span>
            <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-gris" />
            <input
              ref={input}
              className="input pl-10"
              placeholder="Buscar: taladro, limpieza, calendario, whatsapp…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="-mx-1 flex w-full gap-1.5 overflow-x-auto px-1 pb-1">
            {groups.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroup(g)}
                className={`chip shrink-0 whitespace-nowrap text-xs font-semibold ${group === g ? "bg-morado text-white" : "bg-fondo text-tinta ring-1 ring-black/10"}`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-y-auto p-4">
          {list.length ? (
            <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
              {list.map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => onPick(name)}
                    title={iconLabel(name)}
                    aria-label={iconLabel(name)}
                    aria-pressed={value === name}
                    className={`flex w-full flex-col items-center gap-1.5 rounded-xl p-2 text-center transition hover:bg-lila ${value === name ? "bg-lila ring-2 ring-morado" : "ring-1 ring-black/5"}`}
                  >
                    <Icon name={name} className="size-6 text-morado" />
                    <span className="line-clamp-2 w-full break-words text-[10px] leading-tight muted">{iconLabel(name)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm muted">No hay iconos para «{query}». Prueba en inglés (p. ej. «drill» → «screwdriver») o sube una imagen.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-black/5 p-4 text-sm">
          <span className="muted">¿Un icono propio de la marca?</span>
          <UploadButton maxSide={256} label="Subir imagen" onUploaded={(m) => onPick(m.url)} />
        </div>
      </div>
    </div>
  );
}

/** Control compacto: vista del icono actual + botón «Cambiar». */
export function IconChooser({ value, onChange, label, id }: { value: string; onChange: (v: string) => void; label: string; id?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-lila text-morado">
        <CmsIcon value={value} className="size-5" />
      </span>
      <button id={id} type="button" className="btn-outline min-h-10 shrink-0 px-3 text-sm" onClick={() => setOpen(true)} aria-label={`${label}: cambiar icono`}>
        Cambiar
      </button>
      <span className="min-w-0 truncate text-xs muted">{value.startsWith("/") ? "Imagen subida" : iconLabel(value)}</span>
      {open && (
        <IconPickerDialog
          value={value}
          onClose={() => setOpen(false)}
          onPick={(v) => {
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
