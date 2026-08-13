import { startLoading } from './loadingScreen.js'

const rawApiUrl = import.meta.env.PUBLIC_API_URL

if (!rawApiUrl)
  throw new Error(
    'PUBLIC_API_URL is not configured. Add it to the environment variables.'
  )

const BASE_URL = rawApiUrl.replace(/\/+$/, '')

/* ==========================================================
   API ERROR
========================================================== */

export class ApiError extends Error {
  constructor(message, { status = 0, body = null } = {}) {
    super(message)

    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/* ==========================================================
   AUTHENTICATION
========================================================== */

function getToken() {
  return localStorage.getItem('token')
}

function removeSession() {
  localStorage.removeItem('token')
}

/* ==========================================================
   REQUEST
========================================================== */

export async function request(
  path,
  {
    body = undefined,
    headers = undefined,

    globalLoading = true,
    loadingMessage = null,

    ...options
  } = {}
) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  const requestHeaders = new Headers(headers)

  const token = getToken()

  if (token && !requestHeaders.has('Authorization')) {
    requestHeaders.set('Authorization', `Bearer ${token}`)
  }

  const normalizedBody = normalizeBody(body, requestHeaders)

  const method = String(options.method ?? 'GET').toUpperCase()

  const finishLoading = globalLoading
    ? startLoading(loadingMessage ?? getDefaultLoadingMessage(method))
    : () => {}

  try {
    let response

    try {
      response = await fetch(`${BASE_URL}${normalizedPath}`, {
        ...options,

        headers: requestHeaders,
        body: normalizedBody
      })
    } catch (error) {
      console.error('Could not connect to API:', error)

      throw new ApiError('No se pudo conectar con el servidor.', {
        status: 0,
        body: error
      })
    }

    if (response.status === 401) {
      removeSession()

      throw new ApiError('Tu sesión venció. Volvé a iniciar sesión.', {
        status: response.status
      })
    }

    if (response.status === 403) {
      throw new ApiError('No tenés permisos para realizar esta acción.', {
        status: response.status
      })
    }

    if (!response.ok) {
      throw await createResponseError(response)
    }

    /*
     * Await is intentional. Without it, the finally block
     * could hide the loading screen before parsing finishes.
     */
    return await parseResponse(response)
  } finally {
    finishLoading()
  }
}

function getDefaultLoadingMessage(method) {
  switch (method) {
    case 'POST':
      return 'Creando...'

    case 'PUT':
    case 'PATCH':
      return 'Guardando cambios...'

    case 'DELETE':
      return 'Eliminando...'

    case 'GET':
    default:
      return 'Cargando información...'
  }
}

/* ==========================================================
   BODY
========================================================== */

function normalizeBody(body, headers) {
  if (body === undefined || body === null) return undefined

  if (
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof URLSearchParams ||
    typeof body === 'string'
  )
    return body

  if (!headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json')

  return JSON.stringify(body)
}

/* ==========================================================
   RESPONSE
========================================================== */

async function parseResponse(response) {
  if (response.status === 204 || response.status === 205) return null

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''

  if (contentType.includes('application/json')) return response.json()

  const text = await response.text()

  return text || null
}

async function createResponseError(response) {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''

  let body = null
  let message = response.statusText || `Error ${response.status}`

  try {
    if (contentType.includes('application/json')) {
      body = await response.json()

      message = getMessageFromBody(body) || message
    } else {
      body = await response.text()

      if (typeof body === 'string' && body.trim()) message = body.trim()
    }
  } catch (error) {
    console.error('Could not read API error:', error)
  }

  return new ApiError(message, {
    status: response.status,
    body
  })
}

function getMessageFromBody(body) {
  if (!body) return null

  if (typeof body === 'string') return body

  return (
    body.message ?? body.error?.message ?? body.error ?? body.detail ?? null
  )
}

/* ==========================================================
   GENERIC CRUD RESOURCE
========================================================== */

export function createCrudApi({
  basePath,

  listPath = basePath,

  createPath = basePath,

  itemPath = (id) => `${basePath}/${id}`,

  orderPath = `${basePath}/order`,

  createMethod = 'POST',

  updateMethod = 'PATCH',

  deleteMethod = 'DELETE',

  orderMethod = 'PUT',

  hasOrder = true
}) {
  if (!basePath) {
    throw new TypeError('createCrudApi requires basePath.')
  }

  return {
    list() {
      return request(listPath)
    },

    get(id) {
      validateId(id)

      return request(itemPath(id))
    },

    create(data) {
      return request(createPath, {
        method: createMethod,
        body: data
      })
    },

    update(id, data) {
      validateId(id)

      return request(itemPath(id), {
        method: updateMethod,
        body: data
      })
    },

    remove(id) {
      validateId(id)

      return request(itemPath(id), {
        method: deleteMethod
      })
    },

    changeOrder(changes) {
      if (!hasOrder) throw new Error(`${basePath} does not support ordering.`)

      validateOrderChanges(changes)

      return request(orderPath, {
        method: orderMethod,
        body: changes
      })
    }
  }
}

/* ==========================================================
   VALIDATION
========================================================== */

export function validateId(id) {
  const numericId = Number(id)

  if (!Number.isInteger(numericId) || numericId <= 0)
    throw new TypeError('El id no es válido.')

  return numericId
}

export function validateFormData(formData) {
  if (!(formData instanceof FormData))
    throw new TypeError('La petición requiere un objeto FormData.')

  return formData
}

export function validateOrderChanges(changes) {
  if (!Array.isArray(changes) || changes.length === 0)
    throw new TypeError('Debe proporcionarse al menos un cambio de orden.')

  const ids = new Set()

  const orders = new Set()

  for (const change of changes) {
    if (!change || typeof change !== 'object')
      throw new TypeError('Uno de los cambios de orden no es válido.')

    const id = validateId(change.id)

    const order = Number(change.orden)

    if (!Number.isInteger(order) || order < 0)
      throw new TypeError('Uno de los órdenes no es válido.')

    if (ids.has(id))
      throw new TypeError('Hay ids repetidos en los cambios de orden.')

    if (orders.has(order))
      throw new TypeError('Hay posiciones repetidas en los cambios de orden.')

    ids.add(id)
    orders.add(order)
  }

  return changes
}
