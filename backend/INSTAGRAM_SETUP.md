# Instagram de donaciones: instalación

Rutas relativas a la raíz del repositorio `sitio-web`.

## 1. Meta

En la aplicación de Meta, elegí **Instagram API with Instagram Login** y configurá:

- Cuenta profesional de la Fundación (Business o Creator).
- URL de redirección OAuth exacta: `https://api.fundacionseno.org/auth/instagram/callback`.
- Permisos: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`.
- Si la app está en modo desarrollo, el usuario que conecta la cuenta debe tener el rol de prueba requerido y aceptar la invitación.
- Para otros usuarios, completá la revisión de permisos que Meta exija.

El botón «Cambiar cuenta» reinicia el OAuth. Si Instagram mantiene una sesión abierta, puede volver a autorizar la misma cuenta: cerrá sesión en Instagram antes si querés cambiarla.

## 2. Base de datos

Ejecutá **una vez** `backend/sql/instagram.sql` en Supabase SQL Editor. No borres conexiones existentes. Esta migración presupone la tabla `public.users(id)` ya usada por el backend.

## 3. Variables del backend

En el directorio `backend`, usá `.env` solo para desarrollo local. En Fly configurá secretos, por ejemplo:

```sh
fly secrets set INSTAGRAM_APP_ID=... INSTAGRAM_APP_SECRET=... SOCIAL_TOKEN_KEY=... INSTAGRAM_REDIRECT_URI=https://api.fundacionseno.org/auth/instagram/callback INSTAGRAM_FRONTEND_RETURN_URL=https://fundacionseno.org/plataforma/imagenes-donacion/ INSTAGRAM_IMAGE_BASE_URL=https://TU-DOMINIO-PUBLICO-DE-R2 INSTAGRAM_API_VERSION=v26.0
```

`SOCIAL_TOKEN_KEY` son **64 caracteres hexadecimales** que representan 32 bytes aleatorios; por ejemplo, generala con `openssl rand -hex 32`. Conservá la misma clave tras despliegues: cambiarla hace ilegibles los tokens anteriores. No la pongas en Astro, `fly.toml`, GitHub ni en SQL.

`INSTAGRAM_IMAGE_BASE_URL` debe ser la raíz pública **HTTPS** del bucket de R2 ya utilizado para `img_donaciones`. Comprobá que Meta pueda hacer GET desde internet a `https://TU-DOMINIO-PUBLICO-DE-R2/instagram-temp/…jpg`; no sirven URLs privadas de S3 ni presigned de corta duración. El backend crea esos objetos cuando se publica y los elimina después o al cabo de 48 horas. No uses `api.fundacionseno.org` para las fotos salvo que ese dominio sirva el bucket.

El frontend existente ya usa `PUBLIC_API_URL` para llamar al backend. `CORS_ALLOWED_ORIGINS` debe incluir el origen exacto del administrador, por ejemplo `https://fundacionseno.org`, y también el origen de desarrollo si se usa localmente. Para OAuth local registrá en Meta otro redirect HTTPS accesible y ajustá las variables correspondientes; `localhost` no funciona como URL pública de imagen de Meta.

`backend/fly.toml` fija `min_machines_running = 1` para ejecutar la renovación de tokens cada 12 horas, lo que puede aumentar el costo de Fly. Si se vuelve a 0, un backend dormido más de 60 días no puede renovar el token y habrá que reconectar Instagram.

## 4. Uso y resultado

1. Desplegá la base de datos y el backend con las variables anteriores.
2. Entrá a `/plataforma/imagenes-donacion/` con una cuenta que tenga `upload_img_donacion`.
3. Conectá Instagram y comprobá que la tarjeta muestre el usuario correcto.
4. Subí 1 imagen de prueba: crea una publicación. Subí 2–10: crea un único carrusel.
5. El endpoint nuevo es `POST /donaciones/img/lote` (multipart: `images` repetido, `title`, `description`, `publish_instagram`, `instagram_comments_enabled`, `request_id` UUID). El endpoint anterior `PUT /donaciones/img` sigue disponible.
6. Si la respuesta dice `instagram_status: unknown`, **consultá la cuenta de Instagram antes de repetir**: puede haberse publicado aunque la API agotara el tiempo de espera. El estado de una petición se consulta en `GET /donaciones/img/lote/{request_id}`. El administrador muestra el código si pierde la conexión.

La carga modifica primero las posiciones AVIF de la web y después intenta publicar en Instagram. No existe transacción distribuida con Meta: un error de Instagram no revierte la web. El backend conserva durante 48 horas los JPEG de intentos inciertos para permitir diagnóstico.

Para probar conexión y subida sin afectar contenido real, usá una cuenta y un entorno de pruebas: ambas operaciones producen cambios visibles y no hay modo de simulación incorporado.
