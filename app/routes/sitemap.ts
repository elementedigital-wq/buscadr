import { CITIES, SPECIALTIES } from "../../server/lib/catalog";
import { cloudflareContext } from "../lib/context";
import type { Route } from "./+types/sitemap";

/** Solo páginas con oferta real: perfiles activos (no de muestra) y sus combinaciones ciudad/especialidad. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(cloudflareContext);
  const origin = new URL(request.url).origin;
  const rows = (
    await env.DB.prepare("SELECT slug,specialty,city,updated_at FROM practitioners WHERE status='active' AND demo=0 ORDER BY id DESC LIMIT 5000").all<{
      slug: string;
      specialty: string;
      city: string;
      updated_at: string;
    }>()
  ).results;
  const urls = new Map<string, string | undefined>(
    ["/", "/buscar", "/especialidades", "/como-funciona", "/para-profesionales", "/planes", "/privacidad"].map((p) => [`${origin}${p}`, undefined]),
  );
  for (const r of rows) {
    const city = CITIES.find((c) => c.name === r.city);
    if (city && SPECIALTIES.some((s) => s.slug === r.specialty && s.enabled)) urls.set(`${origin}/medicos/${city.slug}/${r.specialty}`, undefined);
    urls.set(`${origin}/doctor/${r.slug}`, r.updated_at?.slice(0, 10));
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...urls]
    .map(([u, d]) => `  <url><loc>${u}</loc>${d ? `<lastmod>${d}</lastmod>` : ""}</url>`)
    .join("\n")}\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
