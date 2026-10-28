/**
 * CMS · Pasarelas de pago (ADR 0013): como «WooCommerce → Ajustes → Pagos». Lista ordenable de
 * medios con interruptor, «Gestionar» para título, descripción, datos y credenciales (se envían una
 * sola vez y vuelven enmascaradas), y las pasarelas que llegarán después.
 */
import { useCallback, useEffect, useState } from "react";
import { type ApiError, api } from "../../lib/api";
import { pct } from "../../lib/format";
import { Icon } from "../Icon";
import { Notice, Spinner } from "../ui";
import { Section } from "./fields";

type Field = { key: string; label: string; hint?: string; options?: string[]; multiline?: boolean; max: number; required?: boolean };
type SecretInfo = { key: string; label: string; hint: string; env: string; source: "cms" | "cloudflare" | ""; preview: string };
type Gateway = {
  id: string;
  name: string;
  kind: "online" | "manual" | "offline";
  live: boolean;
  logo: string;
  enabled: boolean;
  active: boolean;
  sort: number;
  title: string;
  description: string;
  default_title: string;
  default_description: string;
  settings: Record<string, string>;
  fields: Field[];
  missing: string[];
  updated_at: string | null;
  secrets: SecretInfo[];
};
type Data = { gateways: Gateway[]; coming_soon: { id: string; name: string; note: string }[]; secrets_key: boolean; fee_bps: number };

const KIND: Record<Gateway["kind"], string> = { online: "En línea al reservar", manual: "En línea · confirmación manual", offline: "Fuera de buscaDR" };

function GatewayForm({
  g,
  secretsKey,
  onSaved,
  notify,
}: {
  g: Gateway;
  secretsKey: boolean;
  onSaved: (d: Data) => void;
  notify: (t: string, tone?: "ok" | "error") => void;
}) {
  const [title, setTitle] = useState(g.title === g.default_title ? "" : g.title);
  const [description, setDescription] = useState(g.description === g.default_description ? "" : g.description);
  const [settings, setSettings] = useState<Record<string, string>>(g.settings);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function save(extra: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { title, description, settings, ...extra };
      const filled = Object.fromEntries(Object.entries(secrets).filter(([, v]) => v.trim()));
      if (Object.keys(filled).length) body.secrets = filled;
      const d = await api<Data & { message: string }>(`/api/cms/payments/${g.id}`, { method: "PUT", body });
      setSecrets({});
      onSaved(d);
      notify(d.message);
    } catch (e) {
      notify((e as ApiError).message, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="mt-3 grid gap-3 border-t border-tinta/5 pt-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label className="field">
        Título para el paciente
        <input className="input" maxLength={80} value={title} placeholder={g.default_title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        Descripción
        <input className="input" maxLength={300} value={description} placeholder={g.default_description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {g.fields.map((f) => (
        <div key={f.key} className={`field ${f.multiline ? "sm:col-span-2" : ""}`}>
          <label htmlFor={`gw-${g.id}-${f.key}`}>
            {f.label}
            {f.required && <span className="text-alerta-ink"> *</span>}
          </label>
          {f.options ? (
            <select
              id={`gw-${g.id}-${f.key}`}
              className="input"
              value={settings[f.key] ?? ""}
              onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })}
            >
              <option value="">Elige…</option>
              {f.options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : f.multiline ? (
            <textarea
              id={`gw-${g.id}-${f.key}`}
              className="input min-h-24 py-2"
              maxLength={f.max}
              value={settings[f.key] ?? ""}
              onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })}
            />
          ) : (
            <input
              id={`gw-${g.id}-${f.key}`}
              className="input"
              maxLength={f.max}
              value={settings[f.key] ?? ""}
              onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })}
            />
          )}
        </div>
      ))}
      {g.secrets.length > 0 && (
        <fieldset className="grid gap-3 rounded-xl bg-fondo p-3 sm:col-span-2 sm:grid-cols-2">
          <legend className="px-1 text-sm font-semibold">Credenciales</legend>
          {!secretsKey && (
            <div className="sm:col-span-2">
              <Notice tone="warning" title="Falta la clave de cifrado">
                Para guardar credenciales desde aquí, crea en Cloudflare el secreto <code>BUSCADR_SECRETS_KEY</code> (32+ caracteres). También puedes definirlas
                directamente como secretos de Cloudflare: {g.secrets.map((s) => s.env).join(" y ")}.
              </Notice>
            </div>
          )}
          {g.secrets.map((s) => (
            <div key={s.key} className="field">
              <label htmlFor={`secret-${g.id}-${s.key}`}>{s.label}</label>
              <input
                id={`secret-${g.id}-${s.key}`}
                type="password"
                autoComplete="off"
                className="input"
                disabled={!secretsKey}
                value={secrets[s.key] ?? ""}
                placeholder={s.preview ? `Configurada ${s.preview}` : "Sin configurar"}
                onChange={(e) => setSecrets({ ...secrets, [s.key]: e.target.value })}
              />
              <span className="text-xs font-normal muted">
                {s.source === "cms" ? "Guardada cifrada en buscaDR." : s.source === "cloudflare" ? `Tomada del secreto ${s.env} de Cloudflare.` : s.hint}
                {s.source === "cms" && (
                  <button type="button" className="ml-2 font-semibold text-alerta-ink underline" onClick={() => save({ secrets: { [s.key]: null } })}>
                    Borrar
                  </button>
                )}
              </span>
            </div>
          ))}
        </fieldset>
      )}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" className="btn-primary btn-sm" disabled={busy}>
          {busy ? <Spinner label="Guardando" /> : <Icon name="check" className="size-4" />} Guardar cambios
        </button>
        <span className="text-xs muted">Los cambios de pagos se aplican al instante (no pasan por «Publicar»).</span>
      </div>
    </form>
  );
}

export function Pagos({ notify }: { notify: (t: string, tone?: "ok" | "error") => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(
    () =>
      api<Data>("/api/cms/payments")
        .then(setData)
        .catch((e) => notify((e as Error).message, "error")),
    [notify],
  );
  useEffect(() => {
    load();
  }, [load]);

  async function toggle(g: Gateway) {
    const enabled = !g.enabled;
    let confirmLive = false;
    if (enabled && g.live) {
      if (!confirm(`${g.name} cobra dinero real a los pacientes. ¿buscaDR ya aprobó el Go/No-Go del Documento Maestro para cobrar?`)) return;
      confirmLive = true;
    }
    setBusy(g.id);
    try {
      const d = await api<Data & { message: string }>(`/api/cms/payments/${g.id}`, { method: "PUT", body: { enabled, confirm_live: confirmLive } });
      setData(d);
      notify(enabled ? `${g.name} activado.` : `${g.name} desactivado.`);
    } catch (e) {
      notify((e as ApiError).message, "error");
      if ((e as ApiError).code === "GATEWAY_INCOMPLETE") setOpen(g.id);
    } finally {
      setBusy(null);
    }
  }
  async function move(i: number, d: -1 | 1) {
    if (!data) return;
    const ids = data.gateways.map((g) => g.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    try {
      setData(await api<Data>("/api/cms/payments/order", { body: { ids } }));
    } catch (e) {
      notify((e as Error).message, "error");
    }
  }

  if (!data) return <Spinner />;
  const online = data.gateways.filter((g) => g.active && g.kind !== "offline");
  return (
    <div className="space-y-5">
      <Section
        title="Pasarelas de pago"
        description="Activa, ordena y configura los medios con los que pagan los pacientes (citas en línea) y los profesionales (planes). El primero activo es el predeterminado en el checkout."
      >
        {!online.length && (
          <div className="mb-4">
            <Notice tone="warning" title="Sin medios de pago en línea">
              Las citas se pagarán en el consultorio y los profesionales no podrán pagar planes hasta activar al menos un medio en línea.
            </Notice>
          </div>
        )}
        {online.some((g) => g.live) ? (
          <div className="mb-4">
            <Notice tone="info" title="Cobros reales activos">
              Hay medios que mueven dinero real. Cada transacción queda en el libro de pagos (Administración → Transacciones).
            </Notice>
          </div>
        ) : (
          <div className="mb-4">
            <Notice tone="info" title="Modo de prueba">
              Solo está activo el pago de prueba: no se cobra dinero real. Activa Payphone o la transferencia bancaria tras el Go/No-Go.
            </Notice>
          </div>
        )}
        <ul className="divide-y divide-tinta/5 rounded-xl ring-1 ring-tinta/10">
          {data.gateways.map((g, i) => (
            <li key={g.id} className="p-3 sm:p-4">
              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                <span className={`grid size-11 place-items-center rounded-xl ${g.active ? "tone-azul" : "bg-gris-claro text-tinta"}`}>
                  <Icon name={g.logo} className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    <span className="break-words">{g.name}</span>
                    {g.active ? (
                      <span className="chip tone-verde px-2 py-0.5 text-xs">Activo</span>
                    ) : g.enabled ? (
                      <span className="chip bg-amarillo/20 px-2 py-0.5 text-xs">Incompleto</span>
                    ) : (
                      <span className="chip bg-gris-claro px-2 py-0.5 text-xs">Desactivado</span>
                    )}
                    {g.live && <span className="chip bg-alerta/10 px-2 py-0.5 text-xs text-alerta-ink">Dinero real</span>}
                  </p>
                  <p className="text-xs muted">
                    {KIND[g.kind]} · el paciente ve: «{g.title}»
                  </p>
                  {g.missing.length > 0 && <p className="text-xs text-alerta-ink">Falta: {g.missing.join(", ")}</p>}
                </div>
                <div className="col-span-2 flex flex-wrap items-center gap-1 sm:col-span-1">
                  <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Subir ${g.name}`}>
                    <Icon name="chevron-up" className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={i === data.gateways.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label={`Bajar ${g.name}`}
                  >
                    <Icon name="chevron-down" className="size-4" />
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={g.enabled}
                    aria-label={`${g.name}: ${g.enabled ? "activado" : "desactivado"}`}
                    disabled={busy === g.id}
                    onClick={() => toggle(g)}
                    className={`chip min-h-10 text-xs font-semibold ${g.enabled ? "bg-azul text-white" : "bg-gris-claro text-tinta"}`}
                  >
                    {busy === g.id ? <Spinner label="Guardando" /> : g.enabled ? "Activado" : "Desactivado"}
                  </button>
                  <button type="button" className="btn-outline btn-sm" aria-expanded={open === g.id} onClick={() => setOpen(open === g.id ? null : g.id)}>
                    {open === g.id ? "Cerrar" : "Gestionar"}
                  </button>
                </div>
              </div>
              {open === g.id && <GatewayForm g={g} secretsKey={data.secrets_key} onSaved={setData} notify={notify} />}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs muted">
          Comisión de buscaDR en citas cobradas por buscaDR (en línea o transferencia): {pct(data.fee_bps)} (variable <code>BUSCADR_FEE_BPS</code>). El pago en
          el consultorio no tiene comisión.
        </p>
      </Section>
      <Section title="Próximamente" description="Pasarelas que se pueden integrar a buscaDR Pay. Aún no tienen adaptador: no se pueden activar.">
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.coming_soon.map((c) => (
            <li key={c.id} className="flex gap-3 rounded-xl bg-fondo p-3 ring-1 ring-tinta/5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-tinta ring-1 ring-tinta/10">
                <Icon name="card" className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{c.name}</span>
                <span className="block text-xs muted">{c.note}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
