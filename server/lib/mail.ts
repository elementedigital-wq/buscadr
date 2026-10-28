/**
 * Correo transaccional con Resend (https://resend.com), opcional. Solo se usa para la recuperación de
 * la contraseña del CMS. Sin RESEND_API_KEY no se envía nada y la API responde igual (sin filtrar datos).
 */
import type { Env } from "../env";

export const mailConfigured = (env: Env) => !!env.RESEND_API_KEY;

export async function sendMail(env: Env, msg: { to: string; subject: string; text: string; html: string }) {
  if (!env.RESEND_API_KEY) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.BUSCADR_MAIL_FROM || "buscaDR <onboarding@resend.dev>",
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      }),
    });
    if (!res.ok) console.error(JSON.stringify({ event: "buscadr_mail_failed", status: res.status }));
    return res.ok;
  } catch (error) {
    console.error(JSON.stringify({ event: "buscadr_mail_failed", error: String(error) }));
    return false;
  }
}

/** Escapa texto para la versión HTML del correo. */
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
