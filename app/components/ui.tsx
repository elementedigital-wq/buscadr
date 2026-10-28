import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { initials } from "../lib/format";
import { Icon } from "./Icon";

export function Avatar({ name, photo, size = 48 }: { name: string; photo?: string | null; size?: number }) {
  const style = { width: size, height: size };
  if (photo)
    return <img src={photo} alt="" style={style} className="shrink-0 rounded-full object-cover ring-2 ring-white" loading="lazy" width={size} height={size} />;
  return (
    <span
      aria-hidden
      style={style}
      className="grid shrink-0 place-items-center rounded-full bg-lila font-display text-base font-bold text-morado ring-2 ring-white"
    >
      {initials(name)}
    </span>
  );
}

export function PageHeader({ eyebrow, title, children, back }: { eyebrow?: string; title: string; children?: ReactNode; back?: string }) {
  return (
    <header className="mb-6 pt-6 sm:pt-10">
      {back && (
        <Link to={back} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-morado">
          <Icon name="back" className="size-4" /> Volver
        </Link>
      )}
      {eyebrow && <p className="label-eyebrow">{eyebrow}</p>}
      <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">{title}</h1>
      {children && <div className="mt-2 max-w-2xl text-base muted">{children}</div>}
    </header>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <img src="/assets/buscadr-isotipo.png" alt="" className="size-11 opacity-90" width={44} height={44} />
      <h2 className="text-lg font-bold">{title}</h2>
      {children && <div className="max-w-md text-sm muted">{children}</div>}
      {action}
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warning" | "success" | "danger"; title?: string; children: ReactNode }) {
  const tones = {
    info: "bg-lila/70 ring-morado/15",
    warning: "bg-[#fff6dc] ring-[#e8c766]",
    success: "bg-turquesa/10 ring-turquesa/40",
    danger: "bg-alerta/5 ring-alerta/30",
  } as const;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`flex gap-3 rounded-2xl p-4 text-sm ring-1 ${tones[tone]}`}>
      <Icon
        name={tone === "danger" ? "alert" : tone === "success" ? "check" : "info"}
        className={`mt-0.5 size-5 shrink-0 ${tone === "danger" ? "text-alerta" : "text-morado"}`}
      />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <div className="text-tinta/90">{children}</div>
      </div>
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  solicitada: "bg-[#fff6dc] text-tinta",
  confirmada: "bg-turquesa/15 text-tinta",
  en_curso: "bg-morado text-white",
  devuelta: "bg-lila text-morado",
  completada: "bg-morado/10 text-morado",
  cancelada: "bg-gris-claro text-gris",
  rechazada: "bg-gris-claro text-gris",
  expirada: "bg-gris-claro text-gris",
  incidencia: "bg-alerta/10 text-alerta",
  active: "bg-turquesa/15 text-tinta",
  review: "bg-[#fff6dc] text-tinta",
  draft: "bg-gris-claro text-tinta",
  paused: "bg-gris-claro text-gris",
  rejected: "bg-alerta/10 text-alerta",
};

export const LISTING_STATUS: Record<string, string> = {
  active: "Publicado",
  review: "En revisión",
  draft: "Borrador",
  paused: "Pausado",
  rejected: "Requiere cambios",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`chip px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[status] ?? "bg-gris-claro"}`}>{label}</span>;
}

export function Stars({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span role="img" className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${value.toFixed(1)} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className={`size-4 ${i <= Math.round(value) ? "fill-[#f5b301] stroke-[#c98f00]" : "fill-gris-claro stroke-gris-claro"}`}
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

/** Rótulo obligatorio de los anuncios de muestra (no se puede ocultar desde el CMS). */
export function DemoBadge({ className = "" }: { className?: string }) {
  return <span className={`chip bg-[#fff6dc] px-2.5 py-0.5 text-xs font-semibold text-tinta ring-1 ring-[#e8c766] ${className}`}>Anuncio de muestra</span>;
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
        className="absolute top-1/2 right-1.5 min-h-9 -translate-y-1/2 rounded-full px-3 text-sm font-semibold text-morado hover:bg-morado/5"
      >
        {show ? "Ocultar" : "Mostrar"}
      </button>
    </div>
  );
}
