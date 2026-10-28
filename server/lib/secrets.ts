/**
 * Credenciales de pasarelas guardadas cifradas en D1 (ADR 0013). La clave maestra NO está en D1: es
 * el secreto de Cloudflare `BUSCADR_SECRETS_KEY` (32+ caracteres). AES-GCM de 256 bits con IV
 * aleatorio por escritura. Sin la clave, el CMS no acepta credenciales y se usan las variables de
 * entorno (p. ej. PAYPHONE_TOKEN).
 */
import type { Env } from "../env";

const MIN_KEY = 32;
export const secretsKeyConfigured = (env: Env) => typeof env.BUSCADR_SECRETS_KEY === "string" && env.BUSCADR_SECRETS_KEY.length >= MIN_KEY;

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function key(env: Env) {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`buscadr-secrets:v1:${env.BUSCADR_SECRETS_KEY}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptJson(env: Env, value: Record<string, string>) {
  if (!secretsKeyConfigured(env)) throw new Error("BUSCADR_SECRETS_KEY no está configurada");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(env), data));
  return `v1:${b64(iv)}:${b64(ct)}`;
}

/** Descifra; si falta la clave o el texto fue alterado, devuelve un objeto vacío (nunca lanza). */
export async function decryptJson(env: Env, enc: string | null | undefined): Promise<Record<string, string>> {
  if (!enc || !secretsKeyConfigured(env)) return {};
  const [v, iv, ct] = enc.split(":");
  if (v !== "v1" || !iv || !ct) return {};
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(env), unb64(ct));
    const parsed = JSON.parse(new TextDecoder().decode(plain));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Vista segura para el CMS: «••••1234». Nunca devuelve el valor. */
export const maskSecret = (v: string | undefined) => (v ? `••••${v.slice(-4)}` : "");
