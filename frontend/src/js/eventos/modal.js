import { createFormModalController } from '../common/modalController.js'

import { requireElement, focusSoon } from '../common/dom.js'

import { buildEventoFormData } from './formData.js'

/* ==========================================================
   MODAL FACTORY
========================================================== */

export function createEventoModal({
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
    '#evento-titulo',
    'campo de título del evento'
  )

  const descriptionInput = requireElement(
    '#evento-descripcion',
    'campo de descripción del evento'
  )

  const dateInput = requireElement('#evento-fecha', 'campo de fecha del evento')

  const timeInput = requireElement(
    '#evento-horario',
    'campo de horario del evento'
  )

  const placeInput = requireElement(
    '#evento-lugar',
    'campo de lugar del evento'
  )

  const urlInput = requireElement('#evento-url', 'campo de URL del evento')

  const urlTitleInput = requireElement(
    '#evento-url-titulo',
    'campo de texto de la URL'
  )

  /* ========================================================
     API CON BLOQUEO DE IMÁGENES
  ======================================================== */

  async function crearEvento(formData) {
    imagePicker.setDisabled(true)

    try {
      return await create(formData)
    } finally {
      imagePicker.setDisabled(false)
    }
  }

  async function actualizarEvento(id, formData) {
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
    modal: '#modal-evento',

    form: '#form-evento',

    titleElement: '#modal-evento-titulo',

    saveButton: '#btn-guardar-evento',

    closeButtons: ['#btn-cerrar-modal-evento'],

    cancelButtons: ['#btn-cancelar-evento'],

    backdrop: '[data-cerrar-modal-evento]',

    hiddenClass: 'oculto',

    createTitle: 'Nuevo evento',

    editTitle: 'Editar evento',

    createButtonText: 'Guardar evento',

    editButtonText: 'Guardar cambios',

    creatingText: 'Creando evento...',

    updatingText: 'Guardando cambios...',

    createSuccessMessage: 'El evento fue creado correctamente.',

    updateSuccessMessage: 'El evento fue actualizado correctamente.',

    errorMessage: 'No se pudo guardar el evento.',

    create: crearEvento,

    update: actualizarEvento,

    refresh,

    focusElement: titleInput,

    disableFormWhileSubmitting: true,

    validate({ editing }) {
      validarFormulario({
        editing,

        titleInput,
        descriptionInput,
        urlInput,
        urlTitleInput,

        imagePicker
      })
    },

    buildPayload() {
      return buildEventoFormData({
        titulo: titleInput.value,

        descripcion: descriptionInput.value,

        fecha: dateInput.value,

        horario: timeInput.value,

        lugar: placeInput.value,

        url: urlInput.value,

        urlTitulo: urlTitleInput.value,

        images: imagePicker.files
      })
    },

    populate(_form, evento) {
      titleInput.value = evento.titulo ?? ''

      descriptionInput.value = evento.descripcion ?? ''

      dateInput.value = evento.fecha ?? ''

      timeInput.value = evento.horario ?? ''

      placeInput.value = evento.lugar ?? ''

      urlInput.value = evento.url ?? ''

      urlTitleInput.value = evento.url_titulo ?? ''
    },

    clear(form) {
      form.reset()

      imagePicker.setDisabled(false)

      imagePicker.reset()
    },

    onOpenCreate() {
      imagePicker.setRequired(true)

      imagePicker.setHelpText(
        'Seleccioná entre 1 y 10 imágenes para el evento.'
      )
    },

    onOpenEdit({ item }) {
      imagePicker.setRequired(false)

      imagePicker.setHelpText(
        'Dejá este campo vacío para conservar las imágenes actuales.'
      )

      imagePicker.showCurrentImages({
        id: item.id,

        count: item.cant_img,

        directory: 'img_eventos',

        indexed: true,

        extension: 'avif',

        title: obtenerTituloEvento(item),

        cacheBust: true
      })
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
  descriptionInput,
  urlInput,
  urlTitleInput,

  imagePicker
}) {
  const titulo = titleInput.value.trim()

  if (!titulo) {
    focusSoon(titleInput)

    throw new Error('El título es requerido.')
  }

  const descripcion = descriptionInput.value.trim()

  if (!descripcion) {
    focusSoon(descriptionInput)

    throw new Error('La descripción es requerida.')
  }

  const url = urlInput.value.trim()

  const urlTitulo = urlTitleInput.value.trim()

  if (urlTitulo && !url) {
    focusSoon(urlInput)

    throw new Error(
      'No podés agregar un texto para el botón sin ingresar una URL.'
    )
  }

  if (url && !esUrlHttpValida(url)) {
    focusSoon(urlInput)

    throw new Error('La URL debe comenzar con http:// o https://.')
  }

  imagePicker.validate()

  if (!editing)
    try {
      imagePicker.requireFiles(
        'Seleccioná al menos una imagen para crear el evento.'
      )
    } catch (error) {
      imagePicker.focus()

      throw error
    }
}

/* ==========================================================
   HELPERS
========================================================== */

function esUrlHttpValida(value) {
  try {
    const url = new URL(value)

    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function obtenerTituloEvento(evento) {
  const titulo = String(evento?.titulo ?? '').trim()

  if (titulo) return titulo

  return `evento ${evento?.id ?? ''}`.trim()
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
      throw new TypeError(`createEventoModal requiere ${nombre}.`)
  }

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

  if (!imagePicker)
    throw new TypeError('createEventoModal requiere imagePicker.')

  for (const metodo of metodosImagePicker) {
    if (typeof imagePicker[metodo] !== 'function')
      throw new TypeError(`imagePicker no implementa ${metodo}().`)
  }
}
