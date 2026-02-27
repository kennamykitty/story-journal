import { useState, useEffect, useRef } from 'react'
import { prompts, tips } from './data/prompts'
import './App.css'

const STORAGE_KEY = 'story-journal-entries'

function getEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
  } catch {
    return []
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

function randomFrom(arr, exclude) {
  const pool = exclude ? arr.filter(p => p !== exclude) : arr
  return pool[Math.floor(Math.random() * pool.length)]
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  })
}

function formatShortDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })
}

function wordCount(text) {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function exportBackup() {
  const entries = getEntries()
  const date = new Date().toISOString().slice(0, 10)
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `story-journal-backup-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function importBackup(file, onDone) {
  const reader = new FileReader()
  reader.onload = e => {
    try {
      const imported = JSON.parse(e.target.result)
      if (!Array.isArray(imported)) throw new Error()
      const existing = getEntries()
      const existingIds = new Set(existing.map(e => e.id))
      const merged = [...existing, ...imported.filter(e => !existingIds.has(e.id))]
      merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      saveEntries(merged)
      onDone(merged.length - existing.length)
    } catch {
      alert("Could not read that file. Make sure it's a Story Journal backup.")
    }
  }
  reader.readAsText(file)
}

// ── Timer hook ─────────────────────────────────────────────────────────

function useTimer() {
  const [timerLeft, setTimerLeft] = useState(null)
  const [timerDone, setTimerDone] = useState(false)
  const intervalRef = useRef(null)

  function startTimer(minutes) {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setTimerDone(false)
    setTimerLeft(minutes * 60)
    intervalRef.current = setInterval(() => {
      setTimerLeft(t => {
        if (t <= 1) {
          clearInterval(intervalRef.current)
          setTimerDone(true)
          return 0
        }
        return t - 1
      })
    }, 1000)
  }

  function cancelTimer() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setTimerLeft(null)
    setTimerDone(false)
  }

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current) }, [])

  return { timerLeft, timerDone, startTimer, cancelTimer }
}

// ── Views ──────────────────────────────────────────────────────────────

function HomeView({ onNewEntry, onBrowse }) {
  const [prompt, setPrompt] = useState(() => randomFrom(prompts))
  const [tip, setTip] = useState(() => randomFrom(tips))
  const entries = getEntries()

  return (
    <div className="home">
      <header className="home-header">
        <div>
          <h1 className="app-title">Story Journal</h1>
          <p className="app-subtitle">A place to practice telling your story</p>
        </div>
        {entries.length > 0 && (
          <button className="btn-ghost" onClick={onBrowse}>
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'} →
          </button>
        )}
      </header>

      <div className="prompt-card">
        <div className="prompt-section">
          <span className="section-label">✦ Today's prompt</span>
          <p className="prompt-text">{prompt}</p>
          <button className="btn-refresh" onClick={() => setPrompt(p => randomFrom(prompts, p))}>
            ↻ different prompt
          </button>
        </div>

        <div className="tip-divider" />

        <div className="tip-section">
          <span className="section-label">✦ Craft tip</span>
          <p className="tip-text">{tip}</p>
          <button className="btn-refresh" onClick={() => setTip(t => randomFrom(tips, t))}>
            ↻ different tip
          </button>
        </div>
      </div>

      <div className="home-actions">
        <button className="btn-primary" onClick={() => onNewEntry(prompt)}>
          Start writing
        </button>
        <button className="btn-secondary" onClick={() => onNewEntry(null)}>
          Write freely (no prompt)
        </button>
      </div>
    </div>
  )
}

const TIMER_OPTIONS = [5, 10, 15, 20]

function todayValue() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function EditorView({ prompt, onSave, onBack }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [entryDate, setEntryDate] = useState(todayValue)
  const [saved, setSaved] = useState(false)
  const [showPrompt, setShowPrompt] = useState(!!prompt)
  const [showTimerPicker, setShowTimerPicker] = useState(false)
  const textareaRef = useRef(null)
  const { timerLeft, timerDone, startTimer, cancelTimer } = useTimer()

  useEffect(() => { textareaRef.current?.focus() }, [])

  function handleSave() {
    if (!content.trim()) return
    const entries = getEntries()
    const createdAt = new Date(entryDate + 'T12:00:00').toISOString()
    const now = new Date().toISOString()
    const entry = {
      id: Date.now().toString(),
      title: title.trim() || formatDate(createdAt),
      content: content.trim(),
      prompt: prompt || null,
      createdAt,
      updatedAt: now,
    }
    saveEntries([entry, ...entries])
    setSaved(true)
    cancelTimer()
    setTimeout(() => onSave(), 600)
  }

  const words = wordCount(content)
  const timerWarning = timerLeft !== null && timerLeft <= 60 && !timerDone

  return (
    <div className="editor-view">
      <div className="editor-topbar">
        <button className="btn-ghost" onClick={onBack}>← back</button>

        <div className="editor-meta">
          {/* Timer display */}
          {timerLeft !== null && (
            <span
              className={`timer-display${timerDone ? ' timer-done' : timerWarning ? ' timer-warning' : ''}`}
              onClick={cancelTimer}
              title="Click to cancel timer"
            >
              {timerDone ? 'Time\'s up ✓' : formatTime(timerLeft)}
            </span>
          )}

          {/* Timer picker */}
          {timerLeft === null && (
            <div className="timer-picker-wrap">
              <button
                className="btn-ghost"
                onClick={() => setShowTimerPicker(p => !p)}
              >
                ⏱ Timer
              </button>
              {showTimerPicker && (
                <div className="timer-picker">
                  {TIMER_OPTIONS.map(m => (
                    <button
                      key={m}
                      className="timer-option"
                      onClick={() => { startTimer(m); setShowTimerPicker(false) }}
                    >
                      {m} min
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {words > 0 && <span className="word-count">{words} words</span>}

          <button
            className={`btn-primary${saved ? ' btn-saved' : ''}`}
            onClick={handleSave}
            disabled={!content.trim() || saved}
          >
            {saved ? 'Saved ✓' : 'Save entry'}
          </button>
        </div>
      </div>

      {prompt && showPrompt && (
        <div className="editor-prompt">
          <span className="section-label">✦ Prompt</span>
          <p>{prompt}</p>
          <button className="btn-refresh" onClick={() => setShowPrompt(false)}>hide</button>
        </div>
      )}

      <div className="editor-body">
        <input
          className="editor-title"
          placeholder="Title (optional)"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
        <input
          className="editor-date"
          type="date"
          value={entryDate}
          onChange={e => setEntryDate(e.target.value)}
        />
        <textarea
          ref={textareaRef}
          className="editor-textarea"
          placeholder="Start writing…"
          value={content}
          onChange={e => setContent(e.target.value)}
        />
      </div>
    </div>
  )
}

function EntryView({ entry, onBack, onDelete }) {
  function handleDelete() {
    if (window.confirm('Delete this entry? This cannot be undone.')) {
      saveEntries(getEntries().filter(e => e.id !== entry.id))
      onDelete()
    }
  }

  return (
    <div className="read-view">
      <div className="editor-topbar">
        <button className="btn-ghost" onClick={onBack}>← back</button>
        <button className="btn-danger" onClick={handleDelete}>Delete</button>
      </div>
      <div className="read-body">
        <p className="read-date">{formatDate(entry.createdAt)}</p>
        <h2 className="read-title">{entry.title}</h2>
        {entry.prompt && (
          <div className="read-prompt">
            <span className="section-label">✦ Prompt</span>
            <p>{entry.prompt}</p>
          </div>
        )}
        <div className="read-content">
          {entry.content.split('\n').map((para, i) =>
            para.trim() ? <p key={i}>{para}</p> : <br key={i} />
          )}
        </div>
        <p className="read-wordcount">{wordCount(entry.content)} words</p>
      </div>
    </div>
  )
}

function BrowseView({ onSelect, onBack, onNewEntry }) {
  const [entries, setEntries] = useState(() => getEntries())
  const importRef = useRef(null)

  function handleImport(e) {
    const file = e.target.files[0]
    if (!file) return
    importBackup(file, added => {
      setEntries(getEntries())
      alert(added > 0
        ? `Imported ${added} new ${added === 1 ? 'entry' : 'entries'}.`
        : 'No new entries found — everything was already here.')
    })
    e.target.value = ''
  }

  return (
    <div className="browse-view">
      <div className="editor-topbar">
        <button className="btn-ghost" onClick={onBack}>← back</button>
        <button className="btn-primary" onClick={() => onNewEntry(randomFrom(prompts))}>
          New entry
        </button>
      </div>
      <div className="browse-body">
        <div className="browse-heading-row">
          <h2 className="browse-heading">All entries</h2>
          <div className="backup-buttons">
            {entries.length > 0 && (
              <button className="btn-ghost" onClick={exportBackup}>↓ Export backup</button>
            )}
            <button className="btn-ghost" onClick={() => importRef.current.click()}>↑ Import backup</button>
            <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
          </div>
        </div>
        {entries.length === 0 ? (
          <p className="browse-empty">No entries yet.</p>
        ) : (
          <ul className="entry-list">
            {entries.map(entry => (
              <li key={entry.id} className="entry-item" onClick={() => onSelect(entry)}>
                <div className="entry-item-title">{entry.title}</div>
                <div className="entry-item-meta">
                  <span>{formatShortDate(entry.createdAt)}</span>
                  <span>{wordCount(entry.content)} words</span>
                </div>
                {entry.prompt && (
                  <div className="entry-item-prompt">"{entry.prompt}"</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── Main App ───────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState('home')
  const [activePrompt, setActivePrompt] = useState(null)
  const [activeEntry, setActiveEntry] = useState(null)

  function startNewEntry(prompt) {
    setActivePrompt(prompt)
    setView('editor')
  }

  if (view === 'editor') return (
    <EditorView prompt={activePrompt} onSave={() => setView('browse')} onBack={() => setView('home')} />
  )
  if (view === 'browse') return (
    <BrowseView
      onSelect={entry => { setActiveEntry(entry); setView('entry') }}
      onBack={() => setView('home')}
      onNewEntry={startNewEntry}
    />
  )
  if (view === 'entry') return (
    <EntryView entry={activeEntry} onBack={() => setView('browse')} onDelete={() => setView('browse')} />
  )
  return <HomeView onNewEntry={startNewEntry} onBrowse={() => setView('browse')} />
}
