import { CATEGORIES, CITIES } from "../../server/lib/catalog";
import { slugify } from "../../server/lib/listings";
import { cloudflareContext } from "../lib/context";
import type { Route } from "./+types/sitemap";

/** Solo páginas con inventario real: anuncios activos (no de muestra) y sus combinaciones ciudad/categoría. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const origin = new URL(request.url).origin;
  const rows = (
    await env.DB.prepare("SELECT id,title,category,city,updated_at FROM listings WHERE status='active' AND demo=0 ORDER BY id DESC LIMIT 5000").all<{
      id: number;
      title: string;
      category: string;
      city: string;
      updated_at: string;
    }>()
  ).results;
  const urls = new Map<string, string | undefined>([
    [`${origin}/`, undefined],
    [`${origin}/explorar`, undefined],
    [`${origin}/como-funciona`, undefined],
    [`${origin}/publicar`, undefined],
  ]);
  for (const r of rows) {
    const city = CITIES.find((c) => c.name === r.city);
    if (city && CATEGORIES.some((c) => c.slug === r.category && c.enabled)) urls.set(`${origin}/alquiler/${city.slug}/${r.category}`, undefined);
    urls.set(`${origin}/equipo/${r.id}-${slugify(r.title)}`, r.updated_at?.slice(0, 10));
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...urls]
    .map(([u, d]) => `  <url><loc>${u}</loc>${d ? `<lastmod>${d}</lastmod>` : ""}</url>`)
    .join("\n")}\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
