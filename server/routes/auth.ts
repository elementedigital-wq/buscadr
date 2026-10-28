import { Hono } from "hono";
import { z } from "zod";
import type { AppBindings, User } from "../env";
import { CITY_NAMES } from "../lib/catalog";
import { hashPassword, randomHex, sha256, verifyPassword } from "../lib/crypto";
import { track } from "../lib/events";
import { verifyGoogleIdToken } from "../lib/google";
import { isAdmin, publicUser, readJson, requireUser } from "../lib/guards";
import { clean, fail } from "../lib/http";
import { RULES, hit, reset } from "../lib/rate-limit";
import { mailConfigured } from "../lib/mail";
import {
  checkOwnerPassword,
  claimOwner,
  consumeOwnerReset,
  isOwnerEmail,
  notifyOwnerPasswordChanged,
  ownerRow,
  passwordProblem,
  sendOwnerReset,
  setOwnerPassword,
} from "../lib/owner";
import { createSession, destroySession, readSessionToken, sessionCookie } from "../lib/session";
import { toE164Ecuador } from "../lib/whatsapp";


const RegisterSchema = z.object({
  name: z.string().trim().min(2, "Escribe tu nombre (mínimo 2 caracteres)").max(80),
  email: z.string().trim().toLowerCase().email("Correo inválido").max(180),
  password: z.string().min(10, "La contraseña necesita mínimo 10 caracteres").max(128),
  role: z.enum(["patient", "pro"]),
  city: z.enum(CITY_NAMES as [string, ...string[]]).optional(),
  phone: z.string().trim().max(30).optional(),
  acceptTerms: z.literal(true, { message: "Debes aceptar los términos y la política de privacidad" }),
  whatsapp_opt_in: z.boolean().optional(),
  referral: z.string().trim().max(20).optional(),
});

async function referralFor(db: D1Database, code: string | undefined) {
  if (!code || !/^[A-Z0-9]{4,20}$/i.test(code)) return null;
  const row = await db.prepare("SELECT id FROM users WHERE referral_code=?").bind(code.toUpperCase()).first<{ id: string }>();
  return row?.id ?? null;
}

const newReferralCode = () => `BDR${randomHex(3).toUpperCase()}`;

export const auth = new Hono<AppBindings>();

auth.get("/me", (c) => c.json({ user: publicUser(c.get("user"), c.env) }));

/** Compatibilidad con la v0.3 (auth-client.js): estado de las cuentas y de Google. */
auth.get("/config", (c) =>
  c.json({ enabled: !!c.env.DB, googleEnabled: !!c.env.GOOGLE_CLIENT_ID, googleClientId: c.env.GOOGLE_CLIENT_ID ?? "", demoOnly: false }),
);
auth.get("/google/config", (c) => c.json({ enabled: !!c.env.GOOGLE_CLIENT_ID, clientId: c.env.GOOGLE_CLIENT_ID ?? null }));

auth.post("/register", async (c) => {
  const db = c.env.DB;
  await hit(db, `register:ip:${c.get("ip")}`, RULES.register);
  const parsed = RegisterSchema.safeParse(await readJson(c));
  if (!parsed.success) fail(400, parsed.error.issues[0]?.message ?? "Revisa los datos del formulario");
  const b = parsed.data;
  if (b.phone && !toE164Ecuador(b.phone)) fail(400, "Escribe un celular ecuatoriano válido (por ejemplo 0991234567)");
  // Respuesta genérica: no confirma si el correo ya existe (evita enumeración de cuentas).
  // El correo del propietario del CMS no se registra como cuenta común (entra con su contraseña).
  if (isOwnerEmail(c.env, b.email) || (await db.prepare("SELECT id FROM users WHERE email=?").bind(b.email).first())) {
    fail(409, "No pudimos crear la cuenta con ese correo. Si ya tienes cuenta, inicia sesión.", "EMAIL_EXISTS");
  }
  const id = crypto.randomUUID();
  const referredBy = await referralFor(db, b.referral);
  await db.batch([
    db
      .prepare(
        `INSERT INTO users(id,email,name,city,role,password_salt,password_hash,provider,email_verified,created_at,phone,whatsapp_opt_in,referral_code,referred_by)
         VALUES(?,?,?,?,?,NULL,?,'password',0,?,?,?,?,?)`,
      )
      .bind(
        id,
        b.email,
        clean(b.name, 80),
        b.city ?? "Guayaquil",
        b.role,
        await hashPassword(b.password),
        Date.now(),
        clean(b.phone, 30),
        b.whatsapp_opt_in ? 1 : 0,
        newReferralCode(),
        referredBy,
      ),
    db.prepare("INSERT INTO consent_records(user_id,kind,value) VALUES(?,?,?)").bind(id, "terminos_y_privacidad", 1),
    db.prepare("INSERT INTO consent_records(user_id,kind,value) VALUES(?,?,?)").bind(id, "whatsapp_avisos", b.whatsapp_opt_in ? 1 : 0),
  ]);
  await track(db, "signup", { userId: id, props: { role: b.role, method: "password", referred: !!referredBy } });
  const user = await db.prepare("SELECT * FROM users WHERE id=?").bind(id).first<User>();
  c.header("Set-Cookie", await createSession(db, id));
  return c.json(
    {
      user: publicUser(user, c.env),
      message: b.role === "pro" ? "Cuenta creada. Completa tu perfil profesional para activar tu agenda." : "Cuenta creada. Ya puedes reservar citas con profesionales de la salud.",
    },
    201,
  );
});

auth.post("/login", async (c) => {
  const db = c.env.DB;
  const b = await readJson<{ email?: string; password?: string }>(c);
  const email = clean(b.email, 180).toLowerCase();
  const provided = String(b.password ?? "").slice(0, 200);
  const ip = c.get("ip");
  const asAdmin = isOwnerEmail(c.env, email);
  const accountKey = `login:acct:${ip}:${email}`;
  await hit(db, `login:ip:${ip}`, RULES.loginIp);
  await hit(db, asAdmin ? `login:admin:${ip}` : accountKey, asAdmin ? RULES.owner : RULES.loginAccount);

  if (asAdmin) {
    // Propietario del CMS: contraseña propia (hash en D1) o, hasta que la cambie, el secreto inicial.
    const row = await ownerRow(db, c.env);
    if (!(await checkOwnerPassword(c.env, row, provided))) fail(401, "Correo o contraseña incorrectos.");
    const user = await claimOwner(db, c.env, row);
    await reset(db, `login:admin:${ip}`);
    c.header("Set-Cookie", await createSession(db, user.id));
    return c.json({ user: publicUser(user, c.env) });
  }

  const user = await db.prepare("SELECT * FROM users WHERE email=?").bind(email).first<User>();
  // Se calcula el hash aunque no exista la cuenta, para igualar tiempos de respuesta.
  const check = await verifyPassword(provided, user?.password_hash ?? "pbkdf2-sha256:100000:00:00", user?.password_salt);
  if (!user || !check.ok || user.demo || user.staff_role === "admin") fail(401, "Correo o contraseña incorrectos.", "LOGIN_FAILED");
  const access = await db.prepare("SELECT enabled FROM cms_user_access WHERE user_id=?").bind(user.id).first<{ enabled: number }>();
  if (access?.enabled === 0) fail(403, "Tu cuenta está suspendida. Escríbenos para revisarla.");
  // Cuentas de la v0.3: se actualiza el hash al formato actual en el primer inicio de sesión.
  if (check.legacy)
    await db
      .prepare("UPDATE users SET password_hash=?,password_salt=NULL WHERE id=?")
      .bind(await hashPassword(provided), user.id)
      .run();
  if (!user.referral_code) await db.prepare("UPDATE users SET referral_code=? WHERE id=? AND referral_code IS NULL").bind(newReferralCode(), user.id).run();
  await reset(db, accountKey);
  c.header("Set-Cookie", await createSession(db, user.id));
  return c.json({ user: publicUser(user, c.env) });
});

/** Propietario: cambia su contraseña (queda como hash en D1) y cierra sus demás sesiones. */
auth.post("/owner/password", async (c) => {
  const user = requireUser(c);
  if (!isAdmin(user, c.env)) fail(403, "Solo el propietario del CMS puede hacer esto", "FORBIDDEN");
  const db = c.env.DB;
  await hit(db, `owner:password:${user.id}`, RULES.owner);
  const b = await readJson<{ current?: string; next?: string }>(c);
  const current = String(b.current ?? "").slice(0, 200);
  const next = String(b.next ?? "");
  if (!(await checkOwnerPassword(c.env, user, current))) fail(400, "La contraseña actual no es correcta.");
  const problem = passwordProblem(c.env, next);
  if (problem) fail(400, problem);
  if (next === current) fail(400, "La contraseña nueva debe ser distinta de la actual.");
  const token = readSessionToken(c.req.header("cookie") ?? null);
  await setOwnerPassword(db, c.env, next, token ? await sha256(token) : undefined);
  await reset(db, `owner:password:${user.id}`);
  c.executionCtx.waitUntil(notifyOwnerPasswordChanged(c.env));
  return c.json({ ok: true, message: "Contraseña actualizada. Se cerraron las demás sesiones." });
});

/**
 * Propietario: pide un enlace de recuperación. Respuesta siempre igual (no revela si el correo es el
 * del propietario); el enlace solo se envía al correo del propietario.
 */
auth.post("/owner/recover", async (c) => {
  const db = c.env.DB;
  const ip = c.get("ip");
  await hit(db, `owner:recover:${ip}`, RULES.recover);
  const b = await readJson<{ email?: string }>(c);
  if (isOwnerEmail(c.env, b.email)) {
    await hit(db, "owner:recover:global", RULES.recoverGlobal);
    await sendOwnerReset(db, c.env, new URL(c.req.url).origin, ip);
  }
  return c.json({
    ok: true,
    message: mailConfigured(c.env)
      ? "Si el correo corresponde al propietario de buscaDR, enviamos un enlace para crear una contraseña nueva. Vale 30 minutos."
      : "La recuperación por correo aún no está activada en Cloudflare (falta RESEND_API_KEY). Mientras tanto, la contraseña inicial es el secreto BUSCADR_ADMIN_PASSWORD.",
  });
});

/** Propietario: crea la contraseña nueva con el enlace recibido por correo e inicia sesión. */
auth.post("/owner/reset", async (c) => {
  const db = c.env.DB;
  await hit(db, `owner:reset:${c.get("ip")}`, RULES.recover);
  const b = await readJson<{ token?: string; password?: string }>(c);
  const next = String(b.password ?? "");
  const problem = passwordProblem(c.env, next);
  if (problem) fail(400, problem);
  if (!(await consumeOwnerReset(db, c.env, String(b.token ?? "")))) fail(400, "El enlace no es válido o ya venció. Pide uno nuevo desde /maestro.", "RESET_INVALID");
  const user = await setOwnerPassword(db, c.env, next);
  c.header("Set-Cookie", await createSession(db, user.id));
  c.executionCtx.waitUntil(notifyOwnerPasswordChanged(c.env));
  return c.json({ ok: true, user: publicUser(user, c.env) });
});

auth.post("/logout", async (c) => {
  await destroySession(c.env.DB, c.req.header("cookie") ?? null);
  c.header("Set-Cookie", sessionCookie("", 0));
  return c.json({ ok: true });
});

auth.post("/google", async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) fail(503, "Google requiere configurar GOOGLE_CLIENT_ID en Cloudflare Workers.", "GOOGLE_NOT_CONFIGURED");
  const db = c.env.DB;
  await hit(db, `login:ip:${c.get("ip")}`, RULES.loginIp);
  const b = await readJson<{ credential?: string; intent?: string; role?: string; acceptTerms?: boolean; city?: string }>(c);
  const claims = await verifyGoogleIdToken(b.credential, c.env.GOOGLE_CLIENT_ID);
  if (isOwnerEmail(c.env, claims.email)) fail(403, "La cuenta del propietario de buscaDR entra con correo y contraseña.");
  const linked = await db
    .prepare("SELECT u.* FROM users u LEFT JOIN cms_user_access a ON a.user_id=u.id WHERE u.google_sub=? AND COALESCE(a.enabled,1)=1 AND u.staff_role=''")
    .bind(claims.sub)
    .first<User>();
  if (linked) {
    c.header("Set-Cookie", await createSession(db, linked.id));
    return c.json({ user: publicUser(linked, c.env), message: "Sesión iniciada con Google." });
  }
  if (await db.prepare("SELECT id FROM users WHERE email=?").bind(claims.email).first()) {
    return c.json({ code: "GOOGLE_LINK_REQUIRED", error: "Este correo ya tiene cuenta buscaDR. Entra con tu contraseña y vincula Google desde Mi cuenta." }, 409);
  }
  if (b.intent !== "register")
    return c.json({ code: "GOOGLE_SIGNUP_REQUIRED", error: "No existe una cuenta buscaDR con este Google. Crea tu cuenta primero." }, 404);
  if (b.acceptTerms !== true) fail(400, "Acepta los términos y la política de privacidad para registrarte.");
  const role = b.role === "pro" ? "pro" : "patient";
  const city = CITY_NAMES.includes(String(b.city)) ? String(b.city) : "Guayaquil";
  const id = crypto.randomUUID();
  await db.batch([
    db
      .prepare("INSERT INTO users(id,email,name,city,role,google_sub,provider,email_verified,created_at,referral_code) VALUES(?,?,?,?,?,?,'google',1,?,?)")
      .bind(id, claims.email, claims.name.slice(0, 80) || "Usuario buscaDR", city, role, claims.sub, Date.now(), newReferralCode()),
    db.prepare("INSERT INTO consent_records(user_id,kind,value) VALUES(?,?,?)").bind(id, "terminos_y_privacidad_google", 1),
  ]);
  await track(db, "signup", { userId: id, props: { role, method: "google" } });
  const user = await db.prepare("SELECT * FROM users WHERE id=?").bind(id).first<User>();
  c.header("Set-Cookie", await createSession(db, id));
  return c.json({ user: publicUser(user, c.env), message: "Cuenta buscaDR creada con Google." }, 201);
});

auth.post("/google/link", async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) fail(503, "Google requiere configurar GOOGLE_CLIENT_ID en Cloudflare Workers.", "GOOGLE_NOT_CONFIGURED");
  const user = requireUser(c);
  if (isAdmin(user, c.env)) fail(403, "La cuenta de administración no se vincula con Google.");
  const claims = await verifyGoogleIdToken((await readJson<{ credential?: string }>(c)).credential, c.env.GOOGLE_CLIENT_ID);
  const other = await c.env.DB.prepare("SELECT id FROM users WHERE google_sub=?").bind(claims.sub).first<{ id: string }>();
  if (other && other.id !== user.id) fail(409, "Esta cuenta de Google ya está vinculada a otro usuario.");
  if (claims.email !== user.email.toLowerCase()) fail(409, "El correo de Google debe coincidir con el de tu cuenta buscaDR.");
  await c.env.DB.prepare("UPDATE users SET google_sub=?,email_verified=1 WHERE id=?").bind(claims.sub, user.id).run();
  return c.json({ ok: true, message: "Google vinculado a tu cuenta." });
});

/** Perfil preferido: paciente o profesional (una cuenta profesional también puede reservar como paciente). */
auth.post("/role", async (c) => {
  const user = requireUser(c);
  const role = (await readJson<{ role?: string }>(c)).role;
  if (role !== "pro" && role !== "patient") fail(400, "Selecciona un perfil válido.");
  await c.env.DB.prepare("UPDATE users SET role=? WHERE id=?").bind(role, user.id).run();
  return c.json({ user: publicUser({ ...user, role }, c.env) });
});

/** Preferencias: nombre, ciudad, sector, teléfono, perfil y consentimiento de WhatsApp (con evidencia). */
auth.patch("/preferences", async (c) => {
  const user = requireUser(c);
  const b = await readJson<{ name?: string; city?: string; sector?: string; phone?: string; whatsapp_opt_in?: boolean; email_opt_in?: boolean; role?: string; bio?: string }>(c);
  const name = b.name === undefined ? user.name : clean(b.name, 80);
  if (name.length < 2) fail(400, "Escribe tu nombre (mínimo 2 caracteres)");
  const phone = b.phone === undefined ? user.phone : clean(b.phone, 30);
  if (phone && !toE164Ecuador(phone)) fail(400, "Escribe un celular ecuatoriano válido (por ejemplo 0991234567)");
  const optIn = b.whatsapp_opt_in === undefined ? Number(user.whatsapp_opt_in ?? 0) : b.whatsapp_opt_in ? 1 : 0;
  if (optIn && !phone) fail(400, "Agrega tu celular para recibir avisos por WhatsApp");
  const city = b.city === undefined ? user.city : CITY_NAMES.includes(String(b.city)) ? String(b.city) : fail(400, "Ciudad fuera del piloto");
  const role = b.role === "pro" || b.role === "patient" ? b.role : user.role;
  const db = c.env.DB;
  const statements = [
    db
      .prepare("UPDATE users SET name=?,city=?,sector=?,phone=?,whatsapp_opt_in=?,email_opt_in=?,role=?,bio=? WHERE id=?")
      .bind(
        name,
        city,
        b.sector === undefined ? user.sector : clean(b.sector, 60),
        phone,
        optIn,
        b.email_opt_in === undefined ? Number(user.email_opt_in ?? 1) : b.email_opt_in ? 1 : 0,
        role,
        b.bio === undefined ? user.bio : clean(b.bio, 400),
        user.id,
      ),
  ];
  if (optIn !== Number(user.whatsapp_opt_in ?? 0))
    statements.push(db.prepare("INSERT INTO consent_records(user_id,kind,value) VALUES(?,?,?)").bind(user.id, "whatsapp_avisos", optIn));
  await db.batch(statements);
  const fresh = await db.prepare("SELECT * FROM users WHERE id=?").bind(user.id).first<User>();
  return c.json({ user: publicUser(fresh, c.env), message: "Preferencias guardadas" });
});

/** Derecho de acceso (LOPDP): exporta los datos propios en JSON. */
auth.get("/data-export", async (c) => {
  const user = requireUser(c);
  const q = (sql: string) =>
    c.env.DB.prepare(sql)
      .bind(user.id)
      .all()
      .then((r) => r.results);
  return c.json({
    generated_at: new Date().toISOString(),
    user: publicUser(user, c.env),
    consents: await q("SELECT kind,value,recorded_at FROM consent_records WHERE user_id=?"),
    practitioner: await q("SELECT slug,display_name,specialty,status,verification,city,sector,created_at FROM practitioners WHERE user_id=?"),
    appointments: await q("SELECT id,practitioner_id,status,modality,start_ms,end_ms,price_cents,payment_status,created_at FROM appointments WHERE patient_id=?1 OR pro_user_id=?1"),
    payments: await q("SELECT id,kind,amount_cents,status,provider,card_brand,card_last4,created_at FROM payments WHERE payer_id=?"),
    messages: await q("SELECT appointment_id,body,created_at FROM messages WHERE sender_id=?"),
    reviews: await q("SELECT appointment_id,rating,body,created_at FROM reviews WHERE author_id=?"),
    favorites: await q("SELECT practitioner_id,created_at FROM favorites WHERE user_id=?"),
    notifications: await q("SELECT kind,title,created_at,read_at FROM notifications WHERE user_id=?"),
  });
});
