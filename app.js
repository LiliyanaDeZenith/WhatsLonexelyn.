import { html, render, useState, useEffect, useRef, useMemo } from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/preact/standalone.module.js'

// Publishable key memang aman ada di kode publik (data dilindungi RLS). Jangan pernah taruh secret key di sini.
const SUPABASE_URL = 'https://yplmkvtrrurnpvdhhmrd.supabase.co'
const SUPABASE_KEY = 'sb_publishable_qJWI783BOZO7xQV-wEoPvw_21xZwHou'
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

const hm = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const label = (p) => (p && (p.display_name || p.username)) || '…'
const initial = (p) => label(p)[0].toUpperCase()

function Auth() {
  const [signup, setSignup] = useState(false)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    const { data, error } = signup
      ? await db.auth.signUp({ email, password, options: { data: { username } } })
      : await db.auth.signInWithPassword({ email, password })
    if (error) setMsg(error.message)
    else if (signup && !data.session) setMsg('Akun dibuat. Cek email untuk konfirmasi, lalu masuk.')
    setBusy(false)
  }

  return html`<div class="center">
    <form class="auth" onSubmit=${submit}>
      <h1>WhatsLonexelyn</h1>
      ${signup && html`<input placeholder="Username (huruf kecil, angka, _)" value=${username} pattern="[a-z0-9_]{3,20}" title="3–20 karakter: huruf kecil, angka, atau underscore" required onInput=${(e) => setUsername(e.target.value.toLowerCase())} />`}
      <input type="email" placeholder="Email" value=${email} onInput=${(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder="Password (minimal 6 karakter)" value=${password} minlength="6" onInput=${(e) => setPassword(e.target.value)} required />
      <button class="go" disabled=${busy}>${signup ? 'Daftar' : 'Masuk'}</button>
      ${msg && html`<p>${msg}</p>`}
      <button type="button" class="link" onClick=${() => setSignup(!signup)}>${signup ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar'}</button>
    </form>
  </div>`
}

const Row = ({ p, sub, time, unread, on, onClick }) => html`
  <div class=${'row' + (on ? ' on' : '')} onClick=${onClick}>
    <div class="avatar">${initial(p)}</div>
    <div class="meta">
      <div class="top"><b>${label(p)}</b><small>${time}</small></div>
      <div class="top"><span class="sub">${sub}</span>${unread ? html`<i class="badge">${unread}</i>` : null}</div>
    </div>
  </div>`

function Chat({ me }) {
  const [msgs, setMsgs] = useState([])
  const [people, setPeople] = useState({})
  const [active, setActive] = useState(null)
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const known = useRef(new Set())
  const bottom = useRef(null)

  const peerOf = (m) => (m.sender === me ? m.receiver : m.sender)

  const addPeople = (list) => {
    list.forEach((x) => known.current.add(x.id))
    setPeople((p) => ({ ...p, ...Object.fromEntries(list.map((x) => [x.id, x])) }))
  }

  const fetchPeople = async (ids) => {
    const need = ids.filter((id) => !known.current.has(id))
    if (!need.length) return
    need.forEach((id) => known.current.add(id))
    const { data } = await db.from('wl_profiles').select('id,username,display_name').in('id', need)
    if (data) addPeople(data)
  }

  // Muat riwayat pesan + dengarkan pesan baru secara realtime
  useEffect(() => {
    let alive = true
    fetchPeople([me])
    db.from('wl_messages').select('*').or(`sender.eq.${me},receiver.eq.${me}`)
      .order('created_at', { ascending: false }).limit(1000)
      .then(({ data }) => {
        if (!alive || !data) return
        const rows = data.reverse()
        setMsgs(rows)
        fetchPeople([...new Set(rows.map(peerOf))])
      })
    const ch = db.channel('wl-messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wl_messages' }, (p) => {
        const m = p.new
        if (m.sender !== me && m.receiver !== me) return
        setMsgs((cur) => (cur.some((x) => x.id === m.id) ? cur.map((x) => (x.id === m.id ? m : x)) : [...cur, m]))
        fetchPeople([peerOf(m)])
      })
      .subscribe()
    return () => { alive = false; db.removeChannel(ch) }
  }, [me])

  // Tandai pesan masuk sebagai dibaca saat chat dibuka
  useEffect(() => {
    if (active && msgs.some((m) => m.sender === active && m.receiver === me && !m.read_at)) {
      db.from('wl_messages').update({ read_at: new Date().toISOString() })
        .eq('sender', active).eq('receiver', me).is('read_at', null).then(() => {})
    }
  }, [active, msgs])

  useEffect(() => { if (bottom.current) bottom.current.scrollIntoView() }, [msgs, active])

  // Cari user berdasarkan username
  useEffect(() => {
    const term = q.trim().toLowerCase()
    if (term.length < 2) { setFound([]); return }
    const t = setTimeout(async () => {
      const { data } = await db.from('wl_profiles').select('id,username,display_name')
        .ilike('username', `%${term}%`).neq('id', me).limit(8)
      setFound(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const chats = useMemo(() => {
    const map = new Map()
    for (const m of msgs) {
      const id = peerOf(m)
      const c = map.get(id) || { last: m, unread: 0 }
      c.last = m
      if (m.receiver === me && !m.read_at) c.unread++
      map.set(id, c)
    }
    return [...map.entries()].sort((a, b) => b[1].last.created_at.localeCompare(a[1].last.created_at))
  }, [msgs])

  async function send(e) {
    e.preventDefault()
    const body = text.trim()
    if (!body || !active) return
    setText('')
    const { data, error } = await db.from('wl_messages').insert({ sender: me, receiver: active, body }).select().single()
    if (error) return setText(body)
    setMsgs((cur) => (cur.some((x) => x.id === data.id) ? cur : [...cur, data]))
  }

  const openUser = (u) => { addPeople([u]); setActive(u.id); setQ('') }

  const term = q.trim()
  const peer = active ? people[active] : null
  const thread = msgs.filter((m) => peerOf(m) === active)

  return html`<div class=${'app' + (active ? ' open' : '')}>
    <aside class="side">
      <header>
        <div class="avatar">${initial(people[me])}</div>
        <b>${label(people[me])}</b>
        <button onClick=${() => db.auth.signOut()} title="Keluar">⎋</button>
      </header>
      <input class="search" placeholder="Cari username untuk mulai chat" value=${q} onInput=${(e) => setQ(e.target.value)} />
      <div class="list">
        ${term.length >= 2
          ? found.map((u) => html`<${Row} key=${u.id} p=${u} sub=${'@' + u.username} onClick=${() => openUser(u)} />`)
          : chats.map(([id, c]) => html`<${Row} key=${id} p=${people[id]} sub=${c.last.body} time=${hm(c.last.created_at)} unread=${c.unread} on=${id === active} onClick=${() => setActive(id)} />`)}
        ${!term && !chats.length ? html`<div class="empty">Belum ada chat. Cari username teman di kolom atas.</div>` : null}
      </div>
    </aside>
    <main class="main">
      ${active
        ? html`
          <header>
            <button class="back" onClick=${() => setActive(null)} title="Kembali">←</button>
            <div class="avatar">${initial(peer)}</div>
            <b>${label(peer)}</b>
          </header>
          <div class="msgs">
            ${thread.map((m) => html`<div key=${m.id} class=${'bubble ' + (m.sender === me ? 'out' : 'in')}>${m.body}<span class="t">${hm(m.created_at)}${m.sender === me ? html`<em class=${m.read_at ? 'read' : ''}>${m.read_at ? '✓✓' : '✓'}</em>` : null}</span></div>`)}
            <div ref=${bottom}></div>
          </div>
          <form class="compose" onSubmit=${send}>
            <input placeholder="Ketik pesan" value=${text} onInput=${(e) => setText(e.target.value)} />
            <button type="submit" title="Kirim">➤</button>
          </form>`
        : html`<div class="empty"><h2>WhatsLonexelyn</h2><p>Pilih chat atau cari username untuk mulai ngobrol.</p></div>`}
    </main>
  </div>`
}

function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    db.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data } = db.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!ready) return html`<div class="center">Memuat…</div>`
  return session ? html`<${Chat} key=${session.user.id} me=${session.user.id} />` : html`<${Auth} />`
}

render(html`<${App} />`, document.getElementById('root'))
// ===== OTP: tempel di paling bawah app.js =====
Auth = function AuthOtp() {
  const [mode, setMode] = useState('in') // 'in' | 'up' | 'otp'
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    if (mode === 'otp') {
      const { error } = await db.auth.verifyOtp({ email, token: code, type: 'signup' })
      if (error) setMsg('Kode salah atau sudah kedaluwarsa. Coba kirim ulang kode.')
    } else if (mode === 'up') {
      const { data, error } = await db.auth.signUp({ email, password, options: { data: { username } } })
      if (error) setMsg(error.message)
      else if (!data.session) { setMode('otp'); setMsg('Kode verifikasi sudah dikirim ke ' + email) }
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password })
      if (error && /not confirmed/i.test(error.message)) {
        await db.auth.resend({ type: 'signup', email })
        setMode('otp')
        setMsg('Email belum dikonfirmasi. Kode baru sudah dikirim ke ' + email)
      } else if (error) setMsg(error.message)
    }
    setBusy(false)
  }

  async function resend() {
    const { error } = await db.auth.resend({ type: 'signup', email })
    setMsg(error ? error.message : 'Kode baru sudah dikirim ke ' + email)
  }

  const back = () => { setMode('in'); setCode(''); setMsg('') }
  const otp = mode === 'otp'

  return html`<div class="center">
    <form class="auth" onSubmit=${submit}>
      <h1>WhatsLonexelyn</h1>
      ${otp
        ? html`<input style="text-align:center;letter-spacing:6px;font-size:20px" inputmode="numeric" autocomplete="one-time-code" placeholder="Kode OTP dari email" value=${code} pattern="[0-9]{6,10}" maxlength="10" required onInput=${(e) => setCode(e.target.value.replace(/\D/g, ''))} />`
        : html`${mode === 'up' && html`<input placeholder="Username (huruf kecil, angka, _)" value=${username} pattern="[a-z0-9_]{3,20}" title="3–20 karakter: huruf kecil, angka, atau underscore" required onInput=${(e) => setUsername(e.target.value.toLowerCase())} />`}
          <input type="email" placeholder="Email" value=${email} onInput=${(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder="Password (minimal 6 karakter)" value=${password} minlength="6" onInput=${(e) => setPassword(e.target.value)} required />`}
      <button class="go" disabled=${busy}>${otp ? 'Verifikasi' : mode === 'up' ? 'Daftar' : 'Masuk'}</button>
      ${msg && html`<p>${msg}</p>`}
      ${otp
        ? html`<button type="button" class="link" onClick=${resend}>Kirim ulang kode</button><button type="button" class="link" onClick=${back}>Kembali</button>`
        : html`<button type="button" class="link" onClick=${() => { setMode(mode === 'up' ? 'in' : 'up'); setMsg('') }}>${mode === 'up' ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar'}</button>`}
    </form>
  </div>`
                                                    }
