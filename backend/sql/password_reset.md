# Recuperación de contraseña

Implementada para la rama `47-agregar-recuperación-de-contraseña`. El enlace de **¿Olvidaste tu contraseña?** del login permite solicitar un correo y elegir una nueva contraseña. No inicia sesión automáticamente.

## Activación en producción

1. Actualizá el código desde esta rama.
2. En **Supabase → SQL Editor**, ejecutá el contenido completo de [`password_reset.sql`](password_reset.sql) sobre la base que usa el backend. Es idempotente: se puede ejecutar nuevamente. **Hacelo antes de desplegar el backend**, porque el login también necesita la nueva columna `users.auth_version`. No hay un ejecutor automático de migraciones.
3. Agregá esta única variable nueva al backend en Fly:

   ```powershell
   fly secrets set PASSWORD_RESET_URL="https://fundacionseno.org/login/restablecer/" -a sitio-web-fundacion-seno
   ```

   Usá el dominio donde realmente publicás el frontend; es la dirección de la pantalla de nueva contraseña, no la de la API. No lleva query ni fragmento. En producción se exige HTTPS.
4. Verificá la configuración SMTP existente: `SMTP_HOST`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`, `SMTP_PORT` y `SMTP_SECURITY`. No hace falta otra cuenta de correo ni una clave de cifrado nueva. `VOLUNTEER_TO_EMAIL` sigue siendo el destinatario de voluntariado; los correos de recuperación se envían a **`users.email`** de la cuenta correspondiente.
5. Desplegá el frontend y el backend desde esta rama. El frontend sigue usando su `PUBLIC_API_URL` habitual. No agregues credenciales SMTP ni secretos al frontend.
6. Probá con una cuenta propia activa, con un correo al que tengas acceso, siguiendo la lista de comprobación de abajo.

El rol de PostgreSQL utilizado por `DATABASE_URL` debe poder acceder a la tabla nueva y actualizar `users`. La migración habilita RLS y revoca el acceso de `anon` y `authenticated`. El backend debe conectarse con el propietario de las tablas o un rol autorizado para el backend; si usás un rol restringido, configurá sus permisos y política específica de RLS. No habilites acceso público a los tokens.

Si omitís `PASSWORD_RESET_URL`, el resto del backend funciona, pero la solicitud de recuperación responde que no está disponible. Una URL configurada con formato inválido impide el arranque para evitar enviar enlaces incorrectos.

## Desarrollo local

En `backend/.env`, además de tus variables existentes:

```dotenv
PASSWORD_RESET_URL=http://localhost:4321/login/restablecer/
```

Usá una base de desarrollo con la migración aplicada y un servidor SMTP de pruebas con TLS o STARTTLS compatible con el servicio actual. Reiniciá el backend después de cambiar sus variables. Si abrís el correo en otro dispositivo, `localhost` apunta a ese dispositivo: para ese caso necesitás una URL HTTPS accesible para el frontend.

## Archivos y responsabilidades

| Ruta desde la raíz | Responsabilidad |
| --- | --- |
| `backend/sql/password_reset.sql` | Columna de versión de sesión y tabla de tokens |
| `backend/src/services/password_reset.rs` | Token aleatorio, hash SHA-256, URL y límites de trabajo |
| `backend/src/repositories/password_reset.rs` | Límites por cuenta y cambio atómico de contraseña |
| `backend/src/handlers/password_reset.rs` | Solicitud y confirmación de recuperación |
| `backend/src/routes/auth.rs` | Registra ambos endpoints públicos |
| `backend/src/services/email.rs` | Correo con enlace y aviso de cambio confirmado |
| `backend/src/auth/claims.rs`, `jwt.rs`, `auth_user.rs` | Revoca sesiones anteriores al cambiar contraseña |
| `backend/src/repositories/user.rs` | Invalida sesiones/enlaces tras cambios administrativos de contraseña, email o estado |
| `backend/src/main.rs` | Inicializa el servicio |
| `frontend/src/pages/login/index.astro` | Enlace de recuperación en el login |
| `frontend/src/pages/login/recuperar/index.astro` | Pantalla para pedir el correo |
| `frontend/src/pages/login/restablecer/index.astro` | Pantalla para elegir y confirmar contraseña |
| `frontend/src/components/Login/PasswordRecovery.astro` | Formularios, mensajes y validación |
| `frontend/src/api/passwordRecovery.ts` | Llamadas a la API |
| `frontend/src/style/login.css` | Estilo compartido con el login |

## Contrato de la API

`POST /auth/forgot-password`, JSON:

```json
{ "identifier": "mi_usuario_o_correo" }
```

Devuelve `202` con el mismo mensaje para una cuenta activa, inexistente, inactiva o que alcanzó el límite por cuenta. No confirma si un usuario existe ni si el correo se entregó. Se busca el username exacto o el correo sin distinguir mayúsculas. Si varias cuentas coinciden, no se elige una arbitrariamente; usá el username para desambiguar.

`POST /auth/reset-password`, JSON:

```json
{
  "token": "token_del_enlace",
  "password": "nueva contraseña",
  "password_confirmation": "nueva contraseña"
}
```

Devuelve `200` al completar el cambio o `400` si el enlace venció, ya fue usado o las contraseñas son inválidas. Los endpoints limitan el cuerpo a 4 KiB y no necesitan un JWT. La contraseña debe tener entre 8 y 128 caracteres; se almacena con Argon2, igual que el login existente.

## Comportamiento y límites

- Token aleatorio de 32 bytes; en PostgreSQL se guarda únicamente su hash SHA-256.
- Vence a los **30 minutos** y se puede usar una sola vez. Completar el cambio invalida todos los enlaces pendientes de esa cuenta y todas sus sesiones anteriores.
- Se comprueba que la cuenta siga activa, conserve el correo original y tenga la misma versión de autenticación. Cambiar email, contraseña o estado desde administración también invalida los accesos previos.
- Se emite como máximo **un enlace por minuto y tres por hora por cuenta**. Los límites se coordinan en PostgreSQL mediante bloqueo del usuario. Pedir otro enlace no invalida el anterior hasta que uno se use o venza.
- Límite adicional compartido entre ambos endpoints: **30 solicitudes por minuto por proceso**. Como máximo cuatro tareas de envío y dos cálculos de hash simultáneos. Respuestas `429` o `503` permiten intentar nuevamente más tarde.
- El token viaja en el fragmento `#token=...` del enlace y se quita de la barra al cargar. No se guarda en localStorage. Si recargás la pantalla, abrí nuevamente el correo. Los logs de recuperación no incluyen tokens, contraseñas ni direcciones de correo.
- El JWT incorpora `auth_version`; los JWT anteriores se interpretan como versión `0`, compatible con las cuentas existentes tras la migración. No hace falta cambiar `JWT_SECRET`.
- El envío SMTP se hace en segundo plano para no revelar cuentas por el tiempo de respuesta. **No es una cola persistente**: si el proceso se reinicia antes del envío, solicitá otro enlace pasado un minuto. Ante un error de envío se invalida ese token y se registra la etapa, sin credenciales. Revisá spam y la configuración SMTP si no llegan correos.
- Después del cambio se intenta enviar un aviso al correo de la cuenta. Un fallo en ese aviso no revierte una contraseña ya actualizada.

## Verificación

Desde `backend/`:

```powershell
cargo check
cargo test
```

La prueba de base de datos está ignorada por defecto para que nunca use la base real por accidente. Con una base **descartable**, que permita crear esquemas, podés ejecutar:

```powershell
$env:PASSWORD_RESET_TEST_DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/seno_test"
cargo test recovery_database_lifecycle -- --ignored
```

La prueba crea un esquema aleatorio, aplica la migración dos veces y comprueba límites, expiración, cuenta inactiva, email modificado, rollback, uso único, revocación y solicitudes simultáneas. Lo elimina al terminar correctamente. Nunca consulta `DATABASE_URL`. Si una aserción falla, puede quedar el esquema `reset_test_*` para inspección en esa base descartable.

Por defecto usa cuatro conexiones para probar concurrencia en PostgreSQL. Se puede limitar el pool con `PASSWORD_RESET_TEST_CONNECTIONS=1`; esa variante verifica el ciclo secuencial, pero no sustituye la prueba de bloqueos concurrentes en PostgreSQL. Para entornos PGlite, el puente de protocolo debe ser compatible con SQLx también al recibir errores de SQL.

Desde `frontend/`, con su `PUBLIC_API_URL` de desarrollo:

```powershell
npm ci
npm run build
```

Comprobación manual con correo real (no se ejecuta automáticamente):

1. En `/login/`, abrí **¿Olvidaste tu contraseña?** y solicitá un enlace con tu username.
2. Confirmá que el correo llegue a `users.email`, nunca al correo de voluntariado.
3. Abrí el enlace. Verificá la confirmación de contraseña y el mensaje de éxito.
4. Iniciá sesión con la contraseña nueva; la anterior debe fallar. Una sesión que estuviera abierta debe quedar inválida al hacer su siguiente petición protegida.
5. Intentá reutilizar el mismo enlace: debe rechazarse. Una cuenta inexistente debe recibir el mismo mensaje inicial, sin enviar correo.
6. Comprobá un enlace vencido y una cuenta desactivada en una base de prueba. Verificá también la llegada del aviso de contraseña modificada.
