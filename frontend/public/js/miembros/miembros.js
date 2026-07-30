import { getMembers } from '../common/api.js'

import { renderMembers } from './table.js'

import { openCreateMemberModal, registerMemberModalEvents } from './modal.js'

import { registerMemberDeleteEvents } from './delete.js'

/* ==========================================================
   STATE
========================================================== */

export let members = []

export let filteredMembers = []

let currentSort = 'order'

let ascending = true

/* ==========================================================
   DOM
========================================================== */

const searchInput = document.getElementById('searchMembers')

const sortName = document.getElementById('sortName')

const sortDate = document.getElementById('sortDate')

const btnNewMember = document.getElementById('btnNewMember')

const btnEmptyNewMember = document.getElementById('btnEmptyNewMember')

/* ==========================================================
   INITIALIZATION
========================================================== */

async function init() {
  registerGeneralEvents()

  registerMemberModalEvents()

  registerMemberDeleteEvents()

  await refreshMembers()
}

/* ==========================================================
   LOAD
========================================================== */

export async function refreshMembers() {
  try {
    members = await getMembers()

    members.sort((a, b) => a.orden - b.orden)

    applyFilters()
  } catch (error) {
    console.error('Error loading members:', error)

    filteredMembers = []

    renderMembers()
  }
}

/* ==========================================================
   EVENTS
========================================================== */

function registerGeneralEvents() {
  btnNewMember?.addEventListener('click', openCreateMemberModal)

  btnEmptyNewMember?.addEventListener('click', openCreateMemberModal)

  searchInput?.addEventListener('input', applyFilters)

  sortName?.addEventListener('click', () => changeSort('name'))

  sortDate?.addEventListener('click', () => changeSort('date'))

  sortName?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()

      changeSort('name')
    }
  })

  sortDate?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()

      changeSort('date')
    }
  })
}

/* ==========================================================
   FILTERING
========================================================== */

export function applyFilters() {
  const search = searchInput?.value.trim().toLocaleLowerCase('es') ?? ''

  filteredMembers = members.filter((member) => {
    if (!search) {
      return true
    }

    const fullName = `${member.nombre} ${member.apellido}`.toLocaleLowerCase(
      'es',
    )

    const position = member.puesto?.toLocaleLowerCase('es') ?? ''

    const description = member.descripcion?.toLocaleLowerCase('es') ?? ''

    return (
      fullName.includes(search) ||
      position.includes(search) ||
      description.includes(search)
    )
  })

  sortFilteredMembers()

  renderMembers()
}

/* ==========================================================
   SORTING
========================================================== */

function changeSort(sort) {
  if (currentSort === sort) {
    ascending = !ascending
  } else {
    currentSort = sort
    ascending = true
  }

  applyFilters()
}

function sortFilteredMembers() {
  filteredMembers.sort((memberA, memberB) => {
    let result = 0

    switch (currentSort) {
      case 'name': {
        const nameA = `${memberA.nombre} ${memberA.apellido}`

        const nameB = `${memberB.nombre} ${memberB.apellido}`

        result = nameA.localeCompare(nameB, 'es', {
          sensitivity: 'base',
        })

        break
      }

      case 'date': {
        const dateA = new Date(memberA.created_at).getTime()

        const dateB = new Date(memberB.created_at).getTime()

        result = dateA - dateB

        break
      }

      case 'order':
      default:
        result = memberA.orden - memberB.orden

        break
    }

    return ascending ? result : -result
  })
}

/* ==========================================================
   HELPERS
========================================================== */

export function getNextMemberOrder() {
  if (members.length === 0) {
    return 0
  }

  return Math.max(...members.map((member) => member.orden)) + 1
}

export function getMemberById(id) {
  return members.find((member) => member.id === id)
}

/* ==========================================================
   START
========================================================== */

init()
