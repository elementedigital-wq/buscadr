/**
 * Buscador de íconos del CMS Maestro sobre la librería COMPLETA de Font Awesome Free 7 (sólidos,
 * contorno y marcas; más de 2 100 íconos). La librería se importa de forma diferida: solo se carga
 * cuando el propietario busca en el CMS, nunca en las páginas públicas. Entiende términos en español.
 *
 * Nombres: «stethoscope» (sólido), «regular:heart» (contorno), «brands:whatsapp» (marca), igual que
 * el catálogo curado de la web (app/lib/icon-data.ts). Si el ícono elegido no está en ese catálogo,
 * el CMS guarda su trazado en `theme.iconLibrary` para dibujarlo sin cargar la librería.
 * Font Awesome Free: íconos CC BY 4.0, código MIT (https://fontawesome.com/license/free).
 */
export type IconStyle = "solid" | "regular" | "brands";
type FaDef = { prefix: string; iconName: string; icon: [number, number, (string | number)[], string, string | string[]] };
type Entry = { name: string; style: IconStyle; base: string; aliases: string[]; w: number; h: number; d: string };

let index: Entry[] | null = null;

async function loadIndex(): Promise<Entry[]> {
  if (index) return index;
  const [{ fas }, { far }, { fab }] = await Promise.all([
    import("@fortawesome/free-solid-svg-icons"),
    import("@fortawesome/free-regular-svg-icons"),
    import("@fortawesome/free-brands-svg-icons"),
  ]);
  const seen = new Set<string>();
  const out: Entry[] = [];
  for (const [style, pack] of [
    ["solid", fas],
    ["regular", far],
    ["brands", fab],
  ] as const) {
    for (const def of Object.values(pack as unknown as Record<string, FaDef>)) {
      const name = style === "solid" ? def.iconName : `${style}:${def.iconName}`;
      if (seen.has(name)) continue; // los alias del paquete apuntan al mismo ícono
      seen.add(name);
      const [w, h, aliases, , path] = def.icon;
      out.push({
        name,
        style,
        base: def.iconName,
        aliases: (aliases ?? []).filter((a): a is string => typeof a === "string"),
        w,
        h,
        d: Array.isArray(path) ? path.join(" ") : path,
      });
    }
  }
  index = out;
  return out;
}

/** Términos en español → nombres en inglés de Font Awesome (salud y la interfaz de buscaDR). */
const ES: Record<string, string> = {
  medico: "user-doctor stethoscope hospital",
  doctor: "user-doctor stethoscope",
  doctora: "user-doctor stethoscope",
  salud: "heart-pulse kit-medical staff-snake",
  hospital: "hospital hospital-user house-medical",
  clinica: "hospital house-medical building",
  consultorio: "house-medical hospital user-doctor",
  enfermera: "user-nurse",
  estetoscopio: "stethoscope",
  corazon: "heart heart-pulse",
  cardiologia: "heart-pulse heart",
  pulso: "heart-pulse",
  bebe: "baby baby-carriage",
  nino: "child baby children",
  pediatria: "baby child children",
  embarazo: "person-pregnant baby",
  ginecologia: "person-pregnant venus",
  mujer: "venus person-dress",
  hombre: "mars person",
  piel: "hand-dots",
  dermatologia: "hand-dots",
  diente: "tooth",
  dientes: "tooth",
  dentista: "tooth",
  odontologia: "tooth",
  cerebro: "brain",
  mente: "brain head-side-virus",
  psicologia: "brain comment-medical",
  psiquiatria: "brain comment-medical",
  nutricion: "apple-whole carrot bowl-food",
  comida: "bowl-food utensils apple-whole",
  fruta: "apple-whole lemon",
  fisioterapia: "person-walking wheelchair-move dumbbell",
  rehabilitacion: "person-walking wheelchair crutch",
  hueso: "bone x-ray",
  huesos: "bone x-ray",
  traumatologia: "bone crutch",
  ojo: "eye glasses",
  ojos: "eye glasses eye-low-vision",
  oftalmologia: "eye glasses",
  oido: "ear-listen ear-deaf",
  laboratorio: "flask vial vials microscope",
  examen: "vial file-medical microscope",
  sangre: "droplet vial",
  virus: "virus virus-covid bacteria",
  pulmon: "lungs",
  pulmones: "lungs lungs-virus",
  receta: "prescription file-prescription prescription-bottle-medical",
  medicina: "pills capsules tablets prescription-bottle-medical",
  pastilla: "pills capsules tablets",
  vacuna: "syringe",
  inyeccion: "syringe",
  termometro: "thermometer temperature-half",
  fiebre: "thermometer temperature-high",
  peso: "weight-scale",
  ambulancia: "truck-medical",
  emergencia: "truck-medical kit-medical",
  botiquin: "kit-medical briefcase-medical",
  radiografia: "x-ray",
  silla: "wheelchair wheelchair-move",
  video: "video laptop-medical",
  videollamada: "video laptop-medical headset",
  virtual: "video laptop-medical",
  telemedicina: "laptop-medical video headset",
  casa: "house home",
  inicio: "house home",
  buscar: "magnifying-glass",
  lupa: "magnifying-glass",
  ubicacion: "location-dot map-pin map",
  mapa: "map map-location-dot",
  calendario: "calendar calendar-days calendar-check",
  cita: "calendar-check calendar-days clipboard-user",
  citas: "calendar-check calendar-days",
  agenda: "calendar-days calendar-week",
  fecha: "calendar",
  hora: "clock",
  reloj: "clock",
  usuario: "user circle-user",
  paciente: "user hospital-user bed-pulse",
  perfil: "user id-card id-badge",
  mensaje: "comment comments message envelope",
  chat: "comment comments comment-medical",
  correo: "envelope",
  favorito: "heart star bookmark",
  estrella: "star",
  opinion: "star comment",
  escudo: "shield shield-halved",
  verificado: "circle-check user-check shield-halved",
  documento: "file file-lines file-medical",
  factura: "file-invoice receipt",
  pago: "credit-card money-bill wallet",
  dinero: "money-bill wallet coins",
  tarjeta: "credit-card",
  precio: "tag money-bill",
  seguro: "shield-halved umbrella",
  ayuda: "circle-question headset life-ring",
  soporte: "headset life-ring",
  alerta: "triangle-exclamation bell",
  notificacion: "bell",
  campana: "bell",
  configuracion: "gear sliders",
  filtro: "filter sliders",
  telefono: "phone mobile-screen",
  celular: "mobile-screen phone",
  whatsapp: "whatsapp",
  facebook: "facebook",
  instagram: "instagram",
  tiktok: "tiktok",
  google: "google",
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Selección inicial cuando no se escribe nada: íconos útiles para un directorio médico. */
const STARTER = [
  "stethoscope",
  "user-doctor",
  "hospital",
  "house-medical",
  "heart-pulse",
  "baby",
  "person-pregnant",
  "hand-dots",
  "tooth",
  "brain",
  "apple-whole",
  "person-walking",
  "bone",
  "eye",
  "ear-listen",
  "vial",
  "microscope",
  "pills",
  "syringe",
  "kit-medical",
  "video",
  "laptop-medical",
  "calendar-check",
  "calendar-days",
  "clock",
  "magnifying-glass",
  "location-dot",
  "user",
  "comment-medical",
  "bell",
  "credit-card",
  "shield-halved",
  "star",
  "brands:whatsapp",
];

export async function searchIcons(query: string, style: IconStyle | "all" = "all", limit = 96) {
  const all = await loadIndex();
  const pool = style === "all" ? all : all.filter((i) => i.style === style);
  const q = norm(query).slice(0, 60);
  if (!q) {
    const starter = STARTER.map((n) => pool.find((i) => i.name === n)).filter((i): i is Entry => !!i);
    return { total: pool.length, icons: starter.slice(0, limit).map(view) };
  }
  const words = q.split(/\s+/).filter(Boolean);
  const terms = new Set<string>(words);
  for (const w of words) for (const t of (ES[w] ?? ES[w.replace(/s$/, "")] ?? "").split(" ").filter(Boolean)) terms.add(t);
  const scored: { e: Entry; score: number }[] = [];
  for (const e of pool) {
    let score = 0;
    for (const t of terms) {
      if (e.base === t) score = Math.max(score, 100);
      else if (e.base.startsWith(t)) score = Math.max(score, 70);
      else if (e.base.split("-").includes(t)) score = Math.max(score, 60);
      else if (e.aliases.some((a) => a === t)) score = Math.max(score, 55);
      else if (t.length >= 3 && (e.base.includes(t) || e.aliases.some((a) => a.includes(t)))) score = Math.max(score, 30);
    }
    if (score) scored.push({ e, score: score - e.base.length / 100 + (e.style === "solid" ? 0.5 : 0) });
  }
  scored.sort((a, b) => b.score - a.score);
  return { total: scored.length, icons: scored.slice(0, limit).map((s) => view(s.e)) };
}

const view = (e: Entry) => ({ name: e.name, style: e.style, w: e.w, h: e.h, d: e.d });
