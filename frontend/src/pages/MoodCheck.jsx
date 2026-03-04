import { useState, useEffect, useRef } from 'react'
import { assessMood } from '../api'
import './MoodCheck.css'

const QUESTIONS = [
  'Little interest or pleasure in doing things?',
  'Feeling down, depressed, or hopeless?',
  'Trouble sleeping or sleeping too much?',
  'Feeling tired or having little energy?',
  'Feeling bad about yourself or like you\'re failing?',
  'Trouble concentrating on things?',
  'Feeling anxious or worried about your pregnancy?',
]

const OPTIONS = [
  { value: 0, label: 'Not at all' },
  { value: 1, label: 'Several days' },
  { value: 2, label: 'More than half the days' },
  { value: 3, label: 'Nearly every day' },
]

const RISK_LEVELS = [
  { max: 4, key: 'Low', color: '#4ade80', bg: 'rgba(74,222,128,0.10)', border: 'rgba(74,222,128,0.3)', emoji: '💚', label: 'Low Risk', badgeClass: 'badge-low' },
  { max: 9, key: 'Mild', color: '#fbbf24', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.3)', emoji: '💛', label: 'Mild Risk', badgeClass: 'badge-mild' },
  { max: 14, key: 'Moderate', color: '#fb923c', bg: 'rgba(251,146,60,0.10)', border: 'rgba(251,146,60,0.3)', emoji: '🧡', label: 'Moderate Risk', badgeClass: 'badge-moderate' },
  { max: 21, key: 'High', color: '#fb7185', bg: 'rgba(244,63,94,0.10)', border: 'rgba(244,63,94,0.35)', emoji: '💜', label: 'High Risk', badgeClass: 'badge-high' },
]

function getRiskLevel(score) {
  return RISK_LEVELS.find(r => score <= r.max) || RISK_LEVELS[3]
}

const EXPLANATIONS = {
  Low: (week) =>
    `Your responses suggest you're doing well emotionally. It's wonderful that you're checking in with yourself${week ? ` at week ${week}` : ''} — keep it up! 💛 Self-awareness is a beautiful part of your journey, and your baby benefits from your positive mindset.`,
  Mild: (week) =>
    `It's completely normal to have some ups and downs${week ? ` around week ${week} of your pregnancy` : ' during pregnancy'}. Your feelings are valid, and taking this check shows real strength. Small acts of self-care can make a big difference. 🌸`,
  Moderate: (week) =>
    `We hear you — ${week ? `week ${week} can bring extra challenges, and ` : ''}it's okay to feel overwhelmed sometimes. Your honesty here is incredibly brave. Please consider reaching out to someone you trust or your healthcare provider. You don't have to navigate this alone. 🤗`,
  High: (week) =>
    `Your feelings are valid and sharing them takes real courage.${week ? ` Week ${week} can be especially demanding.` : ''} Please know that support is available and you deserve it. We strongly encourage you to speak with your healthcare provider or a mental health professional soon. You're not alone in this. 💜`,
}

const SUGGESTIONS = {
  Low: [
    { icon: '📓', text: 'Keep journaling — it helps maintain emotional clarity' },
    { icon: '🚶‍♀️', text: 'Stay active with gentle daily walks or prenatal yoga' },
    { icon: '🎵', text: 'Continue activities that bring you joy and relaxation' },
  ],
  Mild: [
    { icon: '🧘‍♀️', text: 'Try a 5-minute breathing exercise when stress hits' },
    { icon: '💬', text: 'Share how you feel with your partner or a close friend' },
    { icon: '🌿', text: 'Spend time outdoors — nature can ease anxious feelings' },
  ],
  Moderate: [
    { icon: '📞', text: 'Schedule a check-in call with your OB or midwife' },
    { icon: '💬', text: 'Talk to someone you trust about how you\'ve been feeling' },
    { icon: '🛁', text: 'Prioritize rest and self-care activities this week' },
  ],
  High: [
    { icon: '🏥', text: 'Please speak to your healthcare provider as soon as possible' },
    { icon: '📞', text: 'Contact a perinatal mental health helpline today' },
    { icon: '💛', text: 'Remember: asking for help is an act of strength, not weakness' },
  ],
}

const STORAGE_KEY = 'aura_mood_history'

function loadHistory() {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

function saveAssessment(entry) {
  const history = loadHistory()
  history.push(entry)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
}

/* ─── Circular Progress Ring ─────────────── */
function ScoreRing({ score, max = 21, color, size = 140, stroke = 10 }) {
  const radius = (size - stroke) / 2
  const circ = 2 * Math.PI * radius
  const pct = score / max
  const offset = circ * (1 - pct)

  return (
    <svg width={size} height={size} className="score-ring">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 1s ease' }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize="28" fontWeight="800" fontFamily="inherit">
        {score}
      </text>
      <text x="50%" y="65%" textAnchor="middle" dominantBaseline="central"
        fill="var(--text-muted)" fontSize="11" fontFamily="inherit">
        / {max}
      </text>
    </svg>
  )
}

/* ─── Sparkle / Heart Animation ──────────── */
function CelebrationOverlay() {
  const particles = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.6,
    duration: 1.2 + Math.random() * 0.8,
    char: ['✨', '💛', '💚', '🌟', '♥'][i % 5],
    size: 14 + Math.random() * 14,
  }))

  return (
    <div className="celebration-overlay" aria-hidden="true">
      {particles.map(p => (
        <span key={p.id} className="celebration-particle" style={{
          left: `${p.left}%`,
          animationDelay: `${p.delay}s`,
          animationDuration: `${p.duration}s`,
          fontSize: p.size,
        }}>{p.char}</span>
      ))}
    </div>
  )
}

/* ─── Score color by value ────────────────── */
const SCORE_COLORS = ['#4ade80', '#facc15', '#fb923c', '#f87171']

/* ─── Mood History Timeline ──────────────── */
function MoodHistory() {
  const history = loadHistory()
  const last5 = history.slice(-5)

  const dotColor = (level) => {
    const map = { Low: '#4ade80', Mild: '#fbbf24', Moderate: '#fb923c', High: '#fb7185' }
    return map[level] || '#a78ba0'
  }

  return (
    <div className="card mood-history-section">
      <h3 className="mood-history-title">📊 Your Mood History</h3>
      {last5.length === 0 ? (
        <p className="mood-history-empty">This is your first check-in! 🌱</p>
      ) : (
        <>
          <div className="mood-timeline">
            {last5.map((entry, i) => (
              <div key={i} className="mood-timeline-item">
                <div className="mood-dot" style={{
                  background: dotColor(entry.riskLevel),
                  boxShadow: `0 0 8px ${dotColor(entry.riskLevel)}60`,
                }} />
                <span className="mood-dot-label">{entry.score}/{21}</span>
                <span className="mood-dot-date">
                  {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
          {last5.length < 3 && (
            <p className="mood-history-helper">Check in regularly to track your mood over time 📈</p>
          )}
        </>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════ */
export default function MoodCheck() {
  const [answers, setAnswers] = useState(Array(7).fill(null))
  const [sleepHours, setSleepHours] = useState(7)
  const [energy, setEnergy] = useState(5)
  const [sleepTouched, setSleepTouched] = useState(false)
  const [energyTouched, setEnergyTouched] = useState(false)
  const [pregnancyWeek, setPregnancyWeek] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [showResults, setShowResults] = useState(false)
  const [copied, setCopied] = useState(false)
  const submitRef = useRef(null)

  const answeredCount = answers.filter(a => a !== null).length
  const progress = (answeredCount / QUESTIONS.length) * 100
  const allQuestionsAnswered = answeredCount === QUESTIONS.length
  const allFieldsComplete = allQuestionsAnswered && sleepTouched && energyTouched
  const canSubmit = allFieldsComplete && !loading

  // Trigger fade-in after result is set
  useEffect(() => {
    if (result) {
      requestAnimationFrame(() => setShowResults(true))
    }
  }, [result])

  async function handleSubmit() {
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    try {
      const payload = {
        session_id: 'demo_user',
        q1: answers[0], q2: answers[1], q3: answers[2], q4: answers[3],
        q5: answers[4], q6: answers[5], q7: answers[6],
        sleep_hours: sleepHours,
        energy,
      }
      const res = await assessMood(payload)
      buildResult(res.data.risk_level, res.data.explanation, res.data.recommendations)
    } catch {
      const phqScore = answers.reduce((a, b) => a + b, 0)
      const risk = getRiskLevel(phqScore)
      setError('Showing preview — start backend for live ML analysis.')
      buildResult(risk.key, null, null, phqScore)
    }
    setLoading(false)
  }

  function buildResult(riskKey, explanation, recommendations, precomputedScore) {
    const phqScore = precomputedScore ?? answers.reduce((a, b) => a + b, 0)
    const risk = getRiskLevel(phqScore)
    const weekNum = pregnancyWeek ? parseInt(pregnancyWeek, 10) : null

    const resultData = {
      risk_level: riskKey || risk.key,
      phq_score: phqScore,
      explanation: explanation || EXPLANATIONS[risk.key](weekNum),
      recommendations: recommendations || SUGGESTIONS[risk.key],
      breakdown: answers.map((a, i) => ({ question: QUESTIONS[i], score: a })),
      pregnancyWeek: weekNum,
    }
    setResult(resultData)

    // Save to localStorage
    saveAssessment({
      date: new Date().toISOString(),
      score: phqScore,
      riskLevel: risk.key,
      sleepHours,
      energy,
    })
  }

  function resetQuiz() {
    setAnswers(Array(7).fill(null))
    setSleepHours(7)
    setEnergy(5)
    setSleepTouched(false)
    setEnergyTouched(false)
    setPregnancyWeek('')
    setResult(null)
    setError(null)
    setShowResults(false)
    setCopied(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCopySummary() {
    if (!result) return
    const risk = getRiskLevel(result.phq_score)
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    const qScores = result.breakdown.map((b, i) => `Q${i + 1}: ${b.score}/3`).join(' | ')
    const text = `Mood Check Summary - ${dateStr}\nWellness Score: ${result.phq_score}/21 (${risk.label})\nSleep: ${sleepHours}h | Energy: ${energy}/10\n${qScores}`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const riskCfg = result ? getRiskLevel(result.phq_score) : null

  /* ─── Render: Questionnaire ────────────── */
  if (!result) {
    return (
      <div className="mood-page">
        <div className="page-header">
          <h1>💜 Mood Check</h1>
          <p>A gentle wellness assessment — takes just 2 minutes</p>
        </div>

        <div className="card mood-card">
          {/* Progress Bar */}
          <div className="quiz-progress-bar">
            <div className="quiz-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="progress-counter">
            {answeredCount}/{QUESTIONS.length} answered
          </p>

          {/* Pregnancy Week Input */}
          <div className="pregnancy-week-group">
            <label htmlFor="pregnancy-week">YOUR CURRENT PREGNANCY WEEK (OPTIONAL)</label>
            <input
              id="pregnancy-week"
              type="number"
              min="1"
              max="42"
              placeholder="e.g. 24"
              value={pregnancyWeek}
              onChange={e => {
                const v = e.target.value
                if (v === '' || (Number(v) >= 1 && Number(v) <= 42)) setPregnancyWeek(v)
              }}
              className="pregnancy-week-input"
            />
          </div>

          {/* Questions */}
          {QUESTIONS.map((q, idx) => (
            <div key={idx} className="question-block">
              <p className="question-text">
                <span className="question-number">{idx + 1}.</span>{q}
              </p>
              <div className="options-grid">
                {OPTIONS.map(opt => {
                  const selected = answers[idx] === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className={`option-btn${selected ? ' option-selected' : ''}`}
                      onClick={() => {
                        const updated = [...answers]
                        updated[idx] = opt.value
                        setAnswers(updated)
                      }}
                    >
                      {selected && <span className="option-check">✓</span>}
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Sliders */}
          <div className="sliders-section">
            {/* Sleep Hours */}
            <div className="form-group slider-group">
              <div className="slider-header">
                <label>SLEEP HOURS (LAST NIGHT)</label>
                <span className="slider-value">{sleepHours}h</span>
              </div>
              <div className="slider-row">
                <span className="slider-label-end">0h</span>
                <input type="range" min="0" max="12" step="0.5" value={sleepHours}
                  onChange={e => { setSleepHours(Number(e.target.value)); setSleepTouched(true) }} />
                <span className="slider-label-end">12h</span>
              </div>
            </div>

            {/* Energy Level */}
            <div className="form-group slider-group">
              <div className="slider-header">
                <label>ENERGY LEVEL</label>
                <span className="slider-value">{energy}/10</span>
              </div>
              <div className="slider-row">
                <span className="slider-label-end" style={{ fontSize: 18 }}>😴</span>
                <input type="range" min="1" max="10" step="1" value={energy}
                  onChange={e => { setEnergy(Number(e.target.value)); setEnergyTouched(true) }} />
                <span className="slider-label-end" style={{ fontSize: 18 }}>💪</span>
              </div>
            </div>

            {/* Submit Button */}
            <div className="submit-wrapper" title={!canSubmit ? 'Please answer all questions first.' : undefined}>
              <button
                ref={submitRef}
                className={`btn btn-primary submit-btn${canSubmit ? ' submit-ready' : ''}`}
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                {loading ? '⏳ Analyzing...' : '💜 See My Results'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ─── Render: Results ──────────────────── */
  return (
    <div className={`mood-page results-view${showResults ? ' results-visible' : ''}`}>
      <div className="page-header">
        <h1>💜 Your Results</h1>
        <p>Here's what your responses tell us</p>
      </div>

      {error && (
        <div className="preview-banner">⚡ {error}</div>
      )}

      {/* Emergency Banner */}
      {riskCfg.key === 'High' && (
        <div className="emergency-banner">
          <span className="emergency-icon">�</span>
          <p>If you're in crisis, please contact a helpline or speak to your doctor immediately.</p>
        </div>
      )}

      {/* Celebration for Low risk */}
      {riskCfg.key === 'Low' && <CelebrationOverlay />}

      {/* Main Result Card */}
      <div className="card result-main-card" style={{
        background: riskCfg.bg,
        borderColor: riskCfg.border,
      }}>
        <div className="result-top">
          <ScoreRing score={result.phq_score} color={riskCfg.color} />
          <span className={`badge ${riskCfg.badgeClass}`}>{riskCfg.emoji} {riskCfg.label}</span>
          <p className="result-top-sublabel">Wellness Score</p>
        </div>

        {/* Sleep & Energy Info Bar */}
        <div className="info-bar">
          <span>🛏️ Sleep: {sleepHours}h</span>
          <span className="info-bar-divider">|</span>
          <span>⚡ Energy: {energy}/10</span>
        </div>

        {/* Explanation */}
        <div className="result-explanation">
          <h3>What this means for you</h3>
          <p>{result.explanation}</p>
        </div>

        {/* Score Breakdown */}
        <div className="breakdown-section">
          <h4>Score Breakdown</h4>
          <ul className="breakdown-list">
            {result.breakdown.map((item, i) => (
              <li key={i} className="breakdown-item">
                <span className="breakdown-q">Q{i + 1}: {item.question}</span>
                <span className="breakdown-score" style={{ color: SCORE_COLORS[item.score] }}>{item.score}/3</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Suggestions */}
        <div className="suggestions-section">
          <h4>💡 Suggestions</h4>
          <div className="suggestions-list">
            {result.recommendations.map((r, i) => (
              <div key={i} className="suggestion-item">
                <span className="suggestion-emoji">{r.icon}</span>
                <span>{r.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Copy Summary */}
        <div className="copy-summary-wrapper">
          <button className="btn btn-outline copy-btn" onClick={handleCopySummary}>
            📋 {copied ? 'Copied! ✓' : 'Copy Summary'}
          </button>
        </div>
      </div>

      {/* Mood History */}
      <MoodHistory />

      {/* Actions */}
      <button className="btn btn-secondary retake-btn" onClick={resetQuiz}>
        🔄 Take Assessment Again
      </button>

      {/* Disclaimer */}
      <p className="disclaimer">
        ⚠️ This assessment is not a medical diagnosis. Please consult a healthcare professional for clinical advice.
      </p>
    </div>
  )
}
