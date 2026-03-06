import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Login.css'

export default function Signup() {
  const { signup, user } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [week, setWeek] = useState('')
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

    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setLoading(true)
    try {
      await signup(name, email, password, week ? parseInt(week) : null)
    } catch (err) {
      setError(err.response?.data?.detail || 'Signup failed. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-icon">{'\u{1F930}'}</div>
        <h1 className="auth-title">Create Your Account</h1>
        <p className="auth-subtitle">Join Aura AI — your pregnancy companion</p>

        {error && <div className="auth-error">{error}</div>}

        <div className="auth-field">
          <label>Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required autoFocus />
        </div>

        <div className="auth-field">
          <label>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
        </div>

        <div className="auth-field">
          <label>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" required />
        </div>

        <div className="auth-field">
          <label>Confirm Password</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter password" required />
        </div>

        <div className="auth-field">
          <label>Pregnancy Week <span style={{ opacity: 0.5 }}>(optional)</span></label>
          <input type="number" value={week} onChange={e => setWeek(e.target.value)} placeholder="1 - 42" min="1" max="42" />
          <p className="auth-hint">This helps Aura personalize your guidance</p>
        </div>

        <button type="submit" className="auth-btn" disabled={loading}>
          {loading ? '\u23F3 Creating account...' : 'Create Account'}
        </button>

        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  )
}
