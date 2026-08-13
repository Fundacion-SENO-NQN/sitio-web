import { createImagePicker } from '../common/imagePicker.js'

const MAX_IMAGE_SIZE = 12 * 1024 * 1024

/* ==========================================================
   IMAGE PICKER
========================================================== */

export const achievementImagePicker = createImagePicker({
  input: '#image',

  /*
   * Los logros admiten una sola imagen.
   */
  multiple: false,

  maxFiles: 1,

  maxFileSize: MAX_IMAGE_SIZE,

  /*
   * La página de logros utiliza la clase "hidden".
   */
  hiddenClass: 'hidden'
})

/* ==========================================================
   CREATE MODE
========================================================== */

export function configurarImagenParaCrearLogro() {
  achievementImagePicker.reset()

  achievementImagePicker.setRequired(true)
}

/* ==========================================================
   EDIT MODE
========================================================== */

export function configurarImagenParaEditarLogro() {
  achievementImagePicker.reset()

  /*
   * Durante la edición, no seleccionar un archivo nuevo
   * significa conservar la imagen existente.
   */
  achievementImagePicker.setRequired(false)
}

/* ==========================================================
   VALIDATION
========================================================== */

export function validarImagenLogro({ editing = false } = {}) {
  achievementImagePicker.validate()

  if (!editing) achievementImagePicker.requireFiles('La imagen es requerida.')

  return achievementImagePicker.files[0] ?? null
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
