/**
 * Session and cookie management module for Fundación SENO.
 * Manages authentication and user session in cookies with 3-day inactivity sliding expiration,
 * while keeping localStorage synchronized for backwards compatibility.
 */

export const SESSION_MAX_AGE_SECONDS = 3 * 24 * 60 * 60 // 3 days in seconds (259,200)
export const SESSION_INACTIVITY_MS = SESSION_MAX_AGE_SECONDS * 1000 // 3 days in milliseconds (259,200,000)
export const SESSION_KEYS = ['token', 'username', 'name', 'lastname', 'role', 'email']
export const ACTIVITY_KEY = 'session_last_active'
export const THROTTLE_MS = 60 * 1000 // Throttle rolling cookie update to at most once per minute

let lastTouchTime = 0
let authChannel = null

try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    authChannel = new BroadcastChannel('seno_auth_channel')
    authChannel.onmessage = (event) => {
      if (event.data?.type === 'SESSION_CLEARED') {
        window.dispatchEvent(new Event('session-cleared'))
        window.dispatchEvent(new Event('profile-updated'))
        if (window.location.pathname.startsWith('/plataforma')) {
          window.location.replace('/login/')
        }
      } else if (event.data?.type === 'SESSION_UPDATED') {
        window.dispatchEvent(new Event('session-updated'))
        window.dispatchEvent(new Event('profile-updated'))
      }
    }
  }
} catch {
  // BroadcastChannel not available or restricted
}

/**
 * Safely reads a cookie value by name.
 * @param {string} name
 * @returns {string | null}
 */
export function getCookie(name) {
  if (typeof document === 'undefined' || !document.cookie) return null
  const prefix = `${encodeURIComponent(name)}=`
  const cookies = document.cookie.split(';')
  for (const rawCookie of cookies) {
    const cookie = rawCookie.trim()
    if (cookie.startsWith(prefix)) {
      try {
        return decodeURIComponent(cookie.slice(prefix.length))
      } catch {
        return cookie.slice(prefix.length)
      }
    }
  }
  return null
}

/**
 * Safely sets a cookie with specified attributes.
 * @param {string} name
 * @param {string} value
 * @param {object} [options]
 */
export function setCookie(name, value, {
  maxAge = SESSION_MAX_AGE_SECONDS,
  path = '/',
  sameSite = 'Lax',
  secure = typeof location !== 'undefined' && location.protocol === 'https:'
} = {}) {
  if (typeof document === 'undefined') return
  let cookieStr = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=${path}; max-age=${maxAge}; SameSite=${sameSite}`
  if (secure) {
    cookieStr += '; Secure'
  }
  document.cookie = cookieStr
}

/**
 * Deletes a cookie by setting max-age to 0.
 * @param {string} name
 * @param {object} [options]
 */
export function deleteCookie(name, { path = '/' } = {}) {
  if (typeof document === 'undefined') return
  let cookieStr = `${encodeURIComponent(name)}=; path=${path}; max-age=0; SameSite=Lax`
  if (typeof location !== 'undefined' && location.protocol === 'https:') {
    cookieStr += '; Secure'
  }
  document.cookie = cookieStr
}

/**
 * Checks whether the current session has exceeded 3 days of inactivity.
 * Automatically migrates legacy localStorage session if cookie is not yet set.
 * @returns {boolean}
 */
export function isSessionExpired() {
  const lastActiveStr =
    getCookie(ACTIVITY_KEY) ||
    (typeof localStorage !== 'undefined'
      ? localStorage.getItem(ACTIVITY_KEY)
      : null)

  if (lastActiveStr) {
    const lastActive = Number(lastActiveStr)
    if (
      !Number.isNaN(lastActive) &&
      Date.now() - lastActive > SESSION_INACTIVITY_MS
    ) {
      return true
    }
  }

  let token = getCookie('token')
  if (!token && typeof localStorage !== 'undefined') {
    const localToken = localStorage.getItem('token')
    if (localToken) {
      setSession({
        token: localToken,
        username: localStorage.getItem('username') ?? undefined,
        name: localStorage.getItem('name') ?? undefined,
        lastname: localStorage.getItem('lastname') ?? undefined,
        role: localStorage.getItem('role') ?? undefined,
        email: localStorage.getItem('email') ?? undefined
      })
      token = localToken
    }
  }

  if (!token) return true

  return false
}

/**
 * Refreshes cookie expiration times (sliding window) on user activity.
 * Throttled to at most once per minute unless force=true.
 * @param {boolean} [force=false]
 */
export function touchSession(force = false) {
  if (typeof document === 'undefined') return
  const token = getCookie('token') || (typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null)
  if (!token) return

  const now = Date.now()
  if (!force && now - lastTouchTime < THROTTLE_MS) {
    return
  }

  // If already expired, clear session and bail out
  const lastActiveStr = getCookie(ACTIVITY_KEY) || (typeof localStorage !== 'undefined' ? localStorage.getItem(ACTIVITY_KEY) : null)
  if (lastActiveStr) {
    const lastActive = Number(lastActiveStr)
    if (!Number.isNaN(lastActive) && now - lastActive > SESSION_INACTIVITY_MS) {
      clearSession()
      return
    }
  }

  lastTouchTime = now

  // Update last active timestamp
  setCookie(ACTIVITY_KEY, String(now), { maxAge: SESSION_MAX_AGE_SECONDS })
  try {
    localStorage.setItem(ACTIVITY_KEY, String(now))
  } catch {}

  // Refresh expiration on each active session cookie
  for (const key of SESSION_KEYS) {
    const val = getCookie(key) || (typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null)
    if (val !== null && val !== undefined) {
      setCookie(key, val, { maxAge: SESSION_MAX_AGE_SECONDS })
    }
  }
}

/**
 * Returns the current auth token, or null if missing or expired.
 * Automatically clears session if inactive > 3 days.
 * @returns {string | null}
 */
export function getSessionToken() {
  if (typeof document === 'undefined') return null
  if (isSessionExpired()) {
    clearSession()
    return null
  }
  touchSession(false)
  return getCookie('token') || (typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null)
}

/**
 * Checks if there is an active, non-expired session.
 * @returns {boolean}
 */
export function hasSession() {
  return Boolean(getSessionToken())
}

/**
 * Retrieves a session field (e.g. 'username', 'name', 'role', 'email').
 * @param {string} key
 * @returns {string | null}
 */
export function getSessionItem(key) {
  if (typeof document === 'undefined') return null
  if (isSessionExpired()) {
    clearSession()
    return null
  }
  touchSession(false)
  return getCookie(key) || (typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null)
}

/**
 * Updates a single session field in cookies and synchronizes localStorage.
 * @param {string} key
 * @param {string} value
 */
export function setSessionItem(key, value) {
  if (typeof document === 'undefined') return
  const now = String(Date.now())
  const strVal = String(value ?? '')
  setCookie(key, strVal, { maxAge: SESSION_MAX_AGE_SECONDS })
  setCookie(ACTIVITY_KEY, now, { maxAge: SESSION_MAX_AGE_SECONDS })
  try {
    localStorage.setItem(key, strVal)
    localStorage.setItem(ACTIVITY_KEY, now)
  } catch {}
  window.dispatchEvent(new CustomEvent('session-updated', { detail: { key, value } }))
  window.dispatchEvent(new Event('profile-updated'))
  try {
    authChannel?.postMessage({ type: 'SESSION_UPDATED', key, value })
  } catch {}
}

/**
 * Stores full session data into cookies upon login and keeps localStorage synchronized.
 * @param {{ token: string, username?: string, name?: string, last_name?: string, lastname?: string, role_name?: string, role?: string, email?: string }} data
 */
export function setSession(data) {
  if (typeof document === 'undefined' || !data) return
  const now = String(Date.now())
  setCookie(ACTIVITY_KEY, now, { maxAge: SESSION_MAX_AGE_SECONDS })
  try {
    localStorage.setItem(ACTIVITY_KEY, now)
  } catch {}

  const mapping = {
    token: data.token,
    username: data.username,
    name: data.name,
    lastname: data.last_name || data.lastname,
    role: data.role_name || data.role,
    email: data.email
  }

  for (const [key, val] of Object.entries(mapping)) {
    if (val !== undefined && val !== null) {
      setCookie(key, String(val), { maxAge: SESSION_MAX_AGE_SECONDS })
      try {
        localStorage.setItem(key, String(val))
      } catch {}
    }
  }

  lastTouchTime = Date.now()
  window.dispatchEvent(new Event('session-updated'))
  window.dispatchEvent(new Event('profile-updated'))
  try {
    authChannel?.postMessage({ type: 'SESSION_UPDATED' })
  } catch {}
}

/**
 * Clears all session cookies and removes localStorage session keys.
 */
export function clearSession() {
  if (typeof document === 'undefined') return
  for (const key of [...SESSION_KEYS, ACTIVITY_KEY]) {
    deleteCookie(key)
    try {
      localStorage.removeItem(key)
    } catch {}
  }
  window.dispatchEvent(new Event('session-cleared'))
  window.dispatchEvent(new Event('profile-updated'))
  try {
    authChannel?.postMessage({ type: 'SESSION_CLEARED' })
  } catch {}
}

/**
 * Attaches activity listeners to renew session on user interaction.
 */
let activityListenerAttached = false

export function initSessionActivityListener() {
  if (typeof window === 'undefined' || activityListenerAttached) return
  activityListenerAttached = true

  const onActivity = () => {
    if (getCookie('token') || (typeof localStorage !== 'undefined' && localStorage.getItem('token'))) {
      touchSession(false)
    }
  }

  const events = ['pointerdown', 'keydown', 'touchstart', 'scroll']
  for (const ev of events) {
    window.addEventListener(ev, onActivity, { passive: true })
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (isSessionExpired()) {
        clearSession()
        if (window.location.pathname.startsWith('/plataforma')) {
          window.location.replace('/login/')
        }
      } else if (getCookie('token') || (typeof localStorage !== 'undefined' && localStorage.getItem('token'))) {
        touchSession(true)
      }
    }
  })
}

// Auto-initialize when loaded in browser
if (typeof window !== 'undefined') {
  initSessionActivityListener()
}
