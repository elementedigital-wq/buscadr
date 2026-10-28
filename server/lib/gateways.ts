/**
 * Pasarelas de pago configurables desde el CMS (ADR 0013), al estilo de «WooCommerce → Ajustes →
 * Pagos»: cada medio se activa o desactiva, se ordena y tiene título y descripción para el paciente;
 * los que lo necesitan guardan datos (cuenta bancaria) y credenciales cifradas.
 *
 * - `sandbox`: tarjeta de PRUEBA dentro de buscaDR (no mueve dinero).
 * - `payphone`: tarjetas reales en la página segura de Payphone (cobros reales: requiere el
 *   Go/No-Go del Documento Maestro).
 * - `transferencia`: transferencia o depósito a la cuenta de buscaDR; la administración confirma
 *   el pago al ver el comprobante.
 * - `consultorio`: el paciente paga al profesional el día de la cita (sin comisión).
 *
 * En la tabla `payments`, `provider` es la clase de cobro (CHECK heredado: sandbox | payphone |
 * consultorio = fuera de una pasarela) y `gateway` el medio concreto.
 */
import type { Env } from "../env";
import { decryptJson, maskSecret, secretsKeyConfigured } from "./secrets";

export type GatewayId = "sandbox" | "payphone" | "transferencia" | "consultorio";
type Provider = "sandbox" | "payphone" | "consultorio";
type FieldDef = { key: string; label: string; hint?: string; options?: string[]; multiline?: boolean; max: number; required?: boolean };

export type GatewayDef = {
  id: GatewayId;
  name: string;
  /** online: se paga al reservar · manual: en línea con confirmación humana · offline: en el consultorio. */
  kind: "online" | "manual" | "offline";
  provider: Provider;
  /** Mueve dinero real (pide confirmación al activarla). */
  live: boolean;
  defaultTitle: string;
  defaultDescription: string;
  logo: string;
  fields: FieldDef[];
  secrets: { key: string; label: string; hint?: string; env: keyof Env }[];
};

export const GATEWAY_DEFS: GatewayDef[] = [
  {
    id: "sandbox",
    name: "buscaDR Pay · modo de prueba",
    kind: "online",
    provider: "sandbox",
    live: false,
    defaultTitle: "Tarjeta de crédito o débito (prueba)",
    defaultDescription: "Pago de prueba: no se cobra dinero real. Tarjeta 4111 1111 1111 1111.",
    logo: "credit-card",
    fields: [],
    secrets: [],
  },
  {
    id: "payphone",
    name: "Payphone",
    kind: "online",
    provider: "payphone",
    live: true,
    defaultTitle: "Tarjeta de crédito o débito",
    defaultDescription: "Pago seguro con Payphone: Visa, Mastercard, Diners Club, Discover o la app Payphone.",
    logo: "lock",
    fields: [],
    secrets: [
      { key: "token", label: "Token de la API", hint: "Payphone Developer → tu aplicación → Credenciales (token Bearer).", env: "PAYPHONE_TOKEN" },
      { key: "store_id", label: "Store ID", hint: "Identificador de tu tienda en Payphone.", env: "PAYPHONE_STORE_ID" },
    ],
  },
  {
    id: "transferencia",
    name: "Transferencia bancaria",
    kind: "manual",
    provider: "consultorio",
    live: true,
    defaultTitle: "Transferencia o depósito bancario",
    defaultDescription: "Transfiere a la cuenta de buscaDR y registra tu comprobante. Confirmamos tu pago y te avisamos.",
    logo: "building",
    fields: [
      { key: "bank", label: "Banco", max: 60, required: true },
      { key: "account_type", label: "Tipo de cuenta", options: ["Ahorros", "Corriente"], max: 20, required: true },
      { key: "account_number", label: "Número de cuenta", max: 30, required: true },
      { key: "holder", label: "Titular", max: 80, required: true },
      { key: "id_number", label: "RUC o cédula del titular", max: 20 },
      { key: "email", label: "Correo para comprobantes", max: 120 },
      { key: "instructions", label: "Instrucciones para el paciente", max: 400, multiline: true },
    ],
    secrets: [],
  },
  {
    id: "consultorio",
    name: "Pago en el consultorio",
    kind: "offline",
    provider: "consultorio",
    live: false,
    defaultTitle: "En el consultorio",
    defaultDescription: "Pagas directamente al profesional el día de tu cita.",
    logo: "clinic",
    fields: [],
    secrets: [],
  },
];
export const GATEWAY_MAP = new Map(GATEWAY_DEFS.map((g) => [g.id, g]));
export const isGatewayId = (x: unknown): x is GatewayId => typeof x === "string" && GATEWAY_MAP.has(x as GatewayId);

/** Pasarelas que se mostrarán como «Próximamente» (sin adaptador todavía: no se pueden activar). */
export const COMING_SOON = [
  { id: "kushki", name: "Kushki", note: "Tarjetas, transferencias y pagos recurrentes en Ecuador." },
  { id: "datafast", name: "Datafast / Nuvei", note: "Botón de pagos de la red Datafast." },
  { id: "deuna", name: "Deuna!", note: "Pagos con QR desde la app del Banco Pichincha." },
  { id: "paypal", name: "PayPal", note: "Pacientes del exterior y pagos internacionales." },
];

type Row = { id: string; enabled: number; sort: number; title: string; description: string; settings_json: string; secrets_enc: string; updated_at: string };

export type Gateway = GatewayDef & {
  enabled: boolean;
  /** Activa y lista para cobrar (credenciales o datos completos). */
  active: boolean;
  sort: number;
  title: string;
  description: string;
  settings: Record<string, string>;
  /** Por qué no puede activarse aún («Faltan las credenciales»…). */
  missing: string[];
  updated_at: string | null;
};

const parse = (s: string | undefined) => {
  try {
    const v = JSON.parse(s || "{}");
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
};

async function rows(db: D1Database): Promise<Row[]> {
  try {
    return (await db.prepare("SELECT * FROM payment_gateways").all<Row>()).results;
  } catch {
    return [];
  }
}

/** Credenciales efectivas: las del CMS (cifradas) y, si faltan, las variables de entorno de Cloudflare. */
export async function gatewaySecrets(env: Env, id: GatewayId, row?: Pick<Row, "secrets_enc"> | null) {
  const def = GATEWAY_MAP.get(id)!;
  const r =
    row === undefined
      ? await env.DB.prepare("SELECT secrets_enc FROM payment_gateways WHERE id=?")
          .bind(id)
          .first<Row>()
          .catch(() => null)
      : row;
  const stored = await decryptJson(env, r?.secrets_enc);
  return Object.fromEntries(def.secrets.map((s) => [s.key, stored[s.key] || String(env[s.env] ?? "")])) as Record<string, string>;
}

export async function getGateways(env: Env): Promise<Gateway[]> {
  const list = await rows(env.DB);
  const out: Gateway[] = [];
  for (const def of GATEWAY_DEFS) {
    const r = list.find((x) => x.id === def.id);
    // Sin la tabla (migración aún no aplicada): prueba y consultorio activos, como antes.
    const enabled = r ? !!r.enabled : def.id === "sandbox" || def.id === "consultorio";
    const settings = parse(r?.settings_json);
    const secrets = def.secrets.length ? await gatewaySecrets(env, def.id, r ?? null) : {};
    const missing = [
      ...def.fields.filter((f) => f.required && !settings[f.key]).map((f) => f.label),
      ...def.secrets.filter((s) => !secrets[s.key]).map((s) => s.label),
    ];
    out.push({
      ...def,
      enabled,
      active: enabled && !missing.length,
      sort: r?.sort ?? GATEWAY_DEFS.indexOf(def),
      title: r?.title || def.defaultTitle,
      description: r?.description || def.defaultDescription,
      settings,
      missing,
      updated_at: r?.updated_at ?? null,
    });
  }
  return out.sort((a, b) => a.sort - b.sort);
}

/** Medios para pagar en línea al reservar (orden del CMS) y si se acepta el pago en el consultorio. */
export async function paymentOptions(env: Env) {
  const all = await getGateways(env);
  const online = all.filter((g) => g.active && g.kind !== "offline");
  return { all, online, office: all.some((g) => g.id === "consultorio" && g.active) };
}

/** Vista para el CMS: sin credenciales, solo «configurada ••••1234» y su origen. */
export async function adminView(env: Env) {
  const list = await rows(env.DB);
  const gws = await getGateways(env);
  return Promise.all(
    gws.map(async (g) => {
      const r = list.find((x) => x.id === g.id);
      const stored = await decryptJson(env, r?.secrets_enc);
      return {
        id: g.id,
        name: g.name,
        kind: g.kind,
        live: g.live,
        logo: g.logo,
        enabled: g.enabled,
        active: g.active,
        sort: g.sort,
        title: g.title,
        description: g.description,
        default_title: g.defaultTitle,
        default_description: g.defaultDescription,
        settings: g.settings,
        fields: g.fields,
        missing: g.missing,
        updated_at: g.updated_at,
        secrets: g.secrets.map((s) => ({
          key: s.key,
          label: s.label,
          hint: s.hint ?? "",
          env: s.env,
          source: stored[s.key] ? "cms" : env[s.env] ? "cloudflare" : "",
          preview: maskSecret(stored[s.key] || (env[s.env] as string | undefined)),
        })),
      };
    }),
  ).then((gateways) => ({ gateways, coming_soon: COMING_SOON, secrets_key: secretsKeyConfigured(env) }));
}

/** Datos públicos de un medio (título, descripción y, para transferencias, la cuenta de destino). */
export const publicGateway = (g: Gateway) => ({
  id: g.id,
  kind: g.kind,
  title: g.title,
  description: g.description,
  ...(g.id === "transferencia" ? { bank: g.settings } : {}),
});
