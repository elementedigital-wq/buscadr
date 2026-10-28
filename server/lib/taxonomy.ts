/**
 * Taxonomía efectiva: categorías y especialidades base (`taxonomy-data.ts`) con los cambios y las
 * especialidades propias publicadas en el CMS. La usan la búsqueda, el perfil profesional, la
 * administración, WhatsApp, el catálogo público, las landings y el sitemap.
 *
 * Se guarda en memoria del isolate por versión publicada: cada llamada solo lee el número de versión
 * (consulta mínima) y vuelve a interpretar la configuración únicamente si cambió.
 */
import { readConfig } from "../cms/model";
import { CATEGORIES, SPECIALTIES, type Tone, guessSpecialty } from "./catalog";

export type TaxSpecialty = {
  slug: string;
  name: string;
  professional: string;
  category: string;
  icon: string;
  tone: Tone;
  visible: boolean;
  custom: boolean;
  keywords: string[];
};
export type TaxCategory = { slug: string; name: string; icon: string; tone: Tone; visible: boolean; custom: boolean };
export type Taxonomy = {
  categories: TaxCategory[];
  specialties: TaxSpecialty[];
  map: Map<string, TaxSpecialty>;
  /** Especialidad sugerida para un texto libre, entre las visibles. */
  guess: (text: string) => string | null;
  nameOf: (slug: string) => string;
};

function build(config: ReturnType<typeof readConfig>): Taxonomy {
  const categories: TaxCategory[] = config.categories.map(({ order: _o, ...c }) => c);
  const hiddenCats = new Set(categories.filter((c) => !c.visible).map((c) => c.slug));
  const specialties: TaxSpecialty[] = config.specialties.map((s) => ({
    slug: s.slug,
    name: s.name,
    professional: s.professional,
    category: s.category,
    icon: s.icon,
    tone: s.tone,
    // Una categoría oculta oculta también sus especialidades.
    visible: s.visible && !hiddenCats.has(s.category),
    custom: s.custom,
    keywords: s.keywords.split(/\s+/).filter(Boolean),
  }));
  const map = new Map(specialties.map((s) => [s.slug, s]));
  const visible = specialties.filter((s) => s.visible);
  return {
    categories,
    specialties,
    map,
    guess: (text) => guessSpecialty(text, visible),
    nameOf: (slug) => map.get(slug)?.name ?? slug,
  };
}

/** Taxonomía base, sin CMS (pruebas, base de datos aún sin crear). */
export const BASE_TAXONOMY = build(readConfig(null));

let cached: { version: number; tax: Taxonomy } | null = null;

export async function getTaxonomy(db: D1Database | undefined): Promise<Taxonomy> {
  if (!db) return BASE_TAXONOMY;
  try {
    const row = await db.prepare("SELECT version FROM cms_site WHERE id='main'").first<{ version: number }>();
    if (!row) return BASE_TAXONOMY;
    if (cached?.version === row.version) return cached.tax;
    const full = await db.prepare("SELECT published_json,version FROM cms_site WHERE id='main'").first<{ published_json: string; version: number }>();
    const tax = build(readConfig(full?.published_json));
    cached = { version: full?.version ?? row.version, tax };
    return tax;
  } catch {
    return BASE_TAXONOMY;
  }
}

/** Para comparar: la lista base completa (sin CMS). */
export const BASE_SLUGS = new Set(SPECIALTIES.map((s) => s.slug));
export const BASE_CATEGORY_SLUGS = new Set(CATEGORIES.map((c) => c.slug));
