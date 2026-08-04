const MAX_IMAGES = 10

const MAX_IMAGE_SIZE = 12 * 1024 * 1024

const VALID_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif'
])

/* ==========================================================
   FORM DATA
========================================================== */

export function buildEventFormData({
  titulo,
  descripcion,

  lugar = '',
  fecha = '',
  horario = '',

  url = '',

  /*
   * Aceptamos ambos nombres para facilitar la migración del
   * código anterior.
   */
  urlTitulo = '',
  urlTitle = '',

  images = []
} = {}) {
  const cleanTitle = cleanRequiredText(titulo, 'El título es requerido.')

  const cleanDescription = cleanRequiredText(
    descripcion,
    'La descripción es requerida.'
  )

  const cleanUrl = cleanOptionalText(url)

  const cleanUrlTitle = cleanOptionalText(urlTitulo || urlTitle)

  const normalizedImages = normalizeImages(images)

  validateEventImages(normalizedImages)

  validateEventUrl({
    url: cleanUrl,

    urlTitle: cleanUrlTitle
  })

  const formData = new FormData()

  formData.append('titulo', cleanTitle)

  formData.append('descripcion', cleanDescription)

  /*
   * Estos campos se agregan incluso cuando están vacíos.
   *
   * De esta manera, durante un PATCH, el backend puede
   * reemplazar el valor existente por NULL.
   */
  formData.append('lugar', cleanOptionalText(lugar))

  formData.append('fecha', cleanOptionalText(fecha))

  formData.append('horario', cleanOptionalText(horario))

  /*
   * Una URL vacía permite eliminar el enlace anteriormente
   * relacionado con el evento.
   */
  formData.append('url', cleanUrl)

  formData.append('url_titulo', cleanUrlTitle)

  /*
   * Axum recibe todas las imágenes mediante campos con el
   * mismo nombre.
   *
   * Si no hay imágenes nuevas, no se agrega ningún campo
   * "images" y se conservan las imágenes actuales.
   */
  normalizedImages.forEach((image) => {
    formData.append('images', image, image.name)
  })

  return formData
}

/*
 * Alias temporal para archivos que todavía utilicen el
 * nombre anterior en español.
 */
export const buildEventoFormData = buildEventFormData

/* ==========================================================
   IMAGE VALIDATION
========================================================== */

export function validateEventImages(images) {
  if (!Array.isArray(images))
    throw new TypeError('La lista de imágenes no es válida.')

  if (images.length > MAX_IMAGES)
    throw new Error(`Podés seleccionar como máximo ${MAX_IMAGES} imágenes.`)

  images.forEach((image, index) => {
    validateEventImage(image, index)
  })

  return images
}

/*
 * Alias compatible con el modal anterior.
 */
export const validateImages = validateEventImages

function validateEventImage(image, index) {
  const position = index + 1

  if (!(image instanceof File))
    throw new TypeError(`La imagen ${position} no es un archivo válido.`)

  if (!VALID_IMAGE_TYPES.has(image.type))
    throw new Error(`La imagen ${position} no tiene un formato permitido.`)

  if (image.size === 0) throw new Error(`La imagen ${position} está vacía.`)

  if (image.size > MAX_IMAGE_SIZE)
    throw new Error(`La imagen ${position} supera el límite de 12 MB.`)
}

/* ==========================================================
   URL VALIDATION
========================================================== */

export function validateEventUrl({ url, urlTitle } = {}) {
  const cleanUrl = cleanOptionalText(url)

  const cleanUrlTitle = cleanOptionalText(urlTitle)

  if (cleanUrlTitle && !cleanUrl)
    throw new Error(
      'No podés agregar un texto para el botón sin ingresar una URL.'
    )

  if (cleanUrl && !isValidHttpUrl(cleanUrl))
    throw new Error('La URL debe comenzar con http:// o https://.')

  return true
}

/* ==========================================================
   FILE NORMALIZATION
========================================================== */

function normalizeImages(images) {
  if (images === null || images === undefined) return []

  /*
   * Admite FileList, arreglos y el arreglo expuesto por
   * createImagePicker().
   */
  try {
    return Array.from(images)
  } catch {
    throw new TypeError('La lista de imágenes no es válida.')
  }
}

/* ==========================================================
   TEXT
========================================================== */

function cleanRequiredText(value, errorMessage) {
  const cleaned = String(value ?? '').trim()

  if (!cleaned) throw new Error(errorMessage)

  return cleaned
}

function cleanOptionalText(value) {
  return String(value ?? '').trim()
}

/* ==========================================================
   URL
========================================================== */

function isValidHttpUrl(value) {
  try {
    const parsedUrl = new URL(value)

    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'
  } catch {
    return false
  }
}
