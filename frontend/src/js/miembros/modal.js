import { refreshMembers } from './miembros.js'

import { createMember, updateMember } from '../common/api.js'

import { buildMemberFormData } from './formData.js'

import { showToast } from '../common/toast.js'

/* ==========================================================
   DOM
========================================================== */

const modal = document.getElementById('memberModal')

const form = document.getElementById('memberForm')

const modalTitle = document.getElementById('memberModalTitle')

const nameInput = document.getElementById('memberName')

const lastNameInput = document.getElementById('memberLastName')

const positionInput = document.getElementById('memberPosition')

const descriptionInput = document.getElementById('memberDescription')

const imageInput = document.getElementById('memberImage')

const imageUpload = document.getElementById('memberImageUpload')

const imagePreview = document.getElementById('memberImagePreview')

const imagePlaceholder = document.getElementById('memberImagePlaceholder')

const imageHelp = document.getElementById('memberImageHelp')

const closeButton = document.getElementById('btnCloseMemberModal')

const cancelButton = document.getElementById('btnCancelMember')

const saveButton = document.getElementById('btnSaveMember')

/* ==========================================================
   STATE
========================================================== */

let editingMember = null

let previewObjectUrl = null

let submitting = false

/* ==========================================================
   EVENTS
========================================================== */

export function registerMemberModalEvents() {
  form?.addEventListener('submit', submitMemberForm)

  closeButton?.addEventListener('click', closeMemberModal)

  cancelButton?.addEventListener('click', closeMemberModal)

  imageInput?.addEventListener('change', handleImageSelection)

  imageUpload?.addEventListener('dragover', handleDragOver)

  imageUpload?.addEventListener('dragleave', handleDragLeave)

  imageUpload?.addEventListener('drop', handleImageDrop)

  modal?.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeMemberModal()
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal?.classList.contains('hidden')) {
      closeMemberModal()
    }
  })
}

/* ==========================================================
   OPEN CREATE
========================================================== */

export function openCreateMemberModal() {
  editingMember = null

  clearForm()

  if (modalTitle) {
    modalTitle.textContent = 'Nuevo miembro'
  }

  if (saveButton) {
    saveButton.textContent = 'Crear miembro'
  }

  if (imageInput) {
    imageInput.required = true
  }

  if (imageHelp) {
    imageHelp.textContent = 'La fotografía es obligatoria al crear un miembro.'
  }

  openModal()

  nameInput?.focus()
}

/* ==========================================================
   OPEN EDIT
========================================================== */

export function openEditMemberModal(member) {
  editingMember = member

  clearForm()

  if (modalTitle) {
    modalTitle.textContent = 'Editar miembro'
  }

  if (saveButton) {
    saveButton.textContent = 'Guardar cambios'
  }

  if (nameInput) {
    nameInput.value = member.nombre ?? ''
  }

  if (lastNameInput) {
    lastNameInput.value = member.apellido ?? ''
  }

  if (positionInput) {
    positionInput.value = member.puesto ?? ''
  }

  if (descriptionInput) {
    descriptionInput.value = member.descripcion ?? ''
  }

  if (imageInput) {
    imageInput.required = false
  }

  if (imageHelp) {
    imageHelp.textContent =
      'Dejá este campo vacío para conservar la fotografía actual.'
  }

  showImagePreview(`/img_equipo/${member.id}.avif`, false)

  openModal()

  nameInput?.focus()
}

/* ==========================================================
   SUBMIT
========================================================== */

async function submitMemberForm(event) {
  event.preventDefault()

  if (submitting) {
    return
  }

  const nombre = nameInput?.value.trim() ?? ''

  const apellido = lastNameInput?.value.trim() ?? ''

  const puesto = positionInput?.value.trim() ?? ''

  const descripcion = descriptionInput?.value.trim() ?? ''

  const image = imageInput?.files?.[0] ?? null

  if (!nombre || !apellido || !puesto || !descripcion) {
    showToast('Completá todos los campos obligatorios.', 'warning')

    return
  }

  if (!editingMember && !image) {
    showToast('Seleccioná una fotografía para el miembro.', 'warning')

    return
  }

  submitting = true

  setSubmittingState(true)

  try {
    const data = {
      nombre,
      apellido,
      puesto,
      descripcion,
      image,
    }

    if (editingMember) {
      const formData = buildMemberFormData(data)

      await updateMember(editingMember.id, formData)

      showToast('El miembro fue actualizado correctamente.', 'success')
    } else {
      const formData = buildMemberFormData(data)

      await createMember(formData)

      showToast('El miembro fue creado correctamente.', 'success')
    }

    closeMemberModal()

    await refreshMembers()
  } catch (error) {
    console.error('Error saving member:', error)

    showToast(error.message || 'No se pudo guardar el miembro.', 'error', 5000)
  } finally {
    submitting = false

    setSubmittingState(false)
  }
}

/* ==========================================================
   IMAGE PREVIEW
========================================================== */

function handleImageSelection() {
  const file = imageInput?.files?.[0]

  if (!file) {
    if (editingMember) {
      showImagePreview(`/img_equipo/${editingMember.id}.avif`, false)
    } else {
      hideImagePreview()
    }

    return
  }

  if (!isValidImage(file)) {
    if (imageInput) {
      imageInput.value = ''
    }

    showToast(
      'El archivo debe ser una imagen JPG, PNG, WebP o AVIF.',
      'warning',
    )

    return
  }

  showFilePreview(file)
}

function handleDragOver(event) {
  event.preventDefault()

  imageUpload?.classList.add('dragover')
}

function handleDragLeave(event) {
  event.preventDefault()

  imageUpload?.classList.remove('dragover')
}

function handleImageDrop(event) {
  event.preventDefault()

  imageUpload?.classList.remove('dragover')

  const file = event.dataTransfer?.files?.[0]

  if (!file || !imageInput) {
    return
  }

  if (!isValidImage(file)) {
    showToast(
      'El archivo debe ser una imagen JPG, PNG, WebP o AVIF.',
      'warning',
    )

    return
  }

  const transfer = new DataTransfer()

  transfer.items.add(file)

  imageInput.files = transfer.files

  showFilePreview(file)
}

function isValidImage(file) {
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']

  return validTypes.includes(file.type)
}

function showFilePreview(file) {
  revokePreviewObjectUrl()

  previewObjectUrl = URL.createObjectURL(file)

  showImagePreview(previewObjectUrl, true)
}

function showImagePreview(source, isTemporary) {
  if (!imagePreview || !imagePlaceholder) {
    return
  }

  if (!isTemporary) {
    revokePreviewObjectUrl()
  }

  imagePreview.src = source
  imagePreview.classList.remove('hidden')

  imagePlaceholder.classList.add('hidden')

  imagePreview.onerror = () => {
    hideImagePreview()
  }
}

function hideImagePreview() {
  revokePreviewObjectUrl()

  if (imagePreview) {
    imagePreview.removeAttribute('src')
    imagePreview.classList.add('hidden')
  }

  imagePlaceholder?.classList.remove('hidden')
}

function revokePreviewObjectUrl() {
  if (!previewObjectUrl) {
    return
  }

  URL.revokeObjectURL(previewObjectUrl)

  previewObjectUrl = null
}

/* ==========================================================
   MODAL HELPERS
========================================================== */

function openModal() {
  modal?.classList.remove('hidden')

  document.body.style.overflow = 'hidden'
}

export function closeMemberModal() {
  if (submitting) {
    return
  }

  modal?.classList.add('hidden')

  document.body.style.overflow = ''

  editingMember = null

  clearForm()
}

function clearForm() {
  form?.reset()

  hideImagePreview()

  imageUpload?.classList.remove('dragover')
}

function setSubmittingState(isSubmitting) {
  if (!saveButton) {
    return
  }

  saveButton.disabled = isSubmitting

  if (isSubmitting) {
    saveButton.textContent = editingMember
      ? 'Guardando cambios...'
      : 'Creando miembro...'

    return
  }

  saveButton.textContent = editingMember ? 'Guardar cambios' : 'Crear miembro'
}
