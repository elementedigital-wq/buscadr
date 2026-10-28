/** Cliente de la API para el navegador: misma sesión (cookie HttpOnly) y cabecera anti-CSRF. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown; raw?: Blob | File } = {}): Promise<T> {
  const method = init.method ?? (init.body !== undefined || init.raw ? "POST" : "GET");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method !== "GET") headers["X-Requested-With"] = "BUSCADR-WEB";
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.raw) headers["Content-Type"] = init.raw.type;
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      body: init.raw ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiError("No hay conexión con buscaDR. Revisa tu internet e inténtalo de nuevo.", 0, "NETWORK");
  }
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new ApiError(data.error ?? `Error ${res.status}`, res.status, data.code);
  return data as T;
}
