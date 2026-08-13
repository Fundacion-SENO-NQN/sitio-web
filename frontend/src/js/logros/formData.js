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

export function buildAchievementFormData({
  titulo,
  contenido,
  orden = 0,
  image = null,

  /*
   * Alias opcionales para mantener compatibilidad con
   * nombres utilizados en otros módulos.
   */
  title,
  content,
  order
} = {}) {
  const normalizedData = validateAchievementData({
    titulo: titulo ?? title,

    contenido: contenido ?? content,

    orden: orden ?? order
  })

  const normalizedImage = normalizeAchievementImage(image)

  if (normalizedImage) validateAchievementImage(normalizedImage)

  const formData = new FormData()

  formData.append('titulo', normalizedData.titulo)

  formData.append('contenido', normalizedData.contenido)

  formData.append('orden', String(normalizedData.orden))

  /*
   * Al editar, si no se selecciona una imagen nueva, el
   * campo se omite y el backend conserva la imagen actual.
   */
  if (normalizedImage)
    formData.append('image', normalizedImage, normalizedImage.name)

  return formData
}

/*
 * Alias en español para código anterior.
 */
export const buildLogroFormData = buildAchievementFormData

/* ==========================================================
   ACHIEVEMENT DATA
========================================================== */

export function validateAchievementData({ titulo, contenido, orden = 0 } = {}) {
  const normalizedTitle = cleanRequiredText(titulo, 'El título es requerido.')

  if (normalizedTitle.length < 3)
    throw new Error('El título debe contener al menos 3 caracteres.')

  const normalizedContent = cleanRequiredText(
    contenido,
    'La descripción es requerida.'
  )

  if (normalizedContent.length < 10)
    throw new Error('La descripción debe contener al menos 10 caracteres.')

  return {
    titulo: normalizedTitle,

    contenido: normalizedContent,

    orden: normalizeOrder(orden)
  }
}

/* ==========================================================
   IMAGE VALIDATION
========================================================== */

export function validateAchievementImage(image) {
  if (!isFile(image)) throw new TypeError('La imagen no es un archivo válido.')

  if (!VALID_IMAGE_TYPES.has(image.type))
    throw new Error('La imagen debe ser JPG, PNG, WebP o AVIF.')

  if (image.size === 0) throw new Error('La imagen está vacía.')

  if (image.size > MAX_IMAGE_SIZE)
    throw new Error('La imagen supera el límite de 12 MB.')

  return image
}

/*
 * Esta función debe utilizarse únicamente durante la
 * creación, porque allí la imagen sí es obligatoria.
 */
export function validateCreateAchievementImage(image) {
  const normalizedImage = normalizeAchievementImage(image)

  if (!normalizedImage) throw new Error('La imagen es requerida.')

  return validateAchievementImage(normalizedImage)
}

/*
 * Alias compatible con código que utiliza nombres genéricos.
 */
export const validateImage = validateAchievementImage

export const validateCreateImage = validateCreateAchievementImage

/* ==========================================================
   IMAGE NORMALIZATION
========================================================== */

function normalizeAchievementImage(image) {
  if (image === null || image === undefined || image === '') return null

  if (isFile(image)) return image

  /*
   * Admite un FileList o el arreglo expuesto por
   * createImagePicker().
   */
  if (typeof image === 'object' && typeof image.length === 'number') {
    const images = Array.from(image)

    if (images.length === 0) return null

    if (images.length > 1) throw new Error('Cada logro admite una sola imagen.')

    const selectedImage = images[0]

    if (!isFile(selectedImage))
      throw new TypeError('La imagen seleccionada no es válida.')

    return selectedImage
  }

  throw new TypeError('La imagen seleccionada no es válida.')
}

function isFile(value) {
  return typeof File !== 'undefined' && value instanceof File
}

/* ==========================================================
   ORDER
========================================================== */

function normalizeOrder(value) {
  const order = Number(value)

  if (!Number.isInteger(order) || order < 0)
    throw new TypeError('El orden del logro debe ser un entero no negativo.')

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
