/** Acceso del propietario del CMS: contraseña propia en D1, recuperación por enlace y exclusividad del acceso. */
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { Env } from "../server/env";
import { b64url, sha256 } from "../server/lib/crypto";
import { ADMIN_PASSWORD_MARKER } from "../server/lib/owner";
import { ADMIN, Browser, admin, register, testEnv } from "./helpers";

const db = (env as unknown as Env).DB;

describe("propietario del CMS", () => {
  it("cambia su contraseña: queda en D1, el secreto inicial deja de valer y se cierran sus otras sesiones", async () => {
    const a = await admin();
    const other = await admin();
    const weak = await a.post("/api/auth/owner/password", { current: ADMIN.password, next: "corta" });
    expect(weak.status).toBe(400);
    const wrong = await a.post("/api/auth/owner/password", { current: "no-es-la-actual-123", next: "Nueva-Clave-Segura-2026" });
    expect(wrong.status).toBe(400);
    const ok = await a.post("/api/auth/owner/password", { current: ADMIN.password, next: "Nueva-Clave-Segura-2026" });
    expect(ok.status).toBe(200);
    const row = await db.prepare("SELECT password_hash FROM users WHERE email=?").bind(ADMIN.email.toLowerCase()).first<{ password_hash: string }>();
    expect(row?.password_hash.startsWith("pbkdf2-sha256:")).toBe(true);
    expect(row?.password_hash).not.toContain("Nueva-Clave");
    // La sesión que hizo el cambio sigue; la otra se cerró.
    expect((await a.get("/api/cms/session")).status).toBe(200);
    expect((await other.get("/api/auth/me")).data.user).toBeNull();
    expect((await new Browser().post("/api/auth/login", ADMIN)).status).toBe(401);
    const login = await new Browser().post("/api/auth/login", { email: ADMIN.email, password: "Nueva-Clave-Segura-2026" });
    expect(login.status).toBe(200);
    expect(login.data.user.admin).toBe(true);
  });

  it("recupera la contraseña con un enlace de un solo uso (sin revelar si el correo existe)", async () => {
    const generic = await new Browser().post("/api/auth/owner/recover", { email: "cualquiera@test.ec" });
    const owner = await new Browser().post("/api/auth/owner/recover", { email: ADMIN.email });
    expect(generic.status).toBe(200);
    expect(owner.data.message).toBe(generic.data.message);
    // Sin RESEND_API_KEY no hay envío: se simula el enlace guardando el hash del token.
    const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
    await db
      .prepare("INSERT INTO owner_resets(token_hash,email,expires_at,created_at) VALUES(?,?,?,?)")
      .bind(await sha256(token), ADMIN.email.toLowerCase(), Date.now() + 600_000, Date.now())
      .run();
    const b = new Browser();
    expect((await b.post("/api/auth/owner/reset", { token, password: "123456789012" })).status).toBe(400);
    const reset = await b.post("/api/auth/owner/reset", { token, password: "Recuperada-Clave-2026" });
    expect(reset.status).toBe(200);
    expect((await b.get("/api/cms/session")).status).toBe(200);
    expect((await new Browser().post("/api/auth/owner/reset", { token, password: "Otra-Clave-Distinta-2026" })).status).toBe(400);
    expect((await new Browser().post("/api/auth/login", { email: ADMIN.email, password: "Recuperada-Clave-2026" })).status).toBe(200);
    const expired = b64url(crypto.getRandomValues(new Uint8Array(32)));
    await db
      .prepare("INSERT INTO owner_resets(token_hash,email,expires_at,created_at) VALUES(?,?,?,?)")
      .bind(await sha256(expired), ADMIN.email.toLowerCase(), Date.now() - 1, Date.now() - 1_800_000)
      .run();
    expect((await new Browser().post("/api/auth/owner/reset", { token: expired, password: "Vencida-Clave-2026" })).status).toBe(400);
  });

  it("solo el correo del propietario accede: nadie más ve el CMS ni puede registrarse con ese correo", async () => {
    const dup = await new Browser().post("/api/auth/register", {
      name: "Suplantación",
      email: ADMIN.email,
      password: "contrasena-segura",
      role: "patient",
      acceptTerms: true,
    });
    expect(dup.status).toBe(409);
    const { browser, user } = await register("pro");
    expect((await browser.get("/api/auth/me")).data.user.admin).toBe(false);
    expect((await browser.post("/api/auth/owner/password", { current: "x", next: "Otra-Clave-Segura-2026" })).status).toBe(403);
    // Aunque una cuenta tuviera staff_role='admin', sin el correo del propietario no es administración.
    await db.prepare("UPDATE users SET staff_role='admin' WHERE id=?").bind(user.id).run();
    expect((await browser.get("/api/auth/me")).data.user.admin).toBe(false);
    expect((await browser.get("/api/cms/site")).status).toBe(403);
  });

  it("el estado del acceso indica si la recuperación por correo está configurada", async () => {
    const setup = await new Browser().get("/api/cms/setup");
    expect(setup.data.ownerConfigured).toBe(true);
    expect(setup.data.recoveryEmail).toBe(!!testEnv.RESEND_API_KEY);
  });
});

describe("superusuarios del CMS", () => {
  it("el propietario crea un superusuario: entra al CMS y a la administración, cambia su clave y el propietario puede retirarlo", async () => {
    // Las pruebas anteriores cambiaron la contraseña del propietario: vuelve al secreto inicial.
    await db.prepare("UPDATE users SET password_hash=? WHERE email=?").bind(ADMIN_PASSWORD_MARKER, ADMIN.email.toLowerCase()).run();
    const owner = await admin();
    const pro = await register("pro");
    expect((await pro.browser.post("/api/cms/superusers", { email: "x@test.ec", password: "Clave-Segura-2026" })).status).toBe(403);
    expect((await owner.post("/api/cms/superusers", { email: "super@test.ec", password: "corta123" })).status).toBe(400);
    const added = await owner.post("/api/cms/superusers", { email: "Super@Test.ec", name: "Dr. Superusuario", password: "Clave-Segura-2026" });
    expect(added.status).toBe(201);
    expect(added.data.superusers.map((u: { email: string }) => u.email)).toEqual(["super@test.ec"]);
    expect((await owner.post("/api/cms/superusers", { email: "super@test.ec", password: "Clave-Segura-2026" })).status).toBe(409);
    const row = await db
      .prepare("SELECT staff_role,password_hash FROM users WHERE email='super@test.ec'")
      .first<{ staff_role: string; password_hash: string }>();
    expect(row?.staff_role).toBe("superadmin");
    expect(row?.password_hash.startsWith("pbkdf2-sha256:")).toBe(true);
    const audit = await db.prepare("SELECT details FROM cms_audit WHERE action='superuser_added'").all<{ details: string }>();
    expect(JSON.stringify(audit.results)).not.toContain("Clave-Segura");

    const su = new Browser();
    expect((await su.post("/api/auth/login", { email: "super@test.ec", password: "otra-clave-1234" })).status).toBe(401);
    const login = await su.post("/api/auth/login", { email: "super@test.ec", password: "Clave-Segura-2026" });
    expect(login.status).toBe(200);
    expect(login.data.user).toMatchObject({ admin: true, cms: true, cms_role: "superuser" });
    expect((await su.get("/api/cms/session")).data.user.role).toBe("superuser");
    expect((await su.get("/api/admin/kpis")).status).toBe(200);
    expect((await su.get("/api/admin/payouts")).status).toBe(200);
    // Un superusuario no gestiona superusuarios.
    expect((await su.get("/api/cms/superusers")).status).toBe(403);
    expect((await su.post("/api/cms/superusers", { email: "otro@test.ec", password: "Clave-Segura-2026" })).status).toBe(403);
    // Cambia su propia contraseña.
    expect((await su.post("/api/auth/owner/password", { current: "Clave-Segura-2026", next: "Nueva-Clave-Medico-2026" })).status).toBe(200);
    expect((await new Browser().post("/api/auth/login", { email: "super@test.ec", password: "Clave-Segura-2026" })).status).toBe(401);
    expect((await new Browser().post("/api/auth/login", { email: "super@test.ec", password: "Nueva-Clave-Medico-2026" })).status).toBe(200);
    // Recuperación por enlace también para superusuarios.
    const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
    await db
      .prepare("INSERT INTO owner_resets(token_hash,email,expires_at,created_at) VALUES(?,?,?,?)")
      .bind(await sha256(token), "super@test.ec", Date.now() + 600_000, Date.now())
      .run();
    const reset = await new Browser().post("/api/auth/owner/reset", { token, password: "Recuperada-Medico-2026" });
    expect(reset.status).toBe(200);
    expect(reset.data.user.cms_role).toBe("superuser");
    // El propietario retira el acceso: sesiones cerradas y la contraseña deja de valer.
    const id = added.data.superusers[0].id;
    expect((await owner.del(`/api/cms/superusers/${id}`)).status).toBe(200);
    expect((await su.get("/api/cms/session")).status).toBe(403);
    expect((await su.get("/api/auth/me")).data.user).toBeNull();
    expect((await new Browser().post("/api/auth/login", { email: "super@test.ec", password: "Recuperada-Medico-2026" })).status).toBe(401);
    expect((await owner.get("/api/auth/me")).data.user.cms_role).toBe("owner");
  });
});
