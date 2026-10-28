/**
 * CMS · Superusuarios (ADR 0018). Solo el propietario crea o retira cuentas con acceso completo al CMS
 * Maestro y a la administración. La contraseña inicial que escribe el propietario se guarda solo como
 * hash PBKDF2 en D1 (nunca en claro, en la auditoría ni en el repositorio).
 */
import { Hono } from "hono";
import type { AppBindings } from "../env";
import { hashPassword } from "../lib/crypto";
import { readJson, requireOwner } from "../lib/guards";
import { clean, fail } from "../lib/http";
import { REVOKED_MARKER, SUPERUSER_ROLE, isOwnerEmail, passwordProblem } from "../lib/owner";

export const cmsSuperusers = new Hono<AppBindings>();

const audit = (db: D1Database, actor: string, action: string, details: Record<string, unknown>) =>
  db.prepare("INSERT INTO cms_audit(actor_id,action,details) VALUES(?,?,?)").bind(actor, action, JSON.stringify(details)).run();

const list = (db: D1Database) =>
  db
    .prepare(
      `SELECT u.id,u.email,u.name,u.created_at,(SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id=u.id) AS last_session
       FROM users u WHERE u.staff_role=? AND u.demo=0 ORDER BY u.email`,
    )
    .bind(SUPERUSER_ROLE)
    .all()
    .then((r) => r.results);

cmsSuperusers.get("/", async (c) => {
  requireOwner(c);
  return c.json({ superusers: await list(c.env.DB) });
});

cmsSuperusers.post("/", async (c) => {
  const owner = requireOwner(c);
  const db = c.env.DB;
  const b = await readJson<{ email?: string; name?: string; password?: string }>(c);
  const email = clean(b.email, 180).toLowerCase();
  const name = clean(b.name, 80) || "Superusuario buscaDR";
  const password = String(b.password ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Escribe un correo válido.");
  if (isOwnerEmail(c.env, email)) fail(400, "Ese correo ya es el del propietario.");
  const problem = passwordProblem(c.env, password, email);
  if (problem) fail(400, problem);
  const hash = await hashPassword(password);
  const existing = await db.prepare("SELECT id,staff_role,demo FROM users WHERE email=?").bind(email).first<{ id: string; staff_role: string; demo: number }>();
  if (existing?.demo) fail(400, "Esa cuenta es de muestra.");
  if (existing?.staff_role === SUPERUSER_ROLE) fail(409, "Ese correo ya es superusuario.");
  if (existing) {
    // Una cuenta existente pasa a superusuario: nueva contraseña, sin Google y con sus sesiones cerradas.
    await db.batch([
      db.prepare("UPDATE users SET staff_role=?,password_hash=?,password_salt=NULL,google_sub=NULL WHERE id=?").bind(SUPERUSER_ROLE, hash, existing.id),
      db.prepare("DELETE FROM sessions WHERE user_id=?").bind(existing.id),
      db.prepare("DELETE FROM cms_user_access WHERE user_id=?").bind(existing.id),
    ]);
  } else {
    await db
      .prepare(
        "INSERT INTO users(id,email,name,city,role,password_salt,password_hash,provider,email_verified,created_at,staff_role) VALUES(?,?,?,?,?,NULL,?,'password',1,?,?)",
      )
      .bind(crypto.randomUUID(), email, name, "Guayaquil", "patient", hash, Date.now(), SUPERUSER_ROLE)
      .run();
  }
  await audit(db, owner.id, "superuser_added", { email, existing: !!existing });
  return c.json({ superusers: await list(db), message: `Listo: ${email} ya puede entrar al CMS Maestro en /maestro con la contraseña que definiste.` }, 201);
});

cmsSuperusers.delete("/:id", async (c) => {
  const owner = requireOwner(c);
  const db = c.env.DB;
  const row = await db
    .prepare("SELECT id,email FROM users WHERE id=? AND staff_role=?")
    .bind(c.req.param("id"), SUPERUSER_ROLE)
    .first<{ id: string; email: string }>();
  if (!row) fail(404, "Superusuario no encontrado");
  // Retirar el acceso: la cuenta deja de ser superusuario, su contraseña deja de valer y se cierran sus sesiones.
  await db.batch([
    db.prepare("UPDATE users SET staff_role='',password_hash=?,password_salt=NULL WHERE id=?").bind(REVOKED_MARKER, row.id),
    db.prepare("DELETE FROM sessions WHERE user_id=?").bind(row.id),
  ]);
  await audit(db, owner.id, "superuser_removed", { email: row.email });
  return c.json({ superusers: await list(db), message: `Se retiró el acceso de ${row.email}.` });
});
