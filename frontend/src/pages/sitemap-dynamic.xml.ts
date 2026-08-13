import type { APIRoute } from 'astro'

export const prerender = false

interface SitemapItem {
  id: number
  created_at?: string | null
  updated_at?: string | null
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function normalizeLastModified(
  value: string | null | undefined
): string | null {
  if (!value) return null

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function isValidItem(value: unknown): value is SitemapItem {
  if (!value || typeof value !== 'object') return false

  const id = Number((value as SitemapItem).id)

  return Number.isInteger(id) && id > 0
}

export const GET: APIRoute = async ({ site }) => {
  const API_URL = (
    import.meta.env.PUBLIC_API_URL ?? 'https://sitio-web-fundacion-seno.fly.dev'
  ).replace(/\/+$/, '')

  const siteURL = site ?? new URL('https://fundacionseno.org')

  try {
    const [newsResponse, eventsResponse] = await Promise.all([
      fetch(`${API_URL}/noticias`),
      fetch(`${API_URL}/eventos`)
    ])

    if (!newsResponse.ok || !eventsResponse.ok)
      throw new Error('No se pudieron obtener los contenidos dinámicos')

    const newsData: unknown = await newsResponse.json()
    const eventsData: unknown = await eventsResponse.json()

    const news = Array.isArray(newsData) ? newsData.filter(isValidItem) : []

    const events = Array.isArray(eventsData)
      ? eventsData.filter(isValidItem)
      : []

    const entries = [
      ...news.map((item) => ({
        location: new URL(`/noticias/${item.id}`, siteURL).href,
        lastModified: normalizeLastModified(item.updated_at ?? item.created_at)
      })),
      ...events.map((item) => ({
        location: new URL(`/eventos/${item.id}`, siteURL).href,
        lastModified: normalizeLastModified(item.updated_at ?? item.created_at)
      }))
    ]

    const urls = entries
      .map(
        ({ location, lastModified }) => `
  <url>
    <loc>${escapeXml(location)}</loc>${
      lastModified
        ? `
    <lastmod>${escapeXml(lastModified)}</lastmod>`
        : ''
    }
  </url>`
      )
      .join('')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`

    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control':
          'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'
      }
    })
  } catch (error) {
    console.error('No se pudo generar el sitemap dinámico:', error)

    return new Response('No se pudo generar el sitemap.', {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex'
      }
    })
  }
}
