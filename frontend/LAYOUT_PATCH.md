# Cambios necesarios en `src/layouts/Layout.astro`

Las páginas del paquete utilizan estas propiedades:

```astro
interface Props {
  pag: string
  seoTitle?: string
  description?: string
  image?: string
  imageAlt?: string
  noindex?: boolean
  ogType?: 'website' | 'article'
  publishedTime?: string | null
  modifiedTime?: string | null
}
```

Integralas con las propiedades que ya tenga tu layout:

```astro
const {
  pag,
  seoTitle,
  description =
    'Fundación SENO acompaña a niños, niñas y adolescentes con cáncer y a sus familias en Neuquén.',
  image = '/img/seo/og-fundacion-seno.jpg',
  imageAlt = 'Fundación SENO de Neuquén',
  noindex = false,
  ogType = 'website',
  publishedTime = null,
  modifiedTime = null
} = Astro.props

const site = Astro.site ?? new URL('https://fundacionseno.org')
const siteName = 'Fundación SENO'

const title =
  seoTitle ??
  (pag === 'Inicio'
    ? 'Fundación SENO Neuquén | Acompañamiento oncológico'
    : `${pag} | ${siteName}`)

const canonicalURL = new URL(Astro.url.pathname, site)
const socialImageURL = new URL(image, site)
```

Dentro de `<head>`, dejá una sola copia de cada etiqueta:

```astro
<title>{title}</title>

<meta name="description" content={description} />
<link rel="canonical" href={canonicalURL} />

<meta
  name="robots"
  content={
    noindex
      ? 'noindex, nofollow, noarchive'
      : 'index, follow, max-image-preview:large'
  }
/>

<meta property="og:type" content={ogType} />
<meta property="og:locale" content="es_AR" />
<meta property="og:site_name" content={siteName} />
<meta property="og:title" content={title} />
<meta property="og:description" content={description} />
<meta property="og:url" content={canonicalURL} />
<meta property="og:image" content={socialImageURL} />
<meta property="og:image:alt" content={imageAlt} />

{
  ogType === 'article' && publishedTime && (
    <meta property="article:published_time" content={publishedTime} />
  )
}

{
  ogType === 'article' && modifiedTime && (
    <meta property="article:modified_time" content={modifiedTime} />
  )
}

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content={title} />
<meta name="twitter:description" content={description} />
<meta name="twitter:image" content={socialImageURL} />
<meta name="twitter:image:alt" content={imageAlt} />
```

No reemplaces el resto del layout: conservá tus imports, `<Header />`, `<Footer />`, estilos y `<slot />` actuales.
