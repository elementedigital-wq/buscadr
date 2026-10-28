/** Pruebas de API e integración en workerd con D1 real y las migraciones del repositorio. */
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { scheduledMaintenance } from "../server/cron";
import type { Env } from "../server/env";
import { hmacHex } from "../server/lib/crypto";
import { Browser, PNG, admin, key, publishedPractitioner, register, weekday } from "./helpers";

const db = (env as unknown as Env).DB;

describe("sistema", () => {
  it("salud con migraciones aplicadas, pagos en sandbox y perfiles de muestra", async () => {
    const health = await new Browser().get("/api/health");
    expect(health.status).toBe(200);
    expect(health.data.schema).toBe("ready");
    expect(health.data.payments).toBe("sandbox");
    const list = await new Browser().get("/api/practitioners");
    expect(list.data.items.length).toBeGreaterThanOrEqual(12);
    const demo = list.data.items.find((p: { demo: boolean }) => p.demo);
    // Los perfiles de muestra nunca muestran sello de verificado ni opiniones inventadas.
    expect(demo.verified).toBe(false);
    expect(demo.reviews).toBe(0);
  });

  it("rechaza escrituras sin cabecera anti-CSRF o de otro origen", async () => {
    const b = new Browser();
    expect((await b.call("POST", "/api/auth/login", {}, { "X-Requested-With": "" })).status).toBe(403);
    expect((await b.call("POST", "/api/auth/login", {}, { Origin: "https://evil.example" })).status).toBe(403);
  });

  it("catálogo con especialidades, planes y tarifas", async () => {
    const cat = await new Browser().get("/api/catalog");
    expect(cat.data.specialties.length).toBeGreaterThanOrEqual(8);
    expect(cat.data.plans.map((p: { id: string }) => p.id)).toEqual(["free", "agenda", "pro", "growth", "clinic"]);
    expect(cat.data.fee_bps).toBe(800);
  });
});

describe("directorio y búsqueda", () => {
  it("busca por especialidad, texto sin tildes, ciudad y modalidad virtual", async () => {
    const b = new Browser();
    const ped = await b.get("/api/practitioners?specialty=pediatria");
    expect(ped.data.items.length).toBeGreaterThan(0);
    expect(ped.data.items.every((p: { specialty: string }) => p.specialty === "pediatria")).toBe(true);
    const byText = await b.get("/api/practitioners?q=mendez");
    expect(byText.data.items.some((p: { display_name: string }) => p.display_name === "Carlos Méndez")).toBe(true);
    const symptom = await b.get("/api/practitioners?q=dentista");
    expect(symptom.data.items.every((p: { specialty: string }) => p.specialty === "odontologia")).toBe(true);
    const quito = await b.get("/api/practitioners?city=Quito");
    expect(quito.data.items.every((p: { city: string }) => p.city === "Quito")).toBe(true);
    const virtual = await b.get("/api/practitioners?modality=virtual");
    expect(virtual.data.items.every((p: { virtual: boolean }) => p.virtual)).toBe(true);
    const cheap = await b.get("/api/practitioners?sort=precio&modality=virtual");
    const prices = cheap.data.items.map((p: { price_virtual_cents: number }) => p.price_virtual_cents);
    expect(prices).toEqual([...prices].sort((x: number, y: number) => x - y));
  });

  it("ficha pública sin dirección exacta ni datos privados, con horarios libres", async () => {
    const { slug } = await publishedPractitioner();
    const b = new Browser();
    const prof = await b.get(`/api/practitioners/${slug}`);
    expect(prof.status).toBe(200);
    expect(prof.data.practitioner.verified).toBe(true);
    expect(prof.data.practitioner).not.toHaveProperty("address");
    expect(prof.data.practitioner.license_hint).toMatch(/^•••/);
    expect(JSON.stringify(prof.data)).not.toContain("0991234567");
    const av = await b.get(`/api/practitioners/${slug}/availability?from=${weekday(2).slice(0, 10)}&days=1`);
    expect(av.data.days[0].slots.length).toBeGreaterThan(0);
    expect(av.data.days[0].slots[0].modalities).toContain("presencial");
    expect((await b.get("/api/practitioners/no-existe")).status).toBe(404);
  });
});

describe("panel profesional", () => {
  it("onboarding: perfil en borrador, requisitos para enviar a verificación y aprobación", async () => {
    const pro = await register("pro");
    const created = await pro.browser.post("/api/pro/me", { display_name: "Laura Prueba", title: "Dra.", specialty: "dermatologia", city: "Quito" });
    expect(created.status).toBe(201);
    expect(created.data.practitioner.status).toBe("draft");
    const submit = await pro.browser.post("/api/pro/me/submit");
    expect(submit.status).toBe(400);
    expect(submit.data.error).toMatch(/registro profesional/);
    // No aparece en el directorio mientras está en borrador.
    expect((await new Browser().get(`/api/practitioners/${created.data.practitioner.slug}`)).status).toBe(404);
    const dashboard = await pro.browser.get("/api/pro/dashboard");
    expect(dashboard.data.steps.find((s: { key: string }) => s.key === "verificacion").done).toBe(false);
  });

  it("horario semanal validado, bloqueos y calendario", async () => {
    const { pro, slug } = await publishedPractitioner();
    const bad = await pro.browser.put("/api/pro/schedule", { rules: [{ weekday: 1, start_min: 600, end_min: 540 }] });
    expect(bad.status).toBe(400);
    const overlap = await pro.browser.put("/api/pro/schedule", {
      rules: [
        { weekday: 1, start_min: 540, end_min: 720 },
        { weekday: 1, start_min: 700, end_min: 800 },
      ],
    });
    expect(overlap.status).toBe(400);
    const ok = await pro.browser.put("/api/pro/schedule", {
      rules: [1, 2, 3, 4, 5].map((d) => ({ weekday: d, start_min: 480, end_min: 600, modality: "virtual" })),
    });
    expect(ok.status).toBe(200);
    const day = weekday(3).slice(0, 10);
    const av = await new Browser().get(`/api/practitioners/${slug}/availability?from=${day}&days=1`);
    expect(av.data.days[0].slots.every((s: { modalities: string[] }) => s.modalities.join() === "virtual")).toBe(true);
    const block = await pro.browser.post("/api/pro/blocks", { start: `${day}T00:00`, end: `${day}T23:59`, reason: "Congreso" });
    expect(block.status).toBe(201);
    const after = await new Browser().get(`/api/practitioners/${slug}/availability?from=${day}&days=1`);
    expect(after.data.days[0].slots).toHaveLength(0);
    const cal = await pro.browser.get(`/api/pro/calendar?from=${day}&days=7`);
    expect(cal.data.blocks).toHaveLength(1);
  });
});

describe("citas", () => {
  it("flujo presencial: solicitud → confirmación del médico → atendida → pago en consultorio → opinión verificada", async () => {
    const { pro, id, slug } = await publishedPractitioner();
    const patient = await register("patient", { phone: "0987654321", whatsapp_opt_in: true });
    const start = weekday(2, 9);
    const res = await patient.browser.post("/api/appointments", {
      practitioner_id: id,
      start,
      modality: "presencial",
      idempotency_key: key(),
      reason: "Control",
    });
    expect(res.status).toBe(201);
    expect(res.data.status).toBe("solicitada");
    expect(res.data.checkout).toBeNull();
    const aid = res.data.id;
    // El paciente no puede confirmar su propia cita; otra cuenta ni siquiera la ve.
    expect((await patient.browser.post(`/api/appointments/${aid}/actions/confirm`)).status).toBe(409);
    const stranger = await register("patient");
    expect((await stranger.browser.get(`/api/appointments/${aid}`)).status).toBe(404);
    // Antes de confirmar, la dirección exacta no se muestra.
    expect((await patient.browser.get(`/api/appointments/${aid}`)).data.appointment.practitioner.address).toBeNull();
    // Notificación al profesional en la app y aviso de WhatsApp registrado (no enviado sin credenciales).
    const proNotes = await pro.browser.get("/api/me/notifications");
    expect(proNotes.data.items[0].kind).toBe("cita_solicitada");
    const log = await db.prepare("SELECT status FROM notification_log WHERE ref=? AND channel='whatsapp'").bind(`cita:${aid}`).first<{ status: string }>();
    expect(log?.status).toBe("skipped_not_configured");
    expect((await pro.browser.post(`/api/appointments/${aid}/actions/confirm`)).status).toBe(200);
    const detail = await patient.browser.get(`/api/appointments/${aid}`);
    expect(detail.data.appointment.status).toBe("confirmada");
    expect(detail.data.appointment.practitioner.address).toContain("Av. Principal");
    expect(detail.data.appointment.checkin_code).toMatch(/^\d{6}$/);
    expect((await patient.browser.get("/api/me/notifications")).data.items.some((n: { kind: string }) => n.kind === "cita_confirmada")).toBe(true);
    const ics = await patient.browser.call("GET", `/api/appointments/${aid}/ics`);
    expect(ics.headers.get("content-type")).toContain("text/calendar");
    expect(ics.data.text).toContain("BEGIN:VEVENT");
    // Llega la hora de la cita: el profesional la marca atendida y registra el pago en el consultorio.
    await db
      .prepare("UPDATE appointments SET start_ms=?, end_ms=? WHERE id=?")
      .bind(Date.now() - 600_000, Date.now() + 1_200_000, aid)
      .run();
    expect((await pro.browser.post(`/api/appointments/${aid}/actions/complete`)).status).toBe(200);
    expect((await pro.browser.post(`/api/appointments/${aid}/actions/mark_paid`, { body: "efectivo" })).status).toBe(200);
    const income = await pro.browser.get("/api/pro/income");
    expect(income.data.totals.office_cents).toBe(4000);
    expect(income.data.items[0].provider).toBe("consultorio");
    const review = await patient.browser.post(`/api/appointments/${aid}/actions/review`, { rating: 5, body: "Muy amable y puntual." });
    expect(review.status).toBe(200);
    expect((await patient.browser.post(`/api/appointments/${aid}/actions/review`, { rating: 4 })).status).toBe(409);
    const prof = await new Browser().get(`/api/practitioners/${slug}`);
    expect(prof.data.practitioner.rating).toBe(5);
    expect(prof.data.reviews[0].body).toBe("Muy amable y puntual.");
  });

  it("evita citas dobles con 20 solicitudes simultáneas al mismo horario (un solo ganador)", async () => {
    const { id } = await publishedPractitioner();
    const start = weekday(4, 10);
    const patients = await Promise.all(Array.from({ length: 20 }, () => register("patient")));
    const results = await Promise.all(
      patients.map((p) => p.browser.post("/api/appointments", { practitioner_id: id, start, modality: "presencial", idempotency_key: key() })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409).every((r) => r.data.code === "BOOKING_SLOT_TAKEN")).toBe(true);
  });

  it("es idempotente y solo acepta horarios publicados", async () => {
    const { id } = await publishedPractitioner();
    const p = await register("patient");
    const k = key();
    const start = weekday(5, 11);
    const first = await p.browser.post("/api/appointments", { practitioner_id: id, start, modality: "presencial", idempotency_key: k });
    const again = await p.browser.post("/api/appointments", { practitioner_id: id, start, modality: "presencial", idempotency_key: k });
    expect(again.data.id).toBe(first.data.id);
    expect(again.data.repeated).toBe(true);
    const offHours = await p.browser.post("/api/appointments", { practitioner_id: id, start: weekday(5, 21), modality: "presencial", idempotency_key: key() });
    expect(offHours.status).toBe(409);
  });

  it("cita virtual con tarifa propia, pago previo con buscaDR Pay (sandbox), sala de videollamada y reembolso al cancelar a tiempo", async () => {
    const { pro, id } = await publishedPractitioner();
    const patient = await register("patient");
    const res = await patient.browser.post("/api/appointments", { practitioner_id: id, start: weekday(3, 15), modality: "virtual", idempotency_key: key() });
    expect(res.status).toBe(201);
    expect(res.data.checkout).toMatch(/^\/pagar\/[0-9a-f-]{36}$/);
    const payId = res.data.checkout.split("/").pop();
    const aid = res.data.id;
    const appt = await db
      .prepare("SELECT price_cents,fee_cents,net_cents,payment_status,video_room FROM appointments WHERE id=?")
      .bind(aid)
      .first<Record<string, any>>();
    expect(appt?.price_cents).toBe(3000);
    expect(appt?.fee_cents).toBe(240);
    expect(appt?.net_cents).toBe(2760);
    expect(appt?.payment_status).toBe("pendiente");
    expect(appt?.video_room).toMatch(/^buscaDR-[0-9a-f]{24}$/);
    // Mientras no paga, el profesional no puede confirmarla.
    expect((await pro.browser.get(`/api/appointments/${aid}`)).data.appointment.actions).not.toContain("confirm");
    // Otra cuenta no puede pagar ni ver el checkout.
    expect((await (await register("patient")).browser.get(`/api/payments/${payId}`)).status).toBe(404);
    const declined = await patient.browser.post(`/api/payments/${payId}/sandbox`, {
      number: "4000 0000 0000 0002",
      exp: "12/30",
      cvv: "123",
      name: "Paciente Prueba",
    });
    expect(declined.data.status).toBe("rechazado");
    const invalid = await patient.browser.post(`/api/payments/${payId}/sandbox`, {
      number: "4111 1111 1111 1112",
      exp: "12/30",
      cvv: "123",
      name: "Paciente Prueba",
    });
    expect(invalid.status).toBe(400);
    const paid = await patient.browser.post(`/api/payments/${payId}/sandbox`, {
      number: "4111 1111 1111 1111",
      exp: "12/30",
      cvv: "123",
      name: "Paciente Prueba",
    });
    expect(paid.data.status).toBe("aprobado");
    const row = await db.prepare("SELECT status,card_last4,card_brand FROM payments WHERE id=?").bind(payId).first<Record<string, any>>();
    expect(row).toMatchObject({ status: "aprobado", card_last4: "1111", card_brand: "Visa" });
    expect(JSON.stringify(await db.prepare("SELECT * FROM payments WHERE id=?").bind(payId).first())).not.toContain("4111111111111111");
    const proView = await pro.browser.get(`/api/appointments/${aid}`);
    expect(proView.data.appointment.payment_status).toBe("pagado");
    expect(proView.data.appointment.actions).toContain("confirm");
    expect((await pro.browser.post(`/api/appointments/${aid}/actions/confirm`)).status).toBe(200);
    const view = await patient.browser.get(`/api/appointments/${aid}`);
    // La videollamada se abre 15 min antes; el enlace aún no se entrega.
    expect(view.data.appointment.video.open).toBe(false);
    expect(view.data.appointment.video.url).toBeNull();
    const cancel = await patient.browser.post(`/api/appointments/${aid}/actions/cancel`, { reason: "Viaje" });
    expect(cancel.data.refunded).toBe(true);
    expect((await db.prepare("SELECT status FROM payments WHERE id=?").bind(payId).first<{ status: string }>())?.status).toBe("reembolsado");
    const ledger = await (await admin()).get("/api/admin/payments");
    expect(ledger.data.items.some((p: { id: string; status: string }) => p.id === payId && p.status === "reembolsado")).toBe(true);
  });

  it("reprograma de forma atómica y vence solicitudes sin respuesta", async () => {
    const { pro, id } = await publishedPractitioner();
    const patient = await register("patient");
    const res = await patient.browser.post("/api/appointments", { practitioner_id: id, start: weekday(3, 9), modality: "presencial", idempotency_key: key() });
    const moved = await patient.browser.post(`/api/appointments/${res.data.id}/actions/reschedule`, { start: weekday(3, 10) });
    expect(moved.status).toBe(200);
    const old = await db.prepare("SELECT status,cancel_reason FROM appointments WHERE id=?").bind(res.data.id).first<Record<string, string>>();
    expect(old?.status).toBe("cancelada");
    expect(old?.cancel_reason).toMatch(/Reprogramada/);
    const fresh = await db.prepare("SELECT status,rescheduled_from FROM appointments WHERE id=?").bind(moved.data.id).first<Record<string, any>>();
    expect(fresh?.rescheduled_from).toBe(res.data.id);
    // Sin respuesta del profesional, la solicitud vence y libera el horario.
    await db
      .prepare("UPDATE appointments SET hold_expires_ms=? WHERE id=?")
      .bind(Date.now() - 1000, moved.data.id)
      .run();
    const result = await scheduledMaintenance(env as unknown as Env);
    expect(result.expired).toBeGreaterThanOrEqual(1);
    expect((await pro.browser.post(`/api/appointments/${moved.data.id}/actions/confirm`)).status).toBe(409);
  });

  it("perfiles de muestra: cita de prueba confirmada al instante sin ocupar la agenda", async () => {
    const p1 = await register("patient");
    const p2 = await register("patient");
    const start = weekday(2, 9);
    const a = await p1.browser.post("/api/appointments", { practitioner_id: 4, start, modality: "presencial", idempotency_key: key() });
    const b = await p2.browser.post("/api/appointments", { practitioner_id: 4, start, modality: "presencial", idempotency_key: key() });
    expect(a.data.status).toBe("confirmada");
    expect(a.data.demo).toBe(true);
    expect(b.status).toBe(201);
  });
});

describe("WhatsApp", () => {
  it("verifica el webhook de Meta y rechaza firmas inválidas", async () => {
    const b = new Browser();
    expect((await b.get("/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=abc123")).data.text).toBe("abc123");
    expect((await b.get("/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=abc")).status).toBe(403);
    expect((await b.call("POST", "/api/whatsapp/webhook", { entry: [] }, { "x-hub-signature-256": "sha256=00" })).status).toBe(401);
  });

  it("el profesional confirma la cita con el botón de WhatsApp (una sola vez)", async () => {
    const { id } = await publishedPractitioner();
    const patient = await register("patient");
    const res = await patient.browser.post("/api/appointments", { practitioner_id: id, start: weekday(4, 16), modality: "presencial", idempotency_key: key() });
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ id: `wamid.${key()}`, from: "593991234567", type: "interactive", interactive: { button_reply: { id: `acc:${res.data.id}` } } }],
              },
            },
          ],
        },
      ],
    });
    const sig = `sha256=${await hmacHex("test-app-secret", body)}`;
    const hook = await new Browser().call("POST", "/api/whatsapp/webhook", JSON.parse(body), { "x-hub-signature-256": sig });
    expect(hook.status).toBe(200);
    const row = await db.prepare("SELECT status FROM appointments WHERE id=?").bind(res.data.id).first<{ status: string }>();
    expect(row?.status).toBe("confirmada");
  });
});

describe("planes y administración", () => {
  it("compra de plan Pro con buscaDR Pay activa el plan por 30 días", async () => {
    const { pro, id } = await publishedPractitioner();
    const buy = await pro.browser.post("/api/pro/plan", { plan: "pro" });
    const payId = buy.data.checkout.split("/").pop();
    const paid = await pro.browser.post(`/api/payments/${payId}/sandbox`, { number: "5555 5555 5555 4444", exp: "10/31", cvv: "321", name: "Dra Prueba" });
    expect(paid.data.status).toBe("aprobado");
    const p = await db.prepare("SELECT plan,plan_until_ms FROM practitioners WHERE id=?").bind(id).first<{ plan: string; plan_until_ms: number }>();
    expect(p?.plan).toBe("pro");
    expect(p!.plan_until_ms).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    const kpis = await (await admin()).get("/api/admin/kpis");
    expect(kpis.data.saas.mrr).toBeGreaterThanOrEqual(2900);
  });

  it("solo el propietario entra a la administración; cambiar datos de identidad retira el sello verificado", async () => {
    const { pro, id } = await publishedPractitioner();
    expect((await pro.browser.get("/api/admin/kpis")).status).toBe(403);
    expect((await pro.browser.get("/api/auth/me")).data.user.cms).toBe(false);
    const adm = await admin();
    expect((await adm.get("/api/auth/me")).data.user.cms).toBe(true);
    await pro.browser.patch("/api/pro/me", { specialty: "nutricion" });
    const row = await db.prepare("SELECT verification,status FROM practitioners WHERE id=?").bind(id).first<{ verification: string; status: string }>();
    expect(row).toEqual({ verification: "pendiente", status: "active" });
  });
});

describe("CMS Maestro", () => {
  it("borrador, publicación con versiones y conflicto de versión", async () => {
    const adm = await admin();
    const site = await adm.get("/api/cms/site");
    const draft = { ...site.data.draft, hero: { ...site.data.draft.hero, title: "Título de prueba" } };
    expect((await adm.put("/api/cms/site", { config: draft, expectedVersion: site.data.version })).status).toBe(200);
    expect((await new Browser().get("/api/public/config")).data.config.hero.title).not.toBe("Título de prueba");
    expect((await adm.post("/api/cms/publish")).status).toBe(200);
    expect((await new Browser().get("/api/public/config")).data.config.hero.title).toBe("Título de prueba");
    expect((await adm.put("/api/cms/site", { config: draft, expectedVersion: site.data.version })).status).toBe(409);
  });

  it("biblioteca de imágenes en D1 y fuente subida con firma válida", async () => {
    const adm = await admin();
    const up = await adm.call("POST", "/api/cms/media?name=portada", PNG, { "Content-Type": "image/png" });
    expect(up.status).toBe(201);
    expect((await new Browser().get(up.data.url)).status).toBe(200);
    const fake = new TextEncoder().encode("<svg onload=alert(1)>".padEnd(80, " "));
    expect((await adm.call("POST", "/api/cms/fonts?ext=woff2", fake, { "Content-Type": "application/octet-stream" })).status).toBe(415);
    const woff2 = new Uint8Array(128);
    woff2.set([...new TextEncoder().encode("wOF2")]);
    const font = await adm.call("POST", "/api/cms/fonts?ext=woff2&name=Marca.woff2", woff2, { "Content-Type": "application/octet-stream" });
    expect(font.status).toBe(201);
    const { browser } = await register("pro");
    expect((await browser.call("POST", "/api/cms/fonts?ext=woff2", woff2, { "Content-Type": "application/octet-stream" })).status).toBe(403);
  });

  it("busca íconos en la librería completa de Font Awesome (solo propietario) y guarda su trazado", async () => {
    const adm = await admin();
    const res = await adm.get("/api/cms/icons?q=diente");
    expect(res.status).toBe(200);
    expect(res.data.icons[0].name).toBe("tooth");
    const rare = (await adm.get("/api/cms/icons?q=hospital")).data.icons.find((i: { name: string }) => i.name === "hospital");
    expect(rare.d.length).toBeGreaterThan(20);
    const site = await adm.get("/api/cms/site");
    const draft = {
      ...site.data.draft,
      theme: {
        ...site.data.draft.theme,
        iconLibrary: { "user-injured": [448, 512, "M240 80a80 80 0 1 1 0 160 80 80 0 1 1 0-160z"], "bad<script>": [1, 1, "M0 0"] },
      },
      specialties: site.data.draft.specialties.map((s: { slug: string }) => (s.slug === "traumatologia" ? { ...s, icon: "user-injured" } : s)),
    };
    const saved = await adm.put("/api/cms/site", { config: draft, expectedVersion: site.data.version });
    expect(saved.data.draft.theme.iconLibrary).toHaveProperty("user-injured");
    expect(saved.data.draft.theme.iconLibrary).not.toHaveProperty("bad<script>");
    expect(saved.data.draft.specialties.find((s: { slug: string }) => s.slug === "traumatologia").icon).toBe("user-injured");
    const { browser } = await register("patient");
    expect((await browser.get("/api/cms/icons?q=tooth")).status).toBe(403);
  });

  it("suspender una cuenta cierra sus sesiones", async () => {
    const adm = await admin();
    const { browser, user } = await register("patient");
    expect((await adm.post(`/api/cms/users/${user.id}/access`, { enabled: false })).status).toBe(200);
    expect((await browser.get("/api/auth/me")).data.user).toBeNull();
  });
});
