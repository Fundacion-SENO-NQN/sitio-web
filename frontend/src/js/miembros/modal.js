import { createFormModalController } from '../common/modalController.js'

import { focusSoon, requireElement } from '../common/dom.js'

import { buildMemberFormData } from './formData.js'

import {
  configurarImagenParaCrearMiembro,
  configurarImagenParaEditarMiembro,
  limpiarImagenMiembro
} from './images.js'

/* ==========================================================
   MODAL FACTORY
========================================================== */

export function createMiembroModal({
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

  const nameInput = requireElement('#memberName', 'campo de nombre del miembro')

  const lastNameInput = requireElement(
    '#memberLastName',
    'campo de apellido del miembro'
  )

  const positionInput = requireElement(
    '#memberPosition',
    'campo de puesto del miembro'
  )

  const descriptionInput = requireElement(
    '#memberDescription',
    'campo de descripción del miembro'
  )

  /* ========================================================
     PETICIONES
  ======================================================== */

  async function crearMiembro(formData) {
    imagePicker.setDisabled(true)

    try {
      return await create(formData)
    } finally {
      imagePicker.setDisabled(false)
    }
  }

  async function actualizarMiembro(id, formData) {
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

  return createFormModalController({
    modal: '#memberModal',

    form: '#memberForm',

    titleElement: '#memberModalTitle',

    saveButton: '#btnSaveMember',

    closeButtons: ['#btnCloseMemberModal'],

    cancelButtons: ['#btnCancelMember'],

    /*
     * En esta página el propio contenedor del modal funciona
     * como fondo, por lo que no hace falta indicar backdrop.
     */
    hiddenClass: 'hidden',

    createTitle: 'Nuevo miembro',

    editTitle: 'Editar miembro',

    createButtonText: 'Crear miembro',

    editButtonText: 'Guardar cambios',

    creatingText: 'Creando miembro...',

    updatingText: 'Guardando cambios...',

    createSuccessMessage: 'El miembro fue creado correctamente.',

    updateSuccessMessage: 'El miembro fue actualizado correctamente.',

    errorMessage: 'No se pudo guardar el miembro.',

    create: crearMiembro,

    update: actualizarMiembro,

    refresh,

    focusElement: nameInput,

    disableFormWhileSubmitting: true,

    validate({ editing }) {
      validarFormulario({
        editing,

        nameInput,
        lastNameInput,
        positionInput,
        descriptionInput,

        imagePicker
      })
    },

    buildPayload() {
      return buildMemberFormData({
        nombre: nameInput.value,

        apellido: lastNameInput.value,

        puesto: positionInput.value,

        descripcion: descriptionInput.value,

        image: imagePicker.files[0] ?? null
      })
    },

    populate(_form, miembro) {
      nameInput.value = miembro.nombre ?? ''

      lastNameInput.value = miembro.apellido ?? ''

      positionInput.value = miembro.puesto ?? ''

      descriptionInput.value = miembro.descripcion ?? ''
    },

    clear(form) {
      form.reset()

      imagePicker.setDisabled(false)

      limpiarImagenMiembro()
    },

    onOpenCreate() {
      configurarImagenParaCrearMiembro()
    },

    onOpenEdit({ item }) {
      configurarImagenParaEditarMiembro(item)
    },

    onClose() {
      imagePicker.setDisabled(false)

      limpiarImagenMiembro()
    }
  })
}

/* ==========================================================
   VALIDACIÓN
========================================================== */

function validarFormulario({
  editing,

  nameInput,
  lastNameInput,
  positionInput,
  descriptionInput,

  imagePicker
}) {
  const nombre = nameInput.value.trim()

  if (!nombre) {
    focusSoon(nameInput)

    throw new Error('El nombre es requerido.')
  }

  const apellido = lastNameInput.value.trim()

  if (!apellido) {
    focusSoon(lastNameInput)

    throw new Error('El apellido es requerido.')
  }

  const puesto = positionInput.value.trim()

  if (!puesto) {
    focusSoon(positionInput)

    throw new Error('El puesto es requerido.')
  }

  const descripcion = descriptionInput.value.trim()

  if (!descripcion) {
    focusSoon(descriptionInput)

    throw new Error('La descripción es requerida.')
  }

  imagePicker.validate()

  /*
   * La fotografía es obligatoria al crear.
   *
   * Durante la edición, no seleccionar una imagen nueva
   * significa conservar la fotografía actual.
   */
  if (!editing)
    try {
      imagePicker.requireFiles('Seleccioná una fotografía para el miembro.')
    } catch (error) {
      imagePicker.focus()

      throw error
    }
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
      throw new TypeError(`createMiembroModal requiere ${nombre}.`)
  }

  if (!imagePicker)
    throw new TypeError('createMiembroModal requiere imagePicker.')

  const metodosRequeridos = [
    'validate',
    'requireFiles',
    'setDisabled',
    'reset',
    'focus'
  ]

  for (const metodo of metodosRequeridos) {
    if (typeof imagePicker[metodo] !== 'function')
      throw new TypeError(`imagePicker no implementa ${metodo}().`)
  }
}
