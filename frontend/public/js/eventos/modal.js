import { createEvento, patchEvento } from '../common/api.js'

import { buildEventoFormData, validateImages } from './formData.js'

import { refreshEventos } from './eventos.js'

import { showToast } from '../common/toast.js'

const IMG_URL = (
  import.meta.env.PUBLIC_IMG_URL ??
  'https://pub-508ef05ca2d548c1b336a8b1f0f31c83.r2.dev'
).replace(/\/+$/, '')

const MAX_IMAGES = 10

const MAX_IMAGE_SIZE = 12 * 1024 * 1024

const VALID_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif'
])

/* ==========================================================
   ELEMENTOS
========================================================== */

const modal = document.getElementById('modal-evento')

const form = document.getElementById('form-evento')

const modalTitle = document.getElementById('modal-evento-titulo')

const titleInput = document.getElementById('evento-titulo')

const descriptionInput = document.getElementById('evento-descripcion')

const dateInput = document.getElementById('evento-fecha')

const timeInput = document.getElementById('evento-horario')

const placeInput = document.getElementById('evento-lugar')

const urlInput = document.getElementById('evento-url')

const urlTitleInput = document.getElementById('evento-url-titulo')

const imagesInput = document.getElementById('evento-imagenes')

const uploadArea = document.getElementById('zona-subida-imagenes')

const selectedImagesContainer = document.getElementById(
  'imagenes-seleccionadas'
)

const currentImagesContainer = document.getElementById(
  'imagenes-actuales-contenedor'
)

const currentImagesGallery = document.getElementById('imagenes-actuales')

const imagesHelpText = document.getElementById('texto-ayuda-imagenes')

const closeButton = document.getElementById('btn-cerrar-modal-evento')

const cancelButton = document.getElementById('btn-cancelar-evento')

const saveButton = document.getElementById('btn-guardar-evento')

const modalBackground = modal?.querySelector('[data-cerrar-modal-evento]')

/* ==========================================================
   ESTADO
========================================================== */

let eventoEditando = null
let enviandoFormulario = false

let imagenesSeleccionadas = []
let previewUrls = []

/* ==========================================================
   REGISTRAR EVENTOS
========================================================== */

export function registrarEventosModal() {
  form?.addEventListener('submit', guardarEvento)

  closeButton?.addEventListener('click', cerrarModalEvento)

  cancelButton?.addEventListener('click', cerrarModalEvento)

  modalBackground?.addEventListener('click', cerrarModalEvento)

  imagesInput?.addEventListener('change', manejarSeleccionArchivos)

  uploadArea?.addEventListener('dragover', manejarDragOver)

  uploadArea?.addEventListener('dragleave', manejarDragLeave)

  uploadArea?.addEventListener('drop', manejarDrop)

  document.addEventListener('keydown', manejarTeclado)
}

/* ==========================================================
   ABRIR PARA CREAR
========================================================== */

export function abrirModalCrearEvento() {
  if (enviandoFormulario) {
    return
  }

  eventoEditando = null

  limpiarFormulario()

  if (modalTitle) {
    modalTitle.textContent = 'Nuevo evento'
  }

  if (saveButton) {
    saveButton.textContent = 'Guardar evento'
  }

  if (imagesInput) {
    imagesInput.required = true
  }

  if (imagesHelpText) {
    imagesHelpText.textContent =
      'Seleccioná entre 1 y 10 imágenes para el evento.'
  }

  currentImagesContainer?.classList.add('oculto')

  abrirModal()

  window.setTimeout(() => {
    titleInput?.focus()
  }, 0)
}

/* ==========================================================
   ABRIR PARA EDITAR
========================================================== */

export function abrirModalEditarEvento(evento) {
  if (enviandoFormulario || !evento) {
    return
  }

  eventoEditando = evento

  limpiarFormulario()

  if (modalTitle) {
    modalTitle.textContent = 'Editar evento'
  }

  if (saveButton) {
    saveButton.textContent = 'Guardar cambios'
  }

  if (titleInput) {
    titleInput.value = evento.titulo ?? ''
  }

  if (descriptionInput) {
    descriptionInput.value = evento.descripcion ?? ''
  }

  if (dateInput) {
    dateInput.value = evento.fecha ?? ''
  }

  if (timeInput) {
    timeInput.value = evento.horario ?? ''
  }

  if (placeInput) {
    placeInput.value = evento.lugar ?? ''
  }

  if (urlInput) {
    urlInput.value = evento.url ?? ''
  }

  if (urlTitleInput) {
    urlTitleInput.value = evento.url_titulo ?? ''
  }

  if (imagesInput) {
    imagesInput.required = false
  }

  if (imagesHelpText) {
    imagesHelpText.textContent =
      'Dejá este campo vacío para conservar las imágenes actuales.'
  }

  renderizarImagenesActuales(evento)

  abrirModal()

  window.setTimeout(() => {
    titleInput?.focus()
  }, 0)
}

/* ==========================================================
   GUARDAR
========================================================== */

async function guardarEvento(event) {
  event.preventDefault()

  if (enviandoFormulario || !form) {
    return
  }

  const titulo = titleInput?.value.trim() ?? ''

  const descripcion = descriptionInput?.value.trim() ?? ''

  if (!titulo) {
    showToast('El título es requerido.', 'warning')

    titleInput?.focus()

    return
  }

  if (!descripcion) {
    showToast('La descripción es requerida.', 'warning')

    descriptionInput?.focus()

    return
  }

  if (!eventoEditando && imagenesSeleccionadas.length === 0) {
    showToast('Seleccioná al menos una imagen.', 'warning')

    imagesInput?.focus()

    return
  }

  try {
    validateImages(imagenesSeleccionadas)

    validarTamanioImagenes(imagenesSeleccionadas)

    const formData = buildEventoFormData({
      titulo,
      descripcion,

      lugar: placeInput?.value ?? '',

      fecha: dateInput?.value ?? '',

      horario: timeInput?.value ?? '',

      url: urlInput?.value ?? '',

      urlTitulo: urlTitleInput?.value ?? '',

      images: imagenesSeleccionadas
    })

    enviandoFormulario = true
    actualizarEstadoGuardado(true)

    if (eventoEditando) {
      await patchEvento(eventoEditando.id, formData)

      showToast('El evento fue actualizado correctamente.')
    } else {
      await createEvento(formData)

      showToast('El evento fue creado correctamente.')
    }

    cerrarModalEvento()

    await refreshEventos()
  } catch (error) {
    console.error('No se pudo guardar el evento:', error)

    showToast(error.message || 'No se pudo guardar el evento.', 'error')
  } finally {
    enviandoFormulario = false
    actualizarEstadoGuardado(false)
  }
}

/* ==========================================================
   SELECCIÓN DE ARCHIVOS
========================================================== */

function manejarSeleccionArchivos() {
  const archivos = Array.from(imagesInput?.files ?? [])

  procesarImagenesSeleccionadas(archivos)
}

function procesarImagenesSeleccionadas(archivos) {
  try {
    if (archivos.length > MAX_IMAGES) {
      throw new Error(`Podés seleccionar como máximo ${MAX_IMAGES} imágenes.`)
    }

    validarTiposImagen(archivos)

    validarTamanioImagenes(archivos)

    imagenesSeleccionadas = archivos

    renderizarImagenesSeleccionadas()
  } catch (error) {
    console.error('Selección de imágenes inválida:', error)

    showToast(
      error.message || 'Las imágenes seleccionadas no son válidas.',
      'warning'
    )

    limpiarImagenesSeleccionadas()
  }
}

/* ==========================================================
   DRAG AND DROP
========================================================== */

function manejarDragOver(event) {
  event.preventDefault()

  if (enviandoFormulario) {
    return
  }

  uploadArea?.classList.add('arrastrando')
}

function manejarDragLeave(event) {
  if (event.currentTarget.contains(event.relatedTarget)) {
    return
  }

  uploadArea?.classList.remove('arrastrando')
}

function manejarDrop(event) {
  event.preventDefault()

  uploadArea?.classList.remove('arrastrando')

  if (enviandoFormulario) {
    return
  }

  const archivos = Array.from(event.dataTransfer?.files ?? [])

  if (archivos.length === 0) {
    return
  }

  procesarImagenesSeleccionadas(archivos)

  /*
   * También copiamos los archivos al input para mantener
   * consistente su estado visual y de validación.
   */
  if (imagesInput && imagenesSeleccionadas.length > 0) {
    const dataTransfer = new DataTransfer()

    imagenesSeleccionadas.forEach((archivo) => {
      dataTransfer.items.add(archivo)
    })

    imagesInput.files = dataTransfer.files
  }
}

/* ==========================================================
   PREVIEW DE NUEVAS IMÁGENES
========================================================== */

function renderizarImagenesSeleccionadas() {
  liberarPreviewUrls()

  selectedImagesContainer?.replaceChildren()

  if (imagenesSeleccionadas.length === 0) {
    selectedImagesContainer?.classList.add('oculto')

    return
  }

  const fragment = document.createDocumentFragment()

  imagenesSeleccionadas.forEach((archivo, index) => {
    const previewUrl = URL.createObjectURL(archivo)

    previewUrls.push(previewUrl)

    fragment.appendChild(
      crearPreviewImagen({
        src: previewUrl,
        alt: `Vista previa de ${archivo.name}`,
        nombre: archivo.name,
        numero: index + 1
      })
    )
  })

  selectedImagesContainer?.appendChild(fragment)

  selectedImagesContainer?.classList.remove('oculto')
}

/* ==========================================================
   IMÁGENES ACTUALES
========================================================== */

function renderizarImagenesActuales(evento) {
  currentImagesGallery?.replaceChildren()

  const cantidadImagenes = Math.max(0, Number(evento.cant_img) || 0)

  if (cantidadImagenes === 0) {
    currentImagesContainer?.classList.add('oculto')

    return
  }

  const fragment = document.createDocumentFragment()

  for (let index = 0; index < cantidadImagenes; index += 1) {
    /*
     * El parámetro evita que el navegador reutilice
     * una imagen anterior dentro del administrador.
     */
    const imageUrl =
      `${IMG_URL}/img_eventos/${evento.id}/${index}.avif` +
      `?admin=${Date.now()}`

    fragment.appendChild(
      crearPreviewImagen({
        src: imageUrl,

        alt: `Imagen ${index + 1} de ${evento.titulo}`,

        nombre: `Imagen ${index + 1}`,

        numero: index + 1
      })
    )
  }

  currentImagesGallery?.appendChild(fragment)

  currentImagesContainer?.classList.remove('oculto')
}

/* ==========================================================
   CREAR PREVIEW
========================================================== */

function crearPreviewImagen({ src, alt, nombre, numero }) {
  const figura = document.createElement('figure')

  figura.className = 'preview-imagen'

  const imagen = document.createElement('img')

  imagen.src = src
  imagen.alt = alt
  imagen.loading = 'lazy'
  imagen.decoding = 'async'

  imagen.addEventListener(
    'error',
    () => {
      imagen.removeAttribute('src')

      imagen.alt = 'Imagen no disponible'
    },
    {
      once: true
    }
  )

  const numeroElemento = document.createElement('span')

  numeroElemento.className = 'preview-numero'

  numeroElemento.textContent = String(numero)

  numeroElemento.setAttribute('aria-hidden', 'true')

  const descripcion = document.createElement('figcaption')

  descripcion.textContent = nombre
  descripcion.title = nombre

  figura.append(imagen, numeroElemento, descripcion)

  return figura
}

/* ==========================================================
   VALIDACIONES
========================================================== */

function validarTiposImagen(archivos) {
  archivos.forEach((archivo, index) => {
    if (!(archivo instanceof File)) {
      throw new Error(`La imagen ${index + 1} no es un archivo válido.`)
    }

    if (!VALID_IMAGE_TYPES.has(archivo.type)) {
      throw new Error(`La imagen ${index + 1} no tiene un formato permitido.`)
    }
  })
}

function validarTamanioImagenes(archivos) {
  archivos.forEach((archivo, index) => {
    if (archivo.size === 0) {
      throw new Error(`La imagen ${index + 1} está vacía.`)
    }

    if (archivo.size > MAX_IMAGE_SIZE) {
      throw new Error(`La imagen ${index + 1} supera el límite de 12 MB.`)
    }
  })
}

/* ==========================================================
   ABRIR Y CERRAR MODAL
========================================================== */

function abrirModal() {
  modal?.classList.remove('oculto')

  document.body.style.overflow = 'hidden'
}

export function cerrarModalEvento() {
  if (enviandoFormulario) {
    return
  }

  modal?.classList.add('oculto')

  document.body.style.overflow = ''

  eventoEditando = null

  limpiarFormulario()
}

/* ==========================================================
   LIMPIEZA
========================================================== */

function limpiarFormulario() {
  form?.reset()

  limpiarImagenesSeleccionadas()

  currentImagesGallery?.replaceChildren()

  currentImagesContainer?.classList.add('oculto')

  uploadArea?.classList.remove('arrastrando')
}

function limpiarImagenesSeleccionadas() {
  imagenesSeleccionadas = []

  liberarPreviewUrls()

  if (imagesInput) {
    imagesInput.value = ''
  }

  selectedImagesContainer?.replaceChildren()

  selectedImagesContainer?.classList.add('oculto')
}

function liberarPreviewUrls() {
  previewUrls.forEach((url) => {
    URL.revokeObjectURL(url)
  })

  previewUrls = []
}

/* ==========================================================
   ESTADO DE GUARDADO
========================================================== */

function actualizarEstadoGuardado(guardando) {
  if (saveButton) {
    saveButton.disabled = guardando

    if (guardando) {
      saveButton.textContent = eventoEditando
        ? 'Guardando cambios...'
        : 'Creando evento...'
    } else {
      saveButton.textContent = eventoEditando
        ? 'Guardar cambios'
        : 'Guardar evento'
    }
  }

  if (cancelButton) {
    cancelButton.disabled = guardando
  }

  if (closeButton) {
    closeButton.disabled = guardando
  }

  if (imagesInput) {
    imagesInput.disabled = guardando
  }
}

/* ==========================================================
   TECLADO
========================================================== */

function manejarTeclado(event) {
  if (event.key !== 'Escape' || modal?.classList.contains('oculto')) {
    return
  }

  cerrarModalEvento()
}
