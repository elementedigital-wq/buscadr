/** Paneles del CMS Maestro: uno por pestaña, todos enlazados a lo que muestra el front end. */
import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { formatBytes } from "../../lib/image";
import type { Cms, PublicPractitioner } from "../../lib/types";
import { Icon } from "../Icon";
import { Notice, Spinner } from "../ui";
import { ColorField, Grid, NumberField, Section, SelectField, TextField, Toggle, useEditor } from "./fields";
import { FontsSection } from "./fonts";
import { IconField } from "./icons";
import { ImageField, type MediaItem, UploadButton, useMedia } from "./media";
import { ROUTE_LABELS, type TabId, type Warning, contentWarnings, fieldId } from "./model";

const ROUTE_OPTIONS = Object.entries(ROUTE_LABELS) as [string, string][];

/* ------------------------------------------------------------------ Resumen */

export function Resumen({ version, dirty, onGo }: { version: number; dirty: boolean; onGo: (tab: TabId, path?: string) => void }) {
  const { config } = useEditor();
  const warnings = contentWarnings(config);
  const shortcuts: [TabId, string, string][] = [
    ["portada", "Portada", "Titular, imagen principal, buscador, beneficios y bloques de la página de inicio"],
    ["marca", "Marca, fuentes e íconos", "Colores, tipografías (Google Fonts o subidas), logo, favicon e íconos"],
    ["banners", "Banners", "Campañas con imagen y botón bajo el titular"],
    ["especialidades", "Especialidades y categorías", "83 especialidades en 11 categorías: edita, oculta, ordena y agrega las tuyas"],
    ["profesionales", "Profesionales", "Foto, frase y perfiles destacados (siempre rotulados)"],
    ["biblioteca", "Biblioteca", "Sube imágenes y fuentes (se guardan en Cloudflare D1)"],
  ];
  return (
    <div className="space-y-5">
      <Section
        title="Cómo funciona el CMS"
        description="Todo lo que editas aquí se ve al instante en la vista previa. Los visitantes solo lo ven cuando publicas."
      >
        <ol className="grid gap-3 sm:grid-cols-3">
          {[
            ["1", "Edita", "Cambia textos, imágenes y estilo. También puedes hacer clic en cualquier parte de la vista previa."],
            ["2", "Guarda el borrador", "Queda guardado en D1. Los visitantes aún no lo ven."],
            ["3", "Publica", "Sale a producción en ese momento. Cada publicación queda en el historial."],
          ].map(([n, t, d]) => (
            <li key={n} className="rounded-xl bg-fondo p-4">
              <span className="grid size-8 place-items-center rounded-full bg-verde font-display font-extrabold text-tinta">{n}</span>
              <p className="mt-2 font-semibold">{t}</p>
              <p className="text-sm muted">{d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm">
          Versión publicada: <strong>v{version}</strong> · Borrador: <strong>{dirty ? "con cambios sin guardar" : "guardado"}</strong>
        </p>
      </Section>
      <WarningsList warnings={warnings} onGo={onGo} />
      <Section title="Accesos rápidos">
        <div className="grid gap-2 sm:grid-cols-2">
          {shortcuts.map(([tab, title, text]) => (
            <button
              key={tab}
              type="button"
              onClick={() => onGo(tab)}
              className="flex items-center gap-3 rounded-xl p-3 text-left ring-1 ring-tinta/10 hover:ring-azul"
            >
              <span className="flex-1">
                <span className="block font-semibold">{title}</span>
                <span className="block text-sm muted">{text}</span>
              </span>
              <Icon name="arrow" className="size-4 text-azul" />
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

export function WarningsList({ warnings, onGo }: { warnings: Warning[]; onGo: (tab: TabId, path?: string) => void }) {
  if (!warnings.length)
    return (
      <Notice tone="success" title="Sin avisos">
        Los textos cumplen la guía de afirmaciones y los colores tienen contraste suficiente.
      </Notice>
    );
  return (
    <Notice tone="warning" title={`${warnings.length} ${warnings.length === 1 ? "aviso" : "avisos"} antes de publicar`}>
      <ul className="mt-1 space-y-1">
        {warnings.map((w, i) => (
          <li key={w.path + String(i)}>
            <button type="button" className="text-left underline underline-offset-2" onClick={() => onGo("resumen", w.path)}>
              {w.text}
            </button>
          </li>
        ))}
      </ul>
    </Notice>
  );
}

/* ------------------------------------------------------------------ Marca */

export function Marca() {
  return (
    <div className="space-y-5">
      <Section
        title="Logo e isotipo"
        description="El logo va en la cabecera; la versión blanca, en el pie oscuro; el isotipo es el ícono de la pestaña y de la app."
      >
        <Grid>
          <ImageField path="theme.logo" label="Logo (fondos claros)" maxSide={800} allowEmpty={false} hint="PNG o WebP con fondo transparente." />
          <ImageField
            path="theme.logoDark"
            label="Logo blanco (fondos oscuros)"
            maxSide={800}
            allowEmpty={false}
            hint="Versión en blanco para el pie de página."
          />
          <ImageField path="theme.favicon" label="Isotipo / favicon" maxSide={256} allowEmpty={false} hint="Cuadrado, idealmente 256 × 256 px." />
        </Grid>
      </Section>
      <Section title="Colores" description="Por defecto, los HEX oficiales del Brand Deck buscaDR (lámina 08). Los avisos de contraste aparecen en Resumen.">
        <Grid>
          <ColorField path="theme.primary" label="Azul Confianza (principal)" hint="Botones principales, enlaces, precios y selección." />
          <ColorField path="theme.secondary" label="Verde Salud" hint="Confirmaciones, disponibilidad y WhatsApp. Como texto se usa una versión más oscura." />
          <ColorField path="theme.accent" label="Azul Tecnología" hint="Detalles, gráficos y citas virtuales." />
          <ColorField path="theme.neutral" label="Gris pizarra" hint="Textos secundarios." />
          <ColorField path="theme.soft" label="Verde Bienestar" hint="Fondos suaves de íconos y etiquetas." />
          <ColorField path="theme.sky" label="Celeste suave" hint="Fondos de tarjetas destacadas e íconos azules." />
          <ColorField path="theme.text" label="Azul Profundo (texto)" />
          <ColorField path="theme.background" label="Fondo general" />
          <ColorField path="theme.surface" label="Tarjetas" />
        </Grid>
      </Section>
      <FontsSection />
      <Section
        title="Íconos de la navegación"
        description="Font Awesome Free: elige del catálogo médico o busca en la librería completa (más de 2.000 íconos). Los íconos de especialidades se editan en «Especialidades e íconos»."
      >
        <div className="space-y-3">
          {NAV_KEYS.map((k) => (
            <div key={k} className="grid gap-3 rounded-xl bg-fondo p-3 sm:grid-cols-2">
              <TextField path={`navigation.${k}`} label={NAV_LABELS[k] ?? k} max={55} />
              <IconField path={`navigation.icons.${k}`} label="Ícono" />
            </div>
          ))}
        </div>
      </Section>
      <Section title="Formas">
        <Grid>
          <NumberField path="theme.radius" label="Redondeo de tarjetas (px)" min={8} max={36} />
          <SelectField
            path="buttons.shape"
            label="Forma de los botones"
            options={[
              ["pill", "Píldora (Brand Deck)"],
              ["rounded", "Redondeados"],
              ["square", "Rectos"],
            ]}
          />
        </Grid>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ Portada */

export function Portada() {
  const { config, update } = useEditor();
  const suggestions = config.home.suggestions;
  return (
    <div className="space-y-5">
      <Section title="Titular principal">
        <Grid>
          <TextField path="hero.eyebrow" label="Antetítulo" max={90} wide />
          <TextField path="hero.title" label="Titular" max={110} />
          <TextField path="hero.highlight" label="Parte destacada (azul)" max={130} />
          <TextField path="hero.description" label="Descripción" max={450} multiline />
          <TextField path="home.greetingSubtitle" label="Frase bajo el saludo (con sesión)" max={80} />
          <TextField path="home.searchPlaceholder" label="Ejemplo dentro del buscador" max={80} />
          <TextField path="hero.cta" label="Botón del buscador" max={60} />
          <TextField path="hero.secondaryCta" label="Botón «Soy profesional»" max={60} />
        </Grid>
      </Section>
      <Section
        title="Imagen principal"
        description="Fotografía junto al titular. Usa fotos reales sin texto incrustado; nunca imágenes que sugieran un diagnóstico."
      >
        <Grid>
          <ImageField path="hero.image" label="Imagen" maxSide={1600} hint="Vacío = fotografía por defecto del Brand Deck." />
          <TextField path="hero.imageAlt" label="Descripción de la imagen (accesibilidad)" max={140} />
          <TextField path="hero.badgeTitle" label="Etiqueta sobre la imagen: título" max={50} />
          <TextField path="hero.badgeText" label="Etiqueta sobre la imagen: texto" max={90} />
        </Grid>
      </Section>
      <Section
        title="Sugerencias bajo el buscador"
        description="Atajos de búsqueda (máximo 8)."
        actions={
          suggestions.length < 8 ? (
            <button type="button" className="btn-outline btn-sm" onClick={() => update("home.suggestions", [...suggestions, "Nueva sugerencia"])}>
              <Icon name="plus" className="size-4" /> Añadir
            </button>
          ) : null
        }
      >
        <div className="space-y-2" data-field="home.suggestions" id={fieldId("home.suggestions")}>
          {suggestions.map((s, i) => (
            <div key={String(i)} className="flex gap-2">
              <label htmlFor={`sugg-${i}`} className="sr-only">
                Sugerencia {i + 1}
              </label>
              <input id={`sugg-${i}`} className="input" value={s} maxLength={40} onChange={(e) => update(`home.suggestions.${i}`, e.target.value)} />
              <button
                type="button"
                className="icon-btn"
                aria-label={`Quitar sugerencia ${i + 1}`}
                onClick={() =>
                  update(
                    "home.suggestions",
                    suggestions.filter((_, j) => j !== i),
                  )
                }
              >
                <Icon name="x" />
              </button>
            </div>
          ))}
        </div>
      </Section>
      <IconTextGroup title="Beneficios bajo el buscador (4)" path="home.features" count={4} label="Beneficio" />
      <Section title="Así funciona (3 pasos)">
        <TextField path="home.stepsTitle" label="Título" max={60} wide />
      </Section>
      <IconTextGroup title="Pasos" path="home.steps" count={3} label="Paso" />
      <IconTextGroup
        title="Compromisos (4 tarjetas)"
        path="home.promises"
        count={4}
        label="Tarjeta"
        description="Solo promesas que el producto cumple hoy (docs/MARKETING_CLAIMS.md)."
      />
      <Section title="Bloques finales">
        <Grid>
          <TextField path="home.proEyebrow" label="Profesionales: antetítulo" max={40} />
          <TextField path="home.proTitle" label="Profesionales: título" max={100} />
          <TextField path="home.proText" label="Profesionales: texto" max={260} multiline />
          <TextField path="home.virtualEyebrow" label="Telemedicina: antetítulo" max={40} />
          <TextField path="home.virtualTitle" label="Telemedicina: título" max={100} />
          <TextField path="home.virtualText" label="Telemedicina: texto" max={260} multiline />
          <TextField path="home.whatsappEyebrow" label="WhatsApp: antetítulo" max={40} />
          <TextField path="home.whatsappTitle" label="WhatsApp: título" max={100} />
          <TextField path="home.whatsappText" label="WhatsApp: texto" max={260} multiline />
        </Grid>
      </Section>
    </div>
  );
}

function IconTextGroup({ title, path, count, label, description }: { title: string; path: string; count: number; label: string; description?: string }) {
  return (
    <Section title={title} description={description}>
      <Grid>
        {Array.from({ length: count }, (_, i) => (
          <div key={String(i)} className="grid gap-3 rounded-xl bg-fondo p-3 sm:col-span-2 sm:grid-cols-2">
            <TextField path={`${path}.${i}.title`} label={`${label} ${i + 1}: título`} max={60} />
            <TextField path={`${path}.${i}.text`} label={`${label} ${i + 1}: texto`} max={180} />
            <IconField path={`${path}.${i}.icon`} label={`${label} ${i + 1}: ícono`} />
          </div>
        ))}
      </Grid>
    </Section>
  );
}

/* ------------------------------------------------------------------ Banners */

export function Banners() {
  const { config, update } = useEditor();
  const banners = config.banners;
  const add = () =>
    update("banners", [
      ...banners,
      {
        id: `banner-${crypto.randomUUID().slice(0, 8)}`,
        title: "Nueva campaña",
        subtitle: "Describe la campaña en una frase.",
        image: "",
        button: "Ver más",
        route: "buscar",
        specialty: "",
        visible: true,
      },
    ]);
  const move = (i: number, d: -1 | 1) => {
    const next = [...banners];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    update("banners", next);
  };
  return (
    <div className="space-y-5">
      <Section
        title="Banners de la portada"
        description="Aparecen bajo el titular, en dos columnas. Máximo 12. Usa imágenes sin texto incrustado."
        actions={
          banners.length < 12 ? (
            <button type="button" className="btn-primary btn-sm" onClick={add}>
              <Icon name="plus" className="size-4" /> Añadir banner
            </button>
          ) : null
        }
      >
        <Toggle path="layout.showBanners" label="Mostrar banners en la portada" />
        {!banners.length && <p className="mt-3 text-sm muted">Aún no hay banners. Añade uno para promocionar una especialidad o una campaña.</p>}
        <div className="mt-4 space-y-4">
          {banners.map((b, i) => (
            <div key={b.id} className="rounded-xl p-4 ring-1 ring-tinta/10" data-field={`banners.${i}`} id={fieldId(`banners.${i}`)}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <strong>Banner {i + 1}</strong>
                <span className={`chip px-2 py-0.5 text-xs ${b.visible ? "tone-verde" : "bg-gris-claro text-gris"}`}>{b.visible ? "Visible" : "Oculto"}</span>
                <div className="ml-auto flex gap-1">
                  <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir">
                    <Icon name="chevron-up" className="size-4" />
                  </button>
                  <button type="button" className="icon-btn" disabled={i === banners.length - 1} onClick={() => move(i, 1)} aria-label="Bajar">
                    <Icon name="chevron-down" className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="btn-danger btn-sm"
                    onClick={() =>
                      update(
                        "banners",
                        banners.filter((_, j) => j !== i),
                      )
                    }
                  >
                    Eliminar
                  </button>
                </div>
              </div>
              <Grid>
                <Toggle path={`banners.${i}.visible`} label="Visible" />
                <SelectField path={`banners.${i}.route`} label="Al hacer clic, ir a" options={ROUTE_OPTIONS} />
                {b.route === "buscar" && (
                  <SelectField
                    path={`banners.${i}.specialty`}
                    label="Especialidad (opcional)"
                    options={[["", "Todas las especialidades"], ...config.specialties.map((c) => [c.slug, c.name] as [string, string])]}
                  />
                )}
                <TextField path={`banners.${i}.title`} label="Título" max={130} />
                <TextField path={`banners.${i}.button`} label="Texto del enlace" max={55} />
                <TextField path={`banners.${i}.subtitle`} label="Texto" max={260} multiline />
                <ImageField path={`banners.${i}.image`} label="Imagen" maxSide={800} wide />
              </Grid>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ Textos */

const NAV_LABELS: Record<string, string> = {
  inicio: "Inicio",
  buscar: "Buscar",
  citas: "Mis citas",
  favoritos: "Favoritos",
  panel: "Panel del profesional",
  cuenta: "Cuenta",
};

const NAV_KEYS = ["inicio", "buscar", "citas", "favoritos", "panel", "cuenta"] as const;

export function Textos() {
  return (
    <div className="space-y-5">
      <Section title="Avisos y pie de página">
        <Grid>
          <TextField path="copy.emergencyNotice" label="Aviso de emergencias (obligatorio)" max={350} wide />
          <TextField path="copy.pilotNotice" label="Cobertura del piloto" max={350} wide />
          <TextField path="copy.footer" label="Pie de página" max={350} wide />
        </Grid>
      </Section>
      <Section title="Secciones de la portada">
        <Grid>
          <TextField path="copy.specialtiesTitle" label="Especialidades: título" max={120} />
          <TextField path="copy.specialtiesSubtitle" label="Especialidades: subtítulo" max={250} />
          <TextField path="copy.doctorsTitle" label="Profesionales: título" max={120} />
          <TextField path="copy.doctorsSubtitle" label="Profesionales: subtítulo" max={250} />
        </Grid>
      </Section>
      <Section title="Botones">
        <Grid>
          <TextField path="buttons.primary" label="Tarjeta del profesional («Ver perfil»)" max={75} />
          <TextField path="buttons.book" label="Reservar («Agendar cita»)" max={75} />
          <TextField path="buttons.explore" label="Enlace «Ver todos los profesionales»" max={75} />
          <TextField path="buttons.pro" label="Bloque de profesionales («Registrar mi consultorio»)" max={75} />
        </Grid>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ Componentes */

export function Componentes() {
  return (
    <div className="space-y-5">
      <Section title="Cantidades">
        <Grid>
          <NumberField path="layout.homeSpecialtyCount" label="Especialidades en la portada" min={1} max={16} />
          <NumberField path="layout.homeDoctorCount" label="Profesionales en la portada" min={1} max={24} />
          <NumberField path="layout.searchCount" label="Resultados en Buscar" min={1} max={60} />
          <NumberField path="layout.columns" label="Columnas de tarjetas (escritorio)" min={1} max={4} />
          <SelectField
            path="layout.cardStyle"
            label="Densidad de las tarjetas"
            options={[
              ["spacious", "Amplia"],
              ["compact", "Compacta"],
            ]}
          />
        </Grid>
      </Section>
      <Section
        title="Qué mostrar"
        description="«Perfil de muestra» siempre se muestra en los perfiles ilustrativos y el aviso de emergencias no se puede ocultar."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle path="layout.showRatings" label="Valoraciones" hint="Sin opiniones se muestra «Nuevo en buscaDR»." />
          <Toggle path="layout.showBadges" label="Insignias (Verificado, Destacado, Virtual)" />
          <Toggle path="layout.showPrices" label="Tarifas en las tarjetas" />
          <Toggle path="layout.showMap" label="Mapa en Buscar y en el perfil" />
          <Toggle path="layout.showBanners" label="Banners en la portada" />
        </div>
      </Section>
      <Section title="Bloques de la portada">
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle path="layout.showUpcoming" label="Próxima cita" hint="Solo con sesión iniciada y una cita próxima." />
          <Toggle path="layout.showSteps" label="Así funciona" />
          <Toggle path="layout.showPromises" label="Compromisos" />
          <Toggle path="layout.showWhatsapp" label="Bloque de WhatsApp" />
          <Toggle path="layout.showPlans" label="Bloque para profesionales" />
        </div>
      </Section>
    </div>
  );
}

export { Especialidades } from "./taxonomy";

/* ------------------------------------------------------------------ Profesionales */

type Override = { photo: string; headline: string; featured: boolean };

export function Profesionales() {
  const { config, update, focusPath } = useEditor();
  const [items, setItems] = useState<PublicPractitioner[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    api<{ items: PublicPractitioner[] }>("/api/practitioners?limit=60&log=0")
      .then((d) => setItems(d.items))
      .catch(() => setItems([]));
  }, []);
  const set = (id: number, change: Partial<Override>) => {
    const current = config.practitioners[String(id)] ?? { photo: "", headline: "", featured: false };
    update(`practitioners.${id}`, { ...current, ...change });
  };
  const needle = q.toLowerCase();
  const list = (items ?? []).filter((p) => !q || `${p.name} ${p.specialty_name} ${p.city} ${p.sector}`.toLowerCase().includes(needle));
  return (
    <Section
      title="Profesionales publicados"
      description="Ajusta la foto y la frase de las tarjetas y destaca perfiles (aparecen primero, siempre con la etiqueta «Destacado»). No modifica tarifas, opiniones, verificación ni datos del profesional."
    >
      <label htmlFor="pro-search" className="sr-only">
        Buscar profesional
      </label>
      <input id="pro-search" className="input mb-4" placeholder="Buscar por nombre, especialidad o ciudad" value={q} onChange={(e) => setQ(e.target.value)} />
      {!items ? (
        <Spinner />
      ) : !list.length ? (
        <p className="text-sm muted">No hay perfiles publicados que coincidan. La verificación se hace en Administración.</p>
      ) : (
        <ul className="space-y-3">
          {list.map((p) => {
            const o = config.practitioners[String(p.id)] ?? { photo: "", headline: "", featured: false };
            const path = `practitioners.${p.id}`;
            return (
              <li
                key={p.id}
                id={fieldId(path)}
                data-field={path}
                className={`rounded-xl p-4 ring-1 ${focusPath === path ? "bg-celeste ring-2 ring-azul" : "ring-tinta/10"}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="min-w-0 break-words">{p.name}</strong>
                  <span className="chip tone-azul px-2 py-0.5 text-xs">{p.specialty_name}</span>
                  {p.demo && <span className="chip bg-amarillo/20 px-2 py-0.5 text-xs">Perfil de muestra</span>}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={o.featured}
                    onClick={() => set(p.id, { featured: !o.featured })}
                    className={`chip ml-auto min-h-9 text-xs font-semibold ${o.featured ? "bg-azul text-white" : "bg-fondo ring-1 ring-tinta/10"}`}
                  >
                    {o.featured ? "★ Destacado" : "Destacar"}
                  </button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
                  <div className="flex items-center gap-3">
                    <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-fondo ring-1 ring-tinta/10">
                      {o.photo || p.photo ? (
                        <img src={o.photo || p.photo || ""} alt="" className="size-full object-cover" />
                      ) : (
                        <Icon name="user-doctor" className="muted" />
                      )}
                    </span>
                    <div className="flex flex-col gap-1">
                      <UploadButton maxSide={800} label="Foto" onUploaded={(m) => set(p.id, { photo: m.url })} />
                      {o.photo && (
                        <button type="button" className="text-left text-xs font-semibold text-azul underline" onClick={() => set(p.id, { photo: "" })}>
                          Usar la del profesional
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <label htmlFor={`headline-${p.id}`} className="text-sm font-medium">
                      Frase en la tarjeta
                    </label>
                    <input
                      id={`headline-${p.id}`}
                      className="input mt-1"
                      maxLength={100}
                      placeholder="Opcional · ej.: Atención a niños y adolescentes"
                      value={o.headline}
                      onChange={(e) => set(p.id, { headline: e.target.value })}
                    />
                    <p className="mt-1 text-xs muted">Vacía = frase del profesional. Evita promesas clínicas.</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ Biblioteca */

export function Biblioteca({ storage }: { storage: string }) {
  const { media, loaded, refresh, remove, notify, upload } = useMedia();
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!loaded) refresh().catch((e) => notify((e as Error).message, "error"));
  }, [loaded, refresh, notify]);
  async function drop(files: FileList) {
    setBusy(true);
    try {
      for (const f of Array.from(files)) await upload(f);
      notify(`${files.length} ${files.length === 1 ? "imagen subida" : "imágenes subidas"}.`);
    } catch (e) {
      notify((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function del(item: MediaItem) {
    if (!confirm(`¿Eliminar «${item.name}»?`)) return;
    try {
      await remove(item);
      notify("Imagen eliminada.");
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("se usa en") && confirm(`${msg}\n\n¿Eliminarla de todos modos? Esos lugares quedarán sin imagen.`)) {
        await remove(item, true);
        notify("Imagen eliminada.");
      } else notify(msg, "error");
    }
  }
  return (
    <Section
      title="Biblioteca de imágenes"
      description={
        <>
          Sube PNG, JPG, WebP o GIF. Se reducen y comprimen en tu navegador antes de subir. Se guardan en{" "}
          <strong>{storage === "r2" ? "Cloudflare R2" : "Cloudflare D1 (gratis, sin R2 ni APIs de pago)"}</strong>.
        </>
      }
      actions={<UploadButton multiple label="Subir imágenes" />}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: zona opcional de arrastrar y soltar; el botón «Subir imágenes» es la vía accesible */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) drop(e.dataTransfer.files);
        }}
        className={`mb-4 grid place-items-center rounded-xl border-2 border-dashed p-6 text-center text-sm ${drag ? "border-azul bg-azul/5" : "border-tinta/15"}`}
      >
        {busy ? <Spinner label="Subiendo" /> : "Arrastra imágenes aquí para subirlas"}
      </div>
      {!loaded ? (
        <Spinner />
      ) : !media.length ? (
        <p className="text-sm muted">Aún no has subido imágenes.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {media.map((m) => (
            <li key={m.id} className="overflow-hidden rounded-xl ring-1 ring-tinta/10">
              <span className="grid aspect-video place-items-center bg-fondo">
                {m.mime.startsWith("font/") ? (
                  <span className="flex flex-col items-center gap-1 text-azul">
                    <Icon name="font" className="size-8" />
                    <span className="text-xs font-semibold">Fuente</span>
                  </span>
                ) : (
                  <img src={m.url} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
                )}
              </span>
              <div className="p-2 text-xs">
                <p className="truncate font-semibold" title={m.name}>
                  {m.name}
                </p>
                <p className="muted">
                  {formatBytes(m.bytes)}
                  {m.width ? ` · ${m.width}×${m.height}` : ""}
                </p>
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    className="font-semibold text-azul underline"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(m.url)
                        .then(() => notify("Ruta copiada."))
                        .catch(() => notify(m.url))
                    }
                  >
                    Copiar ruta
                  </button>
                  <button type="button" className="ml-auto font-semibold underline" style={{ color: "var(--color-alerta)" }} onClick={() => del(m)}>
                    Eliminar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ SEO */

export function Seo() {
  const { config } = useEditor();
  return (
    <Section title="SEO de la portada" description="Lo que muestran Google y las redes al compartir la página de inicio.">
      <Grid>
        <TextField path="seo.title" label="Título" max={90} wide />
        <TextField path="seo.description" label="Descripción" max={200} multiline />
      </Grid>
      <div className="mt-5 rounded-xl bg-fondo p-4">
        <p className="text-xs muted">Así se vería en Google</p>
        <p className="mt-1 truncate text-lg text-[#1a0dab]">{config.seo.title}</p>
        <p className="text-sm text-[#4d5156]">{config.seo.description}</p>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ Operación */

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  city: string;
  staff_role: string;
  enabled: number;
  created_at: number;
  practitioner_status: string | null;
  appointments: number;
};

export function Permisos({ notify }: { notify: (t: string, tone?: "ok" | "error") => void }) {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const load = useCallback(
    () =>
      api<{ users: UserRow[] }>("/api/cms/users")
        .then((d) => setUsers(d.users))
        .catch((e) => notify(e.message, "error")),
    [notify],
  );
  useEffect(() => {
    load();
  }, [load]);
  async function toggle(u: UserRow) {
    if (!confirm(u.enabled ? `¿Deshabilitar la cuenta de ${u.name}? Se cerrarán sus sesiones.` : `¿Habilitar la cuenta de ${u.name}?`)) return;
    try {
      await api(`/api/cms/users/${u.id}/access`, { body: { enabled: !u.enabled } });
      notify("Permiso actualizado.");
      load();
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }
  return (
    <Section
      title="Permisos de cuentas"
      description="Activa o suspende cuentas reales de pacientes y profesionales. Suspender cierra sus sesiones. La cuenta del propietario está protegida."
    >
      {!users ? (
        <Spinner />
      ) : !users.length ? (
        <p className="text-sm muted">Sin usuarios registrados.</p>
      ) : (
        <ul className="divide-y divide-tinta/5">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{u.name}</p>
                <p className="truncate text-xs muted">
                  {u.email} ·{" "}
                  {u.staff_role === "admin"
                    ? "Administración"
                    : u.role === "pro"
                      ? `Profesional${u.practitioner_status ? ` (${u.practitioner_status})` : ""}`
                      : "Paciente"}{" "}
                  · {u.city} · {u.appointments} citas
                </p>
              </div>
              {u.staff_role === "admin" ? (
                <span className="chip bg-fondo text-xs">Protegida</span>
              ) : (
                <button type="button" className={`${u.enabled ? "btn-danger" : "btn-outline"} btn-sm`} onClick={() => toggle(u)}>
                  {u.enabled ? "Deshabilitar" : "Habilitar"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

type ReviewRow = {
  id: number;
  rating: number;
  body: string;
  created_at: string;
  author_name: string;
  target_name: string;
  hidden: number;
};

export function Resenas({ notify }: { notify: (t: string, tone?: "ok" | "error") => void }) {
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const load = useCallback(
    () =>
      api<{ reviews: ReviewRow[] }>("/api/cms/reviews")
        .then((d) => setReviews(d.reviews))
        .catch((e) => notify(e.message, "error")),
    [notify],
  );
  useEffect(() => {
    load();
  }, [load]);
  async function toggle(r: ReviewRow) {
    try {
      await api(`/api/cms/reviews/${r.id}/visibility`, { body: { hidden: !r.hidden } });
      notify(r.hidden ? "Opinión visible." : "Opinión oculta.");
      load();
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }
  return (
    <Section
      title="Opiniones"
      description="Solo existen opiniones de citas completadas. Ocultar una la retira del perfil público y del promedio, con constancia en la auditoría."
    >
      {!reviews ? (
        <Spinner />
      ) : !reviews.length ? (
        <p className="text-sm muted">Todavía no hay opiniones.</p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className={`rounded-xl p-4 ring-1 ring-tinta/10 ${r.hidden ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <strong className="min-w-0 break-words">{r.target_name}</strong>
                <span className="chip bg-amarillo/20 px-2 py-0.5 text-xs">★ {r.rating}/5</span>
                {!!r.hidden && <span className="chip bg-gris-claro px-2 py-0.5 text-xs">Oculta</span>}
                <button type="button" className="btn-outline btn-sm ml-auto" onClick={() => toggle(r)}>
                  {r.hidden ? "Mostrar" : "Ocultar"}
                </button>
              </div>
              {r.body && <p className="mt-2 text-sm">“{r.body}”</p>}
              <p className="mt-1 text-xs muted">
                {r.author_name} · {r.created_at}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

type HistoryRow = { id: number; version: number; created_at: string };
type AuditRow = { action: string; details: string; created_at: string };
const ACTIONS: Record<string, string> = {
  save_draft: "Borrador guardado",
  publish: "Publicación",
  restore_to_draft: "Versión restaurada al borrador",
  user_access: "Permiso de cuenta",
  moderate_review: "Moderación de opinión",
  upload_media: "Imagen subida",
  delete_media: "Imagen eliminada",
};

export function Historial({ onRestored, notify }: { onRestored: (draft: Cms) => void; notify: (t: string, tone?: "ok" | "error") => void }) {
  const [data, setData] = useState<{ history: HistoryRow[]; recent: AuditRow[] } | null>(null);
  useEffect(() => {
    api<{ history: HistoryRow[]; recent: AuditRow[] }>("/api/cms/history")
      .then(setData)
      .catch((e) => notify(e.message, "error"));
  }, [notify]);
  async function restore(h: HistoryRow) {
    if (!confirm(`¿Cargar la versión ${h.version} en el borrador? No se publica hasta que pulses Publicar.`)) return;
    try {
      const res = await api<{ draft: Cms }>("/api/cms/restore", { body: { id: h.id } });
      onRestored(res.draft);
      notify(`Versión ${h.version} cargada en el borrador.`);
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }
  return (
    <div className="space-y-5">
      <Section title="Publicaciones" description="Cada publicación se guarda. Para volver atrás, carga una versión en el borrador y publícala.">
        {!data ? (
          <Spinner />
        ) : !data.history.length ? (
          <p className="text-sm muted">Aún no hay publicaciones.</p>
        ) : (
          <ul className="divide-y divide-tinta/5">
            {data.history.map((h) => (
              <li key={h.id} className="flex items-center gap-3 py-2.5">
                <span className="font-semibold">v{h.version}</span>
                <span className="text-sm muted">{h.created_at}</span>
                <button type="button" className="btn-outline btn-sm ml-auto" onClick={() => restore(h)}>
                  Cargar en el borrador
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Actividad reciente">
        {!data ? (
          <Spinner />
        ) : (
          <ul className="divide-y divide-tinta/5 text-sm">
            {data.recent.map((a, i) => (
              <li key={`${a.created_at}-${i}`} className="flex gap-3 py-2">
                <span className="font-medium">{ACTIONS[a.action] ?? a.action}</span>
                <span className="ml-auto muted">{a.created_at}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
