import { defineMiddleware } from 'astro:middleware'

const CSP_HEADER: string = 'Content-Security-Policy'

function generateNonce(): string {
  const bytes: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(32))

  return btoa(String.fromCharCode(...bytes))
}

export async function applyCsp(
  response: Response
): Promise<Response> {
  const contentType: string | null = response.headers.get('Content-Type')

  // Procesar únicamente documentos HTML.
  if (!contentType?.includes('text/html') || !response.body) {
    return response
  }

  // Evitar procesar una respuesta que ya tiene CSP por cabecera.
  if (response.headers.has(CSP_HEADER)) {
    return response
  }

  const nonce: string = generateNonce()

  let csp: string | undefined

  // Recuperar y eliminar la etiqueta CSP generada por Astro.
  const transformed: Response = new HTMLRewriter()
    .on('head meta[http-equiv]', {
      element(element: Element): void {
        const httpEquiv: string | null = element.getAttribute('http-equiv')

        if (httpEquiv?.toLowerCase() !== 'content-security-policy') {
          return
        }

        const content: string | null = element.getAttribute('content')

        if (!content || csp !== undefined) {
          return
        }

        csp = content

        element.remove()
      }
    })
    .transform(response)

  // Consumir el HTML para obtener la CSP.
  const html: string = await transformed.text()

  const headers: Headers = new Headers(transformed.headers)

  headers.delete('Content-Length')
  headers.delete('Content-Encoding')
  headers.delete('ETag')

  if (csp) {
    const directives: Map<string, string[]> = new Map<string, string[]>()

    // Conservar todas las directivas y hashes de Astro.
    for (const directive of csp.split(';')) {
      const [name, ...values]: string[] = directive.trim().split(/\s+/)

      if (name) {
        directives.set(name, values)
      }
    }

    const scriptSources: string[] = directives.get('script-src') ?? ["'self'"]

    directives.set('script-src', [
      ...new Set([
        ...scriptSources,
        `'nonce-${nonce}'`
      ])
    ])

    // Contemplar directivas específicas de elementos script.
    if (directives.has('script-src-elem')) {
      directives.set('script-src-elem', [
        ...directives.get('script-src-elem')!,
        `'nonce-${nonce}'`
      ])
    }

    // Prohibir manejadores de eventos inline.
    directives.set('script-src-attr', ["'none'"])

    headers.set(
      CSP_HEADER,
      Array.from(directives)
        .map(([name, values]) => [name, ...values].join(' '))
        .join('; ') + ';'
    )

    // Evitar reutilizar una respuesta con el mismo nonce.
    headers.set('Cache-Control', 'no-store')
  }

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

export const onRequest = defineMiddleware(
  async (context, next) => {
    const response: Response = await next()

    // No generar nonces durante la compilación estática.
    if (context.isPrerendered) {
      return response
    }

    return applyCsp(response)
  }
)