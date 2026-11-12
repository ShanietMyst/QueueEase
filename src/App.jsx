import { useCallback, useEffect, useState } from 'react'
import './App.css'

const LOCAL_API_URL = 'http://localhost/queueease/backend/api.php'
const API_URL = import.meta.env.VITE_API_URL?.trim() || (import.meta.env.DEV ? LOCAL_API_URL : '')
const API_UNAVAILABLE_MESSAGE = 'Sign-in and account creation will be available in a future update.'

const icons = {
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  ticket: <><path d="M2 9a3 3 0 0 0 0 6v4h20v-4a3 3 0 0 1 0-6V5H2z" /><path d="M13 5v2m0 4v2m0 4v2" /></>,
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v12h14V9M9 21v-7h6v7" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11" /><path d="m9 12 2 2 4-4" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  close: <><path d="m18 6-12 12M6 6l12 12" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>,
  spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2-5.8L4 11l6-2.2z" /><path d="m19 14 1.2 2.8L23 18l-2.8 1.2L19 22l-1.2-2.8L15 18l2.8-1.2z" /></>,
  pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
}

function Icon({ name, size = 20, className = '' }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>
}

function localDateString(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

async function request(action, { method = 'GET', body, params = {} } = {}) {
  if (!API_URL) throw new Error(API_UNAVAILABLE_MESSAGE)
  const query = new URLSearchParams({ action, ...params })
  const response = await fetch(`${API_URL}?${query}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.')
  return result
}

function Brand({ light = false }) {
  return <a className={`brand ${light ? 'brand-light' : ''}`} href="#home" aria-label="QueueEase home"><span className="brand-mark"><Icon name="ticket" size={20} /></span><span>queue<span className="brand-accent">ease</span></span></a>
}

function Landing({ onAuth, onBook, onMonitor }) {
  return <div className="landing" id="home">
    <header className="landing-header">
      <Brand />
      <nav className="landing-nav" aria-label="Main navigation"><a href="#home">Home</a><a href="#about">About</a><a href="#features">Features</a></nav>
      <div className="landing-actions"><button className="button button-quiet" onClick={() => onAuth('login')}>Log in</button><button className="button button-primary button-small" onClick={() => onAuth('register')}>Create account <Icon name="arrow" size={16} /></button></div>
    </header>
    <main>
      <section className="hero-section">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> A better way to wait</div>
          <h1>Appointments made easier.<br /><span>Waiting made simpler.</span></h1>
          <p>Manage your appointments and monitor your queue conveniently through one simple online platform.</p>
          <div className="hero-actions"><button className="button button-primary" onClick={onBook}>Book an appointment <Icon name="arrow" size={18} /></button><a className="button button-outline" href="#about">Learn more</a></div>
          <div className="hero-proof"><div className="proof-avatars"><span>J</span><span>M</span><span>A</span><span><Icon name="users" size={15} /></span></div><p><strong>A simpler visit starts here.</strong><br />Book ahead. Know when it’s your turn.</p></div>
        </div>
        <div className="hero-art" aria-label="Queue status preview">
          <div className="art-glow" />
          <div className="floating-chip chip-one"><span className="chip-check"><Icon name="check" size={15} /></span><span><strong>Appointment confirmed</strong><small>You’re all set for your visit</small></span></div>
          <div className="queue-preview">
            <div className="queue-preview-top"><div><span className="mini-label">LIVE QUEUE</span><h3>Your place, at a glance.</h3></div><span className="live-dot" /></div>
            <div className="queue-number-card"><span>Your queue number</span><strong>Q— — —</strong><small>Get your number when confirmed</small></div>
            <div className="queue-progress"><div className="progress-row"><span>Queue progress</span><span>Ready when you are</span></div><div className="progress-track"><span /></div></div>
            <div className="queue-preview-footer"><span><Icon name="clock" size={16} /> Real-time updates</span><span><Icon name="shield" size={16} /> Private & secure</span></div>
          </div>
          <div className="floating-chip chip-two"><span className="chip-blue"><Icon name="clock" size={17} /></span><span><strong>Less time waiting</strong><small>Keep your day moving</small></span></div>
          <div className="art-decoration art-dot-grid" /><div className="art-decoration art-circle" />
        </div>
      </section>
      <section className="trust-row"><span>MADE FOR YOUR EVERYDAY VISITS</span><div><span><Icon name="calendar" size={17} /> Easy scheduling</span><span><Icon name="ticket" size={17} /> Clear queue numbers</span><span><Icon name="bell" size={17} /> Timely updates</span></div></section>
      <section className="how-section" id="about">
        <div className="section-heading"><span className="mini-label">HOW IT WORKS</span><h2>A smoother visit in three simple steps.</h2><p>No waiting around wondering what comes next.</p></div>
        <div className="steps-grid"><article className="step-card"><span className="step-number">01</span><div className="step-icon"><Icon name="calendar" size={22} /></div><h3>Choose a time</h3><p>Browse available dates and pick the appointment slot that works for you.</p></article><article className="step-card"><span className="step-number">02</span><div className="step-icon"><Icon name="ticket" size={22} /></div><h3>Get your queue number</h3><p>Once confirmed, your unique queue number is ready in your account.</p></article><article className="step-card"><span className="step-number">03</span><div className="step-icon"><Icon name="bell" size={22} /></div><h3>Stay in the know</h3><p>Check the live queue and see when it’s getting close to your turn.</p></article></div>
      </section>
      <section className="features-band" id="features"><div><span className="mini-label">A LITTLE MORE PEACE OF MIND</span><h2>Your time matters.<br />We help you make the most of it.</h2></div><div className="feature-points"><p><Icon name="check" size={18} /> Book whenever it’s convenient</p><p><Icon name="check" size={18} /> Keep all your visits in one place</p><p><Icon name="check" size={18} /> Follow queue progress without refreshing</p><button className="button button-primary" onClick={onBook}>Get started <Icon name="arrow" size={17} /></button></div></section>
    </main>
    <footer className="landing-footer"><Brand /><span>Making every visit a little easier.</span><button className="text-button" onClick={onMonitor}>View public queue <Icon name="arrow" size={15} /></button></footer>
  </div>
}

function AuthDialog({ mode, onClose, onSubmit, busy, error, onMode, apiAvailable }) {
  const [values, setValues] = useState({ name: '', email: '', password: '', confirm: '' })
  const register = mode === 'register'
  function submit(event) {
    event.preventDefault()
    if (register && values.password !== values.confirm) return
    onSubmit(values)
  }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="modal-close" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      <Brand /><span className="mini-label auth-kicker">{register ? 'CREATE YOUR ACCOUNT' : 'WELCOME BACK'}</span><h2 id="auth-title">{register ? 'Your next visit, made easier.' : 'Good to see you again.'}</h2><p className="auth-subtitle">{register ? 'Sign up to book appointments and follow your queue.' : 'Log in to manage your appointments and queue.'}</p>
      {apiAvailable ? <>
        <form className="form-stack" onSubmit={submit}>
          {register && <label>Full name<input required minLength="2" autoComplete="name" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} placeholder="e.g. Jamie Lee" /></label>}
          <label>Email address<input required type="email" autoComplete="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} placeholder="you@example.com" /></label>
          <label>Password<input required minLength="8" maxLength="72" type="password" autoComplete={register ? 'new-password' : 'current-password'} value={values.password} onChange={(e) => setValues({ ...values, password: e.target.value })} placeholder="At least 8 characters" /></label>
          {register && <label>Confirm password<input required minLength="8" maxLength="72" type="password" autoComplete="new-password" value={values.confirm} onChange={(e) => setValues({ ...values, confirm: e.target.value })} placeholder="Enter your password again" /></label>}
          {register && values.confirm && values.password !== values.confirm && <span className="field-error">Passwords don’t match.</span>}
          {error && <div className="alert alert-error">{error}</div>}
          <button className="button button-primary button-full" disabled={busy || (register && values.password !== values.confirm)}>{busy ? 'Please wait…' : register ? 'Create account' : 'Log in'} <Icon name="arrow" size={17} /></button>
        </form>
        <p className="auth-switch">{register ? 'Already have an account?' : 'New to QueueEase?'} <button className="text-button" onClick={() => onMode(register ? 'login' : 'register')}>{register ? 'Log in' : 'Create an account'}</button></p>
      </> : <p className="preview-notice" role="status">{API_UNAVAILABLE_MESSAGE}</p>}
      <p className="auth-privacy"><Icon name="shield" size={15} /> Your personal information stays private.</p>
    </section>
  </div>
}

function Status({ value }) {
  const className = (value || 'Pending').toLowerCase().replaceAll(' ', '-')
  return <span className={`status status-${className}`}><span />{value || 'Pending'}</span>
}

function Dashboard({ user, stats, appointments, onBook, onNavigate, loading, error }) {
  const upcoming = appointments.filter((item) => ['Pending', 'Confirmed'].includes(item.status)).slice(0, 3)
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  return <div className="app-content">{error && <div className="alert alert-error page-alert">{error}</div>}
    <div className="page-heading"><div><span className="mini-label">{today.toUpperCase()}</span><h1>Welcome back, {user.name.split(' ')[0]} <span className="wave">✦</span></h1><p>Here’s what’s happening with your appointments.</p></div><button className="button button-primary" onClick={onBook}><Icon name="plus" size={18} /> Book appointment</button></div>
    <div className="stat-grid">
      <div className="stat-card"><div className="stat-icon stat-blue"><Icon name="calendar" /></div><span>Total appointments</span><strong>{loading ? '—' : stats.total_appointments ?? 0}</strong><small>Across your account</small></div>
      <div className="stat-card"><div className="stat-icon stat-green"><Icon name="check" /></div><span>Upcoming</span><strong>{loading ? '—' : stats.upcoming_appointments ?? 0}</strong><small>Confirmed & pending</small></div>
      <div className="stat-card"><div className="stat-icon stat-purple"><Icon name="ticket" /></div><span>Your queue number</span><strong className="stat-queue">{stats.queue_number || '—'}</strong><small>{stats.queue_status ? <Status value={stats.queue_status} /> : 'No active queue'}</small></div>
      <div className="stat-card"><div className="stat-icon stat-amber"><Icon name="clock" /></div><span>Currently serving</span><strong className="stat-queue">{stats.currently_serving || '—'}</strong><small>{stats.people_ahead != null ? `${stats.people_ahead} people ahead of you` : 'Queue updates live'}</small></div>
    </div>
    <div className="dashboard-grid">
      <section className="panel upcoming-panel"><div className="panel-heading"><div><h2>Upcoming appointments</h2><p>Your next visits at a glance.</p></div><button className="text-button" onClick={() => onNavigate('appointments')}>View all <Icon name="arrow" size={15} /></button></div>
        {loading ? <div className="empty-state"><span className="loader" /> Loading appointments…</div> : upcoming.length ? <div className="appointment-list">{upcoming.map((appointment) => <div className="appointment-row" key={appointment.id}><div className="appointment-date"><strong>{new Date(`${appointment.appointment_date}T12:00:00`).toLocaleDateString('en-US', { day: '2-digit' })}</strong><span>{new Date(`${appointment.appointment_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short' })}</span></div><div className="appointment-info"><strong>{appointment.purpose}</strong><span><Icon name="clock" size={14} /> {appointment.time_slot} <span className="bullet">·</span> {appointment.queue_number || 'Queue number after confirmation'}</span></div><Status value={appointment.status} /></div>)}</div> : <div className="empty-state"><div className="empty-icon"><Icon name="calendar" size={23} /></div><strong>No upcoming appointments</strong><p>When you book a visit, it’ll show up here.</p><button className="button button-outline button-small" onClick={onBook}>Book a visit <Icon name="arrow" size={15} /></button></div>}
      </section>
      <section className="queue-card"><div className="queue-card-header"><span className="queue-live"><i /> LIVE QUEUE</span><button className="icon-button light-icon" onClick={() => onNavigate('queue')} aria-label="Open queue monitor"><Icon name="arrow" size={18} /></button></div><h2>Know where you stand.</h2><p>Follow the queue as it moves. No need to keep checking in person.</p><div className="queue-card-current"><span>NOW SERVING</span><strong>{stats.currently_serving || '—'}</strong></div><div className="queue-card-bottom"><span>{stats.queue_number ? `Your number · ${stats.queue_number}` : 'Your queue number appears after confirmation'}</span><button onClick={() => onNavigate('queue')}>Monitor queue <Icon name="arrow" size={15} /></button></div></section>
    </div>
  </div>
}

function Booking({ onSubmit, busy, error, success, onNavigate }) {
  const [slots, setSlots] = useState([])
  const [scheduleError, setScheduleError] = useState('')
  const [slotsDate, setSlotsDate] = useState('')
  const [date, setDate] = useState('')
  const [form, setForm] = useState({ full_name: '', contact_number: '', email: '', purpose: '', time_slot: '', notes: '' })
  useEffect(() => {
    let active = true
    if (!date) return () => { active = false }
    request('slots', { params: { date } }).then((result) => { if (active) { setSlots(result.slots || []); setSlotsDate(date); setScheduleError('') } }).catch((err) => { if (active) { setSlots([]); setSlotsDate(date); setScheduleError(err.message) } })
    return () => { active = false }
  }, [date])
  const minDate = localDateString()
  return <div className="app-content narrow-content"><div className="back-link" role="button" tabIndex="0" onClick={() => onNavigate('dashboard')}><span>←</span> Back to dashboard</div><div className="page-heading"><div><span className="mini-label">MAKE IT OFFICIAL</span><h1>Book an appointment</h1><p>Choose your preferred date and time. We’ll take it from there.</p></div></div>
    {success ? <section className="success-card"><span className="success-check"><Icon name="check" size={27} /></span><span className="mini-label">REQUEST RECEIVED</span><h2>You’re on your way.</h2><p>Your appointment request has been submitted. We’ll let you know when it’s confirmed.</p><button className="button button-primary" onClick={() => onNavigate('appointments')}>View my appointments <Icon name="arrow" size={16} /></button></section> :
      <form className="panel booking-form" onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, appointment_date: date }) }}>
        <div className="form-section-title"><span>01</span><div><h2>Your details</h2><p>So we know who to expect.</p></div></div>
        <div className="form-grid"><label>Full name<input required minLength="2" maxLength="120" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Your full name" /></label><label>Contact number<input required type="tel" maxLength="30" value={form.contact_number} onChange={(e) => setForm({ ...form, contact_number: e.target.value })} placeholder="+1 (555) 000-0000" /></label><label className="form-wide">Email address<input required type="email" maxLength="190" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></label></div>
        <div className="form-section-title form-section-spaced"><span>02</span><div><h2>Pick a time that works</h2><p>Slots are subject to daily availability.</p></div></div>
        <div className="form-grid"><label>Appointment purpose<input required minLength="2" maxLength="160" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="What can we help you with?" /></label><label>Preferred date<input required type="date" min={minDate} value={date} onChange={(e) => { setDate(e.target.value); setSlots([]); setSlotsDate(''); setScheduleError(''); setForm({ ...form, time_slot: '' }) }} /></label><label className="form-wide">Available time slot<select required disabled={!date || !slots.length || slotsDate !== date} value={form.time_slot} onChange={(e) => setForm({ ...form, time_slot: e.target.value })}><option value="">{date ? 'Choose an available slot' : 'Select a date first'}</option>{slots.map((slot) => <option value={slot.time_slot} key={slot.time_slot}>{slot.time_slot} · {slot.remaining} spots left</option>)}</select>{scheduleError && <span className="field-error">{scheduleError}</span>}{date && slotsDate === date && !scheduleError && !slots.length && <span className="field-help">No available time slots on this date.</span>}</label><label className="form-wide">Additional notes <span className="optional">(optional)</span><textarea rows="3" maxLength="1000" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything else we should know?" /></label></div>
        {error && <div className="alert alert-error">{error}</div>}<div className="form-footer"><span><Icon name="shield" size={16} /> Your details are kept private.</span><button className="button button-primary" disabled={busy || !slots.length}>{busy ? 'Submitting…' : 'Request appointment'} <Icon name="arrow" size={17} /></button></div>
      </form>}
  </div>
}

function Appointments({ appointments, onCancel, busyId, onNavigate, loading, error }) {
  return <div className="app-content"><div className="page-heading"><div><span className="mini-label">YOUR VISITS, ALL TOGETHER</span><h1>My appointments</h1><p>Review your bookings and keep track of what’s next.</p></div><button className="button button-primary" onClick={() => onNavigate('book')}><Icon name="plus" size={18} /> Book appointment</button></div><section className="panel appointments-panel"><div className="panel-heading"><div><h2>Appointment history</h2><p>{appointments.length} {appointments.length === 1 ? 'appointment' : 'appointments'}</p></div></div>
    {error && <div className="alert alert-error">{error}</div>}
    {loading ? <div className="empty-state"><span className="loader" /> Loading appointments…</div> : appointments.length ? <div className="table-scroll"><table><thead><tr><th>APPOINTMENT</th><th>DATE & TIME</th><th>QUEUE NUMBER</th><th>STATUS</th><th /></tr></thead><tbody>{appointments.map((item) => <tr key={item.id}><td><strong>{item.purpose}</strong><small>{item.full_name}</small></td><td>{new Date(`${item.appointment_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}<small>{item.time_slot}</small></td><td>{item.queue_number || '—'}</td><td><Status value={item.status} /></td><td>{['Pending', 'Confirmed'].includes(item.status) && <button className="cancel-button" disabled={busyId === item.id} onClick={() => onCancel(item.id)}>{busyId === item.id ? 'Cancelling…' : 'Cancel'}</button>}</td></tr>)}</tbody></table></div> : <div className="empty-state"><div className="empty-icon"><Icon name="calendar" size={23} /></div><strong>No appointments yet</strong><p>Your appointment history will appear here.</p><button className="button button-outline button-small" onClick={() => onNavigate('book')}>Book an appointment <Icon name="arrow" size={15} /></button></div>}</section></div>
}

function QueueMonitor({ queue, userQueue, loading, onNavigate, error }) {
  return <div className="app-content">{error && <div className="alert alert-error page-alert">{error}</div>}<div className="page-heading"><div><span className="mini-label">THE LINE, WITHOUT THE GUESSING</span><h1>Queue monitor</h1><p>Live queue information. Refreshed automatically every few seconds.</p></div><button className="button button-outline" onClick={() => onNavigate('dashboard')}>Back to dashboard</button></div>
    <div className="monitor-grid"><section className="serving-card"><span className="queue-live"><i /> NOW SERVING</span><strong>{queue.currently_serving || '—'}</strong><span>Updated {queue.updated_at ? new Date(queue.updated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'just now'}</span></section><section className="panel my-queue-card"><span className="mini-label">YOUR PLACE IN LINE</span>{userQueue?.queue_number ? <><strong>{userQueue.queue_number}</strong><Status value={userQueue.status} /><p>{userQueue.people_ahead === 0 ? 'You’re next in line!' : `${userQueue.people_ahead} ${userQueue.people_ahead === 1 ? 'person' : 'people'} ahead of you`}</p></> : <><div className="empty-icon"><Icon name="ticket" size={23} /></div><h2>No active queue number</h2><p>Your number will appear here once your appointment is confirmed.</p><button className="text-button" onClick={() => onNavigate('appointments')}>View appointments <Icon name="arrow" size={15} /></button></>}</section></div>
    <section className="panel waiting-panel"><div className="panel-heading"><div><h2>Waiting queue</h2><p>Queue numbers only — no personal details are shown.</p></div><span className="waiting-count">{queue.waiting?.length || 0} waiting</span></div>{loading ? <div className="empty-state"><span className="loader" /> Updating queue…</div> : queue.waiting?.length ? <div className="waiting-list">{queue.waiting.map((item, index) => <div className={`waiting-item ${userQueue?.queue_number === item.queue_number ? 'waiting-you' : ''}`} key={item.queue_number}><span className="waiting-position">{String(index + 1).padStart(2, '0')}</span><strong>{item.queue_number}</strong>{userQueue?.queue_number === item.queue_number && <span className="you-tag">YOU</span>}</div>)}</div> : <div className="empty-state queue-empty"><div className="empty-icon"><Icon name="users" size={23} /></div><strong>No one waiting right now</strong><p>The waiting queue is currently clear.</p></div>}</section>
  </div>
}

function AdminPanel({ data, onAction, onNavigate, busy, error, showBack = true }) {
  const [tab, setTab] = useState('appointments')
  const pending = data.appointments.filter((item) => item.status === 'Pending')
  return <div className="app-content"><div className="page-heading"><div><span className="mini-label">ADMINISTRATION</span><h1>Queue operations</h1><p>Manage today’s appointments and keep the queue moving.</p></div>{showBack && <button className="button button-outline" onClick={() => onNavigate('dashboard')}>Back to overview</button>}</div>
    {error && <div className="alert alert-error">{error}</div>}
    <div className="stat-grid admin-stats">{[['Total users', data.stats.total_users], ['Appointments', data.stats.total_appointments], ['Pending', data.stats.pending_appointments], ['Confirmed', data.stats.confirmed_appointments], ['Waiting', data.stats.waiting], ['Completed', data.stats.completed]].map(([label, count], i) => <div className="stat-card" key={label}><div className={`stat-icon ${['stat-blue', 'stat-purple', 'stat-amber', 'stat-green', 'stat-blue', 'stat-green'][i]}`}><Icon name={['users', 'calendar', 'clock', 'check', 'ticket', 'check'][i]} /></div><span>{label}</span><strong>{count ?? '—'}</strong></div>)}</div>
    <section className="panel admin-panel"><div className="panel-heading admin-tabs"><div><h2>Manage your service</h2><p>Review requests and operate the live queue.</p></div><div className="tab-buttons"><button className={tab === 'appointments' ? 'active' : ''} onClick={() => setTab('appointments')}>Appointments {pending.length > 0 && <span>{pending.length}</span>}</button><button className={tab === 'queue' ? 'active' : ''} onClick={() => setTab('queue')}>Queue</button><button className={tab === 'schedules' ? 'active' : ''} onClick={() => setTab('schedules')}>Schedules</button><button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Users</button><button className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>Reports</button></div></div>
      {tab === 'appointments' && (data.appointments.length ? <div className="table-scroll"><table><thead><tr><th>VISITOR</th><th>APPOINTMENT</th><th>DATE & TIME</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{data.appointments.map((item) => <tr key={item.id}><td><strong>{item.full_name}</strong><small>{item.email} · {item.contact_number}</small></td><td>{item.purpose}</td><td>{item.appointment_date}<small>{item.time_slot}</small></td><td><Status value={item.status} /></td><td>{item.status === 'Pending' && <div className="row-actions"><button disabled={busy} className="approve-button" onClick={() => onAction('decision', { id: item.id, status: 'Confirmed' })}>Approve</button><button disabled={busy} className="cancel-button" onClick={() => onAction('decision', { id: item.id, status: 'Rejected' })}>Reject</button></div>}{item.queue_number && <span className="queue-small">{item.queue_number}</span>}</td></tr>)}</tbody></table></div> : <div className="empty-state"><strong>No appointments to review</strong><p>New appointment requests will appear here.</p></div>)}
      {tab === 'queue' && <div className="admin-queue"><div><span className="mini-label">CURRENTLY SERVING</span><strong>{data.queue.currently_serving || '—'}</strong></div><div className="admin-queue-actions"><button className="button button-primary" disabled={busy || !data.queue.waiting?.length} onClick={() => onAction('next', {})}>Call next <Icon name="arrow" size={17} /></button>{data.queue.currently_serving && <button className="button button-outline button-small" disabled={busy} onClick={() => onAction('skip', {})}>Skip current</button>}</div>{data.queue.records?.length ? data.queue.records.map((item) => <div className="admin-queue-row" key={item.id}><span>{item.queue_number}</span><span>{item.full_name} · {item.purpose}</span><Status value={item.status} /><div className="row-actions">{item.status === 'Waiting' && <><button disabled={busy} className="approve-button" onClick={() => onAction('queue_status', { id: item.id, status: 'Serving' })}>Call</button><button disabled={busy} className="cancel-button" onClick={() => onAction('queue_status', { id: item.id, status: 'Cancelled' })}>Cancel</button></>}{item.status === 'Serving' && <><button disabled={busy} className="approve-button" onClick={() => onAction('queue_status', { id: item.id, status: 'Completed' })}>Complete</button><button disabled={busy} className="cancel-button" onClick={() => onAction('queue_status', { id: item.id, status: 'Skipped' })}>Skip</button></>}</div></div>) : <p className="field-help">There are no queue records for today.</p>}</div>}
      {tab === 'schedules' && <ScheduleManager schedules={data.schedules} onSave={(payload) => onAction('schedule', payload)} busy={busy} />}
      {tab === 'users' && (data.users?.length ? <div className="table-scroll"><table><thead><tr><th>USER</th><th>JOINED</th><th>APPOINTMENTS</th><th>ACCOUNT</th><th /></tr></thead><tbody>{data.users.map((item) => <tr key={item.id}><td><strong>{item.full_name}</strong><small>{item.email}</small></td><td>{new Date(item.created_at).toLocaleDateString()}</td><td>{item.appointment_count}</td><td><Status value={Number(item.is_active) ? 'Active' : 'Inactive'} /></td><td><button className={Number(item.is_active) ? 'cancel-button' : 'approve-button'} disabled={busy} onClick={() => onAction('user', { id: item.id, is_active: Number(item.is_active) ? 0 : 1 })}>{Number(item.is_active) ? 'Deactivate' : 'Reactivate'}</button></td></tr>)}</tbody></table></div> : <div className="empty-state"><strong>No user accounts yet</strong></div>)}
      {tab === 'reports' && <div className="report-panel"><p>Appointment totals from your database.</p><div><span>This month</span><strong>{data.reports?.monthly ?? 0}</strong></div><div><span>Today</span><strong>{data.reports?.daily ?? 0}</strong></div><button className="button button-outline button-small" onClick={() => window.print()}>Print this report</button></div>}
    </section>
  </div>
}

function ScheduleManager({ schedules, onSave, busy }) {
  const [schedule, setSchedule] = useState({ service_date: '', time_slot: '', capacity: '10' })
  return <div className="schedule-area"><form className="schedule-form" onSubmit={(e) => { e.preventDefault(); onSave({ ...schedule, capacity: Number(schedule.capacity) }) }}><label>Date<input type="date" min={localDateString()} required value={schedule.service_date} onChange={(e) => setSchedule({ ...schedule, service_date: e.target.value })} /></label><label>Time slot<input required maxLength="40" placeholder="e.g. 9:00 AM" value={schedule.time_slot} onChange={(e) => setSchedule({ ...schedule, time_slot: e.target.value })} /></label><label>Daily capacity<input required min="1" max="500" type="number" value={schedule.capacity} onChange={(e) => setSchedule({ ...schedule, capacity: e.target.value })} /></label><button className="button button-primary button-small" disabled={busy}>Add schedule</button></form>{schedules.length ? schedules.map((item) => <div className="schedule-row" key={item.id}><span><Icon name="calendar" size={17} /> {item.service_date}</span><span><Icon name="clock" size={17} /> {item.time_slot}</span><span>{item.booked}/{item.capacity} booked</span></div>) : <div className="empty-state"><strong>No schedules set up yet</strong><p>Add a date and time slot to start accepting appointments.</p></div>}</div>
}

function AccountSettings({ user, onProfile, onPassword, busy, error, success }) {
  const [profile, setProfile] = useState({ full_name: user.name, contact_number: user.contact_number || '' })
  const [password, setPassword] = useState({ current_password: '', new_password: '', confirm: '' })
  return <div className="app-content narrow-content"><div className="page-heading"><div><span className="mini-label">YOUR ACCOUNT</span><h1>Account settings</h1><p>Update your contact details and keep your account secure.</p></div></div>
    {user.role === 'user' && <section className="panel settings-panel"><div className="panel-heading"><div><h2>Personal information</h2><p>These details are associated with your account.</p></div></div><form className="settings-form" onSubmit={(e) => { e.preventDefault(); onProfile(profile) }}><label>Full name<input required minLength="2" maxLength="120" value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} /></label><label>Email address<input disabled value={user.email} /></label><label>Contact number<input maxLength="30" value={profile.contact_number} onChange={(e) => setProfile({ ...profile, contact_number: e.target.value })} placeholder="Add a contact number" /></label>{error && <div className="alert alert-error">{error}</div>}{success === 'profile' && <div className="success-inline">Your profile has been updated.</div>}<button className="button button-primary button-small" disabled={busy}>Save profile</button></form></section>}
    <section className={`panel settings-panel ${user.role === 'user' ? 'password-panel' : ''}`}><div className="panel-heading"><div><h2>Change password</h2><p>Choose a password with at least 8 characters.</p></div></div><form className="settings-form" onSubmit={(e) => { e.preventDefault(); onPassword(password) }}><label>Current password<input required type="password" autoComplete="current-password" value={password.current_password} onChange={(e) => setPassword({ ...password, current_password: e.target.value })} /></label><label>New password<input required minLength="8" maxLength="72" type="password" autoComplete="new-password" value={password.new_password} onChange={(e) => setPassword({ ...password, new_password: e.target.value })} /></label><label>Confirm new password<input required minLength="8" maxLength="72" type="password" autoComplete="new-password" value={password.confirm} onChange={(e) => setPassword({ ...password, confirm: e.target.value })} /></label>{password.confirm && password.new_password !== password.confirm && <span className="field-error">Passwords don’t match.</span>}{error && <div className="alert alert-error">{error}</div>}{success === 'password' && <div className="success-inline">Password changed successfully.</div>}<button className="button button-primary button-small" disabled={busy || password.new_password !== password.confirm}>Update password</button></form></section>
  </div>
}

function DashboardShell({ user, page, setPage, onLogout, children }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const nav = user.role === 'admin'
    ? [['dashboard', 'Overview', 'home'], ['queue', 'Queue monitor', 'ticket'], ['settings', 'Account settings', 'shield']]
    : [['dashboard', 'Overview', 'home'], ['appointments', 'My appointments', 'calendar'], ['book', 'Book a visit', 'plus'], ['queue', 'Queue monitor', 'ticket'], ['settings', 'Account settings', 'shield']]
  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}><div className="sidebar-brand"><Brand /></div><span className="sidebar-label">YOUR SPACE</span><nav>{nav.map(([key, title, icon]) => <button key={key} className={`side-link ${page === key ? 'side-link-active' : ''}`} onClick={() => { setPage(key); setMobileOpen(false) }}><Icon name={icon} size={19} />{title}{key === 'queue' && <span className="side-live" />}</button>)}{user.role === 'admin' && <><span className="sidebar-label admin-nav-label">MANAGEMENT</span><button className={`side-link ${page === 'admin' ? 'side-link-active' : ''}`} onClick={() => { setPage('admin'); setMobileOpen(false) }}><Icon name="shield" size={19} />Admin operations</button></>}</nav><div className="sidebar-bottom">{user.role === 'user' && <div className="sidebar-help"><div className="help-mark"><Icon name="spark" size={17} /></div><strong>Here for your next visit</strong><p>Book ahead and skip the uncertainty.</p><button onClick={() => setPage('book')}>Make an appointment <Icon name="arrow" size={14} /></button></div>}<div className="profile-row"><span className="avatar">{user.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><span className="profile-name"><strong>{user.name}</strong><small>{user.role === 'admin' ? 'Administrator' : 'QueueEase member'}</small></span><button className="icon-button logout-button" onClick={onLogout} aria-label="Log out"><Icon name="logout" size={18} /></button></div></div></aside>
    {mobileOpen && <button className="mobile-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close menu" />}
    <div className="app-main"><header className="app-topbar"><button className="mobile-menu icon-button" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Open navigation"><Icon name="menu" /></button><div className="breadcrumb"><span>QueueEase</span><span>/</span><strong>{page === 'admin' ? 'Admin operations' : page === 'book' ? 'Book an appointment' : page === 'queue' ? 'Queue monitor' : page === 'appointments' ? 'My appointments' : 'Overview'}</strong></div><div className="topbar-right"><button className="topbar-queue" onClick={() => setPage('queue')}><span className="live-dot" /> Queue status</button><span className="topbar-avatar">{user.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span></div></header><main>{children}</main><footer className="app-footer"><span>© {new Date().getFullYear()} QueueEase</span><span>Appointments made a little easier.</span></footer></div>
  </div>
}

function App() {
  const [user, setUser] = useState(null)
  const [page, setPage] = useState('dashboard')
  const [authMode, setAuthMode] = useState('')
  const [authError, setAuthError] = useState('')
  const [busy, setBusy] = useState(false)
  const [appointments, setAppointments] = useState([])
  const [stats, setStats] = useState({})
  const [queue, setQueue] = useState({ waiting: [] })
  const [userQueue, setUserQueue] = useState(null)
  const [adminData, setAdminData] = useState({ stats: {}, appointments: [], queue: { waiting: [] }, schedules: [] })
  const [loading, setLoading] = useState(true)
  const [authReady, setAuthReady] = useState(false)
  const [queueLoading, setQueueLoading] = useState(true)
  const [queueLoaded, setQueueLoaded] = useState(false)
  const [pageError, setPageError] = useState('')
  const [bookError, setBookError] = useState('')
  const [bookSuccess, setBookSuccess] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState('')

  const loadUserData = useCallback(async () => {
    if (!user || user.role === 'admin') {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [appointmentResult, statsResult] = await Promise.all([request('appointments'), request('stats')])
      setAppointments(appointmentResult.appointments || [])
      setStats(statsResult)
      setPageError('')
    } catch (error) { setPageError(error.message) } finally { setLoading(false) }
  }, [user])
  const loadQueue = useCallback(async () => {
    if (!queueLoaded) setQueueLoading(true)
    try {
      const result = await request('queue')
      setQueue(result)
      setUserQueue(result.your_queue || null)
      setPageError('')
    } catch (error) { setPageError(error.message) } finally { setQueueLoading(false); setQueueLoaded(true) }
  }, [queueLoaded])
  const loadAdminData = useCallback(async () => {
    if (!user || user.role !== 'admin') return
    setLoading(true)
    try {
      const [result, userResult] = await Promise.all([request('admin_dashboard'), request('admin_users')])
      setAdminData({ stats: result.stats || {}, appointments: result.appointments || [], queue: result.queue || { waiting: [] }, schedules: result.schedules || [], reports: result.reports || {}, users: userResult.users || [] })
      setPageError('')
    } catch (error) { setPageError(error.message) } finally { setLoading(false) }
  }, [user])

  useEffect(() => {
    let active = true
    request('me')
      .then((result) => {
        if (active && result.user) {
          setUser(result.user)
          if (result.user.role === 'admin') setPage('admin')
        }
      })
      .catch((error) => { if (active) setPageError(error.message) })
      .finally(() => { if (active) setAuthReady(true) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadUserData() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadUserData])
  useEffect(() => {
    const initial = window.setTimeout(() => { void loadQueue() }, 0)
    const timer = window.setInterval(loadQueue, 10000)
    return () => { window.clearTimeout(initial); window.clearInterval(timer) }
  }, [loadQueue])
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadAdminData() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadAdminData])
  useEffect(() => { if (!toast) return undefined; const timer = window.setTimeout(() => setToast(''), 3500); return () => window.clearTimeout(timer) }, [toast])

  async function submitAuth(values) {
    setBusy(true); setAuthError('')
    try {
      const result = await request(authMode, { method: 'POST', body: values })
      setUser(result.user)
      setAuthMode('')
      setPage(authMode === 'register' ? 'book' : result.user.role === 'admin' ? 'admin' : 'dashboard')
    } catch (error) { setAuthError(error.message) } finally { setBusy(false) }
  }
  async function logout() {
    try {
      await request('logout', { method: 'POST', body: {} })
      setUser(null)
      setPage('dashboard')
    } catch (error) { setToast(error.message) }
  }
  function requireUser(target) {
    if (!user) { setAuthMode('login'); setToast('Log in or create an account to continue.'); return }
    setBookError(''); setBookSuccess(false); setPage(target)
  }
  async function submitBooking(payload) {
    setBusy(true); setBookError('')
    try { await request('book', { method: 'POST', body: payload }); setBookSuccess(true); await loadUserData() }
    catch (error) { setBookError(error.message) } finally { setBusy(false) }
  }
  async function cancelAppointment(id) {
    if (!window.confirm('Cancel this appointment? This action cannot be undone.')) return
    setBusyId(id)
    try { await request('cancel', { method: 'POST', body: { id } }); await loadUserData(); await loadQueue(); setToast('Appointment cancelled.') }
    catch (error) { setPageError(error.message) } finally { setBusyId(null) }
  }
  async function adminAction(action, payload) {
    setBusy(true); setPageError('')
    try { await request(`admin_${action}`, { method: 'POST', body: payload }); await loadAdminData(); await loadQueue(); setToast('Changes saved.') }
    catch (error) { setPageError(error.message) } finally { setBusy(false) }
  }
  async function saveProfile(payload) {
    setBusy(true); setPageError('')
    try { const result = await request('profile', { method: 'POST', body: payload }); setUser(result.user); setToast('Profile updated.') }
    catch (error) { setPageError(error.message) } finally { setBusy(false) }
  }
  async function changePassword(payload) {
    setBusy(true); setPageError('')
    try { await request('change_password', { method: 'POST', body: payload }); setPageError(''); setToast('Password changed successfully.') }
    catch (error) { setPageError(error.message) } finally { setBusy(false) }
  }

  if (!authReady) return <div className="app-content"><div className="empty-state"><span className="loader" />Checking your session…</div></div>
  if (!user) return <><Landing onAuth={(mode) => { setAuthError(''); setAuthMode(mode) }} onBook={() => { setAuthError(''); setAuthMode('register') }} onMonitor={() => setPage('queue')} />{page === 'queue' && <div className="public-queue-modal"><QueueMonitor queue={queue} userQueue={null} loading={queueLoading} onNavigate={() => setPage('dashboard')} error={pageError} /><button className="modal-close" onClick={() => setPage('dashboard')} aria-label="Close"><Icon name="close" /></button></div>}{authMode && <AuthDialog mode={authMode} onClose={() => setAuthMode('')} onMode={(mode) => { setAuthError(''); setAuthMode(mode) }} onSubmit={submitAuth} busy={busy} error={authError} apiAvailable={Boolean(API_URL)} />}{toast && <div className="toast"><Icon name="check" size={17} />{toast}</div>}</>
  return <><DashboardShell user={user} page={page} setPage={setPage} onLogout={logout}>{page === 'dashboard' && user.role === 'user' && <Dashboard user={user} stats={stats} appointments={appointments} onBook={() => requireUser('book')} onNavigate={setPage} loading={loading} error={pageError} />}{page === 'book' && user.role === 'user' && <Booking onSubmit={submitBooking} busy={busy} error={bookError} success={bookSuccess} onNavigate={setPage} />}{page === 'appointments' && user.role === 'user' && <Appointments appointments={appointments} onCancel={cancelAppointment} busyId={busyId} onNavigate={(target) => target === 'book' ? requireUser(target) : setPage(target)} loading={loading} error={pageError} />}{page === 'queue' && <QueueMonitor queue={queue} userQueue={userQueue} loading={queueLoading} onNavigate={setPage} error={pageError} />}{page === 'dashboard' && user.role === 'admin' && <AdminPanel data={adminData} onAction={adminAction} onNavigate={setPage} busy={busy || loading} error={pageError} showBack={false} />}{page === 'admin' && user.role === 'admin' && <AdminPanel data={adminData} onAction={adminAction} onNavigate={setPage} busy={busy || loading} error={pageError} />}{page === 'settings' && <AccountSettings key={user.id} user={user} onProfile={saveProfile} onPassword={changePassword} busy={busy} error={pageError} success={toast === 'Profile updated.' ? 'profile' : toast === 'Password changed successfully.' ? 'password' : ''} />}</DashboardShell>{toast && <div className="toast"><Icon name="check" size={17} />{toast}</div>}</>
}

export default App
