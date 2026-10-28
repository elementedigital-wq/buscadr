/** Valida ID tokens de Google Identity Services con las claves públicas rotativas de Google. */
import { HttpError } from "./http";

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
type Jwk = JsonWebKey & { kid: string; alg?: string; use?: string };
let cached: { expires: number; keys: Jwk[] } = { expires: 0, keys: [] };

const invalid = (message = "No se pudo validar la identidad de Google"): never => {
  throw new HttpError(401, message, "GOOGLE_TOKEN_INVALID");
};

function decode64url(part: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) invalid();
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function json(part: string): Record<string, any> {
  try {
    return JSON.parse(new TextDecoder().decode(decode64url(part)));
  } catch {
    return invalid();
  }
}

const maxAge = (header: string | null) => Math.min(3600, Math.max(60, Number(/(?:^|,)\s*max-age=(\d+)/i.exec(header ?? "")?.[1] ?? 600)));

async function keys(fetchFn: typeof fetch, now: number) {
  if (cached.keys.length && cached.expires > now) return cached.keys;
  try {
    const res = await fetchFn(JWKS_URL, { signal: AbortSignal.timeout(4500), headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("JWKS");
    const body = (await res.json()) as { keys?: Jwk[] };
    if (!Array.isArray(body.keys) || !body.keys.length) throw new Error("JWKS");
    cached = {
      keys: body.keys.filter((k) => k.kty === "RSA" && k.alg === "RS256" && k.use === "sig"),
      expires: now + maxAge(res.headers.get("cache-control")) * 1000,
    };
    return cached.keys;
  } catch {
    throw new HttpError(503, "No fue posible consultar las claves públicas de Google. Inténtalo nuevamente.", "GOOGLE_KEYS_UNAVAILABLE");
  }
}

export async function verifyGoogleIdToken(
  credential: unknown,
  clientId: string,
  { fetchFn = fetch, now = Date.now() }: { fetchFn?: typeof fetch; now?: number } = {},
) {
  if (!clientId || typeof credential !== "string" || credential.length > 12000 || credential.length < 200) invalid();
  const parts = (credential as string).split(".");
  if (parts.length !== 3) invalid();
  const head = json(parts[0]);
  const claim = json(parts[1]);
  if (head.alg !== "RS256" || typeof head.kid !== "string" || head.kid.length > 250) invalid();
  const jwk = (await keys(fetchFn, now)).find((k) => k.kid === head.kid);
  if (!jwk) invalid("La firma de Google no corresponde a una clave activa; vuelve a intentarlo.");
  let ok = false;
  try {
    const key = await crypto.subtle.importKey("jwk", jwk!, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decode64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  } catch {
    invalid();
  }
  if (!ok) invalid();
  const time = Math.floor(now / 1000);
  if (!["https://accounts.google.com", "accounts.google.com"].includes(claim.iss)) invalid();
  if (claim.aud !== clientId || (claim.azp && claim.azp !== clientId)) invalid();
  if (!Number.isSafeInteger(claim.exp) || claim.exp <= time - 30) invalid("Tu sesión de Google expiró. Vuelve a elegir tu cuenta.");
  if (!Number.isSafeInteger(claim.iat) || claim.iat > time + 90 || claim.iat < time - 7200) invalid();
  if (claim.nbf !== undefined && claim.nbf > time + 30) invalid();
  if (!/^\d{4,30}$/.test(String(claim.sub ?? ""))) invalid();
  if (claim.email_verified !== true || typeof claim.email !== "string" || !/^\S+@\S+\.\S+$/.test(claim.email)) {
    invalid("Google no confirmó la titularidad del correo electrónico.");
  }
  return {
    sub: String(claim.sub),
    email: (claim.email as string).toLowerCase(),
    name: String(claim.name || claim.given_name || (claim.email as string).split("@")[0])
      .trim()
      .slice(0, 100),
  };
}

export const clearGoogleKeyCacheForTests = () => {
  cached = { expires: 0, keys: [] };
};
