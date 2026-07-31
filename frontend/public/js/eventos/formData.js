const MAX_IMAGES = 10

const VALID_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif'
])

/**
 * Construye el FormData utilizado para crear o editar
 * un evento.
 *
 * En edición:
 * - Los campos vacíos opcionales se envían como texto vacío
 *   para que el backend los guarde como NULL.
 * - Si no hay imágenes nuevas, no se envía "images" y se
 *   conservan las imágenes actuales.
 * - Si hay imágenes nuevas, reemplazan todas las actuales.
 */
export function buildEventoFormData({
  titulo,
  descripcion,
  lugar,
  fecha,
  horario,
  url,
  urlTitulo,
  images = []
}) {
  const tituloLimpio = cleanRequiredText(titulo, 'El título es requerido.')

  const descripcionLimpia = cleanRequiredText(
    descripcion,
    'La descripción es requerida.'
  )

  const imagenes = Array.from(images)

  validateImages(imagenes)

  const urlLimpia = cleanOptionalText(url)

  const urlTituloLimpio = cleanOptionalText(urlTitulo)

  if (urlTituloLimpio && !urlLimpia) {
    throw new Error(
      'No podés agregar un texto para el botón sin ingresar una URL.'
    )
  }

  if (urlLimpia && !isValidHttpUrl(urlLimpia)) {
    throw new Error('La URL debe comenzar con http:// o https://.')
  }

  const formData = new FormData()

  formData.append('titulo', tituloLimpio)

  formData.append('descripcion', descripcionLimpia)

  /*
   * Estos campos siempre se envían.
   *
   * Si están vacíos, el backend los transforma en NULL.
   * Esto permite eliminar un valor existente durante PATCH.
   */
  formData.append('lugar', cleanOptionalText(lugar))

  formData.append('fecha', cleanOptionalText(fecha))

  formData.append('horario', cleanOptionalText(horario))

  /*
   * Una URL vacía durante PATCH elimina la relación
   * con url_eventos.
   */
  formData.append('url', urlLimpia)

  formData.append('url_titulo', urlTituloLimpio)

  /*
   * El backend acepta varias imágenes usando el mismo
   * nombre de campo.
   */
  imagenes.forEach((image) => {
    formData.append('images', image, image.name)
  })

  return formData
}

/* ==========================================================
   VALIDACIÓN DE IMÁGENES
========================================================== */

export function validateImages(images) {
  if (!Array.isArray(images)) {
    throw new TypeError('La lista de imágenes no es válida.')
  }

  if (images.length > MAX_IMAGES) {
    throw new Error(`Podés seleccionar como máximo ${MAX_IMAGES} imágenes.`)
  }

  images.forEach((image, index) => {
    if (!(image instanceof File)) {
      throw new TypeError(`La imagen ${index + 1} no es un archivo válido.`)
    }

    if (!VALID_IMAGE_TYPES.has(image.type)) {
      throw new Error(`La imagen ${index + 1} no tiene un formato permitido.`)
    }

    if (image.size === 0) {
      throw new Error(`La imagen ${index + 1} está vacía.`)
    }
  })
}

/* ==========================================================
   HELPERS
========================================================== */

function cleanRequiredText(value, errorMessage) {
  const cleaned = String(value ?? '').trim()

  if (!cleaned) {
    throw new Error(errorMessage)
  }

  return cleaned
}

function cleanOptionalText(value) {
  return String(value ?? '').trim()
}

function isValidHttpUrl(value) {
  try {
    const parsedUrl = new URL(value)

    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'
  } catch {
    return false
  }
}
