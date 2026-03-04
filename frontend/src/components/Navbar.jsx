import { NavLink, useLocation } from 'react-router-dom'

const links = [
  { to: '/', icon: '🏠', label: 'Home' },
  { to: '/guidance', icon: '📅', label: 'Weekly Guidance' },
  { to: '/mood', icon: '💜', label: 'Mood Check' },
  { to: '/kicks', icon: '👶', label: 'Kick Tracker' },
  { to: '/journal', icon: '📓', label: 'My Journal' },
]

export default function Navbar() {
  const location = useLocation()

  return (
    <nav className="navbar">
      <div className="nav-brand">
        <div className="nav-brand-icon">🤱</div>
        <div className="nav-brand-text">
          <h2>Aura AI</h2>
          <p>Pregnancy Companion</p>
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
        <p>
          <strong>⚠️ Disclaimer</strong><br />
          Aura provides general health information only. Always consult your healthcare provider for medical advice.
        </p>
      </div>
    </nav>
  )
}
