import { useState, useEffect, useRef, useCallback } from 'react'
import { logKicks, getKickStatus } from '../api'
import './KickTracker.css'

const SESSION_ID = 'demo_user'
const STORAGE_SESSIONS = 'aura_kick_sessions'
const STORAGE_TAPS = 'aura_quick_taps'

/* ─── helpers ─── */
const fmt2 = n => String(n).padStart(2, '0')
const fmtTime = s => `${fmt2(Math.floor(s / 3600))}:${fmt2(Math.floor((s % 3600) / 60))}:${fmt2(s % 60)}`
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10)
const niceDate = iso => {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
const niceDateTime = iso => {
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/* ─── localStorage helpers ─── */
function loadSessions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_SESSIONS)) || [] } catch { return [] }
}
function saveSessions(s) { localStorage.setItem(STORAGE_SESSIONS, JSON.stringify(s)) }
function loadTaps() {
  try { return JSON.parse(localStorage.getItem(STORAGE_TAPS)) || {} } catch { return {} }
}
function saveTaps(t) { localStorage.setItem(STORAGE_TAPS, JSON.stringify(t)) }

/* ─── mood cross-ref ─── */
function getLatestMoodScore() {
  try {
    const hist = JSON.parse(localStorage.getItem('aura_mood_history')) || []
    if (!hist.length) return null
    const latest = hist[hist.length - 1]
    return latest.score ?? null
  } catch { return null }
}

const CONTEXT_OPTIONS = [
  { value: 'resting', emoji: '\u{1F6CB}\uFE0F', label: 'Resting' },
  { value: 'after_eating', emoji: '\u{1F37D}\uFE0F', label: 'After Eating' },
  { value: 'cold_drink', emoji: '\u{1F964}', label: 'After Cold Drink' },
  { value: 'walking', emoji: '\u{1F6B6}\u200D\u2640\uFE0F', label: 'Walking' },
  { value: 'other', emoji: '\u{1F4AD}', label: 'Other' },
]

const TIME_BLOCKS = [
  { label: 'Morning', range: '6 AM – 12 PM', start: 6, end: 12, icon: '\u{2600}\uFE0F' },
  { label: 'Afternoon', range: '12 – 6 PM', start: 12, end: 18, icon: '\u{1F324}\uFE0F' },
  { label: 'Evening', range: '6 – 10 PM', start: 18, end: 22, icon: '\u{1F319}' },
  { label: 'Night', range: '10 PM – 6 AM', start: 22, end: 6, icon: '\u{1F30C}' },
]

/* ═══════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════ */
export default function KickTracker() {
  /* ─── top-level state ─── */
  const [mode, setMode] = useState('session') // 'session' | 'quick'

  /* ─── count-to-10 state ─── */
  const [phase, setPhase] = useState('pre') // 'pre' | 'active' | 'done'
  const [context, setContext] = useState('resting')
  const [kicks, setKicks] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [sessionStart, setSessionStart] = useState(null)
  const [warning15, setWarning15] = useState(false)
  const timerRef = useRef(null)
  const tapBtnRef = useRef(null)

  /* ─── quick tap state ─── */
  const [quickCount, setQuickCount] = useState(0)
  const [taps, setTaps] = useState({}) // { '2026-03-04': { count, timestamps:[] } }
  const quickBtnRef = useRef(null)

  /* ─── shared ─── */
  const [sessions, setSessions] = useState([])
  const [showFaq, setShowFaq] = useState(false)
  const [chartView, setChartView] = useState('sessions') // 'sessions' | 'daily'

  /* ─── load from localStorage on mount ─── */
  useEffect(() => {
    setSessions(loadSessions())
    const t = loadTaps()
    setTaps(t)
    const today = dayKey()
    setQuickCount(t[today]?.count || 0)
  }, [])

  /* ─── timer tick ─── */
  useEffect(() => {
    if (phase === 'active') {
      timerRef.current = setInterval(() => {
        setElapsed(prev => {
          const next = prev + 1
          if (next >= 6300 && !warning15) setWarning15(true)  // 1h 45m
          if (next >= 7200) {                                   // 2h
            endSession('timeout')
            return 7200
          }
          return next
        })
      }, 1000)
    }
    return () => clearInterval(timerRef.current)
  }, [phase, warning15])

  /* ─── start session ─── */
  function startSession() {
    setKicks(0)
    setElapsed(0)
    setWarning15(false)
    setSessionStart(new Date())
    setPhase('active')
  }

  /* ─── record kick in session ─── */
  function handleSessionKick() {
    ripple(tapBtnRef.current)
    const next = kicks + 1
    setKicks(next)
    if (next >= 10) endSession('complete')
  }

  /* ─── end session ─── */
  const endSession = useCallback((reason = 'manual') => {
    clearInterval(timerRef.current)
    const now = new Date()
    const durMin = Math.round(elapsed / 60) || 1

    let status = 'healthy'
    if (reason === 'timeout') status = 'alert'
    else if (kicks < 10 && reason === 'manual') status = 'ended_early'
    else {
      const avg = avgSessionMinutes()
      if (durMin > avg * 1.3 && avg > 0) status = 'slow'
    }

    const entry = {
      date: dayKey(),
      startTime: sessionStart?.toISOString(),
      endTime: now.toISOString(),
      durationMinutes: durMin,
      kickCount: reason === 'timeout' ? kicks : reason === 'complete' ? 10 : kicks,
      reachedTen: reason === 'complete',
      context,
      status,
    }

    const updated = [entry, ...loadSessions()].slice(0, 50)
    setSessions(updated)
    saveSessions(updated)
    setPhase('done')

    // also sync to backend
    try { logKicks({ session_id: SESSION_ID, count: entry.kickCount }) } catch {}
  }, [elapsed, kicks, context, sessionStart])

  /* ─── quick tap ─── */
  function handleQuickTap() {
    ripple(quickBtnRef.current)
    const today = dayKey()
    const now = new Date()
    const updated = { ...taps }
    if (!updated[today]) updated[today] = { count: 0, timestamps: [] }
    updated[today].count += 1
    updated[today].timestamps.push(now.toISOString())
    setTaps(updated)
    saveTaps(updated)
    setQuickCount(updated[today].count)
    try { logKicks({ session_id: SESSION_ID, count: updated[today].count }) } catch {}
  }

  /* ─── ripple helper ─── */
  function ripple(el) {
    if (!el) return
    el.classList.remove('kt-tap-pop')
    void el.offsetWidth
    el.classList.add('kt-tap-pop')
  }

  /* ─── analytics helpers ─── */
  function avgSessionMinutes() {
    const completed = sessions.filter(s => s.reachedTen)
    if (!completed.length) return 0
    return Math.round(completed.reduce((a, s) => a + s.durationMinutes, 0) / completed.length)
  }

  function last7Sessions() {
    return sessions.filter(s => s.reachedTen).slice(0, 7).reverse()
  }

  function last7DailyTaps() {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const key = dayKey(d)
      days.push({ date: key, count: taps[key]?.count || 0 })
    }
    return days
  }

  function quickAvg7() {
    const days = last7DailyTaps()
    const withData = days.filter(d => d.count > 0)
    if (withData.length === 0) return 0
    return Math.round(withData.reduce((a, d) => a + d.count, 0) / withData.length)
  }

  function quickStatus() {
    const avg = quickAvg7()
    const daysWithData = Object.keys(taps).length
    if (daysWithData < 3) return { emoji: '\u{1F4CA}', label: 'Building baseline...', color: 'gray' }
    if (avg === 0) return { emoji: '\u{1F4CA}', label: 'Building baseline...', color: 'gray' }
    const pct = quickCount / avg
    if (pct >= 1) return { emoji: '\u{1F49A}', label: 'Active', color: 'green' }
    if (pct >= 0.6) return { emoji: '\u{1F49B}', label: 'Monitor', color: 'yellow' }
    return { emoji: '\u{1F534}', label: 'Low — Check In', color: 'red' }
  }

  /* ─── smart status card ─── */
  function smartStatus() {
    const hour = new Date().getHours()
    const daysCount = sessions.length
    if (daysCount === 0 && Object.keys(taps).length < 3) {
      return { color: 'blue', msg: "We're building your baby's activity baseline. Keep logging daily — after 3 days, we'll be able to detect any unusual changes.", emoji: '\u{1F4CA}' }
    }
    const last = sessions[0]
    if (last) {
      if (last.status === 'alert') return { color: 'red', msg: "Reduced movement was detected. If you haven't already, please contact your healthcare provider. Reduced fetal movement can be an early warning sign.", emoji: '\u{1F6A8}' }
      if (last.status === 'slow') return { color: 'yellow', msg: "Movement was a bit slower than usual. This can be normal — try counting again after a meal. If you're concerned, reach out to your doctor.", emoji: '\u{1F49B}' }
      if (last.date === dayKey()) return { color: 'green', msg: "Your baby showed healthy movement in your last session. Keep tracking daily!", emoji: '\u{1F49A}' }
    }
    if (hour >= 20 && (!last || last.date !== dayKey())) {
      return { color: 'blue', msg: "You haven't done a kick counting session today. Evening is usually when babies are most active — try a session now!", emoji: '\u{1F514}' }
    }
    return { color: 'green', msg: "Your baby showed healthy movement in your last session. Keep tracking daily!", emoji: '\u{1F49A}' }
  }

  /* ─── cross-feature insight ─── */
  function crossInsight() {
    const moodScore = getLatestMoodScore()
    if (moodScore === null || moodScore < 10) return null
    const last = sessions[0]
    const qs = quickStatus()
    const lowKicks = (last && (last.status === 'alert' || last.status === 'slow')) || qs.color === 'red'
    if (!lowKicks) return null
    return true
  }

  /* ─── active hours from quick taps ─── */
  function activeHours() {
    const all = Object.values(taps).flatMap(d => d.timestamps || [])
    if (all.length < 5) return null
    const blocks = [0, 0, 0, 0]
    all.forEach(ts => {
      const h = new Date(ts).getHours()
      if (h >= 6 && h < 12) blocks[0]++
      else if (h >= 12 && h < 18) blocks[1]++
      else if (h >= 18 && h < 22) blocks[2]++
      else blocks[3]++
    })
    const total = blocks.reduce((a, b) => a + b, 0)
    const maxIdx = blocks.indexOf(Math.max(...blocks))
    return { blocks, total, maxIdx }
  }

  /* ─── session result helpers ─── */
  const lastSession = sessions[0]
  const avg = avgSessionMinutes()

  function sessionVerdict() {
    if (!lastSession) return null
    if (lastSession.status === 'alert') return 'timeout'
    if (lastSession.status === 'ended_early') return 'early'
    const dur = lastSession.durationMinutes
    if (avg > 0 && dur < avg * 0.85) return 'faster'
    if (avg > 0 && dur > avg * 1.3) return 'slower'
    return 'consistent'
  }

  /* ═══════════════════════ RENDER ═══════════════════════ */
  const smart = smartStatus()
  const cross = crossInsight()
  const hours = activeHours()

  return (
    <div className="kt-page">
      <div className="page-header">
        <h1>{'\u{1F476}'} Kick Tracker</h1>
        <p>Monitor fetal movement — count kicks, spot patterns, stay informed</p>
      </div>

      {/* ─── Mode Toggle ─── */}
      <div className="kt-mode-toggle">
        <button className={`kt-mode-btn${mode === 'session' ? ' kt-mode-on' : ''}`} onClick={() => setMode('session')}>
          {'\u23F1\uFE0F'} Count-to-10 Session
        </button>
        <button className={`kt-mode-btn${mode === 'quick' ? ' kt-mode-on' : ''}`} onClick={() => setMode('quick')}>
          {'\u{1F446}'} Quick Tap
        </button>
      </div>

      {/* ═══════ COUNT-TO-10 MODE ═══════ */}
      {mode === 'session' && (
        <>
          {/* ── Pre-Session ── */}
          {phase === 'pre' && (
            <div className="card kt-pre-card">
              <div className="kt-pre-info">
                <span className="kt-pre-icon">{'\u{2139}\uFE0F'}</span>
                <p>The <strong>Count-to-10</strong> method is recommended by doctors. Start a session and tap each time you feel your baby move. Ideally, you should feel <strong>10 movements within 2 hours</strong>.</p>
              </div>

              <label className="kt-label">What are you doing right now?</label>
              <div className="kt-ctx-row">
                {CONTEXT_OPTIONS.map(c => (
                  <button key={c.value} className={`kt-ctx-chip${context === c.value ? ' kt-ctx-on' : ''}`} onClick={() => setContext(c.value)}>
                    <span>{c.emoji}</span> {c.label}
                  </button>
                ))}
              </div>

              <button className="btn btn-primary kt-start-btn" onClick={startSession}>
                {'\u25B6\uFE0F'} Start Session
              </button>
            </div>
          )}

          {/* ── Active Session ── */}
          {phase === 'active' && (
            <div className="card kt-active-card">
              {warning15 && (
                <div className="kt-warning-banner">{'\u23F0'} 15 minutes remaining in your session</div>
              )}

              <div className="kt-timer">
                <span className="kt-timer-dot" />
                <span className="kt-timer-text">{'\u23F1\uFE0F'} {fmtTime(elapsed)} elapsed</span>
              </div>

              {/* Progress Dots */}
              <div className="kt-dots">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className={`kt-dot${i < kicks ? ' kt-dot-filled' : ''}`}>
                    {i < kicks ? '\u25CF' : '\u25CB'}
                  </div>
                ))}
              </div>
              <p className="kt-dots-label">{kicks} of 10 kicks</p>

              {/* Context badge */}
              <div className="kt-ctx-badge">{CONTEXT_OPTIONS.find(c => c.value === context)?.emoji} {CONTEXT_OPTIONS.find(c => c.value === context)?.label}</div>

              {/* TAP button */}
              <div className="kt-tap-wrap">
                <button ref={tapBtnRef} className="kick-btn kt-big-tap" onClick={handleSessionKick}>
                  <span className="kick-emoji">{'\u{1F476}'}</span>
                  <span className="kick-label">TAP FOR KICK</span>
                </button>
              </div>

              <button className="kt-end-early" onClick={() => endSession('manual')}>End Session Early</button>
            </div>
          )}

          {/* ── Session Done ── */}
          {phase === 'done' && lastSession && (
            <div className="card kt-done-card">
              {lastSession.status === 'alert' ? (
                <div className="kt-alert-result">
                  <h2>{'\u{1F6A8}'} Attention Needed</h2>
                  <p>Your baby didn't reach 10 movements in 2 hours. This may need attention.</p>
                  <p className="kt-alert-advice">Please try: lying on your left side, having a cold sweet drink, and counting again. If movement remains low, <strong>contact your healthcare provider immediately</strong>.</p>
                </div>
              ) : lastSession.status === 'ended_early' ? (
                <div className="kt-early-result">
                  <h2>{'\u{1F4DD}'} Session Ended Early</h2>
                  <p className="kt-result-stat">{lastSession.kickCount} kicks in {lastSession.durationMinutes} min</p>
                  <p className="kt-result-note">You can try again after resting for a while.</p>
                </div>
              ) : (
                <div className="kt-healthy-result">
                  <h2>{'\u2705'} Session Complete!</h2>
                  <p className="kt-result-stat">10 kicks in {lastSession.durationMinutes} min</p>
                  {avg > 0 && (
                    <div className="kt-compare">
                      <span className="kt-compare-avg">Your average: {avg} min</span>
                      <span className="kt-compare-sep">|</span>
                      <span>Today: {lastSession.durationMinutes} min</span>
                    </div>
                  )}
                  {(() => {
                    const v = sessionVerdict()
                    if (v === 'faster') return <p className="kt-verdict kt-v-green">{'\u{1F4C8}'} Faster than usual! Great activity.</p>
                    if (v === 'consistent') return <p className="kt-verdict kt-v-green">{'\u2705'} Consistent with your pattern.</p>
                    if (v === 'slower') return <p className="kt-verdict kt-v-yellow">{'\u{1F49B}'} A bit slower today, but within safe range.</p>
                    return null
                  })()}
                </div>
              )}

              <div className="kt-done-actions">
                <button className="btn btn-secondary" onClick={() => { setChartView('sessions'); document.getElementById('kt-trends')?.scrollIntoView({ behavior: 'smooth' }) }}>
                  {'\u{1F4CA}'} View My Trends
                </button>
                <button className="btn btn-primary" onClick={() => { setPhase('pre'); setKicks(0); setElapsed(0); setWarning15(false) }}>
                  {'\u{1F504}'} New Session
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════ QUICK TAP MODE ═══════ */}
      {mode === 'quick' && (
        <div className="card kt-quick-card">
          <div className="kt-quick-count">{quickCount}</div>
          <p className="kt-quick-sub">kicks today</p>

          <div className="kt-tap-wrap">
            <button ref={quickBtnRef} className="kick-btn kt-big-tap" onClick={handleQuickTap}>
              <span className="kick-emoji">{'\u{1F476}'}</span>
              <span className="kick-label">TAP FOR KICK</span>
            </button>
          </div>

          {/* 3 stat cards */}
          <div className="kt-stats-row">
            <div className="kt-stat-card">
              <div className="kt-stat-emoji">{'\u{1F4CA}'}</div>
              <div className="kt-stat-value">{quickCount}</div>
              <div className="kt-stat-label">Today</div>
            </div>
            <div className="kt-stat-card">
              <div className="kt-stat-emoji">{'\u{1F4C8}'}</div>
              <div className="kt-stat-value">{quickAvg7() || '\u2014'}</div>
              <div className="kt-stat-label">Avg (7-day)</div>
            </div>
            {(() => {
              const st = quickStatus()
              return (
                <div className={`kt-stat-card kt-stat-${st.color}`}>
                  <div className="kt-stat-emoji">{st.emoji}</div>
                  <div className="kt-stat-value">{st.label}</div>
                  <div className="kt-stat-label">Status</div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* ═══════ SMART STATUS CARD ═══════ */}
      <div className={`card kt-smart-card kt-smart-${smart.color}`}>
        <span className="kt-smart-emoji">{smart.emoji}</span>
        <p className="kt-smart-msg">{smart.msg}</p>
      </div>

      {/* ═══════ CROSS-FEATURE INSIGHT ═══════ */}
      {cross && (
        <div className="card kt-cross-card">
          <span className="kt-cross-emoji">{'\u{1F517}'}</span>
          <p>We noticed reduced baby movement today alongside elevated stress from your recent mood check. Stress and anxiety can sometimes affect your awareness of movement. Try relaxing in a quiet room, lying on your left side, and focusing on counting for 30 minutes. If movement remains low, please consult your doctor.</p>
        </div>
      )}

      {/* ═══════ 7-DAY TREND ═══════ */}
      <div className="card kt-trend-section" id="kt-trends">
        <div className="kt-trend-header">
          <h3>{'\u{1F4C8}'} 7-Day Trend</h3>
          <div className="kt-chart-toggle">
            <button className={`kt-ct-btn${chartView === 'sessions' ? ' kt-ct-on' : ''}`} onClick={() => setChartView('sessions')}>Session Times</button>
            <button className={`kt-ct-btn${chartView === 'daily' ? ' kt-ct-on' : ''}`} onClick={() => setChartView('daily')}>Daily Counts</button>
          </div>
        </div>

        {chartView === 'sessions' ? (
          (() => {
            const data = last7Sessions()
            if (!data.length) return <p className="kt-no-data">Complete a Count-to-10 session to see trends here.</p>
            const maxVal = Math.max(...data.map(d => d.durationMinutes), avg * 1.3 || 30)
            const normalLow = Math.max(avg * 0.7, 0)
            const normalHigh = avg * 1.3
            const bandBottom = (normalLow / maxVal) * 100
            const bandHeight = ((normalHigh - normalLow) / maxVal) * 100
            const avgLine = (avg / maxVal) * 100
            return (
              <div className="kt-chart">
                {/* normal zone band */}
                {avg > 0 && <div className="kt-chart-band" style={{ bottom: `${bandBottom}%`, height: `${bandHeight}%` }} />}
                {avg > 0 && <div className="kt-chart-avg-line" style={{ bottom: `${avgLine}%` }}><span>avg {avg}m</span></div>}
                <div className="kt-chart-bars">
                  {data.map((s, i) => {
                    const h = (s.durationMinutes / maxVal) * 100
                    const isHigh = avg > 0 && s.durationMinutes > normalHigh
                    return (
                      <div key={i} className="kt-bar-col">
                        <div className={`kt-bar${isHigh ? ' kt-bar-red' : ''}`} style={{ height: `${h}%` }}>
                          <span className="kt-bar-val">{s.durationMinutes}m</span>
                        </div>
                        <span className="kt-bar-date">{niceDate(s.date)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()
        ) : (
          (() => {
            const data = last7DailyTaps()
            const avgD = quickAvg7()
            const maxVal = Math.max(...data.map(d => d.count), avgD * 1.3 || 10, 5)
            const threshold = avgD * 0.6
            return (
              <div className="kt-chart">
                {avgD > 0 && <div className="kt-chart-avg-line" style={{ bottom: `${(avgD / maxVal) * 100}%` }}><span>avg {avgD}</span></div>}
                <div className="kt-chart-bars">
                  {data.map((d, i) => {
                    const h = maxVal > 0 ? (d.count / maxVal) * 100 : 0
                    const isLow = avgD > 0 && d.count > 0 && d.count < threshold
                    return (
                      <div key={i} className="kt-bar-col">
                        <div className={`kt-bar${isLow ? ' kt-bar-red' : ''}`} style={{ height: `${h}%` }}>
                          {d.count > 0 && <span className="kt-bar-val">{d.count}</span>}
                        </div>
                        <span className="kt-bar-date">{niceDate(d.date)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()
        )}
      </div>

      {/* ═══════ BABY'S ACTIVE HOURS ═══════ */}
      <div className="card kt-hours-section">
        <h3>{'\u{1F476}'} Your Baby's Active Hours</h3>
        {hours ? (
          <>
            <div className="kt-hours-bars">
              {TIME_BLOCKS.map((b, i) => {
                const pct = hours.total > 0 ? Math.round((hours.blocks[i] / hours.total) * 100) : 0
                const isMax = i === hours.maxIdx
                return (
                  <div key={i} className={`kt-hbar-row${isMax ? ' kt-hbar-max' : ''}`}>
                    <span className="kt-hbar-icon">{b.icon}</span>
                    <span className="kt-hbar-label">{b.label}</span>
                    <div className="kt-hbar-track">
                      <div className="kt-hbar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="kt-hbar-pct">{pct}%</span>
                  </div>
                )
              })}
            </div>
            <p className="kt-hours-insight">Your baby is most active in the <strong>{TIME_BLOCKS[hours.maxIdx].label}</strong> {TIME_BLOCKS[hours.maxIdx].icon}</p>
          </>
        ) : (
          <p className="kt-no-data">Keep logging kicks for a few days to discover your baby's active hours!</p>
        )}
      </div>

      {/* ═══════ SESSION HISTORY LOG ═══════ */}
      <div className="card kt-history-section">
        <h3>{'\u{1F4CB}'} Recent Sessions</h3>
        {sessions.length === 0 ? (
          <p className="kt-no-data">No sessions yet. Start your first Count-to-10 session above! {'\u{1F446}'}</p>
        ) : (
          <div className="kt-history-list">
            {sessions.slice(0, 7).map((s, i) => {
              const statusMap = {
                healthy: { badge: '\u2705 Healthy', cls: 'green' },
                slow: { badge: '\u26A0\uFE0F Slow', cls: 'yellow' },
                alert: { badge: '\u{1F6A8} Alert', cls: 'red' },
                ended_early: { badge: '\u23F9 Ended Early', cls: 'gray' },
              }
              const st = statusMap[s.status] || statusMap.healthy
              const ctxLabel = CONTEXT_OPTIONS.find(c => c.value === s.context)?.label || s.context
              return (
                <div key={i} className="kt-history-row">
                  <span className="kt-h-date">{niceDateTime(s.startTime || s.date)}</span>
                  <span className="kt-h-dur">{s.durationMinutes} min</span>
                  <span className="kt-h-kicks">{s.kickCount} kicks</span>
                  <span className="kt-h-ctx">{ctxLabel}</span>
                  <span className={`kt-h-badge kt-hb-${st.cls}`}>{st.badge}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ═══════ FAQ ═══════ */}
      <div className="kt-faq">
        <button className="kt-faq-toggle" onClick={() => setShowFaq(f => !f)}>
          {'\u2139\uFE0F'} Why track kicks? {showFaq ? '\u25B2' : '\u25BC'}
        </button>
        {showFaq && (
          <div className="kt-faq-body">
            <p><strong>Why is kick counting important?</strong></p>
            <p>Fetal movement is one of the best indicators of your baby's well-being. A noticeable decrease in movement can sometimes signal problems like reduced oxygen or placental issues.</p>
            <p><strong>What is the Count-to-10 method?</strong></p>
            <p>Lie on your side and count distinct movements (kicks, rolls, flutters). You should feel at least 10 in 2 hours. Most babies achieve this in 20–45 minutes.</p>
            <p><strong>When should I be concerned?</strong></p>
            <p>If your baby doesn't reach 10 movements in 2 hours, or if you notice a significant decrease from their usual pattern, contact your healthcare provider right away.</p>
            <p><strong>When is the best time to count?</strong></p>
            <p>Most babies are most active in the evening (after dinner). Pick a consistent time each day, ideally when your baby is usually active.</p>
          </div>
        )}
      </div>

      {/* disclaimer */}
      <div className="kt-disclaimer">
        <span>{'\u{1F6E1}\uFE0F'}</span>
        <p>This tool is for informational tracking only and does not replace medical advice. Always consult your healthcare provider about any concerns with fetal movement.</p>
      </div>
    </div>
  )
}
