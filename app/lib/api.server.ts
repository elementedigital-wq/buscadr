import { data, type RouterContextProvider } from "react-router";
import { api } from "../../server/app";
import { cloudflareContext } from "./context";

/**
 * Llama a la API dentro del mismo Worker (sin salto de red), reenviando la cookie de sesión.
 * Una sola fuente de verdad: los loaders usan exactamente las mismas reglas que la API pública.
 */
export async function serverApi<T = any>(context: Readonly<RouterContextProvider>, request: Request, path: string): Promise<T> {
  const { env, ctx } = context.get(cloudflareContext);
  const headers = new Headers({ Accept: "application/json" });
  for (const h of ["cookie", "cf-connecting-ip", "user-agent"]) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  const res = await api.fetch(new Request(new URL(path, request.url), { headers }), env, ctx);
  const body = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw data({ message: body.error ?? "Error", code: body.code }, { status: res.status });
  return body as T;
}

export async function serverApiSafe<T>(context: Readonly<RouterContextProvider>, request: Request, path: string, fallback: T): Promise<T> {
  try {
    return await serverApi<T>(context, request, path);
  } catch {
    return fallback;
  }
}
