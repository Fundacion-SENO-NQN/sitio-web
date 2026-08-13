import type CuentaPago from '../data/interfaces/CuentaPago'

const rawApiUrl = import.meta.env.PUBLIC_API_URL

if (!rawApiUrl) {
  throw new Error(
    'PUBLIC_API_URL is not configured. Add it to the environment variables.'
  )
}

const API_URL = rawApiUrl.replace(/\/+$/, '')

export async function getCuentasPago(): Promise<CuentaPago[]> {
  let response: Response

  try {
    response = await fetch(`${API_URL}/metodos_donacion`)
  } catch (error) {
    throw new Error('No se pudo conectar con el servidor.', {
      cause: error
    })
  }

  if (!response.ok) {
    throw new Error(
      `No se pudieron cargar los métodos de donación. Estado: ${response.status}`
    )
  }

  const data: unknown = await response.json()

  if (!Array.isArray(data)) {
    throw new TypeError('La respuesta de métodos de donación no es un arreglo.')
  }

  return data as CuentaPago[]
}
