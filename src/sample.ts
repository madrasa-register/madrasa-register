// Sample data for testing Phase 1 only (clearly fictional names).
import { all, insert, session, today } from './db/db'
import { admitStudent, assignTeacher, mark, submitRegister, setTeacherTime } from './db/repo'
import { addDays, weekday } from './ui'
import type { Status } from './engine/attendance'
import { createExam, saveRaw, addTap, finalizeExam, saveStudentMeta } from './db/examRepo'
import { recordPayment } from './db/hadiyaRepo'

export async function loadSampleData(branchId: string) {
  session.branchId = branchId
  const years = await all('select * from academic_year where organization_id = ?', [session.orgId])
  const yearId = years[0]?.id ?? await insert('academic_year', { label: '2026/27', start_date: addDays(today(), -60) }, { branchId: null })

  await insert('app_user', { name: 'ناظم صاحب (نمونہ)', role: 'nazim', status: 'active' }, { branchId })
  const t1 = await insert('teacher', { name: 'قاری عبدالرحمٰن (نمونہ)', phone: '0300-1111111', gender: 'm', status: 'active' }, { branchId })
  const t2 = await insert('teacher', { name: 'معلمہ عائشہ (نمونہ)', phone: '0300-2222222', gender: 'f', status: 'active' }, { branchId })
  await insert('app_user', { name: 'قاری عبدالرحمٰن (نمونہ)', role: 'teacher', teacher_id: t1, status: 'active' }, { branchId })
  await insert('app_user', { name: 'معلمہ عائشہ (نمونہ)', role: 'teacher', teacher_id: t2, status: 'active' }, { branchId })

  const start = addDays(today(), -35)
  const c1 = await insert('class', { academic_year_id: yearId, name: 'ناظرہ — حصہ اول (بنین)', track: 'nazira', curriculum_part: 'awwal', shift: 'morning', start_time: '07:00', end_time: '08:30', gender: 'boys', capacity: 25, status: 'active' }, { branchId })
  const c2 = await insert('class', { academic_year_id: yearId, name: 'ناظرہ — حصہ ابتدائیہ (بنات)', track: 'nazira', curriculum_part: 'ibtidaiya', shift: 'afternoon', start_time: '14:00', end_time: '15:30', gender: 'girls', capacity: 25, status: 'active' }, { branchId })
  await assignTeacher(c1, t1, start, null)
  await assignTeacher(c2, t2, start, null)

  const fams: [string, string][] = [
    ['محمد اسلم', '0301-5550101'], ['عبدالغفور', '0302-5550102'], ['نعیم احمد', '0303-5550103'],
    ['شفیق الرحمٰن', '0304-5550104'], ['محمد یونس', '0305-5550105'], ['خالد محمود', '0306-5550106'], ['طارق جمیل', '0307-5550107'],
  ]
  const kids: [number, string, string, string][] = [
    [0, 'احمد', 'm', c1], [0, 'فاطمہ', 'f', c2], [1, 'عمر', 'm', c1], [2, 'حسن', 'm', c1], [2, 'زینب', 'f', c2],
    [3, 'بلال', 'm', c1], [4, 'حمزہ', 'm', c1], [4, 'مریم', 'f', c2], [5, 'عثمان', 'm', c1], [6, 'خدیجہ', 'f', c2], [6, 'سعد', 'm', c1],
  ]
  const famIds: (string | null)[] = fams.map(() => null)
  const ids: { id: string; cls: string; i: number }[] = []
  for (let i = 0; i < kids.length; i++) {
    const [f, name, g, cls] = kids[i]
    const id = await admitStudent({
      familyId: famIds[f], family: { guardian_name: fams[f][0], relation: 'والد', phone1: fams[f][1], whatsapp1: 1 },
      student: { name, walidiyat: fams[f][0], gender: g, dob: addDays(today(), -(6 * 365 + i * 97)), admission_date: start },
      classId: cls, academicYearId: yearId, track: 'nazira', part: cls === c1 ? 'awwal' : 'ibtidaiya', miqdar: '', fromDate: start,
    })
    if (!famIds[f]) famIds[f] = (await all('select family_id from student where id = ?', [id]))[0].family_id
    ids.push({ id, cls, i })
  }
  // attendance for past teaching days (weekly holiday Sunday skipped)
  const days: string[] = []
  for (let d = start; d < today(); d = addDays(d, 1)) if (weekday(d) !== 0) days.push(d)
  const recent = days.slice(-3)
  for (const d of days) {
    for (const s of ids) {
      let st: Status = 'P'
      if (s.i === 2 && recent.includes(d)) st = 'A' // عمر: 3 consecutive absences → alert
      else if (s.i === 5 && d === days[days.length - 6]) st = 'A'
      else if (s.i === 5 && d === days[days.length - 5]) st = 'L' // بلال: A, L, A — no alert (L breaks)
      else if (s.i === 5 && d === days[days.length - 4]) st = 'A'
      else if (s.i === 8 && days.indexOf(d) % 4 === 1) st = 'A' // عثمان: low attendance
      else if (s.i === 8 && days.indexOf(d) % 4 === 2) st = 'L'
      else if (s.i === 4 && days.indexOf(d) === 7) st = 'L'
      await mark(s.cls, s.id, d, st)
    }
    await submitRegister(c1, d)
    await submitRegister(c2, d)
    await setTeacherTime(t1, d, 'arrival', '06:55', null)
    await setTeacherTime(t1, d, 'departure', '08:35', null)
    await setTeacherTime(t2, d, 'arrival', '13:58', null)
    await setTeacherTime(t2, d, 'departure', '15:32', null)
  }

  // A finalized five-monthly exam for the boys' class (sample marks)
  const exId = await createExam({ classId: c1, kind: 'five', date: addDays(today(), -1), examinerName: 'ناظم صاحب (نمونہ)' })
  const boys = ids.filter((x) => x.cls === c1)
  const plan: [number, string[], string[], string][] = [
    // [ghalti taps, tajweed letters, subject outcomes, namazi]
    [0, [], ['c', 'c', 'c', 'c', 'c', 'c', 'c', 'c'], 'jamaat'],
    [3, ['ض', 'ض', 'ظ'], ['c', 'p', 'c', 'w', 'c', 'c', 'p', 'c'], 'ontime'],
    [1, ['ق'], ['c', 'c', 'c', 'c', 'p', 'c', 'c', 'c'], 'jamaat'],
    [2, ['ع'], ['c', 'c', 'w', 'c', 'c', 'c', 'c', 'p'], 'jamaat'],
    [0, [], ['c', 'c', 'c', 'c', 'c', 'c', 'c', 'c'], 'jamaat'],
    [6, ['ض', 'ص', 'ط'], ['w', 'w', 'p', 'w', 'c', 'w', 'w', 'w'], 'qaza'],
    [1, [], ['c', 'c', 'c', 'c', 'c', 'c', 'c', 'c'], 'ontime'],
  ]
  for (let i = 0; i < boys.length; i++) {
    const [gh, letters, out, nm] = plan[i % plan.length]
    const sid = boys[i].id
    await saveRaw(exId, sid, 'pukhtagi', { variant: 'nazira', checked: true })
    for (let k = 0; k < gh; k++) await addTap(exId, sid, 'pukhtagi', k % 3 === 2 ? 'atkan' : 'ghalti', null, (k % 2) + 1, k % 3 === 2 ? 1 : 3)
    await saveRaw(exId, sid, 'tajweed', { checked: true })
    for (const L of letters) await addTap(exId, sid, 'tajweed', 'makhraj', L, null, 3)
    for (let k = 0; k < 4; k++) {
      const o = [out[k * 2], out[k * 2 + 1]] as any
      await saveRaw(exId, sid, `slot${'ABCD'[k]}`, { outcomes: o, easy: o[0] === 'w' && o[1] === 'w' ? 'yes' : null })
    }
    await saveRaw(exId, sid, 'namazi', { option: nm })
    await saveStudentMeta(exId, sid, { remark: '' })
  }
  await finalizeExam(exId)

  // Hadiya: a few sample payments (default Rs 500 a month)
  const fam = await all('select * from family where branch_id = ? order by created_at', [branchId])
  for (const f of fam.slice(0, 3)) {
    const kids = await all('select id from student where family_id = ?', [f.id])
    const m = start.slice(0, 7)
    await recordPayment({ familyId: f.id, payer: f.guardian_name, sponsor: false, date: today(), collector: 'قاری عبدالرحمٰن (نمونہ)', note: '', kind: 'fee',
      allocations: kids.map((k: any) => ({ student_id: k.id, month: m, amount: 500 })), branchId })
  }
}
