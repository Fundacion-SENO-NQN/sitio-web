import { filteredAchievements, featuredAchievements } from './logros.js'

import { openEditAchievementModal } from './modal.js'

import { openDeleteAchievementModal } from './delete.js'

import { moveAchievementUp, moveAchievementDown } from './order.js'

const tbody = document.getElementById('achievementsBody')

const empty = document.getElementById('achievementsEmpty')

export function renderAchievements() {
  tbody.innerHTML = ''

  if (filteredAchievements.length === 0) {
    empty.hidden = false
    return
  }

  empty.hidden = true

  filteredAchievements.forEach((achievement) => {
    tbody.appendChild(createAchievementRow(achievement))
  })
}

function createAchievementRow(achievement) {
  const tr = document.createElement('tr')
  tr.id = `row-achievement-${achievement.id}`
  tr.append(
    createOrderCell(achievement),

    createImageCell(achievement),

    createTitleCell(achievement),

    createFeaturedCell(achievement),

    createActionsCell(achievement),
  )

  return tr
}

function createImageCell(achievement) {
  const td = document.createElement('td')

  const img = document.createElement('img')

  img.className = 'achievementImage'

  img.src = `../src/assets/img_logros/${achievement.id}.avif`

  img.loading = 'lazy'

  td.appendChild(img)

  return td
}

function createTitleCell(achievement) {
  const td = document.createElement('td')

  const title = document.createElement('div')

  title.className = 'achievementTitle'

  title.textContent = achievement.titulo

  const content = document.createElement('div')

  content.className = 'achievementDescription'

  content.textContent =
    achievement.contenido.length > 100
      ? achievement.contenido.slice(0, 100) + '...'
      : achievement.contenido

  td.append(title, content)

  return td
}

function createFeaturedCell(achievement) {
  const td = document.createElement('td')

  const badge = document.createElement('span')

  if (featuredAchievements.some(item => item.id === achievement.id)) {
    badge.className = 'featuredBadge'

    badge.textContent = `★ ${featuredAchievements.findIndex((item) => item.id === achievement.id) + 1}`
  } else {
    badge.className = 'normalBadge'

    badge.textContent = '-'
  }

  td.appendChild(badge)

  return td
}

function createOrderCell(achievement) {
  const td = document.createElement('td')

  td.className = 'orderCell'

  const up = document.createElement('button')

  up.className = 'tableButton'

  up.textContent = '↑'

  up.onclick = () => {
    moveAchievementUp(achievement.id)
  }

  const down = document.createElement('button')

  down.className = 'tableButton'

  down.textContent = '↓'

  down.onclick = () => {
    moveAchievementDown(achievement.id)
  }

  td.append(up, down)

  return td
}

function createActionsCell(achievement) {
  const td = document.createElement('td')

  td.className = 'actions'

  const edit = document.createElement('button')

  edit.className = 'tableButton edit'

  edit.textContent = 'Editar'

  edit.onclick = () => {
    openEditAchievementModal(achievement)
  }

  td.appendChild(edit)

  const del = document.createElement('button')

  del.className = 'tableButton delete'

  del.textContent = 'Borrar'

  del.onclick = () => {
    openDeleteAchievementModal(achievement)
  }

  td.appendChild(del)

  return td
}
