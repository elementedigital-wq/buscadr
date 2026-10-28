# Arquitectura (v0.6)

## Vista general

```
Navegador / WhatsApp ──► Worker buscadr (workers/app.ts)
                          ├─ /api/*  → Hono (server/app.ts)
                          │    auth · listings · me (portada) · me/listings · me/favorites · bookings · admin · cms · whatsapp · system
                          ├─ resto   → React Router 8 SSR (app/)
                          ├─ cron    → server/cron.ts (cada 30 min)
                          └─ D1 DB (buscadr-db) · R2 MEDIA (opcional)
```

Antes de cada request se aplican las migraciones pendientes (una por request, en transacción). Cabeceras de seguridad (CSP estricta, HSTS, `frame-ancestors 'none'` salvo la vista previa del CMS) en `workers/app.ts`.

## Módulos del servidor (`server/`)

| Archivo | Responsabilidad |
|---|---|
| `lib/crypto.ts`, `lib/session.ts` | PBKDF2-SHA256 (100k) con verificación del formato v0.3 (240k) y actualización transparente; sesiones de 14 días en D1 (solo el hash SHA-256 del token) |
| `lib/guards.ts`, `lib/rate-limit.ts` | Autorización y límites de intentos en D1 (login, registro, reservas, subidas, IA) |
| `lib/catalog.ts` | 11 categorías, ciudades/sectores del piloto, equipos prohibidos (riesgo C) |
| `lib/pricing.ts` | Combinación más barata de horas/días/semanas, tarifas, validación de fechas |
| `lib/bookings.ts` | Máquina de estados, SQL de solapes, acciones disponibles por rol |
| `lib/ranking.ts` | Puntaje del Documento Maestro |
| `lib/whatsapp.ts`, `lib/ai.ts` | WhatsApp Cloud API y sugerencias con Claude |
| `lib/media.ts` | Imágenes en D1 por trozos o R2, con validación de firma real |
| `lib/owner.ts`, `lib/mail.ts` | Acceso del propietario (contraseña en D1, recuperación por enlace) y correo con Resend |
| `routes/me.ts` | «Resumen buscaDR»: reserva activa, solicitudes por responder y progreso de la cuenta |
| `cms/` | Modelo (iconos, tonos y fuentes validados), saneamiento por lista blanca y API del CMS |

## Datos (D1)

`users`, `sessions`, `auth_attempts` (v0.3, intactas; `users` ampliada con columnas nuevas) · `listings`, `listing_photos`, `availability_blocks` · `bookings`, `booking_events`, `handovers`, `messages`, `reviews`, `incidents` · `favorites`, `demand_log`, `product_events`, `notification_log`, `whatsapp_inbound`, `consent_records`, `rate_limits` · `cms_*`, `media_*`.

La referencia PostGIS para búsquedas a escala está en `infrastructure/postgis/` (no se usa en el piloto: D1 + filtro por caja y distancia haversine bastan para miles de anuncios).

## Reservas

```
solicitada ──accept──► confirmada ──pickup(código)──► en_curso ──return(código)──► devuelta ──complete/48 h──► completada
    │ decline/vence 24 h        │ cancel                              │ incident                    │ incident
    ▼                           ▼                                      ▼                             ▼
 rechazada / expirada        cancelada                             incidencia ◄──────────────────────┘
```

- **Anti doble reserva:** un único `INSERT … SELECT … WHERE NOT EXISTS(solape) AND NOT EXISTS(bloqueo)`. D1 serializa las escrituras, así que dos solicitudes simultáneas no pueden ganar ambas (prueba de concurrencia en `tests/api.test.ts`). El rango ocupado incluye el margen entre alquileres (`buffer_hours`).
- **Idempotencia:** `UNIQUE(renter_id, idempotency_key)`.
- **Retención:** una solicitud retiene el calendario 24 h (o hasta el inicio). La tarea programada la vence.
- **Entrega y devolución:** quien alquila muestra el código de entrega y el propietario lo ingresa; al revés en la devolución. Se guardan checklist y fotos (`handovers`).
- **Privacidad:** contacto y punto exacto solo con reserva confirmada; el chat oculta teléfonos y correos hasta entonces.
- **Anuncios de muestra:** confirmación inmediata, quien alquila puede simular los pasos del propietario y sus reservas no ocupan el calendario.

## Ranking

`0,30 disponibilidad + 0,22 cercanía + 0,18 reputación (bayesiana) + 0,15 precio vs. mediana de la categoría + 0,10 fiabilidad (aceptación) + 0,05 calidad del anuncio`. «Destacado» (CMS) va primero y siempre se etiqueta.

## Web (`app/`)

Rutas: `/`, `/explorar`, `/categorias`, `/equipo/:slug`, `/equipo/:slug/reservar` (3 pasos, estado en la URL), `/alquiler/:ciudad/:categoria`, `/reservas`, `/reservas/:id`, `/publicar`, `/panel`, `/favoritos`, `/cuenta`, `/admin`, `/como-funciona`, `/maestro`, `/maestro/restablecer`, `/sitemap.xml`. Iconos: `app/components/Icon.tsx` sobre `app/lib/icon-data.ts` (Font Awesome Free). Los enlaces antiguos con `#/explorar` redirigen. Formularios de búsqueda GET (funcionan sin JS), mapa cargado solo en el navegador, PWA con service worker que nunca guarda HTML con datos personales.
