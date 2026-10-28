/**
 * CMS · Especialidades y categorías: edita las 83 especialidades base y sus 11 categorías (nombre,
 * ícono, tono, orden, visibilidad) y permite AGREGAR categorías y especialidades propias. Los slugs
 * son permanentes: los perfiles guardan el slug, por eso las propias solo se eliminan si no las usa
 * nadie en el borrador (el servidor conserva las que tengan perfiles aunque se oculten).
 */
import { useMemo, useState } from "react";
import { TONES } from "../../../server/lib/catalog";
import type { Cms } from "../../lib/types";
import { CmsIcon, Icon } from "../Icon";
import { TONE_LABEL } from "../Specialties";
import { Notice, TONE_CLASS } from "../ui";
import { Section, useEditor } from "./fields";
import { IconChooser } from "./icons";
import { fieldId } from "./model";

type Category = Cms["categories"][number];
type Specialty = Cms["specialties"][number];
type Tone = Specialty["tone"];

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .slice(0, 7)
    .join("-")
    .slice(0, 60);

/** Slug nuevo que no choque con ninguno existente (base o propio). */
const uniqueSlug = (name: string, taken: Set<string>) => {
  const base = slugify(name) || "especialidad";
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  return slug;
};

function ToneRadios({ value, onChange, label }: { value: Tone; onChange: (t: Tone) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {TONES.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={value === t}
          onClick={() => onChange(t)}
          className={`chip min-h-10 text-xs font-semibold ${TONE_CLASS[t]} ${value === t ? "ring-2 ring-azul" : "ring-1 ring-tinta/10"}`}
        >
          {TONE_LABEL[t]}
        </button>
      ))}
    </div>
  );
}

function VisibleSwitch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${label}: ${on ? "visible" : "oculta"}`}
      onClick={onChange}
      className={`chip min-h-10 shrink-0 text-xs font-semibold ${on ? "bg-azul text-white" : "bg-gris-claro text-tinta"}`}
    >
      {on ? "Visible" : "Oculta"}
    </button>
  );
}

/* ------------------------------------------------------------------ Categorías */

function Categories() {
  const { config, update, focusPath } = useEditor();
  const cats = [...config.categories].sort((a, b) => a.order - b.order);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const set = (next: Category[]) =>
    update(
      "categories",
      next.map((c, i) => ({ ...c, order: i })),
    );
  const patch = (slug: string, change: Partial<Category>) => set(cats.map((c) => (c.slug === slug ? { ...c, ...change } : c)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...cats];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set(next);
  };
  const used = (slug: string) => config.specialties.filter((s) => s.category === slug).length;
  function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const clean = name.trim();
    if (clean.length < 3) return setError("Escribe un nombre de al menos 3 letras.");
    if (cats.some((c) => c.name.toLowerCase() === clean.toLowerCase())) return setError("Ya existe una categoría con ese nombre.");
    if (cats.filter((c) => c.custom).length >= 30) return setError("Puedes agregar hasta 30 categorías propias.");
    const slug = uniqueSlug(clean, new Set(cats.map((c) => c.slug)));
    set([...cats, { slug, name: clean, icon: "kit-medical", tone: "azul", visible: true, order: cats.length, custom: true }]);
    setName("");
  }
  return (
    <Section
      title="Categorías"
      description="Agrupan las especialidades en el sitio (página Especialidades) y en el formulario del profesional. Ocultar una categoría oculta sus especialidades."
    >
      <ul className="space-y-2">
        {cats.map((c, i) => {
          const path = `categories.${c.slug}`;
          return (
            <li
              key={c.slug}
              id={fieldId(path)}
              data-field={path}
              className={`rounded-xl p-3 ring-1 ${focusPath === path ? "bg-celeste ring-2 ring-azul" : "ring-tinta/10"} ${c.visible ? "" : "opacity-70"}`}
            >
              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                <span className={`grid size-11 place-items-center rounded-xl ${TONE_CLASS[c.tone]}`}>
                  <CmsIcon value={c.icon} className="size-5" />
                </span>
                <div className="min-w-0">
                  <label htmlFor={`cat-${c.slug}`} className="text-xs muted">
                    {c.custom ? "Categoría propia" : "Categoría base"} · {used(c.slug)} especialidades
                  </label>
                  <input id={`cat-${c.slug}`} className="input" value={c.name} maxLength={60} onChange={(e) => patch(c.slug, { name: e.target.value })} />
                </div>
                <div className="col-span-2 flex flex-wrap items-center gap-1 sm:col-span-1">
                  <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Subir ${c.name}`}>
                    <Icon name="chevron-up" className="size-4" />
                  </button>
                  <button type="button" className="icon-btn" disabled={i === cats.length - 1} onClick={() => move(i, 1)} aria-label={`Bajar ${c.name}`}>
                    <Icon name="chevron-down" className="size-4" />
                  </button>
                  <VisibleSwitch on={c.visible} label={c.name} onChange={() => patch(c.slug, { visible: !c.visible })} />
                  {c.custom && (
                    <button
                      type="button"
                      className="btn-danger btn-sm"
                      disabled={used(c.slug) > 0}
                      title={used(c.slug) ? "Mueve primero sus especialidades a otra categoría" : undefined}
                      onClick={() => confirm(`¿Eliminar la categoría «${c.name}»?`) && set(cats.filter((x) => x.slug !== c.slug))}
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <IconChooser value={c.icon} label={c.name} onChange={(icon) => patch(c.slug, { icon })} />
                <ToneRadios value={c.tone} label={`Tono de ${c.name}`} onChange={(tone) => patch(c.slug, { tone })} />
              </div>
            </li>
          );
        })}
      </ul>
      <form onSubmit={add} className="mt-4 grid gap-2 rounded-xl bg-fondo p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="field">
          Nueva categoría
          <input
            className="input"
            value={name}
            maxLength={60}
            placeholder="Ej.: Medicina alternativa y complementaria"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button type="submit" className="btn-primary">
          <Icon name="plus" className="size-4" /> Agregar categoría
        </button>
        {error && <p className="text-sm text-alerta-ink sm:col-span-2">{error}</p>}
      </form>
    </Section>
  );
}

/* ------------------------------------------------------------------ Especialidades */

const EMPTY = { name: "", professional: "", category: "", keywords: "" };

function NewSpecialty({ onDone }: { onDone: (slug: string) => void }) {
  const { config, update } = useEditor();
  const [f, setF] = useState({ ...EMPTY, category: config.categories[0]?.slug ?? "" });
  const [error, setError] = useState("");
  function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const name = f.name.trim();
    if (name.length < 3) return setError("Escribe el nombre de la especialidad (mínimo 3 letras).");
    if (config.specialties.some((s) => s.name.toLowerCase() === name.toLowerCase())) return setError("Ya existe una especialidad con ese nombre.");
    if (config.specialties.filter((s) => s.custom).length >= 120) return setError("Puedes agregar hasta 120 especialidades propias.");
    const slug = uniqueSlug(name, new Set(config.specialties.map((s) => s.slug)));
    const cat = config.categories.find((c) => c.slug === f.category);
    const max = Math.max(0, ...config.specialties.map((s) => s.order));
    update("specialties", [
      ...config.specialties,
      {
        slug,
        name,
        professional: f.professional.trim() || name,
        category: f.category,
        icon: cat?.icon ?? "stethoscope",
        tone: cat?.tone ?? "azul",
        keywords: f.keywords.trim(),
        visible: true,
        order: Math.min(299, max + 1),
        custom: true,
      },
    ]);
    setF({ ...EMPTY, category: f.category });
    onDone(slug);
  }
  return (
    <form onSubmit={add} className="grid gap-3 rounded-xl bg-fondo p-4 sm:grid-cols-2">
      <p className="font-semibold sm:col-span-2">Nueva especialidad</p>
      <label className="field">
        Nombre
        <input
          className="input"
          required
          maxLength={55}
          value={f.name}
          placeholder="Ej.: Medicina hiperbárica"
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
      </label>
      <label className="field">
        Profesional (singular)
        <input
          className="input"
          maxLength={60}
          value={f.professional}
          placeholder="Ej.: Especialista en medicina hiperbárica"
          onChange={(e) => setF({ ...f, professional: e.target.value })}
        />
      </label>
      <label className="field">
        Categoría
        <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
          {config.categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Palabras de búsqueda
        <input
          className="input"
          maxLength={300}
          value={f.keywords}
          placeholder="Ej.: oxigeno camara heridas buceo"
          onChange={(e) => setF({ ...f, keywords: e.target.value })}
        />
      </label>
      {error && <p className="text-sm text-alerta-ink sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <button type="submit" className="btn-primary">
          <Icon name="plus" className="size-4" /> Agregar especialidad
        </button>
        <span className="ml-3 text-xs muted">Toma el ícono y el tono de su categoría; cámbialos después si quieres.</span>
      </div>
    </form>
  );
}

function SpecialtyRow({ s, index, total, move }: { s: Specialty; index: number; total: number; move: (from: number, to: number) => void }) {
  const { config, update, focusPath } = useEditor();
  const path = `specialties.${s.slug}`;
  const [open, setOpen] = useState(focusPath === path);
  const patch = (change: Partial<Specialty>) =>
    update(
      "specialties",
      config.specialties.map((x) => (x.slug === s.slug ? { ...x, ...change } : x)),
    );
  const catName = config.categories.find((c) => c.slug === s.category)?.name ?? s.category;
  return (
    <li
      id={fieldId(path)}
      data-field={path}
      className={`rounded-xl p-3 ring-1 ${focusPath === path ? "bg-celeste ring-2 ring-azul" : "ring-tinta/10"} ${s.visible ? "" : "opacity-70"}`}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <span className={`grid size-11 place-items-center rounded-xl ${TONE_CLASS[s.tone]}`}>
          <CmsIcon value={s.icon} className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold break-words">{s.name}</p>
          <p className="text-xs muted">
            {catName}
            {s.custom ? " · propia" : ""} · <code>{s.slug}</code>
          </p>
        </div>
        <div className="col-span-2 flex flex-wrap items-center gap-1 sm:col-span-1">
          <button type="button" className="icon-btn" disabled={index === 0} onClick={() => move(index, index - 1)} aria-label={`Subir ${s.name}`}>
            <Icon name="chevron-up" className="size-4" />
          </button>
          <button type="button" className="icon-btn" disabled={index === total - 1} onClick={() => move(index, index + 1)} aria-label={`Bajar ${s.name}`}>
            <Icon name="chevron-down" className="size-4" />
          </button>
          <VisibleSwitch on={s.visible} label={s.name} onChange={() => patch({ visible: !s.visible })} />
          <button type="button" className="btn-outline btn-sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? "Cerrar" : "Editar"}
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-3 grid gap-3 border-t border-tinta/5 pt-3 sm:grid-cols-2">
          <label className="field">
            Nombre visible
            <input className="input" value={s.name} maxLength={55} onChange={(e) => patch({ name: e.target.value })} />
          </label>
          <label className="field">
            Profesional (singular)
            <input className="input" value={s.professional} maxLength={60} onChange={(e) => patch({ professional: e.target.value })} />
          </label>
          <label className="field">
            Categoría
            <select className="input" value={s.category} onChange={(e) => patch({ category: e.target.value })}>
              {config.categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Palabras de búsqueda
            <input className="input" value={s.keywords} maxLength={300} onChange={(e) => patch({ keywords: e.target.value })} />
          </label>
          <div className="text-sm font-medium">
            <p className="mb-1.5">Ícono</p>
            <IconChooser value={s.icon} label={s.name} onChange={(icon) => patch({ icon })} />
          </div>
          <div className="text-sm font-medium">
            <p className="mb-1.5">Tono del recuadro</p>
            <ToneRadios value={s.tone} label={`Tono de ${s.name}`} onChange={(tone) => patch({ tone })} />
          </div>
          {s.custom && (
            <div className="sm:col-span-2">
              <button
                type="button"
                className="btn-danger btn-sm"
                onClick={() =>
                  confirm(`¿Eliminar «${s.name}»? Si algún profesional ya la eligió, mejor ocúltala para no dejar su perfil sin especialidad.`) &&
                  update(
                    "specialties",
                    config.specialties.filter((x) => x.slug !== s.slug),
                  )
                }
              >
                Eliminar especialidad propia
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function Specialties() {
  const { config, update } = useEditor();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState("");
  const list = useMemo(() => [...config.specialties].sort((a, b) => a.order - b.order), [config.specialties]);
  const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const needle = norm(q.trim());
  const shown = list.filter((s) => (!cat || s.category === cat) && (!needle || norm(`${s.name} ${s.professional} ${s.keywords} ${s.slug}`).includes(needle)));
  const move = (from: number, to: number) => {
    const a = shown[from];
    const b = shown[to];
    if (!a || !b) return;
    // Intercambia el orden de las dos especialidades visibles en la lista filtrada.
    update(
      "specialties",
      config.specialties.map((x) => (x.slug === a.slug ? { ...x, order: b.order } : x.slug === b.slug ? { ...x, order: a.order } : x)),
    );
  };
  const visible = list.filter((s) => s.visible).length;
  return (
    <Section
      title="Especialidades"
      description={`${list.length} especialidades (${visible} visibles, ${list.filter((s) => s.custom).length} propias). El orden define cuáles aparecen primero en la portada y en los filtros.`}
      actions={
        <button type="button" className="btn-primary btn-sm" aria-expanded={adding} onClick={() => setAdding((v) => !v)}>
          <Icon name={adding ? "x" : "plus"} className="size-4" /> {adding ? "Cancelar" : "Agregar especialidad"}
        </button>
      }
    >
      {adding && (
        <div className="mb-4">
          <NewSpecialty
            onDone={(slug) => {
              setAdding(false);
              setAdded(slug);
              setQ("");
              setCat("");
            }}
          />
        </div>
      )}
      {added && (
        <div className="mb-4">
          <Notice tone="success">Especialidad agregada al borrador. Publica para que aparezca en el sitio y en el formulario de los profesionales.</Notice>
        </div>
      )}
      <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
        <label className="relative">
          <span className="sr-only">Buscar especialidad</span>
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-gris" />
          <input className="input pl-10" placeholder="Buscar por nombre o palabra clave" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label>
          <span className="sr-only">Filtrar por categoría</span>
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Todas las categorías</option>
            {config.categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {shown.length ? (
        <ul className="space-y-2">
          {shown.map((s, i) => (
            <SpecialtyRow key={s.slug} s={s} index={i} total={shown.length} move={move} />
          ))}
        </ul>
      ) : (
        <p className="text-sm muted">Ninguna especialidad coincide. Puedes agregarla con «Agregar especialidad».</p>
      )}
    </Section>
  );
}

export function Especialidades() {
  return (
    <div className="space-y-5">
      <Specialties />
      <Categories />
    </div>
  );
}
