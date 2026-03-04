import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { addJournalEntry, getJournalEntries } from '../api'
import './Journal.css'

const SESSION_ID = 'demo_user'
const STORAGE_KEY = 'aura_journal_entries'

/* ─── daily prompts (Mon=1 … Sun=0) ─── */
const PROMPTS = [
  "Write a letter to your baby — what would you say? \u{1F48C}",        // Sun
  "What was the best part of your day today? \u{1F338}",                 // Mon
  "How did your body feel when you woke up this morning?",               // Tue
  "Did you notice your baby moving today? When was the most active time?", // Wed
  "What's one thing you're looking forward to?",                         // Thu
  "Is anything worrying you about your pregnancy right now?",           // Fri
  "How have you been sleeping this week? Any changes?",                 // Sat
]

/* ─── mood options ─── */
const MOODS = [
  { key: 'happy',      emoji: '\u{1F60A}', label: 'Happy',      score: 5 },
  { key: 'okay',       emoji: '\u{1F610}', label: 'Okay',       score: 4 },
  { key: 'sad',        emoji: '\u{1F622}', label: 'Sad',         score: 2 },
  { key: 'anxious',    emoji: '\u{1F630}', label: 'Anxious',     score: 2 },
  { key: 'frustrated', emoji: '\u{1F621}', label: 'Frustrated',  score: 1 },
  { key: 'unwell',     emoji: '\u{1F912}', label: 'Unwell',      score: 1 },
  { key: 'tired',      emoji: '\u{1F634}', label: 'Tired',       score: 3 },
]

/* ─── keyword detection ─── */
const SYMPTOM_KW  = ['pain', 'headache', 'swelling', 'nausea', 'bleeding', 'cramps', 'spotting', 'dizziness', 'ache', 'hurt', 'burning', 'sharp', 'vomit', 'queasy']
const EMOTION_KW  = ['anxiety', 'anxious', 'sadness', 'sad', 'fear', 'scared', 'worry', 'worried', 'frustration', 'frustrated', 'loneliness', 'lonely', 'nervous', 'panic', 'depressed']
const BABY_KW     = ['movement', 'kicks', 'kick', 'active', 'quiet', 'baby moved', 'moving', 'flutter']
const POSITIVE_KW = ['happy', 'great', 'good', 'energetic', 'walked', 'exercise', 'wonderful', 'excited', 'joyful', 'grateful', 'better', 'yoga']
const SEVERE_KW   = ['heavy bleeding', 'severe pain', 'no baby movement', 'fainting', 'blurred vision', 'no movement', 'seizure', 'unconscious']
const MILD_KW     = ['headache', 'nausea', 'mild pain', 'tired', 'exhausted', 'swelling', 'cramps']

function detectTags(text) {
  const lower = text.toLowerCase()
  const tags = []
  const match = (list, category) => list.forEach(kw => { if (lower.includes(kw) && !tags.find(t => t.word === kw)) tags.push({ word: kw, category }) })
  match(SYMPTOM_KW, 'symptom')
  match(EMOTION_KW, 'emotion')
  match(BABY_KW, 'baby')
  match(POSITIVE_KW, 'positive')
  return tags
}

function detectUrgency(text) {
  const lower = text.toLowerCase()
  if (SEVERE_KW.some(kw => lower.includes(kw))) return 'red'
  if (MILD_KW.some(kw => lower.includes(kw))) return 'yellow'
  return 'green'
}

function generateAiResponse(text) {
  const lower = text.toLowerCase()
  if (/\b(severe|emergency|heavy bleeding|blurred vision|fainting|seizure)\b/i.test(text))
    return "I hear you, and I want you to take this seriously. \u{1F49B} Try lying on your left side and noting if the pain is constant or comes in waves. If it's severe or accompanied by bleeding, please go to the hospital. Your safety comes first."
  if (/\b(pain|ache|hurt|cramp|burning|sharp|bleed|bleeding|spotting)\b/i.test(text))
    return "I noticed you mentioned some discomfort. \u{1F49B} Please pay close attention to the intensity and timing. Rest if you can, and if anything feels unusual or worsens, contact your healthcare provider. You know your body best."
  if (/\b(anxious|anxiety|worried|worry|scared|fear|nervous|panic|depressed)\b/i.test(text))
    return "Thank you for sharing that \u2014 being honest with your feelings takes courage. \u{1F337} What you're feeling is more common than you think. Try taking 5 slow deep breaths right now. You're doing an amazing job."
  if (/\b(happy|great|good|wonderful|excited|joyful|grateful)\b/i.test(text))
    return "That's wonderful to hear! \u{1F338} Cherish these good moments \u2014 you deserve them. Your positivity is beautiful for both you and your baby."
  if (/\b(kick|movement|moved|baby.*active|flutter)\b/i.test(text))
    return "It's great that you're paying attention to your baby's movements! \u{1F476} Regular movement is a healthy sign. If you ever notice a significant decrease, don't hesitate to check in with your Kick Tracker."
  if (/\b(tired|exhausted|sleep|insomnia|fatigue|drained)\b/i.test(text))
    return "Growing a human is exhausting \u2014 you're allowed to feel tired. \u{1F4A4} Try sleeping on your left side with a pillow between your knees. Rest when you can, even short 15-minute naps help."
  return "Thank you for checking in today. \u{1F49C} Every entry helps us understand your journey better and look out for you."
}

function detectCrossLinks(text) {
  const lower = text.toLowerCase()
  const links = []
  if (/\b(kick|movement|baby.*mov|flutter|active)\b/i.test(text)) links.push({ label: '\u{1F517} Log a Kick Counting Session', path: '/kick-tracker' })
  if (/\b(anxious|anxiety|depressed|sad|fear|worried|mood)\b/i.test(text)) links.push({ label: '\u{1F517} Take a Mood Check Assessment', path: '/mood-check' })
  if (/\b(diet|food|eat|meal|nutrition|hungry)\b/i.test(text)) links.push({ label: '\u{1F517} Get Weekly Diet Guidance', path: '/weekly-guidance' })
  return links
}

/* ─── localStorage helpers ─── */
function loadEntries() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] } catch { return [] }
}
function saveEntries(arr) { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)) }

/* ─── date helpers ─── */
const niceDate = iso => new Date(iso).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10)
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return dayKey(d) }

/* ═══════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════ */
export default function Journal() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [mood, setMood] = useState(null)
  const [entries, setEntries] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [lastResponse, setLastResponse] = useState(null)
  const [filter, setFilter] = useState('all')
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [expandedAi, setExpandedAi] = useState(new Set())
  const [showInsights, setShowInsights] = useState(true)
  const responseRef = useRef(null)

  /* load */
  useEffect(() => {
    const local = loadEntries()
    setEntries(local)
    // also try backend
    getJournalEntries(SESSION_ID).then(res => {
      if (res.data?.length && !local.length) {
        const migrated = res.data.map(e => ({
          id: String(e.id),
          date: e.created_at,
          mood: null,
          moodScore: null,
          text: e.text,
          quickTags: [],
          detectedTags: detectTags(e.text).map(t => t.word),
          urgencyLevel: detectUrgency(e.text),
          aiResponse: generateAiResponse(e.text),
          crossLinks: detectCrossLinks(e.text).map(l => l.path),
        }))
        setEntries(migrated)
        saveEntries(migrated)
      }
    }).catch(() => {})
  }, [])

  /* submit */
  async function handleSubmit(e) {
    e.preventDefault()
    if (!text.trim()) return
    setSubmitting(true)
    setLastResponse(null)

    const tags = detectTags(text)
    const urgency = detectUrgency(text)
    const aiResp = generateAiResponse(text)
    const cross = detectCrossLinks(text)
    const moodObj = mood ? MOODS.find(m => m.key === mood) : null

    const entry = {
      id: String(Date.now()),
      date: new Date().toISOString(),
      mood: moodObj?.key || null,
      moodScore: moodObj?.score || null,
      text: text.trim(),
      quickTags: [],
      detectedTags: tags.map(t => t.word),
      detectedTagsFull: tags,
      urgencyLevel: urgency,
      aiResponse: aiResp,
      crossLinks: cross.map(l => l.path),
    }

    // save locally
    const updated = [entry, ...entries]
    setEntries(updated)
    saveEntries(updated)

    // also sync to backend
    try { await addJournalEntry({ session_id: SESSION_ID, text: entry.text }) } catch {}

    setText('')
    setMood(null)
    setSubmitting(false)

    // simulate AI thinking
    setThinking(true)
    setTimeout(() => {
      setThinking(false)
      setLastResponse({ aiResp, tags, urgency, cross, moodObj })
      setTimeout(() => responseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100)
    }, 1500)
  }

  /* toggle helpers */
  function toggleExpand(id) { setExpandedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s }) }
  function toggleAi(id) { setExpandedAi(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s }) }

  /* ─── weekly insights ─── */
  const weekAgo = daysAgo(7)
  const weekEntries = entries.filter(e => e.date >= weekAgo)
  const hasInsights = weekEntries.length >= 3

  function moodTrend() {
    return weekEntries.filter(e => e.mood).slice(0, 7).reverse()
  }

  function recurringThemes() {
    const counts = {}
    weekEntries.forEach(e => {
      (e.detectedTags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1 })
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3)
  }

  function positiveHighlight() {
    return weekEntries.find(e => (e.detectedTags || []).some(t => POSITIVE_KW.includes(t)))
  }

  function moodTrendDirection() {
    const moods = moodTrend()
    if (moods.length < 3) return 'neutral'
    const recent = moods.slice(-3).reduce((a, m) => a + (m.moodScore || 3), 0) / 3
    const earlier = moods.slice(0, Math.min(3, moods.length - 3)).reduce((a, m) => a + (m.moodScore || 3), 0) / Math.min(3, moods.length - 3)
    if (recent < earlier - 0.5) return 'declining'
    if (recent > earlier + 0.5) return 'improving'
    return 'neutral'
  }

  /* ─── filtered entries ─── */
  const filteredEntries = entries.filter(e => {
    if (filter === 'all') return true
    if (filter === 'concerns') return e.urgencyLevel === 'red' || e.urgencyLevel === 'yellow'
    if (filter === 'positive') return (e.detectedTags || []).some(t => POSITIVE_KW.includes(t))
    if (filter === 'emotional') return (e.detectedTags || []).some(t => EMOTION_KW.includes(t))
    return true
  })

  const todayPrompt = PROMPTS[new Date().getDay()]

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <div className="jn-page">
      <div className="page-header">
        <h1>{'\u{1F4D3}'} My Journal</h1>
        <p>Write how you feel — Aura listens, analyzes, and looks out for you</p>
      </div>

      {/* ─── ENTRY FORM ─── */}
      <form onSubmit={handleSubmit}>
        <div className="card jn-input-card">
          {/* Daily prompt */}
          <div className="jn-prompt">
            <span className="jn-prompt-label">Today's prompt:</span>
            <span className="jn-prompt-text">{todayPrompt}</span>
          </div>

          {/* Mood selector */}
          <div className="jn-mood-section">
            <label className="jn-mood-label">How are you feeling?</label>
            <div className="jn-mood-row">
              {MOODS.map(m => (
                <button key={m.key} type="button" className={`jn-mood-btn${mood === m.key ? ' jn-mood-on' : ''}`} onClick={() => setMood(prev => prev === m.key ? null : m.key)} title={m.label}>
                  <span className="jn-mood-emoji">{m.emoji}</span>
                  <span className="jn-mood-name">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Textarea */}
          <div className="form-group">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Write anything on your mind... symptoms, emotions, what happened today. Aura will automatically detect concerns."
              rows={5}
              className="jn-textarea"
            />
            <p className="jn-hint">{'\u{1F4A1}'} Try mentioning symptoms like "headache", "swelling", "feeling anxious", or "baby hasn't moved much"</p>
          </div>

          {/* Quick chips */}
          <div className="jn-chip-row">
            {['anxious', 'tired', 'pain', 'nausea', 'baby moved well', 'feeling great', 'swelling', 'headache'].map(hint => (
              <button key={hint} type="button" className="jn-chip" onClick={() => setText(prev => prev ? `${prev} ${hint}` : hint)}>+ {hint}</button>
            ))}
          </div>

          <button type="submit" className="btn btn-primary jn-save-btn" disabled={submitting || !text.trim()}>
            {submitting ? '\u23F3 Saving...' : '\u{1F49C} Save Entry'}
          </button>
        </div>
      </form>

      {/* ─── AI THINKING ─── */}
      {thinking && (
        <div className="jn-thinking">
          <div className="jn-thinking-dot" />
          <span>Aura is reading your entry... {'\u{1F4AD}'}</span>
        </div>
      )}

      {/* ─── AURA'S RESPONSE ─── */}
      {lastResponse && !thinking && (
        <div className="card jn-response-card jn-fade-in" ref={responseRef}>
          <div className="jn-resp-header">
            <span>{'\u{1F49C}'}</span>
            <strong>Aura says...</strong>
          </div>
          <p className="jn-resp-text">{lastResponse.aiResp}</p>

          {/* Detected tags */}
          {lastResponse.tags.length > 0 && (
            <div className="jn-detected">
              <span className="jn-detected-label">Detected:</span>
              <div className="jn-tag-row">
                {lastResponse.tags.map((t, i) => (
                  <span key={i} className={`jn-tag jn-tag-${t.category}`}>{t.word}</span>
                ))}
              </div>
            </div>
          )}

          {/* Urgency */}
          {lastResponse.urgency === 'green' && (
            <div className="jn-urgency jn-urg-green">{'\u{1F7E2}'} No concerns detected {'\u2713'}</div>
          )}
          {lastResponse.urgency === 'yellow' && (
            <div className="jn-urgency jn-urg-yellow">{'\u{1F7E1}'} We noticed you mentioned a symptom. Keep monitoring — if it persists or worsens, consult your doctor.</div>
          )}
          {lastResponse.urgency === 'red' && (
            <div className="jn-urgency jn-urg-red">{'\u26A0\uFE0F'} You mentioned something that may need immediate attention. If symptoms are severe, please contact your healthcare provider or go to the nearest hospital.</div>
          )}

          {/* Cross links */}
          {lastResponse.cross.length > 0 && (
            <div className="jn-cross-links">
              <span className="jn-cross-title">Related:</span>
              {lastResponse.cross.map((link, i) => (
                <button key={i} className="jn-cross-btn" onClick={() => navigate(link.path)}>{link.label}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── WEEKLY INSIGHTS ─── */}
      {hasInsights && (
        <div className="card jn-insights-card">
          <button className="jn-insights-toggle" onClick={() => setShowInsights(v => !v)}>
            <span>{'\u{1F4CA}'} Your Weekly Insights</span>
            <span>{showInsights ? '\u25B2' : '\u25BC'}</span>
          </button>

          {showInsights && (
            <div className="jn-insights-body jn-slide-down">
              {/* Mood trend */}
              {moodTrend().length > 0 && (
                <div className="jn-insight-item">
                  <strong>Mood Trend:</strong>
                  <div className="jn-mood-trend">
                    {moodTrend().map((e, i) => {
                      const m = MOODS.find(mo => mo.key === e.mood)
                      return (
                        <div key={i} className="jn-trend-dot">
                          <span className="jn-trend-emoji">{m?.emoji || '\u2014'}</span>
                          <span className="jn-trend-date">{new Date(e.date).toLocaleDateString('en-US', { weekday: 'short' })}</span>
                        </div>
                      )
                    })}
                  </div>
                  {moodTrendDirection() === 'declining' && <p className="jn-trend-msg jn-trend-warn">Your mood seems lower lately. Consider taking the Mood Check assessment. {'\u{1F49B}'}</p>}
                  {moodTrendDirection() === 'improving' && <p className="jn-trend-msg jn-trend-good">Your mood has been improving! Keep doing what works for you. {'\u{1F31F}'}</p>}
                </div>
              )}

              {/* Recurring themes */}
              {recurringThemes().length > 0 && (
                <div className="jn-insight-item">
                  <strong>Recurring Themes:</strong>
                  <p className="jn-insight-text">
                    Most mentioned this week: {recurringThemes().map(([kw, ct]) => `${kw} (${ct}x)`).join(', ')}
                  </p>
                  {recurringThemes().filter(([_, ct]) => ct >= 3).map(([kw]) => (
                    <p key={kw} className="jn-insight-tip">{'\u{1F4A1}'} Recurring {kw} may be worth discussing with your doctor.</p>
                  ))}
                </div>
              )}

              {/* Positive highlight */}
              {positiveHighlight() && (
                <div className="jn-insight-item">
                  <strong>{'\u{1F31F}'} Bright moment:</strong>
                  <p className="jn-insight-text">"{positiveHighlight().text.slice(0, 80)}{positiveHighlight().text.length > 80 ? '...' : ''}" — {new Date(positiveHighlight().date).toLocaleDateString('en-US', { weekday: 'long' })}</p>
                </div>
              )}

              {/* Entry count */}
              <div className="jn-insight-item">
                <p className="jn-insight-text">You've journaled <strong>{weekEntries.length}</strong> times this week. Consistency helps us help you better! {'\u{1F4DD}'}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── PAST ENTRIES ─── */}
      <div className="card jn-entries-card">
        <div className="jn-entries-header">
          <h3>{'\u{1F4C5}'} Past Entries</h3>
          <span className="jn-entry-count">{'\u{1F4DD}'} {weekEntries.length} this week</span>
        </div>

        {/* Filter bar */}
        <div className="jn-filter-bar">
          {[
            { key: 'all', label: 'All' },
            { key: 'concerns', label: '\u{1F534} Concerns' },
            { key: 'positive', label: '\u{1F7E2} Positive' },
            { key: 'emotional', label: '\u{1F630} Emotional' },
          ].map(f => (
            <button key={f.key} className={`jn-filter-chip${filter === f.key ? ' jn-filter-on' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
          ))}
        </div>

        {filteredEntries.length === 0 && (
          <div className="jn-empty">
            <div className="jn-empty-icon">{'\u{1F4DD}'}</div>
            <p>{entries.length === 0 ? 'Your journal is empty. Write your first entry above!' : 'No entries match this filter.'}</p>
          </div>
        )}

        <div className="jn-entries-list">
          {filteredEntries.map((entry, i) => {
            const isExpanded = expandedIds.has(entry.id)
            const isAiExpanded = expandedAi.has(entry.id)
            const moodObj = entry.mood ? MOODS.find(m => m.key === entry.mood) : null
            const entryTags = (entry.detectedTagsFull || detectTags(entry.text))
            const urgency = entry.urgencyLevel || detectUrgency(entry.text)
            const aiResp = entry.aiResponse || generateAiResponse(entry.text)

            return (
              <div key={entry.id || i} className="jn-entry-row jn-entry-anim" style={{ animationDelay: `${i * 0.06}s` }}>
                <div className="jn-entry-top">
                  <span className="jn-entry-date">
                    {moodObj && <span className="jn-entry-mood-emoji">{moodObj.emoji}</span>}
                    {niceDate(entry.date)}
                  </span>
                  {(urgency === 'red' || urgency === 'yellow') && (
                    <span className={`jn-urg-badge jn-urg-badge-${urgency}`}>{urgency === 'red' ? '\u{1F534}' : '\u{1F7E1}'}</span>
                  )}
                </div>

                <p className={`jn-entry-text${isExpanded ? '' : ' jn-entry-clamp'}`}>{entry.text}</p>
                {entry.text.length > 140 && (
                  <button className="jn-read-more" onClick={() => toggleExpand(entry.id)}>{isExpanded ? 'Show less' : 'Read more...'}</button>
                )}

                {/* Tags */}
                {entryTags.length > 0 && (
                  <div className="jn-tag-row jn-entry-tags">
                    {(Array.isArray(entryTags[0]) || typeof entryTags[0] === 'string'
                      ? entryTags.map(t => typeof t === 'string' ? { word: t, category: SYMPTOM_KW.includes(t) ? 'symptom' : EMOTION_KW.includes(t) ? 'emotion' : BABY_KW.includes(t) ? 'baby' : 'positive' } : t)
                      : entryTags
                    ).map((t, j) => (
                      <span key={j} className={`jn-tag jn-tag-${t.category || 'positive'}`}>{t.word || t}</span>
                    ))}
                  </div>
                )}

                {/* AI response preview */}
                <div className="jn-ai-preview">
                  <button className="jn-ai-toggle" onClick={() => toggleAi(entry.id)}>
                    {'\u{1F49C}'} Aura said: {isAiExpanded ? '' : `${aiResp.slice(0, 50)}...`}
                    <span className="jn-ai-arrow">{isAiExpanded ? '\u25B2' : '\u25BC'}</span>
                  </button>
                  {isAiExpanded && <p className="jn-ai-full">{aiResp}</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* disclaimer */}
      <div className="jn-disclaimer">
        <span>{'\u{1F6E1}\uFE0F'}</span>
        <p>This journal is for personal wellness tracking. AI responses are informational only and do not replace professional medical advice.</p>
      </div>
    </div>
  )
}
