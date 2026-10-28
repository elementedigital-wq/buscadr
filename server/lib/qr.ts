/**
 * Códigos QR como trazado SVG (sin imágenes ni HTML): la interfaz dibuja `<path d={path}>` en un
 * `viewBox` de `size` módulos (con margen de 4). Corrección de errores «M» (15 %): legible impreso o
 * en pantalla con brillo bajo.
 */
import qrcode from "qrcode-generator";

export type QrMatrix = { size: number; path: string };

export function qrPath(text: string, margin = 4): QrMatrix {
  const q = qrcode(0, "M");
  q.addData(text, "Byte");
  q.make();
  const n = q.getModuleCount();
  let path = "";
  for (let r = 0; r < n; r++) {
    // Une los módulos oscuros contiguos de cada fila en un solo rectángulo (trazado más corto).
    for (let c = 0; c < n; c++) {
      if (!q.isDark(r, c)) continue;
      let len = 1;
      while (c + len < n && q.isDark(r, c + len)) len++;
      path += `M${c + margin},${r + margin}h${len}v1h-${len}z`;
      c += len - 1;
    }
  }
  return { size: n + margin * 2, path };
}
