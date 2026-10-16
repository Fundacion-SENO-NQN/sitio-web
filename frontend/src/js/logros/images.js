import { createImagePicker } from '../common/imagePicker.js'

const MAX_IMAGE_SIZE = 12 * 1024 * 1024

/* ==========================================================
   IMAGE PICKER
========================================================== */

export const achievementImagePicker = createImagePicker({
  input: '#image',

  dropZone: '#zona-subida-imagenes',

  selectedContainer: '#imagenes-seleccionadas',

  currentContainer: '#imagenes-actuales-contenedor',

  currentGallery: '#imagenes-actuales',

  helpText: '#texto-ayuda-imagenes',

  /*
   * Los logros admiten hasta 3 imágenes.
   */
  multiple: true,

  maxFiles: 3,

  maxFileSize: MAX_IMAGE_SIZE,

  /*
   * La página de logros utiliza la clase "hidden".
   */
  hiddenClass: 'oculto',

  draggingClass: 'arrastrando',

  previewClass: 'preview-imagen',

  previewNumberClass: 'preview-numero',
})

/* ==========================================================
   CREATE MODE
========================================================== */

export function configurarImagenParaCrearLogro() {
  achievementImagePicker.reset()

  achievementImagePicker.setRequired(true)

  achievementImagePicker.setHelpText(
    'Seleccioná hasta 3 imágenes para el logro.',
  )
}

/* ==========================================================
   EDIT MODE
========================================================== */

export function configurarImagenParaEditarLogro(logro) {
  if (!logro) throw new TypeError('El logro no es válido.')

  achievementImagePicker.reset()

  /*
   * Durante la edición, no seleccionar un archivo nuevo
   * significa conservar la imagen existente.
   */
  achievementImagePicker.setRequired(false)

  achievementImagePicker.setHelpText(
    'Dejá este campo vacío para conservar las imágenes actuales.',
  )

  achievementImagePicker.showCurrentImages({
    id: logro.id,

    count: logro.image_count ?? 1, // Fallback to 1 for backwards compatibility if image_count is missing

    directory: 'img_logros',

    indexed: false, // In the original code we don't index for 1, but we do for > 1. Let's provide a custom getUrl.

    getUrl: ({ id, index, directory }) => {
      const IMG_URL = (
        import.meta.env.PUBLIC_IMG_URL ??
        'https://pub-508ef05ca2d548c1b336a8b1f0f31c83.r2.dev'
      ).replace(/\/+$/, '')

      if (index === 0) {
        return `${IMG_URL}/${directory}/${id}.avif`
      } else {
        return `${IMG_URL}/${directory}/${id}_${index + 1}.avif`
      }
    },

    title: logro.titulo,

    cacheBust: true,
  })
}

/* ==========================================================
   VALIDATION
========================================================== */

export function validarImagenLogro({ editing = false } = {}) {
  achievementImagePicker.validate()

  if (!editing) achievementImagePicker.requireFiles('La imagen es requerida.')

  return achievementImagePicker.files.length > 0
    ? achievementImagePicker.files
    : null
}

/* ==========================================================
   STATE
========================================================== */

export function deshabilitarImagenLogro(disabled) {
  achievementImagePicker.setDisabled(disabled)
}

export function limpiarImagenLogro() {
  achievementImagePicker.reset()

  achievementImagePicker.setRequired(false)
}
