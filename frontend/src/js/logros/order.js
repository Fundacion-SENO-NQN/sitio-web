import { changeAchievementsOrder } from '../common/api.js'

import { achievements, modalCarga, refreshAchievements } from './logros.js'

import { showToast } from '../common/toast.js'

export async function moveAchievementUp(id) {
  modalCarga.hidden = false
  const achievement = achievements.find((a) => a.id === id)

  if (!achievement) return

  if (achievement.orden === 0) return

  const previous = achievements.find((a) => a.orden === achievement.orden - 1)

  if (!previous) return

  await swapAchievements(achievement, previous)
  modalCarga.hidden = true
}

export async function moveAchievementDown(id) {
  modalCarga.hidden = false
  const achievement = achievements.find((a) => a.id === id)

  if (!achievement) return

  const next = achievements.find((a) => a.orden === achievement.orden + 1)

  if (!next) return

  await swapAchievements(achievement, next)
  modalCarga.hidden = true
}

async function swapAchievements(first, second) {
  try {
    const request = [
      {
        id: first.id,
        orden: second.orden,
      },
      {
        id: second.id,
        orden: first.orden,
      },
    ]

    await changeAchievementsOrder(request)

    const temp = first.orden

    first.orden = second.orden
    second.orden = temp

    await refreshAchievements()

    showToast('Orden actualizado.', 'success')
  } catch (err) {
    console.error(err)

    showToast(err.message, 'error')
  }
}
