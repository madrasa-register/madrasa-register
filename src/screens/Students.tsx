import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { all, get, one, session, today, update, type Row } from '../db/db'
import {
  myClasses, findFamiliesByPhone, admitStudent, withdrawStudent, transferStudent, rejoinStudent, studentPeriod, loadSettings, activeEnrollment,
} from '../db/repo'
import { ageYM, summarize, fmtPercent, attendanceMarks } from '../engine/attendance'
import type { Band } from '../engine/settings'
import {
  tr, useQuery, Card, Empty, Num, Badge, Field, Select, useDialog, useAskReason, fmtDate, label, opts,
  TRACKS, PARTS, STUDENT_GENDERS, monthStart, monthEnd, addDays, STATUS_LABEL,
} from '../ui'

export function ageText(dob?: string) {
  const a = dob ? ageYM(dob, today()) : null
  return a ? tr(`${a.years} سال ${a.months} ماہ`, `${a.years} y ${a.months} m`, `${a.years} سنة ${a.months} شهر`) : '—'
}

// ============ Student master index ============
export function StudentIndex() {
  const [q, setQ] = useState('')
  const [classId, setClassId] = useState('')
  const [track, setTrack] = useState('')
  const [part, setPart] = useState('')
  const [status, setStatus] = useState('active')
  const classes = useQuery(() => myClasses(), [])
  const rows = useQuery(async () => {
    const mine = session.role === 'teacher' ? (await myClasses()).map((c) => c.id) : null
    const list = await all<Row>(`select s.*, f.phone1, f.guardian_name,
        e.class_id, e.track, e.curriculum_part, c.name class_name
      from student s left join family f on f.id = s.family_id
      left join enrollment e on e.id = (select id from enrollment where student_id = s.id order by from_date desc, created_at desc limit 1)
      left join class c on c.id = e.class_id
      where s.organization_id = ? and (? is null or s.branch_id = ?)
      order by s.serial_no`, [session.orgId, session.branchId, session.branchId])
    return mine ? list.filter((r) => mine.includes(r.class_id)) : list
  }, [])
  const ql = q.trim().toLowerCase()
  const shown = (rows ?? []).filter((r) =>
    (!status || r.status === status) && (!classId || r.class_id === classId) && (!track || r.track === track) && (!part || r.curriculum_part === part) &&
    (!ql || [r.name, r.walidiyat, r.phone1, String(r.serial_no), r.guardian_name].some((x) => (x ?? '').toLowerCase().includes(ql))))

  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>{tr('طلبہ کا اندراج (ماسٹر انڈیکس)', 'Student master index')}</h1>
        {session.role !== 'teacher' && <Link className="btn primary" to="/students/new">{tr('نیا داخلہ', 'New admission')}</Link>}
      </div>
      <div className="filters">
        <input placeholder={tr('تلاش: نام، ولدیت، فون، نمبر', 'Search: name, father, phone, no.')} value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={classId} onChange={setClassId} empty={tr('تمام جماعتیں', 'All classes')} options={(classes ?? []).map((c) => ({ v: c.id, t: c.name }))} />
        <Select value={track} onChange={setTrack} empty={tr('تمام شعبے', 'All tracks')} options={opts(TRACKS)} />
        <Select value={part} onChange={setPart} empty={tr('تمام حصے', 'All parts')} options={opts(PARTS)} />
        <Select value={status} onChange={setStatus} empty={tr('سب', 'All')} options={[{ v: 'active', t: tr('زیرِ تعلیم', 'Active') }, { v: 'left', t: tr('خارج', 'Left') }]} />
      </div>
      <div className="muted"><Num>{shown.length}</Num> {tr('طلبہ', 'students')}</div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr>
            <th>#</th><th>{tr('نام', 'Name')}</th><th>{tr('ولدیت', 'Father')}</th><th>{tr('جماعت', 'Class')}</th><th>{tr('شعبہ', 'Track')}</th>
            <th>{tr('حصہ', 'Part')}</th><th>{tr('عمر', 'Age')}</th><th>{tr('تاریخِ داخلہ', 'Admitted')}</th><th>{tr('فون', 'Phone')}</th><th>{tr('کیفیت', 'Status')}</th>
          </tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className={r.status === 'left' ? 'left-row' : ''}>
                <td><Num>{r.serial_no}</Num></td>
                <td><Link to={`/students/${r.id}`}>{r.status === 'left' && <span className="x">✗ </span>}<span className={r.status === 'left' ? 'strike' : ''}>{r.name}</span></Link></td>
                <td>{r.walidiyat}</td><td>{r.class_name}</td><td>{label(TRACKS, r.track)}</td><td>{label(PARTS, r.curriculum_part)}</td>
                <td>{ageText(r.dob)}</td><td><Num>{fmtDate(r.admission_date)}</Num></td><td><Num>{r.phone1}</Num></td>
                <td>{r.status === 'left' ? <Badge kind="muted">{tr('خارج', 'Left')} <Num>{fmtDate(r.left_date)}</Num></Badge> : <Badge kind="ok">{tr('زیرِ تعلیم', 'Active')}</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows && shown.length === 0 && <Empty>{tr('کوئی طالب علم نہیں ملا', 'No students found')}</Empty>}
      </div>
    </div>
  )
}

// ============ Admission ============
export function Admission() {
  const nav = useNavigate()
  const d = useDialog()
  const classes = useQuery(() => myClasses(), [])
  const years = useQuery(() => all<Row>('select * from academic_year where organization_id = ? order by start_date desc', [session.orgId]), [])
  const [s, setS] = useState({ name: '', walidiyat: '', gender: 'm', dob: '', admission_date: today(), notes: '' })
  const [fam, setFam] = useState({ guardian_name: '', relation: 'والد', phone1: '', whatsapp1: 1, phone2: '', whatsapp2: 0, address: '' })
  const [en, setEn] = useState({ classId: '', track: '', part: '', miqdar: '' })
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const matches = useQuery(() => findFamiliesByPhone(fam.phone1), [fam.phone1])
  const siblings = useQuery(() => (familyId ? all<Row>('select name, status from student where family_id = ?', [familyId]) : Promise.resolve([])), [familyId])
  const cls = classes?.find((c) => c.id === en.classId)
  const count = useQuery(() => (en.classId ? one<{ n: number }>(`select count(*) n from enrollment where class_id = ? and (to_date is null or to_date = '')`, [en.classId]) : Promise.resolve(null)), [en.classId])
  const full = cls?.capacity && (count?.n ?? 0) >= cls.capacity
  const ok = s.name.trim() && s.walidiyat.trim() && en.classId && en.track && en.part && (familyId || (fam.guardian_name.trim() && fam.phone1.trim()))

  function pickClass(id: string) {
    const c = classes?.find((x) => x.id === id)
    setEn({ ...en, classId: id, track: c?.track ?? en.track, part: c?.curriculum_part ?? en.part })
  }
  async function save() {
    setBusy(true)
    try {
      const id = await admitStudent({
        familyId, family: fam, student: s, classId: en.classId, academicYearId: cls?.academic_year_id || years?.[0]?.id || null,
        track: en.track, part: en.part, miqdar: en.miqdar, fromDate: s.admission_date,
      })
      d.toast(tr('داخلہ ہو گیا', 'Admitted'))
      nav(`/students/${id}`)
    } catch (e) { d.toast(String(e), 'err'); setBusy(false) }
  }
  const setK = (o: any, set: any, k: string) => (e: any) => set({ ...o, [k]: e?.target ? (e.target.type === 'checkbox' ? (e.target.checked ? 1 : 0) : e.target.value) : e })

  return (
    <div className="stack">
      <h1>{tr('نیا داخلہ', 'New admission')}</h1>
      <Card title={tr('سرپرست / خاندان', 'Guardian / family')}>
        <div className="grid2">
          <Field label={tr('فون نمبر 1', 'Phone 1')} hint={tr('نمبر لکھنے پر موجود خاندان تلاش ہوگا (بہن بھائی)', 'Typing finds an existing family (siblings)')}>
            <input dir="ltr" inputMode="tel" value={fam.phone1} onChange={(e) => { setFam({ ...fam, phone1: e.target.value }); setFamilyId(null) }} />
          </Field>
          <Field label="WhatsApp"><label className="check"><input type="checkbox" checked={!!fam.whatsapp1} onChange={setK(fam, setFam, 'whatsapp1')} /> {tr('اس نمبر پر واٹس ایپ ہے', 'Has WhatsApp')}</label></Field>
        </div>
        {!familyId && matches && matches.length > 0 && (
          <div className="banner">
            {tr('یہ نمبر پہلے سے موجود ہے:', 'This number already exists:')}
            {matches.map((m) => (
              <button key={m.id} className="ghost sm" onClick={() => setFamilyId(m.id)}>{m.guardian_name} (<Num>{m.phone1}</Num>) — {tr('بہن/بھائی کے طور پر جوڑیں', 'link as sibling')}</button>
            ))}
          </div>
        )}
        {familyId ? (
          <div className="banner ok">
            {tr('موجودہ خاندان سے جوڑا گیا۔ بہن بھائی:', 'Linked to existing family. Siblings:')} {siblings?.map((x) => x.name).join('، ')}
            <button className="ghost sm" onClick={() => setFamilyId(null)}>{tr('نیا خاندان', 'New family instead')}</button>
          </div>
        ) : (
          <div className="grid2">
            <Field label={tr('سرپرست کا نام', 'Guardian name')}><input value={fam.guardian_name} onChange={setK(fam, setFam, 'guardian_name')} /></Field>
            <Field label={tr('رشتہ', 'Relation')}><input value={fam.relation} onChange={setK(fam, setFam, 'relation')} /></Field>
            <Field label={tr('فون نمبر 2', 'Phone 2')}><input dir="ltr" inputMode="tel" value={fam.phone2} onChange={setK(fam, setFam, 'phone2')} /></Field>
            <Field label="WhatsApp 2"><label className="check"><input type="checkbox" checked={!!fam.whatsapp2} onChange={setK(fam, setFam, 'whatsapp2')} /> {tr('اس نمبر پر واٹس ایپ ہے', 'Has WhatsApp')}</label></Field>
            <Field label={tr('پتہ', 'Address')}><input value={fam.address} onChange={setK(fam, setFam, 'address')} /></Field>
          </div>
        )}
      </Card>
      <Card title={tr('طالب علم', 'Student')}>
        <div className="grid2">
          <Field label={tr('نام', 'Name')}><input value={s.name} onChange={setK(s, setS, 'name')} /></Field>
          <Field label={tr('ولدیت', 'Father’s name')}><input value={s.walidiyat} onChange={setK(s, setS, 'walidiyat')} /></Field>
          <Field label={tr('جنس', 'Gender')}><Select value={s.gender} onChange={setK(s, setS, 'gender')} options={opts(STUDENT_GENDERS)} /></Field>
          <Field label={tr('تاریخِ پیدائش', 'Date of birth')} hint={s.dob ? `${tr('عمر', 'Age')}: ${ageText(s.dob)}` : undefined}><input type="date" value={s.dob} onChange={setK(s, setS, 'dob')} /></Field>
          <Field label={tr('تاریخِ داخلہ', 'Admission date')}><input type="date" value={s.admission_date} onChange={setK(s, setS, 'admission_date')} /></Field>
          <Field label={tr('مقدار خواندگی', 'Reading level at admission')}><input value={en.miqdar} onChange={setK(en, setEn, 'miqdar')} /></Field>
        </div>
      </Card>
      {classes && classes.length === 0 && (
        <div className="banner warn">{tr('ابھی کوئی جماعت نہیں بنی۔ داخلے سے پہلے جماعت بنائیں۔', 'No class yet. Create a class before admitting students.', 'لا يوجد فصل بعد. أنشئ فصلاً قبل القبول.')} <Link to="/setup/classes">{tr('جماعت بنائیں', 'Create a class', 'أنشئ فصلاً')}</Link></div>
      )}
      <Card title={tr('جماعت', 'Class')}>
        <div className="grid2">
          <Field label={tr('جماعت', 'Class')}><Select value={en.classId} onChange={pickClass} empty="" options={(classes ?? []).map((c) => ({ v: c.id, t: c.name }))} /></Field>
          <Field label={tr('شعبہ', 'Track')}><Select value={en.track} onChange={setK(en, setEn, 'track')} empty="" options={opts(TRACKS)} /></Field>
          <Field label={tr('تربیتی نصاب حصہ', 'Curriculum part')}><Select value={en.part} onChange={setK(en, setEn, 'part')} empty="" options={opts(PARTS)} /></Field>
          <Field label={tr('نوٹ', 'Notes')}><input value={s.notes} onChange={setK(s, setS, 'notes')} /></Field>
        </div>
        {full && <div className="banner warn">{tr('یہ جماعت اپنی گنجائش تک پہنچ چکی ہے', 'This class has reached its capacity')} (<Num>{count?.n}/{cls?.capacity}</Num>)</div>}
      </Card>
      <div className="row end"><button className="primary" disabled={!ok || busy} onClick={save}>{tr('داخلہ محفوظ کریں', 'Save admission')}</button></div>
    </div>
  )
}

// ============ Student profile ============
export function StudentProfile() {
  const { id = '' } = useParams()
  const d = useDialog()
  const ask = useAskReason()
  const [dlg, setDlg] = useState<'' | 'withdraw' | 'transfer' | 'edit' | 'rejoin'>('')
  const data = useQuery(async () => {
    const s = await get('student', id)
    if (!s) return null
    const fam = s.family_id ? await get('family', s.family_id) : null
    const enrollments = await all<Row>(`select e.*, c.name class_name from enrollment e left join class c on c.id = e.class_id where e.student_id = ? order by e.from_date desc, e.created_at desc`, [id])
    const st = await loadSettings()
    const year = await one<Row>('select * from academic_year where organization_id = ? and start_date <= ? order by start_date desc limit 1', [session.orgId, today()])
    const m = today().slice(0, 7)
    const mp = await studentPeriod(id, monthStart(m), monthEnd(m))
    const yp = await studentPeriod(id, year?.start_date ?? '0000-01-01', today())
    const leave = st['attendance.leaveCountsAsAbsent'] as boolean
    const month = summarize(mp.dates, mp.map, leave)
    const yearSum = summarize(yp.dates, yp.map, leave)
    const recent = yp.dates.slice(-30).map((x) => ({ date: x, s: yp.map.get(x) }))
    const alerts = await all<Row>('select * from alert where student_id = ? order by trigger_date desc', [id])
    const audit = await all<Row>(`select a.*, u.name user_name from audit_log a left join app_user u on u.id = a.created_by
      where a.row_id = ? or a.row_id in (select id from enrollment where student_id = ?) or a.row_id in (select id from student_attendance where student_id = ?)
      order by a.created_at desc limit 100`, [id, id, id])
    const siblings = s.family_id ? await all<Row>('select id, name, status from student where family_id = ? and id != ?', [s.family_id, id]) : []
    return { s, fam, enrollments, month, yearSum, year, recent, alerts, audit, siblings, bands: st['attendance.bands'] as Band[] }
  }, [id])
  if (!data) return null
  const { s, fam, enrollments, month, yearSum, year, recent, alerts, audit, siblings, bands } = data
  const cur = enrollments.find((e) => !e.to_date)

  return (
    <div className="stack">
      <div className="row between wrap">
        <div>
          <h1>{s.status === 'left' && <span className="x">✗ </span>}{s.name} <span className="muted">{tr('ولد', 's/o')} {s.walidiyat}</span></h1>
          <div className="muted">#<Num>{s.serial_no}</Num> · {cur?.class_name ?? '—'} · {label(TRACKS, cur?.track)} · {label(PARTS, cur?.curriculum_part)} · {ageText(s.dob)}</div>
        </div>
        {session.role !== 'teacher' && (
          <div className="row wrap">
            <button className="ghost" onClick={() => setDlg('edit')}>{tr('درستی', 'Correct details')}</button>
            {s.status === 'active' ? <>
              <button className="ghost" onClick={() => setDlg('transfer')}>{tr('جماعت / حصہ تبدیل', 'Transfer / promote')}</button>
              <button className="danger" onClick={() => setDlg('withdraw')}>{tr('خارج کریں', 'Withdraw')}</button>
            </> : <button className="ghost" onClick={() => setDlg('rejoin')}>{tr('دوبارہ داخلہ', 'Re-admit')}</button>}
          </div>
        )}
      </div>
      {s.status === 'left' && <div className="banner">{tr('خارج', 'Left')}: <Num>{fmtDate(s.left_date)}</Num> — {s.left_reason}</div>}

      <div className="grid2">
        <Card title={tr('اس ماہ کی حاضری', 'This month')}><AttSummary s={month} bands={bands} /></Card>
        <Card title={`${tr('تعلیمی سال', 'Academic year')} ${year?.label ?? ''}`}><AttSummary s={yearSum} bands={bands} /></Card>
      </div>
      <Card title={tr('آخری 30 تدریسی دن', 'Last 30 teaching days')}>
        <div className="dots">{recent.map((r) => <span key={r.date} className={`dot ${r.s ?? 'U'}`} title={`${fmtDate(r.date)} ${r.s ?? ''}`}>{r.s ?? '·'}</span>)}</div>
      </Card>
      <div className="grid2">
        <Card title={tr('ذاتی معلومات', 'Details')}>
          <dl className="dl">
            <dt>{tr('جنس', 'Gender')}</dt><dd>{label(STUDENT_GENDERS, s.gender)}</dd>
            <dt>{tr('تاریخِ پیدائش', 'Date of birth')}</dt><dd><Num>{fmtDate(s.dob)}</Num></dd>
            <dt>{tr('تاریخِ داخلہ', 'Admission date')}</dt><dd><Num>{fmtDate(s.admission_date)}</Num></dd>
            <dt>{tr('مقدار خواندگی', 'Reading level')}</dt><dd>{cur?.miqdar || enrollments[enrollments.length - 1]?.miqdar || '—'}</dd>
            <dt>{tr('نوٹ', 'Notes')}</dt><dd>{s.notes || '—'}</dd>
          </dl>
        </Card>
        <Card title={tr('سرپرست', 'Guardian')} actions={fam && <Link to={`/families/${fam.id}`}>{tr('خاندان', 'Family')}</Link>}>
          {fam && <dl className="dl">
            <dt>{tr('نام', 'Name')}</dt><dd>{fam.guardian_name} ({fam.relation})</dd>
            <dt>{tr('فون', 'Phone')}</dt><dd><Num>{fam.phone1}</Num>{fam.whatsapp1 ? ' · WhatsApp' : ''}{fam.phone2 ? <> · <Num>{fam.phone2}</Num></> : null}</dd>
            <dt>{tr('بہن بھائی', 'Siblings')}</dt><dd>{siblings.length ? siblings.map((x) => <Link key={x.id} to={`/students/${x.id}`}>{x.name} </Link>) : '—'}</dd>
          </dl>}
        </Card>
      </div>
      <Card title={tr('جماعت کی تاریخ', 'Enrollment history')}>
        <table className="tbl"><thead><tr><th>{tr('جماعت', 'Class')}</th><th>{tr('شعبہ', 'Track')}</th><th>{tr('حصہ', 'Part')}</th><th>{tr('سے', 'From')}</th><th>{tr('تک', 'To')}</th></tr></thead>
          <tbody>{enrollments.map((e) => <tr key={e.id}><td>{e.class_name}</td><td>{label(TRACKS, e.track)}</td><td>{label(PARTS, e.curriculum_part)}</td><td><Num>{fmtDate(e.from_date)}</Num></td><td><Num>{e.to_date ? fmtDate(e.to_date) : tr('جاری', 'current')}</Num></td></tr>)}</tbody>
        </table>
      </Card>
      {alerts.length > 0 && <Card title={tr('الرٹس', 'Alerts')}>
        {alerts.map((a) => { const det = JSON.parse(a.detail || '{}'); return <div key={a.id} className="row between"><span><Num>{det.length}</Num> {tr('دن مسلسل غیر حاضر', 'days absent')} · <Num>{fmtDate(det.start)} → {fmtDate(det.end)}</Num></span><Badge kind={a.status === 'open' ? 'err' : 'ok'}>{a.status === 'open' ? tr('کھلا', 'Open') : `${tr('مکمل', 'Done')}: ${a.note ?? ''}`}</Badge></div> })}
      </Card>}
      <Card title={tr('تبدیلیوں کا ریکارڈ', 'Change history')}><AuditList rows={audit} /></Card>

      {dlg === 'withdraw' && <WithdrawDlg onClose={() => setDlg('')} onSave={async (date, reason) => { await withdrawStudent(id, date, reason); setDlg(''); d.toast(tr('خارج کر دیا گیا — ریکارڈ محفوظ ہے', 'Withdrawn — record kept')) }} />}
      {dlg === 'transfer' && <TransferDlg cur={cur} onClose={() => setDlg('')} onSave={async (p) => { await transferStudent(id, p); setDlg(''); d.toast(tr('تبدیل ہو گیا', 'Transferred')) }} />}
      {dlg === 'rejoin' && <TransferDlg cur={enrollments[0]} rejoin onClose={() => setDlg('')} onSave={async (p) => { await rejoinStudent(id, p.classId, p.date, p.reason); setDlg(''); d.toast(tr('دوبارہ داخلہ ہو گیا', 'Re-admitted')) }} />}
      {dlg === 'edit' && <EditStudentDlg s={s} cur={cur} onClose={() => setDlg('')} onSave={async (ch, enCh) => {
        const r = await ask(tr('درستی کی وجہ', 'Reason for the correction')); if (!r) return
        await update('student', id, ch, r, { action: 'correct' })
        const en = await activeEnrollment(id)
        if (en && Object.keys(enCh).length) await update('enrollment', en.id, enCh, r, { action: 'correct' })
        setDlg(''); d.toast(tr('درستی محفوظ', 'Correction saved'))
      }} />}
    </div>
  )
}

function AttSummary({ s, bands }: { s: ReturnType<typeof summarize>; bands: Band[] }) {
  return (
    <div className="stats">
      <div><small>{tr('ایامِ تعلیم', 'Teaching days')}</small><b><Num>{s.teachingDays}</Num></b></div>
      <div><small>{tr('حاضر', 'Present')}</small><b><Num>{s.present}</Num></b></div>
      <div><small>{tr('غیر حاضر', 'Absent')}</small><b><Num>{s.absent}</Num></b></div>
      <div><small>{tr('رخصت', 'Leave')}</small><b><Num>{s.leave}</Num></b></div>
      <div><small>{tr('فیصد', 'Percent')}</small><b><Num>{fmtPercent(s.percent)}</Num></b></div>
      <div><small>{tr('حاضری نمبر (10)', 'Attendance marks (10)')}</small><b><Num>{attendanceMarks(s.percent, bands)}</Num></b></div>
    </div>
  )
}

export const TABLE_NAME: Record<string, [string, string]> = {
  student: ['طالب علم', 'Student'], enrollment: ['جماعت میں داخلہ', 'Enrollment'], family: ['خاندان', 'Family'],
  student_attendance: ['طلبہ کی حاضری', 'Student attendance'], class_day: ['حاضری کا دن', 'Class day'],
  teacher_attendance: ['اساتذہ کی حاضری', 'Teacher attendance'], teacher: ['معلم', 'Teacher'], class: ['جماعت', 'Class'],
  class_teacher: ['جماعت کا معلم', 'Class teacher'], branch: ['مکتب', 'Branch'], academic_year: ['تعلیمی سال', 'Academic year'],
  app_user: ['صارف', 'User'], setting: ['ترتیب', 'Setting'], alert: ['الرٹ', 'Alert'], eligibility_exception: ['امتحان کی اجازت', 'Exam exception'],
  monthly_class_record: ['ماہانہ سبق ریکارڈ', 'Monthly lesson record'], mark_scheme: ['نمبروں کی اسکیم', 'Mark scheme'], exam: ['امتحان', 'Exam'],
  exam_student: ['امتحان کا طالب علم', 'Exam student'], score_entry: ['نمبر', 'Marks'], deduction_event: ['غلطی کا اندراج', 'Mistake'],
  payment: ['ہدیہ کی وصولی', 'Payment'], fee_plan: ['ہدیہ کی مقدار', 'Fee amount'], fund_entry: ['مٹھی فنڈ', 'Fund'],
  activity_log: ['کارگزاری', 'Activity'], hijri_override: ['ہجری مہینے کی درستی', 'Hijri correction'], organization: ['ادارہ', 'Organization'],
  card_status: ['نتیجہ کارڈ', 'Result card'],
}
const ACTION_NAME: Record<string, [string, string]> = {
  create: ['نیا اندراج', 'Created'], update: ['تبدیلی', 'Changed'], deactivate: ['غیر فعال', 'Deactivated'], reactivate: ['دوبارہ فعال', 'Re-activated'],
  withdraw: ['خارج', 'Withdrawn'], rejoin: ['دوبارہ داخلہ', 'Rejoined'], transfer: ['منتقلی', 'Transferred'], void: ['منسوخ', 'Voided'],
  'absence-reason': ['غیر حاضری کی وجہ', 'Absence reason'], calendar: ['کیلنڈر', 'Calendar'], 'card-status': ['کارڈ کی کیفیت', 'Card status'],
  'class-remark': ['جماعت پر رائے', 'Class remark'], close: ['بند', 'Closed'], correct: ['درستی', 'Corrected'], finalize: ['مکمل', 'Finalized'],
  'follow-up': ['رابطہ', 'Follow-up'], holiday: ['تعطیل', 'Holiday'], 'moon-sighting': ['رؤیتِ ہلال', 'Moon sighting'], 'new-version': ['نیا ورژن', 'New version'],
  reopen: ['دوبارہ کھولا', 'Reopened'], score: ['نمبر', 'Marks'], sign: ['دستخط', 'Signed'], 'student-meta': ['طالب علم کی تفصیل', 'Student details'],
  submit: ['رجسٹر محفوظ', 'Register saved'], teaching: ['تدریس', 'Teaching'], undo: ['واپس', 'Undone'],
}
const HIDE_KEYS = /(^id$|_id$|_at$|_by$|^lineage|definition|^config$|json$|^scope|^version$)/
function shortVal(v: any): string {
  if (v === null || v === undefined || v === '') return '—'
  if (v === 'P' || v === 'A' || v === 'L') return tr(STATUS_LABEL[v][0], v)
  const t = String(v)
  return t.length > 40 ? t.slice(0, 40) + '…' : t
}
export function AuditList({ rows }: { rows: Row[] }) {
  if (!rows.length) return <Empty>{tr('کوئی تبدیلی نہیں', 'No changes')}</Empty>
  const parse = (j: string | null): Record<string, any> => { try { return j ? JSON.parse(j) : {} } catch { return {} } }
  const fields = (o: Record<string, any>) => Object.entries(o).filter(([k]) => !HIDE_KEYS.test(k))
  return (
    <div className="audit">
      {rows.map((a) => {
        const nv = parse(a.new_json), ov = parse(a.old_json)
        const title = nv.name || nv.label || nv.guardian_name || ''
        const tn = TABLE_NAME[a.table_name], an = ACTION_NAME[a.action]
        return (
          <div key={a.id} className="audit-row">
            <div className="row between"><strong>{tn ? tr(...tn) : a.table_name} · {an ? tr(...an) : a.action}{title ? ` · ${shortVal(title)}` : ''}</strong>
              <span className="muted"><Num>{fmtDate(a.created_at)} {a.created_at?.slice(11, 16)}</Num> · {a.user_name ?? ''}</span></div>
            {a.action !== 'create' && fields(nv).filter(([k, v]) => shortVal(v) !== shortVal(ov[k])).map(([k, v]) => (
              <div key={k} className="muted"><span dir="ltr">{k}</span>: {tr('پہلے', 'Before')} <b dir="auto">{shortVal(ov[k])}</b> · {tr('اب', 'Now')} <b dir="auto">{shortVal(v)}</b></div>
            ))}
            {a.reason && <div>{tr('وجہ', 'Reason')}: {a.reason}</div>}
          </div>
        )
      })}
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: any; onClose: () => void }) {
  return <div className="overlay" onClick={onClose}><div className="dialog" onClick={(e) => e.stopPropagation()}><h3>{title}</h3>{children}</div></div>
}
function WithdrawDlg({ onClose, onSave }: { onClose: () => void; onSave: (date: string, reason: string) => void }) {
  const [date, setDate] = useState(today()); const [reason, setReason] = useState('')
  return (
    <Modal title={tr('طالب علم کو خارج کریں', 'Withdraw student')} onClose={onClose}>
      <p className="hint">{tr('ریکارڈ حذف نہیں ہوگا۔', 'The record is not deleted.', 'لن يُحذف السجل.')}</p>
      <Field label={tr('تاریخ', 'Date')}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label={tr('وجہ (ضروری)', 'Reason (required)')}><textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <div className="row end"><button className="ghost" onClick={onClose}>{tr('منسوخ', 'Cancel')}</button><button className="danger" disabled={!reason.trim() || !date} onClick={() => onSave(date, reason)}>{tr('خارج کریں', 'Withdraw')}</button></div>
    </Modal>
  )
}
function TransferDlg({ cur, rejoin, onClose, onSave }: { cur?: Row; rejoin?: boolean; onClose: () => void; onSave: (p: { classId: string; track: string; part: string; date: string; reason: string }) => void }) {
  const classes = useQuery(() => myClasses(), [])
  const [p, setP] = useState({ classId: cur?.class_id ?? '', track: cur?.track ?? '', part: cur?.curriculum_part ?? '', date: today(), reason: '' })
  return (
    <Modal title={rejoin ? tr('دوبارہ داخلہ', 'Re-admit') : tr('جماعت / حصہ تبدیل کریں', 'Transfer / promote')} onClose={onClose}>
      <Field label={tr('جماعت', 'Class')}><Select value={p.classId} onChange={(v) => setP({ ...p, classId: v })} options={(classes ?? []).map((c) => ({ v: c.id, t: c.name }))} /></Field>
      {!rejoin && <div className="grid2">
        <Field label={tr('شعبہ', 'Track')}><Select value={p.track} onChange={(v) => setP({ ...p, track: v })} options={opts(TRACKS)} /></Field>
        <Field label={tr('حصہ', 'Part')}><Select value={p.part} onChange={(v) => setP({ ...p, part: v })} options={opts(PARTS)} /></Field>
      </div>}
      <Field label={tr('تاریخ (اس دن سے نئی جماعت)', 'Date (new class from this day)')}><input type="date" value={p.date} onChange={(e) => setP({ ...p, date: e.target.value })} /></Field>
      <Field label={tr('وجہ (ضروری)', 'Reason (required)')}><textarea rows={2} value={p.reason} onChange={(e) => setP({ ...p, reason: e.target.value })} /></Field>
      <div className="row end"><button className="ghost" onClick={onClose}>{tr('منسوخ', 'Cancel')}</button><button className="primary" disabled={!p.reason.trim() || !p.classId || !p.date} onClick={() => onSave(p)}>{tr('محفوظ کریں', 'Save')}</button></div>
    </Modal>
  )
}
function EditStudentDlg({ s, cur, onClose, onSave }: { s: Row; cur?: Row; onClose: () => void; onSave: (ch: Record<string, any>, en: Record<string, any>) => void }) {
  const [f, setF] = useState({ name: s.name, walidiyat: s.walidiyat, gender: s.gender, dob: s.dob ?? '', admission_date: s.admission_date ?? '', notes: s.notes ?? '' })
  const [miqdar, setMiqdar] = useState(cur?.miqdar ?? '')
  const k = (key: string) => (e: any) => setF({ ...f, [key]: e?.target ? e.target.value : e })
  return (
    <Modal title={tr('معلومات کی درستی', 'Correct details')} onClose={onClose}>
      <div className="grid2">
        <Field label={tr('نام', 'Name')}><input value={f.name} onChange={k('name')} /></Field>
        <Field label={tr('ولدیت', 'Father')}><input value={f.walidiyat} onChange={k('walidiyat')} /></Field>
        <Field label={tr('جنس', 'Gender')}><Select value={f.gender} onChange={k('gender')} options={opts(STUDENT_GENDERS)} /></Field>
        <Field label={tr('تاریخِ پیدائش', 'DOB')}><input type="date" value={f.dob} onChange={k('dob')} /></Field>
        <Field label={tr('تاریخِ داخلہ', 'Admission')}><input type="date" value={f.admission_date} onChange={k('admission_date')} /></Field>
        <Field label={tr('مقدار خواندگی', 'Reading level')}><input value={miqdar} onChange={(e) => setMiqdar(e.target.value)} /></Field>
        <Field label={tr('نوٹ', 'Notes')}><input value={f.notes} onChange={k('notes')} /></Field>
      </div>
      <div className="row end"><button className="ghost" onClick={onClose}>{tr('منسوخ', 'Cancel')}</button><button className="primary" onClick={() => onSave(f, cur && miqdar !== (cur.miqdar ?? '') ? { miqdar } : {})}>{tr('آگے', 'Next')}</button></div>
    </Modal>
  )
}

// ============ Family ============
export function FamilyView() {
  const { id = '' } = useParams()
  const d = useDialog()
  const ask = useAskReason()
  const data = useQuery(async () => ({
    f: await get('family', id),
    kids: await all<Row>('select * from student where family_id = ? order by serial_no', [id]),
    msgs: await all<Row>('select * from message_log where family_id = ? order by created_at desc limit 50', [id]),
  }), [id])
  const [edit, setEdit] = useState<Record<string, any> | null>(null)
  if (!data?.f) return null
  const { f, kids, msgs } = data
  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>{tr('خاندان', 'Family')}: {f.guardian_name}</h1>
        {session.role !== 'teacher' && <button className="ghost" onClick={() => setEdit({ guardian_name: f.guardian_name, relation: f.relation, phone1: f.phone1, phone2: f.phone2 ?? '', address: f.address ?? '' })}>{tr('درستی', 'Correct')}</button>}
      </div>
      <Card>
        <dl className="dl">
          <dt>{tr('رشتہ', 'Relation')}</dt><dd>{f.relation}</dd>
          <dt>{tr('فون 1', 'Phone 1')}</dt><dd><Num>{f.phone1}</Num> {f.whatsapp1 ? '· WhatsApp' : ''}</dd>
          <dt>{tr('فون 2', 'Phone 2')}</dt><dd><Num>{f.phone2 || '—'}</Num> {f.whatsapp2 ? '· WhatsApp' : ''}</dd>
          <dt>{tr('پتہ', 'Address')}</dt><dd>{f.address || '—'}</dd>
        </dl>
      </Card>
      <Card title={tr('بچے', 'Children')}>
        <div className="list">{kids.map((k) => <Link key={k.id} className="list-item" to={`/students/${k.id}`}><span>{k.status === 'left' && '✗ '}{k.name}</span><span className="muted">#<Num>{k.serial_no}</Num></span></Link>)}</div>
      </Card>
      <Card title={tr('بھیجے گئے پیغامات', 'Messages sent')}>
        {msgs.length === 0 ? <Empty>{tr('کوئی پیغام نہیں', 'None')}</Empty> : msgs.map((m) => <div key={m.id} className="audit-row"><div className="row between"><strong>{m.channel} · {m.purpose}</strong><Num>{fmtDate(m.created_at)}</Num></div><div className="pre">{m.body}</div></div>)}
      </Card>
      {edit && (
        <Modal title={tr('خاندان کی درستی', 'Correct family')} onClose={() => setEdit(null)}>
          {(['guardian_name', 'relation', 'phone1', 'phone2', 'address'] as const).map((k) => (
            <Field key={k} label={{ guardian_name: tr('سرپرست', 'Guardian'), relation: tr('رشتہ', 'Relation'), phone1: tr('فون 1', 'Phone 1'), phone2: tr('فون 2', 'Phone 2'), address: tr('پتہ', 'Address') }[k]}>
              <input value={edit[k]} dir={k.startsWith('phone') ? 'ltr' : undefined} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
            </Field>
          ))}
          <div className="row end"><button className="ghost" onClick={() => setEdit(null)}>{tr('منسوخ', 'Cancel')}</button>
            <button className="primary" onClick={async () => { const r = await ask(tr('درستی کی وجہ', 'Reason')); if (!r) return; await update('family', id, edit, r, { action: 'correct' }); setEdit(null); d.toast(tr('محفوظ', 'Saved')) }}>{tr('محفوظ کریں', 'Save')}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
export { addDays }
