import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getMainApiUrl, getAuthApiUrl } from '@/config/api-config';

// ==================== JWT TOKEN UTILITIES ====================
function decodeJWT(token: string): { exp?: number; [key: string]: unknown } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = parts[1]
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

function isTokenExpiringSoon(token: string, bufferMinutes = 5): boolean {
  const payload = decodeJWT(token)
  if (!payload?.exp) return true
  const now = Math.floor(Date.now() / 1000)
  return (payload.exp - bufferMinutes * 60) <= now
}

// ==================== TOKEN REFRESH MONITOR ====================
let refreshInterval: ReturnType<typeof setInterval> | null = null
let isRefreshing = false

function stopTokenRefreshMonitor(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
}

function startTokenRefreshMonitor(): void {
  stopTokenRefreshMonitor()
  // Check immediately, then every 60 seconds
  checkAndRefreshToken()
  refreshInterval = setInterval(checkAndRefreshToken, 60000)
}

async function checkAndRefreshToken(): Promise<void> {
  if (isRefreshing) return
  const state = useAuthStore.getState()
  const { token, refreshToken, isAuthenticated } = state
  if (!token || !isAuthenticated) return

  if (isTokenExpiringSoon(token, 5)) {
    // First, check if SSO cookie has a fresher token (another app may have refreshed)
    const cookieToken = getSharedAuthCookie()
    if (cookieToken && cookieToken !== token && !isTokenExpiringSoon(cookieToken, 5)) {
      // Cookie has a valid, non-expiring token — use it
      useAuthStore.setState({
        token: cookieToken,
        lastAuthCheck: Date.now(),
      })
      return
    }

    // If we have a refresh token, use it
    if (refreshToken) {
      isRefreshing = true
      try {
        const mainApiUrl = getMainApiUrl()
        const response = await fetch(`${mainApiUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        if (response.ok) {
          const data = await response.json()
          const newToken = data.accessToken || data.access_token
          const newRefreshToken = data.refreshToken || data.refresh_token
          if (newToken) {
            useAuthStore.setState({
              token: newToken,
              refreshToken: newRefreshToken || refreshToken,
              lastAuthCheck: Date.now(),
            })
            setSharedAuthCookie(newToken)
          }
        } else if (response.status === 401) {
          // Refresh token is also expired — session is dead
          console.warn('[TokenRefresh] Refresh token expired, logging out')
          useAuthStore.getState().logout()
        }
      } catch (error) {
        console.error('[TokenRefresh] Error refreshing token:', error)
      } finally {
        isRefreshing = false
      }
    }
  }
}

// ==================== SHARED AUTH COOKIE (Cross-App SSO) ====================
const SHARED_COOKIE_NAME = 'orch_auth_token'

function getSharedCookieDomain(): string {
  const hostname = window.location.hostname
  if (hostname === 'localhost' || hostname === '127.0.0.1') return hostname
  return '.orchestratorai.io'
}

function setSharedAuthCookie(tokenValue: string): void {
  const domain = getSharedCookieDomain()
  const secure = window.location.protocol === 'https:'
  document.cookie = `${SHARED_COOKIE_NAME}=${encodeURIComponent(tokenValue)}; domain=${domain}; path=/; max-age=28800; SameSite=Lax${secure ? '; Secure' : ''}`
}

function getSharedAuthCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${SHARED_COOKIE_NAME}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function clearSharedAuthCookie(): void {
  const domain = getSharedCookieDomain()
  document.cookie = `${SHARED_COOKIE_NAME}=; domain=${domain}; path=/; max-age=0`
}

interface AuthState {
  isAuthenticated: boolean
  token: string | null
  refreshToken: string | null
  authType: 'authenticated' | 'none' | null
  userEmail: string | null
  isLoading: boolean
  error: string | null
  lastAuthCheck: number | null
  isCheckingAuth: boolean
  hasHydrated: boolean
  setHasHydrated: (state: boolean) => void
  login: (email: string, password: string) => Promise<boolean>
  signup: (email: string, password: string, displayName?: string) => Promise<boolean>
  setAuthToken: (token: string) => Promise<boolean>
  logout: () => void
  checkAuth: () => Promise<boolean>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      token: null,
      refreshToken: null,
      authType: null,
      userEmail: null,
      isLoading: false,
      error: null,
      lastAuthCheck: null,
      isCheckingAuth: false,
      hasHydrated: false,

      setHasHydrated: (state: boolean) => {
        set({ hasHydrated: state })
      },

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null })
        try {
          const authApiUrl = getAuthApiUrl()
          const authEndpoint = '/auth/login'

          const response = await fetch(`${authApiUrl}${authEndpoint}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
          })

          if (!response.ok) {
            let errorMessage = 'Authentication failed'
            if (response.status === 401) {
              errorMessage = 'Invalid email or password. Please try again.'
            } else if (response.status === 403) {
              errorMessage = 'Please confirm your email before logging in.'
            } else if (response.status === 503) {
              errorMessage = 'Authentication service is not available. Please check server configuration.'
            } else {
              const errorData = await response.json().catch(() => ({}))
              errorMessage = errorData.detail || errorData.message || `Authentication failed (${response.status})`
            }

            set({
              error: errorMessage,
              isLoading: false,
              isAuthenticated: false,
              token: null,
              refreshToken: null,
              userEmail: null
            })
            return false
          }

          const data = await response.json()
          // API returns accessToken or access_token for compatibility
          const token = data.accessToken || data.access_token
          const newRefreshToken = data.refreshToken || data.refresh_token || null

          if (!token) {
            set({
              error: 'No token returned from authentication',
              isLoading: false,
              isAuthenticated: false,
              token: null,
              refreshToken: null,
              userEmail: null
            })
            return false
          }

          set({
            isAuthenticated: true,
            token: token,
            refreshToken: newRefreshToken,
            authType: 'authenticated',
            userEmail: data.user?.email || email,
            isLoading: false,
            lastAuthCheck: Date.now(),
            error: null
          })
          setSharedAuthCookie(token)
          startTokenRefreshMonitor()
          return true
        } catch (error) {
          console.error('Login error:', error)
          let errorMessage = 'Authentication failed'

          if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
            errorMessage = 'Unable to connect to authentication server.'
          } else if (error instanceof Error) {
            errorMessage = error.message
          }

          set({
            error: errorMessage,
            isLoading: false,
            isAuthenticated: false,
            token: null,
            refreshToken: null,
            userEmail: null
          })
          return false
        }
      },

      signup: async (email: string, password: string, displayName?: string) => {
        set({ isLoading: true, error: null })
        try {
          const authApiUrl = getAuthApiUrl()
          const authEndpoint = '/auth/signup'

          const response = await fetch(`${authApiUrl}${authEndpoint}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password, displayName })
          })

          if (!response.ok) {
            let errorMessage = 'Signup failed'
            if (response.status === 400) {
              errorMessage = 'User might already exist or invalid input.'
            } else if (response.status === 202) {
              // Email confirmation required
              const errorData = await response.json().catch(() => ({}))
              errorMessage = errorData.message || 'User created successfully. Please check your email to confirm your account before logging in.'
              set({
                error: errorMessage,
                isLoading: false,
                isAuthenticated: false,
                token: null,
                refreshToken: null,
                userEmail: null
              })
              return false
            } else {
              const errorData = await response.json().catch(() => ({}))
              errorMessage = errorData.detail || errorData.message || `Signup failed (${response.status})`
            }

            set({
              error: errorMessage,
              isLoading: false,
              isAuthenticated: false,
              token: null,
              refreshToken: null,
              userEmail: null
            })
            return false
          }

          const data = await response.json()
          const token = data.accessToken || data.access_token
          const newRefreshToken = data.refreshToken || data.refresh_token || null

          if (!token) {
            set({
              error: 'No token returned from signup',
              isLoading: false,
              isAuthenticated: false,
              token: null,
              refreshToken: null,
              userEmail: null
            })
            return false
          }

          set({
            isAuthenticated: true,
            token: token,
            refreshToken: newRefreshToken,
            authType: 'authenticated',
            userEmail: data.user?.email || email,
            isLoading: false,
            lastAuthCheck: Date.now(),
            error: null
          })
          setSharedAuthCookie(token)
          startTokenRefreshMonitor()
          return true
        } catch (error) {
          console.error('Signup error:', error)
          let errorMessage = 'Signup failed'

          if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
            errorMessage = 'Unable to connect to authentication server.'
          } else if (error instanceof Error) {
            errorMessage = error.message
          }

          set({
            error: errorMessage,
            isLoading: false,
            isAuthenticated: false,
            token: null,
            refreshToken: null,
            userEmail: null
          })
          return false
        }
      },

      setAuthToken: async (token: string) => {
        set({ isLoading: true, error: null })
        try {
          const mainApiUrl = getMainApiUrl()

          // Validate token with API by fetching user context
          const response = await fetch(`${mainApiUrl}/users/me/context`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          })

          if (response.ok) {
            const data = await response.json()
            set({
              isAuthenticated: true,
              token: token,
              authType: 'authenticated',
              userEmail: data.user?.email || null,
              isLoading: false,
              lastAuthCheck: Date.now(),
              error: null
            })
            setSharedAuthCookie(token)
            startTokenRefreshMonitor()
            return true
          } else {
            set({
              error: 'Invalid auth token',
              isLoading: false,
              isAuthenticated: false,
              token: null
            })
            return false
          }
        } catch (error) {
          console.error('Token validation error:', error)
          set({
            error: 'Failed to validate auth token',
            isLoading: false,
            isAuthenticated: false,
            token: null
          })
          return false
        }
      },

      logout: async () => {
        // Stop token refresh monitoring
        stopTokenRefreshMonitor()
        // Clear local auth state (backend doesn't maintain sessions, so no need to call logout endpoint)
        clearSharedAuthCookie()
        set({
          isAuthenticated: false,
          token: null,
          refreshToken: null,
          authType: null,
          userEmail: null,
          error: null
        })
      },

      checkAuth: async () => {
        const state = get()
        let currentToken = state.token

        // If we have a token and it's recent (within 5 minutes), consider it valid
        if (currentToken && state.lastAuthCheck) {
          const now = Date.now()
          const fiveMinutes = 5 * 60 * 1000
          if (now - state.lastAuthCheck < fiveMinutes) {
            return state.isAuthenticated
          }
        }

        // If no token, check shared cookie for cross-app SSO
        if (!currentToken) {
          const cookieToken = getSharedAuthCookie()
          if (cookieToken) {
            currentToken = cookieToken
            set({ token: cookieToken })
          } else {
            if (state.isAuthenticated) {
              set({ isAuthenticated: false })
            }
            return false
          }
        }

        // Don't check if already checking
        if (state.isCheckingAuth) {
          return state.isAuthenticated
        }

        // Validate token with API
        set({ isCheckingAuth: true })
        try {
          const mainApiUrl = getMainApiUrl()
          const response = await fetch(`${mainApiUrl}/users/me/context`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${currentToken}`,
              'Content-Type': 'application/json'
            }
          })

          if (response.ok) {
            const data = await response.json()
            set({
              isAuthenticated: true,
              userEmail: data.user?.email || state.userEmail,
              lastAuthCheck: Date.now(),
              isCheckingAuth: false,
              error: null
            })
            // Start token refresh monitor after successful auth check
            startTokenRefreshMonitor()
            return true
          } else {
            set({
              isAuthenticated: false,
              token: null,
              refreshToken: null,
              isCheckingAuth: false,
              error: 'Session expired'
            })
            return false
          }
        } catch (error) {
          console.error('Auth check error:', error)
          // Don't fail auth check on network errors - might be temporary
          set({ isCheckingAuth: false })
          return state.isAuthenticated
        }
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        authType: state.authType,
        userEmail: state.userEmail,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
        // Ensure shared cookie is set for cross-app SSO (covers existing sessions)
        if (state?.token && state.isAuthenticated) {
          setSharedAuthCookie(state.token)
          // Defer monitor start — useAuthStore isn't fully initialized yet during rehydration
          setTimeout(() => startTokenRefreshMonitor(), 0)
        }
      }
    }
  )
)
