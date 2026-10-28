/** Primitivas de proximidad. Las distancias son en línea recta, NO tiempos de llegada. */
export const EARTH_KM = 6371.0088;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number | null {
  const n = [lat1, lon1, lat2, lon2].map(Number);
  if (n.some((v) => !Number.isFinite(v))) return null;
  const [a, b, c, d] = n.map((v) => (v * Math.PI) / 180);
  const x = Math.sin((c - a) / 2) ** 2 + Math.cos(a) * Math.cos(c) * Math.sin((d - b) / 2) ** 2;
  return EARTH_KM * 2 * Math.asin(Math.min(1, Math.sqrt(x)));
}

export function bbox(lat: number, lng: number, radiusKm: number) {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return {
    minLat: Math.max(-90, lat - dLat),
    maxLat: Math.min(90, lat + dLat),
    minLng: Math.max(-180, lng - dLng),
    maxLng: Math.min(180, lng + dLng),
  };
}

const ALPHABET = "0123456789bcdefghjkmnpqrstuvwxyz";

export function geohash(lat: number, lng: number, precision = 7) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new Error("Coordenadas inválidas");
  }
  let result = "";
  let even = true;
  let bit = 0;
  let ch = 0;
  const ranges: [number, number][] = [
    [-180, 180],
    [-90, 90],
  ];
  while (result.length < precision) {
    const i = even ? 0 : 1;
    const mid = (ranges[i][0] + ranges[i][1]) / 2;
    if ((even ? lng : lat) >= mid) {
      ch |= 1 << (4 - bit);
      ranges[i][0] = mid;
    } else ranges[i][1] = mid;
    even = !even;
    if (bit < 4) bit++;
    else {
      result += ALPHABET[ch];
      bit = 0;
      ch = 0;
    }
  }
  return result;
}

/**
 * Geoprivacidad (Documento Maestro §14): la ficha pública muestra una posición aproximada
 * (~1 km), nunca la coordenada exacta registrada por el profesional.
 */
export const approximate = (value: number | null) => (value == null ? null : Math.round(value * 100) / 100);
