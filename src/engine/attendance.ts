// Attendance rule engine (Spec §6). Pure functions only: no database, no UI,
// so the same results come out on every device, online or offline.
import type { Band } from './settings'

export type Status = 'P' | 'A' | 'L'

export type Summary = {
  teachingDays: number
  present: number
  absent: number // A only
  leave: number // L only
  unmarked: number // teaching days with no mark for this student
  notPresent: number // everything that is not P (A + L + unmarked)
  percent: number | null // unrounded; null when there are no teaching days
}

/** attendance % = days present × 100 ÷ teaching days. Leave (L) counts as absence. */
export function attendancePercent(present: number, teachingDays: number): number | null {
  if (teachingDays <= 0) return null
  return (present * 100) / teachingDays
}

/**
 * Marks from the band table. A band is reached only when the percentage reaches
 * its lower edge — there is no rounding up, so 89.6% is in the 80–89% band.
 */
export function attendanceMarks(percent: number | null, bands: Band[]): number {
  if (percent === null) return 0
  const sorted = [...bands].sort((a, b) => b.min - a.min)
  // Guard against floating error such as 99.99999999 for an exact 100.
  const p = Math.round(percent * 1e9) / 1e9
  for (const b of sorted) if (p >= b.min) return b.marks
  return 0
}

/**
 * Summarise one student's attendance over a list of teaching dates.
 * `teachingDates` must already be limited to the dates the student was enrolled.
 */
export function summarize(teachingDates: string[], statusByDate: Map<string, Status>, leaveCountsAsAbsent = true): Summary {
  let present = 0, absent = 0, leave = 0, unmarked = 0
  for (const d of teachingDates) {
    const s = statusByDate.get(d)
    if (s === 'P') present++
    else if (s === 'A') absent++
    else if (s === 'L') leave++
    else unmarked++
  }
  const teachingDays = leaveCountsAsAbsent ? teachingDates.length : teachingDates.length - leave
  return {
    teachingDays,
    present,
    absent,
    leave,
    unmarked,
    notPresent: absent + leave + unmarked,
    percent: attendancePercent(present, teachingDays),
  }
}

export type Streak = { start: string; end: string; length: number }

/**
 * Runs of consecutive unexcused absences (A) over teaching days, in date order.
 * P or an unmarked day ends a run. L ends a run when `leaveBreaks` is true
 * (approved default); when false, L is skipped over and neither breaks nor counts.
 * Returns only runs that reached `threshold`.
 */
export function absenceStreaks(
  teachingDates: string[],
  statusByDate: Map<string, Status>,
  threshold: number,
  leaveBreaks = true,
): Streak[] {
  const dates = [...teachingDates].sort()
  const out: Streak[] = []
  let start: string | null = null, end = '', len = 0
  const close = () => {
    if (start && len >= threshold) out.push({ start, end, length: len })
    start = null; len = 0
  }
  for (const d of dates) {
    const s = statusByDate.get(d)
    if (s === 'A') {
      if (!start) start = d
      end = d; len++
    } else if (s === 'L' && !leaveBreaks) {
      continue
    } else {
      close()
    }
  }
  close()
  return out
}

/** Below the minimum % a student is not entered in the exam, unless the nazim records an exception. */
export function isEligible(percent: number | null, minPercent: number, hasException: boolean): boolean {
  if (hasException) return true
  if (percent === null) return true // nothing to judge yet
  return percent >= minPercent
}

/** صاحبِ ترتیب: present on every teaching day of the period. */
export function isPerfect(s: Summary): boolean {
  return s.teachingDays > 0 && s.present === s.teachingDays
}

/** Age as whole years and months on a given date (ISO yyyy-mm-dd). */
export function ageYM(dob: string, on: string): { years: number; months: number } | null {
  if (!dob) return null
  const [y1, m1, d1] = dob.split('-').map(Number)
  const [y2, m2, d2] = on.split('-').map(Number)
  let months = (y2 - y1) * 12 + (m2 - m1)
  if (d2 < d1) months--
  if (months < 0) return null
  return { years: Math.floor(months / 12), months: months % 12 }
}

/** Percentage for display: one decimal, English digits, never rounded up across a band edge. */
export function fmtPercent(p: number | null): string {
  if (p === null) return '—'
  return (Math.floor(p * 10) / 10).toFixed(1) + '%'
}
