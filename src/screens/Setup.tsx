import { useState } from 'react'
import { all, session, type Row } from '../db/db'
import { setupOrganization } from '../db/repo'
import { appName, tr, Field, Select, useQuery, label, ROLES, useDialog, LangSelect, bumpVersion } from '../ui'
import { loadSampleData } from '../sample'
import { toHijri, addDaysIso } from '../engine/hijri'
import { startFromShawwal } from '../engine/calendar'
import { today } from '../db/db'

/** Opening of the current academic year: 6 Shawwal (Umm al-Qura), past the weekly holiday, as in the printed calendars. */
function suggestYearStart(weeklyHoliday: string): string {
  const t = today()
  const br = { weeklyHoliday: weeklyHoliday === 'fri' ? 5 : 0, practiceWeekday: 6 }
  const h = toHijri(t)
  let d = startFromShawwal(h.y, 6, br, t)
  if (!d || d > t) d = startFromShawwal(h.y - 1, 6, br, addDaysIso(t, -300))
  return d ?? t
}
function yearLabelFor(start: string) { const y = Number(start.slice(0, 4)); return `${y}/${String(y + 1).slice(2)}` }

export function SetupWizard({ onStart, onDone }: { onStart: () => void; onDone: (userId: string) => void }) {
  const d = useDialog()
  const [f, setF] = useState(() => { const st = suggestYearStart('sun'); return {
    orgName: '', branchName: '', address: '', weeklyHoliday: 'sun',
    adminName: '', yearLabel: yearLabelFor(st), yearStart: st,
  } })
  const [busy, setBusy] = useState(false)
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target ? e.target.value : e })
  const ok = f.orgName.trim() && f.branchName.trim() && f.adminName.trim() && f.yearStart && f.yearLabel.trim()

  async function go(sample: boolean) {
    setBusy(true)
    onStart()
    try {
      const r = await setupOrganization(f)
      session.branchId = r.branchId
      session.userId = r.userId
      if (sample) await loadSampleData(r.branchId)
      bumpVersion()
      onDone(r.userId)
    } catch (e) {
      console.error('setup failed', e); d.toast(String(e), 'err'); setBusy(false)
    }
  }

  return (
    <div className="center-page">
      <div className="card narrow">
        <div className="row between">
          <h1>{appName()} — {tr('پہلی بار ترتیب', 'first-time setup', 'الإعداد الأول')}</h1>
          <div style={{ width: 130 }}><LangSelect onChange={() => setF({ ...f })} /></div>
        </div>
        <p className="muted">{tr('یہ معلومات صرف ایک بار درکار ہیں۔', 'Needed only once.')}</p>
        <Field label={tr('ادارے کا نام', 'Organization name')}><input value={f.orgName} onChange={set('orgName')} /></Field>
        <Field label={tr('پہلے مکتب (شاخ) کا نام', 'First branch name')}><input value={f.branchName} onChange={set('branchName')} /></Field>
        <Field label={tr('پتہ', 'Address')}><input value={f.address} onChange={set('address')} /></Field>
        <Field label={tr('ہفتہ وار تعطیل', 'Weekly holiday')}>
          <Select value={f.weeklyHoliday} onChange={set('weeklyHoliday')} options={[{ v: 'sun', t: tr('اتوار', 'Sunday') }, { v: 'fri', t: tr('جمعہ', 'Friday') }]} />
        </Field>
        <Field label={tr('آپ کا نام (ہیڈ آفس ایڈمن)', 'Your name (head office admin)')}><input value={f.adminName} onChange={set('adminName')} /></Field>
        <div className="grid2">
          <Field label={tr('تعلیمی سال', 'Academic year')}><input value={f.yearLabel} onChange={set('yearLabel')} dir="ltr" /></Field>
          <Field label={tr('سال کا آغاز (عیدالفطر کی تعطیلات کے بعد)', 'Year start (after Eid al-Fitr holidays)')}
            hint={tr('6 شوال (ام القریٰ)؛ بدل سکتے ہیں', '6 Shawwal (Umm al-Qura); you can change it')}>
            <input type="date" value={f.yearStart} onChange={set('yearStart')} />
          </Field>
        </div>
        {busy && <div className="banner">{tr('ڈیٹا تیار ہو رہا ہے…', 'Preparing data…')}</div>}
        <div className="row end wrap">
          <button className="ghost" disabled={!ok || busy} onClick={() => go(true)}>{tr('نمونہ ڈیٹا کے ساتھ شروع کریں (ٹیسٹ کے لیے)', 'Start with sample data (for testing)')}</button>
          <button className="primary" disabled={!ok || busy} onClick={() => go(false)}>{tr('شروع کریں', 'Start')}</button>
        </div>
      </div>
    </div>
  )
}

export function UserPicker({ org, onPick }: { org: Row; onPick: (id: string) => void }) {
  const users = useQuery(() => all<Row>(`select u.*, b.name branch_name from app_user u left join branch b on b.id = u.branch_id
    where u.organization_id = ? and u.status = 'active' order by case u.role when 'admin' then 0 when 'nazim' then 1 when 'teacher' then 2 else 3 end, u.name`, [org.id]), [])
  return (
    <div className="center-page">
      <div className="card narrow">
        <h1>{org.name}</h1>
        <p className="muted">{tr('کون استعمال کر رہا ہے؟', 'Who is using the app?')}</p>
        <div className="list">
          {users?.map((u) => (
            <button key={u.id} className="list-item" onClick={() => onPick(u.id)}>
              <strong>{u.name}</strong>
              <span className="muted">{label(ROLES, u.role)}{u.branch_name ? ` · ${u.branch_name}` : ''}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
