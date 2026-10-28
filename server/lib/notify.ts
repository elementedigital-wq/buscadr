/**
 * Avisos de citas por tres canales (Documento Maestro §7.3):
 * 1. Dentro de la app (campana, siempre).
 * 2. WhatsApp Business de buscaDR (solo con consentimiento y número válido; sin datos clínicos).
 * 3. Correo con Resend (si está configurado y la persona no lo desactivó).
 * Si Meta o el correo fallan, la notificación de la app queda igual y el intento se registra.
 * Los textos nunca incluyen el motivo de consulta ni información de salud.
 */
import type { Env } from "../env";
import { escapeHtml, mailConfigured, sendMail } from "./mail";
import { type Outgoing, notifyUser } from "./whatsapp";

export type Recipient = { id: string; name?: string; email?: string; phone: string; whatsapp_opt_in: number; email_opt_in?: number };

export const recipient = (db: D1Database, id: string) =>
  db.prepare("SELECT id,name,email,phone,whatsapp_opt_in,email_opt_in,demo FROM users WHERE id=?").bind(id).first<Recipient & { demo: number }>();

export async function notify(
  env: Env,
  to: Recipient,
  n: { kind: string; title: string; body: string; link: string; whatsapp?: { template?: Outgoing; fallback?: Outgoing }; email?: boolean; appOnly?: boolean; ref?: string; origin?: string },
) {
  const db = env.DB;
  await db.prepare("INSERT INTO notifications(user_id,kind,title,body,link) VALUES(?,?,?,?,?)").bind(to.id, n.kind, n.title.slice(0, 140), n.body.slice(0, 600), n.link).run();
  // Citas de prueba con perfiles de muestra: solo aviso dentro de la app (sin WhatsApp ni correo).
  if (n.appOnly) return;
  const tasks: Promise<unknown>[] = [];
  const url = n.origin ? `${n.origin}${n.link}` : n.link;
  tasks.push(
    notifyUser(env, to, n.kind, {
      template: n.whatsapp?.template,
      fallback: n.whatsapp?.fallback ?? { kind: "text", body: `buscaDR · ${n.title}. ${n.body} ${url}`.trim() },
      ref: n.ref,
    }).catch(() => "error"),
  );
  if (n.email !== false && to.email && (to.email_opt_in ?? 1) && mailConfigured(env)) {
    tasks.push(
      sendMail(env, {
        to: to.email,
        subject: `buscaDR · ${n.title}`,
        text: `${n.body}\n\n${url}\n\nbuscaDR · Confianza para encontrar salud. buscaDR no atiende emergencias: ante una urgencia llama al 911.`,
        html: `<div style="font-family:Inter,Arial,sans-serif;color:#0B1F3B;max-width:520px"><p style="font-size:18px;font-weight:700;margin:0 0 8px">${escapeHtml(n.title)}</p><p style="margin:0 0 16px">${escapeHtml(n.body)}</p><p><a href="${escapeHtml(url)}" style="display:inline-block;background:#0F62FE;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">Ver en buscaDR</a></p><p style="color:#64748B;font-size:12px">buscaDR no atiende emergencias: ante una urgencia llama al 911.</p></div>`,
      })
        .then((ok) =>
          db
            .prepare("INSERT INTO notification_log(user_id,channel,template,status,ref) VALUES(?,?,?,?,?)")
            .bind(to.id, "email", n.kind, ok ? "sent" : "error", n.ref ?? null)
            .run(),
        )
        .catch(() => undefined),
    );
  }
  await Promise.all(tasks);
}
