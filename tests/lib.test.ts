import { describe, expect, it } from "vitest";
import { ICON_ALIASES } from "../app/components/Icon";
import { ICON_NAMES, isIconName } from "../app/lib/icons";
import { fontAssets } from "../app/lib/theme";
import { DEFAULT_CMS, normalizeCms } from "../server/cms/model";
import { availableActions, holdUntil, icsFor, maskContact, videoOpen } from "../server/lib/appointments";
import { SPECIALTIES, guessSpecialty, slugify } from "../server/lib/catalog";
import { LEGACY_ITERATIONS, b64url, hashPassword, unb64url, verifyPassword } from "../server/lib/crypto";
import { sniffFont } from "../server/lib/media";
import { cardBrand, luhn, sandboxDecision } from "../server/lib/payments";
import { patientShortName } from "../server/lib/practitioners";
import { priceFor } from "../server/lib/pricing";
import { daySlots, validateRules } from "../server/lib/slots";
import { DAY, HOUR, MINUTE, addDays, localDate, parseLocal } from "../server/lib/time";
import { buildPayload, parseInbound, toE164Ecuador } from "../server/lib/whatsapp";
import { decryptJson, encryptJson, maskSecret } from "../server/lib/secrets";
import type { Env } from "../server/env";

const settings = { slot_minutes: 30, buffer_minutes: 0, min_notice_hours: 0, in_person_enabled: 1, virtual_enabled: 1 };
/** Lunes 2 de noviembre de 2026. */
const MONDAY = "2026-11-02";
const at = (hh: number, mm = 0) => parseLocal(`${MONDAY}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`)!;

describe("fechas de Ecuador (UTC−5)", () => {
  it("interpreta fechas locales y rechaza inválidas", () => {
    expect(parseLocal("2026-11-02T09:00")).toBe(Date.UTC(2026, 10, 2, 14, 0));
    expect(parseLocal("2026-11-02", 18)).toBe(Date.UTC(2026, 10, 2, 23, 0));
    expect(parseLocal("2026-02-30")).toBeNull();
    expect(parseLocal("hola")).toBeNull();
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(localDate(Date.UTC(2026, 10, 3, 3, 0))).toBe("2026-11-02");
  });
});

describe("agenda y horarios", () => {
  const rules = [
    { weekday: 1, start_min: 540, end_min: 660, modality: "ambas" as const },
    { weekday: 1, start_min: 900, end_min: 960, modality: "virtual" as const },
  ];
  it("genera horarios por duración y modalidad del bloque", () => {
    const slots = daySlots(MONDAY, rules, settings, [], [], at(0));
    expect(slots.map((s) => new Date(s.start_ms - 5 * HOUR).toISOString().slice(11, 16))).toEqual(["09:00", "09:30", "10:00", "10:30", "15:00", "15:30"]);
    expect(slots[0].modalities).toEqual(["presencial", "virtual"]);
    expect(slots[4].modalities).toEqual(["virtual"]);
    // Sin citas virtuales habilitadas, el bloque solo virtual no ofrece horarios.
    expect(daySlots(MONDAY, rules, { ...settings, virtual_enabled: 0 }, [], [], at(0))).toHaveLength(4);
  });
  it("respeta margen entre citas, citas ocupadas, bloqueos y anticipación mínima", () => {
    expect(daySlots(MONDAY, rules, { ...settings, buffer_minutes: 15 }, [], [], at(0)).filter((s) => s.start_ms < at(12))).toHaveLength(3);
    const busy = [{ start_ms: at(9, 30), end_ms: at(10) }];
    expect(daySlots(MONDAY, rules, settings, busy, [], at(0)).some((s) => s.start_ms === at(9, 30))).toBe(false);
    const block = [{ start_ms: at(15), end_ms: at(16) }];
    expect(daySlots(MONDAY, rules, settings, [], block, at(0)).some((s) => s.start_ms >= at(15))).toBe(false);
    expect(daySlots(MONDAY, rules, { ...settings, min_notice_hours: 2 }, [], [], at(8)).map((s) => s.start_ms)[0]).toBe(at(10));
    expect(daySlots("2026-11-03", rules, settings, [], [], at(0))).toHaveLength(0);
  });
  it("valida el horario semanal", () => {
    expect(validateRules([{ weekday: 7, start_min: 0, end_min: 60 }])).toMatch(/Día/);
    expect(validateRules([{ weekday: 1, start_min: 600, end_min: 600 }])).toMatch(/terminar/);
    expect(validateRules([{ weekday: 2, start_min: 540, end_min: 720, modality: "x" }])).toEqual([
      { weekday: 2, start_min: 540, end_min: 720, modality: "ambas" },
    ]);
  });
});

describe("tarifas y comisiones", () => {
  it("tarifa diferenciada presencial/virtual; comisión solo en pagos en línea", () => {
    const p = { price_in_person_cents: 4500, price_virtual_cents: 3500 };
    expect(priceFor(p, "presencial", false, 800)).toEqual({ price_cents: 4500, fee_cents: 0, net_cents: 4500, fee_bps: 0 });
    expect(priceFor(p, "virtual", true, 800)).toEqual({ price_cents: 3500, fee_cents: 280, net_cents: 3220, fee_bps: 800 });
  });
});

describe("estados de la cita", () => {
  const future = Date.now() + 2 * DAY;
  const base = {
    status: "solicitada" as const,
    start_ms: future,
    end_ms: future + 30 * MINUTE,
    hold_expires_ms: Date.now() + HOUR,
    payment_mode: "consultorio",
    payment_status: "no_requerido" as const,
  };
  it("asigna acciones según rol y pago", () => {
    expect(availableActions(base, "pro", { demo: false, reviewed: false })).toEqual(["confirm", "decline"]);
    expect(availableActions(base, "patient", { demo: false, reviewed: false })).toEqual(["cancel", "reschedule"]);
    // Con pago en línea pendiente, el paciente paga y el profesional aún no puede confirmar.
    const unpaid = { ...base, payment_mode: "en_linea", payment_status: "pendiente" as const };
    expect(availableActions(unpaid, "patient", { demo: false, reviewed: false })).toContain("pay");
    expect(availableActions(unpaid, "pro", { demo: false, reviewed: false })).not.toContain("confirm");
    // En perfiles de muestra el paciente puede simular al profesional.
    expect(availableActions(base, "patient", { demo: true, reviewed: false })).toContain("confirm");
    expect(availableActions({ ...base, hold_expires_ms: Date.now() - 1 }, "pro", { demo: false, reviewed: false })).toEqual([]);
    const done = { ...base, status: "completada" as const };
    expect(availableActions(done, "patient", { demo: false, reviewed: false })).toEqual(["review"]);
    expect(availableActions(done, "pro", { demo: false, reviewed: false })).toEqual(["mark_paid"]);
  });
  it("retención de la solicitud y ventana de la videollamada", () => {
    const now = Date.now();
    expect(holdUntil(now, now + 10 * DAY)).toBe(now + 24 * HOUR);
    expect(holdUntil(now, now + 3 * HOUR)).toBe(now + 2 * HOUR);
    const v = { status: "confirmada", modality: "virtual", start_ms: now + 10 * MINUTE, end_ms: now + 40 * MINUTE };
    expect(videoOpen(v, now)).toBe(true);
    expect(videoOpen({ ...v, start_ms: now + HOUR }, now)).toBe(false);
    expect(videoOpen({ ...v, modality: "presencial" }, now)).toBe(false);
  });
  it("genera un archivo de calendario válido", () => {
    const ics = icsFor({
      id: 7,
      start_ms: Date.UTC(2026, 10, 2, 14),
      end_ms: Date.UTC(2026, 10, 2, 14, 30),
      modality: "virtual",
      title: "Cita, con; Dra.",
      location: "Video",
      url: "https://x/citas/7",
    });
    expect(ics).toContain("DTSTART:20261102T140000Z");
    expect(ics).toContain("SUMMARY:Cita\\, con\\; Dra.");
  });
});

describe("privacidad", () => {
  it("oculta teléfonos, correos y enlaces de WhatsApp en el chat", () => {
    const r = maskContact("Escríbeme al 0991234567 o a ana@mail.com, wa.me/593991234567");
    expect(r.masked).toBe(true);
    expect(r.text).not.toMatch(/099|@mail|wa\.me/);
    expect(maskContact("Llego 10 minutos antes").masked).toBe(false);
  });
  it("muestra al profesional solo nombre e inicial del paciente", () => {
    expect(patientShortName("María Fernanda López")).toBe("María F.");
    expect(patientShortName("")).toBe("Paciente");
  });
});

describe("buscaDR Pay (sandbox)", () => {
  it("valida tarjetas de prueba sin guardar el número", () => {
    expect(luhn("4111 1111 1111 1111")).toBe(true);
    expect(luhn("4111 1111 1111 1112")).toBe(false);
    expect(cardBrand("5555555555554444")).toBe("Mastercard");
    const ok = sandboxDecision({ number: "4111111111111111", exp: "12/30", cvv: "123", name: "Ana" }, new Date("2026-11-01"));
    expect(ok).toMatchObject({ ok: true, brand: "Visa", last4: "1111" });
    expect(sandboxDecision({ number: "4000000000000002", exp: "12/30", cvv: "123", name: "Ana" }, new Date("2026-11-01"))).toMatchObject({
      ok: false,
      declined: true,
    });
    expect(sandboxDecision({ number: "4111111111111111", exp: "01/20", cvv: "123", name: "Ana" }, new Date("2026-11-01")).ok).toBe(false);
  });
});

describe("contraseñas", () => {
  it("verifica el formato actual y el heredado", async () => {
    const stored = await hashPassword("una-clave-larga");
    expect((await verifyPassword("una-clave-larga", stored)).ok).toBe(true);
    expect((await verifyPassword("otra", stored)).ok).toBe(false);
    const salt = b64url(crypto.getRandomValues(new Uint8Array(16)));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("clave-heredada"), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: unb64url(salt), iterations: LEGACY_ITERATIONS, hash: "SHA-256" }, key, 256);
    expect(await verifyPassword("clave-heredada", b64url(new Uint8Array(bits)), salt)).toEqual({ ok: true, legacy: true });
  });
});

describe("catálogo y WhatsApp", () => {
  it("sugiere especialidad desde texto libre y crea slugs", () => {
    expect(guessSpecialty("necesito un dentista")).toBe("odontologia");
    expect(guessSpecialty("pediatra para mi bebé")).toBe("pediatria");
    expect(guessSpecialty("xyz")).toBeNull();
    // Taxonomía completa: términos cotidianos llevan a la especialidad correcta.
    expect(guessSpecialty("me duelen las rodillas, creo que es fractura")).toBe("traumatologia");
    expect(guessSpecialty("necesito brackets")).toBe("ortodoncia");
    expect(guessSpecialty("examenes de sangre")).toBe("laboratorio");
    expect(guessSpecialty("varices en las piernas")).toBe("cirugia-vascular");
    expect(slugify("Dra. Ana Torres")).toBe("dra-ana-torres");
  });
  it("normaliza números y arma mensajes con botones", () => {
    expect(toE164Ecuador("099 123 4567")).toBe("593991234567");
    expect(toE164Ecuador("12345")).toBeNull();
    const buttons = buildPayload("593991234567", { kind: "buttons", body: "¿Confirmas?", buttons: [{ id: "acc:1", title: "Confirmar" }] }) as any;
    expect(buttons.interactive.action.buttons[0].reply.id).toBe("acc:1");
    const inbound = parseInbound({
      entry: [{ changes: [{ value: { messages: [{ id: "w1", from: "593991234567", type: "button", button: { payload: "acc:9" } }] } }] }],
    });
    expect(inbound[0].buttonId).toBe("acc:9");
  });
});

describe("CMS", () => {
  it("sanea el documento y conserva la paleta del Brand Deck", () => {
    const c = normalizeCms({
      theme: { primary: "javascript:alert(1)", logo: "https://evil.com/../x" },
      hero: { title: "<b>Hola</b>" },
      layout: { columns: 9 },
      copy: { emergencyNotice: "" },
    });
    expect(c.theme.primary).toBe("#0F62FE");
    expect(c.theme.secondary).toBe("#10B981");
    expect(c.theme.logo).toBe("/assets/buscadr-logo.png");
    expect(c.layout.columns).toBe(4);
    expect(c.trust.showDemoBadges).toBe(true);
    expect(c.copy.emergencyNotice).toMatch(/911/);
  });
  it("todos los íconos por defecto existen en el catálogo Font Awesome", () => {
    const c = normalizeCms(structuredClone(DEFAULT_CMS));
    const used = [
      ...c.specialties.map((x) => x.icon),
      ...SPECIALTIES.map((s) => s.icon),
      ...Object.values(c.navigation.icons),
      ...c.home.steps.map((x) => x.icon),
      ...c.home.promises.map((x) => x.icon),
      ...c.home.features.map((x) => x.icon),
    ];
    for (const name of used) expect(isIconName(name), name).toBe(true);
    for (const name of Object.values(ICON_ALIASES)) expect(isIconName(name), name).toBe(true);
    expect(ICON_NAMES.length).toBeGreaterThan(250);
  });
  it("valida íconos (catálogo, librería del CMS o imagen) y tonos", () => {
    const c = normalizeCms({
      theme: { iconLibrary: { "user-injured": [448, 512, "M0 0L10 10Z"], hack: [10, 10, "M0 0 <script>"] } },
      specialties: [
        { slug: "pediatria", icon: "baby-carriage", tone: "azul" },
        { slug: "dermatologia", icon: "<svg onload=alert(1)>", tone: "rojo" },
        { slug: "traumatologia", icon: "user-injured" },
        { slug: "odontologia", icon: "/api/media/0b9f0d1e-1111-4222-8333-444455556666.png" },
      ],
      navigation: { icons: { inicio: "regular:house", citas: "javascript:alert(1)" } },
    });
    const sp = (slug: string) => c.specialties.find((x) => x.slug === slug)!;
    expect(sp("pediatria")).toMatchObject({ icon: "baby-carriage", tone: "azul" });
    expect(sp("dermatologia")).toMatchObject({ icon: "hand-dots", tone: "verde" });
    expect(sp("traumatologia").icon).toBe("user-injured");
    expect(sp("odontologia").icon).toMatch(/^\/api\/media\//);
    expect(c.theme.iconLibrary).not.toHaveProperty("hack");
    expect(c.navigation.icons.citas).toBe("regular:calendar-check");
  });
  it("acepta Google Fonts (enlazadas o alojadas) y fuentes subidas; rechaza inyección de CSS", () => {
    const c = normalizeCms({
      theme: {
        font: "Plus Jakarta Sans",
        bodyFont: "Marca Sans",
        fonts: [
          { family: "Plus Jakarta Sans", source: "google", weights: "400;700" },
          { family: "Marca Sans", source: "upload", files: [{ url: "/api/media/0b9f0d1e-1111-4222-8333-444455556666.woff2", weight: 700, style: "italic" }] },
          { family: "Sora", source: "google", files: [{ url: "/api/media/0b9f0d1e-1111-4222-8333-444455556667.woff2", weight: 400 }] },
          { family: 'Evil"};body{display:none', source: "google" },
          { family: "Otra", source: "upload", files: [{ url: "https://evil.example/x.woff2" }] },
          { family: "Inter", source: "google" },
        ],
      },
    });
    expect(c.theme.fonts.map((f) => f.family)).toEqual(["Plus Jakarta Sans", "Marca Sans", "Sora"]);
    const fallback = normalizeCms({ theme: { font: "Comic Sans", bodyFont: "Poppins" } });
    expect([fallback.theme.font, fallback.theme.bodyFont]).toEqual(["Manrope", "Inter"]);
    const assets = fontAssets(c);
    expect(assets.links[0]).toBe("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700&display=swap");
    expect(assets.css).toContain('font-family:"Marca Sans"');
    expect(assets.css).toContain("font-style:italic");
  });
  it("reconoce la firma real de las fuentes", () => {
    const head = (s: string) => new Uint8Array([...s].map((ch) => ch.charCodeAt(0)));
    expect(sniffFont(head("wOF2xxxx"), "woff2")).toBe(true);
    expect(sniffFont(new Uint8Array([0, 1, 0, 0, 9]), "ttf")).toBe(true);
    expect(sniffFont(head("<svg>"), "woff2")).toBe(false);
  });
});

describe("credenciales cifradas de pasarelas", () => {
  const env = { BUSCADR_SECRETS_KEY: "clave-de-prueba-para-cifrar-credenciales-0123456789" } as unknown as Env;
  it("cifra con AES-GCM, descifra y rechaza textos alterados o sin clave", async () => {
    const enc = await encryptJson(env, { token: "secreto-1234" });
    expect(enc).toMatch(/^v1:/);
    expect(enc).not.toContain("secreto");
    expect(await decryptJson(env, enc)).toEqual({ token: "secreto-1234" });
    // Dos cifrados del mismo valor son distintos (IV aleatorio).
    expect(await encryptJson(env, { token: "secreto-1234" })).not.toBe(enc);
    const tampered = `${enc.slice(0, -4)}AAAA`;
    expect(await decryptJson(env, tampered)).toEqual({});
    expect(await decryptJson({ ...env, BUSCADR_SECRETS_KEY: "otra-clave-distinta-de-32-caracteres-xx" } as Env, enc)).toEqual({});
    expect(await decryptJson({} as Env, enc)).toEqual({});
    await expect(encryptJson({} as Env, { token: "x" })).rejects.toThrow();
    expect(maskSecret("abcdef1234")).toBe("••••1234");
  });
});

describe("taxonomía en el CMS", () => {
  it("una configuración anterior adopta una vez la visibilidad nueva y conserva nombres editados", () => {
    const legacy = structuredClone(DEFAULT_CMS) as any;
    delete legacy.taxonomyVersion;
    legacy.specialties = legacy.specialties.map((s: any) => (s.slug === "psiquiatria" ? { ...s, visible: false, name: "Psiquiatría adultos" } : s));
    const migrated = normalizeCms(legacy);
    const psy = migrated.specialties.find((s) => s.slug === "psiquiatria")!;
    expect(psy.visible).toBe(true);
    expect(psy.name).toBe("Psiquiatría adultos");
    // Ya en la v2, ocultar una especialidad se respeta.
    const again = normalizeCms({ ...migrated, specialties: migrated.specialties.map((s) => (s.slug === "psiquiatria" ? { ...s, visible: false } : s)) });
    expect(again.specialties.find((s) => s.slug === "psiquiatria")!.visible).toBe(false);
    expect(SPECIALTIES.length).toBeGreaterThanOrEqual(80);
  });
});
