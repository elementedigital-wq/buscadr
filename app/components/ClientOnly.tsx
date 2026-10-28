import { useEffect, useState } from "react";

/** Renderiza solo en el navegador (Leaflet necesita `window`). */
export function ClientOnly({ children, fallback }: { children: () => React.ReactNode; fallback?: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? children() : (fallback ?? <div className="h-80 rounded-[var(--radius-card)] bg-white" />);
}
