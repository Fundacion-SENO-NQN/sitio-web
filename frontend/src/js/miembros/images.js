import { createImagePicker } from '../common/imagePicker.js'

import { requireElement } from '../common/dom.js'

const IMG_URL = (
  import.meta.env.PUBLIC_IMG_URL ??
  'https://pub-508ef05ca2d548c1b336a8b1f0f31c83.r2.dev'
).replace(/\/+$/, '')

const MAX_IMAGE_SIZE = 12 * 1024 * 1024

/* ==========================================================
   ELEMENTOS
========================================================== */

const imagePreview = requireElement(
  '#memberImagePreview',
  'vista previa de la fotografía del miembro'
)

const imagePlaceholder = requireElement(
  '#memberImagePlaceholder',
  'placeholder de la fotografía del miembro'
)

/* ==========================================================
   ESTADO LOCAL DE LA VISTA PREVIA
========================================================== */

let miembroActual = null
let previewObjectUrl = null

/* ==========================================================
   IMAGE PICKER
========================================================== */

export const memberImagePicker = createImagePicker({
  input: '#memberImage',

  dropZone: '#memberImageUpload',

  helpText: '#memberImageHelp',

  /*
   * Miembros utiliza una sola fotografía.
   */
  multiple: false,

  maxFiles: 1,

  maxFileSize: MAX_IMAGE_SIZE,

  /*
   * La página original utiliza "hidden" y "dragover".
   */
  hiddenClass: 'hidden',

  draggingClass: 'dragover',

  onChange(files) {
    const file = files[0] ?? null

    if (file) {
      mostrarArchivoSeleccionado(file)

      return
    }

    /*
     * Al editar, si se elimina la selección nueva,
     * volvemos a mostrar la fotografía actual.
     */
    if (miembroActual) {
      mostrarImagenActual(miembroActual)

      return
    }

    ocultarVistaPrevia()
  }
})

/* ==========================================================
   MODO CREACIÓN
========================================================== */

export function configurarImagenParaCrearMiembro() {
  miembroActual = null

  liberarPreviewTemporal()

  memberImagePicker.reset()

  memberImagePicker.setRequired(true)

  memberImagePicker.setHelpText(
    'La fotografía es obligatoria al crear un miembro.'
  )

  ocultarVistaPrevia()
}

/* ==========================================================
   MODO EDICIÓN
========================================================== */

export function configurarImagenParaEditarMiembro(miembro) {
  if (!miembro) throw new TypeError('El miembro no es válido.')

  miembroActual = miembro

  liberarPreviewTemporal()

  memberImagePicker.reset()

  memberImagePicker.setRequired(false)

  memberImagePicker.setHelpText(
    'Dejá este campo vacío para conservar la fotografía actual.'
  )

  mostrarImagenActual(miembro)
}

/* ==========================================================
   VALIDACIÓN
========================================================== */

export function validarImagenMiembro({ editing = false } = {}) {
  memberImagePicker.validate()

  if (!editing)
    memberImagePicker.requireFiles('Seleccioná una fotografía para el miembro.')

  return memberImagePicker.files[0] ?? null
}

/* ==========================================================
   VISTA PREVIA DEL ARCHIVO NUEVO
========================================================== */

function mostrarArchivoSeleccionado(file) {
  liberarPreviewTemporal()

  previewObjectUrl = URL.createObjectURL(file)

  mostrarVistaPrevia(previewObjectUrl, `Vista previa de ${file.name}`)
}

/* ==========================================================
   FOTOGRAFÍA ACTUAL
========================================================== */

function mostrarImagenActual(miembro) {
  liberarPreviewTemporal()

  const id = Number(miembro?.id)

  if (!Number.isInteger(id) || id <= 0) {
    ocultarVistaPrevia()

    return
  }

  const nombre = obtenerNombreCompleto(miembro)

  const cacheVersion = Date.now()

  const source = `${IMG_URL}/img_equipo/${id}.avif` + `?admin=${cacheVersion}`

  mostrarVistaPrevia(source, `Fotografía actual de ${nombre}`)
}

/* ==========================================================
   MOSTRAR Y OCULTAR
========================================================== */

function mostrarVistaPrevia(source, alt) {
  imagePreview.src = source

  imagePreview.alt = alt || 'Fotografía del miembro'

  imagePreview.classList.remove('hidden')

  imagePlaceholder.classList.add('hidden')

  imagePreview.onerror = () => {
    ocultarVistaPrevia({
      preserveTemporaryUrl: true
    })
  }
}

function ocultarVistaPrevia({ preserveTemporaryUrl = false } = {}) {
  if (!preserveTemporaryUrl) liberarPreviewTemporal()

  imagePreview.onerror = null

  imagePreview.removeAttribute('src')

  imagePreview.alt = 'Sin fotografía seleccionada'

  imagePreview.classList.add('hidden')

  imagePlaceholder.classList.remove('hidden')
}

/* ==========================================================
   ESTADO
========================================================== */

export function deshabilitarImagenMiembro(disabled) {
  memberImagePicker.setDisabled(disabled)
}

export function limpiarImagenMiembro() {
  miembroActual = null

  liberarPreviewTemporal()

  memberImagePicker.reset()

  memberImagePicker.setRequired(false)

  ocultarVistaPrevia()
}

export function restaurarImagenActualMiembro() {
  memberImagePicker.clearSelected()

  if (miembroActual) mostrarImagenActual(miembroActual)
  else ocultarVistaPrevia()
}

/* ==========================================================
   OBJECT URL
========================================================== */

function liberarPreviewTemporal() {
  if (!previewObjectUrl) return

  URL.revokeObjectURL(previewObjectUrl)

  previewObjectUrl = null
}

/* ==========================================================
   HELPERS
========================================================== */

function obtenerNombreCompleto(miembro) {
  const nombreCompleto = [miembro?.nombre, miembro?.apellido]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .join(' ')

  if (nombreCompleto) return nombreCompleto

  return `miembro n.º ${miembro?.id ?? ''}`.trim()
}
