import { useEffect, useRef, useState } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { all, one, session, dbMode, type Row } from './db/db'
import { DialogHost, useDialog, tr, LangSelect, useQuery, label, ROLES, bumpVersion } from './ui'
import { SetupWizard, UserPicker } from './screens/Setup'
import { Today, TakeAttendance, MonthlyRegister, Alerts, TeacherTime, ClassRecord } from './screens/Attendance'
import { StudentIndex, Admission, StudentProfile, FamilyView } from './screens/Students'
import { SettingsScreen, Branches, Years, Teachers, Classes, Users } from './screens/Admin'
import { CalendarScreen, CalendarSettings } from './screens/Calendar'
import { ExamList, ExamPage, ScoreStudent } from './screens/Exams'
import { SchemeList, SchemeEditor } from './screens/Schemes'
import { ExamResults, Prizes } from './screens/Results'
import { ResultCards } from './screens/Cards'
import { Hadiya } from './screens/Hadiya'
import { ActivityLog } from './screens/Activity'
import { AuthGate, type Auth } from './screens/Login'
import { syncConfigured, isLocalOnly, setLocalOnly, onSyncState, syncState, pendingApproval, isPlatformOwner, signOut, type SyncState } from './sync'
import { OrgRequests } from './screens/Requests'
import { checkForUpdate, DOWNLOAD_URL, APP_VERSION } from './update'
import { RangeReport, PerfectList, TeacherReport, GuardianSummary, AuditView } from './screens/Reports'

type Nav = { to: string; ur: string; en: string; roles: string[] }
const NAV: Nav[] = [
  { to: '/', ur: 'آج', en: 'Today', roles: ['admin', 'nazim', 'teacher', 'examiner'] },
  { to: '/calendar', ur: 'تعلیمی کیلنڈر', en: 'Academic calendar', roles: ['admin', 'nazim', 'teacher', 'examiner'] },
  { to: '/exams', ur: 'امتحانات و جائزے', en: 'Exams and reviews', roles: ['admin', 'nazim', 'teacher', 'examiner'] },
  { to: '/prizes', ur: 'انعامات و توجہ طلب', en: 'Prizes and follow-up', roles: ['admin', 'nazim', 'teacher'] },
  { to: '/cards', ur: 'نتیجہ کارڈ', en: 'Result cards', roles: ['admin', 'nazim', 'teacher'] },
  { to: '/hadiya', ur: 'ہدیہ (فیس)', en: 'Hadiya (fees)', roles: ['admin', 'nazim', 'teacher'] },
  { to: '/activity', ur: 'کارگزاری (چھ امور)', en: 'Activity log', roles: ['admin', 'nazim', 'teacher'] },
  { to: '/register', ur: 'ماہانہ رجسٹر', en: 'Monthly register', roles: ['admin', 'nazim', 'teacher'] },
  { to: '/alerts', ur: 'الرٹس', en: 'Alerts', roles: ['admin', 'nazim', 'teacher'] },
  { to: '/students', ur: 'طلبہ کا اندراج', en: 'Student index', roles: ['admin', 'nazim', 'teacher'] },
  { to: '/class-record', ur: 'ماہانہ سبق ریکارڈ', en: 'Monthly lesson record', roles: ['admin', 'nazim', 'teacher'] },
  { to: '/teacher-time', ur: 'اساتذہ کی حاضری', en: 'Teacher attendance', roles: ['admin', 'nazim', 'teacher'] },
  { to: '/reports/range', ur: 'حاضری فیصد و نمبر', en: 'Attendance % & marks', roles: ['admin', 'nazim', 'teacher'] },
  { to: '/reports/perfect', ur: 'صاحبِ ترتیب', en: 'Perfect attendance', roles: ['admin', 'nazim', 'teacher'] },
  { to: '/reports/guardian', ur: 'سرپرست کو ماہانہ خلاصہ', en: 'Guardian summary', roles: ['admin', 'nazim', 'teacher'] },
  { to: '/reports/teachers', ur: 'اساتذہ حاضری رپورٹ', en: 'Teacher report', roles: ['admin', 'nazim'] },
  { to: '/setup/classes', ur: 'جماعتیں', en: 'Classes', roles: ['admin', 'nazim'] },
  { to: '/setup/teachers', ur: 'اساتذہ', en: 'Teachers', roles: ['admin', 'nazim'] },
  { to: '/setup/branches', ur: 'مکاتب (شاخیں)', en: 'Branches', roles: ['admin'] },
  { to: '/setup/years', ur: 'تعلیمی سال', en: 'Academic years', roles: ['admin'] },
  { to: '/setup/users', ur: 'صارفین', en: 'Users', roles: ['admin', 'nazim'] },
  { to: '/settings', ur: 'ترتیبات', en: 'Settings', roles: ['admin', 'nazim'] },
  { to: '/reports/audit', ur: 'تبدیلیوں کا ریکارڈ', en: 'Change history', roles: ['admin', 'nazim'] },
]

export default function Root() {
  return <AuthGate>{(auth) => <App auth={auth} />}</AuthGate>
}

function App({ auth }: { auth: Auth | null }) {
  const orgs = useQuery(() => all('select * from organization limit 1'), [])
  const [userId, setUserId] = useState<string | null>(() => auth?.member.app_user_id ?? (() => { try { return localStorage.getItem('maktab.user') } catch { return null } })())
  const user = useQuery(() => (userId ? one<Row>('select * from app_user where id = ?', [userId]) : Promise.resolve(null)), [userId])
  const [, force] = useState(0)
  const [settingUp, setSettingUp] = useState(false)

  if (orgs === undefined) return <div className="boot">…</div>
  if (auth && orgs.length === 0) return <div className="boot">{tr('ڈیٹا ابھی نہیں آیا — انٹرنیٹ چیک کریں', 'No data yet — check the internet')}</div>
  if (orgs.length === 0 || settingUp) {
    return <DialogHost><SetupWizard onStart={() => setSettingUp(true)} onDone={(uid) => { pick(uid); setSettingUp(false) }} /></DialogHost>
  }
  session.orgId = orgs[0].id
  function pick(uid: string | null) {
    try { uid ? localStorage.setItem('maktab.user', uid) : localStorage.removeItem('maktab.user') } catch { /* ignore */ }
    if (!uid) window.location.hash = '#/'
    setUserId(uid)
  }
  if (auth && user === null) return (
    <DialogHost><div className="center-page"><div className="card narrow">
      <p>{tr('آپ کے اکاؤنٹ کا صارف ریکارڈ اس ڈیوائس پر نہیں ملا۔ ہیڈ آفس سے رابطہ کریں۔', 'The user record for your account was not found. Contact head office.')}</p>
      <button onClick={auth.onSignOut}>{tr('سائن آؤٹ', 'Sign out')}</button>
    </div></div></DialogHost>
  )
  if (!userId || user === null) return <DialogHost><UserPicker org={orgs[0]} onPick={pick} /></DialogHost>
  if (user === undefined) return <div className="boot">…</div>

  session.userId = user.id
  session.role = user.role
  session.teacherId = user.teacher_id || null
  if (auth) { session.role = auth.member.role; if (auth.member.role !== 'admin') session.branchId = auth.member.branch_id }
  if (session.role !== 'admin') session.branchId = auth ? auth.member.branch_id : user.branch_id
  else {
    try { session.branchId = localStorage.getItem('maktab.branch') || null } catch { session.branchId = null }
  }

  return (
    <DialogHost>
      <HashRouter>
        <Shell org={orgs[0]} user={{ ...user, role: session.role }} auth={auth} onSwitch={() => (auth ? auth.onSignOut() : pick(null))} onRefresh={() => { force((x) => x + 1); bumpVersion() }} />
      </HashRouter>
    </DialogHost>
  )
}

function useSyncState() {
  const [s, setS] = useState<SyncState>(syncState())
  useEffect(() => onSyncState(setS), [])
  return s
}

function Shell({ org, user, auth, onSwitch, onRefresh }: { org: Row; user: Row; auth: Auth | null; onSwitch: () => void; onRefresh: () => void }) {
  const sync = useSyncState()
  const [menu, setMenu] = useState(false)
  const loc = useLocation()
  const navigate = useNavigate()
  const dlg = useDialog()
  useEffect(() => setMenu(false), [loc.pathname])
  // Android back button: close the menu or a dialog, go back a screen, and on the home screen press twice to exit.
  const backState = useRef({ menu, path: loc.pathname, last: 0 })
  backState.current.menu = menu; backState.current.path = loc.pathname
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const h = CapApp.addListener('backButton', () => {
      const st = backState.current
      const overlay = document.querySelector('.overlay') as HTMLElement | null
      if (overlay) { overlay.click(); return }
      if (st.menu) { setMenu(false); return }
      if (st.path !== '/') { window.history.length > 1 ? navigate(-1) : navigate('/'); return }
      const now = Date.now()
      if (now - st.last < 2000) { CapApp.exitApp(); return }
      st.last = now
      dlg.toast(tr('باہر نکلنے کے لیے دوبارہ دبائیں', 'Press back again to exit', 'اضغط مرة أخرى للخروج'))
    })
    return () => { h.then((x) => x.remove()) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const branches = useQuery(() => all<Row>('select * from branch where organization_id = ? order by name', [session.orgId]), [])
  const openAlerts = useQuery(() => all<{ n: number }>(
    `select count(*) n from alert a where a.status = 'open' and (? is null or a.branch_id = ?)`, [session.branchId, session.branchId]), [session.branchId])
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  const [owner, setOwner] = useState(false)
  useEffect(() => { if (auth && user.role === 'admin') isPlatformOwner().then(setOwner).catch(() => {}) }, [auth, user.role])
  const pending = !auth && pendingApproval()
  const [newer, setNewer] = useState<string | null>(null)
  useEffect(() => { checkForUpdate().then(setNewer) }, [])
  const nav = [...NAV.filter((n) => n.roles.includes(user.role)), ...(owner ? [{ to: '/requests', ur: 'نئے اداروں کی منظوری', en: 'Approve new organizations', roles: ['admin'] }] : [])]
  const branchName = branches?.find((b) => b.id === session.branchId)?.name

  return (
    <div className="shell">
      <header className="top">
        <button className="icon" aria-label="menu" onClick={() => setMenu(!menu)}>☰</button>
        <div className="brand">
          <strong>{org.name}</strong>
          <small>{user.name} · {label(ROLES, user.role)}{branchName ? ` · ${branchName}` : ''}</small>
        </div>
        <span className={`sync ${auth ? (sync.connected ? 'on' : 'off') : online ? 'on' : 'off'}`} title={`${dbMode}${sync.lastSyncedAt ? ' · ' + sync.lastSyncedAt.toLocaleString() : ''}`}>
          {!auth
            ? (online ? tr('صرف اس ڈیوائس پر', 'This device only') : tr('آف لائن · محفوظ', 'Offline · saved'))
            : sync.connected
              ? (sync.uploading || sync.downloading ? tr('سنک ہو رہا ہے…', 'Syncing…') : tr('آن لائن · سنک مکمل', 'Online · synced'))
              : tr('آف لائن · محفوظ، بعد میں سنک ہوگا', 'Offline · saved, will sync later')}
        </span>
      </header>
      <div className="body">
        <nav className={`side ${menu ? 'open' : ''}`}>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              {tr(n.ur, n.en)}
              {n.to === '/alerts' && (openAlerts?.[0]?.n ?? 0) > 0 && <span className="pill">{openAlerts![0].n}</span>}
            </NavLink>
          ))}
          <div className="side-foot">
            {user.role === 'admin' && branches && (
              <label className="field">
                <span className="flabel">{tr('مکتب', 'Branch')}</span>
                <select value={session.branchId ?? ''} onChange={(e) => {
                  try { localStorage.setItem('maktab.branch', e.target.value) } catch { /* ignore */ }
                  session.branchId = e.target.value || null; onRefresh()
                }}>
                  <option value="">{tr('تمام مکاتب', 'All branches')}</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
            )}
            <label className="field"><span className="flabel">{tr('زبان', 'Language')}</span><LangSelect onChange={onRefresh} /></label>
            {auth && <div className="hint" dir="ltr">{auth.email}</div>}
            <div className="hint" dir="ltr">v{APP_VERSION}</div>
            <button className="ghost" onClick={onSwitch}>{auth ? tr('سائن آؤٹ', 'Sign out') : tr('صارف تبدیل کریں', 'Switch user')}</button>
            {!auth && syncConfigured && isLocalOnly() && user.role === 'admin' && (
              <button className="ghost" onClick={() => { setLocalOnly(false); window.location.reload() }}>{tr('اکاؤنٹ جوڑیں اور آن لائن سنک کریں', 'Link an account and sync online')}</button>
            )}
          </div>
        </nav>
        {menu && <div className="scrim" onClick={() => setMenu(false)} />}
        <main>
          {newer && DOWNLOAD_URL && (
            <div className="banner ok" style={{ marginBottom: 12 }}>
              {tr(`نیا ورژن (${newer}) دستیاب ہے۔`, `A new version (${newer}) is available.`, `يتوفر إصدار جديد (${newer}).`)}
              <a className="btn primary sm" href={DOWNLOAD_URL}>{tr('ڈاؤن لوڈ کریں', 'Download', 'تنزيل')}</a>
            </div>
          )}
          {pending && (
            <div className="banner warn" style={{ marginBottom: 12 }}>
              {tr('آپ کے ادارے کی آن لائن منظوری کا انتظار ہے۔ تب تک سب کام اسی فون پر محفوظ ہو رہا ہے، اور منظوری ملتے ہی خود آن لائن چلا جائے گا۔', 'Your organization is waiting for online approval. Until then everything is saved on this phone and will go online by itself once approved.', 'مؤسستك بانتظار الموافقة؛ تُحفظ البيانات على الهاتف.')}
              <button className="ghost sm" onClick={() => window.location.reload()}>{tr('دوبارہ دیکھیں', 'Check again', 'تحقق مجدداً')}</button>
              <button className="ghost sm" onClick={async () => { await signOut(); window.location.reload() }}>{tr('سائن آؤٹ', 'Sign out', 'خروج')}</button>
            </div>
          )}
          <Routes>
            <Route path="/requests" element={<OrgRequests />} />
            <Route path="/" element={<Today />} />
            <Route path="/attendance/:classId/:date" element={<TakeAttendance />} />
            <Route path="/calendar" element={<CalendarScreen />} />
            <Route path="/calendar/settings/:id" element={<CalendarSettings />} />
            <Route path="/exams" element={<ExamList />} />
            <Route path="/exams/:id" element={<ExamPage />} />
            <Route path="/exams/:id/s/:sid" element={<ScoreStudent />} />
            <Route path="/schemes" element={<SchemeList />} />
            <Route path="/schemes/:id" element={<SchemeEditor />} />
            <Route path="/results/:id" element={<ExamResults />} />
            <Route path="/prizes" element={<Prizes />} />
            <Route path="/cards" element={<ResultCards />} />
            <Route path="/hadiya" element={<Hadiya />} />
            <Route path="/activity" element={<ActivityLog />} />
            <Route path="/register" element={<MonthlyRegister />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/class-record" element={<ClassRecord />} />
            <Route path="/teacher-time" element={<TeacherTime />} />
            <Route path="/students" element={<StudentIndex />} />
            <Route path="/students/new" element={<Admission />} />
            <Route path="/students/:id" element={<StudentProfile />} />
            <Route path="/families/:id" element={<FamilyView />} />
            <Route path="/setup/branches" element={<Branches />} />
            <Route path="/setup/years" element={<Years />} />
            <Route path="/setup/teachers" element={<Teachers />} />
            <Route path="/setup/classes" element={<Classes />} />
            <Route path="/setup/users" element={<Users />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="/reports/range" element={<RangeReport />} />
            <Route path="/reports/perfect" element={<PerfectList />} />
            <Route path="/reports/teachers" element={<TeacherReport />} />
            <Route path="/reports/guardian" element={<GuardianSummary />} />
            <Route path="/reports/audit" element={<AuditView />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
