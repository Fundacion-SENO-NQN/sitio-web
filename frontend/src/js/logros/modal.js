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
  setLoading,
} = {}) {
  validarConfiguracion({
    create,
    update,
    refresh,
    imagePicker,
    setLoading,
  })

  /* ========================================================
     ELEMENTOS
  ======================================================== */

  const titleInput = requireElement('#title', 'campo de título del logro')

  const contentInput = requireElement(
    '#description',
    'campo de descripción del logro',
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
        showLoading: false,
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

    saveButton: '#btnSaveAchievement',

    closeButtons: ['#btnCancel'],

    cancelButtons: ['#btnCancelForm'],

    backdrop: '#achievementModal .modalBackdrop',

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
        imagePicker,
      })
    },

    buildPayload({ item, editing }) {
      return buildAchievementFormData({
        titulo: titleInput.value,

        contenido: contentInput.value,

        orden: editing ? Number(item?.orden) : 0,

        image: imagePicker.files.length > 0 ? imagePicker.files : null,
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
      imagePicker.setHelpText('Seleccioná hasta 3 imágenes para el logro.')
    },

    async onOpenEdit({ item }) {
      imagePicker.setRequired(false)

      imagePicker.setHelpText(
        'Podés reordenar, agregar o eliminar las imágenes.',
      )

      const IMG_URL = (
        import.meta.env.PUBLIC_IMG_URL ??
        'https://pub-508ef05ca2d548c1b336a8b1f0f31c83.r2.dev'
      ).replace(/\/+$/, '')

      const API_URL = (import.meta.env.PUBLIC_API_URL ?? '').replace(/\/+$/, '')

      const count = item.image_count ?? 1
      const directory = 'img_logros'
      const id = item.id

      const files = [];

      for (let index = 0; index < count; index++) {
        const proxyUrl = `${API_URL}/logros/proxy-image?id=${id}&index=${index}`;
        const fileName = `logro_${id}_img_${index + 1}.avif`;

        try {
          // Adding a fetch option cache to ensure we get the fresh image without using query params that might break R2 CORS/Routing.
          const token = localStorage.getItem('token')
          const headers = {}
          if (token) headers['Authorization'] = `Bearer ${token}`

          const response = await fetch(proxyUrl, { headers, cache: 'no-cache' });
          if (response.ok) {
            const blob = await response.blob();
            const file = new File([blob], fileName, { type: blob.type });
            files.push(file);
          } else {
            console.error(`Fetch not ok for image ${index + 1} for achievement ${id}`);
          }
        } catch (error) {
          console.error(`Failed to fetch image ${index + 1} for achievement ${id}`, error);
        }
      }

      if (files.length > 0) {
        imagePicker.setFiles(files, { synchronizeInput: true });
      }
    },

    onClose() {
      imagePicker.setDisabled(false)
      imagePicker.reset()
      imagePicker.setRequired(false)
    },
  })
}

/* ==========================================================
   VALIDACIÓN
========================================================== */

function validarFormulario({ editing, titleInput, contentInput, imagePicker }) {
  const titulo = titleInput.value.trim()

  if (titulo.length < 3) {
    focusSoon(titleInput, {
      selectText: true,
    })

    throw new Error('El título es muy corto.')
  }

  const contenido = contentInput.value.trim()

  if (contenido.length < 10) {
    focusSoon(contentInput)

    throw new Error('La descripción es muy corta.')
  }

  imagePicker.validate()

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
  setLoading,
}) {
  const funciones = {
    create,
    update,
    refresh,
    setLoading,
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
    'focus',
    'setHelpText',
    'showCurrentImages',
  ]

  for (const metodo of metodosRequeridos) {
    if (typeof imagePicker[metodo] !== 'function')
      throw new TypeError(`imagePicker no implementa ${metodo}().`)
  }
}
