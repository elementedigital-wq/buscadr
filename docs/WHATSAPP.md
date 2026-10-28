# WhatsApp (Cloud API de Meta)

buscaDR funciona sin WhatsApp; cada pieza se activa al configurar sus secretos. Todo aviso exige **consentimiento** (casilla en el registro, en «Mi cuenta» o en el perfil profesional, guardado en `consent_records`) y queda en `notification_log`. Los avisos también llegan siempre a la campana de la app y, si la persona lo acepta, por correo.

## Qué hace

| Para | Mensaje | Requiere |
|---|---|---|
| Profesional | Nueva solicitud de cita con botones **Confirmar / Rechazar** | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` (+ `WHATSAPP_TEMPLATE_REQUEST` fuera de la ventana de 24 h) |
| Profesional | Respuesta con el botón → la cita se confirma o se rechaza (con reembolso si estaba pagada) | Webhook: `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` |
| Paciente | Cita confirmada, rechazada, reprogramada o cancelada; pago aprobado; enlace de videoconsulta | Igual; `WHATSAPP_TEMPLATE_UPDATE` fuera de ventana |
| Ambos | Recordatorios 24 h y 1 h antes (tarea programada) | Igual |
| Cualquiera | Búsqueda por chat («pediatra en Samborondón») con enlaces a perfiles | Webhook |
| Paciente | Enlace `wa.me` al consultorio solo con la cita confirmada | Nada |

Sin token, la web sigue funcionando y los avisos quedan registrados como no enviados.

## Configuración

1. Meta for Developers → app tipo Business → producto WhatsApp. Copia el **Phone number ID** y crea un **token permanente** de usuario del sistema con `whatsapp_business_messaging`.
2. Cloudflare → `buscadr` → Variables and Secrets → Production: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_APP_SECRET` (Configuración básica de la app) y `WHATSAPP_VERIFY_TOKEN` (una cadena aleatoria que eliges tú).
3. Webhook en Meta: URL `https://<tu-dominio>/api/whatsapp/webhook`, token de verificación = `WHATSAPP_VERIFY_TOKEN`, suscribir el campo `messages`.
4. `/api/health` debe mostrar `whatsapp:true` y `whatsappWebhook:true`.

El webhook verifica la firma `X-Hub-Signature-256` (HMAC con el App Secret), ignora reintentos por id de mensaje y solo acepta un botón si el número que responde es el del profesional **de esa cita**.

## Plantillas sugeridas (categoría Utility, español)

**`buscadr_nueva_cita`** → `WHATSAPP_TEMPLATE_REQUEST`

> Nueva solicitud de cita en buscaDR: {{1}} el {{2}} ({{3}}). Confírmala antes de que venza.
> Botones de respuesta rápida: «Confirmar», «Rechazar» (buscaDR envía los payloads `acc:<id>` / `rej:<id>`).

**`buscadr_actualizacion`** → `WHATSAPP_TEMPLATE_UPDATE`

> {{1}}
> (un solo parámetro con el aviso completo; buscaDR elimina saltos de línea, como exige Meta).

Sin plantillas, buscaDR envía mensajes interactivos o de texto, que Meta solo entrega si la persona escribió al número en las últimas 24 h.

## Privacidad

Los mensajes no incluyen el motivo de consulta ni datos clínicos: solo profesional, fecha, modalidad y un enlace a la cita en buscaDR.

## Costos

Meta cobra por conversación iniciada por la empresa (Utility) según el país. Los mensajes dentro de la ventana de servicio son gratuitos.
