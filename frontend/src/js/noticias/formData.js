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

export function buildNewsFormData({
  titulo,
  title,

  contenido,
  content,

  orden,
  order,

  image = null,

  /*
   * Compatibilidad con la implementación anterior, que
   * entregaba un arreglo o FileList llamado "images".
   */
  images = null
} = {}) {
  const normalizedTitle = cleanRequiredText(
    titulo ?? title,
    'El título es requerido.'
  )

  const normalizedContent = cleanRequiredText(
    contenido ?? content,
    'El contenido es requerido.'
  )

  const normalizedOrder = normalizeOrder(orden ?? order ?? 0)

  const normalizedImage = normalizeSingleImage({
    image,
    images
  })

  if (normalizedImage) validateNewsImage(normalizedImage)

  const formData = new FormData()

  formData.append('titulo', normalizedTitle)

  formData.append('contenido', normalizedContent)

  /*
   * POST /noticias necesita el orden.
   *
   * PATCH /noticias/:id actualmente ignora este campo,
   * porque el orden se modifica mediante el endpoint
   * específico de reordenamiento.
   */
  formData.append('orden', String(normalizedOrder))

  if (normalizedImage)
    formData.append('image', normalizedImage, normalizedImage.name)

  /*
   * No se envía "fecha":
   *
   * - Al crear, el backend genera la fecha actual.
   * - Al editar, conserva la fecha existente.
   */

  return formData
}

/*
 * Alias para los archivos que todavía utilicen el nombre
 * anterior en español.
 */
export const buildNoticiaFormData = buildNewsFormData

/* ==========================================================
   IMAGE VALIDATION
========================================================== */

export function validateNewsImage(image) {
  if (!(image instanceof File))
    throw new TypeError('La imagen no es un archivo válido.')

  if (!VALID_IMAGE_TYPES.has(image.type))
    throw new Error('La imagen debe ser JPG, PNG, WebP o AVIF.')

  if (image.size === 0) throw new Error('La imagen está vacía.')

  if (image.size > MAX_IMAGE_SIZE)
    throw new Error('La imagen supera el límite de 12 MB.')

  return image
}

/* ==========================================================
   LEGACY ARRAY VALIDATION
========================================================== */

export function validateNewsImages(images) {
  const normalizedImages = normalizeImages(images)

  if (normalizedImages.length > 1)
    throw new Error('Cada noticia admite una sola imagen.')

  normalizedImages.forEach((image) => {
    validateNewsImage(image)
  })

  return normalizedImages
}

export const validateImages = validateNewsImages

/* ==========================================================
   CREATE VALIDATION
========================================================== */

export function validateCreateNewsImage(image) {
  if (!image) throw new Error('Seleccioná una imagen para la noticia.')

  return validateNewsImage(image)
}

export function validateCreateImages(images) {
  const normalizedImages = validateNewsImages(images)

  if (normalizedImages.length === 0)
    throw new Error('Seleccioná una imagen para la noticia.')

  return normalizedImages
}

/* ==========================================================
   IMAGE NORMALIZATION
========================================================== */

function normalizeSingleImage({ image, images }) {
  if (image !== null && image !== undefined) return image

  if (images === null || images === undefined) return null

  const normalizedImages = normalizeImages(images)

  if (normalizedImages.length > 1)
    throw new Error('Cada noticia admite una sola imagen.')

  return normalizedImages[0] ?? null
}

function normalizeImages(images) {
  if (images === null || images === undefined) return []

  if (images instanceof File) return [images]

  try {
    return Array.from(images)
  } catch {
    throw new TypeError('La selección de imágenes no es válida.')
  }
}

/* ==========================================================
   ORDER
========================================================== */

function normalizeOrder(value) {
  const order = Number(value)

  if (!Number.isInteger(order) || order < 0)
    throw new TypeError(
      'El orden de la noticia debe ser un entero no negativo.'
    )

  return order
}

/* ==========================================================
   TEXT
========================================================== */

function cleanRequiredText(value, errorMessage) {
  const cleaned = String(value ?? '').trim()

  if (!cleaned) throw new Error(errorMessage)

  return cleaned
}
