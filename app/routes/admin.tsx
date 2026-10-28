import { useCallback, useEffect, useState } from "react";
import { Link, redirect } from "react-router";
import { Icon } from "../components/Icon";
import { Avatar, Notice, PageHeader, Spinner, Stat, StatusBadge } from "../components/ui";
import { api } from "../lib/api";
import { serverApiSafe } from "../lib/api.server";
import { dateTime, money, pct } from "../lib/format";
import type { SessionUser } from "../lib/types";
import type { Route } from "./+types/admin";

export const meta: Route.MetaFunction = () => [{ title: "Administración · buscaDR" }, { name: "robots", content: "noindex, nofollow" }];

type Kpis = {
  northStar: { month: string; city: string; n: number }[];
  byStatus: { status: string; label: string; n: number }[];
  confirmation: { rate: number | null; avg_minutes: number | null };
  practitioners: { status: string; verification: string; n: number }[];
  users: { total: number; last30: number; whatsapp: number; pros: number };
  payments: { gross: number; fees: number; n: number; refunded: number; office: number };
  saas: { mrr: number; active: number };
  demand: { query: string; specialty_name: string; city: string; n: number }[];
  notifications: { channel: string; status: string; n: number }[];
  funnel: { views: number; requests: number; completed: number; conversion: number | null };
  bySpecialty: { specialty: string; name: string; n: number }[];
  notes: string;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const me = await serverApiSafe<{ user: SessionUser | null }>(context, request, "/api/auth/me", { user: null });
  if (!me.user) throw redirect("/cuenta?next=/admin");
  if (!me.user.cms) throw new Response("No tienes acceso", { status: 403 });
  const kpis = await serverApiSafe<Kpis | null>(context, request, "/api/admin/kpis", null);
  return { kpis };
}

const TABS = [
  ["kpis", "KPIs", "chart"],
  ["verificacion", "Verificación", "verified"],
  ["pagos", "Transacciones", "wallet"],
  ["citas", "Citas", "calendar"],
  ["opiniones", "Opiniones", "star"],
] as const;

export default function Admin({ loaderData }: Route.ComponentProps) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("kpis");
  return (
    <div className="container-page pt-6 sm:pt-8">
      <PageHeader
        eyebrow="Operación de buscaDR"
        title="Administración"
        actions={
          <a href="/maestro" className="btn-dark btn-sm">
            <Icon name="palette" className="size-4" /> CMS Maestro
          </a>
        }
      >
        Indicadores del Documento Maestro, verificación de profesionales, libro de transacciones y moderación.
      </PageHeader>
      <div role="tablist" aria-label="Secciones" className="scroll-row mb-6 rounded-full bg-white p-1 ring-1 ring-tinta/10 sm:inline-flex">
        {TABS.map(([key, label, icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold whitespace-nowrap ${tab === key ? "bg-azul text-white" : "hover:bg-tinta/5"}`}
          >
            <Icon name={icon} className="size-4" /> {label}
          </button>
        ))}
      </div>
      {tab === "kpis" && (loaderData.kpis ? <KpiView k={loaderData.kpis} /> : <Notice tone="danger">No se pudieron cargar los KPIs.</Notice>)}
      {tab === "verificacion" && <Verification />}
      {tab === "pagos" && <Payments />}
      {tab === "citas" && <Appointments />}
      {tab === "opiniones" && <Reviews />}
    </div>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
      <span className="truncate">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="col-span-2 h-2 rounded-full bg-gris-claro">
        <span className="block h-2 rounded-full bg-azul" style={{ width: `${max ? Math.max(4, (value / max) * 100) : 0}%` }} />
      </span>
    </li>
  );
}

function KpiView({ k }: { k: Kpis }) {
  const completed = k.byStatus.find((s) => s.status === "completada")?.n ?? 0;
  const verified = k.practitioners.filter((p) => p.verification === "verificado" && p.status === "active").reduce((a, b) => a + b.n, 0);
  const pending = k.practitioners.filter((p) => p.status === "review").reduce((a, b) => a + b.n, 0);
  const sent = k.notifications.filter((n) => n.status === "sent").reduce((a, b) => a + b.n, 0);
  const totalNotif = k.notifications.reduce((a, b) => a + b.n, 0);
  const maxStatus = Math.max(1, ...k.byStatus.map((s) => s.n));
  const maxSpec = Math.max(1, ...k.bySpecialty.map((s) => s.n));
  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores principales">
        <Stat icon="calendar-check" label="Citas realizadas (North Star)" value={completed} hint={`${k.funnel.requests} solicitudes en total`} tone="azul" />
        <Stat
          icon="clock"
          label="Tasa de confirmación"
          value={k.confirmation.rate == null ? "—" : `${Math.round(k.confirmation.rate * 100)} %`}
          hint={k.confirmation.avg_minutes == null ? "Sin decisiones aún" : `Responden en ${k.confirmation.avg_minutes} min en promedio`}
          tone="verde"
        />
        <Stat
          icon="wallet"
          label="Ingresos buscaDR"
          value={money(k.payments.fees + k.saas.mrr)}
          hint={`Comisión ${money(k.payments.fees)} · MRR ${money(k.saas.mrr)}`}
          tone="cielo"
        />
        <Stat icon="users" label="Usuarios" value={k.users.total} hint={`${k.users.last30} nuevos en 30 días · ${k.users.pros} profesionales`} tone="neutro" />
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores secundarios">
        <Stat icon="verified" label="Profesionales verificados" value={verified} hint={`${pending} en revisión`} tone="verde" />
        <Stat icon="card" label="Pagos aprobados" value={money(k.payments.gross)} hint={`${k.payments.n} pagos · ${money(k.payments.office)} en consultorio`} />
        <Stat
          icon="whatsapp"
          label="Avisos entregados (30 d)"
          value={totalNotif ? `${sent}/${totalNotif}` : "—"}
          hint={`${k.users.whatsapp} usuarios con WhatsApp`}
          tone="verde"
        />
        <Stat
          icon="chart"
          label="Conversión perfil → solicitud"
          value={k.funnel.conversion == null ? "—" : pct(Math.round(k.funnel.conversion * 10000))}
          hint={`${k.funnel.views} visitas de perfil`}
          tone="cielo"
        />
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-lg font-extrabold">Citas por estado</h2>
          {k.byStatus.length ? (
            <ul className="mt-3 space-y-3">
              {k.byStatus.map((s) => (
                <Bar key={s.status} label={s.label} value={s.n} max={maxStatus} />
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm muted">Aún no hay citas reales.</p>
          )}
        </section>
        <section className="card p-5">
          <h2 className="text-lg font-extrabold">Oferta activa por especialidad</h2>
          {k.bySpecialty.length ? (
            <ul className="mt-3 space-y-3">
              {k.bySpecialty.map((s) => (
                <Bar key={s.specialty} label={s.name} value={s.n} max={maxSpec} />
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm muted">Aún no hay profesionales reales publicados.</p>
          )}
        </section>
        <section className="card p-5">
          <h2 className="text-lg font-extrabold">Citas realizadas por mes y ciudad</h2>
          {k.northStar.length ? (
            <ul className="mt-2 divide-y divide-tinta/5 text-sm">
              {k.northStar.map((r) => (
                <li key={`${r.month}-${r.city}`} className="flex justify-between gap-3 py-2">
                  <span>
                    {r.month} · {r.city}
                  </span>
                  <strong>{r.n}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm muted">Sin citas completadas todavía.</p>
          )}
        </section>
        <section className="card p-5">
          <h2 className="text-lg font-extrabold">Demanda no atendida (60 días)</h2>
          <p className="text-sm muted">Búsquedas sin resultados: guía para reclutar profesionales.</p>
          {k.demand.length ? (
            <ul className="mt-2 divide-y divide-tinta/5 text-sm">
              {k.demand.map((d) => (
                <li key={`${d.query}-${d.city}-${d.specialty_name}`} className="flex justify-between gap-3 py-2">
                  <span className="min-w-0 break-words">
                    {d.query || d.specialty_name || "(sin texto)"} <span className="muted">· {d.city || "—"}</span>
                  </span>
                  <strong>{d.n}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm muted">Sin registros.</p>
          )}
        </section>
      </div>
      <p className="text-xs muted">{k.notes}</p>
    </div>
  );
}

function useList<T>(path: string) {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api<{ items: T[] }>(path)
      .then((r) => setItems(r.items))
      .catch((e) => setError((e as Error).message));
  }, [path]);
  useEffect(load, [load]);
  return { items, error, reload: load };
}

type Pro = {
  id: number;
  slug: string;
  kind: string;
  title: string;
  display_name: string;
  specialty_name: string;
  subspecialty: string;
  license_number: string;
  city: string;
  sector: string;
  bio: string;
  photo: string;
  status: string;
  verification: string;
  review_note: string;
  price_in_person_cents: number;
  price_virtual_cents: number;
  in_person_enabled: number;
  virtual_enabled: number;
  plan: string;
  demo: number;
  account_email: string;
};

function Verification() {
  const [status, setStatus] = useState("review");
  const { items, error, reload } = useList<Pro>(`/api/admin/practitioners?status=${status}`);
  const [msg, setMsg] = useState<string | null>(null);
  async function decide(id: number, decision: string) {
    const note = decision === "reject" || decision === "suspend" ? (window.prompt("Nota para el profesional (qué debe corregir):") ?? "") : "";
    if ((decision === "reject" || decision === "suspend") && !note) return;
    try {
      await api(`/api/admin/practitioners/${id}/review`, { body: { decision, note } });
      setMsg("Decisión registrada y notificada al profesional.");
      reload();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Estado">
        {[
          ["review", "En revisión"],
          ["active", "Publicados"],
          ["paused", "Pausados"],
          ["rejected", "Rechazados"],
          ["draft", "Borradores"],
        ].map(([v, l]) => (
          <button key={v} type="button" className="pill btn-sm" aria-pressed={status === v} onClick={() => setStatus(v)}>
            {l}
          </button>
        ))}
      </div>
      <Notice tone="info">
        Verifica el registro profesional en ACESS/SENESCYT antes de aprobar. «Publicar sin sello» deja el perfil visible sin la insignia «Verificado».
      </Notice>
      {msg && <Notice tone="success">{msg}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
      {!items ? (
        <Spinner />
      ) : items.length ? (
        <ul className="grid gap-3 lg:grid-cols-2">
          {items.map((p) => (
            <li key={p.id} className="card p-4">
              <div className="flex gap-3">
                <Avatar name={p.display_name} photo={p.photo} size={56} rounded="xl" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold break-words">
                    {p.title} {p.display_name} {p.demo ? <span className="chip bg-gris-claro text-xs">Muestra</span> : null}
                  </p>
                  <p className="text-sm muted">
                    {p.specialty_name}
                    {p.subspecialty ? ` · ${p.subspecialty}` : ""} · {p.city}
                    {p.sector ? `, ${p.sector}` : ""}
                  </p>
                  <p className="text-sm break-all muted">{p.account_email}</p>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="muted">Registro</dt>
                  <dd className="font-semibold break-all">{p.license_number || "—"}</dd>
                </div>
                <div>
                  <dt className="muted">Plan</dt>
                  <dd className="font-semibold">{p.plan}</dd>
                </div>
                <div>
                  <dt className="muted">Presencial</dt>
                  <dd className="font-semibold">{p.in_person_enabled ? money(p.price_in_person_cents) : "No"}</dd>
                </div>
                <div>
                  <dt className="muted">Virtual</dt>
                  <dd className="font-semibold">{p.virtual_enabled ? money(p.price_virtual_cents) : "No"}</dd>
                </div>
              </dl>
              {p.bio && <p className="mt-2 line-clamp-3 text-sm">{p.bio}</p>}
              {p.review_note && <p className="mt-2 text-sm muted">Nota: {p.review_note}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to={`/doctor/${p.slug}`} className="btn-ghost btn-sm">
                  <Icon name="eye" className="size-4" /> Ver
                </Link>
                {p.status !== "active" && (
                  <>
                    <button type="button" className="btn-primary btn-sm" onClick={() => decide(p.id, "approve")}>
                      <Icon name="verified" className="size-4" /> Verificar y publicar
                    </button>
                    <button type="button" className="btn-outline btn-sm" onClick={() => decide(p.id, "publish_unverified")}>
                      Publicar sin sello
                    </button>
                  </>
                )}
                {p.status === "active" && p.verification !== "verificado" && (
                  <button type="button" className="btn-primary btn-sm" onClick={() => decide(p.id, "approve")}>
                    <Icon name="verified" className="size-4" /> Marcar verificado
                  </button>
                )}
                {p.status === "review" && (
                  <button type="button" className="btn-danger btn-sm" onClick={() => decide(p.id, "reject")}>
                    Rechazar
                  </button>
                )}
                {p.status === "active" && (
                  <button type="button" className="btn-danger btn-sm" onClick={() => decide(p.id, "suspend")}>
                    Pausar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No hay perfiles en este estado.</p>
      )}
    </section>
  );
}

type Pay = {
  id: string;
  kind: string;
  plan: string;
  appointment_id: number | null;
  amount_cents: number;
  fee_cents: number;
  net_cents: number;
  provider: string;
  status: string;
  status_label: string;
  card_brand: string;
  card_last4: string;
  created_at: string;
  payer: string;
  practitioner: string | null;
};

function Payments() {
  const [status, setStatus] = useState("");
  const { items, error, reload } = useList<Pay>(`/api/admin/payments${status ? `?status=${status}` : ""}`);
  const [msg, setMsg] = useState<string | null>(null);
  async function refund(id: string) {
    if (!window.confirm("¿Reembolsar este pago al paciente? Esta acción se registra en el libro.")) return;
    try {
      await api(`/api/admin/payments/${id}/refund`, { body: { reason: "Reembolso de la administración" } });
      setMsg("Reembolso registrado.");
      reload();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[
          ["", "Todos"],
          ["aprobado", "Aprobados"],
          ["pendiente", "Pendientes"],
          ["reembolsado", "Reembolsados"],
          ["rechazado", "Rechazados"],
        ].map(([v, l]) => (
          <button key={v} type="button" className="pill btn-sm" aria-pressed={status === v} onClick={() => setStatus(v)}>
            {l}
          </button>
        ))}
        <a href={`/api/admin/payments?format=csv${status ? `&status=${status}` : ""}`} className="btn-outline btn-sm sm:ml-auto">
          <Icon name="download" className="size-4" /> Exportar CSV
        </a>
      </div>
      {msg && <Notice tone="info">{msg}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
      {!items ? (
        <Spinner />
      ) : items.length ? (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="border-b border-tinta/5 text-xs uppercase muted">
              <tr>
                <th className="p-3">Fecha</th>
                <th className="p-3">Concepto</th>
                <th className="p-3">Pagador</th>
                <th className="p-3">Medio</th>
                <th className="p-3">Estado</th>
                <th className="p-3 text-right">Bruto</th>
                <th className="p-3 text-right">Comisión</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-tinta/5">
              {items.map((p) => (
                <tr key={p.id}>
                  <td className="p-3 whitespace-nowrap">{dateTime(p.created_at)}</td>
                  <td className="p-3">
                    {p.kind === "plan" ? `Plan ${p.plan}` : `Cita #${p.appointment_id}`}
                    {p.practitioner && <span className="block text-xs muted">{p.practitioner}</span>}
                  </td>
                  <td className="p-3">{p.payer}</td>
                  <td className="p-3">
                    {p.provider}
                    {p.card_last4 && (
                      <span className="block text-xs muted">
                        {p.card_brand} •••• {p.card_last4}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <StatusBadge status={p.status} label={p.status_label} />
                  </td>
                  <td className="p-3 text-right">{money(p.amount_cents)}</td>
                  <td className="p-3 text-right">{money(p.fee_cents)}</td>
                  <td className="p-3 text-right">
                    {p.status === "aprobado" && p.provider !== "consultorio" && (
                      <button type="button" className="btn-ghost btn-sm" onClick={() => refund(p.id)}>
                        Reembolsar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Sin transacciones.</p>
      )}
    </section>
  );
}

type Appt = {
  id: number;
  status: string;
  status_label: string;
  start_ms: number;
  modality: string;
  price_cents: number;
  payment_status: string;
  practitioner: string;
  patient: string;
  demo: number;
};

function Appointments() {
  const { items, error } = useList<Appt>("/api/admin/appointments");
  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!items) return <Spinner />;
  if (!items.length) return <p className="muted">Aún no hay citas.</p>;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[44rem] text-left text-sm">
        <thead className="border-b border-tinta/5 text-xs uppercase muted">
          <tr>
            <th className="p-3">#</th>
            <th className="p-3">Fecha</th>
            <th className="p-3">Profesional</th>
            <th className="p-3">Paciente</th>
            <th className="p-3">Modalidad</th>
            <th className="p-3">Estado</th>
            <th className="p-3 text-right">Tarifa</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-tinta/5">
          {items.map((a) => (
            <tr key={a.id}>
              <td className="p-3">{a.id}</td>
              <td className="p-3 whitespace-nowrap">{dateTime(a.start_ms)}</td>
              <td className="p-3">
                {a.practitioner} {a.demo ? <span className="text-xs muted">(muestra)</span> : null}
              </td>
              <td className="p-3">{a.patient}</td>
              <td className="p-3 capitalize">{a.modality}</td>
              <td className="p-3">
                <StatusBadge status={a.status} label={a.status_label} />
              </td>
              <td className="p-3 text-right">{money(a.price_cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Review = { id: number; rating: number; body: string; hidden: number; created_at: string; practitioner: string; author: string };

function Reviews() {
  const { items, error, reload } = useList<Review>("/api/admin/reviews");
  async function toggle(r: Review) {
    await api(`/api/admin/reviews/${r.id}`, { body: { hidden: !r.hidden } }).catch(() => {});
    reload();
  }
  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!items) return <Spinner />;
  if (!items.length) return <p className="muted">Aún no hay opiniones. Solo pacientes con cita completada pueden opinar.</p>;
  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {items.map((r) => (
        <li key={r.id} className={`card p-4 ${r.hidden ? "opacity-70" : ""}`}>
          <p className="font-semibold">
            {"★".repeat(r.rating)}
            <span className="text-gris">{"★".repeat(5 - r.rating)}</span> · {r.practitioner}
          </p>
          <p className="mt-1 text-sm break-words">{r.body || <em className="muted">Sin comentario</em>}</p>
          <p className="mt-1 text-xs muted">
            {r.author} · {dateTime(r.created_at)}
          </p>
          <button type="button" className="btn-outline btn-sm mt-3" onClick={() => toggle(r)}>
            {r.hidden ? "Mostrar de nuevo" : "Ocultar (con constancia)"}
          </button>
        </li>
      ))}
    </ul>
  );
}
