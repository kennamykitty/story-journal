import { useState, useEffect, useRef } from 'react'
import { tips, journalPrompts } from './data/prompts'
import './App.css'

// ── Storage ────────────────────────────────────────────────────────────

const KEYS = {
  pages:    'sj-pages',
  prompts:  'sj-prompts',
  homework: 'sj-homework',
}

function load(key) {
  try { return JSON.parse(localStorage.getItem(key)) || [] } catch { return [] }
}
function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

// ── Utilities ──────────────────────────────────────────────────────────

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

function randomPrompt(exclude) {
  const pool = exclude !== null ? journalPrompts.filter(p => p !== exclude) : journalPrompts
  return pool[Math.floor(Math.random() * pool.length)]
}

// ── Backup ─────────────────────────────────────────────────────────────

function exportBackup() {
  const data = {
    pages:    load(KEYS.pages),
    prompts:  load(KEYS.prompts),
    homework: load(KEYS.homework),
    exportedAt: new Date().toISOString(),
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
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
      for (const key of ['pages', 'prompts', 'homework']) {
        if (!Array.isArray(data[key])) continue
        const existing = load(KEYS[key])
        const ids      = new Set(existing.map(e => e.id))
        const merged   = [...existing, ...data[key].filter(e => !ids.has(e.id))]
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

function CalendarView({ entries, onDayClick }) {
  const now = new Date()
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const { year, month } = view
  const dates       = new Set(entries.map(e => e.createdAt.slice(0, 10)))
  const today       = todayISO()
  const firstDow    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthLabel  = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

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
          const dateStr  = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          const hasEntry = dates.has(dateStr)
          const isToday  = dateStr === today
          const clickable = hasEntry && onDayClick
          return (
            <div
              key={d}
              className={`cal-day${isToday ? ' cal-today' : ''}${hasEntry ? ' cal-done' : ''}${clickable ? ' cal-clickable' : ''}`}
              onClick={clickable ? () => onDayClick(dateStr) : undefined}
            >
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
  const pagesCount = load(KEYS.pages).length
  const hwEntries  = load(KEYS.homework)
  const streak     = getStreak(hwEntries)
  const doneToday  = hwEntries.some(e => e.createdAt.slice(0, 10) === todayISO())
  const promptsCount = load(KEYS.prompts).length
  const tip        = tips[Math.floor(Math.random() * tips.length)]

  return (
    <div className="home">
      <header className="home-header">
        <div>
          <h1 className="app-title">Storytelling</h1>
          <p className="app-subtitle">A daily storytelling practice</p>
        </div>
        <button className="btn-ghost small" onClick={() => nav('backup')}>Backup</button>
      </header>

      <div className="tip-banner">
        <span className="section-label">✦ Craft tip</span>
        <p>{tip}</p>
      </div>

      <div className="practice-cards">

        <div className="practice-card" onClick={() => nav('pages')}>
          <div className="card-top">
            <span className="card-title">Morning Pages</span>
            <span className="card-count">{pagesCount > 0 ? `${pagesCount} sessions` : ''}</span>
          </div>
          <p className="card-desc">Stream-of-consciousness writing. No prompts, no rules — just keep writing.</p>
          <span className="card-cta">Start writing →</span>
        </div>

        <div className="practice-card" onClick={() => nav('prompts')}>
          <div className="card-top">
            <span className="card-title">Writing Prompts</span>
            <span className="card-count">{promptsCount > 0 ? `${promptsCount} saved` : ''}</span>
          </div>
          <p className="card-desc">Journal prompts to help you open up. Cycle through until one lands.</p>
          <span className="card-cta">See a prompt →</span>
        </div>

        <div className="practice-card" onClick={() => nav('homework')}>
          <div className="card-top">
            <span className="card-title">Homework for Life</span>
            <span className="card-count">
              {doneToday ? '✓ Done today' : streak > 0 ? `✦ ${streak} day streak` : ''}
            </span>
          </div>
          <p className="card-desc">Find the story hiding in your ordinary day. Every day has one.</p>
          <span className="card-cta">{doneToday ? 'View today →' : 'Start →'}</span>
        </div>

      </div>
    </div>
  )
}

// ── Morning Pages ──────────────────────────────────────────────────────

function MorningPagesView({ onBack }) {
  const [phase,        setPhase]        = useState('setup')
  const [duration,     setDuration]     = useState(null)
  const [content,      setContent]      = useState('')
  const [finalWords,   setFinalWords]   = useState(0)
  const [entries,      setEntries]      = useState(() => load(KEYS.pages))
  const [viewingEntry, setViewingEntry] = useState(null)
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
    setPhase('writing')
    startTimer(minutes)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  function handleSave() {
    if (!content.trim()) { onBack(); return }
    const now   = new Date().toISOString()
    const entry = {
      id: Date.now().toString(),
      content: content.trim(),
      wordCount: finalWords,
      duration,
      createdAt: now,
    }
    const updated = [entry, ...entries]
    save(KEYS.pages, updated)
    setEntries(updated)
    setPhase('setup')
    setContent('')
  }

  const timerWarning = timerLeft !== null && timerLeft <= 60

  // Reading a past entry
  if (viewingEntry) {
    return (
      <div className="section-view">
        <div className="editor-topbar">
          <button className="btn-ghost" onClick={() => setViewingEntry(null)}>← back</button>
          <span className="entry-read-date">{formatDate(viewingEntry.createdAt)}</span>
        </div>
        <div className="section-body">
          <div className="entry-read-meta">{viewingEntry.wordCount} words · {viewingEntry.duration} min</div>
          <div className="entry-read-content">
            {viewingEntry.content.split('\n').map((p, i) => p.trim() ? <p key={i}>{p}</p> : <br key={i} />)}
          </div>
        </div>
      </div>
    )
  }

  // Setup
  if (phase === 'setup') {
    return (
      <div className="section-view">
        <div className="editor-topbar">
          <button className="btn-ghost" onClick={onBack}>← back</button>
        </div>
        <div className="section-body">
          <div className="section-intro">
            <h2 className="section-title">Morning Pages</h2>
          </div>

          <div className="morning-pages-desc">
            <p>Morning Pages is a practice of writing three pages of pure stream-of-consciousness, ideally first thing in the morning.</p>
            <p>No editing. No rereading. No judgement. Write whatever is in your head — worries, to-do lists, random thoughts, feelings. Bad sentences, half-formed ideas, all of it.</p>
            <p>The point isn't to write well. The point is to clear the mental clutter and see what's underneath.</p>
          </div>

          <div>
            <p className="duration-label">How long do you have?</p>
            <div className="duration-row">
              {[5, 10, 20].map(m => (
                <button key={m} className="duration-btn" onClick={() => handleStart(m)}>
                  <span className="duration-num">{m}</span>
                  <span className="duration-unit">min</span>
                </button>
              ))}
            </div>
          </div>

          {entries.length > 0 && (
            <div className="log-section">
              <h3 className="log-heading">Past sessions</h3>
              <div className="entry-log">
                {entries.map(e => (
                  <div key={e.id} className="entry-log-item entry-log-clickable" onClick={() => setViewingEntry(e)}>
                    <div className="entry-log-meta">
                      <span>{formatShortDate(e.createdAt)}</span>
                      <span>{e.wordCount} words · {e.duration} min</span>
                    </div>
                    <span className="entry-log-tap">Tap to read →</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Done
  if (phase === 'done') {
    return (
      <div className="section-view">
        <div className="editor-topbar">
          <button className="btn-ghost" onClick={onBack}>← back</button>
        </div>
        <div className="section-body">
          <div className="result-header">
            <span className="result-words">{finalWords}</span>
            <span className="result-label">words in {duration} minutes</span>
          </div>
          <div className="result-content">
            {content.split('\n').map((p, i) => p.trim() ? <p key={i}>{p}</p> : <br key={i} />)}
          </div>
          <div className="result-actions">
            <button className="btn-primary" onClick={handleSave} disabled={!content.trim()}>Save session</button>
            <button className="btn-secondary" onClick={onBack}>Discard</button>
          </div>
        </div>
      </div>
    )
  }

  // Writing
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
      <div className="editor-body">
        <textarea
          ref={textareaRef}
          className="editor-textarea"
          placeholder="Just keep writing. Don't stop, don't edit, don't look back…"
          value={content}
          onChange={e => setContent(e.target.value)}
        />
      </div>
    </div>
  )
}

// ── Writing Prompts ────────────────────────────────────────────────────

function WritingPromptsView({ onBack }) {
  const [prompt,       setPrompt]       = useState(() => randomPrompt(null))
  const [content,      setContent]      = useState('')
  const [entries,      setEntries]      = useState(() => load(KEYS.prompts))
  const [saved,        setSaved]        = useState(false)
  const [viewingEntry, setViewingEntry] = useState(null)
  const textareaRef = useRef(null)

  function handleNewPrompt() {
    setPrompt(p => randomPrompt(p))
    setContent('')
    setSaved(false)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  function handleSave() {
    if (!content.trim()) return
    const entry = {
      id: Date.now().toString(),
      prompt,
      content: content.trim(),
      createdAt: new Date().toISOString(),
    }
    const updated = [entry, ...entries]
    save(KEYS.prompts, updated)
    setEntries(updated)
    setSaved(true)
  }

  if (viewingEntry) {
    return (
      <div className="section-view">
        <div className="editor-topbar">
          <button className="btn-ghost" onClick={() => setViewingEntry(null)}>← back</button>
          <span className="entry-read-date">{formatDate(viewingEntry.createdAt)}</span>
        </div>
        <div className="section-body">
          <p className="entry-read-prompt">"{viewingEntry.prompt}"</p>
          <div className="entry-read-content">
            {viewingEntry.content.split('\n').map((p, i) => p.trim() ? <p key={i}>{p}</p> : <br key={i} />)}
          </div>
          <p className="entry-read-meta">{wordCount(viewingEntry.content)} words</p>
        </div>
      </div>
    )
  }

  return (
    <div className="section-view">
      <div className="editor-topbar">
        <button className="btn-ghost" onClick={onBack}>← back</button>
        {saved && <span className="saved-badge">Saved ✓</span>}
      </div>

      <div className="section-body">
        <div className="section-intro">
          <h2 className="section-title">Writing Prompts</h2>
          <p className="section-subtitle">Keep cycling until one lands. Then write.</p>
        </div>

        <div className="prompt-display">
          <p className="prompt-display-text">{prompt}</p>
          <button className="btn-refresh-prompt" onClick={handleNewPrompt}>
            ↻ different prompt
          </button>
        </div>

        <div className="prompt-write-area">
          <textarea
            ref={textareaRef}
            className="editor-textarea prompt-textarea"
            placeholder="Write here…"
            value={content}
            onChange={e => { setContent(e.target.value); setSaved(false) }}

          />
          <div className="prompt-write-footer">
            <span className="word-count">{wordCount(content) > 0 ? `${wordCount(content)} words` : ''}</span>
            <button className="btn-primary" onClick={handleSave} disabled={!content.trim() || saved}>
              {saved ? 'Saved ✓' : 'Save entry'}
            </button>
          </div>
        </div>

        {entries.length > 0 && (
          <div className="log-section">
            <h3 className="log-heading">Past entries</h3>
            <div className="entry-log">
              {entries.map(e => (
                <div key={e.id} className="entry-log-item entry-log-clickable" onClick={() => setViewingEntry(e)}>
                  <div className="entry-log-meta">
                    <span>{formatShortDate(e.createdAt)}</span>
                    <span>{wordCount(e.content)} words</span>
                  </div>
                  <p className="entry-log-prompt">"{e.prompt}"</p>
                  <span className="entry-log-tap">Tap to read →</span>
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
  const [allHw,        setAllHw]        = useState(() => load(KEYS.homework))
  const [viewingEntry, setViewingEntry] = useState(null)
  const todayEntry = allHw.find(e => e.createdAt.slice(0, 10) === todayISO())

  const [moment,  setMoment]  = useState('')
  const [tension, setTension] = useState('')
  const [story,   setStory]   = useState('')
  const [saved,   setSaved]   = useState(false)
  const streak = getStreak(allHw)

  function handleDayClick(dateStr) {
    const entry = allHw.find(e => e.createdAt.slice(0, 10) === dateStr)
    if (entry) setViewingEntry(entry)
  }

  function handleSave() {
    if (!moment.trim()) return
    const entry = {
      id: Date.now().toString(),
      moment:  moment.trim(),
      tension: tension.trim(),
      story:   story.trim(),
      createdAt: new Date().toISOString(),
    }
    const updated = [entry, ...allHw.filter(e => e.createdAt.slice(0, 10) !== todayISO())]
    save(KEYS.homework, updated)
    setAllHw(updated)
    setSaved(true)
  }

  const displayEntry = saved
    ? { moment, tension, story, createdAt: new Date().toISOString() }
    : todayEntry

  if (viewingEntry) {
    return (
      <div className="section-view">
        <div className="editor-topbar">
          <button className="btn-ghost" onClick={() => setViewingEntry(null)}>← back</button>
          <span className="entry-read-date">{formatDate(viewingEntry.createdAt)}</span>
        </div>
        <div className="section-body">
          <div className="hw-entry-display">
            <div className="hw-display-block">
              <span className="section-label">✦ The moment</span>
              <p className="hw-display-text">{viewingEntry.moment}</p>
            </div>
            {viewingEntry.tension && (
              <div className="hw-display-block">
                <span className="section-label">✦ What made it interesting</span>
                <p className="hw-display-text">{viewingEntry.tension}</p>
              </div>
            )}
            {viewingEntry.story && (
              <div className="hw-display-block">
                <span className="section-label">✦ The story</span>
                <p className="hw-display-text hw-story-text">{viewingEntry.story}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="section-view">
      <div className="editor-topbar">
        <button className="btn-ghost" onClick={onBack}>← back</button>
        {streak > 0 && <span className="streak-badge">✦ {streak} day streak</span>}
      </div>

      <div className="section-body">
        <div className="section-intro">
          <h2 className="section-title">Homework for Life</h2>
          <p className="section-subtitle">Every ordinary day has a story in it. This is how you find it.</p>
        </div>

        {displayEntry ? (
          <div className="hw-entry-display">
            <div className="hw-display-block">
              <span className="section-label">✦ The moment</span>
              <p className="hw-display-text">{displayEntry.moment}</p>
            </div>
            {displayEntry.tension && (
              <div className="hw-display-block">
                <span className="section-label">✦ What made it interesting</span>
                <p className="hw-display-text">{displayEntry.tension}</p>
              </div>
            )}
            {displayEntry.story && (
              <div className="hw-display-block">
                <span className="section-label">✦ The story</span>
                <p className="hw-display-text hw-story-text">{displayEntry.story}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="hw-form">

            <div className="hw-step">
              <label className="hw-question">What happened today?</label>
              <p className="hw-hint">Pick any moment — it doesn't have to be dramatic. A conversation, something you noticed, a feeling that came out of nowhere.</p>
              <textarea
                className="hw-textarea"
                placeholder="Describe the moment…"
                value={moment}
                onChange={e => setMoment(e.target.value)}
    
              />
            </div>

            {moment.trim().length > 20 && (
              <div className="hw-step">
                <label className="hw-question">What made it interesting?</label>
                <p className="hw-hint">Was there a feeling, a tension, something unexpected? What was at stake, even a little?</p>
                <textarea
                  className="hw-textarea"
                  placeholder="What was underneath it…"
                  value={tension}
                  onChange={e => setTension(e.target.value)}
                />
              </div>
            )}

            {tension.trim().length > 10 && (
              <div className="hw-step">
                <label className="hw-question">Now tell it as a story.</label>
                <p className="hw-hint">Set the scene. Put the reader there with you. Write it like you'd tell it to a friend — with a beginning, a middle, and what it meant.</p>
                <textarea
                  className="hw-textarea hw-textarea-tall"
                  placeholder="Start with where you were…"
                  value={story}
                  onChange={e => setStory(e.target.value)}
                />
              </div>
            )}

            <button className="btn-primary" onClick={handleSave} disabled={!moment.trim()}>
              Save today's entry
            </button>

          </div>
        )}

        <CalendarView entries={allHw} onDayClick={handleDayClick} />
      </div>
    </div>
  )
}

// ── Backup ─────────────────────────────────────────────────────────────

function BackupView({ onBack }) {
  const importRef = useRef(null)
  const [msg, setMsg] = useState('')

  function handleImport(e) {
    const file = e.target.files[0]
    if (!file) return
    importBackup(file, added => {
      setMsg(added > 0
        ? `Imported ${added} new ${added === 1 ? 'entry' : 'entries'}.`
        : 'No new entries — everything was already here.')
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
          <p className="section-subtitle">Export all your entries to a file. Import to restore them.</p>
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
      {view === 'home'     && <HomeView             nav={setView} />}
      {view === 'pages'    && <MorningPagesView      onBack={() => setView('home')} />}
      {view === 'prompts'  && <WritingPromptsView    onBack={() => setView('home')} />}
      {view === 'homework' && <HomeworkView          onBack={() => setView('home')} />}
      {view === 'backup'   && <BackupView            onBack={() => setView('home')} />}
    </>
  )
}
