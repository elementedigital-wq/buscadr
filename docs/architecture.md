# buscaDR — Arquitectura objetivo y oportunidades de iteración

## Decisiones del MVP

El documento maestro se refiere a **salud y citas médicas**, no a un marketplace de servicios domésticos. La prueba registra roles `patient`, `pro` y `admin` demo. La identidad gráfica respeta el logotipo original; todo el entorno utiliza CSS Inter; fallback del sistema para modo offline.

**Frontend estático entregado:** HTML, CSS y JavaScript sin dependencias de compilación. Se escogió deliberadamente para permitir revisión inmediata de UX antes de que existan credenciales Cloudflare, proveedor de OAuth y base de datos. El frontend no está conectado al servidor Node de desarrollo y no es apto para almacenar datos médicos reales.

**API local entregada:** Node.js con SQLite experimental. Ofrece endpoints de login y registro con PBKDF2, sesiones con cookie HttpOnly, listados, reserva con índice único, mensajes internos y reseñas tras atención. Es una base funcional de pruebas, pero falta conectar la UI y endurecerla; no se debe desplegar públicamente.

**Destino aprobado por el blueprint:** Next.js/React/TypeScript, Hono en Workers, PostgreSQL/PostGIS con Drizzle y Zod. El SQL de `infra/postgres` es un borrador de esquema para revisión, no migración ejecutada.

## Flujos críticos prioritarios

1. Paciente: búsqueda → perfil acreditado → sede/servicio → horario atómico → solicitud → notificación → consulta → reseña.
2. Profesional: registro → verificación manual → agenda → gestión de solicitudes → seguimiento → analítica → plan.
3. Staff: acreditación → moderación con trazabilidad → estados de incidencias → supervisión de integraciones. Prohibido el acceso generalizado al chat.
4. Clínica: organización, miembros, sedes y recursos con aislamiento tenant. Fase posterior al piloto.

## Geolocalización: elegir la herramienta correcta

- **Leaflet + OpenStreetMap:** visualización gratuita en el prototipo con atribución. Comprobar política de teselas y proveedor autorizado en producción.
- **Haversine:** distancias aproximadas de 12 perfiles sintéticos; no equivale a distancia por carretera.
- **PostGIS + GiST + ST_DWithin:** búsqueda geográfica productiva, con filtrado por ciudad y consulta parametrizada.
- **geolib o Turf.js:** útiles para cálculo espacial adicional en cliente; no cargar ambos indiscriminadamente.
- **R-Tree / Quadtrees:** optimización si cardinalidad de objetos lo justifica; en PostGIS GiST ya ofrece índices espaciales.
- **Geohash:** caché por proximidad o particionamiento si se identifica una necesidad real.
- **A*/Dijkstra:** enrutamiento por red vial si se construyen rutas reales con un grafo y datos de vías; no inventar tiempos de traslado.
- **Douglas–Peucker:** simplificación de trazos de rutas, no mejora por sí misma la precisión de una búsqueda médica.
- **Mapbox/Google Maps SDK:** alternativas sujetas a licenciamiento y claves; no se requieren simultáneamente para el MVP.

## UX/UI y mejoras de conversión

- Priorizar búsqueda y disponibilidad efectiva frente a estadísticas decorativas.
- Mostrar credenciales verificadas con fecha/fuente pública comprobable (nunca un sello ficticio).
- Evitar que pacientes abandonen la web app para mensajes a WhatsApp privado. Mensajería interna + aviso empresarial consentido.
- Dar a cada profesional un onboarding guiado: primera ficha → horarios → primera reserva gestionada.
- Visibilidad de consentimiento y opciones de eliminación/exportación; jamás pedir síntomas en los formularios de marketing.
- Explicar si distancia es aproximada, precio publicado o estimado y disponibilidad temporal.

## Roadmap P0 / P1 / P2

**P0:** reemplazar registro ficticio con OAuth/email verificado, conectar UI a API Hono, PostgreSQL/PostGIS con reserva transaccional, verificación de profesionales, autorización por objeto, SEO en servidor, E2E y WCAG 2.2 AA.

**P1:** Free/Agenda/Pro/Growth/Clinic, webhooks de cobro, limites/entitlements, mensajería con outbox, WhatsApp Business opt-in y plantillas, analytics no clínicos, CMS y clínica básica.

**P2:** asistentes multiusuario, pacientes recurrentes, herramientas integrables, múltiples sedes y aplicaciones Expo. Solo tras revisión legal: Connect, anuncios o pagos de consulta.

## Regla de monetización

Las tarifas hipotéticas del documento maestro son Free $0, Agenda $15/mes, Pro $29/mes, Growth $59/mes y Clinic desde $119/mes. El software debe separar MRR, cobro único de implementación y gastos de WhatsApp u otros proveedores. Nunca condicionar credenciales ni reputación a pagos.