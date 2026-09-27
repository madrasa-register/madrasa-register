// Domain operations for Phase 1. Screens call these; these call db.ts.
import { all, one, get, insert, update, detId, nowIso, session, db, today, ReasonRequired, type Row } from './db'
import { summarize, absenceStreaks, attendanceMarks, isEligible, isPerfect, type Status, type Summary } from '../engine/attendance'
import { resolveSettings, type SettingsMap, type Band } from '../engine/settings'

// ---------- settings ----------
export async function loadSettings(branchId: string | null = session.branchId): Promise<SettingsMap> {
  const rows = await all<{ key: string; value: string; branch_id: string | null }>(
    'select key, value, branch_id from setting where organization_id = ? order by updated_at', [session.orgId])
  return resolveSettings(rows, branchId)
}
export async function saveSetting(key: string, value: unknown, branchId: string | null, reason: string) {
  const id = detId('setting', session.orgId, branchId ?? 'org', key)
  const existing = await get('setting', id)
  if (existing) await update('setting', id, { value: JSON.stringify(value) }, reason)
  else await insert('setting', { key, value: JSON.stringify(value) }, { id, branchId, reason })
}

// ---------- first-run setup ----------
export async function setupOrganization(p: { orgName: string; branchName: string; address: string; weeklyHoliday: string; adminName: string; yearLabel: string; yearStart: string }) {
  const orgId = detId('org', p.orgName, nowIso())
  session.orgId = orgId
  session.userId = 'setup'
  await insert('organization', { name: p.orgName }, { id: orgId, branchId: null })
  const branchId = await insert('branch', { name: p.branchName, address: p.address, weekly_holiday: p.weeklyHoliday }, { branchId: null })
  const userId = await insert('app_user', { name: p.adminName, role: 'admin', status: 'active' }, { branchId: null })
  if (p.yearStart) await insert('academic_year', { label: p.yearLabel, start_date: p.yearStart }, { branchId: null })
  return { orgId, branchId, userId }
}

// ---------- classes & teachers ----------
export async function currentTeacherOf(classId: string, on = today()) {
  return one<Row>(
    `select t.* from class_teacher ct join teacher t on t.id = ct.teacher_id
     where ct.class_id = ? and ct.from_date <= ? and (ct.to_date is null or ct.to_date = '' or ct.to_date > ?)
     order by ct.from_date desc limit 1`, [classId, on, on])
}
export async function assignTeacher(classId: string, teacherId: string, from: string, reason: string | null) {
  const cur = await one<Row>(`select * from class_teacher where class_id = ? and (to_date is null or to_date = '') order by from_date desc limit 1`, [classId])
  if (cur && cur.teacher_id === teacherId) return
  if (cur) await update('class_teacher', cur.id, { to_date: from }, reason || 'teacher changed', { action: 'close' })
  const cls = await get('class', classId)
  await insert('class_teacher', { class_id: classId, teacher_id: teacherId, from_date: from, to_date: null }, { branchId: cls?.branch_id })
}
/** Classes visible to the current user (teacher → own classes only). */
export async function myClasses(on = today()): Promise<Row[]> {
  if (session.role === 'teacher' && session.teacherId) {
    return all(`select c.* from class c join class_teacher ct on ct.class_id = c.id
      where ct.teacher_id = ? and ct.from_date <= ? and (ct.to_date is null or ct.to_date = '' or ct.to_date > ?)
      and c.status = 'active' order by c.name`, [session.teacherId, on, on])
  }
  return all(`select * from class where organization_id = ? and (? is null or branch_id = ?) and status = 'active' order by name`,
    [session.orgId, session.branchId, session.branchId])
}

// ---------- students ----------
export async function nextSerial(branchId: string) {
  const r = await one<{ m: number }>('select max(serial_no) m from student where branch_id = ?', [branchId])
  return (r?.m ?? 0) + 1
}
export async function findFamiliesByPhone(phone: string): Promise<Row[]> {
  const p = phone.replace(/\D/g, '')
  if (p.length < 4) return []
  return all(`select * from family where organization_id = ? and (replace(phone1,'-','') like ? or replace(phone2,'-','') like ?)`,
    [session.orgId, `%${p}%`, `%${p}%`])
}
export async function admitStudent(p: {
  familyId: string | null; family: Record<string, any>; student: Record<string, any>
  classId: string; academicYearId: string | null; track: string; part: string; miqdar: string; fromDate: string
}) {
  const cls = await get('class', p.classId)
  const branchId = cls!.branch_id
  const familyId = p.familyId ?? await insert('family', p.family, { branchId })
  const serial = await nextSerial(branchId)
  const studentId = await insert('student', { ...p.student, family_id: familyId, serial_no: serial, status: 'active' }, { branchId })
  await insert('enrollment', {
    student_id: studentId, academic_year_id: p.academicYearId ?? cls!.academic_year_id, class_id: p.classId,
    track: p.track, curriculum_part: p.part, miqdar: p.miqdar, from_date: p.fromDate, to_date: null,
  }, { branchId })
  return studentId
}
export async function activeEnrollment(studentId: string) {
  return one<Row>(`select * from enrollment where student_id = ? and (to_date is null or to_date = '') order by from_date desc limit 1`, [studentId])
}
/** Withdrawal: status becomes left with date + reason; the record is never removed (Reg. p. 52). */
export async function withdrawStudent(studentId: string, date: string, reason: string) {
  if (!reason.trim()) throw new ReasonRequired('reason')
  const en = await activeEnrollment(studentId)
  if (en) await update('enrollment', en.id, { to_date: date }, reason, { action: 'withdraw' })
  await update('student', studentId, { status: 'left', left_date: date, left_reason: reason }, reason, { action: 'withdraw' })
}
export async function rejoinStudent(studentId: string, classId: string, date: string, reason: string) {
  const s = await get('student', studentId)
  const last = await one<Row>('select * from enrollment where student_id = ? order by from_date desc limit 1', [studentId])
  await update('student', studentId, { status: 'active', left_date: null, left_reason: null }, reason, { action: 'rejoin' })
  const cls = await get('class', classId)
  await insert('enrollment', {
    student_id: studentId, academic_year_id: cls!.academic_year_id, class_id: classId,
    track: last?.track ?? '', curriculum_part: last?.curriculum_part ?? '', miqdar: last?.miqdar ?? '', from_date: date, to_date: null,
  }, { branchId: s!.branch_id, reason })
}
export async function transferStudent(studentId: string, p: { classId: string; track: string; part: string; date: string; reason: string }) {
  if (!p.reason.trim()) throw new ReasonRequired('reason')
  const en = await activeEnrollment(studentId)
  if (en) await update('enrollment', en.id, { to_date: p.date }, p.reason, { action: 'transfer' })
  const cls = await get('class', p.classId)
  await insert('enrollment', {
    student_id: studentId, academic_year_id: cls!.academic_year_id, class_id: p.classId,
    track: p.track, curriculum_part: p.part, miqdar: en?.miqdar ?? '', from_date: p.date, to_date: null,
  }, { branchId: cls!.branch_id, reason: p.reason })
}
/** Students on the roll of a class on a given date (enrollment from ≤ date < to). */
export async function rollOn(classId: string, date: string): Promise<Row[]> {
  return all(`select s.*, e.id as enrollment_id, e.track, e.curriculum_part, e.from_date as en_from, e.to_date as en_to
    from enrollment e join student s on s.id = e.student_id
    where e.class_id = ? and e.from_date <= ? and (e.to_date is null or e.to_date = '' or e.to_date > ?)
    order by s.serial_no`, [classId, date, date])
}

// ---------- daily attendance ----------
export async function classDay(classId: string, date: string) {
  return get('class_day', detId('class_day', classId, date))
}
async function ensureClassDay(classId: string, date: string) {
  const id = detId('class_day', classId, date)
  const cd = await get('class_day', id)
  if (cd) return cd
  const cls = await get('class', classId)
  await insert('class_day', { class_id: classId, date, kind: 'teaching', submitted_at: null }, { id, branchId: cls!.branch_id, audit: false })
  return (await get('class_day', id))!
}
/**
 * Mark one student. Before the register is saved, changes are free. After it
 * is saved, any change needs a reason and is logged (approved rule, 2026-09-26).
 */
export async function mark(classId: string, studentId: string, date: string, status: Status, reason: string | null = null) {
  const cd = await ensureClassDay(classId, date)
  if (cd.kind === 'holiday') throw new Error('holiday')
  const locked = !!cd.submitted_at
  const id = detId('att', studentId, date)
  const existing = await get('student_attendance', id)
  if (existing) {
    if (existing.status === status) return
    await update('student_attendance', id, { status }, reason, { requireReason: locked, audit: locked, action: 'correct' })
  } else {
    if (locked && !reason?.trim()) throw new ReasonRequired('reason')
    await insert('student_attendance', { class_id: classId, student_id: studentId, date, status }, { id, branchId: cd.branch_id, audit: locked, reason: reason ?? undefined })
  }
  if (locked) await refreshAlertsForStudent(studentId, classId)
}
export async function markAllUnmarkedPresent(classId: string, date: string) {
  const roll = await rollOn(classId, date)
  const marks = await all<Row>('select student_id from student_attendance where class_id = ? and date = ?', [classId, date])
  const done = new Set(marks.map((m) => m.student_id))
  for (const s of roll) if (!done.has(s.id)) await mark(classId, s.id, date, 'P')
}
export async function setHoliday(classId: string, date: string, reason: string) {
  const cd = await ensureClassDay(classId, date)
  const marks = await one<{ n: number }>('select count(*) n from student_attendance where class_id = ? and date = ?', [classId, date])
  if ((marks?.n ?? 0) > 0) throw new Error('has-marks')
  await update('class_day', cd.id, { kind: 'holiday', holiday_reason: reason }, reason, { action: 'holiday' })
}
export async function setTeachingDay(classId: string, date: string, reason: string) {
  const cd = await ensureClassDay(classId, date)
  await update('class_day', cd.id, { kind: 'teaching', holiday_reason: null }, reason, { action: 'teaching' })
}
export async function submitRegister(classId: string, date: string) {
  const cd = await ensureClassDay(classId, date)
  const roll = await rollOn(classId, date)
  const marks = await all<Row>('select student_id from student_attendance where class_id = ? and date = ?', [classId, date])
  if (marks.length < roll.length) throw new Error('incomplete')
  await update('class_day', cd.id, { submitted_at: nowIso(), submitted_by: session.userId }, null, { requireReason: false, action: 'submit' })
  for (const s of roll) await refreshAlertsForStudent(s.id, classId)
}

// ---------- teacher attendance ----------
export async function teacherDay(teacherId: string, date: string) {
  return get('teacher_attendance', detId('tatt', teacherId, date))
}
export async function setTeacherTime(teacherId: string, date: string, field: 'arrival' | 'departure', time: string, reason: string | null) {
  const id = detId('tatt', teacherId, date)
  const ex = await get('teacher_attendance', id)
  const t = await get('teacher', teacherId)
  if (!ex) {
    await insert('teacher_attendance', { teacher_id: teacherId, date, [field]: time }, { id, branchId: t!.branch_id, audit: false })
  } else if (!ex[field]) {
    await update('teacher_attendance', id, { [field]: time }, null, { requireReason: false, audit: false })
  } else {
    await update('teacher_attendance', id, { [field]: time }, reason, { action: 'correct' })
  }
}

// ---------- calculations over a period ----------
/** Teaching dates for one student in [from, to], across every class they were enrolled in. */
export async function studentPeriod(studentId: string, from: string, to: string) {
  const rows = await all<{ date: string; status: Status | null }>(
    `select cd.date, sa.status from enrollment e
     join class_day cd on cd.class_id = e.class_id and cd.kind = 'teaching'
       and cd.date >= e.from_date and (e.to_date is null or e.to_date = '' or cd.date < e.to_date)
     left join student_attendance sa on sa.student_id = e.student_id and sa.date = cd.date
     where e.student_id = ? and cd.date >= ? and cd.date <= ?
     order by cd.date`, [studentId, from, to])
  const dates = [...new Set(rows.map((r) => r.date))]
  const map = new Map<string, Status>()
  for (const r of rows) if (r.status) map.set(r.date, r.status)
  return { dates, map }
}
export type StudentStat = Summary & { student: Row; marks: number; eligible: boolean; exception: Row | null; perfect: boolean }
export async function classPeriodStats(classId: string, from: string, to: string, st?: SettingsMap): Promise<StudentStat[]> {
  const s = st ?? await loadSettings()
  const students = await all<Row>(`select distinct s.* from enrollment e join student s on s.id = e.student_id
    where e.class_id = ? and e.from_date <= ? and (e.to_date is null or e.to_date = '' or e.to_date > ?) order by s.serial_no`, [classId, to, from])
  const out: StudentStat[] = []
  for (const stu of students) {
    const { dates, map } = await studentPeriod(stu.id, from, to)
    const sum = summarize(dates, map, s['attendance.leaveCountsAsAbsent'] as boolean)
    const exception = await one<Row>(`select * from eligibility_exception where student_id = ? and from_date <= ? and to_date >= ? order by created_at desc limit 1`, [stu.id, to, from])
    out.push({
      ...sum, student: stu,
      marks: attendanceMarks(sum.percent, s['attendance.bands'] as Band[]),
      eligible: isEligible(sum.percent, s['attendance.eligibilityMinPercent'] as number, !!exception),
      exception, perfect: isPerfect(sum),
    })
  }
  return out
}

// ---------- alerts ----------
export async function refreshAlertsForStudent(studentId: string, classId: string) {
  const s = await loadSettings()
  const { dates, map } = await studentPeriod(studentId, '0000-01-01', '9999-12-31')
  const streaks = absenceStreaks(dates, map, s['alerts.consecutiveAbsences'] as number, s['alerts.leaveBreaksStreak'] as boolean)
  const stu = await get('student', studentId)
  for (const k of streaks) {
    const id = detId('alert', 'absence3', studentId, k.start)
    const ex = await get('alert', id)
    const detail = JSON.stringify({ start: k.start, end: k.end, length: k.length })
    if (!ex) {
      await insert('alert', { type: 'absence_streak', student_id: studentId, class_id: classId, trigger_date: k.end, detail, status: 'open' },
        { id, branchId: stu!.branch_id, audit: false })
    } else if (ex.detail !== detail) {
      await update('alert', id, { detail, trigger_date: k.end }, null, { requireReason: false, audit: false })
    }
  }
}
export async function resolveAlert(alertId: string, action: string, note: string, absenceReason: string) {
  const a = await get('alert', alertId)
  await update('alert', alertId, { status: 'done', action, note, resolved_at: nowIso(), resolved_by: session.userId }, null, { requireReason: false, action: 'follow-up' })
  if (absenceReason.trim() && a) {
    const d = JSON.parse(a.detail || '{}')
    const rows = await all<Row>(`select * from student_attendance where student_id = ? and status = 'A' and date >= ? and date <= ?`, [a.student_id, d.start, d.end])
    for (const r of rows) await update('student_attendance', r.id, { absence_reason: absenceReason, follow_up_note: note }, null, { requireReason: false, action: 'absence-reason' })
  }
}

// ---------- messages ----------
export function waNumber(phone: string, cc: string) {
  const d = (phone || '').replace(/\D/g, '')
  if (d.startsWith('00')) return d.slice(2)
  if (d.startsWith('0')) return cc + d.slice(1)
  return d
}
export async function logMessage(familyId: string, studentId: string | null, channel: string, purpose: string, body: string) {
  const f = await get('family', familyId)
  await insert('message_log', { family_id: familyId, student_id: studentId, channel, purpose, body }, { branchId: f?.branch_id, audit: false })
}

export { db, today }
