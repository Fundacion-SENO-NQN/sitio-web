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

export function buildMemberFormData({
  nombre,
  apellido,
  puesto,
  descripcion,

  /*
   * Compatibilidad opcional con nombres en inglés.
   */
  name,
  lastName,
  position,
  description,

  image = null
} = {}) {
  const normalizedName = cleanRequiredText(
    nombre ?? name,
    'El nombre es requerido.'
  )

  const normalizedLastName = cleanRequiredText(
    apellido ?? lastName,
    'El apellido es requerido.'
  )

  const normalizedPosition = cleanRequiredText(
    puesto ?? position,
    'El puesto es requerido.'
  )

  const normalizedDescription = cleanRequiredText(
    descripcion ?? description,
    'La descripción es requerida.'
  )

  const normalizedImage = normalizeImage(image)

  if (normalizedImage) validateMemberImage(normalizedImage)

  const formData = new FormData()

  formData.append('nombre', normalizedName)

  formData.append('apellido', normalizedLastName)

  formData.append('puesto', normalizedPosition)

  formData.append('descripcion', normalizedDescription)

  /*
   * Al editar, si no se seleccionó una imagen nueva, este
   * campo no se envía y el backend conserva la fotografía.
   */
  if (normalizedImage)
    formData.append('image', normalizedImage, normalizedImage.name)

  return formData
}

/*
 * Alias para mantener compatibilidad con nombres anteriores.
 */
export const buildMiembroFormData = buildMemberFormData

/* ==========================================================
   IMAGE VALIDATION
========================================================== */

export function validateMemberImage(image) {
  if (!(image instanceof File))
    throw new TypeError('La fotografía no es un archivo válido.')

  if (!VALID_IMAGE_TYPES.has(image.type))
    throw new Error('La fotografía debe ser JPG, PNG, WebP o AVIF.')

  if (image.size === 0) throw new Error('La fotografía está vacía.')

  if (image.size > MAX_IMAGE_SIZE)
    throw new Error('La fotografía supera el límite de 12 MB.')

  return image
}

/*
 * Validación para la creación de un miembro, donde la
 * fotografía sí es obligatoria.
 */
export function validateCreateMemberImage(image) {
  const normalizedImage = normalizeImage(image)

  if (!normalizedImage)
    throw new Error('Seleccioná una fotografía para el miembro.')

  return validateMemberImage(normalizedImage)
}

/* ==========================================================
   MEMBER DATA VALIDATION
========================================================== */

export function validateMemberData({
  nombre,
  apellido,
  puesto,
  descripcion,

  name,
  lastName,
  position,
  description
} = {}) {
  return {
    nombre: cleanRequiredText(nombre ?? name, 'El nombre es requerido.'),

    apellido: cleanRequiredText(
      apellido ?? lastName,
      'El apellido es requerido.'
    ),

    puesto: cleanRequiredText(puesto ?? position, 'El puesto es requerido.'),

    descripcion: cleanRequiredText(
      descripcion ?? description,
      'La descripción es requerida.'
    )
  }
}

/* ==========================================================
   IMAGE NORMALIZATION
========================================================== */

function normalizeImage(image) {
  if (image === null || image === undefined || image === '') return null

  if (image instanceof File) return image

  /*
   * Admite que accidentalmente se pase un FileList o un
   * arreglo proveniente de createImagePicker().
   */
  if (typeof image === 'object' && typeof image.length === 'number') {
    const images = Array.from(image)

    if (images.length === 0) return null

    if (images.length > 1)
      throw new Error('Cada miembro admite una sola fotografía.')

    return images[0]
  }

  throw new TypeError('La fotografía seleccionada no es válida.')
}

/* ==========================================================
   TEXT
========================================================== */

function cleanRequiredText(value, errorMessage) {
  const cleaned = String(value ?? '').trim()

  if (!cleaned) throw new Error(errorMessage)

  return cleaned
}
