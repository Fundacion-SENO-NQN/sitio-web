export interface SessionData {
  token: string
  username?: string
  name?: string
  last_name?: string
  lastname?: string
  role_name?: string
  role?: string
  email?: string
}

export declare const SESSION_MAX_AGE_SECONDS: number
export declare const SESSION_INACTIVITY_MS: number
export declare const SESSION_KEYS: string[]
export declare const ACTIVITY_KEY: string
export declare const THROTTLE_MS: number

export declare function getCookie(name: string): string | null
export declare function setCookie(
  name: string,
  value: string,
  options?: {
    maxAge?: number
    path?: string
    sameSite?: 'Lax' | 'Strict' | 'None' | string
    secure?: boolean
  }
): void
export declare function deleteCookie(
  name: string,
  options?: { path?: string }
): void

export declare function isSessionExpired(): boolean
export declare function touchSession(force?: boolean): void
export declare function getSessionToken(): string | null
export declare function hasSession(): boolean
export declare function getSessionItem(key: string): string | null
export declare function setSessionItem(key: string, value: string): void
export declare function setSession(data: SessionData): void
export declare function clearSession(): void
export declare function initSessionActivityListener(): void
