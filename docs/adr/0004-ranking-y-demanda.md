# ADR 0004 — Ranking del Documento Maestro y registro de demanda

**Estado:** aceptada (26-oct-2026)

**Decisión.** Puntaje = 0,30 disponibilidad + 0,22 cercanía + 0,18 reputación bayesiana + 0,15 precio frente a la mediana de la categoría + 0,10 fiabilidad + 0,05 calidad del anuncio. «Destacado» (CMS) primero y etiquetado; anuncios de muestra con una leve penalización para que los reales ganen. Las búsquedas con menos de 3 resultados se guardan en `demand_log` y la página sin resultados ofrece dejar el pedido.

**Consecuencias.** Orden explicable y ajustable en `server/lib/ranking.ts`; la demanda no resuelta guía la captación de oferta.
