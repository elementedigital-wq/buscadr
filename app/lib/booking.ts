import type { ListingDetail } from "./types";

/** Opciones de duración según las tarifas del anuncio (ficha y paso 1 de la reserva). */
export function durationOptions(l: Pick<ListingDetail, "price_hour_cents" | "price_week_cents" | "min_hours">) {
  const opts: { key: string; hours: number; label: string }[] = [];
  if (l.price_hour_cents > 0) for (const h of [4, 8]) if (h >= l.min_hours) opts.push({ key: `${h}h`, hours: h, label: `${h} horas` });
  for (const d of [1, 2, 3]) if (d * 24 >= l.min_hours) opts.push({ key: `${d}d`, hours: d * 24, label: d === 1 ? "1 día" : `${d} días` });
  opts.push({ key: "7d", hours: 168, label: "1 semana" });
  return opts;
}
