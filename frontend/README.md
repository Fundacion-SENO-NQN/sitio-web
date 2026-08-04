# Paquete SEO — Fundación SENO

## Contenido

- Reemplazos completos de todas las páginas públicas entregadas.
- `noticias/[id].astro` convertido a renderizado bajo demanda, con estados 404/503 y `NewsArticle`.
- `eventos/[id].astro` con estados 404/503 y `Event` cuando la API entrega datos estructurados.
- Listados dinámicos de noticias, eventos, equipo y logros con `503` y `noindex` durante fallas de API.
- Página correcta de donaciones materiales en `quiero-ayudar/donar-cosas`.
- Títulos SEO específicos para las páginas públicas.
- `src/utils/seo.ts`.
- `src/pages/sitemap-dynamic.xml.ts`.
- `src/components/SEO/JsonLd.astro`.
- `public/robots.txt` con ambos sitemaps.
- `LAYOUT_PATCH.md` con las propiedades que debe aceptar el layout público.

## Instalación

1. Hacé una copia de seguridad del proyecto.
2. Copiá `src/` y `public/` sobre la raíz del proyecto.
3. Integrá `LAYOUT_PATCH.md` en tu `src/layouts/Layout.astro` existente.
4. Confirmá que existen:
   - `public/img/seo/logo-fundacion-seno.png`
   - `public/img/seo/og-fundacion-seno.jpg`
5. Ejecutá:

```bash
npm run build
```

## Datos necesarios para que aparezca `Event`

El código no inventa fechas ni direcciones. El JSON-LD `Event` se genera únicamente cuando la API devuelve:

```ts
start_at
end_at
location_name
street_address
address_locality
address_region
address_country
postal_code
image_url o image_urls
event_status
previous_start_at
```

Los campos son opcionales para que la página siga funcionando con el modelo actual. Hasta incorporarlos al backend, el evento tendrá metadatos normales y breadcrumbs, pero no emitirá un `Event` incompleto.

## Respuestas HTTP esperadas

- Contenido existente: `200`.
- ID inexistente: `404` y `noindex`.
- API temporalmente caída: `503` y `noindex`.
- Login/plataforma: deben seguir usando `noindex` desde `LayoutLogin.astro` y `LayoutPlataforma.astro`.

## Sitemap

Después de desplegar, verificá:

```text
https://fundacionseno.org/sitemap-index.xml
https://fundacionseno.org/sitemap-dynamic.xml
```
