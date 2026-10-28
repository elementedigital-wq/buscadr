/**
 * Bloques de la portada: buscador rápido con dictado por voz, «Resumen buscaDR» (lo más urgente de
 * cada persona o el mensaje del CMS) y seguimiento de la reserva activa.
 */
import { useEffect, useRef, useState } from "react";
import { Form, Link, useNavigate } from "react-router";
import type { Cms } from "../lib/types";
import { Icon } from "./Icon";

/* ------------------------------------------------------------------ Buscador rápido */

type Recognition = {
  lang: string;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

/** «Describe lo que necesitas…»: un solo campo, con micrófono si el navegador permite dictado. */
export function QuickSearch({ placeholder, cta }: { placeholder: string; cta: string }) {
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [canSpeak, setCanSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    setCanSpeak(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition));
  }, []);
  function dictate() {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    if (listening) return rec.current?.stop();
    const r = new Ctor();
    r.lang = "es-EC";
    r.interimResults = false;
    r.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript?.trim();
      if (text) navigate(`/explorar?q=${encodeURIComponent(text)}`);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  }
  return (
    <Form action="/explorar" role="search" className="flex items-center gap-2 rounded-[1.4rem] bg-white p-1.5 shadow-[var(--shadow-card)] ring-1 ring-black/10">
      <label className="relative flex min-w-0 flex-1 items-center">
        <span className="sr-only">Qué necesitas</span>
        <Icon name="regular:pen-to-square" className="pointer-events-none absolute left-3.5 size-[18px] text-gris" />
        <input
          ref={input}
          name="q"
          placeholder={placeholder}
          className="min-h-12 w-full min-w-0 truncate rounded-2xl bg-transparent pr-2 pl-11 text-base text-tinta outline-none placeholder:text-gris/80"
          data-cms="home.searchPlaceholder"
          enterKeyHint="search"
        />
      </label>
      {canSpeak && (
        <button
          type="button"
          onClick={dictate}
          className={`icon-btn size-10 shadow-none ${listening ? "bg-morado text-white ring-morado" : "bg-fondo"}`}
          aria-label={listening ? "Detener dictado" : "Dictar lo que necesitas"}
          aria-pressed={listening}
        >
          <Icon name="microphone" className="size-4" />
        </button>
      )}
      <button type="submit" className="btn-primary min-h-12 shrink-0 px-4 sm:px-6" data-cms="hero.cta">
        <Icon name="search" className="size-4" />
        <span className="sr-only sm:not-sr-only">{cta}</span>
      </button>
    </Form>
  );
}

/* ------------------------------------------------------------------ Resumen buscaDR */

export type BriefItem = {
  id: number;
  status: string;
  status_label: string;
  start_ms: number;
  end_ms: number;
  title: string;
  photo: string | null;
  demo: boolean;
  role: "renter" | "owner";
  other_name: string;
  code: string | null;
  when: string;
  until: string;
  left: string | null;
};
export type HomeData = {
  active: BriefItem | null;
  pending: { count: number; first: BriefItem | null };
  waiting: number;
  steps: { key: string; label: string; done: boolean }[];
};

/** Resalta `highlight` dentro de `text` (si aparece). */
function Highlighted({ text, highlight }: { text: string; highlight: string }) {
  const i = highlight ? text.indexOf(highlight) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span className="font-semibold text-morado">{highlight}</span>
      {text.slice(i + highlight.length)}
    </>
  );
}

type BriefContent = { kind: "pending" | "active" | "waiting" | "cms"; body: React.ReactNode; primary: [string, string]; secondary?: [string, string] };

export function briefFor(home: HomeData | null, brief: Cms["home"]["brief"]): BriefContent {
  const p = home?.pending.first;
  if (home && p) {
    return {
      kind: "pending",
      body: (
        <>
          {home.pending.count === 1 ? "Tienes una solicitud" : `Tienes ${home.pending.count} solicitudes`} por responder. La de «{p.title}» vence{" "}
          <span className="font-semibold text-morado">{p.left}</span>; {p.other_name} quiere retirarlo {p.when}.
        </>
      ),
      primary: [`/reservas/${p.id}`, "Responder ahora"],
      secondary: ["/reservas?como=propietario", "Ver todas"],
    };
  }
  const a = home?.active;
  if (a && a.role === "renter") {
    return {
      kind: "active",
      body:
        a.status === "en_curso" ? (
          <>
            Tienes «{a.title}» hasta <span className="font-semibold text-morado">{a.until}</span>. Al devolverlo, ingresa el código que te dará {a.other_name}.
          </>
        ) : (
          <>
            Tu reserva de «{a.title}» es <span className="font-semibold text-morado">{a.when}</span>.
            {a.code ? (
              <>
                {" "}
                Muestra el código <span className="font-mono font-bold tracking-wider">{a.code}</span> al retirar.
              </>
            ) : null}
          </>
        ),
      primary: [`/reservas/${a.id}`, "Ver reserva"],
      secondary: [`/reservas/${a.id}#chat`, `Escribir a ${a.other_name.split(" ")[0]}`],
    };
  }
  if (a && a.role === "owner") {
    return {
      kind: "active",
      body: (
        <>
          {a.status === "en_curso" ? "Tu equipo está alquilado" : "Tienes una entrega"}: «{a.title}» con {a.other_name},{" "}
          <span className="font-semibold text-morado">{a.status === "en_curso" ? `vuelve ${a.until}` : a.when}</span>.
        </>
      ),
      primary: [`/reservas/${a.id}`, "Ver reserva"],
    };
  }
  if (home && home.waiting > 0) {
    return {
      kind: "waiting",
      body: <>Tu solicitud espera la respuesta del propietario (tiene hasta 24 h). Te avisaremos por aquí y por WhatsApp si activaste los avisos.</>,
      primary: ["/reservas", "Ver mis solicitudes"],
      secondary: ["/explorar", "Seguir explorando"],
    };
  }
  return {
    kind: "cms",
    body: <Highlighted text={brief.text} highlight={brief.highlight} />,
    primary: [brief.category ? `/explorar?category=${brief.category}` : "/explorar", brief.cta],
    secondary: brief.secondary ? ["/publicar", brief.secondary] : undefined,
  };
}

export function BriefCard({ home, cms, signedIn }: { home: HomeData | null; cms: Cms; signedIn: boolean }) {
  const content = briefFor(home, cms.home.brief);
  const steps = home?.steps ?? [];
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  const nextHref = next?.key === "whatsapp" ? "/cuenta#whatsapp" : next?.key === "primero" ? "/explorar" : "/cuenta";
  return (
    <section className="surface-brief rounded-[1.6rem] p-5 shadow-[var(--shadow-card)] ring-1 ring-black/5 sm:p-6" aria-label="Resumen buscaDR" data-cms="home.brief.text">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="label-eyebrow" data-cms="home.brief.eyebrow">
          {cms.home.brief.eyebrow}
        </p>
        {signedIn && steps.length > 0 && done < steps.length && (
          <span className="text-xs font-semibold muted">
            {done} de {steps.length} listo
          </span>
        )}
      </div>
      <p className="mt-3 text-[1.05rem] leading-relaxed text-tinta sm:text-lg">{content.body}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to={content.primary[0]} className="btn-primary min-h-11 px-5" data-cms="home.brief.cta">
          <Icon name={content.kind === "pending" ? "regular:circle-check" : content.kind === "active" ? "key" : "regular:calendar"} className="size-4" />
          {content.primary[1]}
        </Link>
        {content.secondary && (
          <Link to={content.secondary[0]} className="btn-outline min-h-11 px-5" data-cms="home.brief.secondary">
            {content.secondary[1]}
          </Link>
        )}
      </div>
      {(next || (content.kind === "cms" && cms.home.brief.footnote)) && (
        <p className="mt-4 border-t border-black/5 pt-3 text-sm muted">
          {next ? (
            <>
              Siguiente paso:{" "}
              <Link to={nextHref} className="font-semibold text-morado underline-offset-2 hover:underline">
                {next.label.charAt(0).toLowerCase() + next.label.slice(1)} →
              </Link>
            </>
          ) : (
            <span data-cms="home.brief.footnote">{cms.home.brief.footnote}</span>
          )}
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ Seguimiento */

export function TrackerCard({ item }: { item: BriefItem }) {
  const live = item.status === "en_curso";
  return (
    <Link
      to={`/reservas/${item.id}`}
      className="card flex items-center gap-3 p-3 pr-4 transition hover:ring-morado/30 sm:p-4"
      aria-label={`Reserva ${item.title}: ${item.status_label}`}
    >
      {item.photo ? (
        <img src={item.photo} alt="" className="size-14 shrink-0 rounded-2xl object-cover" width={56} height={56} loading="lazy" />
      ) : (
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl tone-morado">
          <Icon name="screwdriver-wrench" className="size-6" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display font-bold">{item.title}</span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm muted">
          <span className={`size-2 shrink-0 rounded-full ${live ? "bg-turquesa" : "bg-morado"}`} aria-hidden />
          <span className="truncate">
            {item.status_label} · {live ? `vuelve ${item.until}` : item.when}
          </span>
        </span>
      </span>
      <span className="chip shrink-0 tone-turquesa px-3 py-1.5 text-sm font-semibold">
        <Icon name="route" className="size-3.5" /> Ver
      </span>
    </Link>
  );
}
