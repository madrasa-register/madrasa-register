// Home header: app title, the eight main parts as tiles, and who is using the app.
import { Link } from 'react-router-dom'
import { get, session, type Row } from '../db/db'
import { tr, useQuery, label, ROLES, appName } from '../ui'

const TILES: { to: string; ur: string; en: string; ar: string; icon: string }[] = [
  { to: '/calendar', ur: 'تعلیمی کیلنڈر', en: 'Calendar', ar: 'التقويم', icon: '📅' },
  { to: '/exams', ur: 'امتحانات', en: 'Exams', ar: 'الامتحانات', icon: '📝' },
  { to: '/cards', ur: 'نتیجہ کارڈ', en: 'Result cards', ar: 'البطاقات', icon: '🎓' },
  { to: '/register', ur: 'ماہانہ رجسٹر', en: 'Register', ar: 'السجل', icon: '📖' },
  { to: '/students', ur: 'طلبہ', en: 'Students', ar: 'الطلاب', icon: '👥' },
  { to: '/hadiya', ur: 'ہدیہ', en: 'Hadiya', ar: 'الهدية', icon: '💰' },
  { to: '/activity', ur: 'چھ امور', en: 'Activities', ar: 'الأمور الستة', icon: '✅' },
  { to: '/prizes', ur: 'انعامات', en: 'Prizes', ar: 'الجوائز', icon: '🏆' },
]

export function Cover({ user }: { user: Row }) {
  const branch = useQuery(() => (session.branchId ? get('branch', session.branchId) : Promise.resolve(null)), [session.branchId])
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
      <div className="cover-who">{user.name} · {label(ROLES, user.role)}</div>
    </div>
  )
}
