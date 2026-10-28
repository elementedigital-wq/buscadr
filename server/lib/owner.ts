/**
 * Propietario del CMS Maestro (una sola cuenta, ADR 0008).
 *
 * - Correo: `elemente.digital@gmail.com`, fijo en el código en producción. Solo con
 *   BUSCADR_ENV=test|development puede sustituirse con `BUSCADR_ADMIN_EMAIL` (pruebas y local).
 * - Contraseña: mientras la cuenta tenga la marca `ADMIN_PASSWORD_MARKER`, vale el secreto
 *   `BUSCADR_ADMIN_PASSWORD` (12+ caracteres). Cuando el propietario la cambia desde el CMS o con el
 *   enlace de recuperación, se guarda como hash PBKDF2 en D1 y el secreto deja de usarse.
 * - Nunca se guarda una contraseña en el repositorio.
 *
 * Superusuarios (ADR 0018): el propietario puede dar acceso completo al CMS y a la administración a
 * otras cuentas (`staff_role='superadmin'`) desde CMS → Acceso. Su contraseña inicial la escribe el
 * propietario en el CMS y se guarda solo como hash PBKDF2 en D1; luego el superusuario la cambia o la
 * recupera por correo. Solo el propietario crea o retira superusuarios.
 */
import type { Env, User } from "../env";
import { b64url, hashPassword, sha256, timingSafeEqualText, verifyPassword } from "./crypto";
import { escapeHtml, mailConfigured, sendMail } from "./mail";

export const DEFAULT_OWNER_EMAIL = "elemente.digital@gmail.com";
/** Marca de la cuenta del propietario mientras su credencial sea el secreto de Cloudflare. */
export const ADMIN_PASSWORD_MARKER = "cloudflare-admin-only:v1";
export const OWNER_MIN_PASSWORD = 12;
export const RESET_TTL_MS = 30 * 60_000;

export function ownerEmail(env: Env) {
  const override = String(env.BUSCADR_ADMIN_EMAIL ?? "")
    .trim()
    .toLowerCase();
  return override && (env.BUSCADR_ENV === "test" || env.BUSCADR_ENV === "development") ? override : DEFAULT_OWNER_EMAIL;
}

export const isOwnerEmail = (env: Env, email: unknown) => typeof email === "string" && email.trim().toLowerCase() === ownerEmail(env);

const secretPassword = (env: Env) =>
  typeof env.BUSCADR_ADMIN_PASSWORD === "string" && env.BUSCADR_ADMIN_PASSWORD.length >= OWNER_MIN_PASSWORD ? env.BUSCADR_ADMIN_PASSWORD : null;

const hasOwnHash = (u: User | null) => !!u && u.staff_role === "admin" && !!u.password_hash?.startsWith("pbkdf2-sha256:");

export const SUPERUSER_ROLE = "superadmin";
/** Marca de una cuenta cuyo acceso de superusuario fue retirado (no admite ninguna contraseña). */
export const REVOKED_MARKER = "revoked-superuser:v1";

/** La cuenta del propietario (con su sesión de propietario). */
export const isOwnerUser = (env: Env, u: User | null) => !!u && u.staff_role === "admin" && !u.demo && isOwnerEmail(env, u.email);
export const isSuperuser = (u: User | null) => !!u && u.staff_role === SUPERUSER_ROLE && !u.demo;

export const superuserRow = (db: D1Database, email: string) =>
  db.prepare("SELECT * FROM users WHERE email=? AND staff_role=? AND demo=0").bind(email.trim().toLowerCase(), SUPERUSER_ROLE).first<User>();

export const ownerRow = (db: D1Database, env: Env) => db.prepare("SELECT * FROM users WHERE email=?").bind(ownerEmail(env)).first<User>();

/** El propietario puede entrar: hay contraseña propia en D1 o secreto inicial en Cloudflare. */
export async function ownerReady(db: D1Database, env: Env) {
  return !!secretPassword(env) || hasOwnHash(await ownerRow(db, env));
}

/** Verifica la contraseña del propietario (hash en D1 si existe; si no, el secreto inicial). */
export async function checkOwnerPassword(env: Env, row: User | null, provided: string) {
  if (hasOwnHash(row)) return (await verifyPassword(provided, row!.password_hash)).ok;
  const secret = secretPassword(env);
  // Se compara igualmente para no revelar por tiempos si hay secreto configurado.
  const ok = await timingSafeEqualText(provided, secret ?? "\u0000sin-configurar\u0000");
  return !!secret && ok;
}

/** Crea o reclama la cuenta del propietario (revoca sesiones y Google de una cuenta previa con ese correo). */
export async function claimOwner(db: D1Database, env: Env, row: User | null, passwordHash?: string): Promise<User> {
  const email = ownerEmail(env);
  if (!row) {
    const id = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO users(id,email,name,city,role,password_salt,password_hash,provider,email_verified,created_at,staff_role) VALUES(?,?,?,?,?,NULL,?,'password',1,?,'admin')",
      )
      .bind(id, email, "Equipo buscaDR", "Guayaquil", "patient", passwordHash ?? ADMIN_PASSWORD_MARKER, Date.now())
      .run();
  } else {
    const alreadyOwner = row.staff_role === "admin" && !row.demo;
    // Una contraseña propia ya guardada se conserva; una cuenta común vuelve a la marca del secreto.
    const nextHash = passwordHash ?? (alreadyOwner && hasOwnHash(row) ? row.password_hash : ADMIN_PASSWORD_MARKER);
    if (!alreadyOwner || row.password_hash !== nextHash) {
      const update = db
        .prepare("UPDATE users SET staff_role='admin',password_hash=?,password_salt=NULL,google_sub=NULL,demo=0 WHERE id=?")
        .bind(nextHash, row.id);
      // Una cuenta común con ese correo pasa a ser del propietario: se cierran sus sesiones anteriores.
      await db.batch(alreadyOwner ? [update] : [db.prepare("DELETE FROM sessions WHERE user_id=?").bind(row.id), update]);
    }
  }
  const user = await ownerRow(db, env);
  await db.prepare("DELETE FROM cms_user_access WHERE user_id=?").bind(user!.id).run();
  return user!;
}

/** Guarda una contraseña nueva del propietario y cierra sus demás sesiones. */
export async function setOwnerPassword(db: D1Database, env: Env, password: string, keepTokenHash?: string) {
  const row = await ownerRow(db, env);
  const user = await claimOwner(db, env, row, await hashPassword(password));
  await db
    .prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?")
    .bind(user.id, keepTokenHash ?? "")
    .run();
  return user;
}

export function passwordProblem(env: Env, password: string, email = ownerEmail(env)) {
  if (password.length < OWNER_MIN_PASSWORD) return `La contraseña necesita mínimo ${OWNER_MIN_PASSWORD} caracteres.`;
  if (password.length > 128) return "La contraseña es demasiado larga.";
  const local = email.split("@")[0].toLowerCase();
  if (local.length >= 3 && password.toLowerCase().includes(local)) return "La contraseña no puede contener el correo.";
  if (!/[a-zA-Z]/.test(password) || !/[^a-zA-Z]/.test(password)) return "Combina letras con números o símbolos.";
  return null;
}

/** Guarda una contraseña nueva de un superusuario y cierra sus demás sesiones. */
export async function setSuperuserPassword(db: D1Database, email: string, password: string, keepTokenHash?: string) {
  const row = await superuserRow(db, email);
  if (!row) return null;
  await db.batch([
    db.prepare("UPDATE users SET password_hash=?,password_salt=NULL WHERE id=?").bind(await hashPassword(password), row.id),
    db.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?").bind(row.id, keepTokenHash ?? ""),
  ]);
  return row;
}

/** Crea un enlace de recuperación de un solo uso y lo envía al correo del propietario (o de un superusuario). */
export async function sendOwnerReset(db: D1Database, env: Env, origin: string, ip: string, email = ownerEmail(env)) {
  if (!mailConfigured(env)) return false;
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  await db
    .prepare("INSERT INTO owner_resets(token_hash,email,expires_at,ip,created_at) VALUES(?,?,?,?,?)")
    .bind(await sha256(token), email, now + RESET_TTL_MS, ip.slice(0, 64), now)
    .run();
  const link = `${origin}/maestro/restablecer?token=${token}`;
  return sendMail(env, {
    to: email,
    subject: "buscaDR · Restablecer la contraseña del CMS Maestro",
    text: `Recibimos una solicitud para restablecer la contraseña del CMS Maestro de buscaDR.\n\nAbre este enlace (vale 30 minutos y un solo uso):\n${link}\n\nSi no lo pediste, ignora este correo: tu contraseña no cambia.`,
    html: `<p>Recibimos una solicitud para restablecer la contraseña del <strong>CMS Maestro de buscaDR</strong>.</p><p><a href="${escapeHtml(link)}">Crear una contraseña nueva</a> (vale 30 minutos y un solo uso).</p><p>Si no lo pediste, ignora este correo: tu contraseña no cambia.</p>`,
  });
}

/** Consume un token de recuperación válido (atómico). Devuelve el correo de la cuenta del CMS o null. */
export async function consumeOwnerReset(db: D1Database, env: Env, token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const row = await db
    .prepare("UPDATE owner_resets SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at>? RETURNING email")
    .bind(Date.now(), await sha256(token), Date.now())
    .first<{ email: string }>();
  if (!row) return null;
  if (isOwnerEmail(env, row.email) || (await superuserRow(db, row.email))) return row.email;
  return null;
}

/** Aviso al propietario cuando su contraseña cambia (si el correo está configurado). */
export async function notifyOwnerPasswordChanged(env: Env, email = ownerEmail(env)) {
  await sendMail(env, {
    to: email,
    subject: "buscaDR · Cambiaste la contraseña del CMS Maestro",
    text: "La contraseña del CMS Maestro de buscaDR se cambió y se cerraron las demás sesiones. Si no fuiste tú, usa «¿Olvidaste tu contraseña?» en /maestro.",
    html: "<p>La contraseña del <strong>CMS Maestro de buscaDR</strong> se cambió y se cerraron las demás sesiones.</p><p>Si no fuiste tú, usa «¿Olvidaste tu contraseña?» en /maestro.</p>",
  });
}
