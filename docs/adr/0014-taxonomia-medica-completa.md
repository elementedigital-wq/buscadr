# ADR 0014 — Taxonomía médica completa y extensible desde el CMS

**Estado:** aceptada (28-oct-2026)

**Decisión.** La taxonomía base (`server/lib/taxonomy-data.ts`) tiene 83 especialidades en 11 categorías (atención primaria; mujer, embarazo y niñez; especialidades clínicas; cirugía; salud mental; odontología; visión, oído y lenguaje; rehabilitación; nutrición y bienestar; diagnóstico; servicios de salud), cada una con profesional en singular, ícono de Font Awesome, tono y palabras de búsqueda sin tildes. Los slugs son permanentes (los perfiles guardan el slug). El CMS puede renombrar, ocultar, reordenar, recategorizar y cambiar ícono y tono, y **agregar** categorías (hasta 30) y especialidades propias (hasta 120), validadas en el servidor (slug `^[a-z0-9-]+$`, sin chocar con las base, palabras clave saneadas). La taxonomía efectiva (`server/lib/taxonomy.ts`) se cachea por versión publicada del CMS y la usan búsqueda, perfil profesional, administración, WhatsApp, catálogo, landings y sitemap. Las configuraciones anteriores (`taxonomyVersion` < 2) adoptan una sola vez la visibilidad y el orden nuevos y conservan los nombres editados. La búsqueda libre solo cuenta términos de 3+ letras al inicio de una palabra.

**Consecuencias.** Nuevas especialidades sin desplegar código. Una especialidad propia elegida por profesionales debe ocultarse, no borrarse.
