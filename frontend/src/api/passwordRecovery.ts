const rawApiUrl = import.meta.env.PUBLIC_API_URL
if (!rawApiUrl) throw new Error('PUBLIC_API_URL is not configured.')
const API = rawApiUrl.replace(/\/+$/, '')

export async function passwordRecoveryRequest(
  path: '/auth/forgot-password' | '/auth/reset-password',
  body: Record<string, string>
): Promise<{ message: string }> {
  let response: Response
  try {
    response = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(20000)
    })
  } catch {
    throw new Error(path === '/auth/reset-password'
      ? 'No se pudo confirmar el cambio. Intentá iniciar sesión con tu nueva contraseña antes de repetir.'
      : 'No se pudo conectar con el servidor. Volvé a intentar en un momento.')
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' && response.status < 500
      ? data.error : 'No pudimos completar la solicitud. Intentá más tarde o contactá al administrador.')
  }
  if (typeof data?.message !== 'string') throw new Error('No se pudo confirmar la respuesta del servidor.')
  return data
}
