# ADR 0018 — Superusuarios del CMS Maestro

**Estado:** aceptada (28-oct-2026). Amplía la ADR 0008.

**Contexto.** El propietario necesita dar acceso completo al CMS y a la administración a otra persona del equipo (p. ej. un director médico) sin compartir su propia contraseña.

**Decisión.**
- **Dos niveles.** El *propietario* (`elemente.digital@gmail.com`, `staff_role='admin'`) y los *superusuarios* (`staff_role='superadmin'`). Ambos ven y usan `/maestro` y `/admin` (`isAdmin`). Solo el propietario crea o retira superusuarios (`requireOwner`, CMS → Acceso y contraseña → Superusuarios).
- **Alta.** El propietario escribe el correo, el nombre y una contraseña inicial: 12+ caracteres, con letras y números o símbolos, sin contener el correo. Se guarda solo como hash PBKDF2 en D1. Nunca va al repositorio, a los secretos de Cloudflare, a los logs ni a la auditoría, que registra solo el correo. Si el correo ya tenía cuenta, esta pasa a superusuario: se reemplaza la contraseña, se desvincula Google y se cierran sus sesiones.
- **Uso.** El superusuario entra en `/maestro` con correo y contraseña, con el mismo límite estricto de intentos que el propietario. Puede cambiar su contraseña (se cierran sus otras sesiones) y recuperarla con el enlace de un solo uso enviado a su propio correo. No puede entrar con Google. `/api/auth/me` devuelve `cms_role: "owner" | "superuser"`.
- **Retiro.** La cuenta pierde el rol, su contraseña queda inutilizable (`REVOKED_MARKER`) y se cierran sus sesiones.

**Consecuencias.** El acceso se delega sin compartir credenciales y queda auditado. Se recomienda MFA (Cloudflare Access) para `/maestro` y `/admin` antes de abrir al público.
