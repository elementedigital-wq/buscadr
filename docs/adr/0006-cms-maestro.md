# ADR 0006 — CMS Maestro integrado con borrador, publicación y vista previa

**Estado:** aceptada (28-oct-2026). El acceso se detalla en la ADR 0008.

**Decisión.** `/maestro` edita un documento JSON validado por lista blanca (`server/cms/model.ts`, ≤ 400 KB, sin HTML, CSS ni scripts): marca y colores, tipografías, íconos, portada, banners, textos y botones, componentes, especialidades (nombre, ícono, tono, orden, visibilidad), ajustes por profesional (foto, frase, «Destacado»), SEO, permisos de cuentas y moderación de opiniones. Flujo borrador → publicar con historial de versiones y auditoría. La vista previa carga el sitio real en un iframe y recibe el borrador por `postMessage` (mismo origen); un clic en un elemento con `data-cms` lleva a su campo. El CMS avisa de afirmaciones prohibidas y de contraste insuficiente (WCAG AA). El aviso de emergencias y la etiqueta «Perfil de muestra» no se pueden desactivar.

**Consecuencias.** El propietario cambia contenido y estilo sin desarrollo y sin riesgo de inyectar código.
