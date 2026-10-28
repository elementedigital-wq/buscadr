# WhatsApp (Cloud API de Meta)

buscaDR funciona sin WhatsApp; cada pieza se activa al configurar sus secretos. Todo aviso exige **consentimiento** (casilla en el registro o en «Mi cuenta», guardado en `consent_records`) y queda en `notification_log`.

## Qué hace

| Función | Requiere |
|---|---|
| Aviso al propietario de cada solicitud con botones **Aceptar / Rechazar** | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` (+ plantilla para fuera de la ventana de 24 h) |
| Avisos a quien alquila (aceptada, rechazada, recordatorio de retiro) | Igual; `WHATSAPP_TEMPLATE_UPDATE` para fuera de ventana |
| Responder con el botón y que la reserva se confirme | Webhook: `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` |
| Búsqueda por chat («necesito una hidrolavadora en Samborondón») | Webhook |
| Publicar enviando una foto (borrador con sugerencia de IA) | Webhook (+ `ANTHROPIC_API_KEY` para la sugerencia) |
| Enlaces `wa.me` en reservas confirmadas y soporte | Nada (soporte: `BUSCADR_SUPPORT_WHATSAPP`) |

Sin token, la web sigue funcionando y los avisos se registran como no enviados.

## Configuración

1. Meta for Developers → app tipo Business → producto WhatsApp. Copiar el **Phone number ID** y crear un **token permanente** de usuario del sistema con `whatsapp_business_messaging`.
2. Cloudflare → `buscadr` → Variables and Secrets → Production: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_APP_SECRET` (Configuración básica de la app) y `WHATSAPP_VERIFY_TOKEN` (una cadena aleatoria que eliges tú).
3. Webhook en Meta: URL `https://<tu-dominio>/api/whatsapp/webhook`, token de verificación = `WHATSAPP_VERIFY_TOKEN`, suscribir el campo `messages`.
4. `/api/health` debe mostrar `whatsapp:true` y `whatsappWebhook:true`.

El webhook verifica la firma `X-Hub-Signature-256` (HMAC con el App Secret), ignora reintentos por id de mensaje y solo acepta un botón si el número que responde es el del propietario **de esa reserva**.

## Plantillas sugeridas (categoría Utility, español)

**`buscadr_nueva_solicitud`** → `WHATSAPP_TEMPLATE_REQUEST`

> Nueva solicitud en buscaDR para {{1}}. Fechas: {{2}}. Recibirías {{3}}. Responde en 24 h.
> Botones de respuesta rápida: «Aceptar», «Rechazar» (buscaDR envía los payloads `acc:<id>` / `rej:<id>`).

**`buscadr_actualizacion`** → `WHATSAPP_TEMPLATE_UPDATE`

> {{1}}
> (un solo parámetro con el aviso completo; buscaDR elimina saltos de línea, como exige Meta).

Sin plantillas, buscaDR envía mensajes interactivos o de texto, que Meta solo entrega si la persona escribió al número en las últimas 24 h.

## Costos

Meta cobra por conversación iniciada por la empresa (Utility) según el país. Estimar con el volumen de solicitudes del piloto; los mensajes dentro de la ventana de servicio son gratuitos.
