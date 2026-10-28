import { useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../lib/api";
import { useRootData } from "../root";
import { Icon } from "./Icon";

export function FavoriteButton({ id, initial = false, className = "" }: { id: number; initial?: boolean; className?: string }) {
  const data = useRootData();
  const navigate = useNavigate();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!data?.user) {
      navigate(`/cuenta?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ favorite: boolean }>(`/api/me/favorites/${id}`, { method: on ? "DELETE" : "PUT" });
      setOn(res.favorite);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={on}
      aria-label={on ? "Quitar de favoritos" : "Guardar en favoritos"}
      className={`grid size-10 shrink-0 place-items-center rounded-full bg-white/95 shadow-sm ring-1 ring-tinta/10 transition hover:scale-105 ${className}`}
    >
      <Icon name={on ? "heart" : "regular:heart"} className={`size-[18px] ${on ? "text-[#e11d48]" : "text-tinta"}`} />
    </button>
  );
}
