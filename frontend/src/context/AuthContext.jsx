import { createContext, useContext, useState, useEffect } from 'react'
import { getMe, loginUser, signupUser } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('aura_token'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    getMe()
      .then(res => {
        setUser(res.data)
        localStorage.setItem('aura_user', JSON.stringify(res.data))
      })
      .catch(() => {
        setToken(null)
        setUser(null)
        localStorage.removeItem('aura_token')
        localStorage.removeItem('aura_user')
      })
      .finally(() => setLoading(false))
  }, [token])

  async function login(email, password) {
    const res = await loginUser({ email, password })
    const { token: t, user: u } = res.data
    localStorage.setItem('aura_token', t)
    localStorage.setItem('aura_user', JSON.stringify(u))
    setToken(t)
    setUser(u)
  }

  async function signup(name, email, password, pregnancyWeek) {
    const payload = { name, email, password }
    if (pregnancyWeek) payload.pregnancy_week = pregnancyWeek
    const res = await signupUser(payload)
    const { token: t, user: u } = res.data
    localStorage.setItem('aura_token', t)
    localStorage.setItem('aura_user', JSON.stringify(u))
    setToken(t)
    setUser(u)
  }

  function logout() {
    setToken(null)
    setUser(null)
    localStorage.removeItem('aura_token')
    localStorage.removeItem('aura_user')
  }

  return (
    <AuthContext.Provider value={{ user, setUser, token, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
