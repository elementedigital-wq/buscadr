import { createContext } from "react-router";
import type { Env } from "../../server/env";

type CloudflareCtx = { env: Env; ctx: ExecutionContext };
const g = globalThis as typeof globalThis & { __buscadrCloudflareContext?: ReturnType<typeof createContext<CloudflareCtx>> };

/**
 * Contexto del Worker para loaders/actions de React Router 8. Se guarda en globalThis para que
 * la recarga de módulos de Vite en desarrollo no cree dos instancias distintas.
 */
if (!g.__buscadrCloudflareContext) g.__buscadrCloudflareContext = createContext<CloudflareCtx>();
export const cloudflareContext = g.__buscadrCloudflareContext;
