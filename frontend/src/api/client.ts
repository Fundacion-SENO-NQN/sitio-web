const API = import.meta.env.PUBLIC_API_URL

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return response.json()

}