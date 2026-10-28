# ADR 0012 — Calidad continua de UX: auditorías automáticas y observabilidad

**Estado:** aceptada (28-oct-2026)

**Contexto.** La revisión de la 1.0 encontró problemas que las pruebas no veían: un nombre reducido a una letra en «Mis citas» (columna flexible aplastada), contraste 4,35:1 en texto azul sobre celeste, la agenda del perfil a ~3.000 px en el celular, 1,3 MB de mapa oculto en `/buscar` y errores de la API imposibles de rastrear.

**Decisión.**
- Tres auditorías en navegador real, como visitante, paciente, profesional y propietario: `test:layout` (desbordes, controles sin relleno y **texto aplastado**, 8 anchos), `test:a11y` (axe-core, WCAG 2.2 AA, falla con infracciones graves o críticas) y `test:e2e` (flujo de cita, incluido conservar el horario elegido al registrarse). Deben pasar tras cada cambio de interfaz.
- Patrones de maquetación: rejillas con pistas `minmax(0,…)` (y una columna encogible por defecto), filas «medio + contenido» como rejilla en lugar de `flex-wrap`, insignias debajo del título y no al lado.
- Colores: el azul, verde y celeste de marca se usan como fondo; para texto pequeño sobre tintes, su versión «ink» derivada con `color-mix`.
- Rendimiento: lo pesado y opcional se carga al hacerse visible o al necesitarse (mapa, editor del CMS).
- API: `X-Request-Id`, `Server-Timing`, `request_id` en errores, registro JSON de errores internos sin datos personales y `Retry-After` en los 429.

**Consecuencias.** Los errores de esta clase se detectan antes de publicar; un código visible para la persona permite encontrar el registro exacto en Workers Logs.
