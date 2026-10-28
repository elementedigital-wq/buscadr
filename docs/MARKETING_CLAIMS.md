# Afirmaciones permitidas en piezas públicas

El CMS avisa automáticamente cuando un texto usa una afirmación prohibida (`app/components/maestro/model.ts`). En salud, la regla es: **nada que prometa resultados clínicos, rapidez de atención o una revisión que no ocurrió**.

## Prohibido

| No decir | Por qué | Alternativa |
|---|---|---|
| «El mejor médico», «los mejores especialistas» | No es demostrable y la verificación no es un ranking | «Profesionales con perfil revisado por buscaDR» |
| «Garantizado», «resultados asegurados», «sin riesgo», «cura» | Promesa clínica | «Agenda con el profesional adecuado para tu consulta» |
| «Diagnóstico en línea / inmediato» | buscaDR no diagnostica | «Consulta virtual con un profesional» |
| «Atendemos emergencias», «24/7» | No es un servicio de urgencias | «Ante una emergencia llama al 911» (aviso obligatorio en el sitio) |
| «Verificado» en un perfil sin revisión | Solo aplica con registro profesional revisado en fuentes oficiales | «Perfil en revisión» |
| «Miles de médicos» | Oferta inicial limitada | «Profesionales en Guayaquil, Samborondón, Daule, Quito y Cuenca» |
| «Descárgala en App Store / Google Play» | Es una web instalable (PWA) | «Instálala desde el navegador» |

## Siempre

- Etiquetar «Perfil de muestra» y «Destacado». Los perfiles de muestra no tienen registro profesional ni opiniones.
- Mostrar la tarifa presencial y la virtual antes de reservar; la comisión de buscaDR no se suma al paciente.
- Ubicación aproximada en público; dirección exacta y contacto solo con la cita confirmada.
- Opiniones solo de pacientes con cita completada; ocultarlas deja constancia.
- Durante el piloto, decir «pago de prueba» mientras buscaDR Pay esté en modo sandbox.

## Correcciones al Brand Deck

El Brand Deck incluye maquetas con datos ilustrativos: no usar reseñas, calificaciones, cantidades de pacientes ni precios de ejemplo como si fueran reales. Usar las fotos limpias de `public/assets/fotos/` y `public/assets/medicos/` (retratos ilustrativos, siempre en perfiles de muestra).
