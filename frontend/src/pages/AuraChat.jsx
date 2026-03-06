import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { sendChatMessage, getChatSuggestions } from '../api'
import VoiceRecorder from '../components/VoiceRecorder'
import './AuraChat.css'

function chatStorageKey(uid) { return `aura_chat_history_${uid || 'guest'}` }

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function AuraChat() {
  const { user } = useAuth()
  const uid = user?.id
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Load chat history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(chatStorageKey(uid))
      if (saved) setMessages(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [uid])

  // Save chat history to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(chatStorageKey(uid), JSON.stringify(messages))
    }
  }, [messages, uid])

  // Fetch suggestions
  useEffect(() => {
    getChatSuggestions()
      .then(res => setSuggestions(res.data.suggestions || []))
      .catch(() => setSuggestions([
        "What should I eat this week?",
        "Is this symptom normal?",
        "How is my baby developing?",
      ]))
  }, [])

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function sendMessage(text) {
    if (!text.trim() || loading) return

    const userMsg = { role: 'user', content: text.trim(), timestamp: new Date().toISOString() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const history = newMessages.slice(-10).map(m => ({ role: m.role, content: m.content }))
      const res = await sendChatMessage({ message: text.trim(), history })
      const assistantMsg = {
        role: 'assistant',
        content: res.data.response,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch {
      const errorMsg = {
        role: 'assistant',
        content: "I'm having trouble connecting right now. Please try again in a moment. If you have an urgent concern, please contact your healthcare provider. 💛",
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errorMsg])
    }
    setLoading(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  function clearChat() {
    setMessages([])
    localStorage.removeItem(chatStorageKey(uid))
  }

  const hasMessages = messages.length > 0

  return (
    <div className="chat-page">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-left">
          <div className="chat-header-avatar">{'\u{1F931}'}</div>
          <div className="chat-header-info">
            <h1>{'\u{1F4AC}'} Aura Chat</h1>
            <p>Ask me anything about your pregnancy or baby care</p>
          </div>
        </div>
        {hasMessages && (
          <button className="chat-clear-btn" onClick={clearChat}>
            {'\u{1F5D1}\uFE0F'} Clear Chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {!hasMessages ? (
          <div className="chat-welcome">
            <div className="chat-welcome-avatar">{'\u{1F931}'}</div>
            <div className="chat-welcome-text">
              Hi{user?.name ? `, ${user.name}` : ''}! I'm Aura, your AI health companion. {'\u{1F49C}'}<br />
              How can I help you today?
            </div>
            <div className="chat-suggestions">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  className="chat-suggestion"
                  onClick={() => sendMessage(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={i} className={`chat-msg ${msg.role}`}>
                {msg.role === 'assistant' && (
                  <div className="chat-msg-avatar">{'\u{1F931}'}</div>
                )}
                <div>
                  <div className="chat-msg-bubble">{msg.content}</div>
                  <div className="chat-msg-time">{formatTime(msg.timestamp)}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="chat-typing">
                <div className="chat-msg-avatar">{'\u{1F931}'}</div>
                <div className="chat-typing-dots">
                  <div className="chat-typing-dot" />
                  <div className="chat-typing-dot" />
                  <div className="chat-typing-dot" />
                </div>
                <span className="chat-typing-label">Aura is thinking...</span>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-disclaimer">
        {'\u26A0\uFE0F'} Aura provides general health information only. Always consult your healthcare provider.
      </div>
      <div className="chat-input-bar">
        <VoiceRecorder
          mode="transcribe"
          onResult={r => { if (r.transcription) sendMessage(r.transcription) }}
          onError={() => {}}
          disabled={loading}
        />
        <input
          ref={inputRef}
          type="text"
          placeholder="Type your question..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button
          className="chat-send-btn"
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
        >
          {'\u27A4'}
        </button>
      </div>
    </div>
  )
}
