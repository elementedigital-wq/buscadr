/**
 * Escáner de QR del panel (ADR 0015). Con BarcodeDetector (Chrome/Android) lee el código con la
 * cámara dentro de buscaDR; en otros navegadores, la cámara del celular abre el enlace del QR
 * directamente, o se pega el enlace/código aquí.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Icon } from "../../components/Icon";
import { Notice } from "../../components/ui";
import type { Route } from "./+types/escanear";

export const meta: Route.MetaFunction = () => [{ title: "Escanear QR · Mi consultorio" }, { name: "robots", content: "noindex" }];

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

/** Token de un QR de buscaDR a partir del texto leído (enlace completo o solo el código). */
const tokenFrom = (text: string) => /(?:^|\/q\/)([ar]_[0-9a-f]{32})(?:$|[?#])/.exec(text.trim())?.[1] ?? null;

export default function Escanear() {
  const navigate = useNavigate();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    setSupported("BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia);
    return () => {
      for (const t of stream.current?.getTracks() ?? []) t.stop();
    };
  }, []);

  function go(text: string) {
    const token = tokenFrom(text);
    if (!token) {
      setError("Ese código no es un QR de buscaDR.");
      return false;
    }
    for (const t of stream.current?.getTracks() ?? []) t.stop();
    navigate(`/q/${token}`);
    return true;
  }

  async function start() {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      stream.current = s;
      setScanning(true);
      const v = video.current!;
      v.srcObject = s;
      await v.play();
      const detector = new (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector({ formats: ["qr_code"] });
      const tick = async () => {
        if (!stream.current?.active) return;
        try {
          const codes = await detector.detect(v);
          if (codes[0] && go(codes[0].rawValue)) return;
        } catch {}
        setTimeout(tick, 250);
      };
      tick();
    } catch {
      setScanning(false);
      setError("No pudimos abrir la cámara. Revisa el permiso del navegador o usa la cámara de tu celular.");
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="label-eyebrow">Trazabilidad</p>
        <h1 className="text-3xl font-extrabold">Escanear QR del paciente</h1>
        <p className="mt-1 muted">Cada escaneo registra la siguiente etapa de la cita: llegada, inicio de la atención y cierre.</p>
      </header>

      <section className="card p-5">
        {supported ? (
          <>
            <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-3xl bg-tinta">
              <video ref={video} className="size-full object-cover" playsInline muted aria-label="Vista de la cámara" />
              {!scanning && (
                <div className="absolute inset-0 grid place-items-center p-6 text-center text-white">
                  <div>
                    <Icon name="qrcode" className="mx-auto size-14" />
                    <button type="button" className="btn mt-4 bg-white text-tinta hover:bg-celeste" onClick={start}>
                      <Icon name="camera" className="size-4" /> Abrir cámara
                    </button>
                  </div>
                </div>
              )}
              {scanning && <div className="pointer-events-none absolute inset-10 rounded-3xl ring-4 ring-white/80" aria-hidden />}
            </div>
            {scanning && <p className="mt-3 text-center text-sm muted">Apunta al código QR que muestra el paciente.</p>}
          </>
        ) : supported === false ? (
          <Notice tone="info" title="Usa la cámara de tu celular">
            Este navegador no lee códigos QR por sí mismo. Abre la cámara del celular, apunta al QR del paciente y toca el enlace: se abrirá buscaDR para
            registrar la etapa. También puedes pegar el enlace o el código abajo.
          </Notice>
        ) : null}
        {error && (
          <div className="mt-3">
            <Notice tone="danger">{error}</Notice>
          </div>
        )}
        <form
          className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            go(manual);
          }}
        >
          <label className="field">
            Enlace o código del QR
            <input className="input" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="https://…/q/a_… o a_…" autoComplete="off" />
          </label>
          <button type="submit" className="btn-outline">
            Abrir
          </button>
        </form>
      </section>

      <section className="card p-5 text-sm">
        <h2 className="text-lg font-extrabold">¿Sin QR?</h2>
        <p className="mt-1 muted">
          Desde la cita en tu{" "}
          <Link to="/panel/agenda" className="font-semibold text-azul-ink underline">
            agenda
          </Link>{" "}
          puedes registrar cada etapa a mano. Si tu paciente prefiere, puede escanear el{" "}
          <Link to="/panel/calidad#recepcion" className="font-semibold text-azul-ink underline">
            QR de recepción
          </Link>{" "}
          de tu consultorio para confirmar su llegada.
        </p>
      </section>
    </div>
  );
}
