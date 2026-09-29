// Mark schemes, exams and scores (Spec §7, §8). Every deduction tap is its
// own row; marks are recomputed from rows, so offline devices never merge.
import { all, one, get, insert, update, detId, session, today, nowIso, ReasonRequired, type Row } from './db'
import { loadSettings, rollOn, studentPeriod } from './repo'
import { planOn, yearOn, planForYear } from './calendarRepo'
import { DEFAULT_TEMPLATE, BMK_TEMPLATE, componentsFor, schemeTotal, defaultVariant, type SchemeDef, type Component } from '../engine/scheme'
import { scoreComponent, type Raw, type Tap, type Result } from '../engine/scoring'
import { percentHalfDown, gradeOf, positions, practicalStatus, type Practical } from '../engine/grading'
import { summarize } from '../engine/attendance'
import { cycleRange } from '../engine/calendar'
import type { Band } from '../engine/settings'
import { addDaysIso } from '../engine/hijri'

export type ExamKind = 'monthly' | 'five' | 'annual' | 'makeup'
export const EXAM_KINDS: { v: ExamKind; ur: string; en: string; ar: string }[] = [
  { v: 'monthly', ur: 'ماہانہ جائزہ', en: 'Monthly review', ar: 'التقييم الشهري' },
  { v: 'five', ur: 'پنج ماہی امتحان', en: 'Five-monthly exam', ar: 'امتحان نصف العام' },
  { v: 'annual', ur: 'سالانہ امتحان', en: 'Annual exam', ar: 'الامتحان السنوي' },
  { v: 'makeup', ur: 'بعد میں امتحان (غیر حاضر طلبہ)', en: 'Makeup exam (absent students)', ar: 'امتحان لاحق' },
]

// ---------- schemes ----------
export async function ensureDefaultSchemes() {
  const n = await one<{ n: number }>('select count(*) n from mark_scheme where organization_id = ?', [session.orgId])
  if ((n?.n ?? 0) > 0) return
  const lin = detId('scheme-lineage', session.orgId, 'default')
  await insert('mark_scheme', { name: DEFAULT_TEMPLATE.name.ur, version: 1, lineage_id: lin, scope: 'org', scope_id: null, kinds: JSON.stringify(['monthly', 'five', 'annual', 'makeup']), definition: JSON.stringify(DEFAULT_TEMPLATE), status: 'active' },
    { id: detId('scheme', lin, '1'), branchId: null, reason: 'default template v1' })
  const lin2 = detId('scheme-lineage', session.orgId, 'bmk')
  await insert('mark_scheme', { name: BMK_TEMPLATE.name.ur, version: 1, lineage_id: lin2, scope: 'org', scope_id: null, kinds: JSON.stringify([]), definition: JSON.stringify(BMK_TEMPLATE), status: 'active' },
    { id: detId('scheme', lin2, '1'), branchId: null, reason: 'alternative template' })
}
export const schemeDef = (row: Row): SchemeDef => JSON.parse(row.definition)
export const schemeKinds = (row: Row): ExamKind[] => { try { return JSON.parse(row.kinds || '[]') } catch { return [] } }

/** Scope order: exam → class → branch → org (§7.0 step 7). */
export async function resolveScheme(classId: string, kind: ExamKind): Promise<Row | null> {
  await ensureDefaultSchemes()
  const cls = await get('class', classId)
  const rows = await all<Row>(`select * from mark_scheme where organization_id = ? and status = 'active'`, [session.orgId])
  const fits = rows.filter((r) => schemeKinds(r).includes(kind))
  return fits.find((r) => r.scope === 'class' && r.scope_id === classId)
    ?? fits.find((r) => r.scope === 'branch' && r.scope_id === cls?.branch_id)
    ?? fits.find((r) => r.scope === 'org') ?? null
}

/** Editing never changes past marks: a new version row is created and the old one is superseded. */
export async function saveSchemeVersion(old: Row, def: SchemeDef, meta: { name: string; scope: string; scope_id: string | null; kinds: ExamKind[] }, reason: string) {
  if (!reason.trim()) throw new ReasonRequired('reason')
  const version = (old.version ?? 1) + 1
  const id = detId('scheme', old.lineage_id, String(version))
  await update('mark_scheme', old.id, { status: 'superseded' }, reason, { action: 'new-version' })
  await insert('mark_scheme', { name: meta.name, version, lineage_id: old.lineage_id, scope: meta.scope, scope_id: meta.scope_id, kinds: JSON.stringify(meta.kinds), definition: JSON.stringify(def), status: 'active' },
    { id, branchId: meta.scope === 'org' ? null : session.branchId, reason })
  return id
}
export async function copyScheme(src: Row, name: string) {
  const lin = detId('scheme-lineage', session.orgId, name, nowIso())
  return insert('mark_scheme', { name, version: 1, lineage_id: lin, scope: src.scope, scope_id: src.scope_id, kinds: JSON.stringify([]), definition: src.definition, status: 'active' },
    { id: detId('scheme', lin, '1'), branchId: null, reason: `copy of ${src.name} v${src.version}` })
}

// ---------- exams ----------
export async function createExam(p: { classId: string; kind: ExamKind; date: string; cycle?: number | null; examinerName: string; examinerUserId?: string | null; makeupOf?: string | null }) {
  const cls = await get('class', p.classId)
  const scheme = await resolveScheme(p.classId, p.kind)
  if (!scheme) throw new Error('no-scheme')
  const y = await yearOn(p.date)
  return insert('exam', {
    class_id: p.classId, academic_year_id: y?.id ?? cls?.academic_year_id, kind: p.kind, cycle: p.cycle ?? null, date: p.date,
    scheme_id: scheme.id, examiner_name: p.examinerName, examiner_user_id: p.examinerUserId ?? null, makeup_of: p.makeupOf ?? null,
  }, { branchId: cls!.branch_id })
}

/** Exams visible to the user: examiners see only exams assigned to them. */
export async function visibleExams(): Promise<Row[]> {
  const rows = await all<Row>(`select e.*, c.name class_name from exam e join class c on c.id = e.class_id
    where e.organization_id = ? and (? is null or e.branch_id = ?) order by e.date desc`, [session.orgId, session.branchId, session.branchId])
  if (session.role === 'examiner') return rows.filter((r) => r.examiner_user_id === session.userId)
  if (session.role === 'teacher') {
    const mine = await all<Row>(`select class_id from class_teacher where teacher_id = ? and (to_date is null or to_date = '')`, [session.teacherId])
    const ids = new Set(mine.map((m) => m.class_id))
    return rows.filter((r) => ids.has(r.class_id))
  }
  return rows
}

/** Attendance window per exam (Book p. 69): monthly = that cycle; five-monthly = preceding 5 months; annual = the whole year. */
export async function examWindow(exam: Row): Promise<{ from: string; to: string }> {
  const cls = await get('class', exam.class_id)
  const r = await planOn(exam.date, cls?.branch_id ?? null)
  const kind: ExamKind = exam.kind === 'makeup' && exam.makeup_of ? ((await get('exam', exam.makeup_of))?.kind ?? 'monthly') : exam.kind
  if (r) {
    const p = r.plan, start = r.info.config.start
    const preps = p.days.filter((d) => d.type === 'exam_prep').map((d) => d.date)
    if (kind === 'monthly') {
      const c = exam.cycle || p.byDate.get(exam.date)?.cycle
      const cr = c ? cycleRange(p, c) : null
      if (cr) return { from: cr.from, to: cr.to < exam.date ? cr.to : exam.date }
    }
    // five-monthly / annual: from the year start to the day before exam preparation
    // (when the exam is held on its calendar dates), otherwise up to the day before the exam
    const near = (prep: string | undefined) => prep && exam.date >= prep && exam.date <= addDaysIso(prep, 14)
    if (kind === 'five') return { from: start, to: near(preps[0]) ? addDaysIso(preps[0], -1) : addDaysIso(exam.date, -1) }
    if (kind === 'annual') { const pr = preps[preps.length - 1]; return { from: start, to: near(pr) ? addDaysIso(pr, -1) : addDaysIso(exam.date, -1) } }
  }
  const y = await yearOn(exam.date)
  if (kind === 'monthly') return { from: addDaysIso(exam.date, -30), to: exam.date }
  if (kind === 'five') return { from: addDaysIso(exam.date, -152), to: exam.date }
  return { from: y?.start_date ?? addDaysIso(exam.date, -300), to: exam.date }
}

export async function examStudents(exam: Row): Promise<Row[]> {
  if (exam.makeup_of) {
    return all<Row>(`select s.*, es.variant from exam_student es join student s on s.id = es.student_id where es.exam_id = ? and es.absent = 1`, [exam.makeup_of])
  }
  return rollOn(exam.class_id, exam.date)
}

export type StudentScore = {
  student: Row; track: string; part: string; es: Row | null
  comps: { c: Component; raw: Raw; taps: (Tap & { id: string })[]; r: Result }[]
  total: number; max: number; percent: number; grade: ReturnType<typeof gradeOf>; complete: boolean
  attPercent: number | null; namazi: number | null; practicalAuto: Practical; window: { from: string; to: string }
}

export async function loadStudentScore(exam: Row, studentId: string): Promise<StudentScore> {
  const st = await loadSettings()
  const student = (await get('student', studentId))!
  const en = await one<Row>(`select * from enrollment where student_id = ? and from_date <= ? order by from_date desc limit 1`, [studentId, exam.date])
  const track = en?.track ?? 'nazira', part = en?.curriculum_part ?? 'awwal'
  const scheme = schemeDef((await get('mark_scheme', exam.scheme_id))!)
  const es = await get('exam_student', detId('es', exam.id, studentId))
  const entries = await all<Row>('select * from score_entry where exam_id = ? and student_id = ?', [exam.id, studentId])
  const taps = await all<Row>('select * from deduction_event where exam_id = ? and student_id = ? order by created_at', [exam.id, studentId])
  const window = await examWindow(exam)
  const pd = await studentPeriod(studentId, window.from, window.to)
  const attPercent = summarize(pd.dates, pd.map, st['attendance.leaveCountsAsAbsent'] as boolean).percent
  const makeup = !!exam.makeup_of || !!es?.makeup
  const comps = componentsFor(scheme, track, part).map((c) => {
    const e = entries.find((x) => x.component_key === c.key)
    const raw: Raw = e ? JSON.parse(e.raw) : {}
    if (c.method === 'recitation' && !raw.variant) raw.variant = es?.variant || defaultVariant(track, part)
    if (c.method === 'recitation' && raw.paras === undefined) raw.paras = es?.paras ?? 1
    const t = taps.filter((x) => x.component_key === c.key).map((x) => ({ id: x.id, type: x.type, key: x.key, q: x.q, voided: !!x.voided }))
    const r = scoreComponent(c, raw, t, { gender: student.gender, attendancePercent: attPercent, bands: st['attendance.bands'] as Band[], makeup })
    return { c, raw, taps: t, r }
  })
  const max = schemeTotal(scheme, track, part)
  const grace = makeup ? 0 : Number(es?.grace ?? 0)
  const sum = comps.reduce((a, x) => a + x.r.marks, 0)
  const total = Math.min(max, sum + grace)
  const percent = percentHalfDown(total, max)
  const namaziC = comps.find((x) => x.c.cardRole === 'namazi' || x.c.method === 'category')
  const namazi = namaziC ? namaziC.r.marks : null
  const concerns: string[] = es?.concerns ? JSON.parse(es.concerns) : []
  return {
    student, track, part, es, comps, total, max, percent, grade: gradeOf(percent),
    complete: !!es?.absent || comps.every((x) => x.r.complete), attPercent, namazi,
    practicalAuto: practicalStatus(attPercent, namaziC && namaziC.r.complete ? namazi : null, concerns.length > 0), window,
  }
}

async function assertOpen(examId: string, reason: string | null) {
  const ex = await get('exam', examId)
  if (ex?.finalized_at && !reason?.trim()) throw new ReasonRequired('finalized')
  return ex!
}
async function ensureES(exam: Row, studentId: string) {
  const id = detId('es', exam.id, studentId)
  if (!(await get('exam_student', id))) await insert('exam_student', { exam_id: exam.id, student_id: studentId, absent: 0, makeup: exam.makeup_of ? 1 : 0, grace: 0, hold_promotion: 0 }, { id, branchId: exam.branch_id, audit: false })
  return id
}

export async function saveRaw(examId: string, studentId: string, compKey: string, raw: Raw, reason: string | null = null) {
  const exam = await assertOpen(examId, reason)
  await ensureES(exam, studentId)
  const id = detId('se', examId, studentId, compKey)
  const ex = await get('score_entry', id)
  if (ex) await update('score_entry', id, { raw: JSON.stringify(raw) }, reason, { requireReason: !!exam.finalized_at, audit: !!exam.finalized_at, action: 'score' })
  else await insert('score_entry', { exam_id: examId, student_id: studentId, component_key: compKey, raw: JSON.stringify(raw) }, { id, branchId: exam.branch_id, audit: false })
  await recompute(examId, studentId)
}
export async function addTap(examId: string, studentId: string, compKey: string, type: string, key: string | null, q: number | null, points: number) {
  const exam = await assertOpen(examId, null)
  await ensureES(exam, studentId)
  await insert('deduction_event', { exam_id: examId, student_id: studentId, component_key: compKey, type, key, q, points, voided: 0 }, { branchId: exam.branch_id, audit: false })
  laterRecompute(examId, studentId)
}
// Taps come quickly one after another; the stored totals are refreshed once the examiner pauses.
const timers = new Map<string, ReturnType<typeof setTimeout>>()
async function flushRecomputes() {
  const ks = [...timers.keys()]
  for (const k of ks) { clearTimeout(timers.get(k)); timers.delete(k); const [e, st] = k.split('|'); await recompute(e, st) }
}
function laterRecompute(examId: string, studentId: string) {
  const k = examId + '|' + studentId
  clearTimeout(timers.get(k))
  timers.set(k, setTimeout(() => { timers.delete(k); recompute(examId, studentId).catch((e) => console.error(e)) }, 700))
}
/** Undo a tap: the row stays, marked void (nothing is deleted). */
export async function voidTap(tapId: string) {
  const t = await get('deduction_event', tapId)
  if (!t) return
  await assertOpen(t.exam_id, null)
  await update('deduction_event', tapId, { voided: 1 }, 'undo', { requireReason: false, action: 'undo' })
  laterRecompute(t.exam_id, t.student_id)
}
export async function saveStudentMeta(examId: string, studentId: string, ch: Record<string, any>, reason: string | null = null) {
  const exam = await assertOpen(examId, reason)
  const id = await ensureES(exam, studentId)
  await update('exam_student', id, ch, reason, { requireReason: !!exam.finalized_at, audit: true, action: 'student-meta' })
  await recompute(examId, studentId)
}

export async function recompute(examId: string, studentId: string) {
  const exam = (await get('exam', examId))!
  const s = await loadStudentScore(exam, studentId)
  const id = detId('es', examId, studentId)
  const es = await get('exam_student', id)
  for (const x of s.comps) {
    const seId = detId('se', examId, studentId, x.c.key)
    const se = await get('score_entry', seId)
    if (se && (se.marks !== x.r.marks || !!se.complete !== x.r.complete)) await update('score_entry', seId, { marks: x.r.marks, complete: x.r.complete ? 1 : 0 }, null, { requireReason: false, audit: false })
  }
  if (es) await update('exam_student', id, {
    total: s.total, max: s.max, percent: s.percent, grade: s.grade.key, complete: s.complete ? 1 : 0,
    att_percent: s.attPercent, namazi: s.namazi, practical: es.practical_reason ? es.practical : s.practicalAuto,
  }, null, { requireReason: false, audit: false })
}

export async function examSheet(exam: Row) {
  const studs = await examStudents(exam)
  const rows = await all<Row>('select * from exam_student where exam_id = ?', [exam.id])
  const byS = new Map(rows.map((r) => [r.student_id, r]))
  return studs.map((s) => ({ student: s, es: byS.get(s.id) ?? null }))
}

/** Finalize (nazim): all students scored or marked absent; positions are then computed (§3, §8.1). */
export async function finalizeExam(examId: string) {
  await flushRecomputes()
  const exam = (await get('exam', examId))!
  const sheet = await examSheet(exam)
  const missing = sheet.filter((r) => !r.es || (!r.es.complete && !r.es.absent))
  if (missing.length) {
    const first = await loadStudentScore(exam, missing[0].student.id)
    const parts = first.comps.filter((x) => !x.r.complete).map((x) => x.c.key).join(',')
    throw new Error(`incomplete:${missing.length}:${missing[0].student.name}:${parts}`)
  }
  for (const r of sheet) await recompute(examId, r.student.id)
  const fresh = await all<Row>('select * from exam_student where exam_id = ?', [examId])
  const st = await loadSettings()
  const pos = positions(fresh.map((r) => ({ id: r.id, total: r.total ?? 0, makeup: !!r.makeup || !!exam.makeup_of, absent: !!r.absent })), (st['position.tieStyle'] as any) ?? 'competition')
  for (const r of fresh) await update('exam_student', r.id, { position: pos.get(r.id) ?? null }, null, { requireReason: false, audit: false })
  await update('exam', examId, { finalized_at: nowIso(), finalized_by: session.userId }, null, { requireReason: false, action: 'finalize' })
}
export async function reopenExam(examId: string, reason: string) {
  await update('exam', examId, { finalized_at: null, finalized_by: null }, reason, { action: 'reopen' })
}
export async function signExam(examId: string, name: string) {
  await update('exam', examId, { signed_by: name, signed_at: nowIso() }, null, { requireReason: false, action: 'sign' })
}

/** Suggested exam dates for a class from the calendar. */
export async function calendarExamDates(classId: string) {
  const cls = await get('class', classId)
  const y = await yearOn(today())
  if (!y) return null
  const { plan } = await planForYear(y, cls?.branch_id ?? null)
  return { jaiza: plan.events.jaiza.map((j, i) => ({ date: j[0], cycle: i + 1 })), five: plan.events.fiveMonthly[0], annual: plan.events.annual[0] }
}
