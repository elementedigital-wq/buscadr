/**
 * Prepara imágenes en el navegador antes de subirlas: corrige el tamaño y las comprime a WebP
 * (o JPEG si el navegador no codifica WebP). Así cada imagen pesa unos cientos de KB y cabe
 * holgadamente en D1, sin servicios externos ni APIs de pago.
 */
export const ACCEPTED_IMAGES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export type PreparedImage = { blob: Blob; width: number; height: number; name: string };

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if ("createImageBitmap" in window) {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
}

/**
 * @param maxSide lado mayor en píxeles (logo 800, icono 256, banner/hero 1920, foto 800).
 * Los GIF se conservan tal cual para no perder la animación (si pesan menos de 4 MB).
 */
export async function prepareImage(file: File, maxSide = 1920): Promise<PreparedImage> {
  if (!ACCEPTED_IMAGES.includes(file.type)) throw new Error("Usa una imagen PNG, JPG, WEBP o GIF.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("La imagen es demasiado grande (máximo 25 MB antes de comprimir).");
  const name = file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 100);
  const decoded = await decode(file).catch(() => {
    throw new Error("No se pudo leer la imagen. Prueba con otro archivo.");
  });
  try {
    const scale = Math.min(1, maxSide / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    if (file.type === "image/gif") {
      if (file.size > MAX_UPLOAD_BYTES) throw new Error("El GIF supera 4 MB. Usa una versión más liviana.");
      return { blob: file, width: decoded.width, height: decoded.height, name };
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Tu navegador no permite procesar imágenes.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(decoded.source, 0, 0, width, height);
    for (const quality of [0.86, 0.78, 0.68, 0.55]) {
      const webp = await toBlob(canvas, "image/webp", quality);
      const blob = webp?.type === "image/webp" ? webp : await toBlob(canvas, "image/jpeg", quality);
      if (blob && blob.size <= MAX_UPLOAD_BYTES) {
        // Si el original ya era más liviano y no hubo que reducirlo, se conserva.
        if (scale === 1 && file.size <= blob.size && file.size <= MAX_UPLOAD_BYTES) return { blob: file, width, height, name };
        return { blob, width, height, name };
      }
    }
    throw new Error("No se pudo comprimir la imagen por debajo de 4 MB.");
  } finally {
    decoded.close();
  }
}

export const formatBytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
