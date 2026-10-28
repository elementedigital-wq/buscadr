/** Perfil profesional, tarifas presencial/virtual, cobro en línea y envío a verificación. */
import { useRef, useState } from "react";
import { Link, useRevalidator, useRouteLoaderData, useSearchParams } from "react-router";
import { Icon } from "../../components/Icon";
import { Avatar, Notice, Spinner } from "../../components/ui";
import { type ApiError, api } from "../../lib/api";
import { money } from "../../lib/format";
import { prepareImage } from "../../lib/image";
import type { ProMe } from "../../lib/pro";
import { useRootData } from "../../root";

const cents = (v: FormDataEntryValue | null) => Math.round(Number(String(v ?? "0").replace(",", ".")) * 100) || 0;

export default function Perfil() {
  const root = useRootData();
  const data = useRouteLoaderData("routes/panel/_layout") as ProMe;
  const p = data.practitioner!;
  const revalidator = useRevalidator();
  const [params] = useSearchParams();
  const [msg, setMsg] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(
    params.get("nuevo") ? { tone: "info", text: "¡Perfil creado! Completa estos datos y envíalo a verificación." } : null,
  );
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [virtual, setVirtual] = useState(p.virtual);
  const [inPerson, setInPerson] = useState(p.in_person);
  const fee = (root?.catalog.fee_bps ?? 800) / 100;
  const file = useRef<HTMLInputElement>(null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ message: string }>("/api/pro/me", {
        method: "PATCH",
        body: {
          kind: f.get("kind"),
          title: f.get("title"),
          display_name: f.get("display_name"),
          specialty: f.get("specialty"),
          subspecialty: f.get("subspecialty"),
          headline: f.get("headline"),
          bio: f.get("bio"),
          years_experience: Number(f.get("years_experience") || 0),
          languages: f.get("languages"),
          services: String(f.get("services") ?? "")
            .split(/[,\n]/)
            .map((s) => s.trim())
            .filter(Boolean),
          insurances: f.get("insurances"),
          license_number: f.get("license_number"),
          city: f.get("city"),
          sector: f.get("sector"),
          address: f.get("address"),
          in_person_enabled: inPerson,
          virtual_enabled: virtual,
          price_in_person_cents: cents(f.get("price_in_person")),
          price_virtual_cents: cents(f.get("price_virtual")),
          prepay_virtual: f.get("prepay_virtual") === "on",
          prepay_in_person: f.get("prepay_in_person") === "on",
          phone: f.get("phone"),
          whatsapp_opt_in: f.get("whatsapp_opt_in") === "on",
        },
      });
      setMsg({ tone: "success", text: r.message });
      revalidator.revalidate();
    } catch (err) {
      setMsg({ tone: "danger", text: (err as ApiError).message });
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    setMsg(null);
    try {
      const r = await api<{ message: string }>("/api/pro/me/submit", { method: "POST", body: {} });
      setMsg({ tone: "success", text: r.message });
      revalidator.revalidate();
    } catch (err) {
      setMsg({ tone: "danger", text: (err as ApiError).message });
    }
  }
  async function pause() {
    await api("/api/pro/me/pause", { method: "POST", body: {} }).catch(() => {});
    revalidator.revalidate();
  }
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoBusy(true);
    try {
      const img = await prepareImage(f, 800);
      await api("/api/pro/me/photo", { raw: img.blob });
      revalidator.revalidate();
    } catch (err) {
      setMsg({ tone: "danger", text: (err as ApiError).message || "No se pudo subir la foto" });
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="label-eyebrow">Mi consultorio</p>
          <h1 className="text-3xl font-extrabold">Perfil y tarifas</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/doctor/${p.slug}`} className="btn-outline btn-sm">
            <Icon name="eye" className="size-4" /> Vista previa
          </Link>
          {["draft", "rejected", "paused"].includes(p.status) && (
            <button type="button" className="btn-accent btn-sm" onClick={submit}>
              <Icon name="shield" className="size-4" /> {p.status === "paused" ? "Volver a publicar" : "Enviar a verificación"}
            </button>
          )}
          {p.status === "active" && (
            <button type="button" className="btn-ghost btn-sm" onClick={pause}>
              Pausar perfil
            </button>
          )}
        </div>
      </header>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <section className="card grid gap-4 p-5 sm:grid-cols-2" aria-labelledby="identidad">
        <h2 id="identidad" className="text-lg font-extrabold sm:col-span-2">
          Identidad profesional
        </h2>
        <div className="flex items-center gap-4 sm:col-span-2">
          <Avatar name={p.name} photo={p.photo} size={88} rounded="xl" />
          <div className="min-w-0">
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={upload} id="foto" />
            <label htmlFor="foto" className="btn-outline btn-sm cursor-pointer">
              {photoBusy ? <Spinner /> : <Icon name="photo" className="size-4" />} Cambiar foto
            </label>
            <p className="mt-1 text-xs muted">Foto profesional, de frente y con buena luz. Se comprime en tu navegador.</p>
          </div>
        </div>
        <label className="field">
          Tipo de perfil
          <select name="kind" className="input" defaultValue={p.kind}>
            <option value="medico">Médico/a</option>
            <option value="especialista">Especialista</option>
            <option value="clinica">Clínica o centro médico</option>
            <option value="servicio">Servicio médico</option>
          </select>
        </label>
        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
          <label className="field">
            Título
            <select name="title" className="input" defaultValue={p.title}>
              {["", "Dr.", "Dra.", "Lic.", "Psic.", "Od.", "Nut.", "Ft."].map((t) => (
                <option key={t} value={t}>
                  {t || "—"}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Nombre público
            <input name="display_name" className="input" defaultValue={p.display_name} required minLength={3} maxLength={80} />
          </label>
        </div>
        <label className="field">
          Especialidad
          <select name="specialty" className="input" defaultValue={p.specialty}>
            {root?.catalog.specialties.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Subespecialidad o enfoque
          <input name="subspecialty" className="input" defaultValue={p.subspecialty} maxLength={80} placeholder="Ej.: dermatología pediátrica" />
        </label>
        <label className="field sm:col-span-2">
          Frase corta (aparece en tu tarjeta)
          <input name="headline" className="input" defaultValue={p.headline} maxLength={120} placeholder="Ej.: Pediatra · control de niño sano y vacunas" />
        </label>
        <label className="field sm:col-span-2">
          Sobre ti
          <textarea
            name="bio"
            className="input min-h-32 py-2"
            defaultValue={p.bio}
            maxLength={1500}
            placeholder="Experiencia, enfoque de atención, formación. Sin promesas de resultados."
          />
        </label>
        <label className="field">
          Años de experiencia
          <input name="years_experience" type="number" min={0} max={70} className="input" defaultValue={p.years_experience} />
        </label>
        <label className="field">
          Idiomas
          <input name="languages" className="input" defaultValue={p.languages} maxLength={80} />
        </label>
        <label className="field sm:col-span-2">
          Servicios (separados por comas)
          <input name="services" className="input" defaultValue={p.services.join(", ")} placeholder="Consulta general, control prenatal, certificado médico" />
        </label>
        <label className="field">
          Seguros y convenios (opcional)
          <input name="insurances" className="input" defaultValue={p.insurances} maxLength={200} />
        </label>
        <label className="field">
          Registro profesional (ACESS / SENESCYT)
          <input name="license_number" className="input" defaultValue={p.license_number} maxLength={40} placeholder="Número de registro" />
          <span className="text-xs font-normal muted">
            Lo verificamos a mano con fuentes oficiales. En tu perfil solo se muestran los últimos 4 caracteres.
          </span>
        </label>
      </section>

      <section className="card grid gap-4 p-5 sm:grid-cols-2" aria-labelledby="consultorio">
        <h2 id="consultorio" className="text-lg font-extrabold sm:col-span-2">
          Consultorio
        </h2>
        <label className="field">
          Ciudad
          <select name="city" className="input" defaultValue={p.city}>
            {root?.catalog.cities.map((c) => (
              <option key={c.slug}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Sector
          <input name="sector" className="input" defaultValue={p.sector} maxLength={60} placeholder="Ej.: Kennedy" />
        </label>
        <label className="field sm:col-span-2">
          Dirección exacta (solo la ven pacientes con cita confirmada)
          <input name="address" className="input" defaultValue={p.address} maxLength={200} placeholder="Av., número, edificio, consultorio" />
        </label>
      </section>

      <section className="card grid gap-4 p-5 sm:grid-cols-2" aria-labelledby="tarifas">
        <div className="sm:col-span-2">
          <h2 id="tarifas" className="text-lg font-extrabold">
            Modalidades y tarifas
          </h2>
          <p className="text-sm muted">
            Puedes cobrar distinto la cita presencial y la virtual. buscaDR cobra {fee} % solo en citas pagadas en línea; el pago en consultorio no tiene
            comisión.
          </p>
        </div>
        {[
          [
            "presencial",
            "Cita presencial",
            "clinic",
            inPerson,
            setInPerson,
            "price_in_person",
            p.price_in_person_cents,
            "prepay_in_person",
            p.prepay_in_person,
            "Cobrar en línea al reservar",
          ],
          [
            "virtual",
            "Cita virtual (videollamada)",
            "video",
            virtual,
            setVirtual,
            "price_virtual",
            p.price_virtual_cents,
            "prepay_virtual",
            p.prepay_virtual,
            "Cobrar en línea al reservar (recomendado)",
          ],
        ].map(([key, label, icon, on, setOn, priceName, price, prepayName, prepay, prepayLabel]) => (
          <fieldset key={key as string} className={`grid gap-3 rounded-2xl p-4 ring-1 ${on ? "bg-white ring-azul/30" : "bg-fondo ring-tinta/5"}`}>
            <legend className="sr-only">{label as string}</legend>
            <label className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 font-semibold">
                <Icon name={icon as string} className="size-4 text-azul" /> {label as string}
              </span>
              <input
                type="checkbox"
                className="size-5 accent-[var(--color-azul)]"
                checked={on as boolean}
                onChange={(e) => (setOn as (v: boolean) => void)(e.target.checked)}
              />
            </label>
            <label className="field">
              Tarifa (USD)
              <span className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 muted">$</span>
                <input
                  name={priceName as string}
                  type="number"
                  min={0}
                  max={1000}
                  step="0.5"
                  className="input pl-7"
                  defaultValue={(price as number) ? ((price as number) / 100).toFixed(2) : ""}
                  disabled={!on}
                />
              </span>
              {(price as number) > 0 && (
                <span className="text-xs font-normal muted">
                  Recibes {money(Math.round((price as number) * (1 - fee / 100)))} si el paciente paga en línea.
                </span>
              )}
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name={prepayName as string}
                defaultChecked={prepay as boolean}
                disabled={!on}
                className="mt-0.5 size-4 accent-[var(--color-azul)]"
              />
              <span>{prepayLabel as string}</span>
            </label>
          </fieldset>
        ))}
      </section>

      <section className="card grid gap-4 p-5 sm:grid-cols-2" aria-labelledby="whatsapp-t" id="whatsapp">
        <div className="sm:col-span-2">
          <h2 id="whatsapp-t" className="flex items-center gap-2 text-lg font-extrabold">
            <Icon name="whatsapp" className="size-5 text-[#15803d]" /> Avisos por WhatsApp
          </h2>
          <p className="text-sm muted">
            Recibe cada solicitud con botones «Confirmar / Rechazar» desde el WhatsApp Business de buscaDR. Tu número no se muestra a los pacientes.
          </p>
        </div>
        <label className="field">
          Celular (Ecuador)
          <input name="phone" className="input" inputMode="tel" defaultValue={root?.user?.phone} placeholder="0991234567" />
        </label>
        <label className="flex items-start gap-3 self-end rounded-2xl bg-fondo p-3 text-sm">
          <input type="checkbox" name="whatsapp_opt_in" defaultChecked={root?.user?.whatsapp_opt_in} className="mt-0.5 size-4 accent-[var(--color-azul)]" />
          <span>Acepto recibir avisos de citas por WhatsApp. Puedo desactivarlo cuando quiera.</span>
        </label>
      </section>

      <div className="sticky bottom-24 z-10 flex justify-end lg:bottom-4">
        <button type="submit" className="btn-primary shadow-[var(--shadow-float)]" disabled={busy}>
          {busy ? <Spinner /> : <Icon name="check" className="size-4" />} Guardar cambios
        </button>
      </div>
    </form>
  );
}
