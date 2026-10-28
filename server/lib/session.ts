import type { User } from "../env";
import { b64url, sha256 } from "./crypto";

/**
 * Misma cookie y formato que la v0.3 (`__Host-buscadr_session`, token base64url de 32 bytes, hash
 * SHA-256 hex en `sessions.token_hash`): las sesiones abiertas siguen siendo válidas.
 * SameSite=Lax para que los enlaces desde WhatsApp abran la reserva con la sesión iniciada;
 * las escrituras exigen además origen propio + cabecera anti-CSRF (server/app.ts).
 */
export const SESSION_COOKIE = "__Host-buscadr_session";
export const SESSION_TTL_SECONDS = 14 * 24 * 3600;

export const sessionCookie = (token: string, maxAge = SESSION_TTL_SECONDS) =>
  `${SESSION_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;

export function readSessionToken(cookieHeader: string | null) {
  const value = (cookieHeader ?? "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  return value && /^[A-Za-z0-9_-]{32,128}$/.test(value) ? value : null;
}

export async function createSession(db: D1Database, userId: string) {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = b64url(bytes);
  const now = Date.now();
  await db
    .prepare("INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)")
    .bind(await sha256(token), userId, now, now + SESSION_TTL_SECONDS * 1000)
    .run();
  return sessionCookie(token);
}

export async function userFromCookie(db: D1Database, cookieHeader: string | null): Promise<User | null> {
  const token = readSessionToken(cookieHeader);
  if (!token) return null;
  return db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
       LEFT JOIN cms_user_access a ON a.user_id=u.id
       WHERE s.token_hash=? AND s.expires_at>? AND COALESCE(a.enabled,1)=1`,
    )
    .bind(await sha256(token), Date.now())
    .first<User>();
}

export async function destroySession(db: D1Database, cookieHeader: string | null) {
  const token = readSessionToken(cookieHeader);
  if (token)
    await db
      .prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(await sha256(token))
      .run();
}
