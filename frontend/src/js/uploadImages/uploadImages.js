import { donationImagesApi } from '../common/resources.js'

import { createImagePicker } from '../common/imagePicker.js'

import { createEventScope, requireElement } from '../common/dom.js'

import { showToast } from '../common/toast.js'

const MAX_IMAGES = 10

const MAX_IMAGE_SIZE = 12 * 1024 * 1024

/* ==========================================================
   ELEMENTOS
========================================================== */

const form = requireElement('#uploadForm', 'formulario de imágenes de donación')

const uploadButton = requireElement('#btnUpload', 'botón para subir imágenes')

const dropZone = requireElement('#dropZone', 'zona de arrastre de imágenes')

const previewContainer = requireElement(
  '#previewContainer',
  'contenedor de vistas previas'
)

const modalCarga = requireElement('#modal-carga', 'indicador de carga')

/* ==========================================================
   IMAGE PICKER
========================================================== */

export const donationImagePicker = createImagePicker({
  input: '#images',

  dropZone: '#dropZone',

  previewContainer: '#previewContainer',

  multiple: true,

  maxFiles: MAX_IMAGES,

  maxFileSize: MAX_IMAGE_SIZE,

  dragClass: 'drag',

  previewClassName: 'preview',

  removeButtonClassName: 'remove',

  hiddenClass: 'hidden'
})

/* ==========================================================
   ESTADO
========================================================== */

const state = {
  initialized: false,
  uploading: false,

  currentUpload: 0,
  totalUploads: 0
}

const events = createEventScope()

/* ==========================================================
   CONTROLADOR PÚBLICO
========================================================== */

export const donationImagesController = {
  initialize,
  destroy,

  upload: uploadSelectedImages,

  clear: clearSelection,

  get files() {
    return [...donationImagePicker.files]
  },

  get uploading() {
    return state.uploading
  }
}

/* ==========================================================
   INITIALIZATION
========================================================== */

function initialize() {
  if (state.initialized) return donationImagesController

  donationImagePicker.initialize()

  events.on(form, 'submit', uploadSelectedImages)

  /*
   * El selector actualiza primero su estado interno.
   * Después sincronizamos el texto y estado del botón.
   */
  events.on(
    requireElement('#images', 'selector de imágenes'),
    'change',
    synchronizeSoon
  )

  events.on(dropZone, 'drop', synchronizeSoon)

  /*
   * Los botones para eliminar vistas previas se crean
   * dinámicamente dentro del contenedor.
   */
  events.on(previewContainer, 'click', synchronizeSoon)

  hideLoading()
  updateUploadButton()

  state.initialized = true

  return donationImagesController
}

function destroy() {
  if (!state.initialized) return

  events.destroy()

  donationImagePicker.reset()
  donationImagePicker.setDisabled(false)

  state.initialized = false
  state.uploading = false
  state.currentUpload = 0
  state.totalUploads = 0

  hideLoading()
  updateUploadButton()
}

/* ==========================================================
   SUBMIT
========================================================== */

async function uploadSelectedImages(event) {
  event?.preventDefault()

  if (state.uploading) return false

  try {
    donationImagePicker.validate()

    donationImagePicker.requireFiles('Seleccioná al menos una imagen.')
  } catch (error) {
    showToast(
      getErrorMessage(error, 'Las imágenes seleccionadas no son válidas.'),
      'warning'
    )

    donationImagePicker.focus?.()

    return false
  }

  const files = [...donationImagePicker.files]

  state.uploading = true
  state.currentUpload = 0
  state.totalUploads = files.length

  donationImagePicker.setDisabled(true)

  showLoading()
  updateUploadButton()

  let uploadedImages = 0

  try {
    /*
     * Las imágenes se envían secuencialmente.
     *
     * El backend reemplaza la imagen de donación más antigua
     * en cada petición. Ejecutarlas en paralelo podría hacer
     * que varias peticiones intenten reemplazar la misma.
     */
    for (let index = 0; index < files.length; index += 1) {
      state.currentUpload = index + 1

      updateUploadButton()

      await donationImagesApi.upload(files[index])

      uploadedImages += 1
    }

    clearSelection()

    showToast(createSuccessMessage(uploadedImages), 'success')

    return true
  } catch (error) {
    console.error('No se pudieron subir las imágenes de donación:', error)

    /*
     * Como cada imagen se guarda mediante una petición
     * independiente, puede haber cargas parciales.
     *
     * Se limpia la selección para evitar que el usuario
     * vuelva a subir accidentalmente las ya guardadas.
     */
    if (uploadedImages > 0) {
      clearSelection()

      showToast(
        createPartialErrorMessage({
          uploadedImages,
          totalImages: files.length,

          error
        }),
        'error'
      )
    } else
      showToast(getErrorMessage(error, 'No se pudo subir la imagen.'), 'error')

    return false
  } finally {
    state.uploading = false
    state.currentUpload = 0
    state.totalUploads = 0

    donationImagePicker.setDisabled(false)

    hideLoading()
    updateUploadButton()
  }
}

/* ==========================================================
   CLEAR
========================================================== */

function clearSelection() {
  donationImagePicker.reset()

  /*
   * reset() elimina los archivos, las vistas previas y
   * libera las URL creadas mediante URL.createObjectURL().
   */
  updateUploadButton()
}

/* ==========================================================
   BUTTON STATE
========================================================== */

function updateUploadButton() {
  const fileCount = donationImagePicker.files.length

  uploadButton.disabled = state.uploading || fileCount === 0

  uploadButton.setAttribute('aria-busy', String(state.uploading))

  if (state.uploading) {
    uploadButton.textContent = createUploadingText()

    return
  }

  uploadButton.textContent =
    fileCount > 1 ? `Subir ${fileCount} imágenes` : 'Subir imagen'
}

function createUploadingText() {
  if (state.totalUploads <= 1) return 'Subiendo imagen...'

  return (
    `Subiendo imagen ` +
    `${state.currentUpload} de ` +
    `${state.totalUploads}...`
  )
}

/* ==========================================================
   LOADING
========================================================== */

function showLoading() {
  modalCarga.hidden = false

  modalCarga.style.display = 'flex'

  modalCarga.setAttribute('aria-hidden', 'false')

  modalCarga.setAttribute('aria-busy', 'true')
}

function hideLoading() {
  modalCarga.hidden = true

  modalCarga.style.display = 'none'

  modalCarga.setAttribute('aria-hidden', 'true')

  modalCarga.setAttribute('aria-busy', 'false')
}

/* ==========================================================
   MESSAGES
========================================================== */

function createSuccessMessage(amount) {
  return amount === 1
    ? 'Imagen cargada exitosamente.'
    : `${amount} imágenes cargadas exitosamente.`
}

function createPartialErrorMessage({ uploadedImages, totalImages, error }) {
  const pendingImages = Math.max(totalImages - uploadedImages, 0)

  const uploadText =
    uploadedImages === 1
      ? 'Se cargó 1 imagen'
      : `Se cargaron ${uploadedImages} imágenes`

  const pendingText =
    pendingImages === 1
      ? 'Quedó 1 imagen sin cargar.'
      : `Quedaron ${pendingImages} imágenes sin cargar.`

  return (
    `${uploadText}, pero ocurrió un error. ` +
    `${pendingText} ` +
    getErrorMessage(error, '')
  ).trim()
}

function getErrorMessage(error, fallback) {
  if (typeof error?.message === 'string' && error.message.trim())
    return error.message.trim()

  if (typeof error === 'string' && error.trim()) return error.trim()

  return fallback
}

/* ==========================================================
   SYNCHRONIZATION
========================================================== */

function synchronizeSoon() {
  window.setTimeout(updateUploadButton, 0)
}

/* ==========================================================
   EJECUCIÓN
========================================================== */

initialize()
