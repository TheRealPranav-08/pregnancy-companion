import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { updateUserStage } from '../api'
import './StageSelect.css'

export default function StageSelect() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const [stage, setStage] = useState(null)
  const [pregnancyWeek, setPregnancyWeek] = useState(user?.pregnancy_week || 20)
  const [babyBirthDate, setBabyBirthDate] = useState('')
  const [deliveryType, setDeliveryType] = useState('normal')
  const [loading, setLoading] = useState(false)

  async function handleContinue() {
    if (!stage) return
    setLoading(true)
    try {
      const payload = { stage }
      if (stage === 'pregnant') {
        payload.pregnancy_week = pregnancyWeek
      } else {
        payload.baby_birth_date = babyBirthDate || null
        payload.delivery_type = deliveryType
      }
      const res = await updateUserStage(payload)
      setUser(res.data)
      navigate('/', { replace: true })
    } catch (err) {
      console.error('Failed to update stage:', err)
    }
    setLoading(false)
  }

  return (
    <div className="stage-page">
      <div className="stage-container">
        <div className="stage-icon">{'\u{1F930}'}</div>
        <h1 className="stage-title">Where are you in your journey?</h1>
        <p className="stage-subtitle">This helps us personalize everything for you</p>

        <div className="stage-cards">
          {/* Pregnant Card */}
          <button
            type="button"
            className={`stage-card${stage === 'pregnant' ? ' selected' : ''}`}
            onClick={() => setStage('pregnant')}
          >
            <span className="stage-card-emoji">{'\u{1F930}'}</span>
            <div className="stage-card-title">I'm Pregnant</div>
            <div className="stage-card-desc">
              Get week-by-week guidance, mood tracking, and kick counting
            </div>
          </button>

          {/* Postnatal Card */}
          <button
            type="button"
            className={`stage-card${stage === 'postnatal' ? ' selected' : ''}`}
            onClick={() => setStage('postnatal')}
          >
            <span className="stage-card-emoji">{'\u{1F476}'}</span>
            <div className="stage-card-title">Baby is Born</div>
            <div className="stage-card-desc">
              Get postnatal care, baby milestones, recovery tracking, and breastfeeding help
            </div>
          </button>
        </div>

        {/* Pregnant — Week Slider */}
        {stage === 'pregnant' && (
          <div className="stage-extra">
            <label>Pregnancy Week</label>
            <input
              type="range"
              min="1"
              max="42"
              value={pregnancyWeek}
              onChange={e => setPregnancyWeek(Number(e.target.value))}
            />
            <div className="stage-week-display">Week {pregnancyWeek} of 42</div>
          </div>
        )}

        {/* Postnatal — Birth Date + Delivery Type */}
        {stage === 'postnatal' && (
          <div className="stage-extra">
            <label>Baby's Birth Date</label>
            <input
              type="date"
              value={babyBirthDate}
              onChange={e => setBabyBirthDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
            />
            <div className="stage-delivery-section">
              <label>Delivery Type</label>
              <div className="stage-delivery-pills">
                <button
                  type="button"
                  className={`stage-delivery-pill${deliveryType === 'normal' ? ' active' : ''}`}
                  onClick={() => setDeliveryType('normal')}
                >
                  Normal Delivery
                </button>
                <button
                  type="button"
                  className={`stage-delivery-pill${deliveryType === 'c-section' ? ' active' : ''}`}
                  onClick={() => setDeliveryType('c-section')}
                >
                  C-Section
                </button>
              </div>
            </div>
          </div>
        )}

        <button
          className="stage-continue"
          onClick={handleContinue}
          disabled={!stage || loading}
          style={{ marginTop: 24 }}
        >
          {loading ? '\u23F3 Saving...' : 'Continue \u2192'}
        </button>
      </div>
    </div>
  )
}
