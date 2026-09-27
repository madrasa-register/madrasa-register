// Sign-in gate: decides whether the app runs with an account (online sync)
// or only on this device, and links a login to its maktab.
import { useEffect, useState } from 'react'
import { one, db, type Row } from '../db/db'
import { tr, Field, LangSelect, DialogHost, bumpVersion, useDialog } from '../ui'
import {
  syncConfigured, isLocalOnly, setLocalOnly, currentSession, signIn, signUp, signOut,
  loadMember, claimOrganization, connect, waitForFirstSync, type Member,
} from '../sync'
import { SetupWizard } from './Setup'

export type Auth = { email: string; member: Member; onSignOut: () => void }

type Stage =
  | { k: 'loading' }
  | { k: 'login' }
  | { k: 'noMember'; email: string; localOrg: Row | null; msg?: string }
  | { k: 'setup'; email: string }
  | { k: 'otherData'; email: string; member: Member; localOrg: Row }
  | { k: 'downloading' }
  | { k: 'ready'; auth: Auth | null }

export function AuthGate({ children }: { children: (auth: Auth | null) => React.ReactNode }) {
  const [stage, setStage] = useState<Stage>(() => (!syncConfigured || isLocalOnly() ? { k: 'ready', auth: null } : { k: 'loading' }))

  async function resolve() {
    setStage({ k: 'loading' })
    const s = await currentSession()
    if (!s) return setStage({ k: 'login' })
    const email = s.user.email ?? ''
    const member = await loadMember(s.user.id)
    const localOrg = await one<Row>('select * from organization limit 1')
    if (!member) return setStage({ k: 'noMember', email, localOrg })
    if (localOrg && localOrg.id !== member.organization_id) return setStage({ k: 'otherData', email, member, localOrg })
    await start(email, member, !localOrg)
  }

  async function start(email: string, member: Member, firstDownload: boolean) {
    if (firstDownload) setStage({ k: 'downloading' })
    await connect()
    if (firstDownload) await waitForFirstSync()
    try { if (member.app_user_id) localStorage.setItem('maktab.user', member.app_user_id) } catch { /* ignore */ }
    bumpVersion()
    setStage({ k: 'ready', auth: { email, member, onSignOut: async () => { await signOut(); resolve() } } })
  }

  useEffect(() => { if (stage.k === 'loading') resolve() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (stage.k === 'ready') return <>{children(stage.auth)}</>
  return <DialogHost><GateScreen stage={stage} resolve={resolve} setStage={setStage} start={start} /></DialogHost>
}

function GateScreen({ stage, resolve, setStage, start }: {
  stage: Stage; resolve: () => void; setStage: (s: Stage) => void
  start: (email: string, m: Member, first: boolean) => Promise<void>
}) {
  const d = useDialog()
  const [, force] = useState(0)
  const header = (
    <div className="row between">
      <h1>{tr('مکتب ایپ', 'Maktab App')}</h1>
      <div style={{ width: 130 }}><LangSelect onChange={() => force((x) => x + 1)} /></div>
    </div>
  )

  if (stage.k === 'loading') return <div className="boot">…</div>
  if (stage.k === 'downloading') return (
    <div className="center-page"><div className="card narrow">
      {header}
      <div className="banner">{tr('آپ کے مکتب کا ڈیٹا ڈاؤن لوڈ ہو رہا ہے… پہلی بار چند منٹ لگ سکتے ہیں۔', 'Downloading your maktab data… the first time can take a few minutes.')}</div>
    </div></div>
  )
  if (stage.k === 'login') return <LoginForm header={header} onDone={resolve} />

  if (stage.k === 'setup') return (
    <SetupWizard onStart={() => {}} onDone={async (uid) => {
      const org = await one<Row>('select * from organization limit 1')
      try {
        const r = await claimOrganization(org!.id, uid)
        if (r !== 'ok') d.toast(r, 'err')
      } catch (e) { d.toast(String(e), 'err') }
      resolve()
    }} />
  )

  if (stage.k === 'otherData') return (
    <div className="center-page"><div className="card narrow">
      {header}
      <p>{tr(`اس ڈیوائس پر ایک اور ادارے «${stage.localOrg.name}» کا ڈیٹا موجود ہے، جو آپ کے اکاؤنٹ سے مختلف ہے۔`,
        `This device holds data of another organization «${stage.localOrg.name}», different from your account.`)}</p>
      <p className="muted">{tr('آپ کے ادارے کا ڈیٹا لانے کے لیے اس ڈیوائس کا مقامی ڈیٹا صاف کرنا ہوگا۔ جو ڈیٹا کبھی آن لائن نہیں گیا وہ اس ڈیوائس سے ختم ہو جائے گا۔',
        'To bring your organization\'s data, the local data on this device must be cleared. Data that was never uploaded will be lost from this device.')}</p>
      <div className="row end wrap">
        <button className="ghost" onClick={async () => { await signOut(); resolve() }}>{tr('سائن آؤٹ', 'Sign out')}</button>
        <button className="danger" onClick={async () => {
          const ok = await d.open({ title: tr('پکا؟', 'Are you sure?'), message: tr('اس ڈیوائس کا مقامی ڈیٹا صاف ہوگا۔', 'Local data on this device will be cleared.') })
          if (!ok) return
          await db().disconnectAndClear()
          try { localStorage.removeItem('maktab.user'); localStorage.removeItem('maktab.branch') } catch { /* ignore */ }
          await start(stage.email, stage.member, true)
        }}>{tr('صاف کر کے میرا ڈیٹا لائیں', 'Clear and download my data')}</button>
      </div>
    </div></div>
  )

  if (stage.k !== 'noMember') return null
  const s = stage
  async function link() {
    const admin = await one<Row>(`select * from app_user where organization_id = ? and role = 'admin' and status = 'active' order by created_at limit 1`, [s.localOrg!.id])
    if (!admin) return d.toast(tr('اس ڈیوائس پر کوئی ایڈمن صارف نہیں ملا', 'No admin user found on this device'), 'err')
    try {
      const r = await claimOrganization(s.localOrg!.id, admin.id)
      if (r === 'ok' || r === 'already-member') return resolve()
      setStage({ ...s, msg: r === 'organization-taken'
        ? tr('یہ ادارہ پہلے ہی کسی اور اکاؤنٹ سے جڑا ہے۔ ہیڈ آفس سے کہیں کہ «صارفین» میں آپ کو اس ای میل سے رسائی دیں۔', 'This organization is already linked to another account. Ask head office to give your e-mail access under Users.')
        : r })
    } catch (e) { setStage({ ...s, msg: String(e) }) }
  }
  return (
    <div className="center-page"><div className="card narrow">
      {header}
      <p>{tr('آپ سائن اِن ہیں:', 'Signed in as:')} <b dir="ltr">{s.email}</b></p>
      <p className="muted">{tr('یہ اکاؤنٹ ابھی کسی مکتب سے جڑا نہیں۔', 'This account is not yet linked to a maktab.')}</p>
      {s.msg && <div className="banner warn">{s.msg}</div>}
      <div className="stack">
        {s.localOrg ? (
          <button className="primary" onClick={link}>
            {tr(`اس ڈیوائس کا ادارہ «${s.localOrg.name}» میرے اکاؤنٹ سے جوڑیں (ہیڈ آفس ایڈمن)`, `Link «${s.localOrg.name}» on this device to my account (head office admin)`)}
          </button>
        ) : (
          <button className="primary" onClick={() => setStage({ k: 'setup', email: s.email })}>
            {tr('نیا ادارہ ترتیب دیں (ہیڈ آفس ایڈمن)', 'Set up a new organization (head office admin)')}
          </button>
        )}
        <div className="hint">{tr('ناظم، معلم یا ممتحن ہیں؟ ہیڈ آفس یا ناظم سے کہیں کہ «صارفین» میں آپ کا ای میل درج کر کے «لاگ اِن دیں» دبائیں، پھر یہاں دوبارہ دیکھیں۔',
          'Nazim, teacher or examiner? Ask head office or your nazim to enter your e-mail under Users and press "Give login", then check again here.')}</div>
        <div className="row end wrap">
          <button className="ghost" onClick={async () => { await signOut(); resolve() }}>{tr('سائن آؤٹ', 'Sign out')}</button>
          <button onClick={resolve}>{tr('دوبارہ دیکھیں', 'Check again')}</button>
        </div>
      </div>
    </div></div>
  )
}

function LoginForm({ header, onDone }: { header: React.ReactNode; onDone: () => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ t: string; kind: 'err' | 'ok' } | null>(null)
  const ok = /\S+@\S+\.\S+/.test(email) && pw.length >= 8 && (mode === 'in' || pw === pw2)

  async function go() {
    setBusy(true); setMsg(null)
    try {
      if (mode === 'in') { await signIn(email, pw); onDone() }
      else {
        const s = await signUp(email, pw)
        if (s) onDone()
        else { setMsg({ kind: 'ok', t: tr('اکاؤنٹ بن گیا۔ اپنی ای میل میں تصدیقی لنک کھولیں، پھر یہاں سائن اِن کریں۔', 'Account created. Open the confirmation link in your e-mail, then sign in here.') }); setMode('in') }
      }
    } catch (e: any) {
      const m = String(e?.message ?? e)
      setMsg({ kind: 'err', t: /invalid login/i.test(m) ? tr('ای میل یا پاس ورڈ غلط ہے', 'Wrong e-mail or password')
        : /not confirmed/i.test(m) ? tr('ای میل کی تصدیق ابھی نہیں ہوئی — ای میل میں لنک کھولیں', 'E-mail not confirmed yet — open the link in your e-mail')
        : /fetch|network/i.test(m) ? tr('انٹرنیٹ نہیں — پہلی بار سائن اِن کے لیے انٹرنیٹ ضروری ہے', 'No internet — the first sign-in needs internet')
        : m })
    }
    setBusy(false)
  }

  return (
    <div className="center-page"><div className="card narrow">
      {header}
      <div className="tabs">
        <button className={mode === 'in' ? 'active' : ''} onClick={() => setMode('in')}>{tr('سائن اِن', 'Sign in')}</button>
        <button className={mode === 'up' ? 'active' : ''} onClick={() => setMode('up')}>{tr('نیا اکاؤنٹ', 'New account')}</button>
      </div>
      <Field label={tr('ای میل', 'E-mail')}><input type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label={tr('پاس ورڈ', 'Password')} hint={tr('کم از کم 8 حروف', 'At least 8 characters')}>
        <input type="password" dir="ltr" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && ok && mode === 'in') go() }} />
      </Field>
      {mode === 'up' && (
        <Field label={tr('پاس ورڈ دوبارہ', 'Password again')}><input type="password" dir="ltr" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
      )}
      {msg && <div className={`banner ${msg.kind === 'err' ? 'warn' : ''}`}>{msg.t}</div>}
      <div className="row end wrap">
        <button className="primary" disabled={!ok || busy} onClick={go}>
          {busy ? '…' : mode === 'in' ? tr('سائن اِن', 'Sign in') : tr('اکاؤنٹ بنائیں', 'Create account')}
        </button>
      </div>
      <hr />
      <button className="ghost" onClick={() => { setLocalOnly(true); window.location.reload() }}>
        {tr('اکاؤنٹ کے بغیر صرف اس ڈیوائس پر استعمال کریں', 'Use on this device only, without an account')}
      </button>
      <p className="hint">{tr('بعد میں ترتیبات سے اکاؤنٹ جوڑ کر یہ ڈیٹا آن لائن بھیجا جا سکتا ہے۔', 'You can link an account later in Settings and send this data online.')}</p>
    </div></div>
  )
}
