# Perfil propio (issue #43)

El inicio ofrece **Mi cuenta → Mi perfil / Cambiar contraseña / Cerrar sesión**.
La pantalla está en `/plataforma/perfil/` y no requiere un servicio ni un rol
administrativo. Permite editar nombre, apellido, usuario y correo. El rol es
solo informativo.

## Instalación

1. Desplegar el backend de `43-agregar-control-de-perfil`.
2. Publicar el frontend de la misma rama.

No hay variables nuevas ni migraciones nuevas. Se reutiliza `users.auth_version`
de la recuperación de contraseña, que ya debe estar aplicada. El correo de aviso
de cambio de contraseña usa la configuración SMTP existente.

## API

Todas las rutas requieren `Authorization: Bearer <token>` y responden con
`Cache-Control: no-store`. El usuario se obtiene del JWT validado, nunca de un ID
enviado en la URL o el cuerpo.

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/profile` | Datos propios, sin hash ni versión de autenticación |
| GET | `/profile/permissions` | Servicios de la sesión actual; reemplaza la consulta administrativa del inicio |
| PATCH | `/profile` | `username`, `email`, `name`, `last_name`, `current_password` |
| PATCH | `/profile/password` | `current_password`, `password`, `password_confirmation` |

`PATCH /profile` devuelve `{user, reauthenticate}`. Si cambia usuario o correo,
incrementa `auth_version` y requiere iniciar sesión de nuevo. Cambiar solo nombre
o apellido mantiene la sesión. Todos los cambios requieren la contraseña actual.

El cambio de contraseña responde 204 después de confirmar la escritura. Incrementa
`auth_version`, por lo que invalida los JWT y enlaces de recuperación anteriores.
La notificación por correo es secundaria: un error SMTP no deshace el cambio.
El cierre de sesión del menú borra los datos de sesión de este navegador, como
el cierre de sesión anterior.

Los DTO rechazan campos adicionales (incluidos `id`, `role_id`, `active` y
`auth_version`). Las escrituras comprueban en la misma operación SQL la versión,
el hash anterior y el estado activo. Los duplicados de usuario/correo devuelven
409; una contraseña actual incorrecta devuelve 400 sin expulsar al usuario.
El límite es 5 verificaciones por minuto y cuenta **por proceso**; se comparte
el límite de trabajos Argon2 de la recuperación. El cuerpo máximo es de 8 KiB.

## Verificación

```sh
cd backend
cargo check
cargo test
```

La prueba de base de datos usa un esquema temporal con UUID y una base descartable
indicada explícitamente; nunca usa `DATABASE_URL`:

```powershell
$env:PROFILE_TEST_DATABASE_URL = "postgres://usuario:clave@localhost/base_de_pruebas"
cargo test profile_database_lifecycle -- --ignored
```

Con PostgreSQL real usa cuatro conexiones para comprobar escrituras concurrentes.
Para una implementación de pruebas de una sola conexión se puede configurar
`PROFILE_TEST_CONNECTIONS=1`.

Comprobar en navegador con una cuenta activa sin permiso de administrar usuarios:

- El inicio carga sus servicios (o el estado vacío) y muestra Mi cuenta.
- El menú funciona con teclado, Escape y clic fuera, también en móvil.
- Se guardan nombre y apellido y se actualiza el saludo al volver al inicio.
- Contraseña actual incorrecta, correo inválido y usuario/correo duplicados no se guardan.
- Al cambiar contraseña se exige confirmación, se cierran las sesiones y solo sirve la nueva.
- Cambiar correo o usuario exige volver a ingresar; rol y permisos no son editables.
- Cerrar sesión elimina los datos locales y vuelve al login.

El build estático puede comprobarse con `npm ci && npm run build` en `frontend`.

Validación de esta implementación: `cargo build` y las siete pruebas unitarias
pasaron; también pasó `profile_database_lifecycle` sobre PGlite con una conexión.
Se ejercitaron las rutas reales de Axum con JWT, usuarios sin permiso administrativo,
contraseña actual incorrecta, campos prohibidos, límite de cuerpo, revocación y
límite de intentos. Para ese ensayo se limitó temporalmente el pool a una conexión
por las limitaciones del adaptador de pruebas; la configuración de producción
permanece igual. No se verificó concurrencia sobre un servidor PostgreSQL real.

El build de Astro generó 33 páginas y las pruebas de navegador pasaron en escritorio
y móvil. El chequeo general `astro-check` conserva seis errores preexistentes de
`number` frente a `string` en `frontend/src/data/historia/historia.ts`, sin errores
en los archivos del perfil. El envío de avisos mediante el SMTP real queda para la
prueba de despliegue.
