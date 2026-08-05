import { createFormModalController } from '../common/modalController.js'

import { focusSoon, requireElement } from '../common/dom.js'

import { showToast } from '../common/toast.js'

/* ==========================================================
   MODAL FACTORY
========================================================== */

export function createRoleModal({
  create,
  update,
  refresh,

  getServices,
  ensureServices,
  isCurrentRole
} = {}) {
  validarConfiguracion({
    create,
    update,
    refresh,
    getServices,
    ensureServices,
    isCurrentRole
  })

  /* ========================================================
     ELEMENTOS
  ======================================================== */

  const roleNameInput = requireElement('#roleName', 'campo de nombre del rol')

  const servicesContainer = requireElement(
    '#servicesContainer',
    'contenedor de servicios'
  )

  const modalLoader = requireElement(
    '#modal-carga-role',
    'indicador de carga del modal de rol'
  )

  /* ========================================================
     ESTADO
  ======================================================== */

  let initialized = false
  let loadingServices = false

  /* ========================================================
     PETICIONES
  ======================================================== */

  async function crearRol(data) {
    mostrarCargaModal(true)

    try {
      return await create(data)
    } finally {
      mostrarCargaModal(false)
    }
  }

  async function actualizarRol(id, data) {
    mostrarCargaModal(true)

    try {
      return await update(id, data)
    } finally {
      mostrarCargaModal(false)
    }
  }

  /* ========================================================
     CONTROLADOR BASE
  ======================================================== */

  const baseController = createFormModalController({
    modal: '#roleModal',

    form: '#roleForm',

    titleElement: '#roleModalTitle',

    saveButton: '#roleForm button[type="submit"]',

    closeButtons: ['#btnCloseRoleModal'],

    cancelButtons: ['#btnCancelRole'],

    hiddenClass: 'hidden',

    createTitle: 'Crear rol',

    editTitle: 'Editar rol',

    createButtonText: 'Crear rol',

    editButtonText: 'Guardar cambios',

    creatingText: 'Creando rol...',

    updatingText: 'Guardando cambios...',

    createSuccessMessage: 'Rol creado correctamente.',

    updateSuccessMessage: 'Rol actualizado correctamente.',

    errorMessage: 'No se pudo guardar el rol.',

    create: crearRol,

    update: actualizarRol,

    refresh,

    focusElement: roleNameInput,

    disableFormWhileSubmitting: true,

    lockBodyScroll: true,

    validate({ editing, item }) {
      if (editing && isCurrentRole(item))
        throw new Error(
          'No podés modificar el rol utilizado por tu sesión actual.'
        )

      validarFormulario({
        roleNameInput,
        servicesContainer
      })
    },

    buildPayload() {
      return {
        name: roleNameInput.value.trim(),

        service_id: obtenerServiciosSeleccionados(servicesContainer)
      }
    },

    populate(_form, role) {
      roleNameInput.value = role.name ?? ''
    },

    clear(form) {
      form.reset()

      roleNameInput.value = ''

      servicesContainer.replaceChildren()

      mostrarCargaModal(false)
    },

    onOpenCreate() {
      renderizarServicios({
        container: servicesContainer,

        services: getServices(),

        selected: []
      })
    },

    onOpenEdit({ item }) {
      renderizarServicios({
        container: servicesContainer,

        services: getServices(),

        selected: item?.services
      })
    },

    onClose() {
      mostrarCargaModal(false)
    }
  })

  /* ========================================================
     CONTROLADOR PÚBLICO
  ======================================================== */

  const controller = {
    initialize,
    destroy,

    openCreate,
    openEdit,

    close(...args) {
      return baseController.close(...args)
    },

    get editing() {
      return baseController.editing
    },

    get submitting() {
      return baseController.submitting
    },

    get loadingServices() {
      return loadingServices
    }
  }

  return controller

  /* ========================================================
     INITIALIZATION
  ======================================================== */

  function initialize() {
    if (initialized) return controller

    baseController.initialize()

    mostrarCargaModal(false)

    initialized = true

    return controller
  }

  function destroy() {
    baseController.destroy()

    initialized = false
    loadingServices = false

    mostrarCargaModal(false)

    servicesContainer.replaceChildren()
  }

  /* ========================================================
     OPEN CREATE
  ======================================================== */

  async function openCreate() {
    if (loadingServices || baseController.submitting) return false

    const ready = await prepararServicios()

    if (!ready) return false

    baseController.openCreate()

    return true
  }

  /* ========================================================
     OPEN EDIT
  ======================================================== */

  async function openEdit(role) {
    if (loadingServices || baseController.submitting || !role) return false

    if (isCurrentRole(role)) {
      showToast(
        'No podés editar el rol utilizado por tu sesión actual.',
        'warning'
      )

      return false
    }

    const ready = await prepararServicios()

    if (!ready) return false

    baseController.openEdit(role)

    return true
  }

  /* ========================================================
     LOAD SERVICES
  ======================================================== */

  async function prepararServicios() {
    loadingServices = true

    try {
      await ensureServices()

      const services = normalizarServicios(getServices())

      if (services.length === 0) {
        showToast(
          'No hay servicios disponibles para asignar al rol.',
          'warning'
        )

        return false
      }

      return true
    } catch (error) {
      console.error('No se pudieron cargar los servicios:', error)

      showToast(
        error instanceof Error
          ? error.message
          : 'No se pudieron cargar los servicios.',
        'error'
      )

      return false
    } finally {
      loadingServices = false
    }
  }

  /* ========================================================
     LOADER
  ======================================================== */

  function mostrarCargaModal(loading) {
    modalLoader.classList.toggle('hidden', !loading)

    modalLoader.hidden = !loading

    modalLoader.setAttribute('aria-hidden', String(!loading))
  }
}

/* ==========================================================
   RENDER SERVICES
========================================================== */

function renderizarServicios({ container, services, selected }) {
  container.replaceChildren()

  const normalizedServices = normalizarServicios(services)

  const selectedIds = obtenerIdsServicios(selected)

  if (normalizedServices.length === 0) {
    container.appendChild(crearEstadoSinServicios())

    return
  }

  const fragment = document.createDocumentFragment()

  normalizedServices.forEach((service) => {
    fragment.appendChild(
      crearOpcionServicio({
        service,
        checked: selectedIds.has(service.id)
      })
    )
  })

  container.appendChild(fragment)
}

/* ==========================================================
   SERVICE OPTION
========================================================== */

function crearOpcionServicio({ service, checked }) {
  const label = document.createElement('label')

  label.className = 'serviceOption'

  const checkbox = document.createElement('input')

  const inputId = `role-service-${service.id}`

  checkbox.id = inputId

  checkbox.type = 'checkbox'

  checkbox.name = 'services'

  checkbox.value = String(service.id)

  checkbox.checked = checked

  checkbox.dataset.serviceId = String(service.id)

  const text = document.createElement('span')

  text.textContent = service.titulo

  label.htmlFor = inputId

  label.append(checkbox, text)

  return label
}

/* ==========================================================
   EMPTY SERVICES
========================================================== */

function crearEstadoSinServicios() {
  const element = document.createElement('p')

  element.className = 'servicesEmpty'

  element.textContent = 'No hay servicios disponibles.'

  return element
}

/* ==========================================================
   SELECTED SERVICES
========================================================== */

function obtenerServiciosSeleccionados(container) {
  return [...container.querySelectorAll('input[name="services"]:checked')]
    .map((checkbox) => Number(checkbox.value))
    .filter((id) => Number.isInteger(id) && id > 0)
}

/* ==========================================================
   VALIDATION
========================================================== */

function validarFormulario({ roleNameInput, servicesContainer }) {
  const name = roleNameInput.value.trim()

  if (!name) {
    focusSoon(roleNameInput)

    throw new Error('El nombre del rol es requerido.')
  }

  const selectedServices = obtenerServiciosSeleccionados(servicesContainer)

  if (selectedServices.length === 0) {
    const firstCheckbox = servicesContainer.querySelector(
      'input[name="services"]'
    )

    if (firstCheckbox) focusSoon(firstCheckbox)

    throw new Error('Seleccioná al menos un servicio.')
  }
}

/* ==========================================================
   NORMALIZE SERVICES
========================================================== */

function normalizarServicios(services) {
  if (!Array.isArray(services)) return []

  const uniqueServices = new Map()

  services.forEach((service) => {
    if (!service || typeof service !== 'object') return

    const id = normalizarIdOpcional(service.id ?? service.service_id)

    const titulo = String(service.titulo ?? service.name ?? '').trim()

    if (id === null || !titulo) return

    if (!uniqueServices.has(id))
      uniqueServices.set(id, {
        id,
        titulo
      })
  })

  return [...uniqueServices.values()]
}

/* ==========================================================
   SELECTED IDS
========================================================== */

function obtenerIdsServicios(services) {
  if (!Array.isArray(services)) return new Set()

  const ids = services
    .map((service) => {
      if (service && typeof service === 'object') {
        return normalizarIdOpcional(service.id ?? service.service_id)
      }

      return normalizarIdOpcional(service)
    })
    .filter((id) => id !== null)

  return new Set(ids)
}

/* ==========================================================
   ID HELPERS
========================================================== */

function normalizarIdOpcional(value) {
  const id = Number(value)

  if (!Number.isInteger(id) || id <= 0) return null

  return id
}

/* ==========================================================
   CONFIGURATION
========================================================== */

function validarConfiguracion({
  create,
  update,
  refresh,
  getServices,
  ensureServices,
  isCurrentRole
}) {
  const functions = {
    create,
    update,
    refresh,
    getServices,
    ensureServices,
    isCurrentRole
  }

  for (const [name, value] of Object.entries(functions)) {
    if (typeof value !== 'function')
      throw new TypeError(`createRoleModal requiere ${name}.`)
  }
}
