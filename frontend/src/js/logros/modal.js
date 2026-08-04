import { createFormModalController } from '../common/modalController.js'

import { focusSoon, requireElement } from '../common/dom.js'

import { buildAchievementFormData } from './formData.js'

/* ==========================================================
   MODAL FACTORY
========================================================== */

export function createLogroModal({
  create,
  update,
  refresh,
  imagePicker,
  setLoading
} = {}) {
  validarConfiguracion({
    create,
    update,
    refresh,
    imagePicker,
    setLoading
  })

  /* ========================================================
     ELEMENTOS
  ======================================================== */

  const titleInput = requireElement('#title', 'campo de título del logro')

  const contentInput = requireElement(
    '#description',
    'campo de descripción del logro'
  )

  /* ========================================================
     PETICIONES
  ======================================================== */

  async function crearLogro(formData) {
    setLoading(true)
    imagePicker.setDisabled(true)

    try {
      return await create(formData)
    } finally {
      imagePicker.setDisabled(false)
      setLoading(false)
    }
  }

  async function actualizarLogro(id, formData) {
    setLoading(true)
    imagePicker.setDisabled(true)

    try {
      return await update(id, formData)
    } finally {
      imagePicker.setDisabled(false)
      setLoading(false)
    }
  }

  async function recargarLogros() {
    setLoading(true)

    try {
      return await refresh({
        showLoading: false
      })
    } finally {
      setLoading(false)
    }
  }

  /* ========================================================
     CONTROLADOR
  ======================================================== */

  return createFormModalController({
    modal: '#achievementModal',

    form: '#achievementForm',

    titleElement: '#modalTitle',

    cancelButtons: ['#btnCancel'],

    /*
     * El propio contenedor del modal funciona como fondo.
     */
    hiddenClass: 'hidden',

    createTitle: 'Crear logro',

    editTitle: 'Editar logro',

    createButtonText: 'Crear logro',

    editButtonText: 'Guardar cambios',

    creatingText: 'Creando logro...',

    updatingText: 'Guardando cambios...',

    createSuccessMessage: 'Logro creado.',

    updateSuccessMessage: 'Logro actualizado.',

    errorMessage: 'No se pudo guardar el logro.',

    create: crearLogro,

    update: actualizarLogro,

    refresh: recargarLogros,

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

    buildPayload({ item, editing }) {
      return buildAchievementFormData({
        titulo: titleInput.value,

        contenido: contentInput.value,

        /*
         * Conserva la posición al editar.
         *
         * La implementación original enviaba 0 al crear.
         */
        orden: editing ? Number(item?.orden) : 0,

        image: imagePicker.files[0] ?? null
      })
    },

    populate(_form, logro) {
      titleInput.value = logro.titulo ?? ''

      contentInput.value = logro.contenido ?? ''
    },

    clear(form) {
      form.reset()

      imagePicker.setDisabled(false)
      imagePicker.reset()
      imagePicker.setRequired(false)
    },

    onOpenCreate() {
      imagePicker.setRequired(true)
    },

    onOpenEdit() {
      /*
       * No seleccionar una imagen nueva mantiene la imagen
       * actual del logro.
       */
      imagePicker.setRequired(false)
    },

    onClose() {
      imagePicker.setDisabled(false)
      imagePicker.reset()
      imagePicker.setRequired(false)
    }
  })
}

/* ==========================================================
   VALIDACIÓN
========================================================== */

function validarFormulario({ editing, titleInput, contentInput, imagePicker }) {
  const titulo = titleInput.value.trim()

  if (titulo.length < 3) {
    focusSoon(titleInput, {
      selectText: true
    })

    throw new Error('El título es muy corto.')
  }

  const contenido = contentInput.value.trim()

  if (contenido.length < 10) {
    focusSoon(contentInput)

    throw new Error('La descripción es muy corta.')
  }

  imagePicker.validate()

  if (!editing)
    try {
      imagePicker.requireFiles('La imagen es requerida.')
    } catch (error) {
      imagePicker.focus()

      throw error
    }
}

/* ==========================================================
   CONFIGURACIÓN
========================================================== */

function validarConfiguracion({
  create,
  update,
  refresh,
  imagePicker,
  setLoading
}) {
  const funciones = {
    create,
    update,
    refresh,
    setLoading
  }

  for (const [nombre, funcion] of Object.entries(funciones)) {
    if (typeof funcion !== 'function')
      throw new TypeError(`createLogroModal requiere ${nombre}.`)
  }

  if (!imagePicker)
    throw new TypeError('createLogroModal requiere imagePicker.')

  const metodosRequeridos = [
    'validate',
    'requireFiles',
    'setRequired',
    'setDisabled',
    'reset',
    'focus'
  ]

  for (const metodo of metodosRequeridos) {
    if (typeof imagePicker[metodo] !== 'function')
      throw new TypeError(`imagePicker no implementa ${metodo}().`)
  }
}
