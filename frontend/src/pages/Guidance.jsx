import { useState, useEffect, useRef } from 'react'
import { getGuidance } from '../api'
import './Guidance.css'

/* ─── Constants ──────────────────────────── */
const TRIMESTER = (w) => w <= 13 ? 'First Trimester' : w <= 26 ? 'Second Trimester' : 'Third Trimester'
const TRIMESTER_NUM = (w) => w <= 13 ? 1 : w <= 26 ? 2 : 3

const DIET_OPTIONS = [
  { value: 'vegetarian', emoji: '🥦', label: 'Vegetarian' },
  { value: 'non-vegetarian', emoji: '🍗', label: 'Non-Vegetarian' },
  { value: 'vegan', emoji: '🌿', label: 'Vegan' },
]

const CONDITION_OPTIONS = [
  'Normal', 'Gestational Diabetes', 'Anemia', 'Thyroid', 'Hypertension', 'PCOS',
]

const SYMPTOM_OPTIONS = [
  { value: 'nausea', label: '🤢 Nausea' },
  { value: 'swelling', label: '🦶 Swelling' },
  { value: 'headaches', label: '🤕 Headaches' },
  { value: 'fatigue', label: '😴 Extreme Fatigue' },
  { value: 'heartburn', label: '🔥 Heartburn' },
  { value: 'back_pain', label: '🦵 Back Pain' },
  { value: 'anxiety', label: '😰 Anxiety' },
  { value: 'spotting', label: '🩸 Spotting' },
  { value: 'insomnia', label: '💤 Insomnia' },
  { value: 'reduced_movement', label: '🤰 Reduced Baby Movement' },
  { value: 'none', label: '✅ No Symptoms' },
]

const ACTIVITY_OPTIONS = [
  { value: 'low', emoji: '🛋️', label: 'Low' },
  { value: 'moderate', emoji: '🚶‍♀️', label: 'Moderate' },
  { value: 'active', emoji: '🏃‍♀️', label: 'Active' },
]

const WATER_OPTIONS = [
  { value: '<4', emoji: '💧', label: '<4 glasses' },
  { value: '4-8', emoji: '💧💧', label: '4–8 glasses' },
  { value: '8+', emoji: '💧💧💧', label: '8+ glasses' },
]

const SUPPLEMENT_OPTIONS = ['Iron', 'Folic Acid', 'Calcium', 'Vitamin D', 'Omega-3', 'None']

const BP_OPTIONS = ['Normal', 'Low', 'High', "Don't Know"]
const HB_OPTIONS = ['Normal', 'Slightly Low', 'Very Low', "Don't Know"]

const SEVERITY_COLORS = { normal: '#4ade80', monitor: '#fbbf24', urgent: '#f87171' }
const SEVERITY_LABELS = { normal: 'Normal', monitor: 'Monitor', urgent: 'Consult Doctor' }

/* ─── Skeleton Card ──────────────────────── */
function SkeletonCard({ wide }) {
  return (
    <div className={`card guidance-card skeleton-card${wide ? ' gc-full' : ''}`}>
      <div className="skel-line skel-title" />
      <div className="skel-line skel-body" />
      <div className="skel-line skel-body short" />
      <div className="skel-line skel-body" />
    </div>
  )
}

/* ─── Chip / Pill toggle ─────────────────── */
function Chip({ label, selected, onClick }) {
  return (
    <button type="button" className={`g-chip${selected ? ' g-chip-on' : ''}`} onClick={onClick}>
      {label}
    </button>
  )
}

/* ─── Selectable Card ────────────────────── */
function SelectCard({ emoji, label, selected, onClick }) {
  return (
    <button type="button" className={`g-select-card${selected ? ' g-select-card-on' : ''}`} onClick={onClick}>
      <span className="g-select-emoji">{emoji}</span>
      <span className="g-select-label">{label}</span>
    </button>
  )
}

/* ═══════════════════════════════════════════ */
export default function Guidance() {
  /* ── wizard state ── */
  const [step, setStep] = useState(1)
  const [direction, setDirection] = useState('forward') // for slide animation
  const [animKey, setAnimKey] = useState(0)

  /* ── Step 1 ── */
  const [week, setWeek] = useState(20)
  const [dietPref, setDietPref] = useState('vegetarian')
  const [conditions, setConditions] = useState(['Normal'])

  /* ── Step 2 ── */
  const [symptoms, setSymptoms] = useState([])
  const [activity, setActivity] = useState('moderate')
  const [water, setWater] = useState('4-8')
  const [supplements, setSupplements] = useState([])

  /* ── Step 3 ── */
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [bp, setBp] = useState("Don't Know")
  const [hemoglobin, setHemoglobin] = useState("Don't Know")
  const [concern, setConcern] = useState('')

  /* ── results ── */
  const [loading, setLoading] = useState(false)
  const [guidance, setGuidance] = useState(null)
  const [meta, setMeta] = useState(null)
  const [error, setError] = useState(null)
  const [showResults, setShowResults] = useState(false)
  const resultsRef = useRef(null)

  useEffect(() => {
    if (guidance) requestAnimationFrame(() => setShowResults(true))
  }, [guidance])

  /* ── navigation ── */
  function goNext() {
    if (step < 3) {
      setDirection('forward')
      setAnimKey(k => k + 1)
      setStep(s => s + 1)
    }
  }
  function goBack() {
    if (step > 1) {
      setDirection('back')
      setAnimKey(k => k + 1)
      setStep(s => s - 1)
    }
  }

  /* ── chip toggles ── */
  function toggleChip(list, setList, value) {
    if (value === 'None' || value === 'none') {
      setList(list.includes(value) ? [] : [value])
      return
    }
    let next = list.filter(v => v !== 'None' && v !== 'none')
    next = next.includes(value) ? next.filter(v => v !== value) : [...next, value]
    setList(next)
  }

  /* ── build payload & fetch ── */
  async function fetchGuidance() {
    setLoading(true)
    setError(null)
    setGuidance(null)
    setShowResults(false)

    const payload = {
      week,
      diet_pref: dietPref,
      conditions: conditions.filter(c => c !== 'Normal'),
      symptoms: symptoms.filter(s => s !== 'none'),
      activity,
      water,
      supplements: supplements.filter(s => s !== 'None'),
      weight: weight ? Number(weight) : null,
      height: height ? Number(height) : null,
      bp,
      hemoglobin,
      concern: concern.trim() || null,
    }

    try {
      const res = await getGuidance(payload)
      setGuidance(res.data.guidance)
      setMeta(res.data)
    } catch {
      setError('Backend not connected — showing preview. Start the Python server for live AI guidance.')
      setGuidance(buildFallback(payload))
      setMeta({
        week, trimester: TRIMESTER_NUM(week), diet_pref: dietPref,
        conditions: payload.conditions, symptoms: payload.symptoms,
      })
    }
    setLoading(false)
  }

  function buildFallback(p) {
    const tri = TRIMESTER(p.week)
    const hasSx = p.symptoms.length > 0
    const sxList = p.symptoms.join(', ')
    return {
      this_week: `At week ${p.week} (${tri}), your baby is growing beautifully. ${hasSx ? `You mentioned experiencing ${sxList} — these are common but worth monitoring.` : "You're reporting no concerning symptoms — wonderful!"} Continue to listen to your body and enjoy this journey.`,
      diet_plan: `Focus on iron-rich foods, folate, and calcium. ${p.diet_pref === 'vegetarian' || p.diet_pref === 'vegan' ? 'Plant-based proteins like lentils, tofu, and quinoa are excellent.' : 'Include lean chicken, fish, and eggs for protein.'} ${p.conditions.includes('Gestational Diabetes') ? 'Avoid high-glycemic foods and monitor blood sugar.' : ''} ${p.conditions.includes('Anemia') ? 'Pair iron-rich foods with Vitamin C for better absorption.' : ''} Stay hydrated with at least 8 glasses of water daily.`,
      meal_suggestion: {
        breakfast: p.diet_pref === 'vegan' ? 'Overnight oats with chia seeds, berries, and almond butter' : p.diet_pref === 'vegetarian' ? 'Spinach & cheese paratha with a glass of orange juice' : 'Scrambled eggs with whole wheat toast and avocado',
        lunch: p.diet_pref === 'vegan' ? 'Quinoa bowl with roasted chickpeas, sweet potato, and tahini' : p.diet_pref === 'vegetarian' ? 'Dal with brown rice, cucumber raita, and a side salad' : 'Grilled chicken wrap with leafy greens and hummus',
        snack: 'A handful of mixed nuts with a banana or apple slices with peanut butter',
        dinner: p.diet_pref === 'vegan' ? 'Stir-fried tofu with vegetables and brown rice' : p.diet_pref === 'vegetarian' ? 'Paneer tikka with mint chutney and roti' : 'Baked salmon with steamed broccoli and sweet potato',
      },
      exercise: `${p.activity === 'low' ? 'Start with gentle 10-minute walks and basic stretches.' : p.activity === 'active' ? 'Continue your routine but reduce intensity — listen to your body.' : 'A 20-minute prenatal yoga or swimming session is ideal.'} ${p.symptoms.includes('back_pain') ? 'Pelvic tilts and cat-cow stretches can relieve back pain.' : ''} Avoid lying flat on your back after week 16.`,
      checkups: `${p.week >= 24 && p.week <= 28 ? 'Glucose challenge test is typically done between weeks 24–28.' : p.week >= 18 && p.week <= 22 ? 'Anatomy scan (level II ultrasound) is critical around this time.' : 'Continue regular prenatal visits as scheduled.'} ${p.conditions.includes('Hypertension') ? 'Monitor blood pressure daily and report persistent headaches.' : ''} Keep taking your prenatal vitamins.`,
      symptom_alerts: hasSx ? p.symptoms.map(s => {
        if (s === 'reduced_movement' || s === 'spotting') return { symptom: s, severity: 'urgent', explanation: 'Please contact your healthcare provider about this symptom immediately.' }
        if (s === 'headaches' && p.conditions.includes('Hypertension')) return { symptom: s, severity: 'urgent', explanation: 'Persistent headaches with hypertension may indicate preeclampsia — seek medical attention.' }
        if (['swelling', 'heartburn', 'fatigue', 'insomnia'].includes(s)) return { symptom: s, severity: 'normal', explanation: `This is common during ${tri.toLowerCase()}. Monitor and mention at your next visit.` }
        return { symptom: s, severity: 'monitor', explanation: 'Keep an eye on this and discuss with your provider at your next visit.' }
      }) : [],
      concern_response: p.concern ? `You asked: "${p.concern}" — This is a thoughtful question. While we recommend discussing specifics with your OB-GYN, many mothers share this concern. Trust your instincts and don't hesitate to call your provider for reassurance.` : '',
    }
  }

  function handleEditAll() {
    setGuidance(null)
    setMeta(null)
    setError(null)
    setShowResults(false)
    setStep(1)
    setDirection('forward')
    setAnimKey(k => k + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /* ─────────────────────────────────────────
     RENDER — WIZARD
     ───────────────────────────────────────── */
  if (!guidance && !loading) {
    return (
      <div className="guidance-page">
        <div className="page-header">
          <h1>📅 Weekly Guidance</h1>
          <p>Personalized advice powered by Goose AI — tailored just for you</p>
        </div>

        {/* Step indicator */}
        <div className="wiz-steps">
          {[1, 2, 3].map(n => (
            <div key={n} className={`wiz-step${step === n ? ' wiz-active' : ''}${step > n ? ' wiz-done' : ''}`}>
              <div className="wiz-dot">{step > n ? '✓' : n}</div>
              <span className="wiz-label">
                {n === 1 ? 'Pregnancy' : n === 2 ? 'Feeling' : 'Optional'}
              </span>
            </div>
          ))}
          <div className="wiz-line" />
        </div>

        <p className="wiz-step-counter">Step {step} of 3</p>

        {/* Wizard body */}
        <div className="wiz-body-wrapper">
          <div key={animKey} className={`wiz-body wiz-slide-${direction}`}>

            {/* ─── Step 1 ─── */}
            {step === 1 && (
              <div className="card wiz-card">
                <h2 className="wiz-title">🤰 About Your Pregnancy</h2>

                <div className="form-group wiz-field">
                  <label>PREGNANCY WEEK</label>
                  <input type="range" min="1" max="42" value={week} onChange={e => setWeek(Number(e.target.value))} />
                  <p className="wiz-week-display">Week {week} · {TRIMESTER(week)}</p>
                </div>

                <div className="wiz-field">
                  <label>DIET PREFERENCE</label>
                  <div className="g-card-row">
                    {DIET_OPTIONS.map(d => (
                      <SelectCard key={d.value} emoji={d.emoji} label={d.label}
                        selected={dietPref === d.value} onClick={() => setDietPref(d.value)} />
                    ))}
                  </div>
                </div>

                <div className="wiz-field">
                  <label>HEALTH CONDITIONS</label>
                  <div className="g-chip-grid">
                    {CONDITION_OPTIONS.map(c => (
                      <Chip key={c} label={c} selected={conditions.includes(c)}
                        onClick={() => toggleChip(conditions, setConditions, c)} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ─── Step 2 ─── */}
            {step === 2 && (
              <div className="card wiz-card">
                <h2 className="wiz-title">💬 How Are You Feeling?</h2>

                <div className="wiz-field">
                  <label>CURRENT SYMPTOMS</label>
                  <div className="g-chip-grid">
                    {SYMPTOM_OPTIONS.map(s => (
                      <Chip key={s.value} label={s.label}
                        selected={symptoms.includes(s.value)}
                        onClick={() => toggleChip(symptoms, setSymptoms, s.value)} />
                    ))}
                  </div>
                </div>

                <div className="wiz-field">
                  <label>ACTIVITY LEVEL</label>
                  <div className="g-card-row">
                    {ACTIVITY_OPTIONS.map(a => (
                      <SelectCard key={a.value} emoji={a.emoji} label={a.label}
                        selected={activity === a.value} onClick={() => setActivity(a.value)} />
                    ))}
                  </div>
                </div>

                <div className="wiz-field">
                  <label>WATER INTAKE</label>
                  <div className="g-card-row">
                    {WATER_OPTIONS.map(w => (
                      <SelectCard key={w.value} emoji={w.emoji} label={w.label}
                        selected={water === w.value} onClick={() => setWater(w.value)} />
                    ))}
                  </div>
                </div>

                <div className="wiz-field">
                  <label>CURRENT SUPPLEMENTS</label>
                  <div className="g-chip-grid">
                    {SUPPLEMENT_OPTIONS.map(s => (
                      <Chip key={s} label={s} selected={supplements.includes(s)}
                        onClick={() => toggleChip(supplements, setSupplements, s)} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ─── Step 3 ─── */}
            {step === 3 && (
              <div className="card wiz-card">
                <h2 className="wiz-title">📝 Tell Us More <span className="wiz-optional">(Optional)</span></h2>
                <p className="wiz-note">These details help us give better advice, but you can skip them.</p>

                <div className="wiz-row-2">
                  <div className="form-group wiz-field">
                    <label>WEIGHT (KG)</label>
                    <input type="number" min="30" max="150" placeholder="e.g., 65" value={weight}
                      onChange={e => setWeight(e.target.value)} />
                  </div>
                  <div className="form-group wiz-field">
                    <label>HEIGHT (CM)</label>
                    <input type="number" min="100" max="200" placeholder="e.g., 160" value={height}
                      onChange={e => setHeight(e.target.value)} />
                  </div>
                </div>

                <div className="wiz-row-2">
                  <div className="form-group wiz-field">
                    <label>BLOOD PRESSURE</label>
                    <select value={bp} onChange={e => setBp(e.target.value)}>
                      {BP_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div className="form-group wiz-field">
                    <label>HEMOGLOBIN LEVEL</label>
                    <select value={hemoglobin} onChange={e => setHemoglobin(e.target.value)}>
                      {HB_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-group wiz-field">
                  <label>WHAT'S WORRYING YOU MOST RIGHT NOW?</label>
                  <textarea className="concern-textarea" maxLength={300} rows={3}
                    placeholder="e.g., Is it safe to travel at week 20? / I haven't felt the baby move today..."
                    value={concern} onChange={e => setConcern(e.target.value)} />
                  <span className="char-count">{concern.length}/300</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="wiz-nav">
          {step > 1 && (
            <button className="btn btn-secondary" onClick={goBack}>← Back</button>
          )}
          <div className="wiz-nav-spacer" />
          {step < 3 ? (
            <button className="btn btn-primary" onClick={goNext}>Next →</button>
          ) : (
            <button className="btn btn-primary wiz-submit-btn" onClick={fetchGuidance}>
              ✨ Get My Personalized Guidance
            </button>
          )}
        </div>
      </div>
    )
  }

  /* ─────────────────────────────────────────
     RENDER — LOADING (skeleton shimmer)
     ───────────────────────────────────────── */
  if (loading) {
    return (
      <div className="guidance-page">
        <div className="page-header">
          <h1>📅 Weekly Guidance</h1>
          <p>Personalized advice powered by Goose AI — tailored just for you</p>
        </div>
        <div className="loading-pulse-msg">✨ Creating your personalized guidance...</div>
        <div className="gc-grid">
          <SkeletonCard /><SkeletonCard />
          <SkeletonCard wide />
          <SkeletonCard /><SkeletonCard />
          <SkeletonCard wide />
          <SkeletonCard wide />
        </div>
      </div>
    )
  }

  /* ─────────────────────────────────────────
     RENDER — RESULTS
     ───────────────────────────────────────── */
  const trimNum = TRIMESTER_NUM(week)
  const sxCount = (symptoms.filter(s => s !== 'none')).length
  const hasSymptomAlerts = guidance.symptom_alerts && guidance.symptom_alerts.length > 0
  const hasConcern = guidance.concern_response && guidance.concern_response.length > 0
  const highestSeverity = hasSymptomAlerts
    ? guidance.symptom_alerts.reduce((h, a) => a.severity === 'urgent' ? 'urgent' : (a.severity === 'monitor' && h !== 'urgent') ? 'monitor' : h, 'normal')
    : 'normal'

  return (
    <div className={`guidance-page results-fade${showResults ? ' results-show' : ''}`} ref={resultsRef}>
      <div className="page-header">
        <h1>📅 Weekly Guidance</h1>
        <p>Personalized advice powered by Goose AI — tailored just for you</p>
      </div>

      {/* Quick-Edit Bar */}
      <div className="card quick-bar">
        <div className="quick-bar-tags">
          <span className="g-pill">📆 Week {week}</span>
          <span className="g-pill">{dietPref === 'vegetarian' ? '🥦' : dietPref === 'vegan' ? '🌿' : '🍗'} {dietPref}</span>
          {conditions.filter(c => c !== 'Normal').map(c => (
            <span key={c} className="g-pill">{c}</span>
          ))}
        </div>
        <div className="quick-bar-actions">
          <button className="btn btn-primary btn-sm" onClick={fetchGuidance} disabled={loading}>
            {loading ? '⏳' : '✨'} Get Guidance
          </button>
          <button className="quick-edit-link" onClick={handleEditAll}>✏️ Edit All Details</button>
        </div>
      </div>

      {error && (
        <div className="g-notice">⚡ {error}</div>
      )}

      {/* Trimester / Badge pills */}
      <div className="g-badge-row">
        <span className="g-pill">📆 Week {week}</span>
        <span className="g-pill">
          {trimNum === 1 ? '🌱 First' : trimNum === 2 ? '🌸 Second' : '🌟 Third'} Trimester
        </span>
        {sxCount > 0 && (
          <span className="g-pill g-pill-warn">⚠️ {sxCount} symptom{sxCount > 1 ? 's' : ''} reported</span>
        )}
        <button className="btn btn-outline btn-sm g-regen-btn" onClick={fetchGuidance}>🔄 Regenerate</button>
      </div>

      {/* Card Grid */}
      <div className="gc-grid">
        {/* This Week */}
        <div className="card guidance-card week gc-anim" style={{ animationDelay: '0ms' }}>
          <div className="gc-head"><span className="gc-emoji">🗓️</span><h3 className="gc-title" style={{ color: '#fb7185' }}>This Week</h3></div>
          <p className="gc-body">{guidance.this_week}</p>
        </div>

        {/* Diet Plan */}
        <div className="card guidance-card diet gc-anim" style={{ animationDelay: '100ms' }}>
          <div className="gc-head"><span className="gc-emoji">🥗</span><h3 className="gc-title" style={{ color: '#4ade80' }}>Diet Plan</h3></div>
          <p className="gc-body">{guidance.diet_plan}</p>
        </div>

        {/* Meal Suggestion — full width */}
        {guidance.meal_suggestion && (
          <div className="card guidance-card meal gc-full gc-anim" style={{ animationDelay: '200ms' }}>
            <div className="gc-head"><span className="gc-emoji">🍽️</span><h3 className="gc-title" style={{ color: '#c084fc' }}>Today's Meal Suggestion</h3></div>
            <div className="meal-grid">
              {['breakfast', 'lunch', 'snack', 'dinner'].map(m => (
                <div key={m} className="meal-row">
                  <span className="meal-label">{m.charAt(0).toUpperCase() + m.slice(1)}</span>
                  <span className="meal-desc">{guidance.meal_suggestion[m]}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Exercise */}
        <div className="card guidance-card exercise gc-anim" style={{ animationDelay: '300ms' }}>
          <div className="gc-head"><span className="gc-emoji">🏃‍♀️</span><h3 className="gc-title" style={{ color: '#60a5fa' }}>Safe Exercise</h3></div>
          <p className="gc-body">{guidance.exercise}</p>
        </div>

        {/* Checkups */}
        <div className="card guidance-card checkup gc-anim" style={{ animationDelay: '400ms' }}>
          <div className="gc-head"><span className="gc-emoji">🏥</span><h3 className="gc-title" style={{ color: '#fbbf24' }}>Checkups & Reminders</h3></div>
          <p className="gc-body">{guidance.checkups}</p>
        </div>

        {/* Symptom Awareness — only if symptoms */}
        {hasSymptomAlerts && (
          <div className={`card guidance-card symptom-card gc-full gc-anim`}
            style={{ animationDelay: '500ms', borderLeftColor: SEVERITY_COLORS[highestSeverity] }}>
            <div className="gc-head"><span className="gc-emoji">⚠️</span><h3 className="gc-title" style={{ color: '#fb923c' }}>Symptom Awareness</h3></div>
            <div className="sx-list">
              {guidance.symptom_alerts.map((a, i) => (
                <div key={i} className="sx-row">
                  <span className="sx-badge" style={{ background: SEVERITY_COLORS[a.severity] + '22', color: SEVERITY_COLORS[a.severity], borderColor: SEVERITY_COLORS[a.severity] + '55' }}>
                    {SEVERITY_LABELS[a.severity]}
                  </span>
                  <span className="sx-name">{a.symptom.replace(/_/g, ' ')}</span>
                  <span className="sx-exp">{a.explanation}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Concern Addressed — only if concern */}
        {hasConcern && (
          <div className="card guidance-card concern-card gc-full gc-anim" style={{ animationDelay: '600ms' }}>
            <div className="gc-head"><span className="gc-emoji">💬</span><h3 className="gc-title" style={{ color: '#c084fc' }}>Your Concern Addressed</h3></div>
            <p className="gc-body">{guidance.concern_response}</p>
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div className="g-disclaimer">
        <span>⚕️</span>
        <p>This guidance is AI-generated and should not replace professional medical advice. Always consult your OB-GYN or midwife for health decisions.</p>
      </div>
    </div>
  )
}
