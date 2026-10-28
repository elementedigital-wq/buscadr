import { useEffect, useRef } from "react";
import { money } from "../lib/format";
import type { PublicPractitioner } from "../lib/types";

/**
 * Mapa con Leaflet + OpenStreetMap. Se carga solo en el navegador y al hacerse visible. Privacidad: cada consultorio es un
 * círculo aproximado (~1 km); la dirección exacta solo se muestra al paciente con su cita confirmada.
 */
export default function PractitionersMap({
  items,
  center,
  height = "h-[60dvh] min-h-80 lg:h-[calc(100dvh-10rem)]",
}: {
  items: Pick<PublicPractitioner, "id" | "slug" | "name" | "specialty_name" | "lat" | "lng" | "price_in_person_cents" | "demo">[];
  center: { lat: number; lng: number };
  height?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const latest = useRef(items);
  latest.current = items;
  const signature = items.map((l) => `${l.id}:${l.lat}:${l.lng}`).join("|");
  useEffect(() => {
    void signature;
    const items = latest.current;
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    const start = async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !el.current) return;
      map = L.map(el.current, { scrollWheelZoom: false }).setView([center.lat, center.lng], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: "© OpenStreetMap" }).addTo(map);
      const bounds = L.latLngBounds([[center.lat, center.lng]]);
      for (const p of items) {
        if (p.lat == null || p.lng == null) continue;
        const circle = L.circle([p.lat, p.lng], { radius: 500, color: "#0F62FE", weight: 2, fillColor: p.demo ? "#E0F2FE" : "#10B981", fillOpacity: 0.4 });
        const pin = L.marker([p.lat, p.lng], {
          icon: L.divIcon({
            className: "",
            html: `<span style="display:inline-block;transform:translate(-50%,-50%);background:#0F62FE;color:#fff;font:700 12px Inter,sans-serif;padding:4px 9px;border-radius:999px;box-shadow:0 2px 6px rgba(0,0,0,.2);white-space:nowrap">${p.price_in_person_cents ? money(p.price_in_person_cents) : "Virtual"}</span>`,
          }),
        });
        // Contenido del popup con nodos de texto (sin HTML interpolado).
        const popup = document.createElement("div");
        const link = document.createElement("a");
        link.href = `/doctor/${p.slug}`;
        link.textContent = p.name;
        link.style.fontWeight = "700";
        link.style.color = "#0F62FE";
        const meta = document.createElement("div");
        meta.textContent = `${p.specialty_name} · ubicación aproximada${p.demo ? " · perfil de muestra" : ""}`;
        popup.appendChild(link);
        popup.appendChild(meta);
        circle.bindPopup(popup).addTo(map);
        pin.bindPopup(popup).addTo(map);
        bounds.extend([p.lat, p.lng]);
      }
      if (items.length) map.fitBounds(bounds.pad(0.2), { maxZoom: 14, animate: false });
    };
    // Leaflet y las teselas se descargan solo cuando el mapa es visible (oculto en móvil, o más abajo
    // en el perfil): ahorra ~1 MB en la primera carga de /buscar en el celular.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          void start();
        }
      },
      { rootMargin: "300px" },
    );
    if (el.current) io.observe(el.current);
    return () => {
      cancelled = true;
      io.disconnect();
      map?.stop();
      map?.remove();
    };
  }, [signature, center.lat, center.lng]);
  return (
    <div
      ref={el}
      className={`${height} w-full overflow-hidden rounded-[var(--radius-card)] ring-1 ring-tinta/5`}
      role="region"
      aria-label="Mapa de profesionales (ubicaciones aproximadas)"
    />
  );
}
