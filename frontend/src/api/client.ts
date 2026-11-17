const API: string = import.meta.env.PUBLIC_API_URL || 'https://sitio-web-fundacion-seno.fly.dev'

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
