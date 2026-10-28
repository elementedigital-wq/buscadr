const encoder = new TextEncoder();

export const hex = (bytes: ArrayBuffer | Uint8Array) =>
  Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), (x) => x.toString(16).padStart(2, "0")).join("");

export const randomHex = (n: number) => {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return hex(bytes);
};

export const sha256 = async (value: string) => hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));

/** base64url sin relleno (formato de los tokens y hashes de la v0.3). */
export function b64url(bytes: Uint8Array) {
  let s = "";
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unb64url(s: string): Uint8Array<ArrayBuffer> {
  const clean = s.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(clean.padEnd(Math.ceil(clean.length / 4) * 4, "="));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Comparación en tiempo constante: compara resúmenes SHA-256 para no filtrar longitudes. */
export async function timingSafeEqualText(a: string, b: string) {
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", encoder.encode(a)), crypto.subtle.digest("SHA-256", encoder.encode(b))]);
  const ax = new Uint8Array(x);
  const by = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < ax.length; i++) diff |= ax[i] ^ by[i];
  return diff === 0 && a.length === b.length;
}

const fromHex = (s: string): Uint8Array<ArrayBuffer> => {
  const pairs = s.match(/../g) ?? [];
  const out = new Uint8Array(new ArrayBuffer(pairs.length));
  pairs.forEach((x, i) => {
    out[i] = Number.parseInt(x, 16);
  });
  return out;
};

async function pbkdf2Bits(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256));
}

/**
 * Formato actual: `pbkdf2-sha256:<iter>:<saltHex>:<hashHex>` en `password_hash` (como YANK).
 * 100 000 iteraciones: el máximo que Cloudflare Workers ha admitido históricamente en producción.
 */
export const PBKDF2_ITERATIONS = 100_000;
/** Cuentas creadas con la v0.3: salt y hash en base64url, 240 000 iteraciones. */
export const LEGACY_ITERATIONS = 240_000;
const MAX_VERIFY_ITERATIONS = 1_000_000;

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS) {
  const salt = randomHex(16);
  return `pbkdf2-sha256:${iterations}:${salt}:${hex(await pbkdf2Bits(password, fromHex(salt), iterations))}`;
}

/**
 * Verifica ambos formatos. Devuelve `legacy: true` si la cuenta usa el formato de la v0.3 para
 * que el inicio de sesión lo actualice al formato actual.
 */
export async function verifyPassword(password: string, stored: string | null | undefined, legacySalt?: string | null) {
  if (stored?.startsWith("pbkdf2-sha256:")) {
    const [, iterations, salt, expected] = stored.split(":");
    const n = Number(iterations);
    if (!Number.isSafeInteger(n) || n < 1000 || n > MAX_VERIFY_ITERATIONS || !salt || !expected) return { ok: false, legacy: false };
    return { ok: await timingSafeEqualText(hex(await pbkdf2Bits(password, fromHex(salt), n)), expected), legacy: false };
  }
  if (stored && legacySalt && /^[A-Za-z0-9_-]+$/.test(stored) && /^[A-Za-z0-9_-]+$/.test(legacySalt)) {
    const actual = b64url(await pbkdf2Bits(password, unb64url(legacySalt), LEGACY_ITERATIONS));
    return { ok: await timingSafeEqualText(actual, stored), legacy: true };
  }
  return { ok: false, legacy: false };
}

/** Código numérico de entrega/devolución (6 dígitos), sin sesgo de módulo. */
export function handoverCode() {
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= 4_294_000_000);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

/** HMAC-SHA256 en hexadecimal (firma de webhooks de Meta). */
export async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
}
