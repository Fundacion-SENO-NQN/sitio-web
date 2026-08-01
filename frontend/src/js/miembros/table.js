import { filteredMembers, members } from './miembros.js'

import { openEditMemberModal } from './modal.js'

import { openDeleteMemberModal } from './delete.js'

import { moveMemberUp, moveMemberDown } from './order.js'

const tableBody = document.getElementById('membersBody')

const emptyState = document.getElementById('membersEmpty')

const tableWrapper = document.querySelector('.tableWrapper')

export function renderMembers() {
  if (!tableBody || !emptyState) {
    return
  }

  tableBody.replaceChildren()

  if (filteredMembers.length === 0) {
    emptyState.classList.remove('hidden')
    tableWrapper?.classList.add('hidden')

    return
  }

  emptyState.classList.add('hidden')
  tableWrapper?.classList.remove('hidden')

  const orderedMembers = [...members].sort(
    (memberA, memberB) => memberA.orden - memberB.orden,
  )

  const minimumOrder = orderedMembers[0]?.orden ?? 0

  const maximumOrder = orderedMembers.at(-1)?.orden ?? 0

  const fragment = document.createDocumentFragment()

  for (const member of filteredMembers) {
    fragment.appendChild(createMemberRow(member, minimumOrder, maximumOrder))
  }

  tableBody.appendChild(fragment)
}

function createMemberRow(member, minimumOrder, maximumOrder) {
  const row = document.createElement('tr')

  row.dataset.memberId = String(member.id)

  row.appendChild(createOrderCell(member, minimumOrder, maximumOrder))

  row.appendChild(createImageCell(member))

  row.appendChild(createNameCell(member))

  row.appendChild(
    createTextCell(member.puesto || 'Sin puesto', 'memberPosition'),
  )

  row.appendChild(createDescriptionCell(member.descripcion))

  row.appendChild(createDateCell(member.created_at))

  row.appendChild(createActionsCell(member))

  return row
}

/* ==========================================================
   ORDER
========================================================== */

function createOrderCell(member, minimumOrder, maximumOrder) {
  const cell = document.createElement('td')

  const container = document.createElement('div')

  container.className = 'orderCell'

  const value = document.createElement('span')

  value.className = 'orderValue'

  // Show order starting at 1 for users.
  value.textContent = String(member.orden + 1)

  const buttons = document.createElement('div')

  buttons.className = 'orderButtons'

  const upButton = createOrderButton({
    text: '↑',
    label: `Subir a ${member.nombre}`,
    disabled: member.orden === minimumOrder,
    action: () => moveMemberUp(member.id),
  })

  const downButton = createOrderButton({
    text: '↓',
    label: `Bajar a ${member.nombre}`,
    disabled: member.orden === maximumOrder,
    action: () => moveMemberDown(member.id),
  })

  buttons.append(upButton, downButton)

  container.append(value, buttons)

  cell.appendChild(container)

  return cell
}

function createOrderButton({ text, label, disabled, action }) {
  const button = document.createElement('button')

  button.type = 'button'
  button.className = 'orderButton'
  button.textContent = text
  button.disabled = disabled

  button.setAttribute('aria-label', label)

  button.addEventListener('click', action)

  return button
}

/* ==========================================================
   IMAGE
========================================================== */

function createImageCell(member) {
  const cell = document.createElement('td')

  const image = document.createElement('img')

  image.className = 'memberImage'
  image.src = `/img_equipo/${member.id}.avif`

  image.alt = `Fotografía de ${member.nombre} ${member.apellido}`

  image.loading = 'lazy'
  image.decoding = 'async'

  image.addEventListener(
    'error',
    () => {
      image.classList.add('memberImageError')

      image.removeAttribute('src')

      image.alt = `No se pudo cargar la fotografía de ${member.nombre}`
    },
    {
      once: true,
    },
  )

  cell.appendChild(image)

  return cell
}

/* ==========================================================
   INFORMATION
========================================================== */

function createNameCell(member) {
  const cell = document.createElement('td')

  const container = document.createElement('div')

  container.className = 'memberInfo'

  const name = document.createElement('strong')

  name.textContent = `${member.nombre} ${member.apellido}`

  container.appendChild(name)
  cell.appendChild(container)

  return cell
}

function createDescriptionCell(description) {
  const cell = document.createElement('td')

  const paragraph = document.createElement('p')

  paragraph.className = 'memberDescription'

  paragraph.textContent = description || 'Sin descripción'

  cell.appendChild(paragraph)

  return cell
}

function createTextCell(text, className = '') {
  const cell = document.createElement('td')

  if (className) {
    cell.className = className
  }

  cell.textContent = text

  return cell
}

function createDateCell(createdAt) {
  const cell = document.createElement('td')

  cell.className = 'memberDate'

  cell.textContent = formatDate(createdAt)

  return cell
}

function formatDate(value) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

/* ==========================================================
   ACTIONS
========================================================== */

function createActionsCell(member) {
  const cell = document.createElement('td')

  const actions = document.createElement('div')

  actions.className = 'actions'

  const editButton = document.createElement('button')

  editButton.type = 'button'
  editButton.className = 'tableButton edit'

  editButton.textContent = 'Editar'

  editButton.setAttribute(
    'aria-label',
    `Editar a ${member.nombre} ${member.apellido}`,
  )

  editButton.addEventListener('click', () => {
    openEditMemberModal(member)
  })

  const deleteButton = document.createElement('button')

  deleteButton.type = 'button'
  deleteButton.className = 'tableButton delete'

  deleteButton.textContent = 'Eliminar'

  deleteButton.setAttribute(
    'aria-label',
    `Eliminar a ${member.nombre} ${member.apellido}`,
  )

  deleteButton.addEventListener('click', () => {
    openDeleteMemberModal(member)
  })

  actions.append(editButton, deleteButton)

  cell.appendChild(actions)

  return cell
}
