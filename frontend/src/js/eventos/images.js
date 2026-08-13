import { createImagePicker } from '../common/imagePicker.js'

const MAX_IMAGES = 10
const MAX_IMAGE_SIZE = 12 * 1024 * 1024

/* ==========================================================
   IMAGE PICKER
========================================================== */

export const eventImagePicker = createImagePicker({
  input: '#evento-imagenes',

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

export function configurarImagenesParaCrearEvento() {
  eventImagePicker.reset()

  eventImagePicker.setRequired(true)

  eventImagePicker.setHelpText(
    'Seleccioná entre 1 y 10 imágenes para el evento.'
  )
}

/* ==========================================================
   EDIT MODE
========================================================== */

export function configurarImagenesParaEditarEvento(evento) {
  eventImagePicker.reset()

  eventImagePicker.setRequired(false)

  eventImagePicker.setHelpText(
    'Dejá este campo vacío para conservar las imágenes actuales.'
  )

  eventImagePicker.showCurrentImages({
    id: evento.id,

    count: evento.cant_img,

    directory: 'img_eventos',

    indexed: true,

    extension: 'avif',

    title: obtenerTituloEvento(evento),

    cacheBust: true
  })
}

/* ==========================================================
   VALIDATION
========================================================== */

export function validarImagenesEvento({ editing = false } = {}) {
  eventImagePicker.validate()

  if (!editing)
    eventImagePicker.requireFiles(
      'Seleccioná al menos una imagen para crear el evento.'
    )

  return eventImagePicker.files
}

/* ==========================================================
   STATE
========================================================== */

export function deshabilitarImagenesEvento(disabled) {
  eventImagePicker.setDisabled(disabled)
}

export function limpiarImagenesEvento() {
  eventImagePicker.reset()
}

/* ==========================================================
   HELPERS
========================================================== */

function obtenerTituloEvento(evento) {
  const titulo = String(evento?.titulo ?? '').trim()

  if (titulo) return titulo

  return `evento ${evento?.id ?? ''}`.trim()
}
