// Home header: app title, the eight main parts as tiles, and who is using the app.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { shareApp } from '../update'
import { get, session, type Row } from '../db/db'
import { tr, useQuery, label, ROLES, appName } from '../ui'

// order follows the paper register: admission index, monthly attendance, lesson record, fees, then the rest
const TILES: { to: string; ur: string; en: string; ar: string; icon: string }[] = [
  { to: '/students', ur: 'داخلہ', en: 'Admission', ar: 'القبول', icon: '👥' },
  { to: '/register', ur: 'حاضری', en: 'Attendance', ar: 'الحضور', icon: '📖' },
  { to: '/class-record', ur: 'سبق ریکارڈ', en: 'Lesson record', ar: 'سجل الدرس', icon: '📋' },
  { to: '/hadiya', ur: 'فیس', en: 'Fees', ar: 'الرسوم', icon: '💰' },
  { to: '/calendar', ur: 'تعلیمی کیلنڈر', en: 'Calendar', ar: 'التقويم', icon: '📅' },
  { to: '/exams', ur: 'امتحانات', en: 'Exams', ar: 'الامتحانات', icon: '📝' },
  { to: '/cards', ur: 'نتیجہ کارڈ', en: 'Result cards', ar: 'البطاقات', icon: '🎓' },
  { to: '/activity', ur: 'چھ امور', en: 'Activities', ar: 'الأمور الستة', icon: '✅' },
  { to: '/prizes', ur: 'انعامات', en: 'Prizes', ar: 'الجوائز', icon: '🏆' },
]

export function Cover({ user }: { user: Row }) {
  const branch = useQuery(() => (session.branchId ? get('branch', session.branchId) : Promise.resolve(null)), [session.branchId])
  const [note, setNote] = useState('')
  const org = useQuery(() => get('organization', session.orgId), [])
  return (
    <div className="cover">
      <div className="cover-band">
        <h1>{appName()}</h1>
        <small>{org?.name}{branch?.name ? ` · ${branch.name}` : ''}</small>
      </div>
      <div className="tiles">
        {TILES.map((t, i) => (
          <Link key={t.to} to={t.to} className="tile" style={{ ['--c' as any]: `var(--s${i + 1})` }}>
            <span className="tile-ic" aria-hidden>{t.icon}</span>
            <span>{tr(t.ur, t.en, t.ar)}</span>
          </Link>
        ))}
      </div>
      <div className="cover-share">
        <button className="btn share" onClick={async () => { const r = await shareApp(); if (r !== 'shared') { setNote(r); setTimeout(() => setNote(''), 3000) } }}>
          <span aria-hidden>📤</span> {tr('ایپ شیئر کریں', 'Share the app', 'شارك التطبيق')}
        </button>
        {note === 'copied' && <div className="hint">{tr('لنک کاپی ہو گیا، اب کہیں بھی چسپاں کریں۔', 'Link copied — paste it anywhere.', 'تم نسخ الرابط، الصقه حيث تشاء.')}</div>}
        {note === 'failed' && <div className="hint">{tr('شیئر نہیں ہو سکا۔', 'Could not share.', 'تعذرت المشاركة.')}</div>}
      </div>
      <div className="cover-who">{user.name} · {label(ROLES, user.role)}</div>
    </div>
  )
}
