import { createFormModalController } from '../common/modalController.js'

import { requireElement, focusSoon } from '../common/dom.js'

import { buildNoticiaFormData } from './formData.js'

/* ==========================================================
   MODAL FACTORY
========================================================== */

export function createNoticiaModal({
  create,
  update,
  refresh,
  imagePicker
} = {}) {
  validarConfiguracion({
    create,
    update,
    refresh,
    imagePicker
  })

  /* ========================================================
     ELEMENTOS
  ======================================================== */

  const titleInput = requireElement(
    '#noticia-titulo',
    'campo de título de la noticia'
  )

  const contentInput = requireElement(
    '#noticia-contenido',
    'campo de contenido de la noticia'
  )

  const dateInput = requireElement(
    '#noticia-fecha',
    'campo de fecha de la noticia'
  )

  /* ========================================================
     API CON BLOQUEO DE IMÁGENES
  ======================================================== */

  async function crearNoticia(formData) {
    imagePicker.setDisabled(true)

    try {
      return await create(formData)
    } finally {
      imagePicker.setDisabled(false)
    }
  }

  async function actualizarNoticia(id, formData) {
    imagePicker.setDisabled(true)

    try {
      return await update(id, formData)
    } finally {
      imagePicker.setDisabled(false)
    }
  }

  /* ========================================================
     CONTROLADOR
  ======================================================== */

  const controller = createFormModalController({
    modal: '#modal-noticia',

    form: '#form-noticia',

    titleElement: '#modal-noticia-titulo',

    saveButton: '#btn-guardar-noticia',

    closeButtons: ['#btn-cerrar-modal-noticia'],

    cancelButtons: ['#btn-cancelar-noticia'],

    backdrop: '[data-cerrar-modal-noticia]',

    hiddenClass: 'oculto',

    createTitle: 'Nueva noticia',

    editTitle: 'Editar noticia',

    createButtonText: 'Guardar noticia',

    editButtonText: 'Guardar cambios',

    creatingText: 'Creando noticia...',

    updatingText: 'Guardando cambios...',

    createSuccessMessage: 'La noticia fue creada correctamente.',

    updateSuccessMessage: 'La noticia fue actualizada correctamente.',

    errorMessage: 'No se pudo guardar la noticia.',

    create: crearNoticia,

    update: actualizarNoticia,

    refresh,

    focusElement: titleInput,

    disableFormWhileSubmitting: true,

    validate({ editing }) {
      validarFormulario({
        editing,

        titleInput,
        contentInput,

        imagePicker
      })
    },

    buildPayload() {
      return buildNoticiaFormData({
        titulo: titleInput.value,

        contenido: contentInput.value,

        fecha: dateInput.value,

        images: imagePicker.files
      })
    },

    populate(_form, noticia) {
      titleInput.value = noticia.titulo ?? ''

      contentInput.value = noticia.contenido ?? ''

      dateInput.value = noticia.fecha ?? ''
    },

    clear(form) {
      form.reset()

      imagePicker.setDisabled(false)

      imagePicker.reset()
    },

    onOpenCreate() {
      imagePicker.setRequired(true)

      imagePicker.setHelpText(
        'Seleccioná entre 1 y 10 imágenes para la noticia.'
      )
    },

    async onOpenEdit({ item }) {
      imagePicker.setRequired(false)

      imagePicker.setHelpText(
        'Dejá este campo vacío para conservar las imágenes actuales.'
      )

      const API_URL = (import.meta.env.PUBLIC_API_URL ?? 'https://sitio-web-fundacion-seno.fly.dev').replace(/\/+$/, '')

      const count = item.cant_img ?? 1
      const id = item.id

      const files = []

      for (let index = 0; index < count; index++) {
        const proxyUrl = `${API_URL}/noticias/proxy-image?id=${id}&index=${index}`
        const fileName = `noticia_${id}_img_${index}.avif`

        try {
          const token = localStorage.getItem('token')
          const headers = {}
          if (token) headers['Authorization'] = `Bearer ${token}`

          const response = await fetch(proxyUrl, { headers, cache: 'no-cache' })
          if (response.ok) {
            const blob = await response.blob()
            const file = new File([blob], fileName, { type: blob.type })
            files.push(file)
          } else {
            console.error(
              `Fetch not ok for image ${index} for noticia ${id}`
            )
          }
        } catch (error) {
          console.error(
            `Failed to fetch image ${index} for noticia ${id}`,
            error
          )
        }
      }

      if (files.length > 0) {
        imagePicker.setFiles(files, { synchronizeInput: true })
      }
    },

    onClose() {
      imagePicker.setDisabled(false)

      imagePicker.reset()
    }
  })

  return controller
}

/* ==========================================================
   VALIDACIÓN
========================================================== */

function validarFormulario({
  editing,

  titleInput,
  contentInput,

  imagePicker
}) {
  const titulo = titleInput.value.trim()

  if (!titulo) {
    focusSoon(titleInput)

    throw new Error('El título es requerido.')
  }

  const contenido = contentInput.value.trim()

  if (!contenido) {
    focusSoon(contentInput)

    throw new Error('El contenido es requerido.')
  }

  imagePicker.validate()

  /*
   * Al editar, no seleccionar imágenes significa conservar
   * las que ya tiene la noticia.
   */
  if (!editing) {
    try {
      imagePicker.requireFiles(
        'Seleccioná al menos una imagen para crear la noticia.'
      )
    } catch (error) {
      imagePicker.focus()

      throw error
    }
  }
}

/* ==========================================================
   HELPERS
========================================================== */

function obtenerTituloNoticia(noticia) {
  const titulo = String(noticia?.titulo ?? '').trim()

  if (titulo) return titulo

  return `noticia ${noticia?.id ?? ''}`.trim()
}

/* ==========================================================
   CONFIGURACIÓN
========================================================== */

function validarConfiguracion({ create, update, refresh, imagePicker }) {
  const funciones = {
    create,
    update,
    refresh
  }

  for (const [nombre, funcion] of Object.entries(funciones)) {
    if (typeof funcion !== 'function')
      throw new TypeError(`createNoticiaModal requiere ${nombre}.`)
  }

  if (!imagePicker)
    throw new TypeError('createNoticiaModal requiere imagePicker.')

  const metodosImagePicker = [
    'validate',
    'requireFiles',
    'setRequired',
    'setDisabled',
    'setHelpText',
    'showCurrentImages',
    'reset',
    'focus'
  ]

  for (const metodo of metodosImagePicker) {
    if (typeof imagePicker[metodo] !== 'function')
      throw new TypeError(`imagePicker no implementa ${metodo}().`)
  }
}
