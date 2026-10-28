import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { api } from "../server/app";
import type { Env } from "../server/env";

export const testEnv = env as unknown as Env;
/** Credenciales de administración del entorno de prueba (wrangler.test.jsonc). */
export const ADMIN = { email: String(testEnv.BUSCADR_ADMIN_EMAIL), password: String(testEnv.BUSCADR_ADMIN_PASSWORD) };

/** Cliente HTTP de prueba con cookie de sesión propia (simula un navegador). */
export class Browser {
  cookie = "";
  ip: string;
  env: Env = testEnv;
  constructor(ip = `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`) {
    this.ip = ip;
  }
  async call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "cf-connecting-ip": this.ip,
      ...(method !== "GET" ? { "X-Requested-With": "BUSCADR-WEB" } : {}),
      ...extra,
    };
    if (body !== undefined && !(body instanceof Uint8Array) && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    if (this.cookie) headers.cookie = this.cookie;
    const ctx = createExecutionContext();
    const res = await api.request(
      path,
      { method, headers, body: body === undefined ? undefined : body instanceof Uint8Array ? (body as Uint8Array<ArrayBuffer>) : JSON.stringify(body) },
      this.env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const text = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { text };
    }
    return { status: res.status, data, headers: res.headers };
  }
  get = (p: string) => this.call("GET", p);
  post = (p: string, b: unknown = {}) => this.call("POST", p, b);
  patch = (p: string, b: unknown = {}) => this.call("PATCH", p, b);
  put = (p: string, b: unknown = {}) => this.call("PUT", p, b);
  del = (p: string) => this.call("DELETE", p);
}

let n = 0;
export async function register(role: "patient" | "pro", extra: Record<string, unknown> = {}) {
  const b = new Browser();
  const email = `${role}${++n}-${Date.now()}@test.ec`;
  const res = await b.post("/api/auth/register", {
    name: `Persona ${role} ${n}`,
    email,
    password: "contrasena-segura",
    role,
    city: "Guayaquil",
    acceptTerms: true,
    ...extra,
  });
  if (res.status !== 201) throw new Error(`register ${res.status} ${JSON.stringify(res.data)}`);
  return { browser: b, email, user: res.data.user };
}

export async function admin() {
  const b = new Browser();
  const res = await b.post("/api/auth/login", ADMIN);
  if (res.status !== 200) throw new Error(`admin login ${res.status} ${JSON.stringify(res.data)}`);
  return b;
}

/** PNG 1×1 válido (firma real) para subir fotos. */
export const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

/** Profesional con perfil completo, verificado y publicado por la administración. */
export async function publishedPractitioner(extra: Record<string, unknown> = {}) {
  const pro = await register("pro", { phone: "0991234567", whatsapp_opt_in: true });
  const created = await pro.browser.post("/api/pro/me", {
    title: "Dra.",
    display_name: `Prueba ${Math.random().toString(36).slice(2, 7)}`,
    specialty: "pediatria",
    city: "Guayaquil",
    sector: "Urdesa",
    ...extra,
  });
  if (created.status !== 201) throw new Error(`create ${created.status} ${JSON.stringify(created.data)}`);
  const patch = await pro.browser.patch("/api/pro/me", {
    bio: "Pediatra con experiencia en control de niño sano, vacunas y orientación a familias.",
    license_number: "ACESS-123456",
    price_in_person_cents: 4000,
    price_virtual_cents: 3000,
    virtual_enabled: true,
    address: "Av. Principal 123, consultorio 4",
    ...extra,
  });
  if (patch.status !== 200) throw new Error(`patch ${patch.status} ${JSON.stringify(patch.data)}`);
  const submit = await pro.browser.post("/api/pro/me/submit");
  if (submit.status !== 200) throw new Error(`submit ${submit.status} ${JSON.stringify(submit.data)}`);
  const adm = await admin();
  const id = created.data.practitioner.id as number;
  const ok = await adm.post(`/api/admin/practitioners/${id}/review`, { decision: "approve" });
  if (ok.status !== 200) throw new Error(`approve ${ok.status} ${JSON.stringify(ok.data)}`);
  return { pro, id, slug: created.data.practitioner.slug as string };
}

/** Próximo día hábil (lunes a viernes) a `minDays` o más días, a la hora local indicada: «YYYY-MM-DDTHH:MM». */
export function weekday(minDays = 2, hour = 9, minute = 0) {
  for (let i = minDays; i < minDays + 10; i++) {
    const d = new Date(Date.now() - 5 * 3_600_000 + i * 86_400_000);
    if (d.getUTCDay() >= 1 && d.getUTCDay() <= 5) {
      d.setUTCHours(hour, minute, 0, 0);
      return d.toISOString().slice(0, 16);
    }
  }
  throw new Error("sin día hábil");
}

/** Fechas futuras en hora de Ecuador: «YYYY-MM-DDTHH:MM». */
export function local(daysFromNow: number, hour = 9) {
  const d = new Date(Date.now() - 5 * 3_600_000 + daysFromNow * 86_400_000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

export const key = () => crypto.randomUUID().replace(/-/g, "");
