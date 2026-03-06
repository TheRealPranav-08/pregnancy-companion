import { useState, useRef, useEffect } from 'react'
import './VoiceRecorder.css'

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

/* ─── client-side keyword detection (mirrors backend) ─── */
const SYMPTOM_KW = ['pain','headache','swelling','nausea','bleeding','cramps','spotting','dizziness','ache','hurt','burning','sharp','vomit','queasy']
const EMOTION_KW = ['anxiety','anxious','sadness','sad','fear','scared','worry','worried','frustration','frustrated','loneliness','lonely','nervous','panic','depressed']
const BABY_KW    = ['movement','kicks','kick','active','quiet','baby moved','moving','flutter']
const POSITIVE_KW= ['happy','great','good','energetic','walked','exercise','wonderful','excited','joyful','grateful','better','yoga']
const SEVERE_KW  = ['heavy bleeding','severe pain','no baby movement','fainting','blurred vision','no movement','seizure','unconscious']
const MILD_KW    = ['headache','nausea','mild pain','tired','exhausted','swelling','cramps']

function detectTags(text) {
  const lower = text.toLowerCase()
  const tags = [], seen = new Set()
  const match = (list, cat) => list.forEach(kw => { if (lower.includes(kw) && !seen.has(kw)) { seen.add(kw); tags.push({ word: kw, category: cat }) } })
  match(SYMPTOM_KW, 'symptom'); match(EMOTION_KW, 'emotion'); match(BABY_KW, 'baby'); match(POSITIVE_KW, 'positive')
  return tags
}
function detectUrgency(text) {
  const lower = text.toLowerCase()
  if (SEVERE_KW.some(kw => lower.includes(kw))) return 'red'
  if (MILD_KW.some(kw => lower.includes(kw))) return 'yellow'
  return 'green'
}

/**
 * Voice recorder using browser Speech Recognition API.
 *
 * Props:
 *  - mode: "transcribe" | "process"
 *  - onResult({ transcription, tags?, urgency? })
 *  - onError(message)
 *  - disabled
 */
export default function VoiceRecorder({ mode = 'transcribe', onResult, onError, disabled = false }) {
  const [state, setState] = useState('idle') // idle | recording
  const [elapsed, setElapsed] = useState(0)
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current)
      recognitionRef.current?.abort()
    }
  }, [])

  function startListening() {
    if (!SpeechRecognition) {
      onError?.('Speech recognition is not supported in this browser. Please use Chrome or Edge.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = true
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition

    let finalText = ''

    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalText += t + ' '
        } else {
          interim = t
        }
      }
      setTranscript((finalText + interim).trim())
    }

    recognition.onerror = (event) => {
      clearInterval(timerRef.current)
      setState('idle')
      setElapsed(0)
      if (event.error === 'not-allowed') {
        onError?.('Microphone access denied. Please allow microphone permission.')
      } else if (event.error !== 'aborted') {
        onError?.('Voice recognition error: ' + event.error)
      }
    }

    recognition.onend = () => {
      clearInterval(timerRef.current)
      const text = finalText.trim()
      setState('idle')
      setElapsed(0)
      setTranscript('')

      if (!text) {
        onError?.('No speech detected. Please try again.')
        return
      }

      if (mode === 'process') {
        onResult?.({ transcription: text, tags: detectTags(text), urgency: detectUrgency(text) })
      } else {
        onResult?.({ transcription: text })
      }
    }

    recognition.start()
    setState('recording')
    setTranscript('')
    setElapsed(0)
    timerRef.current = setInterval(() => {
      setElapsed(prev => {
        if (prev >= 29) {
          recognitionRef.current?.stop()
          return 30
        }
        return prev + 1
      })
    }, 1000)
  }

  function stopListening() {
    clearInterval(timerRef.current)
    recognitionRef.current?.stop()
  }

  function handleClick() {
    if (state === 'recording') stopListening()
    else if (state === 'idle') startListening()
  }

  const pct = (elapsed / 30) * 100

  return (
    <div className="vr-wrapper">
      <button
        type="button"
        className={`vr-btn vr-${state}`}
        onClick={handleClick}
        disabled={disabled}
        title={state === 'idle' ? 'Record voice note' : 'Stop recording'}
      >
        {state === 'idle' && <span className="vr-icon">🎙️</span>}
        {state === 'recording' && <span className="vr-icon vr-pulse">⏹️</span>}
      </button>

      {state === 'recording' && (
        <div className="vr-timer">
          <div className="vr-bar-track">
            <div className="vr-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="vr-seconds">{elapsed}s / 30s</span>
        </div>
      )}

      {state === 'recording' && transcript && (
        <span className="vr-live-text">{transcript}</span>
      )}
    </div>
  )
}
