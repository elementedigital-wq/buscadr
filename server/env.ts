/** Bindings y variables del Worker. Los secretos se definen en Cloudflare, nunca en el repositorio. */
export interface Env {
  DB: D1Database;
  /** R2 opcional (bucket `buscadr-media`). Sin él, las imágenes se guardan en D1 (server/lib/media.ts). */
  MEDIA?: R2Bucket;
  ASSETS?: Fetcher;
  /** pilot | test | development. En producción (pilot) el correo del CMS es fijo. */
  BUSCADR_ENV?: string;
  /** Comisión de buscaDR sobre citas pagadas en línea, en puntos básicos (800 = 8 %). */
  BUSCADR_FEE_BPS?: string;
  /** sandbox | payphone. Sin credenciales de Payphone siempre se usa sandbox (rotulado). */
  BUSCADR_PAYMENTS?: string;
  /** "1" para exigir el plan pagado en citas virtuales y cobros en línea (en el piloto todo está abierto). */
  BUSCADR_ENFORCE_PLANS?: string;
  /** Solo pruebas/desarrollo: correo del propietario del CMS. En producción es elemente.digital@gmail.com. */
  BUSCADR_ADMIN_EMAIL?: string;
  /** Contraseña inicial del propietario (hasta que la cambie desde el CMS, que la guarda como hash en D1). */
  BUSCADR_ADMIN_PASSWORD?: string;
  /** Correo transaccional con Resend: recuperación de contraseña del CMS y confirmaciones de citas. */
  RESEND_API_KEY?: string;
  /** Remitente, p. ej. «buscaDR <citas@tu-dominio>». Sin dominio verificado: onboarding@resend.dev. */
  BUSCADR_MAIL_FROM?: string;
  GOOGLE_CLIENT_ID?: string;
  /** Opcionales: WhatsApp Cloud API. Sin ellos se usan enlaces wa.me y avisos dentro de la app. */
  WHATSAPP_TOKEN?: string;
  WHATSAPP_PHONE_ID?: string;
  /** Verifica la firma X-Hub-Signature-256 de los webhooks de Meta. */
  WHATSAPP_APP_SECRET?: string;
  /** Token que se escribe en Meta al registrar el webhook (verificación GET). */
  WHATSAPP_VERIFY_TOKEN?: string;
  /** Plantillas aprobadas en Meta (opcionales, ver docs/WHATSAPP.md). */
  WHATSAPP_TEMPLATE_REQUEST?: string;
  WHATSAPP_TEMPLATE_UPDATE?: string;
  /** URL pública para enlaces en avisos programados (cron), p. ej. https://buscadr.com. */
  BUSCADR_PUBLIC_URL?: string;
  /** Número de WhatsApp Business de buscaDR (wa.me) que se muestra en la web. */
  BUSCADR_SUPPORT_WHATSAPP?: string;
  /** Payphone (Ecuador): token de la app «API» y Store ID. Con ambos, buscaDR Pay cobra con tarjeta real. */
  PAYPHONE_TOKEN?: string;
  PAYPHONE_STORE_ID?: string;
}

export type User = {
  id: string;
  name: string;
  email: string;
  city: string;
  role: "patient" | "pro";
  password_salt: string | null;
  password_hash: string | null;
  google_sub: string | null;
  provider: "password" | "google";
  email_verified: number;
  created_at: number;
  phone: string;
  whatsapp_opt_in: number;
  email_opt_in: number;
  staff_role: string;
  demo: number;
  sector: string;
  bio: string;
  avatar: string;
  referral_code: string | null;
};

export type AppBindings = {
  Bindings: Env;
  Variables: { user: User | null; ip: string; requestId: string };
};
