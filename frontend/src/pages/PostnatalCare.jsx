import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  saveDailyLog, getDailyLog, getDailyStatus,
  saveGrowthLog, getGrowthLogs,
  getVaccinations, completeVaccination,
  getRecoveryTips,
} from '../api'
import VoiceRecorder from '../components/VoiceRecorder'
import './PostnatalCare.css'

/* ───────────────────────────────────────────
   CONSTANTS
   ─────────────────────────────────────────── */
function storageKey(userId) { return `aura_postnatal_logs_${userId || 'guest'}` }
function vaxStorageKey(userId) { return `aura_vaccines_done_${userId || 'guest'}` }

const TABS = [
  { id: 'dashboard', label: '📊 Dashboard' },
  { id: 'growth',    label: '📈 Growth' },
  { id: 'vaccines',  label: '💉 Vaccines' },
  { id: 'momcare',   label: '🤱 Mom\u2019s Care' },
]

const MOODS = [
  { value: 1, emoji: '😫', label: 'Very Low', cls: 'mood-verylow' },
  { value: 2, emoji: '😔', label: 'Low',      cls: 'mood-low' },
  { value: 3, emoji: '😐', label: 'Okay',     cls: 'mood-okay' },
  { value: 4, emoji: '😊', label: 'Good',     cls: 'mood-good' },
  { value: 5, emoji: '🤩', label: 'Great',    cls: 'mood-great' },
]

const MILESTONES = [
  { minWeek: 0,  maxWeek: 2,  title: '🌟 Newborn Stage',         text: 'Baby is adjusting to life outside the womb. Expect lots of sleeping (16-17 hrs/day), frequent feeds, and reflexive movements.' },
  { minWeek: 2,  maxWeek: 6,  title: '👀 Discovering the World',  text: 'Baby starts tracking faces, may show first social smile. Tummy time helps build neck strength.' },
  { minWeek: 6,  maxWeek: 12, title: '😊 Social Smiles & Coos',  text: 'Real smiles appear! Baby begins cooing and making vowel sounds. Better head control during tummy time.' },
  { minWeek: 12, maxWeek: 16, title: '🤲 Reaching & Grasping',   text: 'Baby can bat at objects and may start grasping toys. Laughing out loud begins. Rolls may start belly-to-back.' },
  { minWeek: 16, maxWeek: 24, title: '🧸 Exploring with Hands',  text: 'Passing objects between hands, mouthing everything. Sitting with support. Ready for introduction to solids around 6 months.' },
  { minWeek: 24, maxWeek: 40, title: '🚼 On the Move',           text: 'Crawling, pulling to stand, maybe cruising furniture. Babbling with consonants. Separation anxiety may appear.' },
  { minWeek: 40, maxWeek: 52, title: '🎂 Almost One!',            text: 'First words, first steps. Pincer grasp for small foods. Clapping, waving, and a blossoming personality.' },
]

const VACCINE_SCHEDULE = [
  { age: 'Birth',        weeks: 0,  names: ['BCG', 'OPV-0', 'Hepatitis B – Birth dose'] },
  { age: '6 Weeks',      weeks: 6,  names: ['DTwP/DTaP-1', 'IPV-1', 'Hep B-2', 'Hib-1', 'Rotavirus-1', 'PCV-1'] },
  { age: '10 Weeks',     weeks: 10, names: ['DTwP/DTaP-2', 'IPV-2', 'Hib-2', 'Rotavirus-2', 'PCV-2'] },
  { age: '14 Weeks',     weeks: 14, names: ['DTwP/DTaP-3', 'IPV-3', 'Hib-3', 'Rotavirus-3', 'PCV-3'] },
  { age: '6 Months',     weeks: 26, names: ['OPV-1', 'Hep B-3'] },
  { age: '9 Months',     weeks: 36, names: ['MMR-1', 'Meningococcal Conjugate Vaccine'] },
  { age: '12 Months',    weeks: 52, names: ['Hepatitis A – Dose 1', 'Japanese Encephalitis-1'] },
]

/* ───────────────────────────────────────────
   HELPERS
   ─────────────────────────────────────────── */
function calcBabyAge(birthDate) {
  if (!birthDate) return { weeks: 0, days: 0, totalDays: 0, label: '' }
  const birth = new Date(birthDate)
  const now = new Date()
  const totalDays = Math.max(0, Math.floor((now - birth) / 86400000))
  const weeks = Math.floor(totalDays / 7)
  const days = totalDays % 7
  const months = Math.floor(totalDays / 30.44)
  let label = ''
  if (months >= 1) label = `${months} month${months > 1 ? 's' : ''} old`
  else if (weeks >= 1) label = `${weeks} week${weeks > 1 ? 's' : ''}, ${days} day${days !== 1 ? 's' : ''} old`
  else label = `${totalDays} day${totalDays !== 1 ? 's' : ''} old`
  return { weeks, days, totalDays, label }
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function getHistoryFromStorage(userId) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(userId)) || '{}')
  } catch { return {} }
}

function saveToStorage(userId, date, data) {
  const all = getHistoryFromStorage(userId)
  all[date] = { ...data, savedAt: new Date().toISOString() }
  // Keep only last 30 days
  const keys = Object.keys(all).sort().slice(-30)
  const trimmed = {}
  keys.forEach(k => { trimmed[k] = all[k] })
  localStorage.setItem(storageKey(userId), JSON.stringify(trimmed))
}

function getLast7Days(userId) {
  const all = getHistoryFromStorage(userId)
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    days.push({ date: key, data: all[key] || null, isToday: i === 0 })
  }
  return days
}

function formatShortDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/* ───────────────────────────────────────────
   HEALTH WARNING ENGINE
   ─────────────────────────────────────────── */
function analyzeHealth({ feeds, diapers, babySleep, momSleep, mood, babyWeeks, userId }) {
  const alerts = []

  // — Feed analysis —
  if (feeds === 0) alerts.push({ level: 'red', msg: '🚨 No feeds logged today — newborns need 8-12 feeds/day. Please feed baby soon or consult your pediatrician.' })
  else if (feeds < 6 && babyWeeks < 12) alerts.push({ level: 'orange', msg: `⚠️ Only ${feeds} feeds so far — babies under 3 months typically need 8-12 feeds/day.` })
  else if (feeds >= 8) alerts.push({ level: 'green', msg: `✅ Great feeding — ${feeds} feeds today is excellent for baby's growth.` })
  else if (feeds >= 6) alerts.push({ level: 'green', msg: `✅ ${feeds} feeds logged — on track!` })

  // — Diaper analysis —
  if (diapers === 0) alerts.push({ level: 'red', msg: '🚨 No diaper changes today — this could indicate dehydration. Monitor baby closely and contact your doctor if no wet diaper in 6+ hours.' })
  else if (diapers < 4 && babyWeeks < 12) alerts.push({ level: 'orange', msg: `⚠️ Only ${diapers} diaper changes — babies usually need 6-8+ wet diapers/day. Watch for signs of dehydration.` })
  else if (diapers >= 6) alerts.push({ level: 'green', msg: `✅ ${diapers} diaper changes — good hydration indicator.` })

  // — Baby sleep analysis —
  if (babyWeeks < 12) {
    if (babySleep < 10) alerts.push({ level: 'orange', msg: `⚠️ Baby sleep is ${babySleep}h — newborns typically need 14-17 hours. Watch for signs of discomfort.` })
    else if (babySleep >= 14) alerts.push({ level: 'green', msg: `✅ Baby slept ${babySleep}h — that's healthy for this age.` })
  } else {
    if (babySleep < 8) alerts.push({ level: 'orange', msg: `⚠️ Baby sleep is only ${babySleep}h — babies at this age need 12-15 hours total.` })
    else if (babySleep >= 12) alerts.push({ level: 'green', msg: `✅ Baby slept ${babySleep}h — great for development!` })
  }

  // — Mom sleep analysis —
  if (momSleep < 3) alerts.push({ level: 'red', msg: '🚨 You\'ve slept less than 3 hours — severe sleep deprivation affects your health and milk supply. Please ask for help and try to rest.' })
  else if (momSleep < 5) alerts.push({ level: 'orange', msg: `⚠️ Only ${momSleep}h of sleep — try to nap when baby naps. Your recovery needs rest.` })
  else if (momSleep >= 7) alerts.push({ level: 'green', msg: `✅ ${momSleep}h of sleep — great job prioritizing rest!` })

  // — Mood analysis —
  if (mood <= 1) alerts.push({ level: 'red', msg: '💜 Your mood is very low. If you\'re feeling overwhelmed, anxious, or having dark thoughts, please reach out to your doctor or a helpline. You are not alone.' })
  else if (mood === 2) alerts.push({ level: 'orange', msg: '🧡 Feeling low is common postpartum, but persistent low mood lasting 2+ weeks may indicate PPD. Talk to someone you trust.' })
  else if (mood >= 4) alerts.push({ level: 'green', msg: '✅ Glad you\'re feeling good today! Keep up the self-care.' })

  // — Combined pattern alerts —
  if (momSleep < 4 && mood <= 2) {
    alerts.push({ level: 'support', msg: '💜 Low sleep + low mood pattern detected. This combination is tough — consider asking a partner or family member to take a night shift. Your mental health matters.' })
  }
  if (feeds === 0 && diapers === 0) {
    alerts.push({ level: 'red', msg: '🚨 No feeds AND no diapers logged — if this is accurate (not just unfilled), please check on baby immediately.' })
  }

  // — Trend analysis from history —
  const history = getLast7Days(userId).filter(d => d.data).map(d => d.data)
  if (history.length >= 3) {
    const recentMoods = history.slice(-3).map(h => h.mood || 3)
    const avgRecentMood = recentMoods.reduce((a, b) => a + b, 0) / recentMoods.length
    if (avgRecentMood <= 2) {
      alerts.push({ level: 'support', msg: '💜 Your mood has been consistently low over the past few days. This pattern may indicate you need professional support. Please consider speaking with your healthcare provider about postpartum depression screening.' })
    }
  }

  return alerts
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */
export default function PostnatalCare() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('dashboard')
  const babyAge = calcBabyAge(user?.baby_birth_date)

  return (
    <div className="pn-page">
      {/* Header */}
      <div className="pn-header">
        <div className="pn-header-emoji">👶</div>
        <h1>Postnatal Dashboard</h1>
        {babyAge.label ? (
          <p className="pn-baby-age">
            <span className="pn-baby-age-highlight">{babyAge.label}</span>
            {user?.baby_birth_date && ` • Born ${new Date(user.baby_birth_date).toLocaleDateString()}`}
          </p>
        ) : (
          <p className="pn-baby-age">Track your postnatal journey</p>
        )}
      </div>

      {/* Tabs */}
      <div className="pn-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`pn-tab${activeTab === t.id ? ' active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="pn-tab-content" key={activeTab}>
        {activeTab === 'dashboard' && <DashboardTab babyAge={babyAge} userId={user?.id} />}
        {activeTab === 'growth' && <GrowthTab />}
        {activeTab === 'vaccines' && <VaccineTab babyAge={babyAge} userId={user?.id} />}
        {activeTab === 'momcare' && <MomCareTab user={user} babyAge={babyAge} />}
      </div>

      {/* Disclaimer */}
      <div className="pn-disclaimer">
        ⚠️ This is not medical advice. Always consult your pediatrician and OB-GYN for clinical decisions.
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════
   DASHBOARD TAB
   ═══════════════════════════════════════════ */
function DashboardTab({ babyAge, userId }) {
  const [feeds, setFeeds] = useState(0)
  const [diapers, setDiapers] = useState(0)
  const [babySleep, setBabySleep] = useState(0)
  const [momSleep, setMomSleep] = useState(0)
  const [mood, setMood] = useState(3)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [alerts, setAlerts] = useState(null)

  // Load today's data from localStorage + API on mount
  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    // First try localStorage for today
    const stored = getHistoryFromStorage(userId)[todayKey()]
    if (stored) {
      setFeeds(stored.feeds ?? 0)
      setDiapers(stored.diapers ?? 0)
      setBabySleep(stored.babySleep ?? 0)
      setMomSleep(stored.momSleep ?? 0)
      setMood(stored.mood ?? 3)
      setNotes(stored.notes ?? '')
    }
    // Also try API
    try {
      const [logRes] = await Promise.all([getDailyLog()])
      if (logRes.data && !stored) {
        setFeeds(logRes.data.feed_count || 0)
        setDiapers(logRes.data.diaper_count || 0)
        setBabySleep(logRes.data.baby_sleep_hours || 0)
        setMomSleep(logRes.data.mom_sleep_hours || 0)
        setMood(logRes.data.mom_recovery_mood || 3)
        setNotes(logRes.data.notes || '')
      }
    } catch { /* offline is fine */ }
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setAnalyzing(true)
    setAlerts(null)

    const logData = {
      feeds, diapers, babySleep, momSleep, mood, notes,
    }

    // Save to localStorage
    saveToStorage(userId, todayKey(), logData)

    // Save to API
    try {
      await saveDailyLog({
        feed_count: feeds,
        diaper_count: diapers,
        baby_sleep_hours: babySleep,
        mom_sleep_hours: momSleep,
        mom_recovery_mood: mood,
        notes,
      })
    } catch { /* offline save still works via localStorage */ }

    // Analyze health
    await new Promise(r => setTimeout(r, 800)) // brief analysis animation
    const result = analyzeHealth({
      feeds, diapers, babySleep, momSleep, mood,
      babyWeeks: babyAge.weeks, userId,
    })
    setAlerts(result)
    setAnalyzing(false)
    setSaved(true)
    setSaving(false)
    setTimeout(() => setSaved(false), 3000)
  }

  const history = useMemo(() => getLast7Days(userId), [saved, userId])

  if (loading) return <div className="pn-loading">Loading today's data...</div>

  return (
    <div className="pn-dashboard">
      {/* Baby Age Banner */}
      {babyAge.label ? (
        <div className="pn-age-banner">
          👶 Your baby is <span className="pn-baby-age-highlight">{babyAge.label}</span>
        </div>
      ) : (
        <div className="pn-age-banner pn-age-banner-set">
          Set your baby's birth date in profile to see age-based insights
        </div>
      )}

      {/* Daily Trackers */}
      <div className="pn-section-title">📝 Today's Log</div>
      <div className="pn-tracker-grid">
        <CounterCard
          emoji="🍼" label="Feeds" value={feeds} onChange={setFeeds}
          min={0} max={20} unit="times"
          helper="Newborns: 8-12/day"
        />
        <CounterCard
          emoji="🧷" label="Diapers" value={diapers} onChange={setDiapers}
          min={0} max={20} unit="changes"
          helper="Expect 6-8+ wet/day"
        />
        <SliderCard
          emoji="😴" label="Baby Sleep" value={babySleep} onChange={setBabySleep}
          min={0} max={20} step={0.5} unit="hrs"
          helper="Newborns: 14-17h/day"
        />
        <SliderCard
          emoji="💤" label="Mom Sleep" value={momSleep} onChange={setMomSleep}
          min={0} max={12} step={0.5} unit="hrs"
          helper="Aim for 7+ hours"
        />
      </div>

      {/* Mood */}
      <div className="pn-mood-section">
        <div className="pn-mood-label">How are you feeling today?</div>
        <div className="pn-mood-buttons">
          {MOODS.map(m => (
            <button
              key={m.value}
              className={`pn-mood-btn${mood === m.value ? ` active ${m.cls}` : ''}`}
              onClick={() => setMood(m.value)}
            >
              {m.emoji} {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="pn-notes-section">
        <div className="pn-voice-row">
          <VoiceRecorder
            mode="transcribe"
            onResult={r => { if (r.transcription) setNotes(prev => (prev ? prev + ' ' + r.transcription : r.transcription).slice(0, 500)) }}
            onError={() => {}}
            disabled={saving}
          />
          <span className="pn-voice-label">Voice note</span>
        </div>
        <textarea
          className="pn-notes-input"
          placeholder="Any notes about today... symptoms, milestones, concerns..."
          value={notes}
          onChange={e => setNotes(e.target.value.slice(0, 500))}
          rows={3}
        />
        <div className={`pn-notes-counter${notes.length >= 480 ? ' limit' : ''}`}>
          {notes.length}/500
        </div>
      </div>

      {/* Save Button */}
      <button
        className={`pn-save-btn${saved ? ' saved' : ''}`}
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? '⏳ Analyzing & Saving...' : saved ? '✅ Saved!' : '💾 Save & Analyze'}
      </button>

      {/* Analysis Loading */}
      {analyzing && (
        <div className="pn-analyzing">
          <div className="pn-analyzing-spinner" />
          <div>Analyzing your data...</div>
        </div>
      )}

      {/* Health Alerts */}
      {alerts && alerts.length > 0 && !analyzing && (
        <div className="pn-alerts-section">
          <div className="pn-section-title">🩺 Health Analysis</div>
          {alerts.map((a, i) => (
            <div key={i} className={`pn-alert-card alert-${a.level}`}>
              {a.msg}
            </div>
          ))}
          <div className="pn-alerts-disclaimer">
            These are general guidelines — every baby is different. Consult your pediatrician for personalized advice.
          </div>
        </div>
      )}

      {/* 7-Day History */}
      <div className="pn-history-section">
        <div className="pn-section-title">📅 7-Day History</div>
        <div className="pn-history-scroll">
          {history.map(day => (
            <div key={day.date} className={`pn-day-card${day.isToday ? ' today' : ''}${!day.data ? ' no-data' : ''}`}>
              <div className="pn-day-date">{formatShortDate(day.date)}</div>
              {day.data ? (
                <>
                  <div className={`pn-day-stat ${day.data.feeds >= 6 ? 'green' : day.data.feeds >= 4 ? 'yellow' : 'red'}`}>
                    🍼 {day.data.feeds}
                  </div>
                  <div className={`pn-day-stat ${day.data.diapers >= 6 ? 'green' : day.data.diapers >= 4 ? 'yellow' : 'red'}`}>
                    🧷 {day.data.diapers}
                  </div>
                  <div className="pn-day-stat">😴 {day.data.babySleep}h</div>
                  <div className={`pn-day-stat ${day.data.momSleep >= 6 ? 'green' : day.data.momSleep >= 4 ? 'yellow' : 'red'}`}>
                    💤 {day.data.momSleep}h
                  </div>
                  <div className="pn-day-mood">
                    {MOODS.find(m => m.value === day.data.mood)?.emoji || '😐'}
                  </div>
                </>
              ) : (
                <div className="pn-day-stat">No data</div>
              )}
            </div>
          ))}
        </div>

        {/* Trend Summary */}
        <TrendSummary history={history} />
      </div>

      {/* Milestone */}
      <MilestoneCard weeks={babyAge.weeks} />
    </div>
  )
}


/* ─── Trend Summary ──────────────────────── */
function TrendSummary({ history }) {
  const logged = history.filter(d => d.data)
  if (logged.length < 2) return null

  const avg = (arr, key) => {
    const vals = arr.map(d => d.data[key]).filter(v => v != null)
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null
  }

  const avgFeeds = avg(logged, 'feeds')
  const avgMomSleep = avg(logged, 'momSleep')
  const avgMood = avg(logged, 'mood')

  return (
    <div className="pn-trend-summary">
      📊 <strong>{logged.length}-day averages:</strong>{' '}
      {avgFeeds && (
        <>Feeds: <span className={`pn-trend-val ${avgFeeds >= 6 ? 'green' : avgFeeds >= 4 ? 'yellow' : 'red'}`}>{avgFeeds}</span> · </>
      )}
      {avgMomSleep && (
        <>Mom Sleep: <span className={`pn-trend-val ${avgMomSleep >= 6 ? 'green' : avgMomSleep >= 4 ? 'yellow' : 'red'}`}>{avgMomSleep}h</span> · </>
      )}
      {avgMood && (
        <>Mood: <span className={`pn-trend-val ${avgMood >= 4 ? 'green' : avgMood >= 3 ? 'yellow' : 'red'}`}>{avgMood}/5</span></>
      )}
    </div>
  )
}


/* ─── Milestone Card ─────────────────────── */
function MilestoneCard({ weeks }) {
  const milestone = MILESTONES.find(m => weeks >= m.minWeek && weeks < m.maxWeek)
  if (!milestone) return null

  return (
    <div className="pn-milestone-card">
      <div className="pn-milestone-title">{milestone.title}</div>
      <div className="pn-milestone-text">{milestone.text}</div>
    </div>
  )
}


/* ═══════════════════════════════════════════
   GROWTH TAB
   ═══════════════════════════════════════════ */
function GrowthTab() {
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [head, setHead] = useState('')
  const [logs, setLogs] = useState([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadGrowth() }, [])

  async function loadGrowth() {
    setLoading(true)
    try {
      const res = await getGrowthLogs()
      setLogs(res.data.logs || [])
    } catch { /* ignore */ }
    setLoading(false)
  }

  async function handleSave() {
    if (!weight && !height && !head) return
    setSaving(true)
    try {
      await saveGrowthLog({
        weight_kg: weight ? parseFloat(weight) : null,
        height_cm: height ? parseFloat(height) : null,
        head_cm: head ? parseFloat(head) : null,
      })
      setWeight(''); setHeight(''); setHead('')
      await loadGrowth()
    } catch { /* ignore */ }
    setSaving(false)
  }

  // Compute weekly weight gain insight
  const weightInsights = useMemo(() => {
    const ins = []
    const withWeight = logs.filter(l => l.weight_kg != null).sort((a, b) => new Date(a.log_date) - new Date(b.log_date))
    if (withWeight.length >= 2) {
      const last = withWeight[withWeight.length - 1]
      const prev = withWeight[withWeight.length - 2]
      const diff = (last.weight_kg - prev.weight_kg).toFixed(3)
      const daysDiff = Math.max(1, Math.floor((new Date(last.log_date) - new Date(prev.log_date)) / 86400000))
      const weeklyGain = ((diff / daysDiff) * 7).toFixed(2)
      if (weeklyGain >= 0.15 && weeklyGain <= 0.3) {
        ins.push({ type: 'good', msg: `📈 Weekly weight gain: ~${weeklyGain} kg — healthy range for most babies.` })
      } else if (weeklyGain > 0.3) {
        ins.push({ type: 'good', msg: `📈 Weekly weight gain: ~${weeklyGain} kg — baby is gaining well!` })
      } else if (weeklyGain > 0) {
        ins.push({ type: 'warn', msg: `📉 Weekly weight gain: ~${weeklyGain} kg — on the lower side. Discuss with your pediatrician.` })
      } else {
        ins.push({ type: 'bad', msg: `📉 Weight decreased by ${Math.abs(weeklyGain)} kg/week — please consult your pediatrician.` })
      }
    }
    return ins
  }, [logs])

  return (
    <div className="pn-growth">
      <div className="pn-section-title">📏 Add Measurement</div>
      <div className="pn-growth-inputs">
        <div className="pn-growth-field">
          <label>Weight (kg)</label>
          <input type="number" step="0.01" min="0" max="30"
            value={weight} onChange={e => setWeight(e.target.value)}
            placeholder="e.g. 3.5" />
        </div>
        <div className="pn-growth-field">
          <label>Height (cm)</label>
          <input type="number" step="0.1" min="0" max="120"
            value={height} onChange={e => setHeight(e.target.value)}
            placeholder="e.g. 50" />
        </div>
        <div className="pn-growth-field">
          <label>Head Circ. (cm)</label>
          <input type="number" step="0.1" min="0" max="60"
            value={head} onChange={e => setHead(e.target.value)}
            placeholder="e.g. 35" />
        </div>
      </div>
      <button className="pn-save-btn" onClick={handleSave} disabled={saving || (!weight && !height && !head)}>
        {saving ? '⏳ Saving...' : '💾 Save Measurement'}
      </button>

      {/* Weight insights */}
      {weightInsights.length > 0 && (
        <div className="pn-insights">
          <div className="pn-section-title">💡 Weight Insights</div>
          {weightInsights.map((ins, i) => (
            <div key={i} className={`pn-insight-item ${ins.type}`}>{ins.msg}</div>
          ))}
        </div>
      )}

      {/* Growth History */}
      {loading ? (
        <div className="pn-loading">Loading growth data...</div>
      ) : logs.length === 0 ? (
        <div className="pn-empty">No measurements yet. Add your first one above!</div>
      ) : (
        <div className="pn-growth-list">
          <div className="pn-section-title">📊 Growth History</div>
          {logs.slice().reverse().map((l, i) => (
            <div key={i} className="pn-growth-entry">
              <div className="pn-growth-entry-date">{new Date(l.log_date).toLocaleDateString()}</div>
              <div>
                {l.weight_kg != null && <span className="pn-growth-entry-val">⚖️ {l.weight_kg.toFixed(2)} kg  </span>}
                {l.height_cm != null && <span className="pn-growth-entry-val">📏 {l.height_cm.toFixed(1)} cm  </span>}
                {l.head_cm != null && <span className="pn-growth-entry-val">🧠 {l.head_cm.toFixed(1)} cm</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


/* ═══════════════════════════════════════════
   VACCINE TAB  (static schedule + localStorage)
   ═══════════════════════════════════════════ */
function VaccineTab({ babyAge, userId }) {
  const VAX_KEY = vaxStorageKey(userId)
  const [done, setDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem(VAX_KEY) || '[]') } catch { return [] }
  })

  function toggleVax(name) {
    setDone(prev => {
      const next = prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
      localStorage.setItem(VAX_KEY, JSON.stringify(next))
      return next
    })
  }

  // Also try API vaccines
  const [apiVaccines, setApiVaccines] = useState([])
  useEffect(() => {
    getVaccinations().then(res => {
      if (res.data?.vaccines) setApiVaccines(res.data.vaccines)
    }).catch(() => {})
  }, [])

  const totalVax = VACCINE_SCHEDULE.reduce((sum, g) => sum + g.names.length, 0)
  const completedCount = VACCINE_SCHEDULE.reduce((sum, g) => sum + g.names.filter(n => done.includes(n)).length, 0)
  const progress = totalVax ? Math.round((completedCount / totalVax) * 100) : 0

  return (
    <div className="pn-vaccines">
      {/* Progress */}
      <div className="pn-mc-progress">
        <div className="pn-mc-progress-label">💉 Vaccination Progress — {completedCount}/{totalVax} ({progress}%)</div>
        <div className="pn-mc-progress-bar">
          <div className="pn-mc-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Timeline */}
      <div className="pn-section-title">📋 Vaccination Schedule</div>
      <div className="pn-vax-timeline">
        {VACCINE_SCHEDULE.map((group, gi) => {
          const allDone = group.names.every(n => done.includes(n))
          const isUpcoming = !allDone && babyAge.weeks >= group.weeks - 2 && babyAge.weeks <= group.weeks + 4
          return (
            <div key={gi} className={`pn-vax-item${allDone ? ' completed' : ''}${isUpcoming ? ' upcoming' : ''}`}>
              <div className="pn-vax-age">
                {group.age}
                {isUpcoming && <span className="pn-vax-next-badge">Due soon</span>}
              </div>
              <div className="pn-vax-names">
                {group.names.map((name, ni) => (
                  <div key={ni} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                    <input
                      type="checkbox"
                      checked={done.includes(name)}
                      onChange={() => toggleVax(name)}
                      style={{ accentColor: '#22c55e', width: 16, height: 16 }}
                    />
                    <span style={{ textDecoration: done.includes(name) ? 'line-through' : 'none', opacity: done.includes(name) ? 0.6 : 1 }}>
                      {name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════
   MOM'S CARE TAB
   ═══════════════════════════════════════════ */
function MomCareTab({ user, babyAge }) {
  const [apiData, setApiData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getRecoveryTips().then(res => setApiData(res.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const deliveryType = user?.delivery_type || apiData?.delivery_type || 'normal'
  const weeks = babyAge?.weeks || apiData?.baby_weeks || 0
  const recoveryPct = Math.min(100, Math.round((weeks / 12) * 100))

  const warningSignsNormal = [
    'Heavy bleeding (soaking a pad in 1 hour)',
    'Fever above 100.4°F (38°C)',
    'Severe headache or vision changes',
    'Chest pain or difficulty breathing',
    'Thoughts of harming yourself or baby',
    'Foul-smelling vaginal discharge',
    'Painful, red, or swollen legs',
  ]

  const warningSignsCsection = [
    ...warningSignsNormal,
    'Incision site redness, swelling, or oozing',
    'Opening of the surgical wound',
    'Increasing pain around the incision after initial improvement',
  ]

  const warningList = deliveryType === 'c-section' ? warningSignsCsection : warningSignsNormal

  const recoveryTipsNormal = [
    'Rest whenever baby sleeps — housework can wait',
    'Take sitz baths for perineal healing',
    'Use stool softeners if needed — straining delays healing',
    'Start gentle walks after 1-2 weeks, listen to your body',
    'Kegel exercises help restore pelvic floor strength',
    'Stay hydrated — aim for 8-10 glasses of water daily',
  ]

  const recoveryTipsCsection = [
    'Avoid lifting anything heavier than your baby for 6 weeks',
    'Support your incision when coughing, sneezing, or laughing',
    'Take prescribed pain medication on schedule',
    'Gentle walking encourages healing and prevents blood clots',
    'No driving until you can brake without pain (usually 2-4 weeks)',
    'Watch for signs of infection at the incision site',
  ]

  const breastfeedingTips = [
    'Feed on demand — typically every 2-3 hours for newborns',
    'Proper latch: wide mouth, lips flanged outward, chin touching breast',
    'Switch sides each feeding to maintain supply in both breasts',
    'Drink plenty of water — thirst while nursing is normal',
    'Seek a lactation consultant if you experience persistent pain',
    'Breast milk is the perfect nutrition — but fed is always best',
  ]

  const nutritionTips = [
    'Extra 500 calories/day needed while breastfeeding',
    'Iron-rich foods: spinach, lentils, red meat, fortified cereals',
    'Calcium sources: dairy, fortified plant milk, almonds, broccoli',
    'Continue prenatal vitamins, especially Vitamin D',
    'Omega-3 rich foods support baby\'s brain development via milk',
    'Avoid excessive caffeine — limit to 200mg/day (about 1-2 cups coffee)',
  ]

  if (loading) return <div className="pn-loading">Loading care tips...</div>

  return (
    <div className="pn-momcare">
      {/* Recovery Progress */}
      <div className="pn-mc-progress">
        <div className="pn-mc-progress-label">🌸 Recovery Journey — Week {weeks}</div>
        <div className="pn-mc-progress-bar">
          <div className="pn-mc-progress-fill" style={{ width: `${recoveryPct}%` }} />
        </div>
        <div className="pn-mc-progress-text">
          {weeks < 2 ? 'Early days — be extra gentle with yourself 💕' :
           weeks < 6 ? 'Getting stronger every day! Keep resting 💪' :
           weeks < 12 ? 'Amazing progress! Your body is healing beautifully 🌷' :
           'You\'ve come so far — incredible! 🎉'}
        </div>
      </div>

      {/* Recovery Tips */}
      <div className="pn-mc-card recovery">
        <div className="pn-mc-card-header">
          <span>🩹</span>
          <span>Recovery Tips</span>
          <span className="pn-mc-badge">{deliveryType === 'c-section' ? 'C-Section' : 'Normal'}</span>
        </div>
        <ul className="pn-mc-list">
          {(deliveryType === 'c-section' ? recoveryTipsCsection : recoveryTipsNormal).map((t, i) => <li key={i}>{t}</li>)}
          {apiData?.recovery?.tips?.map((t, i) => <li key={`api-${i}`}>{t}</li>)}
        </ul>
      </div>

      {/* Warning Signs */}
      <div className="pn-mc-card warning">
        <div className="pn-mc-card-header">
          <span>⚠️</span>
          <span>Warning Signs — Seek Help</span>
        </div>
        <ul className="pn-mc-list">
          {warningList.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      </div>

      {/* Breastfeeding */}
      <div className="pn-mc-card breastfeeding">
        <div className="pn-mc-card-header">
          <span>🤱</span>
          <span>Breastfeeding Tips</span>
        </div>
        <ul className="pn-mc-list">
          {breastfeedingTips.map((t, i) => <li key={i}>{t}</li>)}
          {apiData?.breastfeeding_tips?.map((t, i) => <li key={`api-${i}`}>{t}</li>)}
        </ul>
      </div>

      {/* Nutrition */}
      <div className="pn-mc-card nutrition">
        <div className="pn-mc-card-header">
          <span>🥗</span>
          <span>Nutrition Guide</span>
        </div>
        <ul className="pn-mc-list">
          {nutritionTips.map((t, i) => <li key={i}>{t}</li>)}
          {apiData?.nutrition_tips?.map((t, i) => <li key={`api-${i}`}>{t}</li>)}
        </ul>
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════
   REUSABLE COMPONENTS
   ═══════════════════════════════════════════ */
function CounterCard({ emoji, label, value, onChange, min, max, unit, helper }) {
  return (
    <div className="pn-tracker-card">
      <div className="pn-tracker-emoji">{emoji}</div>
      <div className="pn-tracker-label">{label}</div>
      <div className="pn-tracker-controls">
        <button className="pn-counter-btn" onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <span className="pn-counter-value">{value}</span>
        <button className="pn-counter-btn" onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </div>
      <div className="pn-tracker-unit">{unit}</div>
      {helper && <div className="pn-tracker-helper">{helper}</div>}
    </div>
  )
}

function SliderCard({ emoji, label, value, onChange, min, max, step, unit, helper }) {
  return (
    <div className="pn-tracker-card">
      <div className="pn-tracker-emoji">{emoji}</div>
      <div className="pn-tracker-label">{label}</div>
      <div className="pn-tracker-value-display">{value} {unit}</div>
      <div className="pn-slider-wrap">
        <span className="pn-slider-label-min">{min}</span>
        <input
          type="range" min={min} max={max} step={step}
          value={value} onChange={e => onChange(parseFloat(e.target.value))}
          className="pn-slider"
        />
        <span className="pn-slider-label-max">{max}</span>
      </div>
      {helper && <div className="pn-tracker-helper">{helper}</div>}
    </div>
  )
}
