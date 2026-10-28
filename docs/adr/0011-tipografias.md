# ADR 0011 — Tipografías: Brand Deck, Google Fonts (enlazada o alojada) y fuentes subidas

**Estado:** aceptada (28-oct-2026)

**Decisión.** Manrope (titulares) e Inter (interfaz) vienen incluidas. Desde el CMS el propietario puede: (1) agregar una familia de Google Fonts **importándola** — el servidor descarga los WOFF2 (latin) y los sirve desde `/api/media/` — o **enlazándola** a fonts.google.com; (2) **subir** archivos WOFF2/WOFF/TTF/OTF desde su computadora (≤ 3 MB, firma verificada). El sitio solo carga las dos familias elegidas, con `font-display: swap`. Nombres y URL se validan; nunca se acepta CSS libre.

**Consecuencias.** La opción alojada evita enviar datos de visitantes a Google y acelera la carga. La licencia de fuentes subidas es responsabilidad de quien las agrega.
