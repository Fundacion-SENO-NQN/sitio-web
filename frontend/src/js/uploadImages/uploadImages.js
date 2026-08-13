import { donationImagesApi } from '../common/resources.js'

import { createImagePicker } from '../common/imagePicker.js'

import { createEventScope, requireElement } from '../common/dom.js'

import { showToast } from '../common/toast.js'

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
   ELEMENTS
========================================================== */

const form = requireElement('#uploadForm', 'formulario de imágenes de donación')

const uploadButton = requireElement('#btnUpload', 'botón para subir imágenes')

const clearButton = document.querySelector('#btnClearImages')

const modalCarga = requireElement('#modal-carga', 'indicador de carga')

/* ==========================================================
   STATE
========================================================== */

const state = {
  initialized: false,
  uploading: false,

  currentUpload: 0,
  totalUploads: 0
}

let events = null

/* ==========================================================
   IMAGE PICKER
========================================================== */

export const donationImagePicker = createImagePicker({
  input: '#images',

  dropZone: '#dropZone',

  /*
   * This is the correct option name expected by
   * common/imagePicker.js.
   */
  selectedContainer: '#previewContainer',

  multiple: true,

  maxFiles: MAX_IMAGES,

  maxFileSize: MAX_IMAGE_SIZE,

  allowedTypes: VALID_IMAGE_TYPES,

  allowedExtensions: VALID_IMAGE_EXTENSIONS,

  hiddenClass: 'hidden',

  draggingClass: 'drag',

  disabledClass: 'disabled',

  previewClass: 'preview',

  previewNumberClass: 'previewNumber',

  /*
   * imagePicker already calls onChange after:
   *
   * - input selection
   * - drag and drop
   * - reset
   * - setFiles()
   */
  onChange() {
    updateUploadButton()
  }
})

/* ==========================================================
   PUBLIC CONTROLLER
========================================================== */

export const donationImagesController = {
  initialize,
  destroy,

  upload: uploadSelectedImages,

  clear: clearSelection,

  get files() {
    return donationImagePicker.files
  },

  get uploading() {
    return state.uploading
  }
}

/* ==========================================================
   INITIALIZATION
========================================================== */

function initialize() {
  if (state.initialized) {
    return donationImagesController
  }

  events = createEventScope()

  donationImagePicker.initialize()

  events.on(form, 'submit', uploadSelectedImages)

  if (clearButton) {
    events.on(clearButton, 'click', clearSelection)
  }

  hideLoading()
  updateUploadButton()

  state.initialized = true
  document.getElementById('modal-carga-global').remove()
  return donationImagesController
}

function destroy() {
  if (!state.initialized) {
    return
  }

  events?.destroy()
  events = null

  donationImagePicker.destroy()

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

  if (state.uploading) {
    return false
  }

  let files

  try {
    files = donationImagePicker.validate()

    donationImagePicker.requireFiles('Seleccioná al menos una imagen.')
  } catch (error) {
    showToast(
      getErrorMessage(error, 'Las imágenes seleccionadas no son válidas.'),
      'warning'
    )

    donationImagePicker.focus()

    return false
  }

  /*
   * Use an independent array because the picker state may
   * be changed later when preserving pending files.
   */
  files = [...files]

  state.uploading = true
  state.currentUpload = 0
  state.totalUploads = files.length

  donationImagePicker.setDisabled(true)

  showLoading()
  updateUploadButton()

  let uploadedImages = 0

  try {
    /*
     * The backend replaces the oldest donation image on
     * every request.
     *
     * Sequential requests avoid two requests attempting to
     * replace the same image simultaneously.
     */
    for (let index = 0; index < files.length; index += 1) {
      state.currentUpload = index + 1

      updateUploadButton()

      await donationImagesApi.upload(files[index])

      uploadedImages += 1
    }

    donationImagePicker.reset()

    showToast(createSuccessMessage(uploadedImages), 'success')

    return true
  } catch (error) {
    console.error('No se pudieron subir las imágenes de donación:', error)

    /*
     * Preserve only files that were not uploaded.
     *
     * Example:
     *
     * Selected: A, B, C
     * Uploaded: A
     * Failed:   B
     *
     * The picker keeps B and C, so A is not accidentally
     * uploaded again.
     */
    if (uploadedImages > 0) {
      const pendingFiles = files.slice(uploadedImages)

      donationImagePicker.setFiles(pendingFiles)

      showToast(
        createPartialErrorMessage({
          uploadedImages,

          totalImages: files.length,

          error
        }),
        'error'
      )
    } else {
      /*
       * No image was uploaded, so keep the complete
       * selection available for retrying.
       */
      showToast(getErrorMessage(error, 'No se pudo subir la imagen.'), 'error')
    }

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
  if (state.uploading) {
    return
  }

  donationImagePicker.reset()
}

/* ==========================================================
   BUTTON STATE
========================================================== */

function updateUploadButton() {
  const fileCount = donationImagePicker.count

  uploadButton.disabled = state.uploading || fileCount === 0

  uploadButton.setAttribute('aria-busy', String(state.uploading))

  if (state.uploading) {
    uploadButton.textContent = createUploadingText()

    if (clearButton) {
      clearButton.disabled = true
    }

    return
  }

  uploadButton.textContent =
    fileCount === 1 ? 'Subir imagen' : `Subir ${fileCount} imágenes`

  if (clearButton) {
    clearButton.disabled = fileCount === 0
  }
}

function createUploadingText() {
  if (state.totalUploads <= 1) {
    return 'Subiendo imagen...'
  }

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

  modalCarga.setAttribute('aria-hidden', 'false')

  modalCarga.setAttribute('aria-busy', 'true')
}

function hideLoading() {
  modalCarga.hidden = true

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

  const uploadedText =
    uploadedImages === 1
      ? 'Se cargó 1 imagen'
      : `Se cargaron ${uploadedImages} imágenes`

  const pendingText =
    pendingImages === 1
      ? 'Quedó 1 imagen sin cargar.'
      : `Quedaron ${pendingImages} imágenes sin cargar.`

  const errorMessage = getErrorMessage(error, '')

  return [`${uploadedText}, pero ocurrió un error.`, pendingText, errorMessage]
    .filter(Boolean)
    .join(' ')
}

function getErrorMessage(error, fallback) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }

  return fallback
}

/* ==========================================================
   EXECUTION
========================================================== */

initialize()
