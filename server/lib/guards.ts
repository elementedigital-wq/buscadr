import type { Context } from "hono";
import type { AppBindings, Env, User } from "../env";
import { fail } from "./http";
import { isOwnerUser, isSuperuser } from "./owner";

export function requireUser(c: Context<AppBindings>): User {
  const user = c.get("user");
  if (!user) fail(401, "Inicia sesión para continuar", "AUTH_REQUIRED");
  return user;
}

/**
 * Administración y CMS: la cuenta del propietario (correo de `ownerEmail`, staff_role='admin' solo lo
 * asigna su inicio de sesión) y los superusuarios que él crea (staff_role='superadmin', ADR 0018).
 */
export function isAdmin(user: User | null, env: Env) {
  return isOwnerUser(env, user) || isSuperuser(user);
}

/** Solo el propietario: crear o retirar superusuarios. */
export function requireOwner(c: Context<AppBindings>): User {
  const user = requireUser(c);
  if (!isOwnerUser(c.env, user)) fail(403, "Solo el propietario de buscaDR puede gestionar superusuarios", "FORBIDDEN");
  return user;
}

export function requireAdmin(c: Context<AppBindings>): User {
  const user = requireUser(c);
  if (!isAdmin(user, c.env)) fail(403, "Solo la administración de buscaDR puede hacer esto", "FORBIDDEN");
  return user;
}

export const publicUser = (u: User | null, env?: Env) =>
  u
    ? {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        city: u.city,
        sector: u.sector ?? "",
        phone: u.phone ?? "",
        whatsapp_opt_in: !!u.whatsapp_opt_in,
        email_opt_in: u.email_opt_in === undefined ? true : !!u.email_opt_in,
        demo: !!u.demo,
        admin: env ? isAdmin(u, env) : u.staff_role === "admin",
        /** El botón del CMS Maestro solo se muestra con la cuenta elemente.digital@gmail.com (ADR 0003). */
        cms: env ? isAdmin(u, env) : false,
        /** «owner» (propietario) o «superuser» (acceso completo al CMS, sin gestionar superusuarios). */
        cms_role: env ? (isOwnerUser(env, u) ? "owner" : isSuperuser(u) ? "superuser" : null) : null,
        provider: u.provider,
        email_verified: !!u.email_verified,
        google_linked: !!u.google_sub,
        referral_code: u.referral_code ?? null,
        avatar: u.avatar ?? "",
        created: u.created_at,
      }
    : null;

/** Lee JSON con límite de tamaño y error claro. */
export async function readJson<T = Record<string, unknown>>(c: Context<AppBindings>, max = 100_000): Promise<T> {
  if (Number(c.req.header("content-length") ?? 0) > max) fail(413, "Formulario demasiado grande");
  const raw = await c.req.text();
  if (raw.length > max) fail(413, "Formulario demasiado grande");
  if (!raw) return {} as T;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as T;
  } catch {
    return fail(400, "JSON inválido");
  }
}
