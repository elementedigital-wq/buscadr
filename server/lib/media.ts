/**
 * Almacenamiento de imágenes sin servicios de pago (ADR 0007).
 *
 * - Con el binding R2 `MEDIA` se usa R2, como antes.
 * - Sin R2, la imagen se guarda en D1 (`media_objects` + `media_chunks`) en trozos base64, cada
 *   uno muy por debajo del límite de 2 MB por fila. D1 forma parte del plan gratuito.
 *
 * Las claves son UUID inmutables: una imagen nunca cambia de contenido, solo se reemplaza por otra.
 */
import type { Env } from "../env";
import { fail } from "./http";

export const MEDIA_KEY = /^(?:[0-9a-f-]{36}|(?:p|u)-[0-9a-f-]{36})\.(png|jpg|webp|gif)$|^[0-9a-f-]{36}\.(woff2|woff|ttf|otf)$/;
const CHUNK_CHARS = 700_000;

type Base64Uint8 = Uint8Array & { toBase64?: () => string };
type Base64Ctor = typeof Uint8Array & { fromBase64?: (s: string) => Uint8Array };

export function toBase64(bytes: Uint8Array): string {
  const native = (bytes as Base64Uint8).toBase64;
  if (typeof native === "function") return native.call(bytes);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const native = (Uint8Array as Base64Ctor).fromBase64;
  if (typeof native === "function") return native(text);
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export const mediaStorage = (env: Env): "r2" | "d1" => (env.MEDIA ? "r2" : "d1");

/** Guarda una imagen validada. En D1 todo va en un único batch (transacción). */
export async function putImage(env: Env, key: string, data: Uint8Array, mime: string) {
  if (env.MEDIA) {
    await env.MEDIA.put(key, data, { httpMetadata: { contentType: mime } });
    return "r2" as const;
  }
  const encoded = toBase64(data);
  const parts: string[] = [];
  for (let i = 0; i < encoded.length; i += CHUNK_CHARS) parts.push(encoded.slice(i, i + CHUNK_CHARS));
  await env.DB.batch([
    ...parts.map((part, idx) => env.DB.prepare("INSERT INTO media_chunks(key,idx,data) VALUES(?,?,?)").bind(key, idx, part)),
    env.DB.prepare("INSERT INTO media_objects(key,mime,bytes,chunks,storage) VALUES(?,?,?,?,'d1')").bind(key, mime, data.length, parts.length),
  ]);
  return "d1" as const;
}

/** Lee una imagen de D1 o de R2 (las anteriores a esta versión viven en R2). */
export async function getImage(env: Env, key: string): Promise<{ body: BodyInit; mime: string } | null> {
  const meta = await env.DB.prepare("SELECT mime,chunks FROM media_objects WHERE key=?").bind(key).first<{ mime: string; chunks: number }>();
  if (meta) {
    const rows = (await env.DB.prepare("SELECT data FROM media_chunks WHERE key=? ORDER BY idx").bind(key).all<{ data: string }>()).results;
    if (rows.length !== meta.chunks) return null;
    return { body: fromBase64(rows.map((r) => r.data).join("")) as Uint8Array<ArrayBuffer>, mime: meta.mime };
  }
  if (!env.MEDIA) return null;
  const object = await env.MEDIA.get(key);
  return object ? { body: object.body, mime: object.httpMetadata?.contentType ?? "image/webp" } : null;
}

/** Elimina una imagen concreta (por clave), esté en D1 o en R2. */
export async function deleteImage(env: Env, key: string) {
  await env.DB.batch([env.DB.prepare("DELETE FROM media_chunks WHERE key=?").bind(key), env.DB.prepare("DELETE FROM media_objects WHERE key=?").bind(key)]);
  if (env.MEDIA) await env.MEDIA.delete(key);
}

export const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Comprueba la firma real del archivo (no solo el Content-Type declarado). */
export function sniffImage(bytes: Uint8Array, mime: string) {
  const ascii = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b));
  if (mime === "image/png") return bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  if (mime === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  if (mime === "image/gif") return ascii(0, 3) === "GIF";
  return false;
}

/** Lee y valida una imagen subida en el cuerpo de la petición; devuelve bytes, tipo y extensión. */
export async function readImageUpload(request: Request) {
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!IMAGE_TYPES[type]) fail(415, "Usa PNG, JPG, WEBP o GIF.");
  if (Number(request.headers.get("content-length")) > MAX_IMAGE_BYTES) fail(413, "Máximo 4 MB por imagen");
  const data = new Uint8Array(await request.arrayBuffer());
  if (data.length > MAX_IMAGE_BYTES || data.length < 16) fail(413, "Archivo inválido o mayor de 4 MB");
  if (!sniffImage(data, type)) fail(415, "El contenido no coincide con el formato de imagen declarado");
  return { data, type, ext: IMAGE_TYPES[type] };
}

/**
 * Guarda una foto de un usuario (foto de profesional `p-`, perfil `u-`) y registra
 * a su autor. Devuelve la URL pública inmutable.
 */
export async function storeUserImage(env: Env, prefix: "p" | "u", ownerId: string, request: Request) {
  const { data, type, ext } = await readImageUpload(request);
  const key = `${prefix}-${crypto.randomUUID()}.${ext}`;
  await putImage(env, key, data, type);
  await env.DB.prepare("UPDATE media_objects SET owner_id=? WHERE key=?").bind(ownerId, key).run();
  return { key, url: `/api/media/${key}`, bytes: data.length };
}

/** Fuentes que el CMS admite (tipografías propias de la marca o licenciadas). */
export const FONT_TYPES: Record<string, string> = { woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf" };
export const MAX_FONT_BYTES = 3 * 1024 * 1024;

/** Firma real de la fuente: wOF2, wOFF, TrueType (0x00010000 o «true») u OpenType CFF («OTTO»). */
export function sniffFont(bytes: Uint8Array, ext: string) {
  const ascii = String.fromCharCode(...bytes.slice(0, 4));
  if (ext === "woff2") return ascii === "wOF2";
  if (ext === "woff") return ascii === "wOFF";
  if (ext === "ttf") return (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) || ascii === "true";
  if (ext === "otf") return ascii === "OTTO";
  return false;
}

/** Lee y valida una fuente subida (`?ext=woff2|woff|ttf|otf`). */
export async function readFontUpload(request: Request, ext: string) {
  if (!FONT_TYPES[ext]) fail(415, "Usa una fuente WOFF2, WOFF, TTF u OTF.");
  if (Number(request.headers.get("content-length")) > MAX_FONT_BYTES) fail(413, "Máximo 3 MB por fuente");
  const data = new Uint8Array(await request.arrayBuffer());
  if (data.length > MAX_FONT_BYTES || data.length < 64) fail(413, "Archivo inválido o mayor de 3 MB");
  if (!sniffFont(data, ext)) fail(415, "El archivo no es una fuente válida del formato indicado");
  return { data, type: FONT_TYPES[ext], ext };
}
