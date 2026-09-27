// Academic calendar engine (Spec §5). Pure function: the same inputs give the
// same day plan on every device.
//
// Structure, confirmed day by day against the printed calendars 2023/24,
// 2024/25 and 2025/26:
//   افتتاح (1 day)
//   cycles 1–4  : 20 پڑھائی · 3 دہرائی (1st = دہرائی + تربیتی سرگرمی) · 2 ماہانہ جائزہ · 1 بزم (cycle 4: مسابقہ)
//   exam block  : 20 پڑھائی · امتحان کی تیاری · پنج ماہی امتحان · 1 post-exam holiday
//   cycles 5–7  : as above (cycle 7: مسابقہ)
//   exam block  : 20 پڑھائی · امتحان کی تیاری · سالانہ امتحان · 1 post-exam holiday · سالانہ تقریب
//   cycle 8     : as above (بزم)
//   کمزوری کا ازالہ : every remaining working day until the Eid al-Fitr holidays
// Only working days are counted: the weekly holiday and pinned holidays push
// everything after them forward. پڑھائی on the practice weekday is shown as
// پڑھائی + وضو / نماز کی عملی مشق.
import { addDaysIso, toHijri, type HijriOverride } from './hijri'

export type DayType =
  | 'before' | 'opening' | 'padhai' | 'practice' | 'dohrai_tarbiyati' | 'dohrai' | 'jaiza' | 'bazm' | 'musabqa'
  | 'exam_prep' | 'exam' | 'ceremony' | 'izala' | 'holiday' | 'parents' | 'fuzala' | 'event' | 'unscheduled' | 'after'

export type ExamCfg = { prepDays: number; examDays: number; countWeeklyHoliday: boolean }
export type Range = { from: string; to: string; reason: string }
export type Pin = { date: string; type: 'parents' | 'fuzala' | 'event'; label?: string }

export type YearConfig = {
  start: string // افتتاح (first day after the Eid al-Fitr holidays)
  eidFitr: { from: string; to: string } // holidays that end the year
  holidays: Range[] // pinned holidays (Eid al-Adha, Muharram, national, local)
  pins: Pin[] // parent meetings, فضلاء جوڑ, other one-off events (on the weekly holiday)
  openingDays: number
  cycle: { padhai: number; dohrai: number; jaiza: number; bazm: number }
  examPadhai: number
  fiveMonthly: ExamCfg
  annual: ExamCfg
  postExamHolidays: number
  ceremony: { days: number; countWeeklyHoliday: boolean }
  izala: { mode: 'untilEid' | 'fixed'; days: number }
}

export const DEFAULT_YEAR: Omit<YearConfig, 'start' | 'eidFitr'> = {
  holidays: [], pins: [], openingDays: 1,
  cycle: { padhai: 20, dohrai: 3, jaiza: 2, bazm: 1 }, // Book p. 135
  examPadhai: 20,
  fiveMonthly: { prepDays: 3, examDays: 5, countWeeklyHoliday: false },
  annual: { prepDays: 3, examDays: 5, countWeeklyHoliday: false },
  postExamHolidays: 1,
  ceremony: { days: 5, countWeeklyHoliday: false },
  izala: { mode: 'untilEid', days: 15 },
}

export type BranchCfg = { weeklyHoliday: number; practiceWeekday: number } // 0 = Sunday … 6 = Saturday

export type Day = {
  date: string
  type: DayType
  cycle?: number // 1–8 for cycle days, 'exam block' days carry 0
  label?: string // holiday reason / pin label
  hijri: { y: number; m: number; d: number }
  ramadan: boolean // reduced timings (Book p. 56)
}

export type Plan = { days: Day[]; byDate: Map<string, Day>; warnings: string[]; totals: Record<string, number>; events: Events }
export type Events = {
  jaiza: string[][]; tarbiyati: string[]; bazm: string[]; musabqa: string[]; parents: string[]; fuzala: string[]
  fiveMonthly: string[]; annual: string[]; ceremony: string[]; izala: string[]
}

const weekday = (iso: string) => new Date(iso + 'T00:00:00Z').getUTCDay()

export function generatePlan(cfg: YearConfig, branch: BranchCfg, hijri: { offset?: number; overrides?: HijriOverride[] } = {}): Plan {
  const warnings: string[] = []
  const end = cfg.eidFitr.to
  const assigned = new Map<string, { type: DayType; cycle?: number; label?: string }>()
  const pinnedHoliday = new Map<string, string>()
  for (const h of cfg.holidays) for (let d = h.from; d <= h.to; d = addDaysIso(d, 1)) pinnedHoliday.set(d, h.reason)
  for (let d = cfg.eidFitr.from; d <= cfg.eidFitr.to; d = addDaysIso(d, 1)) pinnedHoliday.set(d, 'عیدالفطر')

  const isWeekly = (d: string) => weekday(d) === branch.weeklyHoliday
  let cursor = cfg.start
  const stopAt = cfg.eidFitr.from

  /** Next free day; weekly holiday is skipped unless countWeekly. */
  function nextDay(countWeekly: boolean): string | null {
    while (cursor < stopAt) {
      const d = cursor
      cursor = addDaysIso(cursor, 1)
      if (pinnedHoliday.has(d) || assigned.has(d)) continue
      if (isWeekly(d) && !countWeekly) continue
      return d
    }
    return null
  }
  let overflow = false
  function take(n: number, type: DayType, cycle?: number, countWeekly = false): string[] {
    const got: string[] = []
    for (let i = 0; i < n; i++) {
      const d = nextDay(countWeekly)
      if (!d) { overflow = true; break }
      assigned.set(d, { type, cycle })
      got.push(d)
    }
    return got
  }
  const ev: Events = { jaiza: [], tarbiyati: [], bazm: [], musabqa: [], parents: [], fuzala: [], fiveMonthly: [], annual: [], ceremony: [], izala: [] }

  function runCycle(c: number) {
    take(cfg.cycle.padhai, 'padhai', c)
    if (cfg.cycle.dohrai > 0) { ev.tarbiyati.push(...take(1, 'dohrai_tarbiyati', c)); take(cfg.cycle.dohrai - 1, 'dohrai', c) }
    ev.jaiza.push(take(cfg.cycle.jaiza, 'jaiza', c))
    if (c === 4 || c === 7) ev.musabqa.push(...take(cfg.cycle.bazm, 'musabqa', c))
    else ev.bazm.push(...take(cfg.cycle.bazm, 'bazm', c))
  }
  function runExam(e: ExamCfg, kind: 'fiveMonthly' | 'annual') {
    take(cfg.examPadhai, 'padhai', 0)
    take(e.prepDays, 'exam_prep', 0)
    ev[kind] = take(e.examDays, 'exam', 0, e.countWeeklyHoliday)
    for (const d of take(cfg.postExamHolidays, 'holiday', 0)) assigned.set(d, { type: 'holiday', label: 'امتحان کے بعد تعطیل' })
  }

  take(cfg.openingDays, 'opening')
  for (const c of [1, 2, 3, 4]) runCycle(c)
  runExam(cfg.fiveMonthly, 'fiveMonthly')
  for (const c of [5, 6, 7]) runCycle(c)
  runExam(cfg.annual, 'annual')
  ev.ceremony = take(cfg.ceremony.days, 'ceremony', 0, cfg.ceremony.countWeeklyHoliday)
  runCycle(8)
  if (cfg.izala.mode === 'fixed') ev.izala = take(cfg.izala.days, 'izala')
  else {
    for (let d = nextDay(false); d; d = nextDay(false)) { assigned.set(d, { type: 'izala' }); ev.izala.push(d) }
    if (ev.izala.length !== cfg.izala.days) warnings.push(`izala:${ev.izala.length}`)
  }
  if (overflow) warnings.push('overflow')

  // Pins (parent meetings, فضلاء جوڑ) — always on the weekly holiday.
  const pins = new Map(cfg.pins.map((p) => [p.date, p]))
  for (const p of cfg.pins) {
    if (!isWeekly(p.date) && !pinnedHoliday.has(p.date)) warnings.push(`pin-not-holiday:${p.date}`)
    if (p.type === 'parents') ev.parents.push(p.date)
    if (p.type === 'fuzala') ev.fuzala.push(p.date)
  }

  // Build the full day list from 1 Shawwal-side start to the end of Eid holidays.
  const days: Day[] = []
  const totals: Record<string, number> = {}
  for (let d = cfg.start; d <= end; d = addDaysIso(d, 1)) {
    const a = assigned.get(d)
    let type: DayType, cycle: number | undefined, label: string | undefined
    if (a) { ({ type, cycle, label } = a) }
    else if (pins.has(d)) { type = pins.get(d)!.type; label = pins.get(d)!.label }
    else if (pinnedHoliday.has(d)) { type = 'holiday'; label = pinnedHoliday.get(d) }
    else if (isWeekly(d)) { type = 'holiday'; label = 'weekly' }
    else { type = 'unscheduled' }
    if (type === 'padhai' && weekday(d) === branch.practiceWeekday) type = 'practice'
    const h = toHijri(d, hijri.offset ?? 0, hijri.overrides ?? [])
    days.push({ date: d, type, cycle, label, hijri: h, ramadan: h.m === 9 })
    totals[type] = (totals[type] ?? 0) + 1
  }
  if (totals.unscheduled) warnings.push(`unscheduled:${totals.unscheduled}`)
  return { days, byDate: new Map(days.map((x) => [x.date, x])), warnings, totals, events: ev }
}

/** First working day after the Eid al-Fitr holidays — the suggested افتتاح date. */
export function suggestStart(eidEnd: string, branch: BranchCfg): string {
  let d = addDaysIso(eidEnd, 1)
  while (weekday(d) === branch.weeklyHoliday) d = addDaysIso(d, 1)
  return d
}

/** Exam windows for attendance (Book p. 69): monthly = that cycle, five-monthly = preceding 5 months, annual = whole year. */
export function cycleRange(plan: Plan, cycle: number): { from: string; to: string } | null {
  const ds = plan.days.filter((d) => d.cycle === cycle)
  return ds.length ? { from: ds[0].date, to: ds[ds.length - 1].date } : null
}
