import { DateInput } from '../DateInput'
import { Cover } from './Cover'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { all, get, one, session, today, detId, insert, update, ReasonRequired, type Row } from '../db/db'
import {
  myClasses, rollOn, classDay, mark, markAllUnmarkedPresent, setHoliday, setTeachingDay, submitRegister,
  currentTeacherOf, teacherDay, setTeacherTime, resolveAlert, waNumber, logMessage, loadSettings,
} from '../db/repo'
import { summarize, fmtPercent, type Status } from '../engine/attendance'
import { planOn } from '../db/calendarRepo'
import { dayName as calDayName, hijriText } from './calendarMeta'
import type { DayType } from '../engine/calendar'
import {
  tr, useQuery, Card, Empty, Num, Badge, Field, Select, useDialog, useAskReason, fmtDate, dayName, addDays,
  STATUS_LABEL, label, PARTS, TRACKS, monthStart, monthEnd, weekday, opts,
} from '../ui'

const nowTime = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

const isWeeklyHoliday = (b: Row | null | undefined, date: string) =>
  !!b && ((b.weekly_holiday === 'sun' && weekday(date) === 0) || (b.weekly_holiday === 'fri' && weekday(date) === 5))

// ============ Today ============
export function Today() {
  const [date, setDate] = useState(today())
  const classes = useQuery(async () => {
    const cs = await myClasses(date)
    return Promise.all(cs.map(async (c) => {
      const roll = await rollOn(c.id, date)
      const cd = await classDay(c.id, date)
      const marked = await one<{ n: number }>('select count(*) n from student_attendance where class_id = ? and date = ?', [c.id, date])
      const t = await currentTeacherOf(c.id, date)
      const b = await get('branch', c.branch_id)
      return { c, roll: roll.length, cd, marked: marked?.n ?? 0, teacher: t, branch: b }
    }))
  }, [date])
  const me = useQuery(() => get('app_user', session.userId), [])
  const alerts = useQuery(() => all<{ n: number }>(`select count(*) n from alert where status = 'open' and (? is null or branch_id = ?)
    and (? is null or class_id in (select class_id from class_teacher where teacher_id = ? and (to_date is null or to_date = '')))`,
  [session.branchId, session.branchId, session.teacherId, session.teacherId]), [])

  if (session.role === 'examiner') {
    return <Card title={tr('ممتحن', 'Examiner')}><Empty><Link to="/exams">{tr('آپ کے سپرد امتحانات', 'Exams assigned to you', 'الامتحانات المسندة إليك')}</Link></Empty></Card>
  }
  return (
    <div className="stack">
      {me && <Cover user={{ ...me, role: session.role }} />}
      <div className="row between wrap">
        <h1>{tr('آج', 'Today')} · <Num>{fmtDate(date)}</Num> · {dayName(date)}</h1>
        <div className="row">
          <button className="ghost" onClick={() => setDate(addDays(date, -1))}>{tr('پچھلا دن', 'Prev day')}</button>
          <DateInput value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <button className="ghost" onClick={() => setDate(addDays(date, 1))}>{tr('اگلا دن', 'Next day')}</button>
        </div>
      </div>
      {(alerts?.[0]?.n ?? 0) > 0 && (
        <Link to="/alerts" className="banner warn">
          {tr(`${alerts![0].n} الرٹ: مسلسل غیر حاضری — سرپرست سے رابطہ کریں`, `${alerts![0].n} alert(s): consecutive absences — contact the guardian`, `${alerts![0].n} تنبيه: غياب متتالٍ — تواصل مع ولي الأمر`)}
        </Link>
      )}
      <TodayInCalendar date={date} />
      {session.role === 'teacher' && session.teacherId && <MyCheckIn teacherId={session.teacherId} date={date} />}
      <Card title={tr('جماعتیں — طلبہ کی حاضری', 'Classes — student attendance')}>
        {!classes ? null : classes.length === 0 ? (
          <Empty>{session.role === 'teacher'
            ? tr('آپ کو ابھی کوئی جماعت نہیں دی گئی۔ ناظم سے رابطہ کریں۔', 'No class is assigned to you yet. Ask the nazim.')
            : <>{tr('ابھی کوئی جماعت نہیں۔', 'No classes yet.')} <Link to="/setup/classes">{tr('جماعت بنائیں', 'Create a class')}</Link></>}</Empty>
        ) : (
          <div className="list">
            {classes.map(({ c, roll, cd, marked, teacher, branch }) => {
              const weekly = isWeeklyHoliday(branch, date)
              let status = <Badge kind="muted">{tr('شروع نہیں ہوئی', 'Not started')}</Badge>
              if (cd?.kind === 'holiday') status = <Badge kind="muted">{tr('چھٹی', 'Holiday')}{cd.holiday_reason ? ` · ${cd.holiday_reason}` : ''}</Badge>
              else if (cd?.submitted_at) status = <Badge kind="ok">{tr('محفوظ شدہ', 'Saved')}</Badge>
              else if (marked > 0) status = <Badge kind="warn">{tr('جاری', 'In progress')} <Num>{marked}/{roll}</Num></Badge>
              else if (weekly) status = <Badge kind="muted">{tr('ہفتہ وار تعطیل', 'Weekly holiday')}</Badge>
              return (
                <Link key={c.id} to={`/attendance/${c.id}/${date}`} className="list-item">
                  <div>
                    <strong>{c.name}</strong>
                    <div className="muted">{label(TRACKS, c.track)} · {label(PARTS, c.curriculum_part)} · {teacher?.name ?? tr('معلم مقرر نہیں', 'no teacher')} · <Num>{roll}</Num> {tr('طلبہ', 'students')}</div>
                  </div>
                  {status}
                </Link>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

function MyCheckIn({ teacherId, date }: { teacherId: string; date: string }) {
  const d = useDialog()
  const ask = useAskReason()
  const rec = useQuery(() => teacherDay(teacherId, date), [teacherId, date])
  async function stamp(field: 'arrival' | 'departure') {
    let reason: string | null = null
    if (rec?.[field]) { reason = await ask(tr('وقت تبدیل کرنے کی وجہ', 'Reason for changing the time')); if (!reason) return }
    await setTeacherTime(teacherId, date, field, nowTime(), reason)
    d.toast(tr('درج ہو گیا', 'Saved'))
  }
  return (
    <Card title={tr('میری حاضری', 'My attendance')}>
      <div className="row wrap">
        <button className="primary" onClick={() => stamp('arrival')}>{tr('آمد', 'Arrival')}: <Num>{rec?.arrival || '—'}</Num></button>
        <button className="primary" onClick={() => stamp('departure')}>{tr('واپسی', 'Departure')}: <Num>{rec?.departure || '—'}</Num></button>
      </div>
    </Card>
  )
}

// ============ Take attendance ============
export function TakeAttendance() {
  const { classId = '', date = today() } = useParams()
  const nav = useNavigate()
  const d = useDialog()
  const ask = useAskReason()
  const data = useQuery(async () => {
    const c = await get('class', classId)
    const roll = await rollOn(classId, date)
    const cd = await classDay(classId, date)
    const marks = await all<Row>('select * from student_attendance where class_id = ? and date = ?', [classId, date])
    const teacher = await currentTeacherOf(classId, date)
    const branch = c ? await get('branch', c.branch_id) : null
    return { c, roll, cd, marks: new Map(marks.map((m) => [m.student_id, m.status as Status])), teacher, branch }
  }, [classId, date])
  const calDay = useQuery(async () => {
    const c = await get('class', classId)
    const r = await planOn(date, c?.branch_id ?? session.branchId)
    return r?.plan.byDate.get(date) ?? null
  }, [classId, date])
  if (!data?.c) return null
  const { c, roll, cd, marks, teacher, branch } = data
  const locked = !!cd?.submitted_at
  const holiday = cd?.kind === 'holiday'
  const counts = { P: 0, A: 0, L: 0 }
  marks.forEach((s) => { counts[s]++ })
  const done = roll.every((s) => marks.has(s.id))

  async function tap(studentId: string, s: Status) {
    if (marks.get(studentId) === s) return
    let reason: string | null = null
    if (locked) {
      reason = await ask(tr('محفوظ شدہ رجسٹر میں تبدیلی', 'Change to a saved register'),
        tr('رجسٹر محفوظ ہو چکا ہے، اس لیے تبدیلی کی وجہ لکھنا ضروری ہے۔', 'The register is saved, so a reason is required.'))
      if (!reason) return
    }
    try { await mark(classId, studentId, date, s, reason) } catch (e) { d.toast(String(e), 'err') }
  }
  async function allPresent() { await markAllUnmarkedPresent(classId, date); d.toast(tr('باقی سب حاضر لگا دیے گئے', 'All remaining marked present')) }
  async function makeHoliday() {
    const r = await ask(tr('آج کو چھٹی قرار دیں', 'Mark this day as a holiday'), tr('چھٹی کی وجہ لکھیں (مثلاً قومی تعطیل)', 'Write the reason (e.g. national holiday)'))
    if (!r) return
    try { await setHoliday(classId, date, r) } catch (e) {
      d.toast(String(e).includes('has-marks') ? tr('حاضری لگ چکی ہے، چھٹی قرار نہیں دی جا سکتی', 'Attendance already taken; cannot mark as holiday') : String(e), 'err')
    }
  }
  async function makeTeaching() {
    const r = await ask(tr('تدریسی دن بنائیں', 'Make this a teaching day')); if (!r) return
    await setTeachingDay(classId, date, r)
  }
  async function submit() {
    try { await submitRegister(classId, date); d.toast(tr('رجسٹر محفوظ ہو گیا', 'Register saved')) } catch (e) {
      d.toast(String(e).includes('incomplete') ? tr('پہلے سب طلبہ کی حاضری لگائیں', 'Mark every student first') : String(e), 'err')
    }
  }

  return (
    <div className="stack">
      <div className="row between wrap">
        <div>
          <h1>{c.name} · <Num>{fmtDate(date)}</Num> · {dayName(date)}</h1>
          <div className="muted">{teacher?.name ?? ''} · {label(TRACKS, c.track)} · {label(PARTS, c.curriculum_part)}</div>
        </div>
        <div className="row">
          <button className="ghost" onClick={() => nav(`/attendance/${classId}/${addDays(date, -1)}`)}>{tr('پچھلا دن', 'Prev')}</button>
          <button className="ghost" onClick={() => nav(`/attendance/${classId}/${addDays(date, 1)}`)}>{tr('اگلا دن', 'Next')}</button>
        </div>
      </div>
      {calDay && calDay.type !== 'padhai' && calDay.type !== 'practice' && (
        <div className={`banner ${['holiday', 'parents', 'fuzala'].includes(calDay.type) ? 'warn' : ''}`}>
          {tr('کیلنڈر', 'Calendar', 'التقويم')}: <span className={`chip t-${calDay.type}`}>{calDayName(calDay.type)}</span>
          {calDay.label && calDay.label !== 'weekly' ? ` · ${calDay.label}` : ''}
          {['holiday', 'parents', 'fuzala'].includes(calDay.type) && !cd ? ' — ' + tr('آج کیلنڈر کے مطابق تعطیل ہے۔ کلاس ہوئی ہو تو ہی حاضری لگائیں۔', 'The calendar shows a holiday. Mark attendance only if class was held.', 'التقويم يُظهر عطلة. سجّل الحضور فقط إن عُقد الدرس.') : ''}
        </div>
      )}
      {!calDay && isWeeklyHoliday(branch, date) && !cd && (
        <div className="banner">{tr('آج اس مکتب کی ہفتہ وار تعطیل ہے۔ اگر کلاس ہوئی ہے تو حاضری لگائیں۔', "Today is this branch's weekly holiday. Mark attendance only if class was held.")}</div>
      )}
      {holiday ? (
        <Card>
          <Empty>{tr('یہ دن چھٹی ہے', 'This day is a holiday')}: {cd?.holiday_reason}</Empty>
          <div className="row end"><button className="ghost" onClick={makeTeaching}>{tr('تدریسی دن بنائیں', 'Make teaching day')}</button></div>
        </Card>
      ) : (
        <>
          <div className="row wrap between sticky-bar">
            <div className="row wrap">
              <Badge kind="ok">{tr(STATUS_LABEL.P[0], STATUS_LABEL.P[1])} <Num>{counts.P}</Num></Badge>
              <Badge kind="err">{tr(STATUS_LABEL.A[0], STATUS_LABEL.A[1])} <Num>{counts.A}</Num></Badge>
              <Badge kind="warn">{tr(STATUS_LABEL.L[0], STATUS_LABEL.L[1])} <Num>{counts.L}</Num></Badge>
              <Badge kind="muted">{tr('باقی', 'Remaining')} <Num>{roll.length - marks.size}</Num></Badge>
              {locked && <Badge kind="ok">{tr('محفوظ شدہ — تبدیلی کے لیے وجہ ضروری', 'Saved — changes need a reason')}</Badge>}
            </div>
            <div className="row wrap">
              {!locked && marks.size === 0 && <button className="ghost" onClick={makeHoliday}>{tr('چھٹی قرار دیں', 'Holiday')}</button>}
              {!locked && !done && <button className="ghost" onClick={allPresent}>{tr('باقی سب حاضر', 'Rest present')}</button>}
              {!locked && <button className="primary" disabled={!done} onClick={submit}>{tr('رجسٹر محفوظ کریں', 'Save register')}</button>}
            </div>
          </div>
          {roll.length === 0 ? <Empty>{tr('اس جماعت میں کوئی طالب علم نہیں۔', 'No students in this class.')} <Link to="/students/new">{tr('داخلہ', 'Admit')}</Link></Empty> : (
            <div className="roll">
              {roll.map((s) => {
                const cur = marks.get(s.id)
                return (
                  <div key={s.id} className={`roll-row ${cur ?? ''}`}>
                    <div className="roll-name">
                      <Num>{s.serial_no}</Num>
                      <Link to={`/students/${s.id}`}><strong>{s.name}</strong></Link>
                      <span className="muted">{tr('ولد', 's/o')} {s.walidiyat}</span>
                    </div>
                    <div className="seg">
                      {(['P', 'A', 'L'] as Status[]).map((k) => (
                        <button key={k} className={`seg-b ${k} ${cur === k ? 'on' : ''}`} onClick={() => tap(s.id, k)}>
                          {tr(STATUS_LABEL[k][0], STATUS_LABEL[k][1])}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ============ Monthly register ============
export function ClassMonthPicker({ classId, setClassId, month, setMonth }: { classId: string; setClassId: (v: string) => void; month: string; setMonth: (v: string) => void }) {
  const classes = useQuery(() => myClasses(), [])
  if (classes && classes.length && !classId) setTimeout(() => setClassId(classes[0].id))
  return (
    <div className="row wrap">
      <Field label={tr('جماعت', 'Class')}>
        <Select value={classId} onChange={setClassId} options={(classes ?? []).map((c) => ({ v: c.id, t: c.name }))} />
      </Field>
      <Field label={tr('مہینہ', 'Month')}><input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></Field>
    </div>
  )
}

export function MonthlyRegister() {
  const [classId, setClassId] = useState('')
  const [month, setMonth] = useState(today().slice(0, 7))
  const data = useQuery(async () => {
    if (!classId) return null
    const from = monthStart(month), to = monthEnd(month)
    const st = await loadSettings()
    const days: string[] = []
    for (let x = from; x <= to; x = addDays(x, 1)) days.push(x)
    const cds = await all<Row>('select * from class_day where class_id = ? and date >= ? and date <= ?', [classId, from, to])
    const cdMap = new Map(cds.map((c) => [c.date, c]))
    const students = await all<Row>(`select distinct s.*, e.from_date en_from, e.to_date en_to from enrollment e join student s on s.id = e.student_id
      where e.class_id = ? and e.from_date <= ? and (e.to_date is null or e.to_date = '' or e.to_date > ?) order by s.serial_no`, [classId, to, from])
    const marks = await all<Row>('select student_id, date, status from student_attendance where class_id = ? and date >= ? and date <= ?', [classId, from, to])
    const c = await get('class', classId)
    const branch = c ? await get('branch', c.branch_id) : null
    return { days, cdMap, students, marks, st, branch }
  }, [classId, month])

  return (
    <div className="stack">
      <h1>{tr('ماہانہ حاضری رجسٹر', 'Monthly attendance register')}</h1>
      <ClassMonthPicker classId={classId} setClassId={setClassId} month={month} setMonth={setMonth} />
      {data && (
        <div className="table-wrap">
          <table className="register">
            <thead>
              <tr>
                <th>#</th><th className="sticky-col">{tr('نام', 'Name')}</th>
                {data.days.map((x) => {
                  const cd = data.cdMap.get(x)
                  const wh = isWeeklyHoliday(data.branch, x)
                  return <th key={x} className={cd?.kind === 'holiday' || (wh && !cd) ? 'off' : ''} title={cd?.holiday_reason ?? ''}><Num>{x.slice(8)}</Num></th>
                })}
                <th>{tr('ایامِ تعلیم', 'Days')}</th><th>{tr('حاضر', 'P')}</th><th>{tr('غیر حاضر', 'A')}</th><th>{tr('رخصت', 'L')}</th><th>%</th>
              </tr>
            </thead>
            <tbody>
              {data.students.map((s) => {
                const sm = new Map<string, Status>()
                for (const m of data.marks) if (m.student_id === s.id) sm.set(m.date, m.status)
                const teaching = data.days.filter((x) => data.cdMap.get(x)?.kind === 'teaching' && x >= s.en_from && (!s.en_to || x < s.en_to))
                const sum = summarize(teaching, sm, data.st['attendance.leaveCountsAsAbsent'] as boolean)
                const left = s.status === 'left'
                return (
                  <tr key={s.id} className={left ? 'left-row' : ''}>
                    <td><Num>{s.serial_no}</Num></td>
                    <td className="sticky-col"><Link to={`/students/${s.id}`}>{left && <span className="x">✗ </span>}<span className={left ? 'strike' : ''}>{s.name}</span></Link></td>
                    {data.days.map((x) => {
                      const v = sm.get(x)
                      const cd = data.cdMap.get(x)
                      const inRange = x >= s.en_from && (!s.en_to || x < s.en_to)
                      return (
                        <td key={x} className={`cell ${v ?? ''} ${cd?.kind === 'holiday' || (!cd && isWeeklyHoliday(data.branch, x)) ? 'off' : ''} ${!inRange ? 'na' : ''}`}>
                          {inRange ? <Link to={`/attendance/${classId}/${x}`}>{v ?? (cd?.kind === 'teaching' ? '·' : '')}</Link> : ''}
                        </td>
                      )
                    })}
                    <td><Num>{sum.teachingDays}</Num></td><td><Num>{sum.present}</Num></td><td><Num>{sum.absent}</Num></td><td><Num>{sum.leave}</Num></td>
                    <td><Num>{fmtPercent(sum.percent)}</Num></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="hint">P = {tr('حاضر', 'present')} · A = {tr('غیر حاضر', 'absent')} · L = {tr('رخصت (فیصد میں غیر حاضری شمار)', 'leave (counts as absence in %)')} · {tr('خاکستری کالم = چھٹی', 'grey column = holiday')}</p>
        </div>
      )}
    </div>
  )
}

// ============ Alerts ============
export function Alerts() {
  const d = useDialog()
  const [showDone, setShowDone] = useState(false)
  const [follow, setFollow] = useState<Row | null>(null)
  const data = useQuery(async () => {
    const st = await loadSettings()
    const rows = await all<Row>(`select a.*, s.name student_name, s.walidiyat, s.family_id, c.name class_name, f.guardian_name, f.phone1, f.phone2, f.whatsapp1, f.whatsapp2, b.name branch_name
      from alert a join student s on s.id = a.student_id left join class c on c.id = a.class_id left join family f on f.id = s.family_id left join branch b on b.id = a.branch_id
      where a.status = ? and (? is null or a.branch_id = ?)
      and (? is null or a.class_id in (select class_id from class_teacher where teacher_id = ? and (to_date is null or to_date = '')))
      order by a.trigger_date desc`, [showDone ? 'done' : 'open', session.branchId, session.branchId, session.teacherId, session.teacherId])
    return { rows, cc: st['phone.countryCode'] as string }
  }, [showDone])

  function msg(a: Row) {
    const det = JSON.parse(a.detail || '{}')
    return `السلام علیکم محترم ${a.guardian_name ?? ''}،\n${a.student_name} ${det.length} دن سے مسلسل مکتب سے غیر حاضر ہے (${fmtDate(det.start)} تا ${fmtDate(det.end)})۔ براہِ کرم وجہ سے آگاہ فرمائیں۔\n${a.branch_name ?? ''}`
  }
  async function contact(a: Row, channel: 'call' | 'whatsapp' | 'sms', phone: string) {
    const body = msg(a)
    const url = channel === 'call' ? `tel:${phone}` : channel === 'sms' ? `sms:${phone}?body=${encodeURIComponent(body)}` : `https://wa.me/${waNumber(phone, data!.cc)}?text=${encodeURIComponent(body)}`
    await logMessage(a.family_id, a.student_id, channel, 'absence_streak', channel === 'call' ? '' : body)
    window.open(url, '_blank')
  }

  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>{tr('الرٹس — مسلسل غیر حاضری', 'Alerts — consecutive absences')}</h1>
        <div className="row">
          <button className={showDone ? 'ghost' : 'primary'} onClick={() => setShowDone(false)}>{tr('کھلے', 'Open')}</button>
          <button className={showDone ? 'primary' : 'ghost'} onClick={() => setShowDone(true)}>{tr('مکمل شدہ', 'Done')}</button>
        </div>
      </div>
      {data && data.rows.length === 0 && <Empty>{tr('کوئی الرٹ نہیں', 'No alerts')}</Empty>}
      {data?.rows.map((a) => {
        const det = JSON.parse(a.detail || '{}')
        const phones = [a.phone1, a.phone2].filter(Boolean)
        return (
          <Card key={a.id}>
            <div className="row between wrap">
              <div>
                <Link to={`/students/${a.student_id}`}><strong>{a.student_name}</strong></Link> <span className="muted">{tr('ولد', 's/o')} {a.walidiyat} · {a.class_name}</span>
                <div><Badge kind="err"><Num>{det.length}</Num> {tr('دن مسلسل غیر حاضر', 'days absent in a row')}</Badge> <Num>{fmtDate(det.start)} → {fmtDate(det.end)}</Num></div>
                <div className="muted">{tr('سرپرست', 'Guardian')}: {a.guardian_name} · {phones.map((p: string) => <Num key={p}>{p} </Num>)}</div>
                {a.status === 'done' && <div className="muted">{tr('کارروائی', 'Action')}: {a.action} · {a.note}</div>}
              </div>
              {a.status === 'open' && (
                <div className="row wrap">
                  {phones.map((p: string) => (
                    <span key={p} className="row">
                      <button className="ghost" onClick={() => contact(a, 'call', p)}>{tr('کال', 'Call')}</button>
                      <button className="ghost" onClick={() => contact(a, 'whatsapp', p)}>WhatsApp</button>
                      <button className="ghost" onClick={() => contact(a, 'sms', p)}>SMS</button>
                    </span>
                  ))}
                  <button className="primary" onClick={() => setFollow(a)}>{tr('فالو اَپ درج کریں', 'Record follow-up')}</button>
                </div>
              )}
            </div>
          </Card>
        )
      })}
      {follow && <FollowUp alert={follow} onClose={() => setFollow(null)} onSaved={() => { setFollow(null); d.toast(tr('محفوظ ہو گیا', 'Saved')) }} />}
    </div>
  )
}

function FollowUp({ alert, onClose, onSaved }: { alert: Row; onClose: () => void; onSaved: () => void }) {
  const [action, setAction] = useState('call')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{tr('فالو اَپ', 'Follow-up')} — {alert.student_name}</h3>
        <Field label={tr('کیا کیا گیا', 'What was done')}>
          <Select value={action} onChange={setAction} options={[
            { v: 'call', t: tr('فون پر بات ہوئی', 'Spoke on phone') },
            { v: 'whatsapp', t: tr('واٹس ایپ پیغام', 'WhatsApp message') },
            { v: 'sms', t: 'SMS' },
            { v: 'visit', t: tr('ملاقات', 'Met in person') },
            { v: 'no_answer', t: tr('رابطہ نہیں ہو سکا', 'Could not reach') },
          ]} />
        </Field>
        <Field label={tr('غیر حاضری کی وجہ', 'Reason for absence')}>
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Field label={tr('نوٹ', 'Note')}><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="row end">
          <button className="ghost" onClick={onClose}>{tr('منسوخ', 'Cancel')}</button>
          <button className="primary" onClick={async () => { await resolveAlert(alert.id, action, note, reason); onSaved() }}>{tr('محفوظ کریں', 'Save')}</button>
        </div>
      </div>
    </div>
  )
}

// ============ Teacher attendance (arrival / departure) ============
export function TeacherTime() {
  const [date, setDate] = useState(today())
  const d = useDialog()
  const ask = useAskReason()
  const rows = useQuery(async () => {
    const ts = session.role === 'teacher'
      ? await all<Row>('select * from teacher where id = ?', [session.teacherId])
      : await all<Row>(`select * from teacher where organization_id = ? and (? is null or branch_id = ?) and status = 'active' order by name`, [session.orgId, session.branchId, session.branchId])
    return Promise.all(ts.map(async (t) => ({ t, rec: await teacherDay(t.id, date) })))
  }, [date])
  async function setTime(tid: string, field: 'arrival' | 'departure', value: string, had: boolean) {
    let reason: string | null = null
    if (had) { reason = await ask(tr('وقت تبدیل کرنے کی وجہ', 'Reason for changing the time')); if (!reason) return }
    try { await setTeacherTime(tid, date, field, value, reason); d.toast(tr('محفوظ', 'Saved')) } catch (e) { if (!(e instanceof ReasonRequired)) d.toast(String(e), 'err') }
  }
  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>{tr('اساتذہ کی حاضری', 'Teacher attendance')}</h1>
        <DateInput value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </div>
      <Card>
        {rows?.length === 0 && <Empty>{tr('کوئی معلم نہیں', 'No teachers')}</Empty>}
        <table className="tbl">
          <thead><tr><th>{tr('نام', 'Name')}</th><th>{tr('آمد', 'Arrival')}</th><th>{tr('واپسی', 'Departure')}</th></tr></thead>
          <tbody>
            {rows?.map(({ t, rec }) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                {(['arrival', 'departure'] as const).map((f) => (
                  <td key={f}>
                    <div className="row">
                      <TimeBox value={rec?.[f] ?? ''} onCommit={(v) => setTime(t.id, f, v, !!rec?.[f])} />
                      <button className="ghost sm" onClick={() => setTime(t.id, f, nowTime(), !!rec?.[f])}>{tr('ابھی', 'Now')}</button>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
function TimeBox({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value)
  const [last, setLast] = useState(value)
  if (value !== last) { setLast(value); setV(value) }
  return <input type="time" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v && v !== value) onCommit(v) }} />
}

// ============ Monthly class record (curriculum part + lesson number) ============
export function ClassRecord() {
  const [classId, setClassId] = useState('')
  const [month, setMonth] = useState(today().slice(0, 7))
  const d = useDialog()
  const ask = useAskReason()
  const rec = useQuery(() => (classId ? get('monthly_class_record', detId('mcr', classId, month)) : Promise.resolve(null)), [classId, month])
  const cls = useQuery(() => (classId ? get('class', classId) : Promise.resolve(null)), [classId])
  const [part, setPart] = useState('')
  const [lesson, setLesson] = useState('')
  const [loadedFor, setLoadedFor] = useState('')
  const key = `${classId}|${month}|${rec?.updated_at ?? ''}|${cls?.id ?? ''}`
  if (rec !== undefined && cls !== undefined && key !== loadedFor) {
    setLoadedFor(key); setPart(rec?.curriculum_part ?? cls?.curriculum_part ?? ''); setLesson(rec?.lesson_no ?? '')
  }
  async function save() {
    const id = detId('mcr', classId, month)
    if (rec) {
      const r = await ask(tr('ریکارڈ میں تبدیلی کی وجہ', 'Reason for changing the record')); if (!r) return
      await update('monthly_class_record', id, { curriculum_part: part, lesson_no: lesson }, r)
    } else {
      await insert('monthly_class_record', { class_id: classId, month, curriculum_part: part, lesson_no: lesson }, { id, branchId: cls!.branch_id })
    }
    d.toast(tr('محفوظ ہو گیا', 'Saved'))
  }
  return (
    <div className="stack">
      <h1>{tr('ماہانہ سبق ریکارڈ', 'Monthly lesson record')}</h1>
      <ClassMonthPicker classId={classId} setClassId={setClassId} month={month} setMonth={setMonth} />
      {classId && (
        <Card>
          <div className="grid2">
            <Field label={tr('تربیتی نصاب حصہ', 'Curriculum part')}><Select value={part} onChange={setPart} options={opts(PARTS)} empty="" /></Field>
            <Field label={tr('سبق نمبر', 'Lesson number')}><input value={lesson} onChange={(e) => setLesson(e.target.value)} dir="ltr" /></Field>
          </div>
          <div className="row end"><button className="primary" onClick={save}>{tr('محفوظ کریں', 'Save')}</button></div>
          {rec && <p className="hint">{tr('آخری تبدیلی', 'Last changed')}: <Num>{fmtDate(rec.updated_at)}</Num></p>}
        </Card>
      )}
    </div>
  )
}

// ============ Today in the calendar + reminders (Spec §11) ============
function TodayInCalendar({ date }: { date: string }) {
  const data = useQuery(async () => {
    const r = await planOn(date, session.branchId)
    if (!r) return null
    const day = r.plan.byDate.get(date)!
    const upcoming: { date: string; type: DayType }[] = []
    const watch: DayType[] = ['dohrai_tarbiyati', 'jaiza', 'bazm', 'musabqa', 'exam_prep', 'exam', 'ceremony', 'izala', 'parents', 'fuzala', 'holiday']
    let prev: DayType | null = day.type
    for (let i = 1; i <= 10; i++) {
      const d = addDays(date, i)
      const x = r.plan.byDate.get(d)
      if (!x) break
      if (watch.includes(x.type) && x.type !== prev && !(x.type === 'holiday' && x.label === 'weekly')) upcoming.push({ date: d, type: x.type })
      prev = x.type
    }
    const nextExam = [r.plan.events.fiveMonthly[0], r.plan.events.annual[0]].find((x) => x && x > date && x <= addDays(date, 30)) ?? null
    return { day, upcoming, nextExam }
  }, [date, session.branchId])
  if (data === undefined) return null
  if (data === null) return (
    <div className="banner">{tr('اس تاریخ کے لیے تعلیمی سال مقرر نہیں۔', 'No academic year covers this date.', 'لا يوجد عام دراسي لهذا التاريخ.')} <Link to="/calendar">{tr('تعلیمی کیلنڈر', 'Academic calendar')}</Link></div>
  )
  return (
    <Card>
      <div className="day-today">
        <b>{tr('آج کیلنڈر میں', 'Today in the calendar')}:</b>
        <span className={`chip t-${data.day.type}`}>{calDayName(data.day.type)}</span>
        <span className="muted">{hijriText(data.day.hijri)}{data.day.ramadan ? ' · ' + tr('رمضان: مختصر اوقات', 'Ramadan: reduced timings', 'رمضان: أوقات مختصرة') : ''}</span>
      </div>
      {data.nextExam && (
        <Link to="/prizes" className="banner warn" style={{ marginTop: 6 }}>
          {tr(`امتحان ${fmtDate(data.nextExam)} کو ہے: کمزور طلبہ کے والدین سے انفرادی ملاقات کریں`, `Exam on ${fmtDate(data.nextExam)}: meet the parents of weak students individually`, `الامتحان في ${fmtDate(data.nextExam)}: قابِل أولياء أمور الطلاب الضعاف`)}
        </Link>
      )}
      {data.upcoming.length > 0 && (
        <div className="day-today" style={{ marginTop: 6 }}>
          <span className="muted">{tr('آنے والے', 'Upcoming')}:</span>
          {data.upcoming.map((u) => <span key={u.date} className={`chip t-${u.type}`}>{calDayName(u.type)} · <Num>{fmtDate(u.date)}</Num></span>)}
        </div>
      )}
    </Card>
  )
}
