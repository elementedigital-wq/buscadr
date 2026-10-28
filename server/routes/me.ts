/**
 * Portada personalizada y avisos dentro de la app (campana). Solo datos de la cuenta en sesión.
 */
import { Hono } from "hono";
import type { AppBindings } from "../env";
import { type AppointmentStatus, STATUS_LABEL } from "../lib/appointments";
import { requireUser } from "../lib/guards";

export const me = new Hono<AppBindings>();

me.get("/home", async (c) => {
  const user = requireUser(c);
  const db = c.env.DB;
  const now = Date.now();
  const [next, counts, pro] = await Promise.all([
    db
      .prepare(
        `SELECT a.id,a.status,a.start_ms,a.end_ms,a.modality,a.payment_status,a.payment_mode,p.slug,trim(p.title || ' ' || p.display_name) AS name,p.specialty,p.photo,p.demo
         FROM appointments a JOIN practitioners p ON p.id=a.practitioner_id
         WHERE a.patient_id=? AND a.end_ms>=? AND a.status IN ('solicitada','confirmada') ORDER BY a.start_ms LIMIT 1`,
      )
      .bind(user.id, now)
      .first<Record<string, any>>(),
    db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM appointments WHERE patient_id=?1) AS appointments,
                (SELECT COUNT(*) FROM favorites WHERE user_id=?1) AS favorites,
                (SELECT COUNT(*) FROM notifications WHERE user_id=?1 AND read_at IS NULL) AS unread`,
      )
      .bind(user.id)
      .first<{ appointments: number; favorites: number; unread: number }>(),
    db.prepare("SELECT id,status FROM practitioners WHERE user_id=?").bind(user.id).first<{ id: number; status: string }>(),
  ]);
  return c.json({
    next: next && { ...next, demo: !!next.demo, status_label: STATUS_LABEL[next.status as AppointmentStatus] },
    counts: counts ?? { appointments: 0, favorites: 0, unread: 0 },
    practitioner: pro,
  });
});

me.get("/notifications", async (c) => {
  const user = requireUser(c);
  const rows = (
    await c.env.DB.prepare("SELECT id,kind,title,body,link,read_at,created_at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 40")
      .bind(user.id)
      .all<Record<string, any>>()
  ).results;
  return c.json({ items: rows, unread: rows.filter((r) => !r.read_at).length });
});

me.post("/notifications/read", async (c) => {
  const user = requireUser(c);
  await c.env.DB.prepare("UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE user_id=? AND read_at IS NULL").bind(user.id).run();
  return c.json({ ok: true });
});
