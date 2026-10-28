import { useCallback, useEffect, useState } from "react";
import { Link, redirect } from "react-router";
import { Icon } from "../components/Icon";
import { Notice, PageHeader, Spinner, StatusBadge } from "../components/ui";
import { api } from "../lib/api";
import { serverApiSafe } from "../lib/api.server";
import { dateTime, money } from "../lib/format";
import type { SessionUser } from "../lib/types";
import type { Route } from "./+types/admin";

export const meta: Route.MetaFunction = () => [{ title: "Administración · buscaDR" }, { name: "robots", content: "noindex, nofollow" }];

type Kpis = {
  northStar: { month: string; city: string; n: number }[];
  completed: number;
  gmv_cents: number;
  revenue_cents: number;
  contribution_estimate_cents: number;
  take_rate: number | null;
  byStatus: { status: string; label: string; n: number }[];
  acceptance: { rate: number | null; avg_minutes: number | null };
  listings: { status: string; n: number }[];
  activeOwners: number;
  users: { total: number; last30: number; whatsapp: number };
  incidents: { open: number; total: number };
  demand: { query: string; category_name: string; city: string; n: number; contact: number }[];
  whatsapp: { status: string; n: number }[];
  funnel: { views: number; requests: number; conversion: number | null };
  byCategory: { category: string; name: string; n: number }[];
  notes: string;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const me = await serverApiSafe<{ user: SessionUser | null }>(context, request, "/api/auth/me", { user: null });
  if (!me.user) throw redirect("/cuenta?next=/admin");
  if (!me.user.admin) throw new Response("No tienes acceso", { status: 403 });
  const kpis = await serverApiSafe<Kpis | null>(context, request, "/api/admin/kpis", null);
  return { kpis };
}

const TABS = [
  ["kpis", "KPIs"],
  ["moderacion", "Moderación"],
  ["incidencias", "Incidencias"],
  ["reservas", "Reservas"],
] as const;

export default function Admin({ loaderData }: Route.ComponentProps) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("kpis");
  return (
    <div className="container-page">
      <PageHeader eyebrow="Operación del piloto" title="Administración">
        Indicadores del Documento Maestro, moderación de anuncios y mediación de incidencias.{" "}
        <a href="/maestro" className="font-semibold text-morado underline">
          Abrir CMS Maestro
        </a>
      </PageHeader>
      <div role="tablist" className="mb-6 flex flex-wrap gap-1 rounded-full bg-white p-1 ring-1 ring-black/10 sm:inline-flex">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ${tab === key ? "bg-morado text-white" : "hover:bg-black/5"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "kpis" && (loaderData.kpis ? <KpiView k={loaderData.kpis} /> : <Notice tone="danger">No se pudieron cargar los KPIs.</Notice>)}
      {tab === "moderacion" && <Moderation />}
      {tab === "incidencias" && <Incidents />}
      {tab === "reservas" && <Bookings />}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold">{value}</p>
      {hint && <p className="mt-1 text-xs muted">{hint}</p>}
    </div>
  );
}

const percent = (x: number | null) => (x == null ? "—" : `${(x * 100).toFixed(1)} %`);

function KpiView({ k }: { k: Kpis }) {
  const months = [...new Set(k.northStar.map((r) => r.month))].sort().slice(-6);
  const cities = [...new Set(k.northStar.map((r) => r.city))];
  const max = Math.max(1, ...k.northStar.map((r) => r.n));
  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Alquileres completados (north star)" value={String(k.completed)} hint="Excluye anuncios de muestra" />
        <Stat label="GMV completado" value={money(k.gmv_cents)} hint="Suma de alquileres base, sin garantías" />
        <Stat label="Ingresos buscaDR (comisiones)" value={money(k.revenue_cents)} hint={`Take rate ${percent(k.take_rate)} · no cobrados en piloto`} />
        <Stat label="Contribución estimada" value={money(k.contribution_estimate_cents)} hint="Supuestos §14: PSP 3,5 % + $0,25, riesgo 1 %, soporte $0,80" />
        <Stat
          label="Tasa de aceptación"
          value={percent(k.acceptance.rate)}
          hint={k.acceptance.avg_minutes != null ? `Tiempo medio de respuesta: ${k.acceptance.avg_minutes} min` : "Sin datos aún"}
        />
        <Stat
          label="Propietarios activos"
          value={String(k.activeOwners)}
          hint={`${k.listings.find((l) => l.status === "active")?.n ?? 0} anuncios publicados`}
        />
        <Stat label="Usuarios" value={String(k.users.total ?? 0)} hint={`${k.users.last30 ?? 0} nuevos en 30 días · ${k.users.whatsapp ?? 0} con WhatsApp`} />
        <Stat label="Incidencias abiertas" value={String(k.incidents.open ?? 0)} hint={`${k.incidents.total ?? 0} en total`} />
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-bold">Alquileres completados por ciudad y mes</h2>
        {!months.length ? (
          <p className="mt-2 text-sm muted">Aún no hay alquileres completados con anuncios reales.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {cities.map((city) => (
              <div key={city}>
                <p className="text-sm font-semibold">{city}</p>
                <div className="mt-1 flex items-end gap-2">
                  {months.map((m) => {
                    const n = k.northStar.find((r) => r.city === city && r.month === m)?.n ?? 0;
                    return (
                      <div key={m} className="flex flex-1 flex-col items-center gap-1">
                        <div className="w-full rounded-t-md bg-morado" style={{ height: `${Math.max(4, (n / max) * 90)}px` }} title={`${n}`} />
                        <span className="text-[11px] muted">{m.slice(5)}</span>
                        <span className="text-xs font-semibold">{n}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="text-lg font-bold">Embudo</h2>
          <p className="mt-2 text-sm">
            {k.funnel.views} visitas a fichas → {k.funnel.requests} solicitudes · conversión <strong>{percent(k.funnel.conversion)}</strong> (meta del piloto ≥
            4 %).
          </p>
          <h3 className="mt-4 font-semibold">Reservas por estado</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {k.byStatus.map((s) => (
              <li key={s.status}>
                <StatusBadge status={s.status} label={`${s.label}: ${s.n}`} />
              </li>
            ))}
          </ul>
          <h3 className="mt-4 font-semibold">Oferta activa por categoría</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {k.byCategory.map((c) => (
              <li key={c.category} className="flex justify-between">
                <span>{c.name}</span>
                <strong>{c.n}</strong>
              </li>
            ))}
            {!k.byCategory.length && <li className="muted">Sin anuncios reales publicados aún.</li>}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="text-lg font-bold">Demanda no resuelta (60 días)</h2>
          <p className="text-sm muted">Búsquedas con menos de 3 resultados: guía para captar oferta.</p>
          <ul className="mt-3 divide-y divide-black/5 text-sm">
            {k.demand.map((d, i) => (
              <li key={`${d.query}-${i}`} className="flex gap-3 py-2">
                <span className="min-w-0 flex-1 truncate">
                  {d.query || d.category_name || "—"} <span className="muted">{d.city ? `· ${d.city}` : ""}</span>
                </span>
                <span className="font-semibold">{d.n}</span>
                {d.contact > 0 && <span className="chip bg-turquesa/15 px-2 py-0 text-xs">{d.contact} avísame</span>}
              </li>
            ))}
            {!k.demand.length && <li className="py-2 muted">Sin registros.</li>}
          </ul>
          <h3 className="mt-4 font-semibold">WhatsApp (30 días)</h3>
          <ul className="mt-1 flex flex-wrap gap-2 text-xs">
            {k.whatsapp.map((w) => (
              <li key={w.status} className="chip bg-fondo">
                {w.status}: {w.n}
              </li>
            ))}
            {!k.whatsapp.length && <li className="muted">Sin envíos.</li>}
          </ul>
        </div>
      </section>
      <p className="text-xs muted">{k.notes}</p>
    </div>
  );
}

type ModItem = {
  id: number;
  title: string;
  category_name: string;
  description: string;
  brand: string;
  model: string;
  accessories: string;
  rules: string;
  risk_level: string;
  price_day_cents: number;
  deposit_cents: number;
  replacement_cents: number;
  city: string;
  sector: string;
  status: string;
  source: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  photos: string[];
  updated_at: string;
};

function Moderation() {
  const [status, setStatus] = useState("review");
  const [items, setItems] = useState<ModItem[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => {
    setItems(null);
    api<{ items: ModItem[] }>(`/api/admin/listings?status=${status}`)
      .then((d) => setItems(d.items))
      .catch((e) => setMsg((e as Error).message));
  }, [status]);
  useEffect(() => load(), [load]);
  async function decide(id: number, decision: string, risk?: string) {
    const note = decision === "approve" ? "" : (prompt(decision === "reject" ? "¿Qué debe corregir el propietario?" : "Motivo de la pausa") ?? "");
    if (decision === "reject" && note.trim().length < 5) return;
    try {
      await api(`/api/admin/listings/${id}/review`, { body: { decision, note, risk_level: risk } });
      setMsg(decision === "approve" ? "Anuncio publicado." : "Decisión registrada.");
      load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="mod-status" className="text-sm font-semibold">
          Estado
        </label>
        <select id="mod-status" className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="review">En revisión</option>
          <option value="active">Publicados</option>
          <option value="paused">Pausados</option>
          <option value="rejected">Rechazados</option>
          <option value="draft">Borradores</option>
        </select>
        <p className="text-sm muted">SLA objetivo: ≤ 24 h hábiles.</p>
      </div>
      {msg && <Notice>{msg}</Notice>}
      {!items ? (
        <Spinner />
      ) : !items.length ? (
        <p className="text-sm muted">No hay anuncios en este estado.</p>
      ) : (
        <ul className="space-y-4">
          {items.map((l) => (
            <li key={l.id} className="card p-5">
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex gap-2 overflow-x-auto">
                  {l.photos.slice(0, 4).map((p) => (
                    <a key={p} href={p} target="_blank" rel="noopener">
                      <img src={p} alt="" className="size-24 rounded-xl object-cover" loading="lazy" width={96} height={96} />
                    </a>
                  ))}
                  {!l.photos.length && <span className="grid size-24 place-items-center rounded-xl bg-alerta/5 text-xs text-alerta">Sin fotos</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase text-morado">
                    {l.category_name} · riesgo {l.risk_level} · {l.source}
                  </p>
                  <h3 className="font-display text-lg font-bold">{l.title || "Sin título"}</h3>
                  <p className="text-sm muted">
                    {money(l.price_day_cents)}/día · garantía {money(l.deposit_cents)} · reposición {money(l.replacement_cents)} · {l.sector}, {l.city}
                  </p>
                  <p className="mt-2 text-sm">{l.description}</p>
                  {l.accessories && <p className="mt-1 text-sm">Incluye: {l.accessories}</p>}
                  {l.rules && <p className="mt-1 text-sm">Reglas: {l.rules}</p>}
                  <p className="mt-2 text-xs muted">
                    {l.owner_name} · {l.owner_email} {l.owner_phone ? `· ${l.owner_phone}` : ""} · actualizado {dateTime(l.updated_at)}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {l.status !== "active" && (
                  <>
                    <button type="button" className="btn-primary min-h-10 px-4 text-sm" onClick={() => decide(l.id, "approve")}>
                      <Icon name="check" className="size-4" /> Aprobar
                    </button>
                    <button type="button" className="btn-outline min-h-10 px-4 text-sm" onClick={() => decide(l.id, "approve", "B")}>
                      Aprobar como riesgo B
                    </button>
                    <button type="button" className="btn-danger min-h-10 px-4 text-sm" onClick={() => decide(l.id, "reject")}>
                      Pedir cambios
                    </button>
                  </>
                )}
                {l.status === "active" && (
                  <>
                    <Link to={`/equipo/${l.id}`} className="btn-outline min-h-10 px-4 text-sm">
                      Ver ficha
                    </Link>
                    <button type="button" className="btn-danger min-h-10 px-4 text-sm" onClick={() => decide(l.id, "pause")}>
                      Pausar
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type IncidentRow = {
  id: number;
  booking_id: number;
  kind: string;
  description: string;
  status: string;
  resolution: string;
  created_at: string;
  title: string;
  reporter: string;
};

function Incidents() {
  const [items, setItems] = useState<IncidentRow[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => {
    api<{ items: IncidentRow[] }>("/api/admin/incidents")
      .then((d) => setItems(d.items))
      .catch((e) => setMsg((e as Error).message));
  }, []);
  useEffect(() => load(), [load]);
  async function resolve(i: IncidentRow, outcome: string) {
    const resolution = prompt("Resolución (visible para ambas partes):") ?? "";
    if (resolution.trim().length < 5) return;
    try {
      await api(`/api/admin/incidents/${i.id}`, { body: { status: "resuelta", resolution, outcome } });
      load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  if (!items) return <Spinner />;
  return (
    <div className="space-y-3">
      {msg && <Notice tone="danger">{msg}</Notice>}
      {!items.length && <p className="text-sm muted">Sin incidencias. 🎉</p>}
      {items.map((i) => (
        <div key={i.id} className="card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={i.status === "resuelta" ? "completada" : "incidencia"} label={i.status.replace("_", " ")} />
            <Link to={`/reservas/${i.booking_id}`} className="font-semibold text-morado underline">
              Reserva #{i.booking_id} · {i.title}
            </Link>
            <span className="text-xs muted">
              {i.reporter} · {dateTime(i.created_at)}
            </span>
          </div>
          <p className="mt-2 text-sm">
            <strong>{i.kind}:</strong> {i.description}
          </p>
          {i.resolution && <p className="mt-1 text-sm muted">Resolución: {i.resolution}</p>}
          {i.status !== "resuelta" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn-primary min-h-10 px-4 text-sm" onClick={() => resolve(i, "completada")}>
                Resolver y cerrar reserva
              </button>
              <button type="button" className="btn-outline min-h-10 px-4 text-sm" onClick={() => resolve(i, "cancelada")}>
                Resolver y cancelar reserva
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

type BookingRow = {
  id: number;
  status: string;
  status_label: string;
  start_ms: number;
  end_ms: number;
  total_cents: number;
  created_at: string;
  title: string;
  demo: number;
  renter: string;
  owner: string;
};

function Bookings() {
  const [items, setItems] = useState<BookingRow[] | null>(null);
  useEffect(() => {
    api<{ items: BookingRow[] }>("/api/admin/bookings")
      .then((d) => setItems(d.items))
      .catch(() => setItems([]));
  }, []);
  if (!items) return <Spinner />;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-fondo text-xs uppercase muted">
          <tr>
            <th className="p-3">#</th>
            <th className="p-3">Equipo</th>
            <th className="p-3">Estado</th>
            <th className="p-3">Fechas</th>
            <th className="p-3">Partes</th>
            <th className="p-3">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5">
          {items.map((b) => (
            <tr key={b.id}>
              <td className="p-3">
                <Link to={`/reservas/${b.id}`} className="font-semibold text-morado underline">
                  {b.id}
                </Link>
              </td>
              <td className="p-3">
                {b.title}
                {b.demo ? <span className="ml-1 text-xs muted">(muestra)</span> : null}
              </td>
              <td className="p-3">
                <StatusBadge status={b.status} label={b.status_label} />
              </td>
              <td className="p-3">
                {dateTime(b.start_ms)} → {dateTime(b.end_ms)}
              </td>
              <td className="p-3">
                {b.renter} / {b.owner}
              </td>
              <td className="p-3">{money(b.total_cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
