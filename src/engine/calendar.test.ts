import { describe, it, expect } from 'vitest'
import { generatePlan, suggestStart, DEFAULT_YEAR } from './calendar'
import { SAMPLES } from './calendarSamples'
import { toHijri, fromHijri, suggestIslamicHolidays, monthLengthIssues } from './hijri'

const toHijriBase = (near: string) => fromHijri({ ...toHijri(near), d: 1 }, near)!
const SUN = { weeklyHoliday: 0, practiceWeekday: 6 }
const ends = (a: string[]) => [a[0], a[a.length - 1]]

describe('spec §5 validation set: exam dates from each year start', () => {
  const expected: Record<string, [string, string, string, string]> = {
    '2025/26': ['2025-09-13', '2025-09-17', '2026-01-16', '2026-01-21'],
    '2024/25': ['2024-09-23', '2024-09-27', '2025-01-27', '2025-01-31'],
    '2023/24': ['2023-10-04', '2023-10-07', '2024-02-05', '2024-02-10'],
  }
  for (const s of SAMPLES) {
    it(s.label, () => {
      const p = generatePlan(s.config, SUN)
      expect([...ends(p.events.fiveMonthly), ...ends(p.events.annual)]).toEqual(expected[s.label])
    })
  }
})

describe('every event date printed on the three calendars', () => {
  for (const s of SAMPLES) {
    describe(s.label, () => {
      const p = generatePlan(s.config, SUN)
      it('ماہانہ جائزہ (8)', () => expect(p.events.jaiza.map(ends)).toEqual(s.printed.jaiza))
      it('دہرائی + تربیتی سرگرمی (8)', () => expect(p.events.tarbiyati).toEqual(s.printed.tarbiyati))
      it('بزم (6)', () => expect(p.events.bazm).toEqual(s.printed.bazm))
      it('مسابقہ (2)', () => expect(p.events.musabqa).toEqual(s.printed.musabqa))
      it('والدین ملاقات and فضلاء جوڑ are on the weekly holiday', () => {
        expect(p.events.parents).toEqual(s.printed.parents)
        expect(p.events.fuzala).toEqual(s.printed.fuzala)
        expect(p.warnings.filter((w) => w.startsWith('pin-not-holiday'))).toEqual([])
      })
      it('no unscheduled days and no overflow', () => {
        expect(p.warnings.filter((w) => w === 'overflow' || w.startsWith('unscheduled'))).toEqual([])
      })
    })
  }
})

describe('day totals against the printed totals column', () => {
  it('2023/24 matches exactly (355 days)', () => {
    const s = SAMPLES[0]
    const p = generatePlan(s.config, SUN)
    expect(p.days.length).toBe(355)
    expect(p.totals).toEqual(s.printed.totals)
  })
  it('2024/25 matches exactly (351 days)', () => {
    const s = SAMPLES[1]
    const p = generatePlan(s.config, SUN)
    expect(p.days.length).toBe(351)
    expect(p.totals).toEqual(s.printed.totals)
  })
  it('2025/26 matches; the printed تعطیل (68) also counts the 4 Eid days 1–4 April before the year opened', () => {
    const s = SAMPLES[2]
    const p = generatePlan(s.config, SUN)
    expect(p.days.length).toBe(355)
    expect({ ...p.totals, holiday: p.totals.holiday + 4 }).toEqual(s.printed.totals)
  })
})

describe('engine rules', () => {
  const s = SAMPLES[1]
  it('a new pinned holiday pushes the rest of the year forward (working days, not calendar days)', () => {
    const base = generatePlan(s.config, SUN)
    const moved = generatePlan({ ...s.config, holidays: [...s.config.holidays, { from: '2024-05-02', to: '2024-05-02', reason: 'test' }] }, SUN)
    expect(base.events.tarbiyati[0]).toBe('2024-05-09')
    expect(moved.events.tarbiyati[0]).toBe('2024-05-10')
  })
  it('the weekly holiday is a branch setting (Friday branch gives a different plan)', () => {
    const fri = generatePlan(s.config, { weeklyHoliday: 5, practiceWeekday: 4 })
    expect(fri.byDate.get('2024-04-19')!.type).toBe('holiday') // Friday
    expect(fri.byDate.get('2024-04-21')!.type).not.toBe('holiday') // Sunday is a working day
  })
  it('defaults follow the spec (20/3/2/1, 3 prep days, 5 exam days)', () => {
    expect(DEFAULT_YEAR.cycle).toEqual({ padhai: 20, dohrai: 3, jaiza: 2, bazm: 1 })
    expect(DEFAULT_YEAR.fiveMonthly).toMatchObject({ prepDays: 3, examDays: 5 })
  })
  it('suggested start is the first working day after the Eid holidays', () => {
    expect(suggestStart('2024-04-14', SUN)).toBe('2024-04-15')
    expect(suggestStart('2025-04-04', SUN)).toBe('2025-04-05')
  })
  it('practice weekday padhai is shown as پڑھائی + عملی مشق', () => {
    const p = generatePlan(s.config, SUN)
    expect(p.byDate.get('2024-04-20')!.type).toBe('practice') // Saturday
  })
})

describe('Hijri with moon-sighting overrides', () => {
  it('base calendar (Umm al-Qura)', () => {
    expect(toHijri('2024-04-10')).toEqual({ y: 1445, m: 10, d: 1 })
  })
  it('an override moves that month and all later months', () => {
    const ov = [{ hy: 1445, hm: 9, start: '2024-03-12' }] // Ramadan seen one day later
    expect(toHijri('2024-03-11', 0, ov)).toEqual({ y: 1445, m: 8, d: 30 })
    expect(toHijri('2024-04-10', 0, ov)).toEqual({ y: 1445, m: 9, d: 30 })
    expect(toHijri('2024-04-11', 0, ov)).toEqual({ y: 1445, m: 10, d: 1 }) // Shawwal follows
    expect(fromHijri({ y: 1445, m: 12, d: 10 }, '2024-06-01', 0, ov)).toBe('2024-06-17')
    expect(monthLengthIssues('2024-01-01', '2024-12-31', 0, ov)).toEqual([])
  })
  it('"back to Umm al-Qura" (an override equal to the base date) resets that month and later months', () => {
    const ov = [{ hy: 1445, hm: 9, start: '2024-03-12' }, { hy: 1445, hm: 11, start: toHijriBase('2024-05-09') }]
    expect(toHijri('2024-04-10', 0, ov)).toEqual({ y: 1445, m: 9, d: 30 })
    expect(toHijri('2024-06-17', 0, ov)).toEqual(toHijri('2024-06-17'))
  })
  it('flags an override that makes a month 31 days long', () => {
    const bad = [{ hy: 1445, hm: 10, start: '2024-04-11' }]
    expect(monthLengthIssues('2024-01-01', '2024-12-31', 0, bad)).toEqual([{ hy: 1445, hm: 9, length: 31 }])
  })
  it('a general offset shifts every month', () => {
    expect(toHijri('2024-04-10', 1)).toEqual({ y: 1445, m: 9, d: 30 })
  })
  it('suggests Ashura, 12 Rabi al-Awwal, Eid al-Adha from Hijri dates', () => {
    const sug = suggestIslamicHolidays('2024-04-15', '2025-03-31', 1)
    expect(sug.find((x) => x.key.startsWith('ashura'))).toMatchObject({ from: '2024-07-16', to: '2024-07-17' })
    expect(sug.find((x) => x.key.startsWith('adha'))!.from).toBe('2024-06-17')
  })
})

describe('manual moves (mashwara)', () => {
  it('swaps two days and keeps every count', async () => {
    const { SAMPLES } = await import('./calendarSamples')
    const s = SAMPLES.find((x) => x.label === '2025/26')!
    const br = { weeklyHoliday: 0, practiceWeekday: 6 }
    const base = generatePlan(s.config, br, { offset: 0, overrides: [] })
    const moved = generatePlan({ ...s.config, moves: [{ from: '2025-05-06', to: '2025-05-07', reason: 'مشورہ' }] }, br, { offset: 0, overrides: [] })
    expect(moved.byDate.get('2025-05-07')!.type).toBe('bazm')
    expect(moved.byDate.get('2025-05-06')!.type).toBe(base.byDate.get('2025-05-07')!.type)
    expect(moved.events.bazm[0]).toBe('2025-05-07')
    expect(moved.totals).toEqual(base.totals)
    expect(moved.events.annual).toEqual(base.events.annual)
  })
})

describe('year opening from Shawwal', () => {
  it('opens on 6 Shawwal as in the printed calendars', async () => {
    const { startFromShawwal } = await import('./calendar')
    const br = { weeklyHoliday: 0, practiceWeekday: 6 }
    expect(startFromShawwal(1444, 6, br, '2023-04-20')).toBe('2023-04-26')
    expect(startFromShawwal(1445, 6, br, '2024-04-10')).toBe('2024-04-15')
  })
})
