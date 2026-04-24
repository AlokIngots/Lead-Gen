import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api, { AuthAPI } from '../api'

const AuthContext = createContext(null)
const TOKEN_KEY   = 'alok_lms_token'
const REFRESH_KEY = 'alok_lms_refresh'
const USER_KEY    = 'alok_lms_user'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user,  setUser]  = useState(() => {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  })
  const [loading, setLoading] = useState(!!token && !user)

  useEffect(() => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    } else {
      delete api.defaults.headers.common['Authorization']
    }
  }, [token])

  useEffect(() => {
    if (token && !user) {
      AuthAPI.me()
        .then(u => {
          setUser(u)
          localStorage.setItem(USER_KEY, JSON.stringify(u))
        })
        .catch(() => logout())
        .finally(() => setLoading(false))
    }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback((accessToken, userObj, refreshToken) => {
    localStorage.setItem(TOKEN_KEY, accessToken)
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken)
    localStorage.setItem(USER_KEY, JSON.stringify(userObj))
    setToken(accessToken)
    setUser(userObj)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
