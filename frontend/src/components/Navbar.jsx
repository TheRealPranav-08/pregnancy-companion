import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const pregnantLinks = [
  { to: '/', icon: '\u{1F3E0}', label: 'Home' },
  { to: '/guidance', icon: '\u{1F4C5}', label: 'Weekly Guidance' },
  { to: '/mood', icon: '\u{1F49C}', label: 'Mood Check' },
  { to: '/kicks', icon: '\u{1F476}', label: 'Kick Tracker' },
  { to: '/journal', icon: '\u{1F4D3}', label: 'My Journal' },
  { to: '/chat', icon: '\u{1F4AC}', label: 'Aura Chat' },
]

const postnatalLinks = [
  { to: '/', icon: '\u{1F3E0}', label: 'Home' },
  { to: '/postnatal', icon: '\u{1F37C}', label: 'Postnatal Care' },
  { to: '/mood', icon: '\u{1F49C}', label: 'Mood Check' },
  { to: '/journal', icon: '\u{1F4D3}', label: 'My Journal' },
  { to: '/chat', icon: '\u{1F4AC}', label: 'Aura Chat' },
]

export default function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const stage = user?.stage || 'pregnant'
  const links = stage === 'postnatal' ? postnatalLinks : pregnantLinks

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <nav className="navbar">
      <div className="nav-brand">
        <div className="nav-brand-icon">{'\u{1F930}'}</div>
        <div className="nav-brand-text">
          <h2>Aura AI</h2>
          <p>{stage === 'postnatal' ? 'Postnatal Companion' : 'Pregnancy Companion'}</p>
        </div>
      </div>

      <div className="nav-links">
        {links.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">{icon}</span>
            {label}
          </NavLink>
        ))}
      </div>

      <div className="nav-footer">
        {user && (
          <div className="nav-user">
            <div className="nav-avatar">{user.name?.charAt(0)?.toUpperCase() || '?'}</div>
            <span className="nav-user-name">{user.name}</span>
            <button className="nav-logout" onClick={handleLogout}>Logout</button>
          </div>
        )}
        <button
          onClick={() => navigate('/stage-select')}
          style={{
            display: 'block',
            width: '100%',
            padding: '8px 14px',
            marginBottom: 10,
            borderRadius: 10,
            border: '1px solid var(--card-border)',
            background: 'rgba(255,255,255,0.03)',
            color: 'var(--text-muted)',
            fontFamily: 'inherit',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(244,63,94,0.3)'; e.currentTarget.style.color = 'var(--rose-400)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          {'\u{1F504}'} Switch Stage
        </button>
        <p>
          <strong>{'\u26A0\uFE0F'} Disclaimer</strong><br />
          Aura provides general health information only. Always consult your healthcare provider for medical advice.
        </p>
      </div>
    </nav>
  )
}
