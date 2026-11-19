import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  setSession,
  getSessionToken,
  hasSession,
  getSessionItem,
  setSessionItem,
  clearSession,
  isSessionExpired,
  getCookie,
  setCookie,
  deleteCookie,
  SESSION_INACTIVITY_MS
} from './session.js'

describe('session module', () => {
  beforeEach(() => {
    // Clear cookies
    document.cookie.split(';').forEach((cookie) => {
      const eqPos = cookie.indexOf('=')
      const name = eqPos > -1 ? cookie.slice(0, eqPos).trim() : cookie.trim()
      if (name) {
        document.cookie = `${name}=; max-age=0; path=/`
      }
    })
    // Clear localStorage
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getCookie and setCookie', () => {
    it('sets and gets cookie value correctly', () => {
      setCookie('test_key', 'test_val')
      expect(getCookie('test_key')).toBe('test_val')
    })

    it('returns null for non-existent cookie', () => {
      expect(getCookie('non_existent')).toBeNull()
    })

    it('deletes cookie correctly', () => {
      setCookie('test_key', 'test_val')
      expect(getCookie('test_key')).toBe('test_val')
      deleteCookie('test_key')
      expect(getCookie('test_key')).toBeNull()
    })
  })

  describe('setSession', () => {
    it('stores session data into cookies and keeps localStorage synchronized', () => {
      const sessionData = {
        token: 'jwt-token-123',
        username: 'juanperez',
        name: 'Juan',
        last_name: 'Pérez',
        role_name: 'admin',
        email: 'juan@seno.org'
      }

      setSession(sessionData)

      expect(getCookie('token')).toBe('jwt-token-123')
      expect(getCookie('username')).toBe('juanperez')
      expect(getCookie('name')).toBe('Juan')
      expect(getCookie('lastname')).toBe('Pérez')
      expect(getCookie('role')).toBe('admin')
      expect(getCookie('email')).toBe('juan@seno.org')

      // Also in localStorage for backwards compatibility
      expect(localStorage.getItem('token')).toBe('jwt-token-123')
      expect(localStorage.getItem('username')).toBe('juanperez')
      expect(localStorage.getItem('name')).toBe('Juan')
      expect(localStorage.getItem('lastname')).toBe('Pérez')
      expect(localStorage.getItem('role')).toBe('admin')
      expect(localStorage.getItem('email')).toBe('juan@seno.org')

      expect(hasSession()).toBe(true)
      expect(getSessionToken()).toBe('jwt-token-123')
      expect(getSessionItem('username')).toBe('juanperez')
    })
  })

  describe('migration from localStorage', () => {
    it('migrates existing legacy localStorage session into cookies when cookies are empty', () => {
      localStorage.setItem('token', 'legacy-jwt-456')
      localStorage.setItem('username', 'legacyuser')
      localStorage.setItem('name', 'Legacy')
      localStorage.setItem('lastname', 'User')
      localStorage.setItem('role', 'editor')
      localStorage.setItem('email', 'legacy@seno.org')

      expect(getCookie('token')).toBeNull()

      // Calling getSessionToken or isSessionExpired should migrate without clearing
      const token = getSessionToken()
      expect(token).toBe('legacy-jwt-456')
      expect(getCookie('token')).toBe('legacy-jwt-456')
      expect(getCookie('username')).toBe('legacyuser')
      expect(hasSession()).toBe(true)
    })
  })

  describe('clearSession', () => {
    it('clears all session cookies and localStorage items', () => {
      setSession({
        token: 'token-to-clear',
        username: 'user-to-clear'
      })

      expect(hasSession()).toBe(true)
      clearSession()

      expect(hasSession()).toBe(false)
      expect(getSessionToken()).toBeNull()
      expect(getCookie('token')).toBeNull()
      expect(localStorage.getItem('token')).toBeNull()
      expect(localStorage.getItem('username')).toBeNull()
    })
  })

  describe('session expiration', () => {
    it('reports session expired when no token exists', () => {
      expect(isSessionExpired()).toBe(true)
    })

    it('reports session active when recently set', () => {
      setSession({ token: 'active-token' })
      expect(isSessionExpired()).toBe(false)
    })

    it('expires session after 3 days of inactivity', () => {
      const now = 1700000000000
      vi.spyOn(Date, 'now').mockReturnValue(now)
      setSession({ token: 'expiring-token' })
      expect(isSessionExpired()).toBe(false)

      // Fast forward time past 3 days (SESSION_INACTIVITY_MS + 1)
      const futureTime = now + SESSION_INACTIVITY_MS + 1000
      vi.spyOn(Date, 'now').mockReturnValue(futureTime)

      expect(isSessionExpired()).toBe(true)
      // getSessionToken should clear and return null
      expect(getSessionToken()).toBeNull()
      expect(getCookie('token')).toBeNull()
    })
  })

  describe('setSessionItem', () => {
    it('updates a specific session field in both cookies and localStorage', () => {
      setSession({ token: 'token-abc', name: 'Original' })
      expect(getSessionItem('name')).toBe('Original')

      setSessionItem('name', 'Updated')
      expect(getSessionItem('name')).toBe('Updated')
      expect(getCookie('name')).toBe('Updated')
      expect(localStorage.getItem('name')).toBe('Updated')
    })
  })
})
