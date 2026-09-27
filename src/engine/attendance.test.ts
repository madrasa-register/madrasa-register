import { describe, it, expect } from 'vitest'
import { attendanceMarks, attendancePercent, summarize, absenceStreaks, isEligible, isPerfect, ageYM, fmtPercent, type Status } from './attendance'
import { defaultSettings, resolveSettings, type Band } from './settings'

const bands = defaultSettings()['attendance.bands'] as Band[]
const m = (o: Record<string, Status>) => new Map(Object.entries(o))

describe('attendance marks (Reg. p. 58)', () => {
  it('maps each band edge exactly', () => {
    expect(attendanceMarks(100, bands)).toBe(10)
    expect(attendanceMarks(99.9, bands)).toBe(8)
    expect(attendanceMarks(90, bands)).toBe(8)
    expect(attendanceMarks(89.99, bands)).toBe(6)
    expect(attendanceMarks(80, bands)).toBe(6)
    expect(attendanceMarks(79.9, bands)).toBe(4)
    expect(attendanceMarks(70, bands)).toBe(4)
    expect(attendanceMarks(69, bands)).toBe(2)
    expect(attendanceMarks(60, bands)).toBe(2)
    expect(attendanceMarks(59.99, bands)).toBe(0)
    expect(attendanceMarks(0, bands)).toBe(0)
  })
  it('89.6% is in the 80–89% band (spec example)', () => {
    expect(attendanceMarks(89.6, bands)).toBe(6)
  })
  it('an exact 100% computed from fractions still gets 10', () => {
    expect(attendanceMarks(attendancePercent(167, 167), bands)).toBe(10)
    expect(attendanceMarks(attendancePercent(3, 3), bands)).toBe(10)
  })
  it('uses whatever bands are configured', () => {
    expect(attendanceMarks(75, [{ min: 50, marks: 5 }, { min: 0, marks: 1 }])).toBe(5)
  })
  it('display never rounds 89.96 up to 90.0', () => {
    expect(fmtPercent(89.96)).toBe('89.9%')
  })
})

describe('summary and percentage', () => {
  const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06']
  it('leave counts as absence', () => {
    const s = summarize(days, m({ '2026-10-01': 'P', '2026-10-02': 'P', '2026-10-03': 'L', '2026-10-05': 'P', '2026-10-06': 'A' }))
    expect(s).toMatchObject({ teachingDays: 5, present: 3, absent: 1, leave: 1, notPresent: 2 })
    expect(s.percent).toBe(60)
  })
  it('unmarked teaching days are reported, and not counted as present', () => {
    const s = summarize(days, m({ '2026-10-01': 'P' }))
    expect(s.unmarked).toBe(4)
    expect(s.percent).toBe(20)
  })
  it('no teaching days → no percentage', () => {
    expect(summarize([], new Map()).percent).toBeNull()
  })
  it('perfect attendance', () => {
    expect(isPerfect(summarize(days.slice(0, 2), m({ '2026-10-01': 'P', '2026-10-02': 'P' })))).toBe(true)
    expect(isPerfect(summarize([], new Map()))).toBe(false)
  })
})

describe('consecutive absences (Reg. p. 54)', () => {
  const d = ['01', '02', '03', '04', '05', '06', '07'].map((x) => `2026-10-${x}`)
  it('3 A in a row raises one streak', () => {
    const s = absenceStreaks(d, m({ [d[0]]: 'P', [d[1]]: 'A', [d[2]]: 'A', [d[3]]: 'A', [d[4]]: 'P' }), 3)
    expect(s).toEqual([{ start: d[1], end: d[3], length: 3 }])
  })
  it('2 A is not enough', () => {
    expect(absenceStreaks(d, m({ [d[0]]: 'A', [d[1]]: 'A', [d[2]]: 'P' }), 3)).toEqual([])
  })
  it('L breaks the run by default (A, L, A does not alert)', () => {
    expect(absenceStreaks(d, m({ [d[0]]: 'A', [d[1]]: 'L', [d[2]]: 'A', [d[3]]: 'A' }), 3)).toEqual([])
  })
  it('with leaveBreaks=false, L is skipped over', () => {
    const s = absenceStreaks(d, m({ [d[0]]: 'A', [d[1]]: 'L', [d[2]]: 'A', [d[3]]: 'A' }), 3, false)
    expect(s).toEqual([{ start: d[0], end: d[3], length: 3 }])
  })
  it('holidays are not in the teaching list, so they do not break a run', () => {
    const teaching = [d[0], d[1], d[3]] // d[2] was a holiday
    expect(absenceStreaks(teaching, m({ [d[0]]: 'A', [d[1]]: 'A', [d[3]]: 'A' }), 3)).toHaveLength(1)
  })
  it('a long run is one streak, not several', () => {
    const all = Object.fromEntries(d.map((x) => [x, 'A' as Status]))
    expect(absenceStreaks(d, m(all), 3)).toEqual([{ start: d[0], end: d[6], length: 7 }])
  })
})

describe('eligibility, age, settings', () => {
  it('below 60% is not eligible unless an exception exists', () => {
    expect(isEligible(59.9, 60, false)).toBe(false)
    expect(isEligible(60, 60, false)).toBe(true)
    expect(isEligible(40, 60, true)).toBe(true)
  })
  it('age in years and months', () => {
    expect(ageYM('2018-03-15', '2026-09-26')).toEqual({ years: 8, months: 6 })
    expect(ageYM('2018-09-27', '2026-09-26')).toEqual({ years: 7, months: 11 })
  })
  it('branch setting overrides organization setting', () => {
    const s = resolveSettings(
      [
        { key: 'alerts.consecutiveAbsences', value: '4', branch_id: null },
        { key: 'alerts.consecutiveAbsences', value: '5', branch_id: 'b1' },
      ],
      'b1',
    )
    expect(s['alerts.consecutiveAbsences']).toBe(5)
    expect(s['attendance.eligibilityMinPercent']).toBe(60)
  })
})
