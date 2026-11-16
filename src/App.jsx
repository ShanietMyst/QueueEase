import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { supabase, supabaseConfigured } from './lib/supabase'
import './App.css'

const AUTH_UNAVAILABLE_MESSAGE = 'Online sign-in is not configured for this build.'

async function loadQueueEaseUser(authUser) {
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('id, full_name, email, contact_number, role, is_active')
    .eq('id', authUser.id)
    .maybeSingle()

  if (profileError) throw profileError
  if (!profile || !profile.is_active) {
    throw new Error('This account does not have an active QueueEase profile.')
  }

  let role = 'patient'
  if (profile.role === 'admin') {
    const { data: administrator, error: administratorError } = await supabase
      .from('administrators')
      .select('id')
      .eq('id', authUser.id)
      .eq('is_active', true)
      .maybeSingle()

    if (administratorError) throw administratorError
    if (!administrator) throw new Error('Administrator access could not be verified.')
    role = 'admin'
  } else if (profile.role !== 'user') {
    throw new Error('This account has an unsupported QueueEase role.')
  }

  return {
    id: profile.id,
    name: profile.full_name,
    full_name: profile.full_name,
    email: authUser.email || profile.email,
    contact_number: profile.contact_number,
    role,
  }
}

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

function manilaDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date)
}

async function requireSessionFor(userId) {
  if (!supabase) throw new Error(AUTH_UNAVAILABLE_MESSAGE)
  const { data: { session } = {}, error } = await supabase.auth.getSession()
  if (error) throw error
  if (!session || (userId && session.user.id !== userId)) {
    throw new Error('Your QueueEase session is no longer active. Please sign in again.')
  }
  return session
}

async function requireAdminSession(userId) {
  const session = await requireSessionFor(userId)
  const { data: administrator, error } = await supabase
    .from('administrators')
    .select('id')
    .eq('id', session.user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw error
  if (!administrator) throw new Error('Administrator access could not be verified.')
  return session
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

function AuthDialog({ mode, onClose, onSubmit, busy, error, message, onMode, authAvailable }) {
  const [values, setValues] = useState({ name: '', email: '', contact_number: '', password: '', confirm: '', identifier: '' })
  const register = mode === 'register'
  function submit(event) {
    event.preventDefault()
    if (register && values.password !== values.confirm) return
    if (register) {
      onSubmit({ ...values, full_name: values.name.trim() })
      return
    }
    onSubmit({ ...values, email: values.identifier.trim() })
  }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="modal-close" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
      <Brand /><span className="mini-label auth-kicker">{register ? 'CREATE YOUR ACCOUNT' : 'WELCOME BACK'}</span><h2 id="auth-title">{register ? 'Your next visit, made easier.' : 'Good to see you again.'}</h2><p className="auth-subtitle">{register ? 'Sign up to book appointments and follow your queue.' : 'Log in with your email to manage your appointments and queue.'}</p>
      {authAvailable ? <>
        <form className="form-stack" onSubmit={submit}>
          {register && <label>Full name<input required minLength="2" maxLength="120" autoComplete="name" value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} placeholder="e.g. Jamie Lee" /></label>}
          {!register && <label>Email address<input required type="email" autoComplete="username" value={values.identifier} onChange={(e) => setValues({ ...values, identifier: e.target.value })} placeholder="you@example.com" /></label>}
          {register && <><label>Email address<input required type="email" autoComplete="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} placeholder="you@example.com" /></label><label>Mobile number<input required type="tel" autoComplete="tel" value={values.contact_number} onChange={(e) => setValues({ ...values, contact_number: e.target.value })} placeholder="+63 912 345 6789" /></label></>}
          <label>Password<input required minLength="8" maxLength="72" type="password" autoComplete={register ? 'new-password' : 'current-password'} value={values.password} onChange={(e) => setValues({ ...values, password: e.target.value })} placeholder="At least 8 characters" /></label>
          {register && <label>Confirm password<input required minLength="8" maxLength="72" type="password" autoComplete="new-password" value={values.confirm} onChange={(e) => setValues({ ...values, confirm: e.target.value })} placeholder="Enter your password again" /></label>}
          {register && values.confirm && values.password !== values.confirm && <span className="field-error">Passwords don’t match.</span>}
          {error && <div className="alert alert-error">{error}</div>}
          {message && <div className="success-inline" role="status">{message}</div>}
          <button className="button button-primary button-full" disabled={busy || (register && values.password !== values.confirm)}>{busy ? 'Please wait…' : register ? 'Create account' : 'Log in'} <Icon name="arrow" size={17} /></button>
        </form>
        <p className="auth-switch">{register ? 'Already have an account?' : 'New to QueueEase?'} <button className="text-button" onClick={() => onMode(register ? 'login' : 'register')}>{register ? 'Log in' : 'Create an account'}</button></p>
      </> : <p className="preview-notice" role="status">{AUTH_UNAVAILABLE_MESSAGE}</p>}
      <p className="auth-privacy"><Icon name="shield" size={15} /> Your personal information stays private.</p>
    </section>
  </div>
}

function Status({ value }) {
  const className = (value || 'Pending').toLowerCase().replaceAll(' ', '-')
  return <span className={`status status-${className}`}><span />{value || 'Pending'}</span>
}

function AppointmentCalendar({ appointments = [], audience = 'patient' }) {
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState(localDateString())
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const monthTitle = month.toLocaleDateString([], { month: 'long', year: 'numeric' })
  const monthAppointments = appointments.filter((item) => {
    const date = new Date(`${item.appointment_date}T12:00:00`)
    return date.getFullYear() === year && date.getMonth() === monthIndex
  })
  const appointmentsByDate = monthAppointments.reduce((grouped, item) => {
    grouped[item.appointment_date] = [...(grouped[item.appointment_date] || []), item]
    return grouped
  }, {})
  const firstWeekday = new Date(year, monthIndex, 1).getDay()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const calendarCells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)]
  const selectedAppointments = (appointmentsByDate[selectedDate] || []).slice().sort((left, right) => left.time_slot.localeCompare(right.time_slot))

  function changeMonth(offset) {
    const nextMonth = new Date(year, monthIndex + offset, 1)
    setMonth(nextMonth)
    setSelectedDate(localDateString(nextMonth))
  }

  return <section className="panel appointment-calendar-panel" aria-labelledby={`calendar-title-${audience}`}>
    <div className="panel-heading calendar-heading"><div><h2 id={`calendar-title-${audience}`}>Appointment calendar</h2><p>{audience === 'admin' ? 'Clinic appointments by date' : 'Your appointments by date'}</p></div><div className="calendar-month-controls"><button type="button" className="button button-outline button-small" aria-label="Previous month" onClick={() => changeMonth(-1)}>‹</button><strong aria-live="polite">{monthTitle}</strong><button type="button" className="button button-outline button-small" aria-label="Next month" onClick={() => changeMonth(1)}>›</button></div></div>
    <div className="appointment-calendar-layout"><div className="calendar-month-grid"><div className="calendar-weekdays" aria-hidden="true">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((weekday) => <span key={weekday}>{weekday}</span>)}</div><div className="calendar-days">{calendarCells.map((day, index) => {
      if (!day) return <span className="calendar-day calendar-day-empty" key={`empty-${index}`} aria-hidden="true" />
      const date = new Date(year, monthIndex, day)
      const dateKey = localDateString(date)
      const dayAppointments = appointmentsByDate[dateKey] || []
      const isToday = dateKey === localDateString()
      return <button type="button" key={dateKey} className={`calendar-day ${selectedDate === dateKey ? 'calendar-day-selected' : ''} ${isToday ? 'calendar-day-today' : ''} ${dayAppointments.length ? 'calendar-day-has-appointments' : ''}`} aria-label={`${date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}${dayAppointments.length ? `, ${dayAppointments.length} appointment${dayAppointments.length === 1 ? '' : 's'}` : ', no appointments'}`} aria-pressed={selectedDate === dateKey} aria-current={isToday ? 'date' : undefined} onClick={() => setSelectedDate(dateKey)}><span className="calendar-day-number">{day}</span>{dayAppointments.length > 0 && <span className="calendar-day-count">{dayAppointments.length}</span>}</button>
    })}</div></div>
      <aside className="calendar-selected-day" aria-live="polite"><h3>{selectedDate ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) : 'Select a date'}</h3>{selectedAppointments.length ? <ul>{selectedAppointments.map((item) => <li key={item.id}><div><strong>{item.time_slot}</strong><span>{audience === 'admin' ? `${item.full_name} · ${item.purpose}` : item.purpose}</span></div><Status value={item.status} /></li>)}</ul> : <p>No appointments scheduled for this day.</p>}</aside>
    </div>
  </section>
}

function NotificationCenter({ notifications, unreadCount, onMarkRead, onMarkAllRead }) {
  const [filter, setFilter] = useState('all')
  const filters = [['all', 'All'], ['appointments', 'Appointments'], ['queue_updates', 'Queue updates'], ['announcements', 'Announcements'], ['system', 'System']]
  const visible = filter === 'all' ? notifications : notifications.filter((item) => item.category === filter)
  return <div className="app-content">
    <div className="page-heading"><div><span className="mini-label">UPDATES FOR YOU</span><h1>Notifications</h1><p>Appointment, queue, and clinic updates in one place.</p></div>{unreadCount > 0 && <button className="button button-outline" onClick={onMarkAllRead}>Mark all as read</button>}</div>
    <section className="panel notification-center" aria-label="Notification center">
      <div className="notification-filters" role="group" aria-label="Filter notifications">{filters.map(([key, label]) => <button key={key} className={filter === key ? 'active' : ''} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div>
      {visible.length ? <div className="notification-list">{visible.map((item) => <article className={`notification-row ${Number(item.is_read) ? 'is-read' : 'is-unread'}`} key={item.id}>
        <span className="notification-state" aria-label={Number(item.is_read) ? 'Read' : 'Unread'} />
        <div className="notification-copy"><div className="notification-title-row"><strong>{item.title}</strong><span className="notification-category">{filters.find(([key]) => key === item.category)?.[1] || 'System'}</span><span className="notification-read-label">{Number(item.is_read) ? 'Read' : 'Unread'}</span></div><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time><p>{item.message}</p></div>
        {!Number(item.is_read) && <button className="text-button mark-read" onClick={() => onMarkRead(item.id)}>Mark as read</button>}
      </article>)}</div> : <div className="empty-state"><div className="empty-icon"><Icon name="bell" size={23} /></div><strong>No notifications in this category</strong><p>New updates will appear here.</p></div>}
    </section>
  </div>
}

function PatientSchedules({ schedules, loading, error, onNavigate }) {
  return <div className="app-content"><div className="page-heading"><div><span className="mini-label">PLAN A VISIT</span><h1>Available schedules</h1><p>Review upcoming clinic times and remaining appointment spaces.</p></div><button className="button button-primary" onClick={() => onNavigate('book')}>Book an appointment <Icon name="arrow" size={17} /></button></div>
    {error && <div className="alert alert-error page-alert">{error}</div>}
    <section className="panel schedule-list-panel"><div className="panel-heading"><div><h2>Upcoming dates and times</h2><p>Availability comes from the clinic schedule.</p></div></div>
      {loading ? <div className="empty-state"><span className="loader" />Loading schedules…</div> : schedules.length ? <div className="schedule-list">{schedules.map((item) => <article className="schedule-list-row" key={item.id}><div><strong>{new Date(`${item.service_date}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</strong><span>{item.time_slot}</span></div><div className="schedule-capacity"><strong>{item.is_available ? `${item.available} spaces available` : 'Unavailable'}</strong><span>{item.booked} of {item.capacity} booked</span></div><Status value={item.is_available && item.available > 0 ? 'Available' : item.is_available ? 'Full' : 'Unavailable'} /></article>)}</div> : <div className="empty-state"><strong>No upcoming schedules</strong><p>Please check again later or contact the clinic for help.</p></div>}
    </section>
  </div>
}

function HelpSupport() {
  return <div className="app-content narrow-content"><div className="page-heading"><div><span className="mini-label">HERE TO HELP</span><h1>Help and support</h1><p>Simple steps for using QueueEase.</p></div></div><section className="panel help-panel"><article><h2>Booking an appointment</h2><p>Choose Book an appointment, select a date and available time, then send your request. It will appear in My Appointments while it awaits review.</p></article><article><h2>Following your queue</h2><p>Open My Queue to see your number, the number currently being served, and how many people are ahead. Queue updates refresh automatically.</p></article><article><h2>Need more help?</h2><p>For urgent questions or help changing a visit, please contact clinic staff or ask at the service desk.</p></article></section></div>
}

function Dashboard({ user, stats, appointments, notifications, onBook, onNavigate, loading, error }) {
  const upcoming = appointments.filter((item) => ['Pending', 'Confirmed'].includes(item.status)).slice(0, 3)
  const latestAnnouncement = notifications.find((item) => item.category === 'announcements')
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  return <div className="app-content">{error && <div className="alert alert-error page-alert">{error}</div>}
    <div className="page-heading"><div><span className="mini-label">{today.toUpperCase()}</span><h1>Welcome back, {user.name.split(' ')[0]} <span className="wave">✦</span></h1><p>Here’s what’s happening with your appointments.</p></div><button className="button button-primary" onClick={onBook}><Icon name="plus" size={18} /> Book appointment</button></div>
    <div className="stat-grid">
      <div className="stat-card"><div className="stat-icon stat-blue"><Icon name="calendar" /></div><span>Total appointments</span><strong>{loading ? '—' : stats.total_appointments ?? 0}</strong><small>Across your account</small></div>
      <div className="stat-card"><div className="stat-icon stat-green"><Icon name="check" /></div><span>Upcoming</span><strong>{loading ? '—' : stats.upcoming_appointments ?? 0}</strong><small>Confirmed & pending</small></div>
      <div className="stat-card"><div className="stat-icon stat-purple"><Icon name="ticket" /></div><span>Your queue number</span><strong className="stat-queue">{stats.queue_number || '—'}</strong><small>{stats.queue_status ? <Status value={stats.queue_status} /> : 'No active queue'}</small></div>
      <div className="stat-card"><div className="stat-icon stat-amber"><Icon name="clock" /></div><span>Currently serving</span><strong className="stat-queue">{stats.currently_serving || '—'}</strong><small>{stats.people_ahead != null ? `${stats.people_ahead} people ahead of you` : 'Queue updates live'}</small></div>
    </div>
    <nav className="quick-actions" aria-label="Quick actions"><button onClick={onBook}><Icon name="plus" />Book an appointment</button><button onClick={() => onNavigate('queue')}><Icon name="ticket" />View my queue</button><button onClick={() => onNavigate('schedules')}><Icon name="calendar" />Check schedules</button><button onClick={() => onNavigate('notifications')}><Icon name="bell" />Notifications</button></nav>
    {latestAnnouncement && <section className="announcement-banner"><span className="stat-icon stat-blue"><Icon name="bell" /></span><div><strong>{latestAnnouncement.title}</strong><p>{latestAnnouncement.message}</p><small>{new Date(latestAnnouncement.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</small></div><button className="text-button" onClick={() => onNavigate('notifications')}>Read updates <Icon name="arrow" size={15} /></button></section>}
    <AppointmentCalendar appointments={appointments} audience="patient" />
    <div className="dashboard-grid">
      <section className="panel upcoming-panel"><div className="panel-heading"><div><h2>Upcoming appointments</h2><p>Your next visits at a glance.</p></div><button className="text-button" onClick={() => onNavigate('appointments')}>View all <Icon name="arrow" size={15} /></button></div>
        {loading ? <div className="empty-state"><span className="loader" /> Loading appointments…</div> : upcoming.length ? <div className="appointment-list">{upcoming.map((appointment) => <div className="appointment-row" key={appointment.id}><div className="appointment-date"><strong>{new Date(`${appointment.appointment_date}T12:00:00`).toLocaleDateString('en-US', { day: '2-digit' })}</strong><span>{new Date(`${appointment.appointment_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short' })}</span></div><div className="appointment-info"><strong>{appointment.purpose}</strong><span><Icon name="clock" size={14} /> {appointment.time_slot} <span className="bullet">·</span> {appointment.queue_number || 'Queue number after confirmation'}</span></div><Status value={appointment.status} /></div>)}</div> : <div className="empty-state"><div className="empty-icon"><Icon name="calendar" size={23} /></div><strong>No upcoming appointments</strong><p>When you book a visit, it’ll show up here.</p><button className="button button-outline button-small" onClick={onBook}>Book a visit <Icon name="arrow" size={15} /></button></div>}
      </section>
      <section className="queue-card"><div className="queue-card-header"><span className="queue-live"><i /> LIVE QUEUE</span><button className="icon-button light-icon" onClick={() => onNavigate('queue')} aria-label="Open queue monitor"><Icon name="arrow" size={18} /></button></div><h2>Your queue status</h2><p>Your place updates automatically as the clinic calls patients.</p><div className="queue-card-current"><span>NOW SERVING</span><strong>{stats.currently_serving || '—'}</strong></div><div className="queue-patient-summary"><div><span>Your number</span><strong>{stats.queue_number || 'Not assigned yet'}</strong></div><div><span>People ahead</span><strong>{stats.people_ahead ?? '—'}</strong></div><div><span>Status</span><Status value={stats.queue_status || 'No active queue'} /></div></div><div className="queue-card-bottom"><span>Queue information refreshes automatically.</span><button onClick={() => onNavigate('queue')}>View my queue <Icon name="arrow" size={15} /></button></div></section>
    </div>
  </div>
}

function Booking({ user, onSubmit, busy, error, success, onNavigate }) {
  const [slots, setSlots] = useState([])
  const [scheduleError, setScheduleError] = useState('')
  const [slotsDate, setSlotsDate] = useState('')
  const [date, setDate] = useState('')
  const [form, setForm] = useState(() => ({ full_name: user.full_name || user.name || '', contact_number: user.contact_number || '', email: user.email || '', purpose: '', time_slot: '', notes: '' }))
  useEffect(() => {
    let active = true
    if (!date) return () => { active = false }
    setSlots([])
    setSlotsDate('')
    setScheduleError('')
    requireSessionFor(user.id).then(() => supabase.rpc('get_available_slots', { p_service_date: date })).then(({ data, error }) => {
      if (error) throw error
      if (active) { setSlots((data || []).filter((slot) => slot.remaining > 0)); setSlotsDate(date) }
    }).catch((err) => { if (active) { setSlots([]); setSlotsDate(date); setScheduleError(err.message) } })
    return () => { active = false }
  }, [date, user.id])
  const minDate = manilaDateString()
  return <div className="app-content narrow-content"><div className="back-link" role="button" tabIndex="0" onClick={() => onNavigate('dashboard')}><span>←</span> Back to dashboard</div><div className="page-heading"><div><span className="mini-label">MAKE IT OFFICIAL</span><h1>Book an appointment</h1><p>Choose your preferred date and time. We’ll take it from there.</p></div></div>
    {success ? <section className="success-card"><span className="success-check"><Icon name="check" size={27} /></span><span className="mini-label">REQUEST RECEIVED</span><h2>You’re on your way.</h2><p>Your appointment request has been submitted. We’ll let you know when it’s confirmed.</p><button className="button button-primary" onClick={() => onNavigate('appointments')}>View my appointments <Icon name="arrow" size={16} /></button></section> :
      <form className="panel booking-form" onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, appointment_date: date }) }}>
        <div className="form-section-title"><span>01</span><div><h2>Your details</h2><p>So we know who to expect.</p></div></div>
        <div className="form-grid"><label>Full name<input required minLength="2" maxLength="120" value={form.full_name} readOnly /></label><label>Contact number<input required type="tel" maxLength="30" value={form.contact_number} readOnly placeholder="+63 912 345 6789" /></label><label className="form-wide">Email address<input required type="email" maxLength="190" value={form.email} readOnly /></label></div>
        <div className="form-section-title form-section-spaced"><span>02</span><div><h2>Pick a time that works</h2><p>Slots are subject to daily availability.</p></div></div>
        <div className="form-grid"><label>Appointment purpose<input required minLength="2" maxLength="160" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="What can we help you with?" /></label><label>Preferred date<input required type="date" min={minDate} value={date} onChange={(e) => { setDate(e.target.value); setSlots([]); setSlotsDate(''); setScheduleError(''); setForm({ ...form, time_slot: '' }) }} /></label><label className="form-wide">Available time slot<select required disabled={!date || !slots.length || slotsDate !== date} value={form.time_slot} onChange={(e) => setForm({ ...form, time_slot: e.target.value })}><option value="">{date ? 'Choose an available slot' : 'Select a date first'}</option>{slots.map((slot) => <option value={slot.time_slot} key={slot.time_slot}>{slot.time_slot} · {slot.remaining} spots left</option>)}</select>{scheduleError && <span className="field-error">{scheduleError}</span>}{date && slotsDate === date && !scheduleError && !slots.length && <span className="field-help">No available time slots on this date.</span>}</label><label className="form-wide">Additional notes <span className="optional">(optional)</span><textarea rows="3" maxLength="1000" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything else we should know?" /></label></div>
        {error && <div className="alert alert-error">{error}</div>}<div className="form-footer"><span><Icon name="shield" size={16} /> Your details are kept private.</span><button className="button button-primary" disabled={busy || !slots.length}>{busy ? 'Submitting…' : 'Request appointment'} <Icon name="arrow" size={17} /></button></div>
      </form>}
  </div>
}

function Appointments({ appointments, onCancel, busyId, onNavigate, loading, error }) {
  const [expandedId, setExpandedId] = useState(null)
  return <div className="app-content"><div className="page-heading"><div><span className="mini-label">YOUR VISITS, ALL TOGETHER</span><h1>My appointments</h1><p>Review your bookings and keep track of what’s next.</p></div><button className="button button-primary" onClick={() => onNavigate('book')}><Icon name="plus" size={18} /> Book appointment</button></div><section className="panel appointments-panel"><div className="panel-heading"><div><h2>Appointment history</h2><p>{appointments.length} {appointments.length === 1 ? 'appointment' : 'appointments'}</p></div></div>
    {error && <div className="alert alert-error">{error}</div>}
    {loading ? <div className="empty-state"><span className="loader" /> Loading appointments…</div> : appointments.length ? <div className="table-scroll"><table><thead><tr><th>APPOINTMENT</th><th>DATE & TIME</th><th>QUEUE NUMBER</th><th>STATUS</th><th>Actions</th></tr></thead><tbody>{appointments.map((item) => <Fragment key={item.id}><tr><td><strong>{item.purpose}</strong><small>{item.full_name}</small></td><td>{new Date(`${item.appointment_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}<small>{item.time_slot}</small></td><td>{item.queue_number || '—'}</td><td><Status value={item.status} /></td><td className="appointment-actions"><button className="button button-outline button-small" aria-expanded={expandedId === item.id} onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>{expandedId === item.id ? 'Hide details' : 'View details'}</button>{['Pending', 'Confirmed'].includes(item.status) && <button className="cancel-button" disabled={busyId === item.id} onClick={() => onCancel(item.id)}>{busyId === item.id ? 'Cancelling…' : 'Cancel'}</button>}</td></tr>{expandedId === item.id && <tr className="appointment-detail-row"><td colSpan="5"><strong>Appointment details</strong><p>{item.purpose}</p>{item.notes && <p>Notes: {item.notes}</p>}<span>{item.appointment_date} · {item.time_slot} · Queue {item.queue_number || 'not assigned'}</span></td></tr>}</Fragment>)}</tbody></table></div> : <div className="empty-state"><div className="empty-icon"><Icon name="calendar" size={23} /></div><strong>No appointments yet</strong><p>Your appointment history will appear here.</p><button className="button button-outline button-small" onClick={() => onNavigate('book')}>Book an appointment <Icon name="arrow" size={15} /></button></div>}</section></div>
}

function QueueMonitor({ queue, userQueue, loading, onNavigate, error }) {
  return <div className="app-content">{error && <div className="alert alert-error page-alert">{error}</div>}<div className="page-heading"><div><span className="mini-label">THE LINE, WITHOUT THE GUESSING</span><h1>Queue monitor</h1><p>Live queue information. Refreshed automatically every few seconds.</p></div><button className="button button-outline" onClick={() => onNavigate('dashboard')}>Back to dashboard</button></div>
    <div className="monitor-grid"><section className="serving-card"><span className="queue-live"><i /> NOW SERVING</span><strong>{queue.currently_serving || '—'}</strong><span>Updated {queue.updated_at ? new Date(queue.updated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'just now'}</span></section><section className="panel my-queue-card"><span className="mini-label">YOUR PLACE IN LINE</span>{userQueue?.queue_number ? <><strong>{userQueue.queue_number}</strong><Status value={userQueue.status} /><p>{userQueue.people_ahead === 0 ? 'You’re next in line!' : `${userQueue.people_ahead} ${userQueue.people_ahead === 1 ? 'person' : 'people'} ahead of you`}</p></> : <><div className="empty-icon"><Icon name="ticket" size={23} /></div><h2>No active queue number</h2><p>Your number will appear here once your appointment is confirmed.</p><button className="text-button" onClick={() => onNavigate('appointments')}>View appointments <Icon name="arrow" size={15} /></button></>}</section></div>
    <section className="panel waiting-panel"><div className="panel-heading"><div><h2>Waiting queue</h2><p>Queue numbers only — no personal details are shown.</p></div><span className="waiting-count">{queue.waiting?.length || 0} waiting</span></div>{loading ? <div className="empty-state"><span className="loader" /> Updating queue…</div> : queue.waiting?.length ? <div className="waiting-list">{queue.waiting.map((item, index) => <div className={`waiting-item ${userQueue?.queue_number === item.queue_number ? 'waiting-you' : ''}`} key={item.queue_number}><span className="waiting-position">{String(index + 1).padStart(2, '0')}</span><strong>{item.queue_number}</strong>{userQueue?.queue_number === item.queue_number && <span className="you-tag">YOU</span>}</div>)}</div> : <div className="empty-state queue-empty"><div className="empty-icon"><Icon name="users" size={23} /></div><strong>No one waiting right now</strong><p>The waiting queue is currently clear.</p></div>}</section>
  </div>
}

function ActivityRows({ activity = [] }) {
  return activity.length ? <div className="activity-list">{activity.map((item) => <article className="activity-row" key={item.id}><span className="activity-marker"><Icon name="check" size={16} /></span><div><strong>{item.action.replaceAll('_', ' ')}</strong><p>{item.affected_record} · {item.actor_name}</p><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time></div></article>)}</div> : <div className="empty-state"><strong>No activity recorded yet</strong><p>Administrative actions will appear here.</p></div>
}

function AdminPanel({ data, onAction, onNavigate, busy, error, section = 'dashboard' }) {
  const [announcement, setAnnouncement] = useState({ title: '', message: '' })
  const sectionName = section === 'admin' ? 'appointments' : section
  const pending = data.appointments.filter((item) => item.status === 'Pending')
  const pendingCount = Number(data.stats.pending_appointments ?? pending.length)
  const statuses = Object.entries(data.appointment_analytics || {})
  const analyticsMax = Math.max(1, ...statuses.map(([, value]) => Number(value)))
  const capacities = data.schedules || []
  const totalCapacity = Number(data.capacity_totals?.total ?? capacities.reduce((total, schedule) => total + Number(schedule.capacity || 0), 0))
  const bookedCapacity = Number(data.capacity_totals?.booked ?? capacities.reduce((total, schedule) => total + Number(schedule.booked || 0), 0))
  const availableCapacity = Number(data.capacity_totals?.available ?? Math.max(0, totalCapacity - bookedCapacity))
  const attentionCount = pendingCount + (data.attention?.low_capacity?.length || 0) + (data.attention?.full_schedules?.length || 0) + (data.attention?.unavailable_schedules?.length || 0) + (data.attention?.queue_issue ? 1 : 0)
  const titles = { dashboard: 'Overview', appointments: 'Appointments', queue: 'Queue management', schedules: 'Schedules', users: 'Users', reports: 'Reports', announcements: 'Announcements', activity: 'Recent activity', settings: 'Settings' }
  const renderAppointments = (rows) => rows.length ? <div className="table-scroll"><table><thead><tr><th>Patient</th><th>Appointment</th><th>Date and time</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><strong>{item.full_name}</strong><small>{item.email} · {item.contact_number}</small></td><td>{item.purpose}</td><td>{item.appointment_date}<small>{item.time_slot}</small></td><td><Status value={item.status} /></td><td>{item.status === 'Pending' && <div className="row-actions"><button disabled={busy} className="approve-button" onClick={() => onAction('decision', { id: item.id, status: 'Confirmed' })}>Approve</button><button disabled={busy} className="cancel-button" onClick={() => onAction('decision', { id: item.id, status: 'Rejected' })}>Reject</button></div>}{item.queue_number && <span className="queue-small">{item.queue_number}</span>}</td></tr>)}</tbody></table></div> : <div className="empty-state"><strong>No appointments to review</strong><p>New appointment requests will appear here.</p></div>
  const renderQueue = () => <div className="admin-queue"><div className="admin-queue-summary"><div><span className="mini-label">CURRENTLY SERVING</span><strong>{data.queue.currently_serving || '—'}</strong></div><div><span className="mini-label">NEXT IN LINE</span><strong>{data.queue.waiting?.[0]?.queue_number || '—'}</strong></div><div><span className="mini-label">WAITING</span><strong>{data.queue.waiting?.length || 0}</strong></div></div><div className="admin-queue-actions"><button className="button button-primary" disabled={busy || !data.queue.waiting?.length} onClick={() => onAction('next', {})}>Call next <Icon name="arrow" size={17} /></button>{data.queue.currently_serving && <button className="button button-outline button-small" disabled={busy} onClick={() => onAction('skip', {})}>Skip current</button>}</div>{data.queue.records?.length ? data.queue.records.map((item) => <div className="admin-queue-row" key={item.id}><span>{item.queue_number}</span><span>{item.full_name} · {item.purpose}</span><Status value={item.status} /><div className="row-actions">{item.status === 'Waiting' && <><button disabled={busy} className="approve-button" onClick={() => onAction('queue_status', { id: item.id, status: 'Serving' })}>Call</button><button disabled={busy} className="cancel-button" onClick={() => onAction('queue_status', { id: item.id, status: 'Cancelled' })}>Cancel</button></>}{item.status === 'Serving' && <><button disabled={busy} className="approve-button" onClick={() => onAction('queue_status', { id: item.id, status: 'Completed' })}>Complete</button><button disabled={busy} className="cancel-button" onClick={() => onAction('queue_status', { id: item.id, status: 'Skipped' })}>Skip</button></>}</div></div>) : <div className="empty-state"><strong>There are no queue records for today</strong><p>Confirmed appointments appear here when their service date arrives.</p></div>}</div>
  const renderUsers = () => data.users?.length ? <div className="table-scroll"><table><thead><tr><th>User</th><th>Joined</th><th>Appointments</th><th>Account</th><th>Action</th></tr></thead><tbody>{data.users.map((item) => <tr key={item.id}><td><strong>{item.full_name}</strong><small>{item.email}</small></td><td>{new Date(item.created_at).toLocaleDateString()}</td><td>{item.appointment_count}</td><td><Status value={Number(item.is_active) ? 'Active' : 'Inactive'} /></td><td><button className={Number(item.is_active) ? 'cancel-button' : 'approve-button'} disabled={busy} onClick={() => onAction('user', { id: item.id, is_active: Number(item.is_active) ? 0 : 1 })}>{Number(item.is_active) ? 'Deactivate' : 'Reactivate'}</button></td></tr>)}</tbody></table></div> : <div className="empty-state"><strong>No user accounts yet</strong></div>
  return <div className="app-content"><div className="page-heading"><div><span className="mini-label">ADMINISTRATION</span><h1>{titles[sectionName] || 'Administration'}</h1><p>{sectionName === 'dashboard' ? 'Today’s appointments, queue, schedules, and attention items.' : `Manage QueueEase ${titles[sectionName]?.toLowerCase() || 'operations'}.`}</p></div>{sectionName !== 'dashboard' && <button className="button button-outline" onClick={() => onNavigate('dashboard')}>Back to overview</button>}</div>
    {error && <div className="alert alert-error page-alert">{error}</div>}
    {sectionName === 'dashboard' && <>
      <div className="stat-grid admin-stats">{[
        ['Today’s appointments', data.stats.today_appointments, 'calendar', 'stat-blue'],
        ['Pending approval', data.stats.pending_appointments, 'clock', 'stat-amber'],
        ['Confirmed today', data.stats.confirmed_today, 'check', 'stat-green'],
        ['Currently waiting', data.stats.waiting, 'users', 'stat-purple'],
        ['Currently serving', data.stats.serving, 'ticket', 'stat-blue'],
        ['Completed today', data.stats.completed_today, 'check', 'stat-green'],
        ['Cancelled today', data.stats.cancelled_today, 'close', 'stat-amber'],
      ].map(([label, value, icon, color]) => <div className="stat-card" key={label}><div className={`stat-icon ${color}`}><Icon name={icon} /></div><span>{label}</span><strong>{value ?? 0}</strong></div>)}</div>
      <AppointmentCalendar appointments={data.appointments} audience="admin" />
      <div className="admin-overview-grid">
        <section className="panel live-queue-panel"><div className="panel-heading"><div><h2>Live queue overview</h2><p>Today’s queue status</p></div><span className="queue-live"><i /> LIVE</span></div><div className="live-queue-numbers"><div><span>Now serving</span><strong>{data.queue.currently_serving || '—'}</strong></div><div><span>Next in line</span><strong>{data.queue.waiting?.[0]?.queue_number || '—'}</strong></div><div><span>Total waiting</span><strong>{data.queue.waiting?.length || 0}</strong></div></div><p className="queue-status-note">{data.attention?.queue_issue ? 'Queue needs attention: more than one record is marked Serving.' : data.stats.serving ? 'A patient is being served.' : data.stats.waiting ? 'Patients are waiting.' : 'There is no active queue right now.'}</p><div className="admin-queue-actions"><button className="button button-primary" disabled={busy || !data.queue.waiting?.length} onClick={() => onAction('next', {})}>Call next <Icon name="arrow" size={17} /></button><button className="button button-outline" onClick={() => onNavigate('queue')}>Manage queue</button></div></section>
        <section className="panel capacity-panel"><div className="panel-heading"><div><h2>Schedule capacity</h2><p>Upcoming scheduled capacity</p></div><button className="text-button" onClick={() => onNavigate('schedules')}>Manage schedules <Icon name="arrow" size={15} /></button></div><div className="capacity-totals"><div><span>Total capacity</span><strong>{totalCapacity}</strong></div><div><span>Booked</span><strong>{bookedCapacity}</strong></div><div><span>Available</span><strong>{availableCapacity}</strong></div></div>{capacities.length ? <div className="capacity-list">{capacities.slice(0, 4).map((item) => <div className="capacity-row" key={item.id}><span>{item.service_date} · {item.time_slot}</span><strong>{item.booked}/{item.capacity}</strong><Status value={!item.is_available ? 'Unavailable' : item.available === 0 ? 'Full' : 'Available'} /></div>)}</div> : <p className="field-help">No upcoming schedules are set.</p>}</section>
        <section className="panel analytics-panel"><div className="panel-heading"><div><h2>Appointment analytics</h2><p>Appointments for the last 30 days, by status</p></div><button className="text-button" onClick={() => onNavigate('reports')}>View reports <Icon name="arrow" size={15} /></button></div><div className="analytics-bars">{statuses.map(([label, value]) => <div className="analytics-row" key={label}><span>{label}</span><div className="analytics-track"><span style={{ width: `${Math.max(Number(value) ? 3 : 0, Number(value) / analyticsMax * 100)}%` }} /></div><strong>{value}</strong></div>)}</div></section>
        <section className="panel attention-panel"><div className="panel-heading"><div><h2>Needs attention</h2><p>{attentionCount ? `${attentionCount} items to review` : 'No urgent issues right now'}</p></div><span className={`attention-count ${attentionCount ? 'has-alerts' : ''}`}>{attentionCount}</span></div><ul className="attention-list">
          {pending.length > 0 && <li><span>{pending.length} appointment{pending.length === 1 ? '' : 's'} awaiting approval</span><button className="text-button" onClick={() => onNavigate('appointments')}>Review</button></li>}
          {(data.attention?.low_capacity || []).slice(0, 3).map((item) => <li key={`low-${item.id}`}><span>Nearly full: {item.service_date} · {item.time_slot} ({item.available} left)</span><button className="text-button" onClick={() => onNavigate('schedules')}>View</button></li>)}
          {(data.attention?.full_schedules || []).slice(0, 3).map((item) => <li key={`full-${item.id}`}><span>Fully occupied: {item.service_date} · {item.time_slot}</span><button className="text-button" onClick={() => onNavigate('schedules')}>View</button></li>)}
          {(data.attention?.unavailable_schedules || []).slice(0, 3).map((item) => <li key={`closed-${item.id}`}><span>Unavailable: {item.service_date} · {item.time_slot}</span><button className="text-button" onClick={() => onNavigate('schedules')}>View</button></li>)}
          {data.attention?.queue_issue && <li><span>Multiple queue records are marked as serving.</span><button className="text-button" onClick={() => onNavigate('queue')}>Resolve</button></li>}
          {!attentionCount && <li><span>Appointment approvals, capacity, and queue look up to date.</span></li>}
        </ul></section>
      </div>
        <section className="panel overview-appointments"><div className="panel-heading"><div><h2>Appointments to review</h2><p>{pendingCount} pending approval</p></div><button className="text-button" onClick={() => onNavigate('appointments')}>All appointments <Icon name="arrow" size={15} /></button></div>{renderAppointments(pending.slice(0, 5))}</section>
      <section className="panel overview-activity"><div className="panel-heading"><div><h2>Recent admin activity</h2><p>Latest recorded actions</p></div><button className="text-button" onClick={() => onNavigate('activity')}>View activity <Icon name="arrow" size={15} /></button></div><ActivityRows activity={(data.activity || []).slice(0, 6)} /></section>
    </>}
    {sectionName === 'appointments' && <section className="panel admin-panel"><div className="panel-heading"><div><h2>Appointment requests and history</h2><p>Approve or reject pending patient requests.</p></div></div>{renderAppointments(data.appointments)}</section>}
    {sectionName === 'queue' && <section className="panel admin-panel"><div className="panel-heading"><div><h2>Queue management</h2><p>Only queue numbers and the necessary appointment details are shown.</p></div></div>{renderQueue()}</section>}
    {sectionName === 'schedules' && <section className="panel admin-panel"><div className="panel-heading"><div><h2>Schedules and capacity</h2><p>Add appointment times or close a schedule to new bookings.</p></div></div><ScheduleManager schedules={data.schedules} onSave={(payload) => onAction('schedule', payload)} busy={busy} /></section>}
    {sectionName === 'users' && <section className="panel admin-panel"><div className="panel-heading"><div><h2>Patient accounts</h2><p>Review account status and appointment counts.</p></div></div>{renderUsers()}</section>}
    {sectionName === 'reports' && <section className="panel admin-panel"><div className="panel-heading"><div><h2>Appointment reports</h2><p>Counts from QueueEase records.</p></div><button className="button button-outline button-small" onClick={() => window.print()}>Print report</button></div><div className="report-panel"><div><span>This month</span><strong>{data.reports?.monthly ?? 0}</strong></div><div><span>Today</span><strong>{data.reports?.daily ?? 0}</strong></div></div><div className="analytics-bars report-bars">{statuses.map(([label, value]) => <div className="analytics-row" key={label}><span>{label}</span><div className="analytics-track"><span style={{ width: `${Math.max(Number(value) ? 3 : 0, Number(value) / analyticsMax * 100)}%` }} /></div><strong>{value}</strong></div>)}</div></section>}
    {sectionName === 'announcements' && <section className="panel announcement-admin-panel"><div className="panel-heading"><div><h2>Publish an announcement</h2><p>In-app announcement for active patient accounts.</p></div></div><form className="announcement-form" onSubmit={(event) => { event.preventDefault(); onAction('announcement', announcement, () => setAnnouncement({ title: '', message: '' })) }}><label>Title<input required maxLength="120" value={announcement.title} onChange={(event) => setAnnouncement({ ...announcement, title: event.target.value })} /></label><label>Message<textarea required maxLength="3000" rows="4" value={announcement.message} onChange={(event) => setAnnouncement({ ...announcement, message: event.target.value })} /></label><button className="button button-primary" disabled={busy}>Publish announcement</button></form>{data.announcements?.length > 0 && <div className="announcement-history"><h3>Recently published</h3>{data.announcements.map((item, index) => <article key={`${item.created_at}-${index}`}><strong>{item.title}</strong><time>{new Date(item.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time><p>{item.message}</p></article>)}</div>}</section>}
    {sectionName === 'activity' && <section className="panel admin-panel"><div className="panel-heading"><div><h2>Recent admin activity</h2><p>Action, affected record, administrator, and time.</p></div></div><ActivityRows activity={data.activity || []} /></section>}
    {sectionName === 'settings' && <section className="panel admin-panel"><div className="panel-heading"><div><h2>System settings</h2><p>Update existing QueueEase configuration values.</p></div></div><SystemSettings settings={data.settings || []} onSave={(payload) => onAction('system_setting', payload)} busy={busy} /></section>}
  </div>
}

function SystemSettings({ settings, onSave, busy }) {
  const [values, setValues] = useState({})
  useEffect(() => {
    setValues((current) => {
      const next = { ...current }
      settings.forEach((setting) => {
        if (!(setting.setting_name in next)) next[setting.setting_name] = setting.setting_value
      })
      return next
    })
  }, [settings])
  if (!settings.length) return <div className="empty-state"><strong>System settings are unavailable</strong><p>No approved non-secret setting keys and value rules are defined yet. Reading and updating settings will remain disabled until they are reviewed.</p></div>
  return <div className="settings-form">{settings.map((setting) => <form className="system-setting-row" key={setting.setting_name} onSubmit={(event) => { event.preventDefault(); onSave({ setting_name: setting.setting_name, setting_value: values[setting.setting_name] ?? '' }) }}><label>{setting.setting_name}<input maxLength="255" value={values[setting.setting_name] ?? setting.setting_value} onChange={(event) => setValues({ ...values, [setting.setting_name]: event.target.value })} /></label><button className="button button-outline button-small" disabled={busy || (values[setting.setting_name] ?? setting.setting_value) === setting.setting_value}>Save</button></form>)}</div>
}

function ScheduleManager({ schedules, onSave, busy }) {
  const [schedule, setSchedule] = useState({ service_date: '', time_slot: '', capacity: '10', is_available: true })
  return <div className="schedule-area"><form className="schedule-form" onSubmit={(e) => { e.preventDefault(); onSave({ ...schedule, capacity: Number(schedule.capacity), is_available: Number(schedule.is_available) }) }}><label>Date<input type="date" min={localDateString()} required value={schedule.service_date} onChange={(e) => setSchedule({ ...schedule, service_date: e.target.value })} /></label><label>Time slot<input required maxLength="80" placeholder="e.g. 9:00 AM" value={schedule.time_slot} onChange={(e) => setSchedule({ ...schedule, time_slot: e.target.value })} /></label><label>Daily capacity<input required min="1" max="500" type="number" value={schedule.capacity} onChange={(e) => setSchedule({ ...schedule, capacity: e.target.value })} /></label><label className="schedule-available-toggle"><input type="checkbox" checked={schedule.is_available} onChange={(e) => setSchedule({ ...schedule, is_available: e.target.checked })} /> Accepting appointments</label><button className="button button-primary button-small" disabled={busy}>Save schedule</button></form>{schedules.length ? <div className="schedule-admin-list">{schedules.map((item) => <article className="schedule-row" key={item.id}><span><Icon name="calendar" size={17} /> {new Date(`${item.service_date}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span><span><Icon name="clock" size={17} /> {item.time_slot}</span><span>{item.booked}/{item.capacity} booked · {item.available ?? Math.max(0, item.capacity - item.booked)} available</span><Status value={!item.is_available ? 'Unavailable' : Number(item.available ?? item.capacity - item.booked) === 0 ? 'Full' : 'Available'} /><button className="button button-outline button-small" disabled={busy} onClick={() => onSave({ service_date: item.service_date, time_slot: item.time_slot, capacity: Number(item.capacity), is_available: item.is_available ? 0 : 1 })}>{item.is_available ? 'Mark unavailable' : 'Reopen schedule'}</button></article>)}</div> : <div className="empty-state"><strong>No schedules set up yet</strong><p>Add a date and time slot to start accepting appointments.</p></div>}</div>
}

function AccountSettings({ user, onProfile, onPassword, busy, error, success }) {
  const [profile, setProfile] = useState({ full_name: user.name, contact_number: user.contact_number || '' })
  const [password, setPassword] = useState({ current_password: '', new_password: '', confirm: '' })
  return <div className="app-content narrow-content"><div className="page-heading"><div><span className="mini-label">YOUR ACCOUNT</span><h1>Account settings</h1><p>Update your contact details and keep your account secure.</p></div></div>
    {user.role === 'patient' && <section className="panel settings-panel"><div className="panel-heading"><div><h2>Personal information</h2><p>These details are associated with your account.</p></div></div><form className="settings-form" onSubmit={(e) => { e.preventDefault(); onProfile(profile) }}><label>Full name<input required minLength="2" maxLength="120" value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} /></label><label>Email address<input disabled value={user.email} /></label><label>Contact number<input maxLength="30" value={profile.contact_number} onChange={(e) => setProfile({ ...profile, contact_number: e.target.value })} placeholder="Add a contact number" /></label>{error && <div className="alert alert-error">{error}</div>}{success === 'profile' && <div className="success-inline">Your profile has been updated.</div>}<button className="button button-primary button-small" disabled={busy}>Save profile</button></form></section>}
    <section className={`panel settings-panel ${user.role === 'patient' ? 'password-panel' : ''}`}><div className="panel-heading"><div><h2>Change password</h2><p>Choose a password with at least 8 characters.</p></div></div><form className="settings-form" onSubmit={(e) => { e.preventDefault(); onPassword(password) }}><label>Current password<input required type="password" autoComplete="current-password" value={password.current_password} onChange={(e) => setPassword({ ...password, current_password: e.target.value })} /></label><label>New password<input required minLength="8" maxLength="72" type="password" autoComplete="new-password" value={password.new_password} onChange={(e) => setPassword({ ...password, new_password: e.target.value })} /></label><label>Confirm new password<input required minLength="8" maxLength="72" type="password" autoComplete="new-password" value={password.confirm} onChange={(e) => setPassword({ ...password, confirm: e.target.value })} /></label>{password.confirm && password.new_password !== password.confirm && <span className="field-error">Passwords don’t match.</span>}{error && <div className="alert alert-error">{error}</div>}{success === 'password' && <div className="success-inline">Password changed successfully.</div>}<button className="button button-primary button-small" disabled={busy || password.new_password !== password.confirm}>Update password</button></form></section>
  </div>
}

function DashboardShell({ user, page, setPage, onLogout, children, notifications = [], unreadCount = 0, onMarkRead, onMarkAllRead, showNotifications, setShowNotifications }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const nav = user.role === 'admin'
    ? [['dashboard', 'Overview', 'home'], ['appointments', 'Appointments', 'calendar'], ['queue', 'Queue management', 'ticket'], ['schedules', 'Schedules', 'clock'], ['users', 'Users', 'users'], ['reports', 'Reports', 'list'], ['announcements', 'Announcements', 'bell'], ['activity', 'Recent activity', 'list'], ['settings', 'Settings', 'shield']]
    : [['dashboard', 'Home', 'home'], ['appointments', 'My appointments', 'calendar'], ['book', 'Book an appointment', 'plus'], ['queue', 'My queue', 'ticket'], ['schedules', 'Schedules', 'clock'], ['notifications', 'Notifications', 'bell'], ['profile', 'My profile', 'shield'], ['help', 'Help and support', 'spark']]
  const pageLabel = { dashboard: 'Overview', admin: 'Appointments', book: 'Book an appointment', queue: user.role === 'admin' ? 'Queue management' : 'My queue', appointments: 'My appointments', schedules: 'Schedules', notifications: 'Notifications', profile: 'My profile', settings: 'Settings', help: 'Help and support', users: 'Users', reports: 'Reports', announcements: 'Announcements', activity: 'Recent activity' }[page] || 'Overview'
  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}><div className="sidebar-brand"><Brand /></div><span className="sidebar-label">{user.role === 'admin' ? 'ADMINISTRATION' : 'PATIENT MENU'}</span><nav aria-label="Main navigation">{nav.map(([key, title, icon]) => <button key={key} className={`side-link ${page === key || (key === 'profile' && page === 'settings') || (key === 'appointments' && page === 'admin') ? 'side-link-active' : ''}`} onClick={() => { setPage(key); setMobileOpen(false) }}><Icon name={icon} size={19} />{title}{key === 'queue' && <span className="side-live" />}{key === 'notifications' && unreadCount > 0 && <span className="side-count">{unreadCount}</span>}</button>)}</nav><div className="sidebar-bottom">{user.role === 'patient' && <div className="sidebar-help"><div className="help-mark"><Icon name="spark" size={17} /></div><strong>Need help with a visit?</strong><p>See simple steps and support options.</p><button onClick={() => setPage('help')}>Help and support <Icon name="arrow" size={14} /></button></div>}<div className="profile-row"><span className="avatar">{user.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><span className="profile-name"><strong>{user.name}</strong><small>{user.role === 'admin' ? 'Administrator' : 'QueueEase patient'}</small></span><button className="icon-button logout-button" onClick={onLogout} aria-label="Log out"><Icon name="logout" size={18} /></button></div></div></aside>
    {mobileOpen && <button className="mobile-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close menu" />}
    <div className="app-main"><header className="app-topbar"><button className="mobile-menu icon-button" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Open navigation menu"><Icon name="menu" /></button><div className="breadcrumb"><span>QueueEase</span><span>/</span><strong>{pageLabel}</strong></div><div className="topbar-right"><div className="notification-wrapper"><button className="icon-button notification-bell" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} aria-expanded={showNotifications} aria-controls="notification-popover" onClick={() => setShowNotifications((value) => !value)}><Icon name="bell" size={20} />{unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}</button>{showNotifications && <div className="notification-panel" id="notification-popover" role="dialog" aria-label="Recent notifications"><div className="notification-panel-heading"><strong>Recent notifications</strong>{unreadCount > 0 && <button className="text-button" onClick={onMarkAllRead}>Mark all as read</button>}</div>{notifications.length ? notifications.slice(0, 5).map((item) => <article key={item.id} className={`notification-item ${Number(item.is_read) ? 'is-read' : 'is-unread'}`}><span className="notification-state" /><div><strong>{item.title}</strong><small>{new Date(item.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {item.category?.replaceAll('_', ' ')}</small><span>{item.message}</span>{!Number(item.is_read) && <button className="text-button" onClick={() => onMarkRead(item.id)}>Mark as read</button>}</div></article>) : <div className="empty-state compact"><strong>No notifications yet</strong><p>System updates will appear here.</p></div>}<button className="notification-view-all" onClick={() => { setPage('notifications'); setShowNotifications(false) }}>View all notifications</button></div>}</div><button className="topbar-queue" onClick={() => setPage('queue')}><span className="live-dot" />{user.role === 'admin' ? 'Live queue' : 'Queue status'}</button><span className="topbar-avatar" aria-label={user.name}>{user.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span></div></header><main>{children}</main><footer className="app-footer"><span>© {new Date().getFullYear()} QueueEase</span><span>Appointments made a little easier.</span></footer></div>
  </div>
}

function App() {
  const [user, setUser] = useState(null)
  const [page, setPage] = useState('dashboard')
  const [authMode, setAuthMode] = useState('')
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [appointments, setAppointments] = useState([])
  const [stats, setStats] = useState({})
  const [queue, setQueue] = useState({ waiting: [] })
  const [userQueue, setUserQueue] = useState(null)
  const [adminData, setAdminData] = useState({ stats: {}, appointments: [], queue: { waiting: [] }, schedules: [], appointment_analytics: {}, attention: {}, activity: [], announcements: [], users: [], settings: [] })
  const [notifications, setNotifications] = useState([])
  const [notificationUnread, setNotificationUnread] = useState(0)
  const [schedules, setSchedules] = useState([])
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [loading, setLoading] = useState(true)
  const [authReady, setAuthReady] = useState(false)
  const [queueLoading, setQueueLoading] = useState(true)
  const [queueLoaded, setQueueLoaded] = useState(false)
  const [pageError, setPageError] = useState('')
  const [bookError, setBookError] = useState('')
  const [bookSuccess, setBookSuccess] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [toast, setToast] = useState('')
  const authUserId = useRef(null)
  const authRevision = useRef(0)

  const loadUserData = useCallback(async (quiet = false) => {
    if (!user || user.role !== 'patient' || !authReady || !supabase) return
    if (!quiet) setLoading(true)
    try {
      await requireSessionFor(user.id)
      const { data: appointmentRows, error: appointmentError } = await supabase
        .from('appointments')
        .select('id, user_id, full_name, purpose, notes, status, appointment_date, time_slot, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (appointmentError) throw appointmentError

      const appointmentIds = (appointmentRows || []).map((appointment) => appointment.id)
      let queueRows = []
      if (appointmentIds.length) {
        const { data, error } = await supabase
          .from('queue_records')
          .select('appointment_id, queue_number, status')
          .in('appointment_id', appointmentIds)
        if (error) throw error
        queueRows = data || []
      }

      const queueByAppointment = new Map(queueRows.map((record) => [record.appointment_id, record]))
      const ownedAppointments = (appointmentRows || []).map((appointment) => ({
        ...appointment,
        queue_number: queueByAppointment.get(appointment.id)?.queue_number || null,
      }))
      const { data: snapshot, error: queueError } = await supabase.rpc('public_queue_snapshot')
      if (queueError) throw queueError
      if (authUserId.current !== user.id) return

      const yourQueue = snapshot?.your_queue || null
      setAppointments(ownedAppointments)
      setQueue(snapshot || { waiting: [] })
      setUserQueue(yourQueue)
      setStats({
        total_appointments: ownedAppointments.length,
        upcoming_appointments: ownedAppointments.filter((appointment) => (
          ['Pending', 'Confirmed'].includes(appointment.status)
          && appointment.appointment_date >= manilaDateString()
        )).length,
        queue_number: yourQueue?.queue_number || null,
        queue_status: yourQueue?.status || null,
        currently_serving: snapshot?.currently_serving || null,
        people_ahead: yourQueue?.people_ahead ?? null,
      })
      setPageError('')
    } catch (error) {
      if (authUserId.current === user.id) {
        setAppointments([])
        setStats({})
        setPageError(error.message)
      }
    } finally { if (!quiet && authUserId.current === user.id) setLoading(false) }
  }, [user, authReady])
  const loadNotifications = useCallback(async () => {
    if (!user || !authReady || !supabase) return
    try {
      await requireSessionFor(user.id)
      const { data, error } = await supabase
        .from('notifications')
        .select('id, category, title, message, is_read, created_at')
        .eq('user_id', user.id)
        .eq('recipient_role', user.role === 'admin' ? 'admin' : 'user')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      if (authUserId.current !== user.id) return
      const rows = data || []
      setNotifications(rows)
      setNotificationUnread(rows.filter((item) => !item.is_read).length)
    } catch (error) {
      if (authUserId.current === user.id) {
        setNotifications([])
        setNotificationUnread(0)
        setPageError(error.message)
      }
    }
  }, [user, authReady])
  const loadSchedules = useCallback(async () => {
    if (!user || user.role !== 'patient' || !authReady || !supabase) return
    setScheduleLoading(true)
    try {
      await requireSessionFor(user.id)
      const { data, error } = await supabase.rpc('get_available_slots', { p_service_date: null })
      if (error) throw error
      if (authUserId.current !== user.id) return
      setSchedules((data || []).map((slot) => ({
        id: slot.schedule_id,
        service_date: slot.service_date,
        time_slot: slot.time_slot,
        capacity: slot.capacity,
        booked: slot.booked,
        available: slot.remaining,
        is_available: slot.is_available,
      })))
      setPageError('')
    } catch (error) {
      if (authUserId.current === user.id) {
        setSchedules([])
        setPageError(error.message)
      }
    } finally {
      if (authUserId.current === user.id) setScheduleLoading(false)
    }
  }, [user, authReady])
  const loadQueue = useCallback(async () => {
    if (!authReady || !supabase) return
    if (!queueLoaded) setQueueLoading(true)
    try {
      if (user) await requireSessionFor(user.id)
      const { data, error } = await supabase.rpc('public_queue_snapshot')
      if (error) throw error
      if (user && authUserId.current !== user.id) return
      const result = data || { waiting: [] }
      setQueue(result)
      setUserQueue(result.your_queue || null)
      setPageError('')
    } catch (error) {
      if (!user || authUserId.current === user.id) setPageError(error.message)
    } finally { setQueueLoading(false); setQueueLoaded(true) }
  }, [authReady, queueLoaded, user])
  const loadAdminData = useCallback(async (quiet = false) => {
    if (!user || user.role !== 'admin' || !authReady || !supabase) return
    if (!quiet) setLoading(true)
    try {
      await requireAdminSession(user.id)
      const [summaryResult, patientResult, appointmentRows, scheduleRows, queueRows, activityRows, announcementRows, settingsResult, snapshotResult] = await Promise.all([
        supabase.rpc('admin_dashboard_summary'),
        supabase.rpc('admin_patient_list'),
        supabase.from('appointments').select('id, user_id, full_name, email, contact_number, purpose, notes, status, appointment_date, time_slot, schedule_id, created_at').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(200),
        supabase.from('schedules').select('id, service_date, time_slot, capacity, is_available').gte('service_date', manilaDateString()).order('service_date').order('time_slot').limit(100),
        supabase.from('queue_records').select('id, appointment_id, queue_number, queue_number_int, service_date, service_name, status').eq('service_date', manilaDateString()).eq('service_name', 'General').order('queue_number_int'),
        supabase.from('activity_logs').select('id, actor_id, actor_type, action, entity_type, entity_id, created_at').order('created_at', { ascending: false }).limit(100),
        supabase.from('notifications').select('id, title, message, created_at').eq('category', 'announcements').order('created_at', { ascending: false }).limit(500),
        supabase.rpc('admin_list_system_settings'),
        supabase.rpc('public_queue_snapshot'),
      ])
      for (const result of [summaryResult, patientResult, appointmentRows, scheduleRows, queueRows, activityRows, announcementRows, settingsResult, snapshotResult]) {
        if (result.error) throw result.error
      }
      let appointmentQueueRows = []
      const appointmentIds = (appointmentRows.data || []).map((row) => row.id)
      for (let index = 0; index < appointmentIds.length; index += 100) {
        const { data, error } = await supabase.from('queue_records').select('appointment_id, queue_number').in('appointment_id', appointmentIds.slice(index, index + 100))
        if (error) throw error
        appointmentQueueRows.push(...(data || []))
      }
      const queueByAppointment = new Map(appointmentQueueRows.map((row) => [row.appointment_id, row]))
      const appointmentList = appointmentRows.data || []
      const scheduleList = scheduleRows.data || []
      const appointments = appointmentList.map((row) => ({
        ...row,
        queue_number: queueByAppointment.get(row.id)?.queue_number || null,
      }))
      let scheduleBookings = []
      const scheduleIds = scheduleList.map((schedule) => schedule.id)
      if (scheduleIds.length) {
        const { data, error } = await supabase.from('appointments').select('schedule_id').in('schedule_id', scheduleIds).in('status', ['Pending', 'Confirmed'])
        if (error) throw error
        scheduleBookings = data || []
      }
      const bookedBySchedule = new Map()
      scheduleBookings.forEach(({ schedule_id }) => bookedBySchedule.set(schedule_id, (bookedBySchedule.get(schedule_id) || 0) + 1))
      const schedules = scheduleList.map((schedule) => {
        const booked = bookedBySchedule.get(schedule.id) || 0
        return { ...schedule, booked, available: Math.max(0, schedule.capacity - booked) }
      })
      const todayQueueRecords = queueRows.data || []
      const knownAppointmentIds = new Set(appointmentList.map((row) => row.id))
      const missingQueueAppointmentIds = [...new Set(todayQueueRecords.map((record) => record.appointment_id).filter((id) => !knownAppointmentIds.has(id)))]
      let missingQueueAppointments = []
      if (missingQueueAppointmentIds.length) {
        const { data, error } = await supabase.from('appointments').select('id, full_name, purpose').in('id', missingQueueAppointmentIds)
        if (error) throw error
        missingQueueAppointments = data || []
      }
      const appointmentsById = new Map([...appointmentList, ...missingQueueAppointments].map((row) => [row.id, row]))
      const queueAppointments = todayQueueRecords.map((record) => appointmentsById.get(record.appointment_id)).filter(Boolean)
      const queueAppointmentById = new Map(queueAppointments.map((row) => [row.id, row]))
      const queue = {
        ...(snapshotResult.data || { waiting: [] }),
        records: todayQueueRecords.map((record) => ({
          ...record,
          ...(queueAppointmentById.get(record.appointment_id) || {}),
        })).sort((left, right) => left.queue_number_int - right.queue_number_int),
      }
      const activityActorIds = [...new Set((activityRows.data || []).map((item) => item.actor_id).filter(Boolean))]
      let actors = []
      if (activityActorIds.length) {
        const { data, error } = await supabase.from('users').select('id, full_name').in('id', activityActorIds)
        if (error) throw error
        actors = data || []
      }
      const actorNames = new Map(actors.map((actor) => [actor.id, actor.full_name]))
      const activity = (activityRows.data || []).map((item) => ({
        ...item,
        actor_name: actorNames.get(item.actor_id) || (item.actor_type === 'system' ? 'System' : 'Administrator'),
        affected_record: `${item.entity_type.replaceAll('_', ' ')}${item.entity_id ? ` #${item.entity_id}` : ''}`,
      }))
      const announcements = [...new Map((announcementRows.data || []).map((item) => [`${item.created_at}|${item.title}|${item.message}`, item])).values()]
      const summary = summaryResult.data || {}
      if (authUserId.current !== user.id) return
      setAdminData({
        stats: summary.stats || {}, appointments, queue, schedules,
        capacity_totals: summary.capacity_totals || {}, reports: summary.reports || {},
        appointment_analytics: summary.appointment_analytics || {}, attention: summary.attention || {},
        users: patientResult.data || [], activity, announcements,
        settings: settingsResult.data || [],
      })
      setPageError('')
    } catch (error) { setPageError(error.message) } finally { if (!quiet) setLoading(false) }
  }, [user, authReady])

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true)
      return undefined
    }

    let active = true
    let pendingTimer

    function clearProtectedState() {
      setUser(null)
      setPage('dashboard')
      setAppointments([])
      setStats({})
      setQueue({ waiting: [] })
      setUserQueue(null)
      setAdminData({ stats: {}, appointments: [], queue: { waiting: [] }, schedules: [], appointment_analytics: {}, attention: {}, activity: [], announcements: [], users: [], settings: [] })
      setNotifications([])
      setNotificationUnread(0)
      setSchedules([])
      setScheduleLoading(false)
      setShowNotifications(false)
      setLoading(false)
      setQueueLoading(false)
      setQueueLoaded(false)
      setPageError('')
      setBookError('')
      setBookSuccess(false)
      setBusyId(null)
      setBusy(false)
    }

    async function applyAuthState(event, session) {
      const revision = ++authRevision.current
      const authUser = session?.user
      if (!authUser) {
        authUserId.current = null
        clearProtectedState()
        setAuthReady(true)
        return
      }

      if (event === 'TOKEN_REFRESHED' && authUserId.current === authUser.id) return
      if (authUserId.current && authUserId.current !== authUser.id) clearProtectedState()
      authUserId.current = authUser.id
      setAuthReady(false)
      try {
        const queueEaseUser = await loadQueueEaseUser(authUser)
        if (!active || revision !== authRevision.current) return
        setUser(queueEaseUser)
        if (queueEaseUser.role === 'admin') setPage('dashboard')
        setAuthError('')
      } catch (error) {
        if (!active || revision !== authRevision.current) return
        setAuthError(error.message || 'Could not verify your QueueEase profile.')
        setAuthMode('login')
        setToast('Your QueueEase profile could not be verified. Please sign in again.')
        authUserId.current = null
        try {
          await supabase.auth.signOut({ scope: 'local' })
        } catch {
          // The session has no verified QueueEase profile, so protected UI
          // remains unavailable even if the local Auth cleanup is offline.
        }
      } finally {
        if (active && revision === authRevision.current) setAuthReady(true)
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Defer Supabase queries until after the Auth callback returns to avoid
      // holding the client's internal auth lock while loading the profile.
      pendingTimer = window.setTimeout(() => { void applyAuthState(event, session) }, 0)
    })

    return () => {
      active = false
      window.clearTimeout(pendingTimer)
      subscription.unsubscribe()
    }
  }, [])
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadUserData() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadUserData])
  useEffect(() => {
    if (!user) return undefined
    const initial = window.setTimeout(() => { void loadNotifications() }, 0)
    if (user.role === 'patient') {
      const timer = window.setInterval(() => { void Promise.all([loadNotifications(), loadUserData(true)]) }, 15000)
      return () => { window.clearTimeout(initial); window.clearInterval(timer) }
    }
    const timer = window.setInterval(() => { void Promise.all([loadNotifications(), loadAdminData(true)]) }, 15000)
    return () => { window.clearTimeout(initial); window.clearInterval(timer) }
  }, [user, loadNotifications, loadUserData, loadAdminData])
  useEffect(() => {
    if (user?.role !== 'user' || page !== 'schedules') return undefined
    const timer = window.setTimeout(() => { void loadSchedules() }, 0)
    return () => window.clearTimeout(timer)
  }, [user, page, loadSchedules])
  useEffect(() => {
    if (!authReady) return undefined
    const initial = window.setTimeout(() => { void loadQueue() }, 0)
    const timer = window.setInterval(loadQueue, 10000)
    return () => { window.clearTimeout(initial); window.clearInterval(timer) }
  }, [authReady, loadQueue])
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadAdminData() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadAdminData])
  useEffect(() => { if (!toast) return undefined; const timer = window.setTimeout(() => setToast(''), 3500); return () => window.clearTimeout(timer) }, [toast])

  async function submitAuth(values) {
    setBusy(true); setAuthError('')
    setAuthMessage('')
    try {
      if (!supabase) throw new Error(AUTH_UNAVAILABLE_MESSAGE)
      if (authMode === 'register') {
        const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString()
        const { data, error } = await supabase.auth.signUp({
          email: values.email.trim().toLowerCase(),
          password: values.password,
          options: {
            data: {
              full_name: values.full_name.trim(),
              contact_number: values.contact_number.trim(),
            },
            emailRedirectTo: redirectTo,
          },
        })
        if (error) throw error
        if (!data.session) {
          setAuthMessage('Account created. Check your email to confirm your address, then log in to QueueEase.')
          return
        }
        setAuthMode('')
        setPage('book')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: values.email.trim().toLowerCase(),
          password: values.password,
        })
        if (error) throw error
        setAuthMode('')
        setPage('dashboard')
      }
    } catch (error) { setAuthError(error.message) } finally { setBusy(false) }
  }
  async function logout() {
    try {
      if (!supabase) throw new Error(AUTH_UNAVAILABLE_MESSAGE)
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch (error) { setToast(error.message) }
  }
  function requireUser(target) {
    if (!user) { setAuthMode('login'); setToast('Log in or create an account to continue.'); return }
    setBookError(''); setBookSuccess(false); setPage(target)
  }
  async function submitBooking(payload) {
    setBusy(true); setBookError('')
    try {
      if (!user || user.role !== 'patient') throw new Error('An active patient session is required to book.')
      await requireSessionFor(user.id)
      const { error } = await supabase.rpc('book_appointment', {
        p_appointment_date: payload.appointment_date,
        p_time_slot: payload.time_slot,
        p_purpose: payload.purpose,
        p_notes: payload.notes || '',
      })
      if (error) throw error
      setBookSuccess(true)
      await Promise.all([loadUserData(), loadQueue(), loadNotifications()])
    }
    catch (error) { setBookError(error.message) } finally { setBusy(false) }
  }
  async function cancelAppointment(id) {
    if (!window.confirm('Cancel this appointment? This action cannot be undone.')) return
    setBusyId(id)
    try {
      if (!user || user.role !== 'patient') throw new Error('An active patient session is required to cancel.')
      await requireSessionFor(user.id)
      const { error } = await supabase.rpc('cancel_appointment', { p_appointment_id: id })
      if (error) throw error
      await Promise.all([loadUserData(), loadQueue(), loadNotifications()])
      setToast('Appointment cancelled.')
    }
    catch (error) { setPageError(error.message) } finally { setBusyId(null) }
  }
  async function adminAction(action, payload, onSuccess) {
    setBusy(true); setPageError('')
    try {
      if (!user || user.role !== 'admin') throw new Error('Administrator access is required.')
      await requireAdminSession(user.id)
      const operations = {
        decision: () => supabase.rpc('admin_decide_appointment', { p_appointment_id: payload.id, p_status: payload.status }),
        queue_status: () => supabase.rpc('admin_set_queue_status', { p_queue_id: payload.id, p_status: payload.status }),
        next: () => supabase.rpc('admin_advance_queue'),
        skip: () => supabase.rpc('admin_skip_current_queue'),
        schedule: () => supabase.rpc('admin_upsert_schedule', { p_service_date: payload.service_date, p_time_slot: payload.time_slot, p_capacity: payload.capacity, p_is_available: Boolean(Number(payload.is_available)) }),
        user: () => supabase.rpc('admin_set_user_active', { p_user_id: payload.id, p_is_active: Boolean(Number(payload.is_active)) }),
        announcement: () => supabase.rpc('admin_publish_announcement', { p_title: payload.title, p_message: payload.message }),
        system_setting: () => supabase.rpc('admin_update_system_setting', { p_setting_name: payload.setting_name, p_setting_value: payload.setting_value }),
      }
      if (!operations[action]) throw new Error('This administrator operation is not supported.')
      const { error } = await operations[action]()
      if (error) throw error
      onSuccess?.()
      await Promise.all([loadAdminData(), loadQueue(), loadNotifications()])
      setToast(action === 'announcement' ? 'Announcement published.' : action === 'system_setting' ? 'System setting updated.' : 'Changes saved.')
    }
    catch (error) { setPageError(error.message) } finally { setBusy(false) }
  }
  async function saveProfile(payload) {
    setBusy(true); setPageError('')
    try {
      if (!user) throw new Error('An active QueueEase session is required to update your profile.')
      await requireSessionFor(user.id)
      const { data, error } = await supabase.rpc('update_queueease_profile', {
        p_full_name: payload.full_name,
        p_contact_number: payload.contact_number,
      })
      if (error) throw error
      const profile = Array.isArray(data) ? data[0] : data
      if (!profile) throw new Error('The profile update did not return an updated profile.')
      if (authUserId.current === user.id) {
        setUser((current) => current?.id === user.id ? {
          ...current,
          name: profile.full_name,
          full_name: profile.full_name,
          email: profile.email,
          contact_number: profile.contact_number,
        } : current)
        setToast('Profile updated.')
      }
    }
    catch (error) { setPageError(error.message) } finally { setBusy(false) }
  }
  async function changePassword(payload) {
    setBusy(true); setPageError('')
    try {
      if (!user || !supabase) throw new Error('An active QueueEase session is required to change your password.')
      if (payload.new_password !== payload.confirm) throw new Error('The new passwords do not match.')
      const session = await requireSessionFor(user.id)
      if (!session.user.email) throw new Error('A verified email address is required to change your password.')
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: payload.current_password,
      })
      if (verifyError) throw new Error('The current password is incorrect.')
      const { error } = await supabase.auth.updateUser({ password: payload.new_password })
      if (error) throw error
      setPageError('')
      setToast('Password changed successfully.')
    }
    catch (error) { setPageError(error.message) } finally { setBusy(false) }
  }
  async function markNotificationRead(id = null) {
    if (!user || !authReady || !supabase) return
    try {
      await requireSessionFor(user.id)
      let update = supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('recipient_role', user.role === 'admin' ? 'admin' : 'user')
        .eq('is_read', false)
      if (id) update = update.eq('id', id)
      const { error } = await update
      if (error) throw error
      await loadNotifications()
    } catch (error) {
      setPageError(error.message)
    }
  }

  if (!authReady) return <div className="app-content"><div className="empty-state"><span className="loader" />Checking your session…</div></div>
  if (!user) return <><Landing onAuth={(mode) => { setAuthError(''); setAuthMessage(''); setAuthMode(mode) }} onBook={() => { setAuthError(''); setAuthMessage(''); setAuthMode('register') }} onMonitor={() => setPage('queue')} />{page === 'queue' && <div className="public-queue-modal"><QueueMonitor queue={queue} userQueue={null} loading={queueLoading} onNavigate={() => setPage('dashboard')} error={pageError} /><button className="modal-close" onClick={() => setPage('dashboard')} aria-label="Close"><Icon name="close" /></button></div>}{authMode && <AuthDialog mode={authMode} onClose={() => { setAuthMode(''); setAuthMessage('') }} onMode={(mode) => { setAuthError(''); setAuthMessage(''); setAuthMode(mode) }} onSubmit={submitAuth} busy={busy} error={authError} message={authMessage} authAvailable={supabaseConfigured} />}{toast && <div className="toast"><Icon name="check" size={17} />{toast}</div>}</>
  return <><DashboardShell user={user} page={page} setPage={setPage} onLogout={logout} notifications={notifications} unreadCount={notificationUnread} onMarkRead={markNotificationRead} onMarkAllRead={() => markNotificationRead()} showNotifications={showNotifications} setShowNotifications={setShowNotifications}>{page === 'dashboard' && user.role === 'patient' && <Dashboard user={user} stats={stats} appointments={appointments} notifications={notifications} onBook={() => requireUser('book')} onNavigate={setPage} loading={loading} error={pageError} />}{page === 'book' && user.role === 'patient' && <Booking user={user} onSubmit={submitBooking} busy={busy} error={bookError} success={bookSuccess} onNavigate={setPage} />}{page === 'appointments' && user.role === 'patient' && <Appointments appointments={appointments} onCancel={cancelAppointment} busyId={busyId} onNavigate={(target) => target === 'book' ? requireUser(target) : setPage(target)} loading={loading} error={pageError} />}{page === 'queue' && user.role === 'patient' && <QueueMonitor queue={queue} userQueue={userQueue} loading={queueLoading} onNavigate={setPage} error={pageError} />}{page === 'schedules' && user.role === 'patient' && <PatientSchedules schedules={schedules} loading={scheduleLoading} error={pageError} onNavigate={setPage} />}{page === 'notifications' && <NotificationCenter notifications={notifications} unreadCount={notificationUnread} onMarkRead={markNotificationRead} onMarkAllRead={() => markNotificationRead()} />}{page === 'help' && user.role === 'patient' && <HelpSupport />}{page === 'dashboard' && user.role === 'admin' && <AdminPanel section="dashboard" data={adminData} onAction={adminAction} onNavigate={setPage} busy={busy || loading} error={pageError} />}{['admin', 'appointments', 'queue', 'schedules', 'users', 'reports', 'announcements', 'activity', 'settings'].includes(page) && user.role === 'admin' && page !== 'dashboard' && <AdminPanel section={page} data={adminData} onAction={adminAction} onNavigate={setPage} busy={busy || loading} error={pageError} />}{page === 'profile' && user.role === 'patient' && <AccountSettings key={user.id} user={user} onProfile={saveProfile} onPassword={changePassword} busy={busy} error={pageError} success={toast === 'Profile updated.' ? 'profile' : toast === 'Password changed successfully.' ? 'password' : ''} />}{page === 'settings' && user.role === 'admin' && <AccountSettings key={user.id} user={user} onProfile={saveProfile} onPassword={changePassword} busy={busy} error={pageError} success={toast === 'Profile updated.' ? 'profile' : toast === 'Password changed successfully.' ? 'password' : ''} />}</DashboardShell>{toast && <div className="toast"><Icon name="check" size={17} />{toast}</div>}</>
}

export default App
