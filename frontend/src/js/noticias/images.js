import { createImagePicker } from '../common/imagePicker.js'

const MAX_IMAGES = 10

const MAX_IMAGE_SIZE = 12 * 1024 * 1024

/* ==========================================================
   IMAGE PICKER
========================================================== */

export const newsImagePicker = createImagePicker({
  input: '#noticia-imagenes',

  dropZone: '#zona-subida-imagenes',

  selectedContainer: '#imagenes-seleccionadas',

  currentContainer: '#imagenes-actuales-contenedor',

  currentGallery: '#imagenes-actuales',

  helpText: '#texto-ayuda-imagenes',

  multiple: true,

  maxFiles: MAX_IMAGES,

  maxFileSize: MAX_IMAGE_SIZE,

  hiddenClass: 'oculto',

  draggingClass: 'arrastrando',

  previewClass: 'preview-imagen',

  previewNumberClass: 'preview-numero'
})

/* ==========================================================
   CREATE MODE
========================================================== */

export function configurarImagenesParaCrearNoticia() {
  newsImagePicker.reset()

  newsImagePicker.setRequired(true)

  newsImagePicker.setHelpText(
    'Seleccioná entre 1 y 10 imágenes para la noticia.'
  )
}

/* ==========================================================
   EDIT MODE
========================================================== */

export function configurarImagenesParaEditarNoticia(noticia) {
  if (!noticia) throw new TypeError('La noticia no es válida.')

  newsImagePicker.reset()

  /*
   * En edición, la selección de imágenes es opcional.
   *
   * Si no se seleccionan archivos nuevos, el backend
   * conserva las imágenes actuales.
   */
  newsImagePicker.setRequired(false)

  newsImagePicker.setHelpText(
    'Dejá este campo vacío para conservar las imágenes actuales.'
  )

  newsImagePicker.showCurrentImages({
    id: noticia.id,

    count: noticia.cant_img,

    directory: 'img_noticias',

    indexed: true,

    extension: 'avif',

    title: obtenerTituloNoticia(noticia),

    /*
     * Evita mostrar una versión anterior almacenada
     * en la caché del navegador.
     */
    cacheBust: true
  })
}

/* ==========================================================
   VALIDATION
========================================================== */

export function validarImagenesNoticia({ editing = false } = {}) {
  newsImagePicker.validate()

  /*
   * Al crear una noticia debe enviarse al menos una imagen.
   * En edición, cero archivos significa conservar las
   * imágenes existentes.
   */
  if (!editing)
    newsImagePicker.requireFiles(
      'Seleccioná al menos una imagen para crear la noticia.'
    )

  return newsImagePicker.files
}

/* ==========================================================
   STATE
========================================================== */

export function deshabilitarImagenesNoticia(disabled) {
  newsImagePicker.setDisabled(disabled)
}

export function limpiarImagenesNoticia() {
  newsImagePicker.reset()
}

/* ==========================================================
   HELPERS
========================================================== */

function obtenerTituloNoticia(noticia) {
  const titulo = String(noticia?.titulo ?? '').trim()

  if (titulo) return titulo

  return `noticia ${noticia?.id ?? ''}`.trim()
}
