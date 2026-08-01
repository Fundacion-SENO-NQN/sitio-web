import { getAchievements, getFeaturedAchievements } from '../common/api.js'

import { renderAchievements } from './table.js'
import { registerModalEvents } from './modal.js'
import { registerDeleteEvents } from './delete.js'
import { registerFeaturedEvents } from './featured.js'
import { openCreateAchievementModal } from './modal.js'

/* ============================================================
 * DOM
 * ========================================================== */

export const achievementsBody = document.getElementById('achievementsBody')

export const achievementsEmpty = document.getElementById('achievementsEmpty')

export const btnNewAchievement = document.getElementById('btnNewAchievement')

export const btnFeatured = document.getElementById('btnFeatured')

export const modalCarga = document.getElementById('modal-carga')

/* ============================================================
 * STATE
 * ========================================================== */

export let achievements = []

export let filteredAchievements = []

export let featuredAchievements = []

export let editingAchievement = null

export let deletingAchievement = null

/* ============================================================
 * INITIALIZATION
 * ========================================================== */

init()

async function init() {
  registerEvents()

  registerModalEvents()

  registerDeleteEvents()

  registerFeaturedEvents()

  await refreshAchievements()

  await refreshFeaturedAchievements()

  modalCarga.hidden = true
}

/* ============================================================
 * LOAD
 * ========================================================== */

export async function refreshAchievements() {
  modalCarga.hidden = false
  achievements = await getAchievements()

  filteredAchievements = [...achievements]

  renderAchievements()
  modalCarga.hidden = true
}

export async function refreshFeaturedAchievements() {
  modalCarga.hidden = false
  featuredAchievements = await getFeaturedAchievements()

  renderAchievements()
  modalCarga.hidden = true
}

/* ============================================================
 * EVENTS
 * ========================================================== */

function registerEvents() {
  btnNewAchievement.onclick = openCreateAchievementModal
}
