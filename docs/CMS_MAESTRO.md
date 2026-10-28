# CMS Maestro buscaDR

El mismo CMS que YANK, adaptado a buscaDR: mismas secciones, vista previa en vivo, clic para editar, borrador/publicación con historial, biblioteca de imágenes y avisos de afirmaciones y contraste.

## Acceso (solo el propietario)

- `https://<tu-dominio>/maestro` (también desde el menú de la cuenta del propietario y desde `/admin`).
- **Correo del propietario:** `elemente.digital@gmail.com` (constante `DEFAULT_OWNER_EMAIL` en `server/lib/owner.ts`). Si se define `BUSCADR_ADMIN_EMAIL` en Cloudflare, ese valor lo reemplaza.
- **Solo esa cuenta** ve los accesos «CMS Maestro» y «Administración y KPIs» y puede usar `/api/cms/*` y `/api/admin/*`. Se verifica en el servidor en cada llamada (correo + `staff_role='admin'`, que solo asigna el inicio de sesión del propietario). Nadie puede registrarse ni entrar con Google usando ese correo.
- **Contraseña inicial:** el secreto `BUSCADR_ADMIN_PASSWORD` de Cloudflare (12+ caracteres). La contraseña **nunca se guarda en el repositorio**.
- **Cambiar la contraseña:** CMS → Operación → **Acceso y contraseña**. La nueva se guarda como hash PBKDF2 en D1, el secreto inicial deja de valer y se cierran las demás sesiones (si el correo está configurado, llega un aviso).
- **¿Olvidaste tu contraseña?** En `/maestro`: escribe el correo del propietario y llega un enlace de un solo uso (30 minutos) a ese correo. Requiere el secreto `RESEND_API_KEY` (ver «Correo de recuperación»). La respuesta es siempre la misma, exista o no el correo, y hay límite de intentos.
- **Si se pierde el acceso al correo:** desde una terminal autorizada, `npx wrangler d1 execute buscadr-db --remote --command "UPDATE users SET password_hash='cloudflare-admin-only:v1' WHERE staff_role='admin'"` vuelve a habilitar el secreto `BUSCADR_ADMIN_PASSWORD` como contraseña.
- Límite de 5 intentos cada 15 min por IP y comparación en tiempo constante. Recomendado antes de abrir al público: Cloudflare Access con MFA delante de `/maestro`, `/admin`, `/api/cms/*` y `/api/admin/*`.

### Correo de recuperación (Resend)

1. Crea una cuenta en resend.com con el correo del propietario y genera una API key (solo permiso de envío).
2. Cloudflare → `buscadr` → Variables and Secrets → Production: secreto `RESEND_API_KEY`.
3. Sin dominio propio verificado, Resend solo permite enviar al correo de la cuenta (`onboarding@resend.dev` como remitente): justo lo necesario para la recuperación. Con un dominio verificado, define `BUSCADR_MAIL_FROM` (p. ej. `buscaDR <no-responder@tu-dominio>`).
4. `/api/health` → `mail:true`. En el CMS, «Acceso y contraseña» muestra que la recuperación está activa.

## Cómo se edita

- **Vista previa en vivo** (derecha; en móvil, botón «Ver vista previa»): el sitio real con el borrador sin guardar. Páginas: Inicio, Explorar, ficha de un equipo, Cómo funciona y Publicar. Dispositivo Móvil o Escritorio.
- **Clic para editar:** un clic en un texto, imagen, banner, categoría o tarjeta de la vista previa abre su campo.
- **Guardar borrador** (Ctrl/Cmd + S) no cambia el sitio público. **Publicar** lo lleva a producción al instante y crea una versión en el historial («Cargar en el borrador» para volver atrás). Dos personas editando a la vez: la segunda recibe un aviso de conflicto en lugar de pisar cambios.
- **Avisos:** afirmaciones prohibidas por `docs/MARKETING_CLAIMS.md` («verificado», «garantizado», «24/7», «al instante», «pagos seguros»…) y colores con contraste < 4,5:1.

## Secciones

| Sección | Qué edita |
|---|---|
| Marca y estilo | Logo, isotipo/favicon, 8 colores, **tipografías** (Brand Deck, Google Fonts o subidas), redondeo y forma de botones |
| Portada | Titular, saludo, **Resumen buscaDR**, fila de categorías, imagen principal, buscador y sugerencias, «Así funciona» y compromisos (con iconos), propietarios, WhatsApp y eventos |
| Banners | Campañas con imagen, texto, enlace o categoría, orden y visibilidad |
| Textos y menú | Aviso del piloto, pie, menú (texto **e icono** de cada destino), textos de botones, página de categorías |
| Componentes | Cantidad de anuncios en portada, columnas, total estimado, mapa, valoraciones, Resumen buscaDR, fila de categorías, seguimiento de la reserva activa |
| Categorías | Nombre, **icono** (catálogo o imagen), **tono** del recuadro, fotografía de la tarjeta, orden y visibilidad |
| Anuncios | Foto de portada, frase de la tarjeta y «Destacado» (aparece primero, siempre con etiqueta) |
| Biblioteca de medios | Subir, ver, copiar ruta y eliminar imágenes y fuentes (avisa si están en uso) |
| SEO y redes | Título y descripción con vista previa de Google |
| Permisos · Reseñas · Publicaciones | Suspender cuentas (cierra sus sesiones), ocultar reseñas abusivas, historial y actividad |
| Acceso y contraseña | Correo del propietario, estado de la recuperación por correo y cambio de contraseña |

Lo que el CMS **no** permite, a propósito: ocultar la etiqueta «Anuncio de muestra», cambiar precios, reseñas o datos del propietario de un anuncio, marcar algo como verificado, escribir CSS libre o subir SVG.

## Iconos

- Catálogo de **305 iconos de Font Awesome Free 7** (sólidos, de contorno y marcas como WhatsApp), agrupados (herramientas, limpieza, jardín, eventos, tecnología, energía, vehículos, personas, dinero, interfaz…).
- El selector busca en español («taladro», «limpieza», «calendario») y en inglés, y permite **subir una imagen** como icono propio de la marca.
- Se usan en categorías, menú (escritorio, móvil y cuenta), «Así funciona» y compromisos. El valor guardado es el nombre del icono (`hammer`, `regular:calendar`, `brands:whatsapp`) o la ruta de la imagen; el servidor rechaza cualquier otro valor.
- Para ampliar el catálogo: añadir nombres a `scripts/icon-list.mjs` y ejecutar `node scripts/build-icons.mjs` (genera `app/lib/icon-data.ts`).
- Licencia: iconos CC BY 4.0, código MIT (atribución en `app/lib/icon-data.ts` y `docs/CREDITOS.md`).

## Tipografías

- **Incluidas (Brand Deck):** Manrope para titulares e Inter para textos (sin servicios externos).
- **Google Fonts:** escribe el nombre de la familia (hay sugerencias: Plus Jakarta Sans, DM Sans, Poppins, Outfit, Sora…). El CMS comprueba que exista y qué pesos tiene. Los visitantes descargan esa fuente desde los servidores de Google (la CSP solo permite `fonts.googleapis.com` y `fonts.gstatic.com`).
- **Desde la computadora:** nombre de la familia + archivos WOFF2, WOFF, TTF u OTF (hasta 3 MB cada uno, se valida la firma real). El peso y la cursiva se detectan del nombre del archivo («Marca-SemiBoldItalic.woff2» → 600 itálica). Se guardan en D1 (o R2) y se declaran con `@font-face`. Usa solo fuentes con licencia web.
- Se elige una familia para **titulares** y otra para **textos e interfaz**; en el sitio solo se cargan esas dos. La biblioteca admite hasta 12 familias.

## Imágenes

El navegador las reduce y comprime a WebP antes de subirlas (logo 800 px, icono 256 px, portada/banners 1920 px). El servidor valida la firma real (PNG, JPEG, WebP, GIF). Sin R2 se guardan en D1 por trozos y se sirven desde `/api/media/…` con caché inmutable. Las fotos de anuncios y de evidencia de entrega usan el mismo mecanismo.

## Estructura

`app/routes/maestro.tsx`, `app/routes/maestro-restablecer.tsx`, `app/components/maestro/{fields,media,icons,fonts,access,Preview,panels,model}.tsx`, `app/lib/cms-preview.ts` (puente `postMessage` solo mismo origen), `app/lib/icons.ts`, `server/cms/{model,routes}.ts`, `server/lib/owner.ts`. Pruebas en `tests/api.test.ts` («CMS Maestro y administración», «CMS: fuentes»), `tests/owner.test.ts` (acceso del propietario) y `tests/lib.test.ts` (saneamiento de iconos y fuentes).
