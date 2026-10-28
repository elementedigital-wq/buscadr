import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: any;
  }
}

let loader: Promise<void> | null = null;

/** Carga Google Identity Services solo cuando se necesita (no en cada página). */
function loadGsi() {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = "https://accounts.google.com/gsi/client";
    tag.async = true;
    const timer = setTimeout(() => reject(new Error("Google no respondió. Revisa tu conexión o bloqueadores del navegador.")), 8000);
    tag.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    tag.onerror = () => {
      clearTimeout(timer);
      loader = null;
      reject(new Error("No se pudo cargar el acceso con Google."));
    };
    document.head.appendChild(tag);
  });
  return loader;
}

/**
 * Botón oficial de Google. La credencial (ID token) se valida en el servidor;
 * el navegador nunca recibe ni guarda la contraseña de Google.
 */
export function GoogleButton({
  clientId,
  text = "signin_with",
  onCredential,
}: {
  clientId: string;
  text?: "signin_with" | "signup_with" | "continue_with";
  onCredential: (credential: string) => void;
}) {
  const target = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  callback.current = onCredential;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled || !target.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (r: { credential: string }) => callback.current(r.credential),
          ux_mode: "popup",
        });
        target.current.innerHTML = "";
        window.google.accounts.id.renderButton(target.current, { theme: "outline", size: "large", shape: "pill", text, locale: "es", width: 300 });
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [clientId, text]);

  return (
    <div>
      <div ref={target} className="flex min-h-11 justify-center" />
      {error && (
        <p role="alert" className="mt-2 text-center text-sm muted">
          {error}
        </p>
      )}
    </div>
  );
}
