/** Eventos de producto sin datos clínicos (Estructura §I). Seudónimos: id de usuario, nunca motivos de consulta. */
export type EventName =
  | "signup"
  | "search_submitted"
  | "search_empty"
  | "profile_opened"
  | "booking_started"
  | "booking_requested"
  | "booking_confirmed"
  | "booking_declined"
  | "booking_cancelled"
  | "booking_rescheduled"
  | "booking_expired"
  | "booking_completed"
  | "booking_no_show"
  | "review_published"
  | "practitioner_submitted"
  | "practitioner_verified"
  | "availability_published"
  | "payment_approved"
  | "payment_failed"
  | "payment_refunded"
  | "subscription_activated"
  | "whatsapp_action"
  | "notification_delivery_failed";

/** Registra un evento sin bloquear la respuesta si falla (la métrica nunca rompe el flujo). */
export async function track(
  db: D1Database,
  name: EventName,
  data: { userId?: string | null; appointmentId?: number | null; practitionerId?: number | null; props?: Record<string, unknown> } = {},
) {
  try {
    await db
      .prepare("INSERT INTO product_events(name,user_id,appointment_id,practitioner_id,props) VALUES(?,?,?,?,?)")
      .bind(name, data.userId ?? null, data.appointmentId ?? null, data.practitionerId ?? null, JSON.stringify(data.props ?? {}))
      .run();
  } catch (error) {
    console.warn("buscaDR evento no registrado", name, (error as Error).message);
  }
}
