import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Login.css'

export default function Login() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) {
      if (!user.stage) navigate('/stage-select', { replace: true })
      else navigate('/', { replace: true })
    }
  }, [user, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-icon">{'\u{1F930}'}</div>
        <h1 className="auth-title">Welcome Back</h1>
        <p className="auth-subtitle">Sign in to your Aura AI companion</p>

        {error && <div className="auth-error">{error}</div>}

        <div className="auth-field">
          <label>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoFocus />
        </div>

        <div className="auth-field">
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required />
        </div>

        <button type="submit" className="auth-btn" disabled={loading}>
          {loading ? '\u23F3 Signing in...' : 'Sign In'}
        </button>

        <p className="auth-switch">
          Don't have an account? <Link to="/signup">Create one</Link>
        </p>
      </form>
    </div>
  )
}
