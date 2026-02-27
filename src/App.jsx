import { useState, useEffect, useRef } from 'react'
import { prompts } from './data/prompts'
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

function randomPrompt(exclude) {
  const pool = exclude ? prompts.filter(p => p !== exclude) : prompts
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

function exportBackup() {
  const entries = getEntries()
  const date = new Date().toISOString().slice(0, 10)
  const json = JSON.stringify(entries, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
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
      if (!Array.isArray(imported)) throw new Error('Invalid format')
      const existing = getEntries()
      const existingIds = new Set(existing.map(e => e.id))
      const merged = [...existing, ...imported.filter(e => !existingIds.has(e.id))]
      merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      saveEntries(merged)
      onDone(merged.length - existing.length)
    } catch {
      alert('Could not read that file. Make sure it\'s a Story Journal backup.')
    }
  }
  reader.readAsText(file)
}

// ── Views ──────────────────────────────────────────────────────────────

function HomeView({ onNewEntry, onBrowse }) {
  const [prompt, setPrompt] = useState(() => randomPrompt())
  const entries = getEntries()

  return (
    <div className="home">
      <header className="home-header">
        <h1 className="app-title">Story Journal</h1>
        {entries.length > 0 && (
          <button className="btn-ghost" onClick={onBrowse}>
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'} →
          </button>
        )}
      </header>

      <div className="prompt-card">
        <span className="prompt-label">Today's prompt</span>
        <p className="prompt-text">{prompt}</p>
        <button className="btn-ghost prompt-refresh" onClick={() => setPrompt(p => randomPrompt(p))}>
          ↻ different prompt
        </button>
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

function EditorView({ prompt, onSave, onBack }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(false)
  const [showPrompt, setShowPrompt] = useState(!!prompt)
  const textareaRef = useRef(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  function handleSave() {
    if (!content.trim()) return
    const entries = getEntries()
    const now = new Date().toISOString()
    const entry = {
      id: Date.now().toString(),
      title: title.trim() || formatDate(now),
      content: content.trim(),
      prompt: prompt || null,
      createdAt: now,
      updatedAt: now,
    }
    saveEntries([entry, ...entries])
    setSaved(true)
    setTimeout(() => onSave(), 600)
  }

  const words = wordCount(content)

  return (
    <div className="editor-view">
      <div className="editor-topbar">
        <button className="btn-ghost" onClick={onBack}>← back</button>
        <div className="editor-meta">
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
          <span className="prompt-label">Prompt</span>
          <p>{prompt}</p>
          <button className="btn-ghost" onClick={() => setShowPrompt(false)}>hide</button>
        </div>
      )}

      <div className="editor-body">
        <input
          className="editor-title"
          placeholder="Title (optional)"
          value={title}
          onChange={e => setTitle(e.target.value)}
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
      const entries = getEntries().filter(e => e.id !== entry.id)
      saveEntries(entries)
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
            <span className="prompt-label">Prompt</span>
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
      alert(added > 0 ? `Imported ${added} new ${added === 1 ? 'entry' : 'entries'}.` : 'No new entries found — everything was already here.')
    })
    e.target.value = ''
  }

  return (
    <div className="browse-view">
      <div className="editor-topbar">
        <button className="btn-ghost" onClick={onBack}>← back</button>
        <button className="btn-primary" onClick={() => onNewEntry(randomPrompt())}>
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

  if (view === 'editor') {
    return (
      <EditorView
        prompt={activePrompt}
        onSave={() => setView('browse')}
        onBack={() => setView('home')}
      />
    )
  }

  if (view === 'browse') {
    return (
      <BrowseView
        onSelect={entry => { setActiveEntry(entry); setView('entry') }}
        onBack={() => setView('home')}
        onNewEntry={startNewEntry}
      />
    )
  }

  if (view === 'entry') {
    return (
      <EntryView
        entry={activeEntry}
        onBack={() => setView('browse')}
        onDelete={() => setView('browse')}
      />
    )
  }

  return (
    <HomeView
      onNewEntry={startNewEntry}
      onBrowse={() => setView('browse')}
    />
  )
}
