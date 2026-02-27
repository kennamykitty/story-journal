import { useState, useEffect, useRef } from 'react'
import { tips, memoryPrompts } from './data/prompts'
import './App.css'

// ── Storage ────────────────────────────────────────────────────────────

const KEYS = {
  receipts: 'sj-receipts',
  homework: 'sj-homework',
  journal:  'story-journal-entries',
}

function load(key) {
  try { return JSON.parse(localStorage.getItem(key)) || [] } catch { return [] }
}
function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

// ── Utilities ──────────────────────────────────────────────────────────

function randomFrom(arr, exclude) {
  const pool = exclude ? arr.filter(p => p !== exclude) : arr
  return pool[Math.floor(Math.random() * pool.length)]
}

function wordCount(text) {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function formatShortDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function getStreak(entries) {
  const dates = new Set(entries.map(e => e.createdAt.slice(0, 10)))
  let streak = 0
  const d = new Date()
  while (dates.has(d.toISOString().slice(0, 10))) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

// ── Backup ─────────────────────────────────────────────────────────────

function exportBackup() {
  const data = {
    receipts: load(KEYS.receipts),
    homework: load(KEYS.homework),
    journal:  load(KEYS.journal),
    exportedAt: new Date().toISOString(),
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `story-journal-backup-${todayISO()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function importBackup(file, onDone) {
  const reader = new FileReader()
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result)
      let added = 0
      for (const key of ['receipts', 'homework', 'journal']) {
        if (!Array.isArray(data[key])) continue
        const existing = load(KEYS[key])
        const ids = new Set(existing.map(e => e.id))
        const merged = [...existing, ...data[key].filter(e => !ids.has(e.id))]
        merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        save(KEYS[key], merged)
        added += merged.length - existing.length
      }
      onDone(added)
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
  const ref = useRef(null)

  function startTimer(minutes) {
    if (ref.current) clearInterval(ref.current)
    setTimerDone(false)
    setTimerLeft(minutes * 60)
    ref.current = setInterval(() => {
      setTimerLeft(t => {
        if (t <= 1) { clearInterval(ref.current); setTimerDone(true); return 0 }
        return t - 1
      })
    }, 1000)
  }

  useEffect(() => () => { if (ref.current) clearInterval(ref.current) }, [])
  return { timerLeft, timerDone, startTimer }
}

// ── Calendar ───────────────────────────────────────────────────────────

function CalendarView({ entries }) {
  const now = new Date()
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const { year, month } = view
  const dates = new Set(entries.map(e => e.createdAt.slice(0, 10)))
  const today = todayISO()
  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthLabel = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  function prev() {
    setView(({ year, month }) => month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 })
  }
  function next() {
    setView(({ year, month }) => month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 })
  }

  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  return (
    <div className="calendar">
      <div className="cal-nav">
        <button className="btn-ghost cal-arrow" onClick={prev}>←</button>
        <span className="cal-month-label">{monthLabel}</span>
        <button className="btn-ghost cal-arrow" onClick={next}>→</button>
      </div>
      <div className="cal-grid">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div key={d} className="cal-dayname">{d}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`g${i}`} />
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          const hasEntry = dates.has(dateStr)
          const isToday = dateStr === today
          return (
            <div key={d} className={`cal-day${isToday ? ' cal-today' : ''}${hasEntry ? ' cal-done' : ''}`}>
              <span className="cal-num">{d}</span>
              {hasEntry && <span className="cal-dot" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Home ───────────────────────────────────────────────────────────────

function HomeView({ nav }) {
  const receiptCount = load(KEYS.receipts).length
  const hwEntries    = load(KEYS.homework)
  const journalCount = load(KEYS.journal).length
  const streak       = getStreak(hwEntries)
  const doneToday    = hwEntries.some(e => e.createdAt.slice(0, 10) === todayISO())
  const tip          = randomFrom(tips)

  return (
    <div className="home">
      <header className="home-header">
        <div>
          <h1 className="app-title">Story Journal</h1>
          <p className="app-subtitle">A daily storytelling practice</p>
        </div>
        <button className="btn-ghost small" onClick={() => nav('backup')}>Backup</button>
      </header>

      <div className="tip-banner">
        <span className="section-label">✦ Craft tip</span>
        <p>{tip}</p>
      </div>

      <div className="practice-cards">

        <div className="practice-card" onClick={() => nav('receipt')}>
          <div className="card-top">
            <span className="card-title">Story Receipt</span>
            <span className="card-count">{receiptCount > 0 ? `${receiptCount} saved` : ''}</span>
          </div>
          <p className="card-desc">Capture a moment from today in 100 words or less.</p>
          <span className="card-cta">Start →</span>
        </div>

        <div className="practice-card" onClick={() => nav('homework')}>
          <div className="card-top">
            <span className="card-title">Homework for Life</span>
            <span className="card-count">
              {doneToday ? '✓ Done today' : streak > 0 ? `✦ ${streak} day streak` : ''}
            </span>
          </div>
          <p className="card-desc">What was the most story-worthy moment of your day?</p>
          <span className="card-cta">{doneToday ? 'View today →' : 'Start →'}</span>
        </div>

        <div className="practice-card" onClick={() => nav('timed')}>
          <div className="card-top">
            <span className="card-title">Timed Writing</span>
            <span className="card-count">{journalCount > 0 ? `${journalCount} saved` : ''}</span>
          </div>
          <p className="card-desc">5, 10, or 15 minute sprint with a personal memory prompt.</p>
          <span className="card-cta">Start →</span>
        </div>

      </div>
    </div>
  )
}

// ── Story Receipt ──────────────────────────────────────────────────────

function ReceiptView({ onBack }) {
  const [content, setContent]   = useState('')
  const [receipts, setReceipts] = useState(() => load(KEYS.receipts))
  const words    = wordCount(content)
  const overLimit = words > 100

  function handleSave() {
    if (!content.trim() || overLimit) return
    const entry = { id: Date.now().toString(), content: content.trim(), wordCount: words, createdAt: new Date().toISOString() }
    const updated = [entry, ...receipts]
    save(KEYS.receipts, updated)
    setReceipts(updated)
    setContent('')
  }

  return (
    <div className="section-view">
      <div className="editor-topbar">
        <button className="btn-ghost" onClick={onBack}>← back</button>
      </div>

      <div className="section-body">
        <div className="section-intro">
          <h2 className="section-title">Story Receipt</h2>
          <p className="section-subtitle">What happened today, in a moment. 100 words max.</p>
        </div>

        <div className="receipt-capture">
          <p className="receipt-timestamp">{formatDate(new Date().toISOString())}</p>
          <textarea
            className={`receipt-textarea${overLimit ? ' over-limit' : ''}`}
            placeholder="Capture the moment…"
            value={content}
            onChange={e => setContent(e.target.value)}
            autoFocus
          />
          <div className="receipt-footer">
            <span className={`word-counter${overLimit ? ' over-limit' : ''}`}>
              {words} / 100 words
            </span>
            <button className="btn-primary" onClick={handleSave} disabled={!content.trim() || overLimit}>
              Save receipt
            </button>
          </div>
        </div>

        {receipts.length > 0 && (
          <div className="log-section">
            <h3 className="log-heading">Past receipts</h3>
            <div className="receipt-log">
              {receipts.map(r => (
                <div key={r.id} className="receipt-item">
                  <span className="receipt-item-meta">{formatShortDate(r.createdAt)} · {r.wordCount} words</span>
                  <p className="receipt-item-text">{r.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Homework for Life ──────────────────────────────────────────────────

function HomeworkView({ onBack }) {
  const [allHw, setAllHw] = useState(() => load(KEYS.homework))
  const todayEntry = allHw.find(e => e.createdAt.slice(0, 10) === todayISO())

  const [moment, setMoment] = useState('')
  const [why,    setWhy]    = useState('')
  const [saved,  setSaved]  = useState(false)
  const streak = getStreak(allHw)

  function handleSave() {
    if (!moment.trim()) return
    const entry = {
      id: Date.now().toString(),
      moment: moment.trim(),
      why: why.trim(),
      createdAt: new Date().toISOString(),
    }
    const updated = [entry, ...allHw.filter(e => e.createdAt.slice(0, 10) !== todayISO())]
    save(KEYS.homework, updated)
    setAllHw(updated)
    setSaved(true)
  }

  const displayEntry = saved
    ? { moment, why, createdAt: new Date().toISOString() }
    : todayEntry

  return (
    <div className="section-view">
      <div className="editor-topbar">
        <button className="btn-ghost" onClick={onBack}>← back</button>
        {streak > 0 && <span className="streak-badge">✦ {streak} day streak</span>}
      </div>

      <div className="section-body">
        <div className="section-intro">
          <h2 className="section-title">Homework for Life</h2>
          <p className="section-subtitle">A daily practice of finding the stories in your own life.</p>
        </div>

        {displayEntry ? (
          <div className="hw-entry-display">
            <span className="section-label">✦ Today's entry</span>
            <p className="hw-moment-text">{displayEntry.moment}</p>
            {displayEntry.why && (
              <p className="hw-why-text">"{displayEntry.why}"</p>
            )}
          </div>
        ) : (
          <div className="hw-form">
            <div className="hw-question-block">
              <label className="hw-question">What was the most story-worthy moment of your day?</label>
              <textarea
                className="hw-textarea"
                placeholder="One sentence minimum…"
                value={moment}
                onChange={e => setMoment(e.target.value)}
                autoFocus
              />
            </div>

            {moment.trim().length > 0 && (
              <div className="hw-question-block">
                <label className="hw-question">Why does this moment matter?</label>
                <textarea
                  className="hw-textarea"
                  placeholder="What made it stick with you?"
                  value={why}
                  onChange={e => setWhy(e.target.value)}
                />
              </div>
            )}

            <button className="btn-primary" onClick={handleSave} disabled={!moment.trim()}>
              Save today's entry
            </button>
          </div>
        )}

        <CalendarView entries={allHw} />
      </div>
    </div>
  )
}

// ── Timed Writing ──────────────────────────────────────────────────────

function TimedWritingView({ onBack }) {
  const [phase,      setPhase]      = useState('setup') // setup | writing | done
  const [duration,   setDuration]   = useState(null)
  const [prompt,     setPrompt]     = useState(null)
  const [content,    setContent]    = useState('')
  const [finalWords, setFinalWords] = useState(0)
  const [entries,    setEntries]    = useState(() => load(KEYS.journal))
  const textareaRef = useRef(null)
  const { timerLeft, timerDone, startTimer } = useTimer()

  useEffect(() => {
    if (timerDone && phase === 'writing') {
      setFinalWords(wordCount(content))
      setPhase('done')
    }
  }, [timerDone])

  function handleStart(minutes) {
    setDuration(minutes)
    setPrompt(randomFrom(memoryPrompts))
    setPhase('writing')
    startTimer(minutes)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  function handleSave() {
    if (!content.trim()) { onBack(); return }
    const now = new Date().toISOString()
    const entry = {
      id: Date.now().toString(),
      title: formatDate(now),
      content: content.trim(),
      prompt,
      createdAt: now,
      updatedAt: now,
    }
    const updated = [entry, ...entries]
    save(KEYS.journal, updated)
    setEntries(updated)
    setPhase('setup')
    setContent('')
  }

  const timerWarning = timerLeft !== null && timerLeft <= 60

  // ── Setup
  if (phase === 'setup') {
    return (
      <div className="section-view">
        <div className="editor-topbar">
          <button className="btn-ghost" onClick={onBack}>← back</button>
        </div>
        <div className="section-body">
          <div className="section-intro">
            <h2 className="section-title">Timed Writing</h2>
            <p className="section-subtitle">Choose a duration. You'll get a prompt and the clock starts.</p>
          </div>

          <div className="duration-row">
            {[5, 10, 15].map(m => (
              <button key={m} className="duration-btn" onClick={() => handleStart(m)}>
                <span className="duration-num">{m}</span>
                <span className="duration-unit">min</span>
              </button>
            ))}
          </div>

          {entries.length > 0 && (
            <div className="log-section">
              <h3 className="log-heading">Past entries</h3>
              <div className="entry-log">
                {entries.map(e => (
                  <div key={e.id} className="entry-log-item">
                    <span className="entry-log-date">{formatShortDate(e.createdAt)}</span>
                    <span className="entry-log-words">{wordCount(e.content)} words</span>
                    {e.prompt && <p className="entry-log-prompt">"{e.prompt}"</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Done
  if (phase === 'done') {
    return (
      <div className="section-view">
        <div className="editor-topbar">
          <button className="btn-ghost" onClick={onBack}>← back</button>
        </div>
        <div className="section-body">
          <div className="result-header">
            <span className="result-words">{finalWords}</span>
            <span className="result-label">words in {duration} {duration === 1 ? 'minute' : 'minutes'}</span>
          </div>
          <div className="result-content">
            {content.split('\n').map((p, i) => p.trim() ? <p key={i}>{p}</p> : <br key={i} />)}
          </div>
          <div className="result-actions">
            <button className="btn-primary" onClick={handleSave} disabled={!content.trim()}>Save entry</button>
            <button className="btn-secondary" onClick={onBack}>Discard</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Writing
  return (
    <div className="editor-view">
      <div className="editor-topbar">
        <button className="btn-ghost" onClick={onBack}>← back</button>
        <div className="editor-meta">
          <span className={`timer-display${timerWarning ? ' timer-warning' : ''}`}>
            {timerLeft !== null ? formatTime(timerLeft) : ''}
          </span>
          {wordCount(content) > 0 && <span className="word-count">{wordCount(content)} words</span>}
        </div>
      </div>

      <div className="timed-prompt-bar">
        <span className="section-label">✦ Prompt</span>
        <p>{prompt}</p>
      </div>

      <div className="editor-body">
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

// ── Backup screen ──────────────────────────────────────────────────────

function BackupView({ onBack }) {
  const importRef = useRef(null)
  const [msg, setMsg] = useState('')

  function handleImport(e) {
    const file = e.target.files[0]
    if (!file) return
    importBackup(file, added => {
      setMsg(added > 0 ? `Imported ${added} new ${added === 1 ? 'entry' : 'entries'}.` : 'No new entries — everything was already here.')
    })
    e.target.value = ''
  }

  return (
    <div className="section-view">
      <div className="editor-topbar">
        <button className="btn-ghost" onClick={onBack}>← back</button>
      </div>
      <div className="section-body">
        <div className="section-intro">
          <h2 className="section-title">Backup</h2>
          <p className="section-subtitle">Export all your entries to a file you can save anywhere. Import to restore.</p>
        </div>
        <div className="backup-actions">
          <button className="btn-primary" onClick={exportBackup}>↓ Export backup</button>
          <button className="btn-secondary" onClick={() => importRef.current.click()}>↑ Import backup</button>
          <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
        </div>
        {msg && <p className="backup-msg">{msg}</p>}
      </div>
    </div>
  )
}

// ── App ────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState('home')

  return (
    <>
      {view === 'home'     && <HomeView          nav={setView} />}
      {view === 'receipt'  && <ReceiptView        onBack={() => setView('home')} />}
      {view === 'homework' && <HomeworkView        onBack={() => setView('home')} />}
      {view === 'timed'    && <TimedWritingView    onBack={() => setView('home')} />}
      {view === 'backup'   && <BackupView          onBack={() => setView('home')} />}
    </>
  )
}
