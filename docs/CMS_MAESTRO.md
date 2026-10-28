# CMS Maestro buscaDR

El mismo CMS de Yank y Tull, adaptado al directorio médico buscaDR: vista previa en vivo, clic para editar, borrador/publicación con historial, biblioteca de imágenes y fuentes, íconos Font Awesome editables y avisos de afirmaciones y contraste.

## Primer acceso, paso a paso

1. **Contraseña inicial (una sola vez):** Cloudflare → Workers & Pages → `buscadr` → Settings → Variables and Secrets → **Add** → tipo **Secret**, nombre `BUSCADR_ADMIN_PASSWORD`, valor = tu contraseña (12+ caracteres) → **Deploy**. (Desde una terminal: `npx wrangler secret put BUSCADR_ADMIN_PASSWORD`.) Nunca la escribas en el repositorio.
2. **Que esté publicado:** el código debe estar en `main` (Cloudflare lo despliega solo). Comprueba `https://<tu-url>/api/health` → `adminConfigured: true`.
3. **Entrar:** abre `https://<tu-url>/maestro` (o «Entrar» en `/cuenta`: con el correo del propietario te lleva directo al CMS). Correo `elemente.digital@gmail.com` + la contraseña del paso 1.
4. **Cambiar la contraseña:** CMS → Operación → **Acceso y contraseña**. Desde ese momento vale la nueva (guardada como hash en D1) y el secreto deja de usarse.
5. **Activar la recuperación por correo:** crea el secreto `RESEND_API_KEY` (ver «Correo de recuperación»). Luego, en `/maestro`, «¿Olvidaste tu contraseña?» envía un enlace de 30 minutos a tu correo.
6. Con la sesión iniciada verás en el menú de tu cuenta los accesos **CMS Maestro** y **Administración**; ninguna otra cuenta los ve.

## Acceso (solo el propietario)

- `https://<tu-dominio>/maestro` (también desde el menú de la cuenta del propietario y desde `/admin`).
- **Correo del propietario:** `elemente.digital@gmail.com` (constante `DEFAULT_OWNER_EMAIL` en `server/lib/owner.ts`). Es fijo en producción; `BUSCADR_ADMIN_EMAIL` solo se respeta con `BUSCADR_ENV=test|development`.
- **Solo esa cuenta** ve los accesos «CMS Maestro» y «Administración» (`/api/auth/me` devuelve `cms: true` únicamente para ella) y puede usar `/api/cms/*` y `/api/admin/*`. Se verifica en el servidor en cada llamada (correo + `staff_role='admin'`, que solo asigna el inicio de sesión del propietario). Nadie puede registrarse ni entrar con Google usando ese correo.
- **Contraseña inicial:** el secreto `BUSCADR_ADMIN_PASSWORD` de Cloudflare (12+ caracteres). La contraseña **nunca se guarda en el repositorio**.
- **Cambiar la contraseña:** CMS → Operación → **Acceso y contraseña**. La nueva se guarda como hash PBKDF2 en D1, el secreto inicial deja de valer y se cierran las demás sesiones (si el correo está configurado, llega un aviso).
- **¿Olvidaste tu contraseña?** En `/maestro`: escribe el correo del propietario y llega un enlace de un solo uso (30 minutos) a ese correo. Requiere el secreto `RESEND_API_KEY` (ver «Correo de recuperación»). La respuesta es siempre la misma, exista o no el correo, y hay límite de intentos.
- **Si se pierde el acceso al correo:** desde una terminal autorizada, `npx wrangler d1 execute buscadr-db --remote --command "UPDATE users SET password_hash='cloudflare-admin-only:v1' WHERE staff_role='admin'"` vuelve a habilitar el secreto `BUSCADR_ADMIN_PASSWORD` como contraseña.
- Límite de 5 intentos cada 15 min por IP y comparación en tiempo constante. Recomendado antes de abrir al público: Cloudflare Access con MFA delante de `/maestro`, `/admin`, `/api/cms/*` y `/api/admin/*`.

### Superusuarios (otro acceso al CMS)

Solo el propietario puede crearlos:
1. Entra a `/maestro` con tu cuenta → **Acceso y contraseña** → **Superusuarios**.
2. Escribe el correo y el nombre de la persona y una **contraseña inicial** (mínimo 12 caracteres, con letras y números o símbolos, sin incluir el correo) → **Agregar superusuario**.
3. Compártele la contraseña por un canal seguro. Entra en `/maestro` con su correo y esa contraseña, y la cambia en **Acceso y contraseña**.
4. **Retirar acceso** cierra sus sesiones y deja sin efecto su contraseña.

Los superusuarios tienen el mismo acceso al CMS y a `/admin` que el propietario, pero no pueden agregar ni retirar superusuarios. La contraseña nunca se guarda en el código ni en Cloudflare: solo como hash en D1.

## Correo de recuperación (Resend)

1. Crea una cuenta en resend.com con el correo del propietario y genera una API key (solo permiso de envío).
2. Cloudflare → `buscadr` → Variables and Secrets → Production: secreto `RESEND_API_KEY`.
3. Sin dominio propio verificado, Resend solo permite enviar al correo de la cuenta (`onboarding@resend.dev` como remitente): justo lo necesario para la recuperación. Con un dominio verificado, define `BUSCADR_MAIL_FROM` (p. ej. `buscaDR <no-responder@tu-dominio>`).
4. `/api/health` → `mail:true`. En el CMS, «Acceso y contraseña» muestra que la recuperación está activa.

## Cómo se edita

- **Vista previa en vivo** (derecha; en móvil, botón «Ver vista previa»): el sitio real con el borrador sin guardar. Páginas: Inicio, Buscar, Especialidades, perfil de un profesional, Para profesionales, Planes y Cómo funciona. Dispositivo Móvil o Escritorio.
- **Clic para editar:** un clic en un texto, imagen, banner, especialidad o tarjeta de la vista previa abre su campo.
- **Guardar borrador** (Ctrl/Cmd + S) no cambia el sitio público. **Publicar** lo lleva a producción al instante y crea una versión en el historial («Cargar en el borrador» para volver atrás). Si dos personas editan a la vez, la segunda recibe un aviso de conflicto en lugar de pisar cambios.
- **Avisos:** afirmaciones prohibidas por `docs/MARKETING_CLAIMS.md` («garantizado», «24/7», «el mejor médico», «diagnóstico en línea», «atendemos emergencias»…) y colores con contraste < 4,5:1.

## Secciones

| Sección | Qué edita |
|---|---|
| Marca, fuentes e íconos | Logo (claro y blanco), isotipo/favicon, 9 colores del Brand Deck, **tipografías** (Brand Deck, Google Fonts importadas o enlazadas, o subidas), **íconos y textos del menú**, redondeo y forma de botones |
| Portada | Titular, imagen principal, buscador y sugerencias, 4 beneficios, «Así funciona», compromisos (todos con íconos), bloques de profesionales, telemedicina y WhatsApp |
| Banners | Campañas con imagen, texto, destino (página o especialidad), orden y visibilidad |
| Textos y botones | Aviso de emergencias (obligatorio), cobertura del piloto, pie, títulos de secciones y textos de botones («Ver perfil», «Agendar cita»…) |
| Componentes | Cantidades en portada y búsqueda, columnas, densidad de tarjetas, valoraciones, insignias, tarifas, mapa y bloques de la portada |
| Especialidades y categorías | 83 especialidades base en 11 categorías: nombre, profesional, categoría, palabras de búsqueda, **ícono Font Awesome**, tono, orden y visibilidad. **Agregar categorías y especialidades propias** (se publican con «Publicar») |
| Profesionales | Foto alternativa, frase de la tarjeta y «Destacado» (aparece primero, siempre con etiqueta) |
| Biblioteca de medios | Subir, ver, copiar ruta y eliminar imágenes y fuentes (avisa si están en uso) |
| SEO y redes | Título y descripción con vista previa de Google |
| Pasarelas de pago | Como en WooCommerce: activar, ordenar y configurar tarjeta de prueba, Payphone, transferencia bancaria y pago en consultorio (título, descripción, datos de la cuenta y credenciales cifradas). Se aplica al instante, sin «Publicar» |
| Permisos · Opiniones · Publicaciones | Suspender cuentas (cierra sus sesiones), ocultar opiniones abusivas (con constancia), historial y actividad |
| Acceso y contraseña | Correo del propietario, estado de la recuperación por correo y cambio de contraseña |

Lo que el CMS **no** permite, a propósito: ocultar «Perfil de muestra» o el aviso de emergencias, cambiar tarifas, opiniones, verificación o datos de un profesional, escribir CSS libre o subir SVG.

## Íconos (Font Awesome Free 7)

- **Catálogo buscaDR** (≈290 íconos: salud y especialidades, citas y agenda, personas y confianza, dinero, interfaz, contorno y marcas como WhatsApp). Viaja con el sitio y se busca en español («pediatría», «corazón», «cita») o inglés.
- **Librería completa** (pestaña del selector, más de 2.000 íconos): la búsqueda se hace en el servidor (`/api/cms/icons`). Al elegir un ícono que no está en el catálogo, su trazado se guarda en la marca (`theme.iconLibrary`) y el sitio lo dibuja sin cargar la librería entera.
- **Imagen propia:** también se puede subir una imagen como ícono de la marca.
- Se usan en especialidades, categorías, menú (escritorio, móvil y cuenta), beneficios, «Así funciona» y compromisos. El servidor solo acepta nombres válidos, trazados SVG saneados o rutas de imagen permitidas.
- Ampliar el catálogo: añadir nombres a `scripts/icon-list.mjs` y ejecutar `npm run icons` (regenera `app/lib/icon-data.ts`).
- Licencia: íconos CC BY 4.0, código MIT (`docs/CREDITOS.md`).

## Tipografías

- **Incluidas (Brand Deck):** Manrope para titulares e Inter para textos.
- **Google Fonts:** escribe el nombre (hay sugerencias: Plus Jakarta Sans, DM Sans, Poppins, Outfit, Sora…).
  - **Importar y alojar en buscaDR** (recomendado, casilla marcada): el servidor descarga los archivos WOFF2 y los sirve desde `/api/media/` con caché. Más rápido y sin enviar datos de visitantes a Google.
  - **Enlazar:** se comprueba que exista y se carga desde fonts.google.com.
- **Desde la computadora:** nombre de la familia + archivos WOFF2, WOFF, TTF u OTF (hasta 3 MB cada uno, se valida la firma real). El peso y la cursiva se detectan del nombre del archivo («Marca-SemiBoldItalic.woff2» → 600 itálica). Usa solo fuentes con licencia web.
- Se elige una familia para **titulares** y otra para **textos e interfaz**; en el sitio solo se cargan esas dos. La biblioteca admite hasta 12 familias.

## Imágenes

El navegador las reduce y comprime a WebP antes de subirlas (logo 800 px, ícono 256 px, portada/banners 1600–1920 px, foto de profesional 800 px). El servidor valida la firma real (PNG, JPEG, WebP, GIF). Sin R2 se guardan en D1 por trozos y se sirven desde `/api/media/…` con caché inmutable.

## Estructura

`app/routes/maestro.tsx`, `app/routes/maestro-restablecer.tsx`, `app/components/maestro/{fields,media,icons,fonts,access,Preview,panels,model}.tsx`, `app/lib/cms-preview.ts` (puente `postMessage` solo mismo origen), `app/lib/icons.ts`, `server/cms/{model,routes,icons}.ts`, `server/lib/owner.ts`. Pruebas en `tests/api.test.ts` (CMS, fuentes, librería de íconos), `tests/owner.test.ts` (acceso del propietario) y `tests/lib.test.ts`.

## Pasarelas de pago (Operación → Pasarelas de pago)

1. **Tarjeta de prueba** (activa por defecto): no cobra dinero real.
2. **Payphone:** «Gestionar» → pega el **Token** y el **Store ID** de tu cuenta de Payphone → Guardar → activa el interruptor y confirma el Go/No-Go. Para guardar credenciales desde el CMS necesitas el secreto `BUSCADR_SECRETS_KEY` en Cloudflare (una sola vez); quedan cifradas y solo verás «••••1234». Verifica los endpoints con la documentación vigente de Payphone antes de cobrar.
3. **Transferencia bancaria y pago en el consultorio:** no permitidos (buscaDR cobra solo con tarjeta, ADR 0016). Las transferencias anteriores se siguen confirmando en Administración → Transacciones.
4. Debe quedar al menos un medio con tarjeta activo.
5. **Comisión y liquidaciones** (misma pestaña): comisión de buscaDR (%), días de retención tras la cita y liquidación mínima. Aplican a reservas nuevas.
6. **Liquidar a los profesionales:** Administración → Liquidaciones → «Generar liquidaciones» → «Archivo de transferencias» (CSV para la banca) → transfiere → «Registrar transferencia» con el número de comprobante (el profesional recibe el aviso).
7. El orden (flechas) define el medio predeterminado en el checkout. Los cambios se aplican al instante y quedan en el historial de actividad (sin los valores de las credenciales).

## Especialidades y categorías

- Busca o filtra por categoría; «Editar» abre nombre, profesional, categoría, palabras de búsqueda, ícono y tono.
- **Agregar especialidad:** nombre, profesional, categoría y palabras de búsqueda (sin tildes, separadas por espacios). Toma el ícono y el tono de su categoría.
- **Agregar categoría** al final de la página. Una categoría propia solo se elimina si no tiene especialidades.
- Una especialidad que ya usan profesionales se **oculta**, no se elimina. Publica para que los cambios lleguen al sitio y al formulario de los profesionales.
