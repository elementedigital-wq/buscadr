/**
 * Tarifas y comisiones (Documento Maestro §4). Importes enteros en centavos de USD.
 *
 * - Cada profesional define su tarifa presencial y su tarifa virtual (pueden ser distintas).
 * - buscaDR cobra una comisión (BUSCADR_FEE_BPS, 8 % por defecto) solo sobre citas pagadas en línea
 *   con buscaDR Pay. El pago en el consultorio no genera comisión.
 * - El paciente ve siempre el total antes de confirmar; no hay cargos ocultos.
 */
export const feeBps = (env: { BUSCADR_FEE_BPS?: string }) => {
  const n = Number(env.BUSCADR_FEE_BPS);
  return Number.isInteger(n) && n >= 0 && n <= 3000 ? n : 800;
};

export type Price = { price_cents: number; fee_cents: number; net_cents: number; fee_bps: number };

export function priceFor(p: { price_in_person_cents: number; price_virtual_cents: number }, modality: "presencial" | "virtual", online: boolean, bps: number): Price {
  const price = modality === "virtual" ? p.price_virtual_cents : p.price_in_person_cents;
  const fee = online ? Math.round((price * bps) / 10_000) : 0;
  return { price_cents: price, fee_cents: fee, net_cents: price - fee, fee_bps: online ? bps : 0 };
}

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
