export interface Profile {
  id: number
  username: string
  email: string
  name: string
  last_name: string
  role_name: string
}

const API_URL = (
  import.meta.env.PUBLIC_API_URL ?? 'https://sitio-web-fundacion-seno.fly.dev'
).replace(/\/+$/, '')

export function clearSession(): void {
  for (const key of ['token', 'username', 'name', 'lastname', 'role'])
    localStorage.removeItem(key)
}

export function cacheProfile(profile: Profile): void {
  for (const [key, value] of Object.entries({
    username: profile.username,
    name: profile.name,
    lastname: profile.last_name,
    role: profile.role_name
  })) {
    localStorage.setItem(key, value)
  }
  window.dispatchEvent(new Event('profile-updated'))
}

export async function profileRequest<T>(
  path: string,
  body?: Record<string, string>
): Promise<T> {
  const token = localStorage.getItem('token')
  if (!token) {
    window.location.replace('/login/')
    throw new Error('Iniciá sesión para continuar.')
  }
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: body ? 'PATCH' : 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(20000)
    })
  } catch {
    throw new Error(
      body
        ? 'No pudimos confirmar el cambio. Revisá tus datos o intentá iniciar sesión con la nueva contraseña antes de repetir.'
        : 'No pudimos cargar tu perfil. Revisá la conexión y volvé a intentar.'
    )
  }
  if (response.status === 401 || response.status === 403) {
    clearSession()
    window.location.replace('/login/')
    throw new Error('Tu sesión venció. Volvé a iniciar sesión.')
  }
  if (response.status === 204) return undefined as T
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      response.status < 500 && typeof data?.error === 'string'
        ? data.error
        : 'No pudimos completar la solicitud. Volvé a intentar en un momento.'
    )
  }
  if (!data) throw new Error('No pudimos confirmar la respuesta del servidor.')
  return data as T
}
