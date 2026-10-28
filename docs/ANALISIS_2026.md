# Análisis de buscaDR y mejoras implementadas (octubre 2026)

Punto de partida: una demo estática (HTML/CSS/JS) con datos en el navegador, una API Node con SQLite experimental sin conectar a la interfaz y un borrador de esquema PostgreSQL. No había cuentas reales, agenda, pagos, notificaciones ni CMS. Fuentes: Documento Maestro, Estructura de Aplicación, Brand Deck y referencias UX de apps de salud.

## Hallazgos y decisiones

| Área | Hallazgo | Qué se hizo |
|---|---|---|
| **Stack** | Demo sin persistencia; arquitectura objetivo (Next.js + Postgres/PostGIS) costosa para un piloto | Un Worker con Hono + React Router 8 SSR + D1 (mismo stack probado en Yank y Tull). Un deploy, SSR para SEO, migraciones automáticas (ADR 0001–0002) |
| **Backend** | Reservas sin control real de concurrencia | Citas atómicas con un `INSERT … WHERE NOT EXISTS`, idempotencia, retención con vencimiento, estados con historial y reprogramación atómica (ADR 0003) |
| **Agenda** | No existía disponibilidad configurable | Reglas semanales por modalidad, duración, pausa, anticipación mínima, bloqueos y confirmación manual o automática |
| **Teleconsulta** | Sin opción virtual | Presencial y virtual con **tarifas diferenciadas**, pago previo en virtual y sala de video (ADR 0010) |
| **Pagos** | Sin pasarela ni registro | **buscaDR Pay**: libro de transacciones, checkout propio (sandbox), adaptador Payphone, cobros en consultorio, reembolsos y CSV (ADR 0009) |
| **Notificaciones** | Ninguna | Campana en la app + WhatsApp con botones para el profesional + correo, con consentimiento y recordatorios 24 h / 1 h (ADR 0005) |
| **Panel profesional** | Dashboard de demostración | Panel personalizado por profesional/clínica/servicio: resumen con KPIs, agenda semanal, solicitudes, horarios, perfil y tarifas, ingresos y plan |
| **UX/UI** | Interfaz sin sistema de componentes; textos que se salían de botones | Sistema de tokens del Brand Deck (Azul Confianza, Verde Salud…), componentes con relleno y alto táctil, tarjetas de médico, chips de especialidad, selector Presencial/Virtual, píldoras de fecha, horarios por franja, navegación inferior flotante, auditoría automática sin desbordes en 320–1440 px |
| **Iconografía** | Íconos dibujados a mano | Font Awesome Free: catálogo médico + librería completa elegible desde el CMS (ADR 0007) |
| **CMS** | No existía | CMS Maestro como en Yank/Tull, con especialidades, profesionales, fuentes de Google (importadas o enlazadas) y subidas, acceso exclusivo del propietario con cambio y recuperación de contraseña (ADR 0006, 0008, 0011) |
| **Confianza** | Riesgo de mostrar datos ficticios como reales | «Perfil de muestra» obligatorio, sin registros ni opiniones inventadas; «Verificado» solo tras revisión; opiniones solo con cita completada |
| **Privacidad (LOPDP)** | Sin consentimientos ni exportación | Consentimientos con evidencia, exportación de datos, ubicación aproximada, dirección y contacto solo con cita confirmada, avisos sin datos clínicos |
| **SEO** | Página única | SSR, landings `/medicos/{ciudad}/{especialidad}`, perfiles indexables, `sitemap.xml` solo con oferta real, JSON-LD |
| **Monetización** | Sin modelo implementado | Planes SaaS (Gratis, Agenda, Pro, Growth, Clinic) pagados en la app + 8 % por cita pagada en línea; KPIs en `/admin` (`docs/MONETIZACION.md`) |

## Pendiente antes de producción con dinero real

1. Contrato y credenciales de Payphone; verificar endpoints con su documentación vigente (no fue accesible durante el desarrollo).
2. Plantillas de WhatsApp aprobadas por Meta y número de WhatsApp Business.
3. Dominio de correo verificado en Resend.
4. Revisión legal de términos, privacidad y política de cancelación; facturación electrónica SRI.
5. Proceso de verificación de registros profesionales (ACESS/SENESCYT) con responsables y plazos.
6. Cloudflare Access con MFA para `/maestro` y `/admin`.
7. Para volumen: sala de video con autenticación y liquidaciones automáticas a profesionales.
