import { request } from './api.js'
import { getSessionItem, hasSession } from './session.js'

export const PROFILE_SETTINGS_CACHE_PREFIX = 'seno_profile_settings:'

let memoryCacheUser = null
let memoryCacheData = null
let pendingLoadPromise = null

function getCurrentUsername(storage = getDefaultStorage()) {
  const sessionUsername =
    typeof getSessionItem === 'function' ? getSessionItem('username') : null
  if (sessionUsername) return String(sessionUsername).trim()

  try {
    return storage?.getItem('username')?.trim() || 'anonymous'
  } catch {
    return 'anonymous'
  }
}

function getDefaultStorage() {
  return typeof window !== 'undefined' ? window.localStorage : null
}

function getCacheKey(storage = getDefaultStorage()) {
  return `${PROFILE_SETTINGS_CACHE_PREFIX}${getCurrentUsername(storage)}`
}

export function getCachedProfileSettings({
  storage = getDefaultStorage()
} = {}) {
  const currentUser = getCurrentUsername(storage)

  if (
    memoryCacheData &&
    memoryCacheUser === currentUser &&
    typeof memoryCacheData === 'object'
  ) {
    return { ...memoryCacheData }
  }

  if (!storage) return {}

  try {
    const raw = storage.getItem(getCacheKey(storage))
    if (!raw) return {}

    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    memoryCacheUser = currentUser
    memoryCacheData = parsed
    return { ...parsed }
  } catch {
    return {}
  }
}

export function setCachedProfileSettings(
  settings,
  { storage = getDefaultStorage() } = {}
) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return {}
  }

  const currentUser = getCurrentUsername(storage)
  memoryCacheUser = currentUser
  memoryCacheData = { ...settings }

  if (storage) {
    try {
      storage.setItem(getCacheKey(storage), JSON.stringify(memoryCacheData))
    } catch {
      // Ignore storage quota errors
    }
  }

  return { ...memoryCacheData }
}

export function getCachedModuleSettings(
  moduleKey,
  { storage = getDefaultStorage() } = {}
) {
  if (!moduleKey) return null
  const allSettings = getCachedProfileSettings({ storage })
  const section = allSettings[moduleKey]

  return section && typeof section === 'object' && !Array.isArray(section)
    ? { ...section }
    : null
}

export function setCachedModuleSettings(
  moduleKey,
  sectionSettings,
  { storage = getDefaultStorage() } = {}
) {
  if (
    !moduleKey ||
    !sectionSettings ||
    typeof sectionSettings !== 'object' ||
    Array.isArray(sectionSettings)
  ) {
    return null
  }

  const allSettings = getCachedProfileSettings({ storage })
  const merged = {
    ...allSettings,
    [moduleKey]: {
      ...(allSettings[moduleKey] && typeof allSettings[moduleKey] === 'object'
        ? allSettings[moduleKey]
        : {}),
      ...sectionSettings
    }
  }

  setCachedProfileSettings(merged, { storage })
  return { ...merged[moduleKey] }
}

export async function loadProfileSettings({
  force = false,
  storage = getDefaultStorage(),
  fetchSettings = null
} = {}) {
  const currentUser = getCurrentUsername(storage)

  if (!force && memoryCacheData && memoryCacheUser === currentUser) {
    return { ...memoryCacheData }
  }

  if (
    !fetchSettings &&
    typeof window !== 'undefined' &&
    !hasSession()
  ) {
    return getCachedProfileSettings({ storage })
  }

  if (pendingLoadPromise && !force) {
    return pendingLoadPromise
  }

  const executeFetch =
    fetchSettings ??
    (() =>
      request('/profile/settings', {
        method: 'GET',
        globalLoading: false
      }))

  pendingLoadPromise = (async () => {
    try {
      const remote = await executeFetch()
      if (remote && typeof remote === 'object' && !Array.isArray(remote)) {
        const local = getCachedProfileSettings({ storage })
        const merged = { ...local, ...remote }
        return setCachedProfileSettings(merged, { storage })
      }
    } catch (error) {
      console.warn(
        'No se pudo sincronizar la configuración del perfil desde el servidor:',
        error
      )
    } finally {
      pendingLoadPromise = null
    }

    return getCachedProfileSettings({ storage })
  })()

  return pendingLoadPromise
}

export async function loadModuleSettings(
  moduleKey,
  { force = false, storage = getDefaultStorage(), fetchSettings } = {}
) {
  if (!moduleKey) return null

  const allSettings = await loadProfileSettings({
    force,
    storage,
    ...(fetchSettings ? { fetchSettings } : {})
  })

  const section = allSettings?.[moduleKey]
  return section && typeof section === 'object' && !Array.isArray(section)
    ? { ...section }
    : null
}

export async function saveModuleSettings(
  moduleKey,
  sectionSettings,
  {
    storage = getDefaultStorage(),
    patchSettings = null
  } = {}
) {
  const updatedSection = setCachedModuleSettings(moduleKey, sectionSettings, {
    storage
  })

  if (!updatedSection) return null

  if (
    !patchSettings &&
    typeof window !== 'undefined' &&
    !hasSession()
  ) {
    return updatedSection
  }

  const executePatch =
    patchSettings ??
    ((payload) =>
      request('/profile/settings', {
        method: 'PATCH',
        body: payload,
        globalLoading: false
      }))

  try {
    const response = await executePatch({
      [moduleKey]: updatedSection
    })

    if (response && typeof response === 'object' && !Array.isArray(response)) {
      setCachedProfileSettings(response, { storage })
      return response[moduleKey] ?? updatedSection
    }
  } catch (error) {
    console.warn(
      `No se pudo guardar la configuración de "${moduleKey}" en el perfil:`,
      error
    )
  }

  return updatedSection
}

export function resetProfileSettingsMemoryCache() {
  memoryCacheUser = null
  memoryCacheData = null
  pendingLoadPromise = null
}
