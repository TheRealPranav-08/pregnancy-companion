import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const TRIMESTERS = [
  { range: [1, 13], label: 'First Trimester', color: '#4ade80', emoji: '🌱' },
  { range: [14, 26], label: 'Second Trimester', color: '#60a5fa', emoji: '🌸' },
  { range: [27, 42], label: 'Third Trimester', color: '#c084fc', emoji: '🌟' },
]

function calcBabyWeeks(birthDate) {
  if (!birthDate) return null
  const birth = new Date(birthDate)
  const today = new Date()
  return Math.max(0, Math.floor((today - birth) / (7 * 24 * 60 * 60 * 1000)))
}

export default function Home() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const stage = user?.stage || 'pregnant'

  if (stage === 'postnatal') return <PostnatalHome user={user} navigate={navigate} />
  return <PregnantHome user={user} navigate={navigate} />
}

/* ─── Postnatal Home ──────────────────────── */
function PostnatalHome({ user, navigate }) {
  const babyWeeks = user?.baby_weeks ?? calcBabyWeeks(user?.baby_birth_date) ?? 0

  const cards = [
    { emoji: '🍼', title: 'Postnatal Care', desc: 'Personalized guidance for you and your baby', path: '/postnatal' },
    { emoji: '💜', title: 'Mood Check', desc: "Take today's mental health assessment", path: '/mood' },
    { emoji: '📓', title: 'Journal', desc: "Log how you're feeling today", path: '/journal' },
    { emoji: '💬', title: 'Chat with Aura', desc: 'Ask anything about baby care', path: '/chat' },
  ]

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ textAlign: 'center', padding: '20px 0 40px' }}>
        <div style={{ fontSize: 64, marginBottom: 16, filter: 'drop-shadow(0 0 20px rgba(244,63,94,0.4))' }}>{'\u{1F476}'}</div>
        <h1 style={{
          fontSize: 32, fontWeight: 800, letterSpacing: '-1px',
          background: 'linear-gradient(135deg, #fff 0%, #fecdd3 50%, #d8b4fe 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          marginBottom: 12,
        }}>
          Welcome back, {user?.name || 'Mom'}! {'\u{1F476}'}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 16, lineHeight: 1.6 }}>
          Your baby is <strong style={{ color: 'var(--rose-400)' }}>{babyWeeks} weeks</strong> old — you're doing amazing!
        </p>
      </div>

      <div className="grid-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        {cards.map(card => (
          <button
            key={card.path}
            onClick={() => navigate(card.path)}
            style={{
              padding: '24px 18px', borderRadius: 16,
              border: '1px solid var(--card-border)', background: 'var(--card-bg)',
              color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left',
              fontFamily: 'inherit', transition: 'all 0.2s', backdropFilter: 'blur(16px)',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(244,63,94,0.3)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-border)'; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            <div style={{ fontSize: 32, marginBottom: 10 }}>{card.emoji}</div>
            <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 15 }}>{card.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{card.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ─── Pregnant Home (original) ────────────── */
function PregnantHome({ user, navigate }) {
  const [week, setWeek] = useState(user?.pregnancy_week || 20)
  const [dietPref, setDietPref] = useState('vegetarian')
  const [condition, setCondition] = useState('normal')

  const trimester = TRIMESTERS.find(t => week >= t.range[0] && week <= t.range[1])

  const handleSubmit = (e) => {
    e.preventDefault()
    navigate('/guidance', { state: { week, dietPref, condition } })
  }

  return (
    <div style={{ maxWidth: 700 }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', padding: '20px 0 40px' }}>
        <div style={{
          fontSize: 64,
          marginBottom: 16,
          filter: 'drop-shadow(0 0 20px rgba(244,63,94,0.4))'
        }}>🤱</div>
        <h1 style={{
          fontSize: 36,
          fontWeight: 800,
          letterSpacing: '-1px',
          background: 'linear-gradient(135deg, #fff 0%, #fecdd3 50%, #d8b4fe 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: 12,
        }}>
          Your AI Pregnancy Companion
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 16, lineHeight: 1.6, maxWidth: 480, margin: '0 auto' }}>
          Personalized, week-by-week guidance powered by Goose AI — because every pregnancy is unique.
        </p>
      </div>

      {/* Form Card */}
      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24, color: 'var(--text-secondary)' }}>
            Tell us about your pregnancy
          </h2>

          {/* Week Slider */}
          <div className="form-group" style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label>PREGNANCY WEEK</label>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: `rgba(${trimester?.color === '#4ade80' ? '74,222,128' : trimester?.color === '#60a5fa' ? '96,165,250' : '192,132,252'},0.15)`,
                padding: '4px 14px',
                borderRadius: 100,
                fontSize: 13,
                fontWeight: 600,
                color: trimester?.color,
              }}>
                <span>{trimester?.emoji}</span>
                Week {week} · {trimester?.label}
              </div>
            </div>
            <input
              type="range" min="1" max="42" value={week}
              onChange={e => setWeek(Number(e.target.value))}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              <span>Week 1</span><span>Week 42</span>
            </div>
          </div>

          {/* Diet Preference */}
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label>DIET PREFERENCE</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { value: 'vegetarian', emoji: '🥦', label: 'Vegetarian' },
                { value: 'non-vegetarian', emoji: '🍗', label: 'Non-Vegetarian' },
                { value: 'vegan', emoji: '🌿', label: 'Vegan' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDietPref(opt.value)}
                  style={{
                    padding: '14px 10px',
                    borderRadius: 14,
                    border: `1px solid ${dietPref === opt.value ? 'rgba(244,63,94,0.5)' : 'var(--card-border)'}`,
                    background: dietPref === opt.value ? 'rgba(244,63,94,0.1)' : 'rgba(255,255,255,0.03)',
                    color: dietPref === opt.value ? 'var(--rose-400)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 13,
                    fontWeight: 600,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    transition: 'all 0.2s',
                  }}
                >
                  <span style={{ fontSize: 22 }}>{opt.emoji}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Health Condition */}
          <div className="form-group" style={{ marginBottom: 28 }}>
            <label>HEALTH CONDITION</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { value: 'normal', emoji: '✅', label: 'Normal' },
                { value: 'diabetic', emoji: '🩸', label: 'Diabetic' },
                { value: 'anemic', emoji: '💊', label: 'Anemic' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCondition(opt.value)}
                  style={{
                    padding: '14px 10px',
                    borderRadius: 14,
                    border: `1px solid ${condition === opt.value ? 'rgba(244,63,94,0.5)' : 'var(--card-border)'}`,
                    background: condition === opt.value ? 'rgba(244,63,94,0.1)' : 'rgba(255,255,255,0.03)',
                    color: condition === opt.value ? 'var(--rose-400)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 13,
                    fontWeight: 600,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    transition: 'all 0.2s',
                  }}
                >
                  <span style={{ fontSize: 22 }}>{opt.emoji}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '16px', fontSize: 15 }}>
            ✨ Get My Personalized Guidance
          </button>
        </div>
      </form>

      {/* Quick Access Cards */}
      <div className="grid-3">
        {[
          { emoji: '💜', title: 'Mood Check', desc: 'Take today\'s mental health assessment', path: '/mood' },
          { emoji: '👶', title: 'Count Kicks', desc: 'Track fetal movement patterns', path: '/kicks' },
          { emoji: '📓', title: 'Journal', desc: 'Log how you\'re feeling today', path: '/journal' },
          { emoji: '💬', title: 'Chat with Aura', desc: 'Ask anything about pregnancy', path: '/chat' },
        ].map(card => (
          <button
            key={card.path}
            onClick={() => navigate(card.path)}
            style={{
              padding: '20px 16px',
              borderRadius: 16,
              border: '1px solid var(--card-border)',
              background: 'var(--card-bg)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
              transition: 'all 0.2s',
              backdropFilter: 'blur(16px)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'rgba(244,63,94,0.3)'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--card-border)'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 10 }}>{card.emoji}</div>
            <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 14 }}>{card.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{card.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
