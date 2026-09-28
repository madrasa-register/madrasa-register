import { addMember, syncConfigured, isLocalOnly } from '../sync'
import { useState, type ReactNode } from 'react'
import { all, insert, update, session, today, type Row } from '../db/db'
import { assignTeacher, currentTeacherOf, loadSettings, saveSetting } from '../db/repo'
import { SETTING_DEFS, type Band } from '../engine/settings'
import { customUrduFontName, saveUrduFont, removeUrduFont } from '../fonts'
import { tr, LangSelect, useQuery, Card, Empty, Num, Badge, Field, Select, useDialog, useAskReason, opts, fmtDate, TRACKS, PARTS, GENDERS, ROLES, bumpVersion } from '../ui'

// ---------- generic list + form ----------
type FieldDef = {
  key: string; ur: string; en: string; type?: 'text' | 'date' | 'time' | 'number' | 'select' | 'tel'
  options?: () => { v: string; t: string }[]; required?: boolean; show?: (r: Row) => ReactNode
}
function Crud({ title, table, fields, rows, extraActions, onCreated, defaults, branchScoped = true, beforeSave }: {
  title: string; table: string; fields: FieldDef[]; rows: Row[] | undefined
  extraActions?: (r: Row) => ReactNode; onCreated?: (id: string, data: Record<string, any>) => Promise<void>
  defaults?: Record<string, any>; branchScoped?: boolean; beforeSave?: (data: Record<string, any>) => Record<string, any>
}) {
  const d = useDialog()
  const ask = useAskReason()
  const [editing, setEditing] = useState<{ row: Row | null; data: Record<string, any> } | null>(null)
  const ok = editing && fields.every((f) => !f.required || String(editing.data[f.key] ?? '').trim())
  async function save() {
    if (!editing) return
    let data = { ...editing.data }
    for (const f of fields) if (f.type === 'number') data[f.key] = data[f.key] === '' || data[f.key] == null ? null : Number(data[f.key])
    if (beforeSave) data = beforeSave(data)
    try {
      if (editing.row) {
        const r = await ask(tr('تبدیلی کی وجہ', 'Reason for the change')); if (!r) return
        const ch: Record<string, any> = {}
        for (const f of fields) if (!f.show) ch[f.key] = data[f.key]
        await update(table, editing.row.id, ch, r)
      } else {
        const branchId = branchScoped ? (data.branch_id ?? session.branchId) : null
        const id = await insert(table, data, { branchId })
        if (onCreated) await onCreated(id, data)
      }
      setEditing(null); d.toast(tr('محفوظ ہو گیا', 'Saved'))
    } catch (e) { d.toast(String(e), 'err') }
  }
  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>{title}</h1>
        <button className="primary" onClick={() => setEditing({ row: null, data: { ...(defaults ?? {}) } })}>{tr('نیا اندراج', 'Add new')}</button>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr>{fields.map((f) => <th key={f.key}>{tr(f.ur, f.en)}</th>)}<th /></tr></thead>
          <tbody>
            {rows?.map((r) => (
              <tr key={r.id} className={r.status && r.status !== 'active' ? 'left-row' : ''}>
                {fields.map((f) => <td key={f.key}>{f.show ? f.show(r) : f.options ? f.options().find((o) => o.v === r[f.key])?.t ?? r[f.key] : ['date', 'time', 'number', 'tel'].includes(f.type ?? '') ? <Num>{f.type === 'date' ? fmtDate(r[f.key]) : r[f.key]}</Num> : r[f.key]}</td>)}
                <td><div className="row">
                  <button className="ghost sm" onClick={() => setEditing({ row: r, data: Object.fromEntries(fields.filter((f) => !f.show).map((f) => [f.key, r[f.key] ?? ''])) })}>{tr('درستی', 'Edit')}</button>
                  {extraActions?.(r)}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows?.length === 0 && <Empty>{tr('ابھی کوئی اندراج نہیں', 'Nothing yet')}</Empty>}
      </div>
      {editing && (
        <div className="overlay" onClick={() => setEditing(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{editing.row ? tr('درستی', 'Edit') : tr('نیا اندراج', 'Add new')} — {title}</h3>
            <div className="grid2">
              {fields.filter((f) => !f.show).map((f) => (
                <Field key={f.key} label={tr(f.ur, f.en) + (f.required ? ' *' : '')}>
                  {f.options ? (
                    <Select value={editing.data[f.key] ?? ''} empty="" onChange={(v) => setEditing({ ...editing, data: { ...editing.data, [f.key]: v } })} options={f.options()} />
                  ) : (
                    <input type={f.type === 'tel' ? 'tel' : f.type ?? 'text'} dir={['tel', 'number', 'time', 'date'].includes(f.type ?? '') ? 'ltr' : undefined}
                      value={editing.data[f.key] ?? ''} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, [f.key]: e.target.value } })} />
                  )}
                </Field>
              ))}
            </div>
            <div className="row end">
              <button className="ghost" onClick={() => setEditing(null)}>{tr('منسوخ', 'Cancel')}</button>
              <button className="primary" disabled={!ok} onClick={save}>{tr('محفوظ کریں', 'Save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function useStatusToggle(table: string) {
  const ask = useAskReason()
  const d = useDialog()
  return (r: Row, extra: Record<string, any> = {}) => (
    <button className="ghost sm" onClick={async () => {
      const toActive = r.status !== 'active'
      const reason = await ask(toActive ? tr('دوبارہ فعال کرنے کی وجہ', 'Reason to re-activate') : tr('غیر فعال کرنے کی وجہ', 'Reason to deactivate'),
        tr('ریکارڈ حذف نہیں ہوگا', 'The record is not deleted'))
      if (!reason) return
      await update(table, r.id, { status: toActive ? 'active' : (table === 'teacher' ? 'left' : 'inactive'), ...(toActive ? {} : extra), ...(table === 'teacher' ? { left_date: toActive ? null : today(), left_reason: toActive ? null : reason } : {}) }, reason, { action: toActive ? 'reactivate' : 'deactivate' })
      d.toast(tr('محفوظ', 'Saved'))
    }}>{r.status === 'active' ? tr('غیر فعال', 'Deactivate') : tr('فعال', 'Activate')}</button>
  )
}

// ---------- Branches ----------
export function Branches() {
  const rows = useQuery(() => all<Row>('select * from branch where organization_id = ? order by name', [session.orgId]), [])
  return <Crud title={tr('مکاتب (شاخیں)', 'Branches')} table="branch" rows={rows} branchScoped={false} defaults={{ weekly_holiday: 'sun' }} fields={[
    { key: 'name', ur: 'نام', en: 'Name', required: true },
    { key: 'address', ur: 'پتہ', en: 'Address' },
    { key: 'weekly_holiday', ur: 'ہفتہ وار تعطیل', en: 'Weekly holiday', required: true, options: () => [{ v: 'sun', t: tr('اتوار', 'Sunday') }, { v: 'fri', t: tr('جمعہ', 'Friday') }] },
  ]} />
}

// ---------- Academic years ----------
export function Years() {
  const rows = useQuery(() => all<Row>('select * from academic_year where organization_id = ? order by start_date desc', [session.orgId]), [])
  return (
    <>
      <Crud title={tr('تعلیمی سال', 'Academic years')} table="academic_year" rows={rows} branchScoped={false} fields={[
        { key: 'label', ur: 'سال', en: 'Label', required: true },
        { key: 'start_date', ur: 'آغاز (عیدالفطر کی تعطیلات کے بعد)', en: 'Start (after Eid al-Fitr holidays)', type: 'date', required: true },
        { key: 'end_date', ur: 'اختتام', en: 'End', type: 'date' },
      ]} />
    </>
  )
}

// ---------- Teachers ----------
export function Teachers() {
  const rows = useQuery(() => all<Row>(`select t.*, b.name branch_name,
      (select group_concat(c.name, '، ') from class_teacher ct join class c on c.id = ct.class_id where ct.teacher_id = t.id and (ct.to_date is null or ct.to_date = '')) classes
    from teacher t left join branch b on b.id = t.branch_id where t.organization_id = ? and (? is null or t.branch_id = ?) order by t.status, t.name`, [session.orgId, session.branchId, session.branchId]), [])
  const branches = useQuery(() => all<Row>('select * from branch where organization_id = ?', [session.orgId]), [])
  const toggle = useStatusToggle('teacher')
  const d = useDialog()
  return <Crud title={tr('اساتذہ', 'Teachers')} table="teacher" rows={rows} defaults={{ status: 'active', gender: 'm', branch_id: session.branchId ?? '' }}
    onCreated={async (id, data) => {
      // every teacher gets a user record; the login is given from the Users screen
      await insert('app_user', { name: data.name, role: 'teacher', teacher_id: id, status: 'active' }, { branchId: data.branch_id ?? session.branchId })
      d.toast(tr('معلم کے لیے صارف بھی بن گیا', 'A user was created for the teacher'))
    }}
    extraActions={(r) => toggle(r)}
    fields={[
      { key: 'name', ur: 'نام', en: 'Name', required: true },
      { key: 'phone', ur: 'فون', en: 'Phone', type: 'tel' },
      { key: 'gender', ur: 'معلم / معلمہ', en: 'Male / female', options: () => [{ v: 'm', t: tr('معلم', 'Male') }, { v: 'f', t: tr('معلمہ', 'Female') }] },
      { key: 'branch_id', ur: 'مکتب', en: 'Branch', required: true, options: () => (branches ?? []).map((b) => ({ v: b.id, t: b.name })) },
      { key: 'classes', ur: 'جماعتیں', en: 'Classes', show: (r) => r.classes ?? '—' },
      { key: 'status', ur: 'کیفیت', en: 'Status', show: (r) => r.status === 'active' ? <Badge kind="ok">{tr('فعال', 'Active')}</Badge> : <Badge kind="muted">{tr('فارغ', 'Left')} <Num>{fmtDate(r.left_date)}</Num></Badge> },
    ]} />
}

// ---------- Classes ----------
export function Classes() {
  const d = useDialog()
  const ask = useAskReason()
  const rows = useQuery(async () => {
    const cs = await all<Row>(`select c.*, y.label year_label, b.name branch_name,
      (select count(*) from enrollment e where e.class_id = c.id and (e.to_date is null or e.to_date = '')) n
      from class c left join academic_year y on y.id = c.academic_year_id left join branch b on b.id = c.branch_id
      where c.organization_id = ? and (? is null or c.branch_id = ?) order by c.status, c.name`, [session.orgId, session.branchId, session.branchId])
    return Promise.all(cs.map(async (c) => ({ ...c, teacher: (await currentTeacherOf(c.id))?.name ?? '' })))
  }, [])
  const years = useQuery(() => all<Row>('select * from academic_year where organization_id = ? order by start_date desc', [session.orgId]), [])
  const branches = useQuery(() => all<Row>('select * from branch where organization_id = ?', [session.orgId]), [])
  const teachers = useQuery(() => all<Row>(`select * from teacher where organization_id = ? and status = 'active' and (? is null or branch_id = ?) order by name`, [session.orgId, session.branchId, session.branchId]), [])
  const toggle = useStatusToggle('class')
  const [assign, setAssign] = useState<Row | null>(null)
  const [tid, setTid] = useState('')
  const [from, setFrom] = useState(today())
  return (
    <>
      <Crud title={tr('جماعتیں', 'Classes')} table="class" rows={rows}
        defaults={{ status: 'active', shift: 'morning', gender: 'boys', academic_year_id: years?.[0]?.id ?? '', branch_id: session.branchId ?? '' }}
        extraActions={(r) => <>
          <button className="ghost sm" onClick={() => { setAssign(r); setTid(''); setFrom(today()) }}>{tr('معلم مقرر کریں', 'Assign teacher')}</button>
          {toggle(r)}
        </>}
        fields={[
          { key: 'name', ur: 'نام', en: 'Name', required: true },
          { key: 'branch_id', ur: 'مکتب', en: 'Branch', required: true, options: () => (branches ?? []).map((b) => ({ v: b.id, t: b.name })) },
          { key: 'academic_year_id', ur: 'تعلیمی سال', en: 'Year', required: true, options: () => (years ?? []).map((y) => ({ v: y.id, t: y.label })) },
          { key: 'track', ur: 'شعبہ', en: 'Track', required: true, options: () => opts(TRACKS) },
          { key: 'curriculum_part', ur: 'حصہ', en: 'Part', required: true, options: () => opts(PARTS) },
          { key: 'gender', ur: 'بنین / بنات', en: 'Boys / girls', required: true, options: () => opts(GENDERS) },
          { key: 'shift', ur: 'وقت', en: 'Shift', options: () => [{ v: 'morning', t: tr('صبح', 'Morning') }, { v: 'afternoon', t: tr('ظہر تا عصر', 'Zuhr–Asr') }, { v: 'evening', t: tr('شام', 'Evening') }] },
          { key: 'start_time', ur: 'آغاز', en: 'Starts', type: 'time' },
          { key: 'end_time', ur: 'اختتام', en: 'Ends', type: 'time' },
          { key: 'capacity', ur: 'گنجائش', en: 'Capacity', type: 'number' },
          { key: 'teacher', ur: 'معلم', en: 'Teacher', show: (r) => r.teacher || '—' },
          { key: 'n', ur: 'طلبہ', en: 'Students', show: (r) => <Num>{r.n}</Num> },
        ]}
      />
      {assign && (
        <div className="overlay" onClick={() => setAssign(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{tr('معلم مقرر کریں', 'Assign teacher')} — {assign.name}</h3>
            <Field label={tr('معلم', 'Teacher')}><Select value={tid} onChange={setTid} empty="" options={(teachers ?? []).map((t) => ({ v: t.id, t: t.name }))} /></Field>
            <Field label={tr('کب سے', 'From')}><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <p className="hint">{tr('پچھلے معلم کی تاریخ محفوظ رہے گی', 'The previous teacher’s period is kept')}</p>
            <div className="row end">
              <button className="ghost" onClick={() => setAssign(null)}>{tr('منسوخ', 'Cancel')}</button>
              <button className="primary" disabled={!tid} onClick={async () => {
                let reason: string | null = null
                if (assign.teacher) { reason = await ask(tr('معلم تبدیل کرنے کی وجہ', 'Reason for changing teacher')); if (!reason) return }
                await assignTeacher(assign.id, tid, from, reason); setAssign(null); d.toast(tr('مقرر ہو گیا', 'Assigned'))
              }}>{tr('محفوظ کریں', 'Save')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ---------- Users ----------
export function Users() {
  const rows = useQuery(() => all<Row>(`select u.*, b.name branch_name from app_user u left join branch b on b.id = u.branch_id where u.organization_id = ? and (? is null or u.branch_id = ? or u.role = 'admin') order by u.role, u.name`, [session.orgId, session.branchId, session.branchId]), [])
  const branches = useQuery(() => all<Row>('select * from branch where organization_id = ?', [session.orgId]), [])
  const teachers = useQuery(() => all<Row>(`select * from teacher where organization_id = ? order by name`, [session.orgId]), [])
  const toggle = useStatusToggle('app_user')
  const roles = ROLES.filter((r) => session.role === 'admin' || r.v !== 'admin')
  const d = useDialog()
  async function giveLogin(r: Row) {
    if (!r.email) return d.toast(tr('پہلے اس صارف کا ای میل درج کریں (ترمیم)', 'First enter this user\'s e-mail (Edit)'), 'err')
    try {
      const res = await addMember(r.email, r.role, r.role === 'admin' ? null : r.branch_id, r.id)
      d.toast(res === 'ok' ? tr('لاگ اِن دے دیا گیا — اب وہ اس ای میل سے سائن اِن کر سکتے ہیں', 'Login given — they can now sign in with this e-mail')
        : res === 'no-such-user' ? tr('اس ای میل کا اکاؤنٹ ابھی نہیں بنا۔ پہلے وہ ایپ میں «نیا اکاؤنٹ» بنائیں، پھر یہ بٹن دوبارہ دبائیں۔', 'No account with this e-mail yet. They should first create one in the app ("New account"), then press this again.')
        : res === 'not-allowed' ? tr('آپ کو یہ اجازت نہیں', 'You are not allowed to do this') : res, res === 'ok' ? 'ok' : 'err')
    } catch (e) { d.toast(tr('انٹرنیٹ درکار ہے', 'Internet needed') + ' — ' + String(e), 'err') }
  }
  const signedIn = syncConfigured && !isLocalOnly()
  return <Crud title={tr('صارفین', 'Users')} table="app_user" rows={rows} defaults={{ status: 'active', role: 'nazim', branch_id: session.branchId ?? '' }}
    extraActions={(r) => <>{toggle(r)}{signedIn && r.status === 'active' && <button className="ghost sm" onClick={() => giveLogin(r)}>{tr('لاگ اِن دیں', 'Give login')}</button>}</>}
    beforeSave={(x) => ({ ...x, branch_id: x.role === 'admin' ? null : x.branch_id })}
    fields={[
      { key: 'name', ur: 'نام', en: 'Name', required: true },
      { key: 'role', ur: 'کردار', en: 'Role', required: true, options: () => opts(roles) },
      { key: 'branch_id', ur: 'مکتب', en: 'Branch', options: () => (branches ?? []).map((b) => ({ v: b.id, t: b.name })) },
      { key: 'email', ur: 'ای میل (لاگ اِن کے لیے)', en: 'E-mail (for login)' },
      { key: 'teacher_id', ur: 'معلم ریکارڈ', en: 'Teacher record', options: () => (teachers ?? []).map((t) => ({ v: t.id, t: t.name })) },
      { key: 'status', ur: 'کیفیت', en: 'Status', show: (r) => r.status === 'active' ? <Badge kind="ok">{tr('فعال', 'Active')}</Badge> : <Badge kind="muted">{tr('غیر فعال', 'Inactive')}</Badge> },
    ]} />
}

// ---------- Settings ----------
const SETTING_LABEL: Record<string, [string, string]> = {
  'attendance.bands': ['حاضری کے نمبر (10) — فیصد کی حد', 'Attendance marks (10) — percentage bands'],
  'attendance.leaveCountsAsAbsent': ['رخصت فیصد میں غیر حاضری شمار ہو', 'Leave counts as absence in %'],
  'attendance.eligibilityMinPercent': ['امتحان میں شرکت کے لیے کم از کم حاضری %', 'Minimum attendance % to sit the exam'],
  'alerts.consecutiveAbsences': ['مسلسل غیر حاضری کے دن جن پر الرٹ آئے', 'Consecutive absences that raise an alert'],
  'alerts.leaveBreaksStreak': ['درمیان میں رخصت آنے سے گنتی ختم ہو جائے', 'A leave day in between resets the count'],
  'phone.countryCode': ['واٹس ایپ کے لیے ملکی کوڈ', 'Country code for WhatsApp'],
  'ui.language': ['بنیادی زبان', 'Primary language'],
  'hijri.offsetDays': ['ہجری تاریخ کا فرق (دن)', 'Hijri offset (days)'],
  'calendar.startShawwalDay': ['تعلیمی سال کا آغاز شوال کی کس تاریخ کو ہو', 'Shawwal day on which the year opens'],
  'calendar.ceremonyDaysBeforeRamadan': ['سالانہ اجتماع رمضان سے کتنے دن پہلے ختم ہو', 'Days before Ramadan that the annual ijtima ends'],
  'calendar.practiceWeekday': ['عملی مشق کا دن (0 = اتوار … 6 = ہفتہ)', 'Practice weekday (0 = Sunday … 6 = Saturday)'],
  'position.tieStyle': ['برابر نمبروں پر پوزیشن', 'Position for equal totals'],
  'hadiya.defaultAmount': ['ماہانہ ہدیہ کی عام مقدار (روپے)', 'Default monthly hadiya (Rs)'],
  'hadiya.shareWithHeadOffice': ['ہیڈ آفس کو ہدیہ کی تفصیل دکھائیں', 'Show hadiya details to head office'],
  'prizes.teacherShare': ['معلم کے انعام کے لیے ممتاز / صاحبِ ترتیب طلبہ %', 'Teacher prize: % of class ممتاز or صاحبِ ترتیب'],
  'card.instructions': ['نتیجہ کارڈ پر سرپرست کے لیے چھ ہدایات', 'Six guardian instructions on the result card'],
}
const CHOICE_LABEL: Record<string, [string, string]> = {
  competition: ['1، 1، 3 (اگلی پوزیشن چھوڑ دی جائے)', '1, 1, 3 (next position skipped)'],
  dense: ['1، 1، 2 (اگلی پوزیشن نہ چھوڑی جائے)', '1, 1, 2 (no position skipped)'],
}
export function SettingsScreen() {
  const d = useDialog()
  const ask = useAskReason()
  const [scope, setScope] = useState<'org' | 'branch'>(session.role === 'admin' ? 'org' : 'branch')
  const branchId = scope === 'branch' ? session.branchId : null
  const st = useQuery(() => loadSettings(branchId), [scope])
  const [draft, setDraft] = useState<Record<string, any>>({})
  if (!st) return null
  const val = (k: string) => (k in draft ? draft[k] : st[k])
  async function save(k: string) {
    const r = await ask(tr('ترتیب بدلنے کی وجہ', 'Reason for changing the setting')); if (!r) return
    await saveSetting(k, draft[k], branchId, r)
    const n = { ...draft }; delete n[k]; setDraft(n); bumpVersion(); d.toast(tr('محفوظ', 'Saved'))
  }
  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>{tr('ترتیبات', 'Settings')}</h1>
        <Select value={scope} onChange={(v) => { setScope(v as any); setDraft({}) }} options={[
          ...(session.role === 'admin' ? [{ v: 'org', t: tr('پورا ادارہ', 'Whole organization') }] : []),
          ...(session.branchId ? [{ v: 'branch', t: tr('صرف یہ مکتب', 'This branch only') }] : []),
        ]} />
      </div>
      <p className="hint">{tr('ہر قاعدہ یہاں سے بدلا جا سکتا ہے۔', 'Every rule can be changed here.', 'يمكن تغيير كل قاعدة من هنا.')}</p>
      <FontCard />
      {SETTING_DEFS.filter((s) => s.key !== 'ui.language' && s.key !== 'hijri.offsetDays').map((s) => (
        <Card key={s.key} title={tr(...(SETTING_LABEL[s.key] ?? [s.key, s.key]))}
          actions={s.key in draft && <button className="primary sm" onClick={() => save(s.key)}>{tr('محفوظ کریں', 'Save')}</button>}>
          {s.kind === 'bands' ? (
            <BandsEditor bands={val(s.key) as Band[]} onChange={(b) => setDraft({ ...draft, [s.key]: b })} />
          ) : s.kind === 'choice' ? (
            <Select value={String(val(s.key))} onChange={(v) => setDraft({ ...draft, [s.key]: v })} options={(s.choices ?? []).map((c) => ({ v: c, t: CHOICE_LABEL[c] ? tr(...CHOICE_LABEL[c]) : c }))} />
          ) : s.key === 'card.instructions' ? (
            <textarea rows={6} value={String(val(s.key) ?? '')} placeholder={tr('ہر ہدایت الگ سطر میں (چھپے ہوئے کارڈ سے)', 'One instruction per line (from the printed card)', 'تعليمة في كل سطر')} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })} />
          ) : s.kind === 'boolean' ? (
            <label className="check"><input type="checkbox" checked={!!val(s.key)} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.checked })} /> {val(s.key) ? tr('ہاں', 'Yes') : tr('نہیں', 'No')}</label>
          ) : (
            <input dir="ltr" type={s.kind === 'number' ? 'number' : 'text'} value={String(val(s.key))} onChange={(e) => setDraft({ ...draft, [s.key]: s.kind === 'number' ? Number(e.target.value) : e.target.value })} />
          )}
        </Card>
      ))}
    </div>
  )
}
function BandsEditor({ bands, onChange }: { bands: Band[]; onChange: (b: Band[]) => void }) {
  const sorted = [...bands].sort((a, b) => b.min - a.min)
  const set = (i: number, k: keyof Band, v: string) => onChange(sorted.map((b, j) => (j === i ? { ...b, [k]: Number(v) } : b)))
  return (
    <div>
      <table className="tbl narrow">
        <thead><tr><th>{tr('کم از کم %', 'From %')}</th><th>{tr('نمبر', 'Marks')}</th><th /></tr></thead>
        <tbody>{sorted.map((b, i) => (
          <tr key={i}>
            <td><input dir="ltr" type="number" value={b.min} onChange={(e) => set(i, 'min', e.target.value)} /></td>
            <td><input dir="ltr" type="number" value={b.marks} onChange={(e) => set(i, 'marks', e.target.value)} /></td>
            <td><button className="ghost sm" onClick={() => onChange(sorted.filter((_, j) => j !== i))}>✕</button></td>
          </tr>
        ))}</tbody>
      </table>
      <button className="ghost sm" onClick={() => onChange([...sorted, { min: 0, marks: 0 }])}>{tr('حد شامل کریں', 'Add band')}</button>
      <p className="hint">{tr('حد صرف اس وقت ملتی ہے جب فیصد اس کی نچلی حد تک پہنچے (89.6% = 80–89%)', 'A band is reached only at its lower edge (89.6% is in 80–89%)')}</p>
    </div>
  )
}

function FontCard() {
  const d = useDialog()
  const [name, setName] = useState(customUrduFontName)
  return (
    <Card title={tr('زبان اور خطوط', 'Language and fonts', 'اللغة والخطوط')}>
      <div className="grid2">
        <Field label={tr('زبان', 'Language')}><LangSelect /></Field>
        <Field label={tr('اردو خط', 'Urdu font')}>
          <div><b>{name ?? 'Noto Nastaliq Urdu'}</b></div>
        </Field>
      </div>
      <div className="row wrap">
        <label className="btn ghost">
          {tr('خط کی فائل لوڈ کریں (مثلاً جمیل نوری نستعلیق)', 'Load font file (e.g. Jameel Noori Nastaleeq)', 'تحميل ملف خط (مثل جميل نوري نستعليق)')}
          <input type="file" accept=".ttf,.otf,.woff,.woff2" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return
            try { await saveUrduFont(f); setName(f.name); d.toast(tr('خط لوڈ ہو گیا', 'Font loaded')) } catch { d.toast(tr('یہ فائل درست خط نہیں', 'This file is not a valid font', 'هذا الملف ليس خطاً صالحاً'), 'err') }
            e.target.value = ''
          }} />
        </label>
        {name && <button className="ghost" onClick={async () => { await removeUrduFont(); setName(null) }}>{tr('لوڈ شدہ خط ہٹائیں', 'Remove loaded font')}</button>}
      </div>
      <p className="hint">{tr('کوئی اور اردو خط (جیسے جمیل نوری) ہو تو یہاں لوڈ کریں؛ یہ اسی فون پر رہے گا۔', 'Have another Urdu font (e.g. Jameel Noori)? Load it here; it stays on this phone.', 'إن كان لديك خط أردي آخر فحمّله هنا؛ يبقى على هذا الهاتف.')}</p>
    </Card>
  )
}
