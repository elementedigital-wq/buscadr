# Monetización

buscaDR combina **SaaS para profesionales** (planes mensuales) con **comisión transaccional** por citas pagadas en línea con buscaDR Pay. Todo se registra en el libro de pagos (`payments`) y se ve en `/admin` (KPIs) y en `/panel/ingresos` (cada profesional).

## Fuentes de ingreso activas en el código

| Fuente | Valor | Dónde se configura |
|---|---|---|
| Plan **Gratis** | $0 · ficha, opiniones, hasta 15 citas/mes | `server/lib/catalog.ts` (`PLANS`) |
| Plan **Agenda** | $15/mes · agenda ilimitada, enlace propio, WhatsApp y correo | Igual |
| Plan **Pro** | $29/mes · + citas virtuales, cobros en línea, recordatorios, métricas | Igual |
| Plan **Growth** | $59/mes · + varias ubicaciones, automatizaciones, reportes | Igual |
| Plan **Clinic** | desde $119/mes · sede con hasta 5 profesionales | Igual |
| Comisión buscaDR Pay | 8 % de cada cita pagada en línea (la asume el profesional) | `BUSCADR_FEE_BPS=800` |
| Cobro en consultorio | 0 % (se registra para el historial del profesional) | — |

Los planes se pagan con buscaDR Pay desde `/panel/plan` y se renuevan por 30 días. Durante el piloto `BUSCADR_ENFORCE_PLANS` está apagado: todas las funciones están disponibles para medir uso antes de cobrar.

## KPIs (`/admin`)

North Star: **citas realizadas** gestionadas por buscaDR (mes y ciudad). Además: tasa y tiempo de confirmación, conversión perfil → solicitud, ingresos buscaDR (comisión + MRR), pagos aprobados y en consultorio, reembolsos, avisos entregados, oferta por especialidad y **demanda no atendida** (búsquedas sin resultados). Los perfiles de muestra se excluyen de todo.

## Próximas palancas (priorizadas)

1. **Pago anticipado como estándar en virtual** (ya activo) y opcional en presencial para especialidades con alto ausentismo: reduce no-shows y aumenta la comisión.
2. **Perfil destacado pagado** (CMS → Profesionales → «Destacado»): la posición y la etiqueta ya existen; falta el cobro mensual.
3. **Recordatorios con confirmación de asistencia** por WhatsApp (botón «Asistiré»), incluidos desde Agenda.
4. **Clinic y multi-sede**: agenda de recepción, varios profesionales, reportes por profesional (tabla `subscriptions` ya admite el plan).
5. **Paquetes y suscripciones de pacientes** (controles de niño sano, nutrición mensual) cobrados con buscaDR Pay.
6. **Convenios con aseguradoras y empresas** (medicina prepagada, salud ocupacional) usando el campo `insurances` del perfil.
7. **Laboratorio e imagenología** como «servicios» (tipo `servicio`) con reserva y pago en línea.
8. **Referidos** (`referral_code` en cada cuenta) para crédito en la primera cita o meses gratis entre colegas.

## Antes de cobrar dinero real (Go/No-Go del Documento Maestro)

Contrato con Payphone (u otro adquirente: Kushki, Datafast/Nuvei) y verificación de sus endpoints, liquidaciones a profesionales, facturación electrónica SRI, términos y privacidad revisados (LOPDP, datos de salud), proceso de disputas y verificación de identidad y registro profesional (ACESS/SENESCYT).
