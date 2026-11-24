const CSP_HEADER = 'Content-Security-Policy'

const NONCE_BYTE_LENGTH = 32
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/
const DIRECTIVE_NAME_PATTERN = /^[a-z0-9-]+$/
const DIRECTIVE_VALUE_TOKEN_PATTERN = /^[\x21-\x2B\x2D-\x3A\x3C-\x7E]+$/
const NONCE_VALUE_PATTERN = /^[A-Za-z0-9+/=_-]+$/

/**
 * CSP Level 3 directives that do not fall back to `default-src`.
 */
const NON_FALLBACK_DIRECTIVES: ReadonlySet<string> = new Set([
  'base-uri',
  'block-all-mixed-content',
  'form-action',
  'frame-ancestors',
  'navigate-to',
  'report-to',
  'report-uri',
  'require-trusted-types-for',
  'sandbox',
  'trusted-types',
  'upgrade-insecure-requests'
])

const SCRIPT_OR_DEFAULT_DIRECTIVES: ReadonlySet<string> = new Set([
  'default-src',
  'script-src',
  'script-src-elem',
  'script-src-attr'
])

const FULL_FAIL_CLOSED_DIRECTIVES: ReadonlyArray<
  readonly [string, readonly string[]]
> = [
  ['default-src', ["'self'"]],
  ['script-src', ["'self'"]],
  ['script-src-attr', ["'none'"]],
  ['object-src', ["'none'"]],
  ['base-uri', ["'self'"]],
  ['frame-ancestors', ["'none'"]],
  ['form-action', ["'self'"]],
  ['upgrade-insecure-requests', []]
]

const SCRIPT_FAIL_CLOSED_DIRECTIVES: ReadonlyArray<
  readonly [string, readonly string[]]
> = [
  ['default-src', ["'self'"]],
  ['script-src', ["'self'"]],
  ['script-src-attr', ["'none'"]]
]

export interface TransformedCspPolicy {
  directives: Map<string, string[]>
  headerValue: string
}

export function isHtmlContentType(contentType: string | null): boolean {
  if (!contentType) {
    return false
  }

  const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase()
  return mediaType === 'text/html'
}

export function isEligibleHtmlResponse(response: Response): boolean {
  const { status } = response

  if (
    status < 200 ||
    status === 204 ||
    status === 205 ||
    (status >= 300 && status < 400)
  ) {
    return false
  }

  return isHtmlContentType(response.headers.get('Content-Type'))
}

export function generateNonce(): string {
  const bytes = new Uint8Array(NONCE_BYTE_LENGTH)
  crypto.getRandomValues(bytes)

  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!)
  }

  return btoa(binary)
}

/**
 * Parses a single serialized CSP policy according to W3C CSP Level 3 rules
 * (case-insensitive directive names, first duplicate directive wins).
 * Returns `null` if the policy is empty, malformed, or contains multiple policies.
 */
export function parseCspDirectives(
  rawPolicy: string
): Map<string, string[]> | null {
  if (
    !rawPolicy ||
    CONTROL_CHAR_PATTERN.test(rawPolicy) ||
    rawPolicy.includes(',')
  ) {
    return null
  }

  const directives = new Map<string, string[]>()

  for (const rawDirective of rawPolicy.split(';')) {
    const trimmed = rawDirective.trim()
    if (!trimmed) {
      continue
    }

    const tokens = trimmed.split(/\s+/)
    const rawName = tokens[0]
    if (!rawName) {
      return null
    }

    const name = rawName.toLowerCase()
    if (!DIRECTIVE_NAME_PATTERN.test(name)) {
      return null
    }

    const values = tokens.slice(1)
    for (const value of values) {
      if (!DIRECTIVE_VALUE_TOKEN_PATTERN.test(value)) {
        return null
      }
    }

    // Per CSP3 §2.2.1, ignore duplicate directives after the first occurrence.
    if (!directives.has(name)) {
      directives.set(name, values)
    }
  }

  return directives.size > 0 ? directives : null
}

export function serializeCspDirectives(
  directives: ReadonlyMap<string, readonly string[]>
): string {
  return Array.from(directives.entries())
    .map(([name, values]) =>
      values.length > 0 ? `${name} ${values.join(' ')}` : name
    )
    .join('; ')
}

function addNonceToSourceList(
  sources: readonly string[],
  nonceToken: string
): string[] {
  const filtered = sources.filter(
    (source) => source.toLowerCase() !== "'none'"
  )

  return Array.from(new Set([...filtered, nonceToken]))
}

/**
 * Transforms an Astro-generated CSP meta policy by injecting a per-response
 * script nonce while preserving all existing directives, hashes, and CSP3
 * fallback semantics, and explicitly disallowing inline event handlers.
 */
export function transformCspPolicy(
  rawMetaPolicy: string,
  nonce: string
): TransformedCspPolicy | null {
  if (!NONCE_VALUE_PATTERN.test(nonce)) {
    return null
  }

  const directives = parseCspDirectives(rawMetaPolicy)
  if (!directives) {
    return null
  }

  const nonceToken = `'nonce-${nonce}'`

  // Respect CSP3 fallback semantics: inherit `default-src` when `script-src` is absent.
  const baseScriptSources =
    directives.get('script-src') ??
    directives.get('default-src') ??
    ["'self'"]

  directives.set('script-src', addNonceToSourceList(baseScriptSources, nonceToken))

  // If `script-src-elem` is present, browsers evaluate it instead of `script-src` for <script>.
  const scriptSrcElem = directives.get('script-src-elem')
  if (scriptSrcElem) {
    directives.set(
      'script-src-elem',
      addNonceToSourceList(scriptSrcElem, nonceToken)
    )
  }

  // Explicitly prohibit inline event handlers (onclick, onerror, etc.).
  directives.set('script-src-attr', ["'none'"])

  return {
    directives,
    headerValue: serializeCspDirectives(directives)
  }
}

function isNoneOnlySourceList(values: readonly string[]): boolean {
  return values.length === 1 && values[0]?.toLowerCase() === "'none'"
}

/**
 * Determines whether an existing single-policy HTTP CSP header can be merged
 * with the incoming policy into one header without weakening either policy.
 */
function canSafelyMergeExistingPolicy(
  existing: ReadonlyMap<string, readonly string[]>,
  incoming: ReadonlyMap<string, readonly string[]>
): boolean {
  const incomingHasDefaultSrc = incoming.has('default-src')

  for (const [name, values] of existing.entries()) {
    if (SCRIPT_OR_DEFAULT_DIRECTIVES.has(name) || incoming.has(name)) {
      return false
    }

    if (
      !NON_FALLBACK_DIRECTIVES.has(name) &&
      !isNoneOnlySourceList(values) &&
      incomingHasDefaultSrc
    ) {
      return false
    }
  }

  return true
}

function applyCspPolicyToHeaders(
  headers: Headers,
  incomingDirectives: ReadonlyMap<string, readonly string[]>,
  incomingHeaderValue: string
): void {
  const existingHeader = headers.get(CSP_HEADER)
  if (!existingHeader) {
    headers.set(CSP_HEADER, incomingHeaderValue)
    return
  }

  const parsedExisting = parseCspDirectives(existingHeader)
  if (
    parsedExisting &&
    canSafelyMergeExistingPolicy(parsedExisting, incomingDirectives)
  ) {
    const merged = new Map<string, readonly string[]>([
      ...parsedExisting.entries(),
      ...incomingDirectives.entries()
    ])
    headers.set(CSP_HEADER, serializeCspDirectives(merged))
    return
  }

  // Keep existing CSP header(s) intact and enforce the transformed policy alongside them.
  headers.append(CSP_HEADER, incomingHeaderValue)
}

function existingHeaderRestrictsScripts(existingHeader: string): boolean {
  for (const rawPolicy of existingHeader.split(',')) {
    const parsed = parseCspDirectives(rawPolicy.trim())
    if (!parsed) {
      continue
    }

    if (
      parsed.has('script-src') ||
      parsed.has('script-src-elem') ||
      parsed.has('default-src')
    ) {
      return true
    }
  }

  return false
}

function applyFailClosedCsp(headers: Headers): void {
  const existingHeader = headers.get(CSP_HEADER)

  if (!existingHeader) {
    const fullFallback = new Map(FULL_FAIL_CLOSED_DIRECTIVES)
    headers.set(CSP_HEADER, serializeCspDirectives(fullFallback))
    return
  }

  if (existingHeaderRestrictsScripts(existingHeader)) {
    return
  }

  const scriptFallback = new Map(SCRIPT_FAIL_CLOSED_DIRECTIVES)
  applyCspPolicyToHeaders(
    headers,
    scriptFallback,
    serializeCspDirectives(scriptFallback)
  )
}

function sanitizeTransformedHeaders(headers: Headers): void {
  headers.delete('Content-Length')
  headers.delete('Content-Encoding')
  headers.delete('ETag')
  headers.set('Cache-Control', 'no-store')
}

export async function applyCsp(response: Response): Promise<Response> {
  if (!isEligibleHtmlResponse(response)) {
    return response
  }

  if (!response.body) {
    const headers = new Headers(response.headers)
    sanitizeTransformedHeaders(headers)
    applyFailClosedCsp(headers)

    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers
    })
  }

  let transformedPolicy: TransformedCspPolicy | undefined

  const rewriter = new HTMLRewriter().on('head meta[http-equiv]', {
    element(element: Element): void {
      if (transformedPolicy !== undefined) {
        return
      }

      const httpEquiv = element.getAttribute('http-equiv')
      if (httpEquiv?.trim().toLowerCase() !== 'content-security-policy') {
        return
      }

      const content = element.getAttribute('content')
      if (!content) {
        return
      }

      const result = transformCspPolicy(content, generateNonce())
      if (!result) {
        return
      }

      transformedPolicy = result
      element.remove()
    }
  })

  const rewrittenResponse = rewriter.transform(response)
  const html = await rewrittenResponse.text()

  const headers = new Headers(rewrittenResponse.headers)
  sanitizeTransformedHeaders(headers)

  if (transformedPolicy) {
    applyCspPolicyToHeaders(
      headers,
      transformedPolicy.directives,
      transformedPolicy.headerValue
    )
  } else {
    applyFailClosedCsp(headers)
  }

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}
