const MAX_IMAGES = 10
const MAX_IMAGE_SIZE = 12 * 1024 * 1024

const VALID_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif'
])

const VALID_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif'])

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

  /*
   * Compatibilidad con componentes antiguos que entregan
   * una única imagen.
   */
  image = null,

  /*
   * Nueva selección múltiple. Puede ser:
   *
   * - File[]
   * - FileList
   * - Un único File
   * - null
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

  const normalizedImages = normalizeImageSelection({
    image,
    images
  })

  validateNewsImages(normalizedImages)

  const formData = new FormData()

  formData.append('titulo', normalizedTitle)

  formData.append('contenido', normalizedContent)

  /*
   * POST /noticias necesita el orden.
   *
   * PATCH /noticias/:id puede ignorarlo cuando el orden se
   * modifica mediante el endpoint específico.
   */
  formData.append('orden', String(normalizedOrder))

  /*
   * Todos los archivos utilizan el mismo nombre de campo.
   *
   * En multipart se enviará:
   *
   * images: archivo-1
   * images: archivo-2
   * images: archivo-3
   */
  normalizedImages.forEach((currentImage) => {
    formData.append('images', currentImage, currentImage.name)
  })

  /*
   * No se envía fecha:
   *
   * - Al crear, el backend genera la fecha.
   * - Al editar, conserva la fecha existente.
   */

  return formData
}

/*
 * Alias para los archivos que todavía utilizan el nombre
 * anterior.
 */
export const buildNoticiaFormData = buildNewsFormData

/* ==========================================================
   IMAGE VALIDATION
========================================================== */

export function validateNewsImage(image) {
  if (!(image instanceof File)) {
    throw new TypeError('Una de las imágenes no es un archivo válido.')
  }

  if (image.size === 0) {
    throw new Error(`La imagen “${image.name}” está vacía.`)
  }

  if (image.size > MAX_IMAGE_SIZE) {
    throw new Error(`La imagen “${image.name}” supera el límite de 12 MB.`)
  }

  if (!isValidImageFormat(image)) {
    throw new Error(`La imagen “${image.name}” debe ser JPG, PNG, WebP o AVIF.`)
  }

  return image
}

export function validateNewsImages(images) {
  const normalizedImages = normalizeImages(images)

  if (normalizedImages.length > MAX_IMAGES) {
    throw new Error(`Cada noticia admite como máximo ${MAX_IMAGES} imágenes.`)
  }

  normalizedImages.forEach(validateNewsImage)

  return normalizedImages
}

export const validateImages = validateNewsImages

/* ==========================================================
   CREATE VALIDATION
========================================================== */

/*
 * Se conserva para componentes antiguos que trabajan con una
 * única imagen.
 */
export function validateCreateNewsImage(image) {
  if (!image) {
    throw new Error('Seleccioná al menos una imagen para la noticia.')
  }

  return validateNewsImage(image)
}

export function validateCreateImages(images) {
  const normalizedImages = validateNewsImages(images)

  if (normalizedImages.length === 0) {
    throw new Error('Seleccioná al menos una imagen para la noticia.')
  }

  return normalizedImages
}

/* ==========================================================
   IMAGE NORMALIZATION
========================================================== */

function normalizeImageSelection({ image, images }) {
  const normalized = [...normalizeImages(image), ...normalizeImages(images)]

  /*
   * Evita agregar dos veces el mismo objeto File cuando un
   * componente entrega simultáneamente image e images.
   */
  return [...new Set(normalized)]
}

function normalizeImages(images) {
  if (images === null || images === undefined) {
    return []
  }

  if (images instanceof File) {
    return [images]
  }

  if (typeof FileList !== 'undefined' && images instanceof FileList) {
    return Array.from(images)
  }

  if (Array.isArray(images)) {
    return [...images]
  }

  try {
    return Array.from(images)
  } catch {
    throw new TypeError('La selección de imágenes no es válida.')
  }
}

function isValidImageFormat(image) {
  /*
   * Algunos navegadores pueden entregar un MIME vacío,
   * especialmente con determinados archivos AVIF.
   *
   * Por eso se valida también la extensión.
   */
  const validMime =
    image.type === '' ||
    VALID_IMAGE_TYPES.has(image.type.toLocaleLowerCase('en-US'))

  const extension = getFileExtension(image.name)

  const validExtension = VALID_IMAGE_EXTENSIONS.has(extension)

  return validMime && validExtension
}

function getFileExtension(filename) {
  const normalizedFilename = String(filename ?? '').trim()

  const lastDot = normalizedFilename.lastIndexOf('.')

  if (lastDot === -1 || lastDot === normalizedFilename.length - 1) {
    return ''
  }

  return normalizedFilename.slice(lastDot + 1).toLocaleLowerCase('en-US')
}

/* ==========================================================
   ORDER
========================================================== */

function normalizeOrder(value) {
  const normalizedOrder = Number(value)

  if (!Number.isInteger(normalizedOrder) || normalizedOrder < 0) {
    throw new TypeError(
      'El orden de la noticia debe ser un entero no negativo.'
    )
  }

  return normalizedOrder
}

/* ==========================================================
   TEXT
========================================================== */

function cleanRequiredText(value, errorMessage) {
  const cleaned = String(value ?? '').trim()

  if (!cleaned) {
    throw new Error(errorMessage)
  }

  return cleaned
}
