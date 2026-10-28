/** Paneles del CMS Maestro: uno por pestaña, todos enlazados a lo que muestra el front end. */
import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { formatBytes } from "../../lib/image";
import type { Cms, PublicListing } from "../../lib/types";
import { TONES } from "../../../server/lib/catalog";
import { TONE_CLASS, TONE_LABEL } from "../CategoryTiles";
import { CmsIcon, Icon } from "../Icon";
import { Notice, Spinner } from "../ui";
import { ColorField, Grid, NumberField, Section, SelectField, TextField, Toggle, useEditor } from "./fields";
import { FontsSection } from "./fonts";
import { IconChooser, IconField } from "./icons";
import { ImageField, type MediaItem, UploadButton, useMedia } from "./media";
import { ROUTE_LABELS, type TabId, type Warning, contentWarnings, fieldId } from "./model";

const ROUTE_OPTIONS = Object.entries(ROUTE_LABELS) as [string, string][];

/* ------------------------------------------------------------------ Resumen */

export function Resumen({ version, dirty, onGo }: { version: number; dirty: boolean; onGo: (tab: TabId, path?: string) => void }) {
  const { config } = useEditor();
  const warnings = contentWarnings(config);
  const shortcuts: [TabId, string, string][] = [
    ["portada", "Portada", "Titular, imagen principal, buscador y secciones de la página de inicio"],
    ["marca", "Marca y estilo", "Colores, tipografías, logo, favicon y forma de los botones"],
    ["banners", "Banners", "Campañas con imagen y botón bajo el titular"],
    ["categorias", "Categorías", "Nombres, iconos, orden y visibilidad"],
    ["anuncios", "Anuncios", "Portada, frase y anuncios destacados (siempre rotulados)"],
    ["biblioteca", "Biblioteca", "Sube imágenes gratis (se guardan en Cloudflare D1)"],
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
              <span className="grid size-8 place-items-center rounded-full bg-turquesa font-display font-extrabold text-tinta">{n}</span>
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
              className="flex items-center gap-3 rounded-xl p-3 text-left ring-1 ring-black/10 hover:ring-morado"
            >
              <span className="flex-1">
                <span className="block font-semibold">{title}</span>
                <span className="block text-sm muted">{text}</span>
              </span>
              <Icon name="arrow" className="size-4 text-morado" />
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
      <Section title="Logo e isotipo" description="El logo va en la cabecera y el pie; el isotipo es el ícono de la pestaña del navegador y de la app.">
        <Grid>
          <ImageField path="theme.logo" label="Logo" maxSide={800} allowEmpty={false} hint="PNG o WebP con fondo transparente." />
          <ImageField path="theme.favicon" label="Isotipo / favicon" maxSide={256} allowEmpty={false} hint="Cuadrado, idealmente 256 × 256 px." />
        </Grid>
      </Section>
      <Section title="Colores" description="Por defecto, los HEX oficiales del Brand Deck buscaDR (lámina 04). Los avisos de contraste aparecen en Resumen.">
        <Grid>
          <ColorField path="theme.primary" label="Púrpura principal" hint="Botones principales, enlaces y precios." />
          <ColorField path="theme.secondary" label="Turquesa" hint="Acentos y botones secundarios (con texto oscuro). No usar como texto pequeño." />
          <ColorField path="theme.accent" label="Azul acento" hint="Detalles y gráficos." />
          <ColorField path="theme.neutral" label="Gris neutro" hint="Textos secundarios." />
          <ColorField path="theme.soft" label="Lila suave" hint="Fondos de íconos y etiquetas." />
          <ColorField path="theme.text" label="Texto" />
          <ColorField path="theme.background" label="Fondo general" />
          <ColorField path="theme.surface" label="Tarjetas" />
        </Grid>
      </Section>
      <FontsSection />
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
          <TextField path="hero.highlight" label="Parte destacada (púrpura)" max={130} />
          <TextField path="hero.description" label="Descripción" max={450} multiline />
          <TextField path="copy.welcome" label="Pregunta sobre el buscador" max={120} />
          <TextField path="home.searchPlaceholder" label="Ejemplo dentro del buscador" max={80} />
          <TextField path="hero.cta" label="Botón del buscador" max={60} />
          <TextField path="hero.secondaryCta" label="Botón «Publicar»" max={60} />
        </Grid>
      </Section>
      <Section
        title="Saludo y resumen"
        description="Con sesión iniciada, la portada saluda por el nombre y el resumen muestra lo más urgente (una reserva próxima o solicitudes por responder). Sin sesión, se muestra este resumen editable."
      >
        <Grid>
          <TextField path="home.greetingSubtitle" label="Frase bajo el saludo" max={80} wide />
          <TextField path="home.brief.eyebrow" label="Resumen: antetítulo" max={40} />
          <SelectField
            path="home.brief.category"
            label="Resumen: categoría del botón"
            options={[["", "Todo el catálogo"], ...config.categories.map((c) => [c.slug, c.name] as [string, string])]}
          />
          <TextField path="home.brief.text" label="Resumen: texto" max={220} multiline />
          <TextField path="home.brief.highlight" label="Resumen: parte resaltada (debe estar dentro del texto)" max={60} />
          <TextField path="home.brief.cta" label="Resumen: botón principal" max={40} />
          <TextField path="home.brief.secondary" label="Resumen: botón secundario («Publicar»)" max={40} />
          <TextField path="home.brief.footnote" label="Resumen: nota inferior" max={140} wide />
          <TextField path="home.servicesTitle" label="Fila de categorías: título" max={40} />
          <TextField path="home.servicesLink" label="Fila de categorías: enlace" max={30} />
        </Grid>
      </Section>
      <Section title="Imagen principal" description="Fotografía junto al titular, formato vertical 4:5. Usa fotos sin texto incrustado.">
        <Grid>
          <ImageField path="hero.image" label="Imagen" maxSide={1600} hint="Vacío = fotografía por defecto del Brand Deck." />
          <TextField path="home.heroImageAlt" label="Descripción de la imagen (accesibilidad)" max={140} />
          <TextField path="home.heroBadgeTitle" label="Etiqueta sobre la imagen: título" max={40} />
          <TextField path="home.heroBadgeText" label="Etiqueta sobre la imagen: texto" max={60} />
        </Grid>
      </Section>
      <Section
        title="Sugerencias bajo el buscador"
        description="Atajos de búsqueda (máximo 8)."
        actions={
          suggestions.length < 8 ? (
            <button
              type="button"
              className="btn-outline min-h-10 px-4 text-sm"
              onClick={() => update("home.suggestions", [...suggestions, "Nueva sugerencia"])}
            >
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
                className="btn-ghost min-h-11 px-3"
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
      <Section title="Así funciona (3 pasos)">
        <Grid>
          <TextField path="home.stepsTitle" label="Título" max={60} wide />
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid gap-3 rounded-xl bg-fondo p-3 sm:col-span-2 sm:grid-cols-2">
              <TextField path={`home.steps.${i}.title`} label={`Paso ${i + 1}: título`} max={60} />
              <TextField path={`home.steps.${i}.text`} label={`Paso ${i + 1}: texto`} max={180} />
              <IconField path={`home.steps.${i}.icon`} label={`Paso ${i + 1}: icono`} />
            </div>
          ))}
        </Grid>
      </Section>
      <Section title="Compromisos del piloto (4 tarjetas)" description="Solo promesas que el producto cumple hoy (docs/MARKETING_CLAIMS.md).">
        <Grid>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="grid gap-3 rounded-xl bg-fondo p-3 sm:col-span-2 sm:grid-cols-2">
              <TextField path={`home.promises.${i}.title`} label={`Tarjeta ${i + 1}: título`} max={60} />
              <TextField path={`home.promises.${i}.text`} label={`Tarjeta ${i + 1}: texto`} max={180} />
              <IconField path={`home.promises.${i}.icon`} label={`Tarjeta ${i + 1}: icono`} />
            </div>
          ))}
        </Grid>
      </Section>
      <Section title="Bloques finales">
        <Grid>
          <TextField path="home.ownerEyebrow" label="Propietarios: antetítulo" max={40} />
          <TextField path="home.ownerTitle" label="Propietarios: título" max={100} />
          <TextField path="home.ownerText" label="Propietarios: texto" max={260} multiline />
          <TextField path="home.whatsappEyebrow" label="WhatsApp: antetítulo" max={40} />
          <TextField path="home.whatsappTitle" label="WhatsApp: título" max={100} />
          <TextField path="home.whatsappText" label="WhatsApp: texto" max={260} multiline />
          <TextField path="home.eventsEyebrow" label="Eventos: antetítulo" max={40} />
          <TextField path="home.eventsTitle" label="Eventos: título" max={100} />
          <TextField path="home.eventsText" label="Eventos: texto" max={260} multiline />
          <TextField path="home.eventsButton" label="Eventos: enlace" max={50} />
        </Grid>
      </Section>
    </div>
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
        route: "explorar",
        category: "",
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
            <button type="button" className="btn-primary min-h-10 px-4 text-sm" onClick={add}>
              <Icon name="plus" className="size-4" /> Añadir banner
            </button>
          ) : null
        }
      >
        <Toggle path="layout.showBanners" label="Mostrar banners en la portada" />
        {!banners.length && <p className="mt-3 text-sm muted">Aún no hay banners. Añade uno para promocionar una categoría o una campaña.</p>}
        <div className="mt-4 space-y-4">
          {banners.map((b, i) => (
            <div key={b.id} className="rounded-xl p-4 ring-1 ring-black/10" data-field={`banners.${i}`} id={fieldId(`banners.${i}`)}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <strong>Banner {i + 1}</strong>
                <span className={`chip px-2 py-0.5 text-xs ${b.visible ? "bg-turquesa/15 text-tinta" : "bg-gris-claro text-gris"}`}>
                  {b.visible ? "Visible" : "Oculto"}
                </span>
                <div className="ml-auto flex gap-1">
                  <button type="button" className="btn-ghost min-h-9 px-2" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir">
                    ↑
                  </button>
                  <button type="button" className="btn-ghost min-h-9 px-2" disabled={i === banners.length - 1} onClick={() => move(i, 1)} aria-label="Bajar">
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn-danger min-h-9 px-3 text-sm"
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
                {b.route === "explorar" && (
                  <SelectField
                    path={`banners.${i}.category`}
                    label="Categoría (opcional)"
                    options={[["", "Todo el catálogo"], ...config.categories.map((c) => [c.slug, c.name] as [string, string])]}
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
  inicio: "Inicio (menú móvil)",
  explorar: "Explorar",
  publicar: "Publicar (botón de la cabecera y del menú móvil)",
  reservas: "Reservas",
  favoritos: "Favoritos",
  panel: "Mis equipos",
  cuenta: "Cuenta (menú móvil)",
};

const NAV_KEYS = ["inicio", "explorar", "publicar", "reservas", "favoritos", "panel", "cuenta"] as const;

export function Textos() {
  return (
    <div className="space-y-5">
      <Section title="Avisos y pie de página">
        <Grid>
          <TextField path="copy.pilotNotice" label="Franja superior (aviso del piloto)" max={350} wide />
          <TextField path="copy.footer" label="Pie de página" max={350} wide />
        </Grid>
      </Section>
      <Section title="Secciones de la portada">
        <Grid>
          <TextField path="copy.categoriesTitle" label="Categorías: título" max={120} />
          <TextField path="copy.categoriesSubtitle" label="Categorías: subtítulo" max={250} />
          <TextField path="copy.listingsTitle" label="Anuncios: título" max={120} />
          <TextField path="copy.listingsSubtitle" label="Anuncios: subtítulo" max={250} />
        </Grid>
      </Section>
      <Section title="Menú de navegación" description="Texto e icono de cada destino (cabecera, menú móvil y menú de la cuenta).">
        <div className="space-y-3">
          {NAV_KEYS.map((k) => (
            <div key={k} className="grid gap-3 rounded-xl bg-fondo p-3 sm:grid-cols-2">
              <TextField path={`navigation.${k}`} label={NAV_LABELS[k] ?? k} max={55} />
              <IconField path={`navigation.icons.${k}`} label="Icono" />
            </div>
          ))}
        </div>
      </Section>
      <Section title="Página de categorías">
        <Grid>
          <TextField path="home.categoriesPageTitle" label="Título" max={60} />
          <TextField path="home.categoriesPageSubtitle" label="Subtítulo" max={160} />
        </Grid>
      </Section>
      <Section title="Botones">
        <Grid>
          <TextField path="buttons.primary" label="Tarjeta de anuncio («Ver equipo»)" max={75} />
          <TextField path="buttons.explore" label="Enlace «Ver todo el catálogo» de la portada" max={75} />
          <TextField path="buttons.request" label="Solicitar reserva (ficha del equipo)" max={75} />
          <TextField path="buttons.publish" label="Publicar (bloque de propietarios)" max={75} />
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
          <NumberField path="layout.homeCategoryCount" label="Categorías en la portada" min={1} max={24} />
          <NumberField path="layout.homeListingCount" label="Anuncios en la portada" min={1} max={24} />
          <NumberField path="layout.exploreListingCount" label="Anuncios en Explorar" min={1} max={60} />
          <NumberField path="layout.columns" label="Columnas de tarjetas (escritorio)" min={1} max={4} />
          <SelectField
            path="layout.cardStyle"
            label="Densidad de las tarjetas"
            options={[
              ["spacious", "Amplia (foto 4:3)"],
              ["compact", "Compacta (foto 16:10)"],
            ]}
          />
        </Grid>
      </Section>
      <Section title="Qué mostrar" description="«Anuncio de muestra» siempre se muestra en los anuncios ilustrativos: no se puede ocultar.">
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle path="layout.showRatings" label="Valoraciones" hint="Sin reseñas se muestra «Nuevo en buscaDR»." />
          <Toggle path="layout.showBadges" label="Etiquetas (Destacado, Reserva inmediata, Entrega)" />
          <Toggle path="layout.showPrices" label="Precio por día en las tarjetas" />
          <Toggle path="layout.showTotals" label="Total para las fechas buscadas" hint="Incluye la tarifa de servicio. Recomendado (Documento Maestro §06)." />
          <Toggle path="layout.showMap" label="Mapa en Explorar y en la ficha" />
          <Toggle path="layout.showBanners" label="Banners en la portada" />
        </div>
      </Section>
      <Section title="Portada personalizada">
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle path="layout.showBrief" label="Resumen buscaDR" hint="Tarjeta con lo más urgente de cada persona o el mensaje editable." />
          <Toggle path="layout.showServicesRow" label="Fila de categorías con iconos" />
          <Toggle path="layout.showTracker" label="Seguimiento de la reserva activa" hint="Solo con sesión iniciada y una reserva confirmada o en curso." />
        </div>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ Categorías */

export function Categorias() {
  const { config, update, focusPath } = useEditor();
  const cats = [...config.categories].sort((a, b) => a.order - b.order);
  const reorder = (from: number, to: number) => {
    const list = [...cats];
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    update(
      "categories",
      list.map((c, i) => ({ ...c, order: i })),
    );
  };
  const patch = (slug: string, change: Partial<Cms["categories"][number]>) =>
    update(
      "categories",
      config.categories.map((c) => (c.slug === slug ? { ...c, ...change } : c)),
    );
  return (
    <Section
      title="Categorías"
      description="Cambia nombre, icono, orden y visibilidad. El identificador interno no cambia, así los anuncios existentes se conservan. Ocultar una categoría la retira de la portada y de los filtros."
    >
      <ul className="space-y-3">
        {cats.map((c, i) => (
          <li
            key={c.slug}
            id={fieldId(`categories.${c.slug}`)}
            data-field={`categories.${c.slug}`}
            className={`rounded-xl p-3 ring-1 ${focusPath === `categories.${c.slug}` ? "bg-turquesa/10 ring-2 ring-turquesa" : "ring-black/10"} ${c.visible ? "" : "opacity-70"}`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${TONE_CLASS[c.tone]}`}>
                <CmsIcon value={c.icon} className="size-6" />
              </span>
              <div className="min-w-40 flex-1">
                <label htmlFor={`cat-${c.slug}`} className="text-xs muted">
                  Nombre visible · <code>{c.slug}</code>
                </label>
                <input id={`cat-${c.slug}`} className="input" value={c.name} maxLength={55} onChange={(e) => patch(c.slug, { name: e.target.value })} />
              </div>
              <div className="flex items-center gap-1">
                <button type="button" className="btn-ghost min-h-10 px-2" disabled={i === 0} onClick={() => reorder(i, i - 1)} aria-label={`Subir ${c.name}`}>
                  ↑
                </button>
                <button
                  type="button"
                  className="btn-ghost min-h-10 px-2"
                  disabled={i === cats.length - 1}
                  onClick={() => reorder(i, i + 1)}
                  aria-label={`Bajar ${c.name}`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={c.visible}
                  onClick={() => patch(c.slug, { visible: !c.visible })}
                  className={`chip min-h-10 text-xs font-semibold ${c.visible ? "bg-morado text-white" : "bg-gris-claro text-tinta"}`}
                >
                  {c.visible ? "Visible" : "Oculta"}
                </button>
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="text-sm font-medium">
                <p className="mb-1.5">Icono</p>
                <IconChooser value={c.icon} label={c.name} onChange={(icon) => patch(c.slug, { icon })} />
              </div>
              <div className="text-sm font-medium">
                <p className="mb-1.5" id={`tone-${c.slug}`}>
                  Tono del recuadro
                </p>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby={`tone-${c.slug}`}>
                  {TONES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={c.tone === t}
                      onClick={() => patch(c.slug, { tone: t })}
                      className={`chip min-h-10 text-xs font-semibold ${TONE_CLASS[t]} ${c.tone === t ? "ring-2 ring-morado" : "ring-1 ring-black/10"}`}
                    >
                      {TONE_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
              <ImageField
                path={`categories.${config.categories.findIndex((x) => x.slug === c.slug)}.photo`}
                label="Fotografía de la tarjeta (página de categorías)"
                maxSide={900}
                wide
              />
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ------------------------------------------------------------------ Anuncios */

export function Anuncios() {
  const { config, update, focusPath } = useEditor();
  const [items, setItems] = useState<PublicListing[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    api<{ items: PublicListing[] }>("/api/listings?limit=60&log=0&sort=nuevos")
      .then((d) => setItems(d.items))
      .catch(() => setItems([]));
  }, []);
  const set = (id: number, change: Partial<{ cover: string; headline: string; featured: boolean }>) => {
    const current = config.listings[String(id)] ?? { cover: "", headline: "", featured: false };
    update(`listings.${id}`, { ...current, ...change });
  };
  const list = (items ?? []).filter((l) => !q || `${l.title} ${l.category_name} ${l.city} ${l.sector}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Section
      title="Anuncios publicados"
      description="Ajusta la portada y la frase que se muestran en tarjetas, y destaca anuncios (aparecen primero, siempre con la etiqueta «Destacado»). No modifica precios, reseñas, revisiones ni datos del propietario."
    >
      <label htmlFor="listing-search" className="sr-only">
        Buscar anuncio
      </label>
      <input id="listing-search" className="input mb-4" placeholder="Buscar por título, categoría o zona" value={q} onChange={(e) => setQ(e.target.value)} />
      {!items ? (
        <Spinner />
      ) : !list.length ? (
        <p className="text-sm muted">No hay anuncios publicados que coincidan. La moderación se hace en Administración.</p>
      ) : (
        <ul className="space-y-3">
          {list.map((l) => {
            const o = config.listings[String(l.id)] ?? { cover: "", headline: "", featured: false };
            const path = `listings.${l.id}`;
            return (
              <li
                key={l.id}
                id={fieldId(path)}
                data-field={path}
                className={`rounded-xl p-4 ring-1 ${focusPath === path ? "bg-turquesa/10 ring-2 ring-turquesa" : "ring-black/10"}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{l.title}</strong>
                  <span className="chip bg-lila px-2 py-0.5 text-xs text-morado">{l.category_name}</span>
                  {l.demo && <span className="chip bg-[#fff6dc] px-2 py-0.5 text-xs">Anuncio de muestra</span>}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={o.featured}
                    onClick={() => set(l.id, { featured: !o.featured })}
                    className={`chip ml-auto min-h-9 text-xs font-semibold ${o.featured ? "bg-morado text-white" : "bg-fondo ring-1 ring-black/10"}`}
                  >
                    {o.featured ? "★ Destacado" : "Destacar"}
                  </button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-start">
                  <div className="flex items-center gap-3">
                    <span className="grid size-20 place-items-center overflow-hidden rounded-xl bg-fondo ring-1 ring-black/10">
                      {o.cover || l.photo ? (
                        <img src={o.cover || l.photo || ""} alt="" className="size-full object-cover" />
                      ) : (
                        <Icon name="camera" className="muted" />
                      )}
                    </span>
                    <div className="flex flex-col gap-1">
                      <UploadButton maxSide={1200} label="Portada" onUploaded={(m) => set(l.id, { cover: m.url })} />
                      {o.cover && (
                        <button type="button" className="text-xs font-semibold text-morado underline" onClick={() => set(l.id, { cover: "" })}>
                          Usar la del propietario
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label htmlFor={`headline-${l.id}`} className="text-sm font-medium">
                      Frase en la tarjeta
                    </label>
                    <input
                      id={`headline-${l.id}`}
                      className="input mt-1"
                      maxLength={100}
                      placeholder="Opcional · ej.: Ideal para patios y fachadas"
                      value={o.headline}
                      onChange={(e) => set(l.id, { headline: e.target.value })}
                    />
                    <p className="mt-1 text-xs muted">Vacía = sin frase. Evita afirmaciones no demostradas.</p>
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
        className={`mb-4 grid place-items-center rounded-xl border-2 border-dashed p-6 text-center text-sm ${drag ? "border-morado bg-morado/5" : "border-black/15"}`}
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
            <li key={m.id} className="overflow-hidden rounded-xl ring-1 ring-black/10">
              <span className="grid aspect-video place-items-center bg-fondo">
                {m.mime.startsWith("font/") ? (
                  <span className="flex flex-col items-center gap-1 text-morado">
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
                    className="font-semibold text-morado underline"
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
  listings: number;
  rentals: number;
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
      description="Activa o suspende cuentas reales del piloto. Suspender cierra sus sesiones y oculta el acceso. Las cuentas de administración están protegidas."
    >
      {!users ? (
        <Spinner />
      ) : !users.length ? (
        <p className="text-sm muted">Sin usuarios registrados.</p>
      ) : (
        <ul className="divide-y divide-black/5">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{u.name}</p>
                <p className="truncate text-xs muted">
                  {u.email} · {u.staff_role === "admin" ? "Administración" : u.role === "owner" ? "Propietario" : "Arrendatario"} · {u.city} · {u.listings}{" "}
                  anuncios · {u.rentals} alquileres
                </p>
              </div>
              {u.staff_role === "admin" ? (
                <span className="chip bg-fondo text-xs">Protegida</span>
              ) : (
                <button type="button" className={`${u.enabled ? "btn-danger" : "btn-outline"} min-h-9 px-3 text-sm`} onClick={() => toggle(u)}>
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
  direction: string;
  author_name: string;
  target_name: string;
  listing_title: string;
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
      notify(r.hidden ? "Reseña visible." : "Reseña oculta.");
      load();
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }
  return (
    <Section title="Reseñas" description="Solo existen reseñas de alquileres completados. Ocultar una la retira de la ficha pública y del promedio.">
      {!reviews ? (
        <Spinner />
      ) : !reviews.length ? (
        <p className="text-sm muted">Todavía no hay reseñas.</p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className={`rounded-xl p-4 ring-1 ring-black/10 ${r.hidden ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <strong>{r.listing_title}</strong>
                <span className="text-xs muted">{r.direction === "a_propietario" ? `para ${r.target_name}` : `a quien alquiló (${r.target_name})`}</span>
                <span className="chip bg-[#fff6dc] px-2 py-0.5 text-xs">★ {r.rating}/5</span>
                {!!r.hidden && <span className="chip bg-gris-claro px-2 py-0.5 text-xs">Oculta</span>}
                <button type="button" className="btn-outline ml-auto min-h-9 px-3 text-sm" onClick={() => toggle(r)}>
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
  moderate_review: "Moderación de reseña",
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
          <ul className="divide-y divide-black/5">
            {data.history.map((h) => (
              <li key={h.id} className="flex items-center gap-3 py-2.5">
                <span className="font-semibold">v{h.version}</span>
                <span className="text-sm muted">{h.created_at}</span>
                <button type="button" className="btn-outline ml-auto min-h-9 px-3 text-sm" onClick={() => restore(h)}>
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
          <ul className="divide-y divide-black/5 text-sm">
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
