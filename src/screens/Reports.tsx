import { useState } from 'react'
import { Link } from 'react-router-dom'
import { all, one, insert, session, today, type Row } from '../db/db'
import { myClasses, classPeriodStats, loadSettings, studentPeriod, waNumber, logMessage } from '../db/repo'
import { summarize, fmtPercent } from '../engine/attendance'
import { tr, useQuery, Card, Empty, Num, Badge, Field, Select, useDialog, useAskReason, fmtDate, monthStart, monthEnd, addDays } from '../ui'
import { ClassMonthPicker } from './Attendance'
import { AuditList, TABLE_NAME } from './Students'
import { studentLedger } from '../db/hadiyaRepo'
import { planOn } from '../db/calendarRepo'
import { cycleRange } from '../engine/calendar'

const monthsBack = (iso: string, n: number) => {
  const [y, m] = iso.split('-').map(Number)
  const d = new Date(y, m - 1 - n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// ============ Attendance % and marks for any range ============
export function RangeReport() {
  const d = useDialog()
  const ask = useAskReason()
  const classes = useQuery(() => myClasses(), [])
  const year = useQuery(() => one<Row>('select * from academic_year where organization_id = ? and start_date <= ? order by start_date desc limit 1', [session.orgId, today()]), [])
  const [classId, setClassId] = useState('')
  const [from, setFrom] = useState(monthStart(today().slice(0, 7)))
  const [to, setTo] = useState(today())
  if (classes?.length && !classId) setTimeout(() => setClassId(classes[0].id))
  const win = useQuery(async () => {
    const r = await planOn(today(), session.branchId)
    if (!r) return null
    const p = r.plan, t = today()
    const upto = (type: string, which: 'first' | 'second') => {
      const firsts = p.days.filter((d) => d.type === type)
      const idx = which === 'first' ? 0 : firsts.length - 1
      return firsts[idx]?.date
    }
    const prep5 = upto('exam_prep', 'first'), prep12 = upto('exam_prep', 'second')
    const cur = p.byDate.get(t)
    let cycleNo = cur?.cycle ?? 0
    if (!cycleNo) cycleNo = Math.max(0, ...p.days.filter((d) => d.date <= t && d.cycle).map((d) => d.cycle!))
    const cycle = cycleNo ? cycleRange(p, cycleNo) : null
    return {
      cycleNo, cycle: cycle ? { from: cycle.from, to: cycle.to < t ? cycle.to : t } : null,
      five: prep5 ? { from: r.info.config.start, to: addDays(prep5, -1) } : null,
      annual: prep12 ? { from: r.info.config.start, to: addDays(prep12, -1) } : null,
    }
  }, [])
  const data = useQuery(async () => (classId ? { rows: await classPeriodStats(classId, from, to), st: await loadSettings() } : null), [classId, from, to])
  const min = (data?.st['attendance.eligibilityMinPercent'] as number) ?? 60

  async function exception(r: Row) {
    const reason = await ask(tr('استثنا — امتحان میں شرکت کی اجازت', 'Exception — allow into the exam'),
      tr(`${r.name}: حاضری ${min}% سے کم ہے۔ ناظم کی منظوری کی وجہ لکھیں۔`, `${r.name}: attendance below ${min}%. Write the nazim's reason.`, `${r.name}: الحضور أقل من ${min}%. اكتب سبب موافقة الناظم.`))
    if (!reason) return
    await insert('eligibility_exception', { student_id: r.id, from_date: from, to_date: to, reason }, { branchId: r.branch_id, reason })
    d.toast(tr('استثنا درج ہو گیا', 'Exception recorded'))
  }
  return (
    <div className="stack">
      <h1>{tr('حاضری فیصد، نمبر اور امتحان کی اہلیت', 'Attendance %, marks and exam eligibility')}</h1>
      <div className="row wrap">
        <Field label={tr('جماعت', 'Class')}><Select value={classId} onChange={setClassId} options={(classes ?? []).map((c) => ({ v: c.id, t: c.name }))} /></Field>
        <Field label={tr('سے', 'From')}><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={tr('تک', 'To')}><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <div className="row wrap">
        <button className="ghost sm" onClick={() => { setFrom(monthStart(today().slice(0, 7))); setTo(today()) }}>{tr('یہ مہینہ', 'This month')}</button>
        <button className="ghost sm" onClick={() => { setFrom(monthsBack(today(), 5)); setTo(today()) }}>{tr('پچھلے 5 ماہ (پنج ماہی)', 'Last 5 months (five-monthly)')}</button>
        {year && <button className="ghost sm" onClick={() => { setFrom(year.start_date); setTo(today()) }}>{tr('سال کے آغاز سے (سالانہ)', 'Since year start (annual)')}</button>}
      </div>
      {win && (
        <div className="row wrap">
          <span className="muted">{tr('کیلنڈر سے', 'From the calendar', 'من التقويم')}:</span>
          {win.cycle && <button className="ghost sm" onClick={() => { setFrom(win.cycle!.from); setTo(win.cycle!.to) }}>{tr('یہ دور', 'This cycle')} ({win.cycleNo})</button>}
          {win.five && <button className="ghost sm" onClick={() => { setFrom(win.five!.from); setTo(win.five!.to) }}>{tr('پنج ماہی امتحان کی مدت', 'Five-monthly window')}</button>}
          {win.annual && <button className="ghost sm" onClick={() => { setFrom(win.annual!.from); setTo(win.annual!.to) }}>{tr('سالانہ امتحان کی مدت', 'Annual window')}</button>}
        </div>
      )}
      {data && (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>
              <th>#</th><th>{tr('نام', 'Name')}</th><th>{tr('ایامِ تعلیم', 'Days')}</th><th>{tr('حاضر', 'P')}</th><th>{tr('غیر حاضر', 'A')}</th><th>{tr('رخصت', 'L')}</th>
              <th>{tr('بغیر اندراج', 'Unmarked')}</th><th>%</th><th>{tr('نمبر (10)', 'Marks (10)')}</th><th>{tr('امتحان', 'Exam')}</th>
            </tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.student.id} className={!r.eligible ? 'warn-row' : ''}>
                  <td><Num>{r.student.serial_no}</Num></td>
                  <td><Link to={`/students/${r.student.id}`}>{r.student.name}</Link></td>
                  <td><Num>{r.teachingDays}</Num></td><td><Num>{r.present}</Num></td><td><Num>{r.absent}</Num></td><td><Num>{r.leave}</Num></td>
                  <td>{r.unmarked ? <Badge kind="warn"><Num>{r.unmarked}</Num></Badge> : <Num>0</Num>}</td>
                  <td><Num>{fmtPercent(r.percent)}</Num></td><td><Num>{r.marks}</Num></td>
                  <td>{r.exception ? <Badge kind="warn">{tr('استثنا', 'Exception')}: {r.exception.reason}</Badge>
                    : r.eligible ? <Badge kind="ok">{tr('اہل', 'Eligible')}</Badge>
                      : <span className="row"><Badge kind="err">{tr(`${min}% سے کم — شامل نہیں`, `Below ${min}% — not entered`, `أقل من ${min}% — لا يدخل`)}</Badge>
                        {session.role !== 'teacher' && <button className="ghost sm" onClick={() => exception(r.student)}>{tr('استثنا', 'Exception')}</button>}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.rows.length === 0 && <Empty>{tr('کوئی ڈیٹا نہیں', 'No data')}</Empty>}
        </div>
      )}
    </div>
  )
}

// ============ صاحبِ ترتیب ============
export function PerfectList() {
  const [period, setPeriod] = useState<'month' | 'year'>('month')
  const [month, setMonth] = useState(today().slice(0, 7))
  const data = useQuery(async () => {
    const year = await one<Row>('select * from academic_year where organization_id = ? and start_date <= ? order by start_date desc limit 1', [session.orgId, today()])
    const from = period === 'month' ? monthStart(month) : (year?.start_date ?? '0000-01-01')
    const to = period === 'month' ? monthEnd(month) : today()
    const classes = await myClasses()
    const out: { c: Row; list: Row[]; total: number }[] = []
    for (const c of classes) {
      const stats = await classPeriodStats(c.id, from, to)
      out.push({ c, list: stats.filter((s) => s.perfect).map((s) => ({ ...s.student, days: s.teachingDays })), total: stats.length })
    }
    return out
  }, [period, month])
  return (
    <div className="stack">
      <h1>{tr('صاحبِ ترتیب — مکمل حاضری', 'Perfect attendance')}</h1>
      <div className="row wrap">
        <Select value={period} onChange={(v) => setPeriod(v as any)} options={[{ v: 'month', t: tr('ماہانہ', 'Monthly') }, { v: 'year', t: tr('سالانہ (اب تک)', 'Annual (so far)') }]} />
        {period === 'month' && <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />}
      </div>
      {data?.map(({ c, list, total }) => (
        <Card key={c.id} title={`${c.name} — ${list.length}/${total}`}>
          {list.length === 0 ? <Empty>{tr('کوئی نہیں', 'None')}</Empty> : (
            <div className="list">{list.map((s) => <Link key={s.id} className="list-item" to={`/students/${s.id}`}><span>{s.name} <span className="muted">{tr('ولد', 's/o')} {s.walidiyat}</span></span><Num>{s.days} {tr('دن', 'days')}</Num></Link>)}</div>
          )}
        </Card>
      ))}
    </div>
  )
}

// ============ Teacher attendance report ============
export function TeacherReport() {
  const [month, setMonth] = useState(today().slice(0, 7))
  const data = useQuery(async () => {
    const from = monthStart(month), to = monthEnd(month)
    const ts = await all<Row>(`select * from teacher where organization_id = ? and (? is null or branch_id = ?) order by status, name`, [session.orgId, session.branchId, session.branchId])
    const recs = await all<Row>('select * from teacher_attendance where date >= ? and date <= ?', [from, to])
    const days: string[] = []
    for (let x = from; x <= to; x = addDays(x, 1)) days.push(x)
    return { ts, recs, days }
  }, [month])
  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>{tr('اساتذہ حاضری رپورٹ', 'Teacher attendance report')}</h1>
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      </div>
      {data && (
        <div className="table-wrap">
          <table className="register">
            <thead><tr><th className="sticky-col">{tr('نام', 'Name')}</th>{data.days.map((x) => <th key={x}><Num>{x.slice(8)}</Num></th>)}<th>{tr('دن', 'Days')}</th></tr></thead>
            <tbody>
              {data.ts.map((t) => {
                const mine = data.recs.filter((r) => r.teacher_id === t.id)
                return (
                  <tr key={t.id}>
                    <td className="sticky-col">{t.name}</td>
                    {data.days.map((x) => { const r = mine.find((m) => m.date === x); return <td key={x} className="tcell"><Num>{r ? `${r.arrival ?? '—'}\n${r.departure ?? '—'}` : ''}</Num></td> })}
                    <td><Num>{mine.filter((m) => m.arrival).length}</Num></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="hint">{tr('ہر خانے میں اوپر آمد اور نیچے واپسی کا وقت', 'Each cell: arrival above, departure below')}</p>
        </div>
      )}
    </div>
  )
}

// ============ Monthly guardian summary (one message per family) ============
export function GuardianSummary() {
  const d = useDialog()
  const [classId, setClassId] = useState('')
  const [month, setMonth] = useState(today().slice(0, 7))
  const data = useQuery(async () => {
    if (!classId) return null
    const st = await loadSettings()
    const from = monthStart(month), to = monthEnd(month)
    const fams = await all<Row>(`select distinct f.* from family f join student s on s.family_id = f.id join enrollment e on e.student_id = s.id
      where e.class_id = ? and e.from_date <= ? and (e.to_date is null or e.to_date = '' or e.to_date > ?)`, [classId, to, from])
    const out = []
    for (const f of fams) {
      const kids = await all<Row>(`select * from student where family_id = ? and status = 'active' order by serial_no`, [f.id])
      const lines = []
      for (const k of kids) {
        const p = await studentPeriod(k.id, from, to)
        const s = summarize(p.dates, p.map, st['attendance.leaveCountsAsAbsent'] as boolean)
        if (s.teachingDays) lines.push({ k, s })
      }
      const led = await studentLedger(kids, month, month)
      const hadiya = led.rows.map((r) => ({ name: r.s.name, cell: r.cells[0] }))
      const sent = await one<{ n: number }>(`select count(*) n from message_log where family_id = ? and purpose = ?`, [f.id, `summary:${month}`])
      out.push({ f, lines, hadiya, sent: (sent?.n ?? 0) > 0 })
    }
    return { out, cc: st['phone.countryCode'] as string }
  }, [classId, month])

  function body(f: Row, lines: { k: Row; s: ReturnType<typeof summarize> }[], hadiya: { name: string; cell: any }[] = []) {
    const parts = lines.map(({ k, s }) => `${k.name}: ایامِ تعلیم ${s.teachingDays}، حاضر ${s.present}، غیر حاضر ${s.notPresent}`)
    const h = hadiya.filter((x) => x.cell && x.cell.status !== 'none').map((x) => `${x.name}: ${x.cell.status === 'paid' ? 'ادا' : x.cell.status === 'exempt' ? 'معاف' : `باقی ${x.cell.due - x.cell.paid} روپے`}`)
    return `السلام علیکم محترم ${f.guardian_name}،\nماہ ${month} کی حاضری:\n${parts.join('\n')}${h.length ? `\nہدیہ:\n${h.join('\n')}` : ''}`
  }
  async function send(f: Row, lines: any[], hadiya: any[], channel: 'whatsapp' | 'sms') {
    const b = body(f, lines, hadiya)
    const phone = f.whatsapp1 || !f.phone2 ? f.phone1 : f.phone2
    await logMessage(f.id, null, channel, `summary:${month}`, b)
    window.open(channel === 'sms' ? `sms:${phone}?body=${encodeURIComponent(b)}` : `https://wa.me/${waNumber(phone, data!.cc)}?text=${encodeURIComponent(b)}`, '_blank')
    d.toast(tr('پیغام کا ریکارڈ محفوظ', 'Message logged'))
  }
  return (
    <div className="stack">
      <h1>{tr('سرپرست کو ماہانہ خلاصہ', 'Monthly guardian summary')}</h1>
      <ClassMonthPicker classId={classId} setClassId={setClassId} month={month} setMonth={setMonth} />
      {data?.out.map(({ f, lines, hadiya, sent }) => (
        <Card key={f.id} title={f.guardian_name} actions={<>
          {sent && <Badge kind="ok">{tr('بھیجا گیا', 'Sent')}</Badge>}
          <button className="ghost sm" onClick={() => send(f, lines, hadiya, 'whatsapp')}>WhatsApp</button>
          <button className="ghost sm" onClick={() => send(f, lines, hadiya, 'sms')}>SMS</button>
        </>}>
          <div className="pre">{body(f, lines, hadiya)}</div>
        </Card>
      ))}
      {data && data.out.length === 0 && <Empty>{tr('کوئی خاندان نہیں', 'No families')}</Empty>}
    </div>
  )
}

// ============ Change history ============
export function AuditView() {
  const [table, setTable] = useState('')
  const [from, setFrom] = useState(addDays(today(), -30))
  const rows = useQuery(() => all<Row>(`select a.*, u.name user_name from audit_log a left join app_user u on u.id = a.created_by
    where a.organization_id = ? and (? is null or a.branch_id = ? or a.branch_id is null) and (? = '' or a.table_name = ?) and a.created_at >= ?
    order by a.created_at desc limit 300`, [session.orgId, session.branchId, session.branchId, table, table, from]), [table, from])
  const tables = ['student', 'enrollment', 'family', 'student_attendance', 'class_day', 'teacher_attendance', 'teacher', 'class', 'class_teacher', 'branch', 'academic_year', 'app_user', 'setting', 'alert', 'eligibility_exception', 'monthly_class_record']
  return (
    <div className="stack">
      <h1>{tr('تبدیلیوں کا ریکارڈ', 'Change history')}</h1>
      <p className="hint">{tr('ہر درستی وجہ کے ساتھ یہاں محفوظ ہے۔', 'Every correction is kept here with its reason.', 'كل تصحيح محفوظ هنا مع سببه.')}</p>
      <div className="row wrap">
        <Select value={table} onChange={setTable} empty={tr('سب', 'All')} options={tables.map((t) => ({ v: t, t: TABLE_NAME[t] ? tr(...TABLE_NAME[t]) : t }))} />
        <Field label={tr('سے', 'From')}><input type="date" value={from.slice(0, 10)} onChange={(e) => setFrom(e.target.value)} /></Field>
      </div>
      <Card><AuditList rows={rows ?? []} /></Card>
      <p className="hint"><Num>{fmtDate(today())}</Num></p>
    </div>
  )
}
