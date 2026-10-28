/** Campos del editor. Cada campo se enlaza a una ruta del documento CMS («hero.title»). */
import { createContext, type ReactNode, useContext, useEffect, useId, useState } from "react";
import type { Cms } from "../../lib/types";
import { fieldId, getPath } from "./model";

type EditorApi = { config: Cms; update: (path: string, value: unknown) => void; focusPath: string | null };
export const EditorContext = createContext<EditorApi | null>(null);

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("EditorContext ausente");
  return ctx;
}

/** Envoltura con etiqueta, ayuda y resaltado cuando se llega desde un clic en la vista previa. */
export function Field({ path, label, hint, children, wide }: { path: string; label: string; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  const { focusPath } = useEditor();
  const active = focusPath === path;
  return (
    <div
      className={`flex min-w-0 flex-col gap-1.5 rounded-xl text-sm font-medium transition ${wide ? "sm:col-span-2" : ""} ${active ? "bg-turquesa/15 p-2 ring-2 ring-turquesa" : ""}`}
      data-field={path}
    >
      <label htmlFor={fieldId(path)}>{label}</label>
      {children}
      {hint && <p className="text-xs font-normal muted">{hint}</p>}
    </div>
  );
}

export function TextField({
  path,
  label,
  hint,
  max,
  multiline,
  wide,
  placeholder,
}: {
  path: string;
  label: string;
  hint?: string;
  max?: number;
  multiline?: boolean;
  wide?: boolean;
  placeholder?: string;
}) {
  const { config, update } = useEditor();
  const value = String(getPath(config, path) ?? "");
  const common = {
    id: fieldId(path),
    value,
    maxLength: max,
    placeholder,
    className: "input",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(path, e.target.value),
  };
  return (
    <Field
      path={path}
      label={label}
      wide={wide || multiline}
      hint={
        max || hint ? (
          <>
            {hint}
            {hint && max ? " · " : ""}
            {max ? `${value.length}/${max}` : ""}
          </>
        ) : undefined
      }
    >
      {multiline ? <textarea {...common} rows={3} className="input min-h-24 py-2.5" /> : <input {...common} type="text" />}
    </Field>
  );
}

export function NumberField({ path, label, min, max, hint }: { path: string; label: string; min: number; max: number; hint?: string }) {
  const { config, update } = useEditor();
  return (
    <Field path={path} label={label} hint={hint ?? `Entre ${min} y ${max}`}>
      <input
        id={fieldId(path)}
        type="number"
        min={min}
        max={max}
        className="input"
        value={Number(getPath(config, path) ?? min)}
        onChange={(e) => update(path, Math.min(max, Math.max(min, Math.round(Number(e.target.value) || min))))}
      />
    </Field>
  );
}

export function SelectField({ path, label, options, hint }: { path: string; label: string; options: [string, string][]; hint?: string }) {
  const { config, update } = useEditor();
  return (
    <Field path={path} label={label} hint={hint}>
      <select id={fieldId(path)} className="input" value={String(getPath(config, path) ?? "")} onChange={(e) => update(path, e.target.value)}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Toggle({ path, label, hint }: { path: string; label: string; hint?: string }) {
  const { config, update, focusPath } = useEditor();
  const id = fieldId(path);
  const on = !!getPath(config, path);
  return (
    <div className={`flex items-start gap-3 rounded-xl p-2 ${focusPath === path ? "bg-turquesa/15 ring-2 ring-turquesa" : ""}`} data-field={path}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => update(path, !on)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-morado" : "bg-gris-claro ring-1 ring-black/15"}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition ${on ? "left-[22px]" : "left-0.5"}`} />
        <span className="sr-only">{label}</span>
      </button>
      <label htmlFor={id} className="text-sm">
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs muted">{hint}</span>}
      </label>
    </div>
  );
}

export function ColorField({ path, label, hint }: { path: string; label: string; hint?: string }) {
  const { config, update } = useEditor();
  const value = String(getPath(config, path) ?? "#000000");
  const textId = useId();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Field path={path} label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <input
          id={fieldId(path)}
          type="color"
          value={value}
          onChange={(e) => update(path, e.target.value.toUpperCase())}
          className="h-11 w-14 cursor-pointer rounded-xl border border-black/15 bg-white p-1"
        />
        <label htmlFor={textId} className="sr-only">
          {label} en hexadecimal
        </label>
        <input
          id={textId}
          className="input font-mono uppercase"
          value={draft}
          maxLength={7}
          onChange={(e) => {
            const v = e.target.value.trim();
            setDraft(v);
            if (/^#[0-9a-fA-F]{6}$/.test(v)) update(path, v.toUpperCase());
          }}
          onBlur={() => setDraft(value)}
        />
      </div>
    </Field>
  );
}

/** Tarjeta de sección del editor. */
export function Section({ title, description, children, actions }: { title: string; description?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-[var(--shadow-card)] ring-1 ring-black/5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {description && <p className="mt-1 text-sm muted">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export const Grid = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">{children}</div>;
