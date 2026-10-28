import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { dayParts, hhmm, initials, toLocalDate } from "../lib/format";
import { Icon } from "./Icon";

export function Avatar({ name, photo, size = 48, rounded = "full" }: { name: string; photo?: string | null; size?: number; rounded?: "full" | "xl" }) {
  const style = { width: size, height: size };
  const shape = rounded === "full" ? "rounded-full" : "rounded-2xl";
  if (photo)
    return (
      <img
        src={photo}
        alt=""
        style={style}
        className={`shrink-0 ${shape} bg-celeste object-cover ring-2 ring-white`}
        loading="lazy"
        width={size}
        height={size}
      />
    );
  return (
    <span
      aria-hidden
      style={{ ...style, fontSize: Math.max(12, size / 2.8) }}
      className={`grid shrink-0 place-items-center ${shape} bg-celeste font-display font-bold text-azul-ink ring-2 ring-white`}
    >
      {initials(name.replace(/^(Dra?\.|Lic\.|Psic\.|Od\.|Nut\.|Ft\.)\s+/i, ""))}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  children,
  back,
  actions,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  back?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 pt-6 sm:pt-10">
      <div className="min-w-0">
        {back && (
          <Link to={back} className="mb-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-azul">
            <Icon name="back" className="size-4" /> Volver
          </Link>
        )}
        {eyebrow && <p className="label-eyebrow">{eyebrow}</p>}
        <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">{title}</h1>
        {children && <div className="mt-2 max-w-2xl text-base muted">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({ title, children, action, icon = "stethoscope" }: { title: string; children?: ReactNode; action?: ReactNode; icon?: string }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="grid size-14 place-items-center rounded-2xl tone-azul">
        <Icon name={icon} className="size-6" />
      </span>
      <h2 className="text-lg font-bold">{title}</h2>
      {children && <div className="max-w-md text-sm muted">{children}</div>}
      {action}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warning" | "success" | "danger"; title?: string; children: ReactNode }) {
  const tones = {
    info: "bg-celeste/70 ring-azul/15",
    warning: "bg-amarillo/20 ring-amarillo/70",
    success: "bg-menta/70 ring-verde/40",
    danger: "bg-alerta/5 ring-alerta/30",
  } as const;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`flex gap-3 rounded-2xl p-4 text-sm ring-1 ${tones[tone]}`}>
      <Icon
        name={tone === "danger" ? "alert" : tone === "success" ? "check-circle" : "info"}
        className={`mt-0.5 size-5 shrink-0 ${tone === "danger" ? "text-alerta-ink" : tone === "success" ? "text-verde-ink" : "text-azul"}`}
      />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div className="text-tinta/90">{children}</div>
      </div>
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  solicitada: "bg-amarillo/20 text-tinta",
  confirmada: "bg-menta text-verde-ink",
  completada: "bg-celeste text-azul-ink",
  cancelada: "bg-gris-claro text-gris",
  rechazada: "bg-gris-claro text-gris",
  expirada: "bg-gris-claro text-gris",
  no_asistio: "bg-alerta/10 text-alerta-ink",
  pendiente: "bg-amarillo/20 text-tinta",
  pagado: "bg-menta text-verde-ink",
  aprobado: "bg-menta text-verde-ink",
  rechazado: "bg-alerta/10 text-alerta-ink",
  reembolsado: "bg-celeste text-azul-ink",
  cancelado: "bg-gris-claro text-gris",
  creado: "bg-gris-claro text-tinta",
  active: "bg-menta text-verde-ink",
  review: "bg-amarillo/20 text-tinta",
  draft: "bg-gris-claro text-tinta",
  paused: "bg-gris-claro text-gris",
  rejected: "bg-alerta/10 text-alerta-ink",
  // Liquidaciones (ADR 0016)
  retenido: "bg-gris-claro text-tinta",
  disponible: "bg-menta text-verde-ink",
  liquidando: "bg-amarillo/20 text-tinta",
  pagada: "bg-menta text-verde-ink",
  anulado: "bg-gris-claro text-gris",
  anulada: "bg-gris-claro text-gris",
  // Citas subsecuentes (ADR 0017)
  propuesta: "bg-amarillo/20 text-tinta",
  activa: "bg-celeste text-azul-ink",
  finalizada: "bg-menta text-verde-ink",
  vencida: "bg-gris-claro text-gris",
  conflicto: "bg-alerta/10 text-alerta-ink",
};

export const PROFILE_STATUS: Record<string, string> = {
  active: "Publicado",
  review: "En verificación",
  draft: "Borrador",
  paused: "Pausado",
  rejected: "Requiere cambios",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`chip px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[status] ?? "bg-gris-claro"}`}>{label}</span>;
}

export function Stars({ value, className = "", size = "size-4" }: { value: number; className?: string; size?: string }) {
  return (
    <span role="img" className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${value.toFixed(1)} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className={`${size} ${i <= Math.round(value) ? "fill-[#f5b301] stroke-[#c98f00]" : "fill-gris-claro stroke-gris-claro"}`}
          aria-hidden
        >
          <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
        </svg>
      ))}
    </span>
  );
}

export function Spinner({ label = "Cargando" }: { label?: string }) {
  return <span role="status" aria-label={label} className="inline-block size-5 animate-spin rounded-full border-2 border-current border-r-transparent" />;
}

/** Rótulo obligatorio de los perfiles de muestra (no se puede ocultar desde el CMS). */
export function DemoBadge({ className = "" }: { className?: string }) {
  return <span className={`chip bg-amarillo/20 px-2.5 py-0.5 text-xs font-semibold text-tinta ring-1 ring-amarillo ${className}`}>Perfil de muestra</span>;
}

/** Sello de verificación manual de credenciales (nunca en perfiles de muestra). */
export function VerifiedBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`chip bg-menta px-2.5 py-0.5 text-xs font-semibold text-verde-ink ${className}`} title="Credenciales revisadas por buscaDR">
      <Icon name="circle-check" className="size-3.5" /> Verificado
    </span>
  );
}

/** Contraseña con botón «Mostrar/Ocultar» (no sale del campo: relleno derecho reservado). */
export function PasswordInput({
  id,
  name,
  autoComplete,
  minLength,
  value,
  onChange,
}: {
  id: string;
  name: string;
  autoComplete: string;
  minLength?: number;
  value?: string;
  onChange?: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        required
        minLength={minLength}
        className="input pr-24"
        {...(onChange ? { value: value ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value) } : {})}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-pressed={show}
        aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
        className="absolute top-1/2 right-1.5 min-h-9 -translate-y-1/2 rounded-full px-3 text-sm font-semibold text-azul hover:bg-azul/5"
      >
        {show ? "Ocultar" : "Mostrar"}
      </button>
    </div>
  );
}

export const TONE_CLASS = { azul: "tone-azul", verde: "tone-verde", cielo: "tone-cielo", neutro: "tone-neutro" } as const;
export const TONE_CARD = { azul: "tone-card-azul", verde: "tone-card-verde", cielo: "tone-card-cielo", neutro: "tone-card-neutro" } as const;

/** Tarjeta de indicador (KPI) del panel. */
export function Stat({
  icon,
  label,
  value,
  hint,
  tone = "azul",
}: {
  icon: string;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "azul" | "verde" | "cielo" | "neutro";
}) {
  return (
    <div className="card flex min-w-0 items-center gap-3 p-4">
      <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${TONE_CLASS[tone]}`}>
        <Icon name={icon} className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm muted">{label}</p>
        <p className="font-display text-2xl font-extrabold leading-tight">{value}</p>
        {hint && <p className="truncate text-xs muted">{hint}</p>}
      </div>
    </div>
  );
}

/** Fecha de una cita en formato «boleto»: día de la semana, número y hora (lectura rápida en listas). */
export function DateTicket({ ms, muted = false }: { ms: number; muted?: boolean }) {
  const parts = dayParts(toLocalDate(ms));
  return (
    <span
      className={`flex w-16 shrink-0 flex-col items-center rounded-2xl px-1 py-2 text-center leading-none ${muted ? "bg-gris-claro text-tinta" : "tone-azul"}`}
    >
      <span className="text-[11px] font-semibold uppercase">
        {parts.weekday} · {parts.month}
      </span>
      <span className="mt-1 font-display text-2xl font-extrabold">{parts.day}</span>
      <span className="mt-1 text-xs font-bold">{hhmm(ms)}</span>
    </span>
  );
}
