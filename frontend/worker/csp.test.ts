import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyCsp,
  generateNonce,
  isEligibleHtmlResponse,
  parseCspDirectives,
  transformCspPolicy
} from './csp'
import worker from './index'

type ElementHandler = {
  element?: (element: {
    getAttribute(name: string): string | null
    remove(): void
  }) => void
}

/**
 * Minimal jsdom-backed HTMLRewriter test double so unit tests can exercise
 * `applyCsp()` in Vitest without requiring a full workerd process per test.
 * Real workerd HTMLRewriter behavior is verified separately via Wrangler.
 */
class TestHTMLRewriter {
  private readonly handlers: Array<{
    selector: string
    handler: ElementHandler
  }> = []

  on(selector: string, handler: ElementHandler): this {
    this.handlers.push({ selector, handler })
    return this
  }

  transform(response: Response): Response {
    const handlers = [...this.handlers]
    const transformedBody = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const originalHtml = await response.text()
          const parser = new DOMParser()
          const doc = parser.parseFromString(originalHtml, 'text/html')

          for (const { selector, handler } of handlers) {
            if (!handler.element) {
              continue
            }

            const elements = Array.from(doc.querySelectorAll(selector))
            for (const node of elements) {
              handler.element({
                getAttribute: (name: string) => node.getAttribute(name),
                remove: () => {
                  node.remove()
                }
              })
            }
          }

          const hasDoctype = /^\s*<!doctype\s+html>/i.test(originalHtml)
          const serialized = `${hasDoctype ? '<!DOCTYPE html>' : ''}${doc.documentElement.outerHTML}`
          controller.enqueue(new TextEncoder().encode(serialized))
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      }
    })

    return new Response(transformedBody, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers)
    })
  }
}

const ASTRO_META_CSP =
  "default-src 'self';img-src 'self' data: blob: https://media.fundacionseno.org;font-src 'self' data:;connect-src 'self' https://api.fundacionseno.org;frame-src 'self' https://www.google.com https://maps.google.com; script-src 'self' 'sha256-Wm74oWG60yrm0SYg1dSCTj7CbI+QAgYfnmSlEg5BYaM=' 'sha256-fu+9GB/w0uZeVFBYp2XhUknleTBVYJo+Wt0fM6eIcNU='; style-src 'self' 'sha256-MFf3ML6jk65uEtXg0e4gm81qtCSXL3dIIEU9OQvwI7w=' 'sha256-Z+dBf1IbdShx+B4lNtUok6DWiycF+D/g3xYU3KfJUeg=';"

const BASE_SECURITY_CSP =
  "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests"

function createHtmlDocument(metaContent?: string, bodyHtml = '<main>Hola</main>'): string {
  const metaTag =
    metaContent !== undefined
      ? `<meta http-equiv="content-security-policy" content="${metaContent}">`
      : ''

  return `<!DOCTYPE html><html lang="es-AR"><head><meta charset="UTF-8"><title>Fundación SENO</title>${metaTag}</head><body>${bodyHtml}</body></html>`
}

function extractNonce(cspHeader: string | null): string | null {
  if (!cspHeader) {
    return null
  }

  const match = cspHeader.match(/'nonce-([^']+)'/)
  return match?.[1] ?? null
}

beforeEach(() => {
  vi.stubGlobal('HTMLRewriter', TestHTMLRewriter)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseCspDirectives', () => {
  it('parses valid directives, normalizes directive names, and enforces first-directive-wins', () => {
    const parsed = parseCspDirectives(
      "Default-Src 'self'; script-src 'self' 'sha256-abc='; script-src 'unsafe-inline'; upgrade-insecure-requests;"
    )

    expect(parsed).not.toBeNull()
    expect(parsed?.get('default-src')).toEqual(["'self'"])
    expect(parsed?.get('script-src')).toEqual(["'self'", "'sha256-abc='"])
    expect(parsed?.get('upgrade-insecure-requests')).toEqual([])
  })

  it('rejects empty, multi-policy, control-character, and malformed policies', () => {
    expect(parseCspDirectives('')).toBeNull()
    expect(parseCspDirectives('   ; ;  ')).toBeNull()
    expect(parseCspDirectives("default-src 'self'\r\nX-Injected: 1")).toBeNull()
    expect(parseCspDirectives("default-src 'self', script-src 'none'")).toBeNull()
    expect(parseCspDirectives("invalid_name! 'self'")).toBeNull()
  })
})

describe('transformCspPolicy', () => {
  it('preserves all Astro directives and hashes, inserts the nonce, and enforces script-src-attr none', () => {
    const nonce = 'testNonceValue123456=='
    const transformed = transformCspPolicy(ASTRO_META_CSP, nonce)

    expect(transformed).not.toBeNull()
    expect(transformed?.directives.get('default-src')).toEqual(["'self'"])
    expect(transformed?.directives.get('img-src')).toEqual([
      "'self'",
      'data:',
      'blob:',
      'https://media.fundacionseno.org'
    ])
    expect(transformed?.directives.get('connect-src')).toEqual([
      "'self'",
      'https://api.fundacionseno.org'
    ])
    expect(transformed?.directives.get('script-src')).toEqual([
      "'self'",
      "'sha256-Wm74oWG60yrm0SYg1dSCTj7CbI+QAgYfnmSlEg5BYaM='",
      "'sha256-fu+9GB/w0uZeVFBYp2XhUknleTBVYJo+Wt0fM6eIcNU='",
      `'nonce-${nonce}'`
    ])
    expect(transformed?.directives.get('style-src')).toEqual([
      "'self'",
      "'sha256-MFf3ML6jk65uEtXg0e4gm81qtCSXL3dIIEU9OQvwI7w='",
      "'sha256-Z+dBf1IbdShx+B4lNtUok6DWiycF+D/g3xYU3KfJUeg='"
    ])
    expect(transformed?.directives.get('script-src-attr')).toEqual(["'none'"])
    expect(transformed?.headerValue).not.toContain("'unsafe-inline'")
    expect(transformed?.headerValue).not.toContain("'unsafe-eval'")
  })

  it('adds the nonce to script-src-elem when present', () => {
    const transformed = transformCspPolicy(
      "default-src 'self'; script-src 'self'; script-src-elem 'self' 'sha256-abc='",
      'elemNonce=='
    )

    expect(transformed?.directives.get('script-src')).toEqual([
      "'self'",
      "'nonce-elemNonce=='"
    ])
    expect(transformed?.directives.get('script-src-elem')).toEqual([
      "'self'",
      "'sha256-abc='",
      "'nonce-elemNonce=='"
    ])
    expect(transformed?.directives.get('script-src-attr')).toEqual(["'none'"])
  })

  it('respects CSP3 fallback semantics when script-src is absent', () => {
    const fromNone = transformCspPolicy("default-src 'none'", 'nonceA==')
    expect(fromNone?.directives.get('script-src')).toEqual(["'nonce-nonceA=='"])

    const fromCdn = transformCspPolicy(
      "default-src 'self' https://cdn.fundacionseno.org",
      'nonceB=='
    )
    expect(fromCdn?.directives.get('script-src')).toEqual([
      "'self'",
      'https://cdn.fundacionseno.org',
      "'nonce-nonceB=='"
    ])

    const withoutDefault = transformCspPolicy("img-src 'self'", 'nonceC==')
    expect(withoutDefault?.directives.get('script-src')).toEqual([
      "'self'",
      "'nonce-nonceC=='"
    ])
  })

  it('removes keyword none when adding a nonce to script-src none', () => {
    const transformed = transformCspPolicy(
      "default-src 'self'; script-src 'none'",
      'nonceOnly=='
    )

    expect(transformed?.directives.get('script-src')).toEqual([
      "'nonce-nonceOnly=='"
    ])
  })
})

describe('generateNonce', () => {
  it('generates cryptographically random unique base64 nonces', () => {
    const first = generateNonce()
    const second = generateNonce()

    expect(first).not.toBe(second)
    expect(first).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)
    expect(first.length).toBeGreaterThanOrEqual(40)
  })
})

describe('applyCsp', () => {
  it('leaves non-HTML responses completely untouched', async () => {
    const jsResponse = new Response('console.log("ok")', {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: '"abc123"',
        'Content-Length': '17'
      }
    })

    const result = await applyCsp(jsResponse)

    expect(result).toBe(jsResponse)
    expect(result.headers.get('Content-Security-Policy')).toBeNull()
    expect(result.headers.get('Cache-Control')).toBe(
      'public, max-age=31536000, immutable'
    )
    expect(result.headers.get('ETag')).toBe('"abc123"')
    expect(result.headers.get('Content-Length')).toBe('17')
  })

  it('transforms Astro HTML responses, removes the CSP meta tag, sets headers, and preserves hashes', async () => {
    const html = createHtmlDocument(
      ASTRO_META_CSP,
      '<script type="module" src="/_astro/app.js"></script><script>inline()</script>'
    )
    const response = new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': String(html.length),
        'Content-Encoding': 'gzip',
        ETag: '"html-etag"',
        'Cache-Control': 'public, max-age=60',
        'X-Frame-Options': 'DENY',
        'Set-Cookie': 'pref=light; Path=/; Secure'
      }
    })

    const result = await applyCsp(response)
    const outputHtml = await result.text()
    const csp = result.headers.get('Content-Security-Policy')
    const nonce = extractNonce(csp)

    expect(result.status).toBe(200)
    expect(nonce).not.toBeNull()
    expect(csp).toContain("'sha256-Wm74oWG60yrm0SYg1dSCTj7CbI+QAgYfnmSlEg5BYaM='")
    expect(csp).toContain("'sha256-MFf3ML6jk65uEtXg0e4gm81qtCSXL3dIIEU9OQvwI7w='")
    expect(csp).toContain("script-src-attr 'none'")
    expect(csp).not.toContain("'unsafe-inline'")
    expect(csp).not.toContain("'unsafe-eval'")

    // Meta tag removed, unrelated meta tags preserved, scripts NOT blindly nonced.
    expect(outputHtml).not.toContain('content-security-policy')
    expect(outputHtml).toContain('<meta charset="UTF-8">')
    expect(outputHtml).not.toContain(`nonce="${nonce}"`)

    // Invalidated headers deleted, caching disabled, unrelated headers preserved.
    expect(result.headers.get('Content-Length')).toBeNull()
    expect(result.headers.get('Content-Encoding')).toBeNull()
    expect(result.headers.get('ETag')).toBeNull()
    expect(result.headers.get('Cache-Control')).toBe('no-store')
    expect(result.headers.get('X-Frame-Options')).toBe('DENY')
    expect(result.headers.get('Set-Cookie')).toBe('pref=light; Path=/; Secure')
  })

  it('produces unique nonces across consecutive requests', async () => {
    const html = createHtmlDocument(ASTRO_META_CSP)

    const first = await applyCsp(
      new Response(html, { headers: { 'Content-Type': 'text/html' } })
    )
    const second = await applyCsp(
      new Response(html, { headers: { 'Content-Type': 'text/html' } })
    )

    const firstNonce = extractNonce(first.headers.get('Content-Security-Policy'))
    const secondNonce = extractNonce(second.headers.get('Content-Security-Policy'))

    expect(firstNonce).toBeTruthy()
    expect(secondNonce).toBeTruthy()
    expect(firstNonce).not.toBe(secondNonce)
  })

  it('merges disjoint _headers CSP cleanly without discarding base security directives', async () => {
    const response = new Response(createHtmlDocument(ASTRO_META_CSP), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': BASE_SECURITY_CSP
      }
    })

    const result = await applyCsp(response)
    const csp = result.headers.get('Content-Security-Policy')

    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).toContain('upgrade-insecure-requests')
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src-attr 'none'")
    expect(extractNonce(csp)).toBeTruthy()
    expect(csp).not.toContain(',')
  })

  it('preserves overlapping existing CSP headers without weakening them', async () => {
    const existingStrict = "default-src 'none'; img-src 'self'"
    const response = new Response(createHtmlDocument(ASTRO_META_CSP), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': existingStrict
      }
    })

    const result = await applyCsp(response)
    const csp = result.headers.get('Content-Security-Policy')

    expect(csp).toContain(existingStrict)
    expect(csp).toContain("script-src-attr 'none'")
    expect(extractNonce(csp)).toBeTruthy()
    // Enforced as two separate policies so neither policy weakens the other.
    expect(csp).toContain(`${existingStrict}, `)
  })

  it('fails closed when HTML is missing a CSP meta tag', async () => {
    const withoutHeader = await applyCsp(
      new Response(createHtmlDocument(undefined), {
        headers: { 'Content-Type': 'text/html' }
      })
    )
    const fallbackCsp = withoutHeader.headers.get('Content-Security-Policy')

    expect(fallbackCsp).toContain("default-src 'self'")
    expect(fallbackCsp).toContain("script-src 'self'")
    expect(fallbackCsp).toContain("script-src-attr 'none'")
    expect(fallbackCsp).toContain("object-src 'none'")
    expect(fallbackCsp).toContain("frame-ancestors 'none'")
    expect(extractNonce(fallbackCsp)).toBeNull()
    expect(withoutHeader.headers.get('Cache-Control')).toBe('no-store')

    const withBaseHeaders = await applyCsp(
      new Response(createHtmlDocument(undefined), {
        headers: {
          'Content-Type': 'text/html',
          'Content-Security-Policy': BASE_SECURITY_CSP
        }
      })
    )
    const mergedFallback = withBaseHeaders.headers.get('Content-Security-Policy')

    expect(mergedFallback).toContain("frame-ancestors 'none'")
    expect(mergedFallback).toContain("script-src 'self'")
    expect(mergedFallback).toContain("script-src-attr 'none'")
    expect(extractNonce(mergedFallback)).toBeNull()

    const withExistingFullPolicy = await applyCsp(
      new Response(createHtmlDocument(undefined), {
        headers: {
          'Content-Type': 'text/html',
          'Content-Security-Policy': "default-src 'none'; script-src 'self'"
        }
      })
    )

    expect(withExistingFullPolicy.headers.get('Content-Security-Policy')).toBe(
      "default-src 'none'; script-src 'self'"
    )
  })

  it('keeps malformed CSP meta tags in place and fails closed without issuing a nonce', async () => {
    const malformedHtml = createHtmlDocument("invalid_dir! 'self'")
    const response = new Response(malformedHtml, {
      headers: { 'Content-Type': 'text/html' }
    })

    const result = await applyCsp(response)
    const outputHtml = await result.text()
    const csp = result.headers.get('Content-Security-Policy')

    expect(outputHtml).toContain('content-security-policy')
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("script-src-attr 'none'")
    expect(extractNonce(csp)).toBeNull()
    expect(result.headers.get('Cache-Control')).toBe('no-store')
  })

  it('ignores CSP meta tags injected outside <head>', async () => {
    const htmlWithBodyMeta = createHtmlDocument(
      undefined,
      '<meta http-equiv="content-security-policy" content="script-src \'unsafe-inline\'">'
    )
    const result = await applyCsp(
      new Response(htmlWithBodyMeta, { headers: { 'Content-Type': 'text/html' } })
    )
    const csp = result.headers.get('Content-Security-Policy')

    expect(csp).not.toContain("'unsafe-inline'")
    expect(csp).toContain("script-src 'self'")
    expect(extractNonce(csp)).toBeNull()
  })

  it('passes through redirects, 204, and 304 responses untouched', async () => {
    const redirect = new Response(null, {
      status: 307,
      headers: {
        Location: '/eventos/',
        'Content-Type': 'text/html'
      }
    })
    const notModified = new Response(null, {
      status: 304,
      headers: {
        'Content-Type': 'text/html',
        ETag: '"v1"'
      }
    })
    const noContent = new Response(null, {
      status: 204,
      headers: { 'Content-Type': 'text/html' }
    })

    expect(isEligibleHtmlResponse(redirect)).toBe(false)
    expect(isEligibleHtmlResponse(notModified)).toBe(false)
    expect(isEligibleHtmlResponse(noContent)).toBe(false)

    expect(await applyCsp(redirect)).toBe(redirect)
    expect(await applyCsp(notModified)).toBe(notModified)
    expect(await applyCsp(noContent)).toBe(noContent)
  })

  it('transforms HTML 404 and 503 error pages while preserving status codes', async () => {
    const notFound = await applyCsp(
      new Response(createHtmlDocument(ASTRO_META_CSP), {
        status: 404,
        statusText: 'Not Found',
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': BASE_SECURITY_CSP
        }
      })
    )

    expect(notFound.status).toBe(404)
    expect(notFound.headers.get('Cache-Control')).toBe('no-store')
    expect(extractNonce(notFound.headers.get('Content-Security-Policy'))).toBeTruthy()
    expect(await notFound.text()).not.toContain('content-security-policy')
  })

  it('handles null-body HTML responses safely without throwing', async () => {
    const emptyHtml = await applyCsp(
      new Response(null, {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          ETag: '"empty"'
        }
      })
    )

    expect(emptyHtml.status).toBe(200)
    expect(emptyHtml.body).toBeNull()
    expect(emptyHtml.headers.get('ETag')).toBeNull()
    expect(emptyHtml.headers.get('Cache-Control')).toBe('no-store')
    expect(emptyHtml.headers.get('Content-Security-Policy')).toContain(
      "script-src 'self'"
    )
  })
})

describe('worker fetch handler', () => {
  it('returns full CSP headers and empty body for HEAD requests on HTML pages', async () => {
    const html = createHtmlDocument(ASTRO_META_CSP)
    const assetsFetch = vi.fn(async (input: RequestInfo | URL) => {
      const req = input instanceof Request ? input : new Request(input)
      return new Response(req.method === 'HEAD' ? null : html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': BASE_SECURITY_CSP,
          ETag: '"index-etag"'
        }
      })
    })

    const response = await worker.fetch(
      new Request('https://fundacionseno.org/', { method: 'HEAD' }),
      { ASSETS: { fetch: assetsFetch } } as unknown as Env,
      {} as ExecutionContext
    )

    expect(response.status).toBe(200)
    expect(response.body).toBeNull()
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('ETag')).toBeNull()
    expect(extractNonce(response.headers.get('Content-Security-Policy'))).toBeTruthy()
    expect(assetsFetch).toHaveBeenCalledTimes(2)
  })

  it('refreshes stale conditional HTML 304 responses with a fresh nonced HTML response', async () => {
    const html = createHtmlDocument(ASTRO_META_CSP)
    const assetsFetch = vi.fn(async (input: RequestInfo | URL) => {
      const req = input instanceof Request ? input : new Request(input)
      if (req.headers.has('If-None-Match')) {
        return new Response(null, {
          status: 304,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            ETag: '"old-etag"'
          }
        })
      }

      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': BASE_SECURITY_CSP
        }
      })
    })

    const response = await worker.fetch(
      new Request('https://fundacionseno.org/', {
        headers: { 'If-None-Match': '"old-etag"' }
      }),
      { ASSETS: { fetch: assetsFetch } } as unknown as Env,
      {} as ExecutionContext
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(extractNonce(response.headers.get('Content-Security-Policy'))).toBeTruthy()
    expect(await response.text()).toContain('<main>Hola</main>')
  })

  it('preserves conditional 304 responses for non-HTML assets', async () => {
    const assetsFetch = vi.fn(async () => {
      return new Response(null, {
        status: 304,
        headers: {
          'Content-Type': 'image/png',
          ETag: '"img-etag"'
        }
      })
    })

    const response = await worker.fetch(
      new Request('https://fundacionseno.org/logo.png', {
        headers: { 'If-None-Match': '"img-etag"' }
      }),
      { ASSETS: { fetch: assetsFetch } } as unknown as Env,
      {} as ExecutionContext
    )

    expect(response.status).toBe(304)
    expect(response.headers.get('ETag')).toBe('"img-etag"')
    expect(assetsFetch).toHaveBeenCalledTimes(1)
  })
})
