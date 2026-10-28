/** Pruebas de API e integración en workerd con D1 real y las migraciones del repositorio. */
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { scheduledMaintenance } from "../server/cron";
import type { Env } from "../server/env";
import { hmacHex } from "../server/lib/crypto";
import { Browser, CARD, PNG, admin, bookPaid, key, publishedPractitioner, register, weekday } from "./helpers";

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

  it("cada respuesta lleva identificador de solicitud y tiempo de servidor; los errores lo incluyen", async () => {
    const ok = await new Browser().get("/api/catalog");
    expect(ok.headers.get("x-request-id")).toMatch(/^[\w-]{8,}$/);
    expect(ok.headers.get("server-timing")).toMatch(/^app;dur=\d+$/);
    const missing = await new Browser().get("/api/no-existe");
    expect(missing.status).toBe(404);
    expect(missing.data.code).toBe("NOT_FOUND");
    const bad = await new Browser().post("/api/auth/register", { email: "x" });
    expect(bad.status).toBe(400);
    expect(bad.data.request_id).toBe(bad.headers.get("x-request-id"));
  });

  it("al superar el límite de intentos responde 429 con Retry-After y el tiempo de espera", async () => {
    const b = new Browser();
    let last = await b.post("/api/auth/login", { email: "nadie@test.ec", password: "x" });
    for (let i = 0; i < 40 && last.status !== 429; i++) last = await b.post("/api/auth/login", { email: "nadie@test.ec", password: "x" });
    expect(last.status).toBe(429);
    expect(Number(last.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(last.data.error).toMatch(/minutos?/);
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
  it("flujo presencial: solicitud → pago con tarjeta → confirmación del médico → atendida → opinión verificada", async () => {
    const { pro, id, slug } = await publishedPractitioner();
    const patient = await register("patient", { phone: "0987654321", whatsapp_opt_in: true });
    const start = weekday(2, 9);
    // Solo tarjeta: aunque pida pagar en el consultorio, la cita se paga al reservar.
    const res = await patient.browser.post("/api/appointments", {
      practitioner_id: id,
      start,
      modality: "presencial",
      payment_mode: "consultorio",
      idempotency_key: key(),
      reason: "Control",
    });
    expect(res.status).toBe(201);
    expect(res.data.status).toBe("solicitada");
    expect(res.data.checkout).toMatch(/^\/pagar\//);
    const aid = res.data.id;
    expect((await patient.browser.post(`/api/payments/${String(res.data.checkout).split("/").pop()}/sandbox`, CARD)).data.status).toBe("aprobado");
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
    expect((await pro.browser.get(`/api/appointments/${aid}`)).data.appointment.actions).not.toContain("mark_paid");
    expect((await pro.browser.post(`/api/appointments/${aid}/actions/complete`)).status).toBe(200);
    expect((await pro.browser.post(`/api/appointments/${aid}/actions/mark_paid`, { body: "efectivo" })).status).toBe(409);
    const income = await pro.browser.get("/api/pro/income");
    expect(income.data.totals).toMatchObject({ gross_cents: 4000, fee_cents: 320, net_cents: 3680, office_cents: 0 });
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

  it("perfiles de muestra: pago con tarjeta de prueba, confirmada al instante y sin ocupar la agenda", async () => {
    const p1 = await register("patient");
    const p2 = await register("patient");
    const start = weekday(2, 9);
    const a = await bookPaid(p1, { practitioner_id: 4, start, modality: "presencial" });
    expect(a.created.demo).toBe(true);
    const pay = await db.prepare("SELECT gateway FROM payments WHERE id=?").bind(a.payId).first<{ gateway: string }>();
    expect(pay?.gateway).toBe("sandbox");
    const row = await db.prepare("SELECT status FROM appointments WHERE id=?").bind(a.id).first<{ status: string }>();
    expect(row?.status).toBe("confirmada");
    // Las citas de muestra no generan saldo a liquidar.
    expect(await db.prepare("SELECT 1 FROM earnings WHERE payment_id=?").bind(a.payId).first()).toBeNull();
    const b = await p2.browser.post("/api/appointments", { practitioner_id: 4, start, modality: "presencial", idempotency_key: key() });
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
    const res = { data: await bookPaid(patient, { practitioner_id: id, start: weekday(4, 16), modality: "presencial" }) };
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

describe("taxonomía médica", () => {
  it("incluye la taxonomía completa agrupada por categoría", async () => {
    const cat = await new Browser().get("/api/catalog");
    expect(cat.data.specialties.length).toBeGreaterThanOrEqual(80);
    expect(cat.data.categories.length).toBeGreaterThanOrEqual(10);
    const slugs = new Set(cat.data.categories.map((c: { slug: string }) => c.slug));
    expect(cat.data.specialties.every((s: { category: string }) => slugs.has(s.category))).toBe(true);
    const search = await new Browser().get(`/api/practitioners?q=${encodeURIComponent("necesito brackets")}`);
    expect(search.data.specialty).toBe("ortodoncia");
  });

  it("el CMS agrega categorías y especialidades propias que usan el directorio y los profesionales", async () => {
    const adm = await admin();
    const site = await adm.get("/api/cms/site");
    const d = site.data.draft;
    const config = {
      ...d,
      categories: [
        ...d.categories,
        { slug: "medicina-integrativa", name: "Medicina integrativa", icon: "spa", tone: "verde", visible: true, order: 50, custom: true },
        // Slug inválido o que choca con uno base: se descarta.
        { slug: "../hack", name: "Hack", custom: true },
        { slug: "odontologia", name: "Duplicada", custom: true },
      ],
      specialties: [
        ...d.specialties,
        {
          slug: "medicina-hiperbarica",
          name: "Medicina hiperbárica",
          professional: "Especialista en medicina hiperbárica",
          category: "medicina-integrativa",
          icon: "wind",
          tone: "cielo",
          keywords: "Oxígeno cámara heridas <script>",
          visible: true,
          order: 5,
          custom: true,
        },
        { slug: "pediatria", name: "Pediatría falsa", custom: true },
      ],
    };
    expect((await adm.put("/api/cms/site", { config, expectedVersion: site.data.version })).status).toBe(200);
    expect((await adm.post("/api/cms/publish")).status).toBe(200);

    const cat = await new Browser().get("/api/catalog");
    const hyper = cat.data.specialties.find((s: { slug: string }) => s.slug === "medicina-hiperbarica");
    expect(hyper).toMatchObject({ name: "Medicina hiperbárica", category: "medicina-integrativa", custom: true });
    expect(cat.data.categories.some((c: { slug: string }) => c.slug === "medicina-integrativa")).toBe(true);
    expect(cat.data.categories.some((c: { slug: string }) => c.slug === "../hack")).toBe(false);
    expect(cat.data.specialties.filter((s: { slug: string }) => s.slug === "pediatria")).toHaveLength(1);
    expect(cat.data.specialties.find((s: { slug: string }) => s.slug === "pediatria").name).not.toBe("Pediatría falsa");
    // Palabras clave saneadas: sin etiquetas ni tildes, sirven para entender búsquedas libres.
    expect((await new Browser().get(`/api/practitioners?q=${encodeURIComponent("cámara de oxígeno")}`)).data.specialty).toBe("medicina-hiperbarica");

    // Un profesional puede elegirla; una inexistente se rechaza.
    const { browser } = await register("pro");
    const bad = await browser.post("/api/pro/me", { display_name: "Prueba Hiperbárica", specialty: "no-existe", city: "Guayaquil" });
    expect(bad.status).toBe(400);
    const ok = await browser.post("/api/pro/me", { display_name: "Prueba Hiperbárica", specialty: "medicina-hiperbarica", city: "Guayaquil" });
    expect(ok.status).toBe(201);
    expect(ok.data.practitioner.specialty_name).toBe("Medicina hiperbárica");
  });
});

describe("pasarelas de pago (CMS)", () => {
  const adminPut = async (adm: Browser, id: string, body: Record<string, unknown>) => adm.put(`/api/cms/payments/${id}`, body);

  it("credenciales cifradas que nunca se devuelven y activación con datos completos y confirmación de cobro real", async () => {
    const { browser } = await register("patient");
    expect((await browser.get("/api/cms/payments")).status).toBe(403);
    const adm = await admin();
    const list = await adm.get("/api/cms/payments");
    expect(list.data.gateways.map((g: { id: string }) => g.id).sort()).toEqual(["consultorio", "payphone", "sandbox", "transferencia"]);
    expect(list.data.coming_soon.length).toBeGreaterThan(0);
    expect(list.data.secrets_key).toBe(true);

    expect((await adminPut(adm, "payphone", { enabled: true })).data.code).toBe("GATEWAY_INCOMPLETE");
    const saved = await adminPut(adm, "payphone", { secrets: { token: "tok-secreto-123456", store_id: "tienda-987654" } });
    expect(saved.status).toBe(200);
    expect(JSON.stringify(saved.data)).not.toContain("tok-secreto");
    const pp = saved.data.gateways.find((g: { id: string }) => g.id === "payphone");
    expect(pp.secrets.find((s: { key: string }) => s.key === "token")).toMatchObject({ source: "cms", preview: "••••3456" });
    const row = await db.prepare("SELECT secrets_enc FROM payment_gateways WHERE id='payphone'").first<{ secrets_enc: string }>();
    expect(row?.secrets_enc).toMatch(/^v1:/);
    expect(row?.secrets_enc).not.toContain("tok-secreto");
    // Cobra dinero real: pide confirmación expresa (Go/No-Go).
    expect((await adminPut(adm, "payphone", { enabled: true })).data.code).toBe("CONFIRM_LIVE");
    expect((await adminPut(adm, "payphone", { enabled: true, confirm_live: true })).status).toBe(200);
    expect((await new Browser().get("/api/catalog")).data.gateways.some((g: { id: string }) => g.id === "payphone")).toBe(true);
    // La auditoría registra el cambio sin los valores.
    const audit = await db.prepare("SELECT details FROM cms_audit WHERE action='payment_gateway' ORDER BY id DESC LIMIT 5").all<{ details: string }>();
    expect(audit.results.map((r) => r.details).join(" ")).not.toContain("tok-secreto");
    expect((await adminPut(adm, "payphone", { enabled: false, secrets: { token: null, store_id: null } })).status).toBe(200);
  });

  it("solo tarjeta: transferencia y consultorio no se activan y siempre queda un medio con tarjeta", async () => {
    const adm = await admin();
    const list = await adm.get("/api/cms/payments");
    const byId = (id: string) => list.data.gateways.find((g: { id: string }) => g.id === id);
    expect(byId("transferencia")).toMatchObject({ card: false, enabled: false, active: false });
    expect(byId("consultorio")).toMatchObject({ card: false, enabled: false, active: false });
    expect(byId("transferencia").blocked).toMatch(/solo con tarjeta/);
    const bank = { bank: "Banco Pichincha", account_type: "Ahorros", account_number: "2201234567", holder: "buscaDR S.A.S.", id_number: "0999999999001" };
    expect((await adminPut(adm, "transferencia", { settings: bank, enabled: true, confirm_live: true })).data.code).toBe("CARD_ONLY");
    expect((await adminPut(adm, "consultorio", { enabled: true })).data.code).toBe("CARD_ONLY");
    // El modo de prueba es el único medio con tarjeta activo: no se puede apagar.
    expect((await adminPut(adm, "sandbox", { enabled: false })).data.code).toBe("LAST_CARD_GATEWAY");
    const cat = await new Browser().get("/api/catalog");
    expect(cat.data.gateways.map((g: { id: string }) => g.id)).toEqual(["sandbox"]);
    // Sin medios con tarjeta (p. ej. credenciales retiradas) nadie reserva una cita con tarifa.
    await db.prepare("UPDATE payment_gateways SET enabled=0 WHERE id='sandbox'").run();
    const { id } = await publishedPractitioner();
    const patient = await register("patient");
    const blocked = await patient.browser.post("/api/appointments", {
      practitioner_id: id,
      start: weekday(4, 9),
      modality: "presencial",
      idempotency_key: key(),
    });
    expect(blocked.status).toBe(503);
    expect(blocked.data.code).toBe("NO_CARD_GATEWAY");
    await db.prepare("UPDATE payment_gateways SET enabled=1 WHERE id='sandbox'").run();
  });

  it("la comisión se edita en el CMS y se aplica a las reservas nuevas", async () => {
    const adm = await admin();
    expect((await adm.put("/api/cms/payments/settings", { fee_bps: 5000 })).status).toBe(400);
    const saved = await adm.put("/api/cms/payments/settings", { fee_bps: 1000, release_days: 0, min_payout_cents: 500 });
    expect(saved.data.settings).toMatchObject({ fee_bps: 1000, release_days: 0, min_payout_cents: 500 });
    expect((await new Browser().get("/api/catalog")).data.fee_bps).toBe(1000);
    const { id } = await publishedPractitioner();
    const patient = await register("patient");
    const res = await patient.browser.post("/api/appointments", { practitioner_id: id, start: weekday(3, 9), modality: "presencial", idempotency_key: key() });
    const row = await db.prepare("SELECT fee_cents,net_cents FROM appointments WHERE id=?").bind(res.data.id).first();
    expect(row).toEqual({ fee_cents: 400, net_cents: 3600 });
    await adm.put("/api/cms/payments/settings", { fee_bps: 800, release_days: 2, min_payout_cents: 1000 });
  });
});

describe("trazabilidad con QR y satisfacción por etapa", () => {
  /** Cita presencial confirmada que empieza en 20 minutos (dentro de la ventana de llegada). */
  async function confirmedSoon(extra: Record<string, unknown> = {}) {
    const pp = await publishedPractitioner(extra);
    const patient = await register("patient");
    const { id: aid } = await bookPaid(patient, { practitioner_id: pp.id, start: weekday(2, 10), modality: "presencial" });
    expect((await pp.pro.browser.post(`/api/appointments/${aid}/actions/confirm`)).status).toBe(200);
    const start = Date.now() + 20 * 60_000;
    await db
      .prepare("UPDATE appointments SET start_ms=?,end_ms=?,block_until_ms=? WHERE id=?")
      .bind(start, start + 30 * 60_000, start + 30 * 60_000, aid)
      .run();
    return { ...pp, patient, aid };
  }

  it("el profesional escanea el QR del paciente: llegada → consulta → cierre, con tiempos y calificación privada", async () => {
    const { pro, patient, aid } = await confirmedSoon();
    const t = await patient.browser.get(`/api/trace/appointments/${aid}`);
    expect(t.status).toBe(200);
    expect(t.data.stages.map((s: { stage: string }) => s.stage)).toEqual(["reserva", "llegada", "consulta", "cierre"]);
    expect(t.data.stages[0].status).toBe("confirmada");
    expect(t.data.stages[1].status).toBe("pendiente");
    expect(t.data.qr.url).toMatch(/\/q\/a_[0-9a-f]{32}$/);
    expect(t.data.qr.path.length).toBeGreaterThan(100);
    const token = t.data.qr.url.split("/").pop();
    // El paciente no confirma su llegada a mano (usa el QR de recepción) ni califica algo no registrado.
    expect((await patient.browser.post(`/api/trace/appointments/${aid}/stages/llegada`)).status).toBe(409);
    expect((await patient.browser.put(`/api/trace/appointments/${aid}/stages/llegada/rating`, { rating: 5 })).status).toBe(409);
    // Sin sesión o con otra cuenta, el QR no revela ni confirma nada.
    expect((await new Browser().get(`/api/trace/scan/${token}`)).data.kind).toBe("login");
    const other = await register("pro");
    expect((await other.browser.get(`/api/trace/scan/${token}`)).data.kind).toBe("invalido");
    expect((await other.browser.post(`/api/trace/scan/${token}`)).status).toBe(409);
    // El propio paciente que lo abre va a su cita.
    expect((await patient.browser.get(`/api/trace/scan/${token}`)).data).toMatchObject({ kind: "cita", role: "patient", appointment_id: aid });

    const scan = await pro.browser.get(`/api/trace/scan/${token}`);
    expect(scan.data).toMatchObject({ kind: "cita", role: "pro", stage: "llegada", block: null });
    expect((await pro.browser.post(`/api/trace/scan/${token}`)).data.stage).toBe("llegada");
    expect((await pro.browser.post(`/api/trace/scan/${token}`)).data.stage).toBe("consulta");
    expect((await pro.browser.post(`/api/trace/scan/${token}`)).data.stage).toBe("cierre");
    expect((await pro.browser.post(`/api/trace/scan/${token}`)).status).toBe(409);
    const appt = await db.prepare("SELECT status FROM appointments WHERE id=?").bind(aid).first<{ status: string }>();
    expect(appt?.status).toBe("completada");
    const rows = await db.prepare("SELECT stage,method,actor_role FROM care_stages WHERE appointment_id=? ORDER BY confirmed_ms").bind(aid).all();
    expect(rows.results).toEqual([
      { stage: "llegada", method: "qr", actor_role: "profesional" },
      { stage: "consulta", method: "qr", actor_role: "profesional" },
      { stage: "cierre", method: "qr", actor_role: "profesional" },
    ]);

    const done = await patient.browser.get(`/api/trace/appointments/${aid}`);
    expect(done.data.stages.every((s: { status: string }) => s.status === "confirmada")).toBe(true);
    expect(done.data.metrics.wait_minutes).toBe(0);
    expect(done.data.qr).toBeNull();
    // Calificación por etapa: 1 a 5, solo etiquetas válidas, editable.
    expect((await patient.browser.put(`/api/trace/appointments/${aid}/stages/consulta/rating`, { rating: 6 })).status).toBe(400);
    const rated = await patient.browser.put(`/api/trace/appointments/${aid}/stages/consulta/rating`, {
      rating: 5,
      tags: ["Me escuchó", "Etiqueta inventada"],
      comment: "Muy clara la explicación",
    });
    expect(rated.status).toBe(200);
    expect(rated.data.stages[2].rating).toMatchObject({ rating: 5, label: "Excelente", tags: ["Me escuchó"] });
    expect((await patient.browser.put(`/api/trace/appointments/${aid}/stages/reserva/rating`, { rating: 4 })).status).toBe(200);
    // El profesional no ve la calificación individual ni puede calificar.
    const proView = await pro.browser.get(`/api/trace/appointments/${aid}`);
    expect(proView.data.stages[2].rating).toBeNull();
    expect((await pro.browser.put(`/api/trace/appointments/${aid}/stages/consulta/rating`, { rating: 1 })).status).toBe(403);
    // Calidad: con menos de 3 calificaciones no muestra promedios (anonimato).
    const q = await pro.browser.get("/api/trace/quality");
    expect(q.data.stages.find((s: { stage: string }) => s.stage === "consulta")).toMatchObject({ count: 1, average: null });
    expect(q.data.traced).toMatchObject({ full: 1, with_qr: 1 });
    expect(q.data.comments).toEqual([]);
  });

  it("el paciente confirma su llegada con el QR de recepción; rotarlo invalida el anterior", async () => {
    const { pro, patient, aid } = await confirmedSoon();
    const rec = await pro.browser.get("/api/trace/reception");
    expect(rec.data.url).toMatch(/\/q\/r_[0-9a-f]{32}$/);
    const token = rec.data.url.split("/").pop();
    expect((await pro.browser.get(`/api/trace/scan/${token}`)).data).toMatchObject({ kind: "recepcion", own: true });
    const look = await patient.browser.get(`/api/trace/scan/${token}`);
    expect(look.data).toMatchObject({ kind: "recepcion", own: false, block: null });
    expect(look.data.appointment.id).toBe(aid);
    expect((await patient.browser.post(`/api/trace/scan/${token}`)).data.stage).toBe("llegada");
    const row = await db.prepare("SELECT method,actor_role FROM care_stages WHERE appointment_id=? AND stage='llegada'").bind(aid).first();
    expect(row).toEqual({ method: "qr_recepcion", actor_role: "paciente" });
    // Un paciente sin cita con ese consultorio no confirma nada.
    const stranger = await register("patient");
    expect((await stranger.browser.get(`/api/trace/scan/${token}`)).data.appointment).toBeNull();
    const rotated = await pro.browser.post("/api/trace/reception/rotate");
    expect(rotated.data.url).not.toContain(token);
    expect((await patient.browser.get(`/api/trace/scan/${token}`)).data.kind).toBe("invalido");
    // El profesional sigue con la consulta desde su panel (confirmación manual) y luego no puede saltarse el orden.
    expect((await pro.browser.post(`/api/trace/appointments/${aid}/stages/cierre`)).status).toBe(409);
    expect((await pro.browser.post(`/api/trace/appointments/${aid}/stages/consulta`)).status).toBe(200);
  });

  it("cita virtual: el ingreso del paciente a la videoconsulta registra la llegada; completar sin QR registra el cierre", async () => {
    const { pro, id } = await publishedPractitioner();
    const patient = await register("patient");
    const { id: aid } = await bookPaid(patient, { practitioner_id: id, start: weekday(2, 11), modality: "virtual" });
    expect((await pro.browser.post(`/api/appointments/${aid}/actions/confirm`)).status).toBe(200);
    const start = Date.now() + 10 * 60_000;
    await db
      .prepare("UPDATE appointments SET start_ms=?,end_ms=?,block_until_ms=? WHERE id=?")
      .bind(start, start + 1_800_000, start + 1_800_000, aid)
      .run();
    const t = await patient.browser.get(`/api/trace/appointments/${aid}`);
    expect(t.data.qr).toBeNull();
    expect(t.data.stages[1]).toMatchObject({ label: "Ingreso a la videoconsulta", can_confirm: true });
    const entered = await patient.browser.post(`/api/trace/appointments/${aid}/stages/llegada`);
    expect(entered.status).toBe(200);
    expect((await patient.browser.post(`/api/trace/appointments/${aid}/stages/consulta`)).status).toBe(409);
    expect((await pro.browser.post(`/api/appointments/${aid}/actions/complete`)).status).toBe(200);
    const after = await patient.browser.get(`/api/trace/appointments/${aid}`);
    expect(after.data.stages.map((s: { status: string }) => s.status)).toEqual(["confirmada", "confirmada", "sin_registro", "confirmada"]);
  });
});

describe("liquidación al profesional", () => {
  it("cobro con tarjeta → parte del médico retenida → disponible al atender → liquidación transferida con referencia", async () => {
    const { pro, id } = await publishedPractitioner();
    const patient = await register("patient");
    const { id: aid, payId } = await bookPaid(patient, { practitioner_id: id, start: weekday(2, 16), modality: "presencial" });
    expect((await pro.browser.post(`/api/appointments/${aid}/actions/confirm`)).status).toBe(200);
    const line = () =>
      db.prepare("SELECT status,net_cents,fee_cents,test,payout_id FROM earnings WHERE payment_id=? AND kind='cita'").bind(payId).first<Record<string, any>>();
    expect(await line()).toMatchObject({ status: "retenido", net_cents: 3680, fee_cents: 320, test: 1 });
    // Se simula un cobro real (Payphone) para probar la transferencia a la cuenta del profesional.
    await db.prepare("UPDATE earnings SET test=0 WHERE payment_id=?").bind(payId).run();
    await db
      .prepare("UPDATE appointments SET start_ms=?,end_ms=? WHERE id=?")
      .bind(Date.now() - 600_000, Date.now() + 1_200_000, aid)
      .run();
    expect((await pro.browser.post(`/api/appointments/${aid}/actions/complete`)).status).toBe(200);
    expect((await line())?.status).toBe("disponible");
    let mine = await pro.browser.get("/api/pro/payouts");
    expect(mine.data.balance.real).toMatchObject({ releasing: 3680, available: 0 });
    expect(mine.data.settings.fee_bps).toBe(800);
    // Pasan los días de retención.
    await db
      .prepare("UPDATE earnings SET available_ms=? WHERE payment_id=?")
      .bind(Date.now() - 1000, payId)
      .run();
    const adm = await admin();
    expect((await pro.browser.post("/api/admin/payouts", { practitioner_id: id })).status).toBe(403);
    const noAccount = await adm.post("/api/admin/payouts", { practitioner_id: id });
    expect(noAccount.data.results[0].skipped).toMatch(/cuenta bancaria/);
    // Cuenta del profesional: validada, cifrada y enmascarada.
    expect(
      (
        await pro.browser.put("/api/pro/payouts/account", {
          bank: "Banco Pichincha",
          account_type: "Ahorros",
          account_number: "22012",
          holder: "Ana",
          id_number: "1",
        })
      ).status,
    ).toBe(400);
    const acc = await pro.browser.put("/api/pro/payouts/account", {
      bank: "Banco Pichincha",
      account_type: "Ahorros",
      account_number: "2201234567",
      holder: "Ana Prueba",
      id_number: "0912345678",
    });
    expect(acc.status).toBe(200);
    expect(acc.data.account.hint).toBe("Banco Pichincha · Ahorros ••••4567 · Ana Prueba");
    const stored = await db.prepare("SELECT payout_account_enc FROM practitioners WHERE id=?").bind(id).first<{ payout_account_enc: string }>();
    expect(stored?.payout_account_enc).toMatch(/^v1:/);
    expect(stored?.payout_account_enc).not.toContain("2201234567");
    expect(JSON.stringify((await pro.browser.get("/api/pro/me")).data)).not.toContain("payout_account");

    const created = await adm.post("/api/admin/payouts", { practitioner_id: id });
    expect(created.data.created).toBe(1);
    const po = created.data.results[0];
    expect(po.amount_cents).toBe(3680);
    expect((await line())?.status).toBe("liquidando");
    const csv = await adm.call("GET", "/api/admin/payouts/export");
    expect(csv.data.text).toContain("2201234567");
    expect(csv.data.text).toContain(`BUSCADR-LIQ-${po.payout_id}`);
    expect((await adm.post(`/api/admin/payouts/${po.payout_id}/paid`, { reference: "" })).status).toBe(400);
    expect((await adm.post(`/api/admin/payouts/${po.payout_id}/paid`, { reference: "TRF-889900" })).status).toBe(200);
    expect((await adm.post(`/api/admin/payouts/${po.payout_id}/paid`, { reference: "TRF-889900" })).status).toBe(409);
    expect((await line())?.status).toBe("pagado");
    mine = await pro.browser.get("/api/pro/payouts");
    expect(mine.data.balance.real.paid).toBe(3680);
    expect(mine.data.payouts[0]).toMatchObject({ status: "pagada", reference: "TRF-889900", amount_cents: 3680 });
    const note = (await pro.browser.get("/api/me/notifications")).data.items.find((n: { kind: string }) => n.kind === "liquidacion_pagada");
    expect(note.body).toContain("$36.80");
    // Un reembolso posterior se descuenta de la próxima liquidación con una línea de ajuste.
    expect((await adm.post(`/api/admin/payments/${payId}/refund`, { reason: "Reclamo" })).status).toBe(200);
    const adj = await db.prepare("SELECT net_cents,status FROM earnings WHERE payment_id=? AND kind='ajuste'").bind(payId).first();
    expect(adj).toEqual({ net_cents: -3680, status: "disponible" });
  });

  it("reembolso antes de liquidar anula la línea; la cancelación tardía la libera; los cobros de prueba se liquidan aparte", async () => {
    const { pro, id } = await publishedPractitioner();
    const patient = await register("patient");
    const a = await bookPaid(patient, { practitioner_id: id, start: weekday(3, 9), modality: "virtual" });
    expect((await patient.browser.post(`/api/appointments/${a.id}/actions/cancel`, { reason: "Viaje" })).data.refunded).toBe(true);
    expect((await db.prepare("SELECT status FROM earnings WHERE payment_id=?").bind(a.payId).first<{ status: string }>())?.status).toBe("anulado");
    const b = await bookPaid(patient, { practitioner_id: id, start: weekday(3, 10), modality: "virtual" });
    expect((await pro.browser.post(`/api/appointments/${b.id}/actions/confirm`)).status).toBe(200);
    await db
      .prepare("UPDATE appointments SET start_ms=?,end_ms=?,block_until_ms=? WHERE id=?")
      .bind(Date.now() + 3_600_000, Date.now() + 5_400_000, Date.now() + 5_400_000, b.id)
      .run();
    const late = await patient.browser.post(`/api/appointments/${b.id}/actions/cancel`, { reason: "Imprevisto" });
    expect(late.data.refunded).toBe(false);
    const e = await db.prepare("SELECT status,test FROM earnings WHERE payment_id=?").bind(b.payId).first();
    expect(e).toMatchObject({ status: "disponible", test: 1 });
    await db
      .prepare("UPDATE earnings SET available_ms=? WHERE payment_id=?")
      .bind(Date.now() - 1000, b.payId)
      .run();
    const adm = await admin();
    // Sin cuenta bancaria también se registra (prueba: no se transfiere dinero).
    const created = await adm.post("/api/admin/payouts", { practitioner_id: id, test: true });
    expect(created.data.results[0].amount_cents).toBe(2760);
    const list = await adm.get("/api/admin/payouts");
    expect(list.data.payouts.find((p: { id: number }) => p.id === created.data.results[0].payout_id)).toMatchObject({ test: 1, status: "pendiente" });
    expect((await adm.post(`/api/admin/payouts/${created.data.results[0].payout_id}/cancel`)).status).toBe(200);
    expect(await db.prepare("SELECT status,payout_id FROM earnings WHERE payment_id=?").bind(b.payId).first()).toEqual({
      status: "disponible",
      payout_id: null,
    });
  });
});

describe("citas subsecuentes", () => {
  /** Profesional con un paciente ya atendido (requisito para programarle una serie). */
  async function withPatient() {
    const pp = await publishedPractitioner();
    const patient = await register("patient", { name: "Lucía Paciente" });
    const first = await bookPaid(patient, { practitioner_id: pp.id, start: weekday(2, 9), modality: "presencial" });
    expect((await pp.pro.browser.post(`/api/appointments/${first.id}/actions/confirm`)).status).toBe(200);
    return { ...pp, patient, ref: first.id };
  }

  it("el profesional propone la serie, el paciente la acepta, paga cada sesión con tarjeta y las no pagadas se liberan", async () => {
    const { pro, patient, ref, id } = await withPatient();
    const list = await pro.browser.get(`/api/pro/followups?cita=${ref}`);
    expect(list.data.patients[0]).toMatchObject({ ref, name: "Lucía Paciente" });
    expect(list.data.prefill).toMatchObject({ ref });
    const series = { first_start: weekday(3, 11), interval_days: 7, sessions: 3, modality: "presencial" };
    const preview = await pro.browser.post("/api/pro/followups/preview", series);
    expect(preview.data.ok).toBe(true);
    expect(preview.data.sessions).toHaveLength(3);
    expect((await pro.browser.post("/api/pro/followups", { ...series, patient_ref: 999999, title: "Control", price_cents: 2500 })).status).toBe(400);
    const created = await pro.browser.post("/api/pro/followups", {
      ...series,
      patient_ref: ref,
      title: "Control de presión arterial",
      note: "Traer registro de tomas",
      price_cents: 2500,
    });
    expect(created.status).toBe(201);
    const planId = created.data.id;
    // El aviso no incluye el título (puede ser información de salud).
    const notes = (await patient.browser.get("/api/me/notifications")).data.items;
    const proposal = notes.find((n: { kind: string }) => n.kind === "subsecuentes_propuesta");
    expect(proposal.body).toContain("3 citas presenciales");
    expect(JSON.stringify(notes)).not.toContain("presión");
    expect((await (await register("patient")).browser.get(`/api/followups/${planId}`)).status).toBe(404);
    const mine = await patient.browser.get("/api/followups");
    expect(mine.data.plans[0]).toMatchObject({ id: planId, status: "propuesta", total_cents: 7500, can: { accept: true } });
    // Aceptar agenda las tres sesiones como citas confirmadas con pago con tarjeta pendiente.
    const ok = await patient.browser.post(`/api/followups/${planId}/accept`);
    expect(ok.data).toMatchObject({ scheduled: 3, conflicts: 0, pay_first: true });
    expect((await patient.browser.post(`/api/followups/${planId}/accept`)).status).toBe(409);
    const appts = (
      await db
        .prepare(
          "SELECT a.id,a.status,a.payment_status,a.hold_expires_ms,a.start_ms,a.fee_cents FROM followup_sessions s JOIN appointments a ON a.id=s.appointment_id WHERE s.plan_id=? ORDER BY s.seq",
        )
        .bind(planId)
        .all<Record<string, any>>()
    ).results;
    expect(appts.map((a) => [a.status, a.payment_status])).toEqual([
      ["confirmada", "pendiente"],
      ["confirmada", "pendiente"],
      ["confirmada", "pendiente"],
    ]);
    expect(appts[1].hold_expires_ms).toBe(appts[1].start_ms - 86_400_000);
    expect(appts[0].fee_cents).toBe(200);
    const listed = await patient.browser.get("/api/appointments");
    const item = (listed.data.items ?? listed.data.appointments).find((x: { id: number }) => x.id === appts[0].id);
    expect(item.followup).toEqual({ plan_id: planId, seq: 1, total: 3 });
    // Paga la primera sesión con la tarjeta de prueba.
    const pay = await patient.browser.post(`/api/appointments/${appts[0].id}/actions/pay`);
    const payId = String(pay.data.checkout).split("/").pop();
    expect((await patient.browser.post(`/api/payments/${payId}/sandbox`, CARD)).data.status).toBe("aprobado");
    const paid = await db.prepare("SELECT status,payment_status,hold_expires_ms FROM appointments WHERE id=?").bind(appts[0].id).first();
    expect(paid).toEqual({ status: "confirmada", payment_status: "pagado", hold_expires_ms: null });
    // La segunda no se paga a tiempo: el mantenimiento la libera.
    await db
      .prepare("UPDATE appointments SET hold_expires_ms=? WHERE id=?")
      .bind(Date.now() - 1000, appts[1].id)
      .run();
    const result = await scheduledMaintenance(env as unknown as Env);
    expect(result.released).toBeGreaterThanOrEqual(1);
    expect((await db.prepare("SELECT status FROM appointments WHERE id=?").bind(appts[1].id).first<{ status: string }>())?.status).toBe("cancelada");
    const view = await pro.browser.get(`/api/followups/${planId}`);
    expect(view.data.role).toBe("pro");
    expect(view.data.plan.summary).toMatchObject({ total: 3, upcoming: 2, unpaid: 1, cancelled: 1 });
    expect(view.data.plan.patient_name).toBe("Lucía Paciente");
    // El paciente cancela lo que falta; la sesión pagada se reembolsa (más de 4 h antes).
    const cancel = await patient.browser.post(`/api/followups/${planId}/cancel`, { reason: "Cambio de ciudad" });
    expect(cancel.data).toMatchObject({ cancelled: 2, refunded: 1 });
    expect((await pro.browser.get("/api/me/notifications")).data.items[0].kind).toBe("subsecuentes_cancelada");
    expect((await pro.browser.get(`/api/pro/followups`)).data.plans.find((p: { id: number }) => p.id === planId).status).toBe("cancelada");
    expect(id).toBeGreaterThan(0);
  });

  it("valida conflictos con la agenda, el rechazo del paciente y reagenda sesiones ocupadas", async () => {
    const { pro, patient, ref, id } = await withPatient();
    // Otra cita ocupa la tercera semana.
    const other = await register("patient");
    const busy = weekday(3, 15);
    const taken = await bookPaid(other, { practitioner_id: id, start: busy, modality: "presencial" });
    expect(taken.id).toBeGreaterThan(0);
    const series = { first_start: busy, interval_days: 14, sessions: 2, modality: "presencial", patient_ref: ref, title: "Curaciones", price_cents: 0 };
    const preview = await pro.browser.post("/api/pro/followups/preview", series);
    expect(preview.data.ok).toBe(false);
    expect(preview.data.sessions[0]).toMatchObject({ conflict: "ocupado", blocking: true });
    expect((await pro.browser.post("/api/pro/followups", series)).data.code).toBe("FOLLOWUP_CONFLICT");
    // Fuera del horario habitual es solo un aviso.
    const evening = await pro.browser.post("/api/pro/followups/preview", { ...series, first_start: weekday(3, 21) });
    expect(evening.data.sessions[0]).toMatchObject({ conflict: "fuera_horario", blocking: false });
    // Rechazo del paciente.
    const p1 = await pro.browser.post("/api/pro/followups", { ...series, first_start: weekday(4, 11) });
    expect((await patient.browser.post(`/api/followups/${p1.data.id}/decline`, { reason: "Prefiero otra fecha" })).status).toBe(200);
    expect((await pro.browser.get(`/api/followups/${p1.data.id}`)).data.plan.status).toBe("rechazada");
    // Sesión gratuita que se ocupa antes de aceptar: queda por reagendar y el profesional la reagenda.
    const p2 = await pro.browser.post("/api/pro/followups", { ...series, first_start: weekday(8, 15) });
    const sessions = await db.prepare("SELECT start_ms FROM followup_sessions WHERE plan_id=? ORDER BY seq").bind(p2.data.id).all<{ start_ms: number }>();
    await bookPaid(other, {
      practitioner_id: id,
      start: new Date(sessions.results[1].start_ms - 5 * 3_600_000).toISOString().slice(0, 16),
      modality: "presencial",
    });
    const accepted = await patient.browser.post(`/api/followups/${p2.data.id}/accept`);
    expect(accepted.data).toMatchObject({ scheduled: 1, conflicts: 1, pay_first: false });
    const free = await db
      .prepare("SELECT a.payment_status,a.price_cents FROM followup_sessions s JOIN appointments a ON a.id=s.appointment_id WHERE s.plan_id=? AND s.seq=1")
      .bind(p2.data.id)
      .first();
    expect(free).toEqual({ payment_status: "no_requerido", price_cents: 0 });
    const plan = (await pro.browser.get("/api/pro/followups")).data.plans.find((p: { id: number }) => p.id === p2.data.id);
    expect(plan.summary.conflicts).toBe(1);
    expect(plan.sessions[1].status_label).toBe("Por reagendar");
    const re = await pro.browser.post(`/api/pro/followups/${p2.data.id}/sessions/2`, { start: weekday(8, 16) });
    expect(re.status).toBe(200);
    expect((await patient.browser.get(`/api/followups/${p2.data.id}`)).data.plan.summary).toMatchObject({ upcoming: 2, conflicts: 0 });
  });
});
