import { applyCsp, isEligibleHtmlResponse, isHtmlContentType } from './csp'

function createFreshGetRequest(request: Request): Request {
  const headers = new Headers(request.headers)
  headers.delete('If-None-Match')
  headers.delete('If-Modified-Since')

  return new Request(request.url, {
    method: 'GET',
    headers,
    redirect: request.redirect
  })
}

export default {
  async fetch(request, env): Promise<Response> {
    const assetResponse = await env.ASSETS.fetch(request)

    const isConditionalHtml =
      assetResponse.status === 304 &&
      isHtmlContentType(assetResponse.headers.get('Content-Type'))

    if (
      request.method === 'HEAD' &&
      (isEligibleHtmlResponse(assetResponse) || isConditionalHtml)
    ) {
      const freshGetResponse = await env.ASSETS.fetch(
        createFreshGetRequest(request)
      )
      const transformed = await applyCsp(freshGetResponse)
      await transformed.body?.cancel()

      return new Response(null, {
        status: transformed.status,
        statusText: transformed.statusText,
        headers: transformed.headers
      })
    }

    if (request.method === 'GET' && isConditionalHtml) {
      const freshGetResponse = await env.ASSETS.fetch(
        createFreshGetRequest(request)
      )

      return applyCsp(freshGetResponse)
    }

    return applyCsp(assetResponse)
  }
} satisfies ExportedHandler<Env>
