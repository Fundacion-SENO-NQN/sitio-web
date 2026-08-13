import { createDeleteController } from '../common/deleteController.js'

import { createListController } from '../common/listController.js'

import { createFormModalController } from '../common/modalController.js'

import { donationMethodsApi } from '../common/resources.js'

import { buildDonationMethodFormData } from './formData.js'

import { createInformationRowsController } from './informationRows.js'

import {
  createDonationMethodsTable,
  getDonationMethodIconUrl
} from './table.js'

import { createImagePicker } from '../common/imagePicker.js'

const iconPicker = createImagePicker({
  input: '#paymentMethodIcon',

  dropZone: '#paymentMethodIconDropZone',

  selectedContainer: '#paymentMethodSelectedIcon',

  currentContainer: '#paymentMethodCurrentIcon',

  currentGallery: '#paymentMethodCurrentIconGallery',

  helpText: '#paymentMethodIconHelp',

  multiple: false,
  maxFiles: 1,

  maxFileSize: 512 * 1024,

  allowedTypes: new Set(['image/svg+xml']),

  allowedExtensions: new Set(['svg']),

  previewClass: 'paymentMethodIconPreview',

  previewNumberClass: 'srOnly'
})

/* ==========================================================
   DYNAMIC INFORMATION
========================================================== */

const informationController = createInformationRowsController({
  container: '#informationRows',
  emptyElement: '#informationEmpty',
  addButton: '#btnAddInformation'
})

informationController.initialize()

/* ==========================================================
   CONTROLLERS
========================================================== */

let listController

const formController = createFormModalController({
  modal: '#methodModal',
  form: '#methodForm',

  titleElement: '#methodModalTitle',
  saveButton: '#btnSaveMethod',

  closeButtons: ['#btnCloseMethodModal'],
  cancelButtons: ['#btnCancelMethod'],

  backdrop: '[data-close-method-modal]',

  createTitle: 'Nuevo método de pago',
  editTitle: 'Editar método de pago',

  createButtonText: 'Crear método',
  editButtonText: 'Guardar cambios',

  creatingText: 'Creando...',
  updatingText: 'Guardando...',

  createSuccessMessage: 'El método de pago fue creado correctamente.',

  updateSuccessMessage: 'El método de pago fue actualizado correctamente.',

  errorMessage: 'No se pudo guardar el método de pago.',

  create: donationMethodsApi.create,

  update: donationMethodsApi.update,

  refresh() {
    return listController?.refresh({
      showLoading: false
    })
  },

  validate({ form, item }) {
    if (!form.reportValidity()) {
      throw new Error('Revisá los campos obligatorios del formulario.')
    }

    validateUniqueMethodName({
      form,
      currentItem: item,
      methods: listController?.items ?? []
    })
  },

  buildPayload({ form, editing }) {
    return buildDonationMethodFormData(
      {
        nombre: getFormControlValue(form, 'nombre'),

        descripcion: getFormControlValue(form, 'descripcion'),

        informacion: informationController.getValues(),

        icon: iconPicker.files[0] ?? null
      },
      {
        editing
      }
    )
  },

  onOpenEdit() {
    iconPicker.setRequired(false)

    iconPicker.setHelpText(
      'Seleccioná otro SVG únicamente para reemplazar el ícono actual.'
    )
  },

  onClose() {
    iconPicker.setRequired(false)
  },

  populate(form, method) {
    setFormControlValue(form, 'nombre', method.nombre)

    setFormControlValue(form, 'descripcion', method.descripcion)

    informationController.populate(method.informacion)
  },

  clear(form) {
    form.reset()

    informationController.clear()
  },

  onOpenCreate() {
    informationController.add(null, {
      focus: false
    })
  },

  focusElement: '#methodName',

  disableFormWhileSubmitting: true
})

const deleteController = createDeleteController({
  modal: '#deleteMethodModal',

  confirmButton: '#btnConfirmDelete',

  cancelButtons: ['#btnCancelDelete'],

  closeButtons: ['#btnCloseDeleteModal'],

  backdrop: '[data-close-delete-modal]',

  textElement: '#deleteMethodText',

  remove: donationMethodsApi.remove,

  refresh() {
    return listController?.refresh({
      showLoading: false
    })
  },

  getName(method) {
    return method.nombre
  },

  buildConfirmationText(method) {
    const informationCount = Array.isArray(method.informacion)
      ? method.informacion.length
      : 0

    const informationText =
      informationCount === 1
        ? '1 dato asociado'
        : `${informationCount} datos asociados`

    return (
      `El método “${method.nombre}” y ${informationText} ` +
      'serán eliminados permanentemente.'
    )
  },

  defaultText: 'El método de pago y toda su información serán eliminados.',

  deletingText: 'Eliminando...',

  confirmButtonText: 'Eliminar método',

  successMessage: ({ name }) =>
    `El método “${name}” fue eliminado correctamente.`,

  errorMessage: 'No se pudo eliminar el método de pago.'
})

/* ==========================================================
   TABLE
========================================================== */

const renderTable = createDonationMethodsTable({
  body: '#methodsBody',

  openEdit(method) {
    formController.openEdit(method)
  },

  openDelete(method) {
    deleteController.open(method)
  }
})

/* ==========================================================
   LIST
========================================================== */

listController = createListController({
  load: donationMethodsApi.list,

  render: renderTable,

  searchInput: '#searchDonationMethods',

  countElement: '#methodsCount',

  loadingElement: '#methodsLoading',

  errorElement: '#methodsError',

  emptyElement: '#methodsEmpty',

  tableElement: '#methodsTableContainer',

  retryButton: '#btnRetryMethods',

  createButtons: ['#btnNewMethod', '#btnEmptyNewMethod'],

  onCreate() {
    formController.openCreate()
  },

  searchValues(method) {
    const information = Array.isArray(method.informacion)
      ? method.informacion
      : []

    return [
      method.nombre,
      method.descripcion,

      ...information.flatMap((item) => [item.titulo, item.valor])
    ]
  },

  sorters: {
    name(first, second) {
      return String(first?.nombre ?? '').localeCompare(
        String(second?.nombre ?? ''),
        'es-AR',
        {
          sensitivity: 'base'
        }
      )
    },

    date(first, second) {
      return getTimestamp(first?.created_at) - getTimestamp(second?.created_at)
    }
  },

  defaultSort: 'name',

  defaultAscending: true,

  sortButtons: {
    name: '#sortMethodsName',
    date: '#sortMethodsDate'
  },

  normalizeItems(response) {
    if (!Array.isArray(response)) {
      return []
    }

    return response.map((method) => ({
      ...method,

      informacion: Array.isArray(method.informacion) ? method.informacion : []
    }))
  },

  messages: {
    emptyTitle: 'Todavía no hay métodos de pago',

    emptyDescription:
      'Creá el primer método para mostrar sus datos en la página de donaciones.',

    noResultsTitle: 'No se encontraron métodos',

    noResultsDescription:
      'Probá buscar por nombre, descripción, alias, CBU, CVU u otro dato.',

    loadError: 'No se pudieron cargar los métodos de pago.'
  },

  singular: 'método',

  plural: 'métodos'
})

/* ==========================================================
   INITIALIZATION
========================================================== */

formController.initialize()

deleteController.initialize()

listController.initialize().catch(() => {
  /*
   * listController already displays its error state.
   * This catch prevents an unhandled rejected promise.
   */
})

iconPicker.initialize()

informationController.initialize()

Promise.resolve(listController.initialize()).catch((error) => {
  console.error('No se pudo iniciar el administrador de métodos:', error)
})
/* ==========================================================
   HELPERS
========================================================== */

function getFormControlValue(form, name) {
  const control = form.elements.namedItem(name)

  if (
    control instanceof HTMLInputElement ||
    control instanceof HTMLTextAreaElement ||
    control instanceof HTMLSelectElement
  ) {
    return control.value
  }

  return ''
}

function setFormControlValue(form, name, value) {
  const control = form.elements.namedItem(name)

  if (
    control instanceof HTMLInputElement ||
    control instanceof HTMLTextAreaElement ||
    control instanceof HTMLSelectElement
  ) {
    control.value = String(value ?? '')
  }
}

function validateUniqueMethodName({ form, currentItem, methods }) {
  const name = normalizeText(getFormControlValue(form, 'nombre'))

  const duplicate = methods.some((method) => {
    return (
      Number(method.id) !== Number(currentItem?.id) &&
      normalizeText(method.nombre) === name
    )
  })

  if (duplicate) {
    throw new Error('Ya existe un método de pago con ese nombre.')
  }
}

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('es-AR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function getTimestamp(value) {
  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}
