import { showToast } from './toast.js'

const DEFAULT_IMAGE_URL = (import.meta.env.PUBLIC_IMG_URL ?? '').replace(
  /\/+$/,
  ''
)

const DEFAULT_ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif'
])

const DEFAULT_ALLOWED_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'avif'
])

const DEFAULT_MAX_FILE_SIZE = 12 * 1024 * 1024

/* ==========================================================
   IMAGE PICKER
========================================================== */

/**
 * Reusable image selector.
 *
 * Handles:
 * - File input
 * - Drag and drop
 * - File validation
 * - Multiple or single images
 * - New-image previews
 * - Current-image previews
 * - DataTransfer synchronization
 * - Object URL cleanup
 */
export function createImagePicker({
  input,
  dropZone = null,

  selectedContainer = null,

  currentContainer = null,
  currentGallery = null,

  helpText = null,

  multiple = true,
  maxFiles = 10,

  maxFileSize = DEFAULT_MAX_FILE_SIZE,

  allowedTypes = DEFAULT_ALLOWED_TYPES,

  allowedExtensions = DEFAULT_ALLOWED_EXTENSIONS,

  hiddenClass = 'oculto',
  draggingClass = 'arrastrando',
  disabledClass = 'deshabilitado',

  previewClass = 'preview-imagen',
  previewNumberClass = 'preview-numero',

  imageBaseUrl = DEFAULT_IMAGE_URL,

  clearOnInvalid = true,

  notify = showToast,

  onChange = null,
  onError = null
} = {}) {
  const elements = {
    input: resolveRequiredElement(input, 'image input'),

    dropZone: resolveElement(dropZone),

    selectedContainer: resolveElement(selectedContainer),

    currentContainer: resolveElement(currentContainer),

    currentGallery: resolveElement(currentGallery),

    helpText: resolveElement(helpText)
  }

  const state = {
    files: [],
    previewUrls: [],

    initialized: false,
    disabled: false,
    required: false
  }

  const eventController = new AbortController()

  const eventOptions = {
    signal: eventController.signal
  }

  const controller = {
    initialize,
    destroy,

    setFiles,
    clearSelected,
    clearCurrent,
    reset,

    showCurrentImages,

    setRequired,
    setDisabled,
    setHelpText,

    validate,
    requireFiles,

    appendToFormData,
    focus,

    get files() {
      return [...state.files]
    },

    get count() {
      return state.files.length
    },

    get hasFiles() {
      return state.files.length > 0
    },

    get disabled() {
      return state.disabled
    },

    get required() {
      return state.required
    },

    get input() {
      return elements.input
    }
  }

  return controller

  /* ========================================================
     INITIALIZATION
  ======================================================== */

  function initialize() {
    if (state.initialized) return controller

    state.initialized = true
    state.required = elements.input.required

    elements.input.multiple = Boolean(multiple)

    elements.input.addEventListener('change', handleInputChange, eventOptions)

    elements.dropZone?.addEventListener(
      'dragover',
      handleDragOver,
      eventOptions
    )

    elements.dropZone?.addEventListener(
      'dragleave',
      handleDragLeave,
      eventOptions
    )

    elements.dropZone?.addEventListener('drop', handleDrop, eventOptions)

    return controller
  }

  function destroy() {
    eventController.abort()

    releasePreviewUrls()

    state.files = []
    state.initialized = false
  }

  /* ========================================================
     FILE SELECTION
  ======================================================== */

  function handleInputChange() {
    const files = Array.from(elements.input.files ?? [])

    processSelectedFiles(files, {
      synchronizeInput: false
    })
  }

  function setFiles(files, { synchronizeInput = true } = {}) {
    const normalizedFiles = normalizeFiles(files)

    validate(normalizedFiles)

    state.files = normalizedFiles

    if (synchronizeInput) synchronizeInputFiles()

    renderSelectedImages()

    if (typeof onChange === 'function') {
      onChange(controller.files, controller)
    }

    return controller.files
  }

  function processSelectedFiles(files, options = {}) {
    try {
      setFiles(files, options)
    } catch (error) {
      console.error('Invalid image selection:', error)

      if (clearOnInvalid) clearSelected()

      if (typeof onError === 'function') {
        onError(error, controller)
      }

      notify?.(
        error instanceof Error
          ? error.message
          : 'Las imágenes seleccionadas no son válidas.',
        'warning'
      )
    }
  }

  /* ========================================================
     DRAG AND DROP
  ======================================================== */

  function handleDragOver(event) {
    event.preventDefault()

    if (state.disabled) return

    elements.dropZone?.classList.add(draggingClass)
  }

  function handleDragLeave(event) {
    const relatedTarget = event.relatedTarget

    if (
      relatedTarget instanceof Node &&
      event.currentTarget.contains(relatedTarget)
    )
      return

    elements.dropZone?.classList.remove(draggingClass)
  }

  function handleDrop(event) {
    event.preventDefault()

    elements.dropZone?.classList.remove(draggingClass)

    if (state.disabled) return

    const files = Array.from(event.dataTransfer?.files ?? [])

    if (files.length === 0) return

    processSelectedFiles(files)
  }

  /* ========================================================
     INPUT SYNCHRONIZATION
  ======================================================== */

  function synchronizeInputFiles() {
    try {
      const dataTransfer = new DataTransfer()

      state.files.forEach((file) => {
        dataTransfer.items.add(file)
      })

      elements.input.files = dataTransfer.files
    } catch (error) {
      /*
       * Some older browsers do not allow assigning
       * FileList programmatically. The controller state
       * still keeps the selected files.
       */
      console.warn('Could not synchronize the file input:', error)
    }
  }

  /* ========================================================
     VALIDATION
  ======================================================== */

  function validate(files = state.files) {
    return validateImageFiles(files, {
      multiple,
      maxFiles,
      maxFileSize,
      allowedTypes,
      allowedExtensions
    })
  }

  function requireFiles(message = 'Seleccioná al menos una imagen.') {
    if (state.files.length === 0) throw new Error(message)

    return controller.files
  }

  /* ========================================================
     SELECTED IMAGE PREVIEWS
  ======================================================== */

  function renderSelectedImages() {
    releasePreviewUrls()

    elements.selectedContainer?.replaceChildren()

    if (state.files.length === 0) {
      elements.selectedContainer?.classList.add(hiddenClass)

      return
    }

    const fragment = document.createDocumentFragment()

    state.files.forEach((file, index) => {
      const previewUrl = URL.createObjectURL(file)

      state.previewUrls.push(previewUrl)

      fragment.appendChild(
        createPreviewElement({
          src: previewUrl,

          alt: `Vista previa de ${file.name}`,

          name: file.name,

          number: index + 1,

          previewClass,
          previewNumberClass
        })
      )
    })

    elements.selectedContainer?.appendChild(fragment)

    elements.selectedContainer?.classList.remove(hiddenClass)
  }

  /* ========================================================
     CURRENT IMAGES
  ======================================================== */

  /**
   * Examples:
   *
   * Multiple images:
   *
   * showCurrentImages({
   *   directory: 'img_eventos',
   *   id: 5,
   *   count: 3,
   *   indexed: true
   * })
   *
   * Single image:
   *
   * showCurrentImages({
   *   directory: 'img_equipo',
   *   id: 5,
   *   count: 1,
   *   indexed: false
   * })
   *
   * Explicit URLs:
   *
   * showCurrentImages({
   *   urls: ['https://.../image.avif']
   * })
   */
  function showCurrentImages({
    urls = null,

    id = null,
    count = 0,

    directory = '',
    indexed = true,

    extension = 'avif',

    title = 'elemento',

    cacheBust = true,

    getUrl = null
  } = {}) {
    clearCurrent()

    const resolvedUrls = resolveCurrentImageUrls({
      urls,
      id,
      count,
      directory,
      indexed,
      extension,
      getUrl
    })

    if (resolvedUrls.length === 0) return

    const cacheVersion = Date.now()

    const fragment = document.createDocumentFragment()

    resolvedUrls.forEach((url, index) => {
      const finalUrl = cacheBust
        ? addQueryParameter(url, 'admin', cacheVersion)
        : url

      fragment.appendChild(
        createPreviewElement({
          src: finalUrl,

          alt: `Imagen ${index + 1} de ${title}`,

          name: `Imagen ${index + 1}`,

          number: index + 1,

          previewClass,
          previewNumberClass
        })
      )
    })

    elements.currentGallery?.appendChild(fragment)

    elements.currentContainer?.classList.remove(hiddenClass)
  }

  function resolveCurrentImageUrls({
    urls,
    id,
    count,
    directory,
    indexed,
    extension,
    getUrl
  }) {
    if (Array.isArray(urls)) return urls.filter(Boolean)

    const normalizedCount = Math.max(0, Number(count) || 0)

    if (normalizedCount === 0) return []

    if (typeof getUrl === 'function')
      return Array.from(
        {
          length: normalizedCount
        },
        (_, index) =>
          getUrl({
            id,
            index,
            directory
          })
      ).filter(Boolean)

    if (!imageBaseUrl) throw new Error('PUBLIC_IMG_URL is not configured.')

    if (id === null || id === undefined)
      throw new Error('An id is required to render current images.')

    const normalizedDirectory = String(directory).replace(/^\/+|\/+$/g, '')

    const normalizedExtension = String(extension).replace(/^\.+/, '')

    return Array.from(
      {
        length: normalizedCount
      },
      (_, index) => {
        const filePath = indexed
          ? `${id}/${index}.${normalizedExtension}`
          : `${id}.${normalizedExtension}`

        return [imageBaseUrl, normalizedDirectory, filePath]
          .filter(Boolean)
          .join('/')
      }
    )
  }

  /* ========================================================
     CLEAR AND RESET
  ======================================================== */

  function clearSelected() {
    state.files = []

    releasePreviewUrls()

    elements.input.value = ''

    elements.selectedContainer?.replaceChildren()

    elements.selectedContainer?.classList.add(hiddenClass)

    if (typeof onChange === 'function') onChange([], controller)
  }

  function clearCurrent() {
    elements.currentGallery?.replaceChildren()

    elements.currentContainer?.classList.add(hiddenClass)
  }

  function reset({ clearCurrentImages = true } = {}) {
    clearSelected()

    elements.dropZone?.classList.remove(draggingClass)

    if (clearCurrentImages) clearCurrent()
  }

  function releasePreviewUrls() {
    state.previewUrls.forEach((url) => {
      URL.revokeObjectURL(url)
    })

    state.previewUrls = []
  }

  /* ========================================================
     FORM DATA
  ======================================================== */

  function appendToFormData(formData, fieldName = 'images') {
    if (!(formData instanceof FormData))
      throw new TypeError('appendToFormData requires FormData.')

    state.files.forEach((file) => {
      formData.append(fieldName, file, file.name)
    })

    return formData
  }

  /* ========================================================
     STATE
  ======================================================== */

  function setRequired(required) {
    state.required = Boolean(required)

    elements.input.required = state.required
  }

  function setDisabled(disabled) {
    state.disabled = Boolean(disabled)

    elements.input.disabled = state.disabled

    elements.dropZone?.classList.toggle(disabledClass, state.disabled)

    elements.dropZone?.setAttribute('aria-disabled', String(state.disabled))

    if (state.disabled) elements.dropZone?.classList.remove(draggingClass)
  }

  function setHelpText(text) {
    if (elements.helpText) elements.helpText.textContent = String(text ?? '')
  }

  function focus() {
    elements.input.focus()
  }
}

/* ==========================================================
   REUSABLE VALIDATION
========================================================== */

export function validateImageFiles(
  files,
  {
    multiple = true,
    maxFiles = 10,

    maxFileSize = DEFAULT_MAX_FILE_SIZE,

    allowedTypes = DEFAULT_ALLOWED_TYPES,

    allowedExtensions = DEFAULT_ALLOWED_EXTENSIONS
  } = {}
) {
  const normalizedFiles = normalizeFiles(files)

  const effectiveMaxFiles = multiple ? Math.max(1, Number(maxFiles) || 1) : 1

  if (normalizedFiles.length > effectiveMaxFiles)
    throw new Error(
      effectiveMaxFiles === 1
        ? 'Solo podés seleccionar una imagen.'
        : `Podés seleccionar como máximo ${effectiveMaxFiles} imágenes.`
    )

  normalizedFiles.forEach((file, index) => {
    validateImageFile(file, index, {
      maxFileSize,
      allowedTypes,
      allowedExtensions
    })
  })

  return normalizedFiles
}

function validateImageFile(
  file,
  index,
  { maxFileSize, allowedTypes, allowedExtensions }
) {
  const number = index + 1

  if (!(file instanceof File))
    throw new TypeError(`La imagen ${number} no es un archivo válido.`)

  const type = file.type?.toLowerCase().trim()

  const extension = getFileExtension(file.name)

  const validType = type && allowedTypes.has(type)

  const validExtension = extension && allowedExtensions.has(extension)

  /*
   * Some browsers leave File.type empty. In that case,
   * the file extension is used as a fallback.
   */
  if (!validType && !validExtension)
    throw new Error(`La imagen ${number} no tiene un formato permitido.`)

  if (file.size === 0) throw new Error(`La imagen ${number} está vacía.`)

  if (Number.isFinite(maxFileSize) && file.size > maxFileSize)
    throw new Error(
      `La imagen ${number} supera el límite de ${formatBytes(maxFileSize)}.`
    )
}

/* ==========================================================
   PREVIEW ELEMENT
========================================================== */

function createPreviewElement({
  src,
  alt,
  name,
  number,

  previewClass,
  previewNumberClass
}) {
  const figure = document.createElement('figure')

  figure.className = previewClass

  const image = document.createElement('img')

  image.src = src
  image.alt = alt
  image.loading = 'lazy'
  image.decoding = 'async'

  image.addEventListener(
    'error',
    () => {
      image.removeAttribute('src')

      image.alt = 'Imagen no disponible'

      figure.classList.add('preview-imagen-error')
    },
    {
      once: true
    }
  )

  const numberElement = document.createElement('span')

  numberElement.className = previewNumberClass

  numberElement.textContent = String(number)

  numberElement.setAttribute('aria-hidden', 'true')

  const caption = document.createElement('figcaption')

  caption.textContent = name
  caption.title = name

  figure.append(image, numberElement, caption)

  return figure
}

/* ==========================================================
   HELPERS
========================================================== */

function normalizeFiles(files) {
  if (!files) return []

  if (files instanceof FileList || Array.isArray(files))
    return Array.from(files)

  if (files instanceof File) return [files]

  throw new TypeError('La lista de imágenes no es válida.')
}

function getFileExtension(name) {
  const parts = String(name ?? '')
    .toLowerCase()
    .split('.')

  if (parts.length < 2) return ''

  return parts.at(-1) ?? ''
}

function formatBytes(bytes) {
  const megabytes = bytes / 1024 / 1024

  if (megabytes >= 1) return `${Number(megabytes.toFixed(1))} MB`

  const kilobytes = bytes / 1024

  return `${Math.ceil(kilobytes)} KB`
}

function addQueryParameter(url, name, value) {
  const separator = String(url).includes('?') ? '&' : '?'

  return (
    `${url}${separator}` +
    `${encodeURIComponent(name)}=` +
    `${encodeURIComponent(value)}`
  )
}

/* ==========================================================
   DOM HELPERS
========================================================== */

function resolveRequiredElement(value, name) {
  const element = resolveElement(value)

  if (!element) throw new Error(`Could not find ${name}.`)

  return element
}

function resolveElement(value) {
  if (!value) return null

  if (value instanceof Element) return value

  if (typeof value === 'string') return document.querySelector(value)

  return null
}
