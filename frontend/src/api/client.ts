const API: string = 'https://sitio-web-fundacion-seno.fly.dev:8080'

if (!API) {
  throw new Error(
    'PUBLIC_API_URL is not configured. Add it to the environment variables.',
  )
}

const BASE_URL: string = API.replace(/\/+$/, '')

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return response.json()
}
