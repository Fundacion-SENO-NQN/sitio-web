import { createFormModalController } from '../common/modalController.js'

import { createEventScope, focusSoon, requireElement } from '../common/dom.js'

import { showToast } from '../common/toast.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/* ==========================================================
   MODAL FACTORY
========================================================== */

export function createUserModal({
  create,
  update,
  changePassword,
  refresh,

  getRoles,
  isCurrentUser
} = {}) {
  validarConfiguracion({
    create,
    update,
    changePassword,
    refresh,
    getRoles,
    isCurrentUser
  })

  /* ========================================================
     ELEMENTOS
  ======================================================== */

  const usernameInput = requireElement(
    '#username',
    'campo de nombre de usuario'
  )

  const emailInput = requireElement('#email', 'campo de correo electrónico')

  const nameInput = requireElement('#name', 'campo de nombre')

  const lastNameInput = requireElement('#lastName', 'campo de apellido')

  const passwordInput = requireElement('#password', 'campo de contraseña')

  const passwordContainer = requireElement(
    '#passwordContainer',
    'contenedor de contraseña'
  )

  const roleSelect = requireElement('#roleSelect', 'selector de rol')

  const roleContainer = requireElement('#roleContainer', 'contenedor del rol')

  const modalLoader = requireElement(
    '#modal-carga-user',
    'indicador de carga del modal de usuario'
  )

  /* ========================================================
     ESTADO
  ======================================================== */

  let initialized = false
  let changingPassword = false

  const events = createEventScope()

  /* ========================================================
     PETICIONES
  ======================================================== */

  async function crearUsuario(data) {
    mostrarCargaModal(true)

    try {
      return await create(data)
    } finally {
      mostrarCargaModal(false)
    }
  }

  async function actualizarUsuario(id, data) {
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
    modal: '#userModal',

    form: '#userForm',

    titleElement: '#modalTitle',

    /*
     * El HTML original no exportaba un id específico para
     * el botón submit, por lo que lo localizamos dentro del
     * formulario.
     */
    saveButton: '#userForm button[type="submit"]',

    closeButtons: ['#btnCloseModal'],

    cancelButtons: ['#btnCancel'],

    hiddenClass: 'hidden',

    createTitle: 'Crear Usuario',

    editTitle: 'Editar Usuario',

    createButtonText: 'Crear usuario',

    editButtonText: 'Guardar cambios',

    creatingText: 'Creando usuario...',

    updatingText: 'Guardando cambios...',

    createSuccessMessage: 'Usuario creado correctamente.',

    updateSuccessMessage: 'Usuario actualizado correctamente.',

    errorMessage: 'No se pudo guardar el usuario.',

    create: crearUsuario,

    update: actualizarUsuario,

    refresh,

    focusElement: usernameInput,

    disableFormWhileSubmitting: true,

    lockBodyScroll: true,

    validate({ editing, item }) {
      validarFormulario({
        editing,
        item,

        usernameInput,
        emailInput,
        nameInput,
        lastNameInput,
        passwordInput,
        roleSelect,

        isCurrentUser
      })
    },

    buildPayload({ editing, item }) {
      const roleId = obtenerRolParaPeticion({
        editing,
        item,
        roleSelect,
        isCurrentUser
      })

      const data = {
        username: usernameInput.value.trim(),

        email: emailInput.value.trim(),

        name: nameInput.value.trim(),

        last_name: lastNameInput.value.trim(),

        role_id: roleId
      }

      /*
       * La contraseña solo forma parte de la creación.
       *
       * En edición existe un endpoint independiente para
       * cambiarla.
       */
      if (!editing) data.password = passwordInput.value

      return data
    },

    populate(_form, user) {
      usernameInput.value = user.username ?? ''

      emailInput.value = user.email ?? ''

      nameInput.value = user.name ?? ''

      lastNameInput.value = user.last_name ?? ''

      passwordInput.value = ''

      renderRoleOptions({
        roles: getRoles(),

        selectedId: user.role_id,

        fallbackName: user.role_name
      })
    },

    clear(form) {
      form.reset()

      passwordInput.value = ''
      passwordInput.required = false

      passwordContainer.hidden = true

      roleContainer.hidden = false
      roleSelect.hidden = false
      roleSelect.disabled = false

      mostrarCargaModal(false)
    },

    onOpenCreate() {
      configurarCreacion()
    },

    onOpenEdit({ item }) {
      configurarEdicion(item)
    },

    onClose() {
      mostrarCargaModal(false)

      passwordInput.required = false

      roleContainer.hidden = false
      roleSelect.hidden = false
      roleSelect.disabled = false
    }
  })

  /* ========================================================
     CONTROLADOR PÚBLICO
  ======================================================== */

  const controller = {
    initialize,
    destroy,

    openCreate(...args) {
      return baseController.openCreate(...args)
    },

    openEdit(...args) {
      return baseController.openEdit(...args)
    },

    close(...args) {
      return baseController.close(...args)
    },

    askNewPassword,

    get editing() {
      return baseController.editing
    },

    get submitting() {
      return baseController.submitting
    },

    get changingPassword() {
      return changingPassword
    }
  }

  return controller

  /* ========================================================
     INITIALIZATION
  ======================================================== */

  function initialize() {
    if (initialized) return controller

    baseController.initialize()

    /*
     * El nombre de usuario no puede contener espacios.
     */
    events.on(usernameInput, 'input', () => {
      usernameInput.value = usernameInput.value.replace(/\s+/g, '')
    })

    /*
     * Los correos tampoco pueden contener espacios.
     */
    events.on(emailInput, 'input', () => {
      emailInput.value = emailInput.value.replace(/\s+/g, '')
    })

    mostrarCargaModal(false)

    initialized = true

    return controller
  }

  function destroy() {
    events.destroy()
    baseController.destroy()

    initialized = false
    changingPassword = false

    mostrarCargaModal(false)
  }

  /* ========================================================
     CREATE MODE
  ======================================================== */

  function configurarCreacion() {
    passwordContainer.hidden = false

    passwordInput.hidden = false
    passwordInput.disabled = false
    passwordInput.required = true

    roleContainer.hidden = false

    roleSelect.hidden = false
    roleSelect.disabled = false

    renderRoleOptions({
      roles: getRoles()
    })
  }

  /* ========================================================
     EDIT MODE
  ======================================================== */

  function configurarEdicion(user) {
    passwordInput.value = ''

    passwordInput.required = false
    passwordInput.disabled = false

    passwordContainer.hidden = true

    const currentUser = isCurrentUser(user)

    /*
     * El usuario actual puede editar sus datos personales,
     * pero no cambiarse a sí mismo de rol.
     */
    roleContainer.hidden = currentUser

    roleSelect.hidden = currentUser

    roleSelect.disabled = false
  }

  /* ========================================================
     PASSWORD
  ======================================================== */

  async function askNewPassword(user) {
    if (changingPassword || !user) return false

    if (!isCurrentUser(user)) {
      showToast(
        'Solo podés cambiar la contraseña de tu propio usuario.',
        'warning'
      )

      return false
    }

    const password = window.prompt(
      `Nueva contraseña para ${obtenerUsername(user)}`
    )

    if (password === null) return false

    if (password.trim() === '') {
      showToast('La contraseña no puede estar vacía.', 'warning')

      return false
    }

    if (password.length < 6) {
      showToast('La contraseña debe contener al menos 6 caracteres.', 'warning')

      return false
    }

    const id = normalizarId(user.id, 'El usuario no tiene un id válido.')

    changingPassword = true

    try {
      await changePassword(id, password)

      showToast('Contraseña actualizada correctamente.', 'success')

      return true
    } catch (error) {
      console.error('No se pudo cambiar la contraseña:', error)

      showToast(
        error instanceof Error
          ? error.message
          : 'No se pudo cambiar la contraseña.',
        'error'
      )

      return false
    } finally {
      changingPassword = false
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
   ROLES
========================================================== */

function renderRoleOptions({ roles, selectedId = null, fallbackName = '' }) {
  const roleSelect = requireElement('#roleSelect', 'selector de rol')

  roleSelect.replaceChildren()

  const normalizedRoles = normalizarRoles(roles)

  const normalizedSelectedId = normalizarIdOpcional(selectedId)

  /*
   * Puede ocurrir que el rol actual no aparezca dentro de la
   * respuesta general de roles. En ese caso lo conservamos
   * como opción para evitar modificarlo accidentalmente.
   */
  if (
    normalizedSelectedId !== null &&
    !normalizedRoles.some((role) => role.id === normalizedSelectedId)
  )
    normalizedRoles.push({
      id: normalizedSelectedId,

      name: String(fallbackName || `Rol n.º ${normalizedSelectedId}`).trim()
    })

  if (normalizedRoles.length === 0) {
    const option = document.createElement('option')

    option.value = ''
    option.textContent = 'No hay roles disponibles'

    option.disabled = true
    option.selected = true

    roleSelect.appendChild(option)

    return
  }

  const fragment = document.createDocumentFragment()

  normalizedRoles.forEach((role) => {
    const option = document.createElement('option')

    option.value = String(role.id)

    option.textContent = role.name

    fragment.appendChild(option)
  })

  roleSelect.appendChild(fragment)

  const selectedRole =
    normalizedSelectedId !== null &&
    normalizedRoles.some((role) => role.id === normalizedSelectedId)
      ? normalizedSelectedId
      : normalizedRoles[0].id

  roleSelect.value = String(selectedRole)
}

function normalizarRoles(roles) {
  if (!Array.isArray(roles)) return []

  const uniqueRoles = new Map()

  roles.forEach((role) => {
    if (!role || typeof role !== 'object') return

    const id = normalizarIdOpcional(role.id)

    const name = String(role.name ?? '').trim()

    if (id === null || !name) return

    if (!uniqueRoles.has(id))
      uniqueRoles.set(id, {
        id,
        name
      })
  })

  return [...uniqueRoles.values()].sort((roleA, roleB) =>
    roleA.name.localeCompare(roleB.name, 'es-AR', {
      sensitivity: 'base'
    })
  )
}

/* ==========================================================
   VALIDATION
========================================================== */

function validarFormulario({
  editing,
  item,

  usernameInput,
  emailInput,
  nameInput,
  lastNameInput,
  passwordInput,
  roleSelect,

  isCurrentUser
}) {
  const username = usernameInput.value.trim()

  if (username.length < 3) {
    focusSoon(usernameInput, {
      selectText: true
    })

    throw new Error('El nombre de usuario es muy corto.')
  }

  if (/\s/.test(username)) {
    focusSoon(usernameInput, {
      selectText: true
    })

    throw new Error('El nombre de usuario no puede contener espacios.')
  }

  const name = nameInput.value.trim()

  if (!name) {
    focusSoon(nameInput)

    throw new Error('El nombre es requerido.')
  }

  const lastName = lastNameInput.value.trim()

  if (!lastName) {
    focusSoon(lastNameInput)

    throw new Error('El apellido es requerido.')
  }

  const email = emailInput.value.trim()

  if (!EMAIL_PATTERN.test(email)) {
    focusSoon(emailInput, {
      selectText: true
    })

    throw new Error('Correo electrónico inválido.')
  }

  const roleId =
    editing && isCurrentUser(item)
      ? normalizarIdOpcional(item?.role_id)
      : normalizarIdOpcional(roleSelect.value)

  if (roleId === null) {
    if (!editing || !isCurrentUser(item)) focusSoon(roleSelect)

    throw new Error('Seleccioná un rol válido.')
  }

  if (!editing && passwordInput.value.length < 6) {
    focusSoon(passwordInput)

    throw new Error('La contraseña debe contener al menos 6 caracteres.')
  }
}

/* ==========================================================
   REQUEST DATA
========================================================== */

function obtenerRolParaPeticion({ editing, item, roleSelect, isCurrentUser }) {
  const value =
    editing && isCurrentUser(item) ? item?.role_id : roleSelect.value

  return normalizarId(value, 'El rol seleccionado no es válido.')
}

/* ==========================================================
   USER HELPERS
========================================================== */

function obtenerUsername(user) {
  const username = String(user?.username ?? '').trim()

  if (username) return username

  return `usuario n.º ${user?.id ?? ''}`.trim()
}

/* ==========================================================
   ID HELPERS
========================================================== */

function normalizarId(value, errorMessage) {
  const id = normalizarIdOpcional(value)

  if (id === null) throw new TypeError(errorMessage)

  return id
}

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
  changePassword,
  refresh,
  getRoles,
  isCurrentUser
}) {
  const functions = {
    create,
    update,
    changePassword,
    refresh,
    getRoles,
    isCurrentUser
  }

  for (const [name, value] of Object.entries(functions)) {
    if (typeof value !== 'function')
      throw new TypeError(`createUserModal requiere ${name}.`)
  }
}
