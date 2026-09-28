// Calendar storage: the year config lives on academic_year.config (JSON),
// moon-sighting overrides in hijri_override. Plans are generated on demand.
import { all, one, get, insert, update, detId, session, type Row } from './db'
import { loadSettings } from './repo'
import { generatePlan, DEFAULT_YEAR, type YearConfig, type Plan, type BranchCfg } from '../engine/calendar'
import { fromHijri, toHijri, addDaysIso, suggestIslamicHolidays, type HijriOverride } from '../engine/hijri'
import { SAMPLES } from '../engine/calendarSamples'

export type HijriCtx = { offset: number; overrides: HijriOverride[] }

export async function loadHijriCtx(): Promise<HijriCtx> {
  const st = await loadSettings()
  const rows = await all<Row>('select * from hijri_override where organization_id = ? order by hy, hm', [session.orgId])
  return { offset: Number(st['hijri.offsetDays'] ?? 0), overrides: rows.map((r) => ({ hy: r.hy, hm: r.hm, start: r.start })) }
}

export async function saveHijriOverride(hy: number, hm: number, start: string, reason: string) {
  const id = detId('hijri', session.orgId, String(hy), String(hm))
  const ex = await get('hijri_override', id)
  if (ex) await update('hijri_override', id, { start, reason }, reason, { action: 'moon-sighting' })
  else await insert('hijri_override', { hy, hm, start, reason }, { id, branchId: null, reason })
}

/** Eid al-Fitr holidays estimated from the Hijri calendar (1 Shawwal − 3 … + 3) when head office has not set them. */
export function estimateEid(start: string, h: HijriCtx) {
  const hs = toHijri(start, h.offset, h.overrides)
  // the first Eid al-Fitr after the start (a year opened in Shawwal ends at the next year's Eid)
  const hy = hs.m < 10 ? hs.y : hs.y + 1
  const eid = fromHijri({ y: hy, m: 10, d: 1 }, addDaysIso(start, hs.m < 10 ? 100 : 354), h.offset, h.overrides) ?? addDaysIso(start, 354)
  return { from: addDaysIso(eid, -3), to: addDaysIso(eid, 3) }
}

export type YearInfo = { row: Row; config: YearConfig; eidEstimated: boolean; holidaysEstimated: boolean }

/** Usual holidays of the printed calendars, from Umm al-Qura, for a year whose holidays are not set yet. */
export function defaultHolidays(start: string, end: string, h: HijriCtx) {
  const out = suggestIslamicHolidays(start, end, h.offset, h.overrides).filter((x) => !x.key.startsWith('fitr')).map((x) =>
    x.key.startsWith('adha') ? { from: addDaysIso(x.from, -1), to: addDaysIso(x.from, 7), reason: x.reason } : { from: x.from, to: x.to, reason: x.reason })
  for (let y = +start.slice(0, 4); y <= +end.slice(0, 4); y++) {
    const d = `${y}-08-14`
    if (d >= start && d <= end) out.push({ from: d, to: d, reason: 'یومِ آزادی' })
  }
  return out.sort((a, b) => a.from.localeCompare(b.from))
}
export function yearConfigOf(row: Row, h: HijriCtx): YearInfo {
  let saved: Partial<YearConfig> = {}
  try { saved = row.config ? JSON.parse(row.config) : {} } catch { /* keep defaults */ }
  const eidEstimated = !saved.eidFitr
  const holidaysEstimated = !saved.holidays
  const eidFitr = saved.eidFitr ?? estimateEid(row.start_date, h)
  const config: YearConfig = {
    ...DEFAULT_YEAR, ...saved,
    start: row.start_date,
    eidFitr,
    holidays: saved.holidays ?? defaultHolidays(row.start_date, eidFitr.to, h),
  }
  return { row, config, eidEstimated, holidaysEstimated }
}

export async function branchCfg(branchId: string | null): Promise<BranchCfg> {
  const st = await loadSettings(branchId)
  const b = branchId ? await get('branch', branchId) : await one<Row>('select * from branch where organization_id = ? order by created_at limit 1', [session.orgId])
  return { weeklyHoliday: b?.weekly_holiday === 'fri' ? 5 : 0, practiceWeekday: Number(st['calendar.practiceWeekday'] ?? 6) }
}

const planCache = new Map<string, Plan>()
export async function planForYear(row: Row, branchId: string | null): Promise<{ plan: Plan; info: YearInfo; branch: BranchCfg; hijri: HijriCtx }> {
  const hijri = await loadHijriCtx()
  const info = yearConfigOf(row, hijri)
  const branch = await branchCfg(branchId)
  const key = JSON.stringify([row.id, row.updated_at, info.config.eidFitr, branch, hijri])
  let plan = planCache.get(key)
  if (!plan) { plan = generatePlan(info.config, branch, hijri); planCache.set(key, plan) }
  return { plan, info, branch, hijri }
}

export async function yearOn(date: string): Promise<Row | null> {
  return one<Row>('select * from academic_year where organization_id = ? and start_date <= ? order by start_date desc limit 1', [session.orgId, date])
}

/** Plan of the year containing `date` for a branch, or null when no year covers it. */
export async function planOn(date: string, branchId: string | null) {
  const y = await yearOn(date)
  if (!y) return null
  const r = await planForYear(y, branchId)
  return r.plan.byDate.has(date) ? r : null
}

export async function saveYearConfig(yearId: string, cfg: Partial<YearConfig> & { start?: string }, reason: string) {
  const { start, ...rest } = cfg
  const ch: Record<string, any> = { config: JSON.stringify({ ...rest, start: undefined }) }
  if (start) ch.start_date = start
  if (rest.eidFitr) ch.end_date = rest.eidFitr.to
  await update('academic_year', yearId, ch, reason, { action: 'calendar' })
}

/** Adds the three printed calendars (2023/24 – 2025/26) as academic years, for comparison with the paper. */
export async function loadSampleYears() {
  let added = 0
  for (const s of SAMPLES) {
    const label = `${s.label} (نمونہ)`
    const ex = await one<Row>('select id from academic_year where organization_id = ? and label = ?', [session.orgId, label])
    if (ex) continue
    const { start, ...rest } = s.config
    await insert('academic_year', { label, start_date: start, end_date: s.config.eidFitr.to, config: JSON.stringify(rest) },
      { branchId: null, reason: 'printed calendar sample' })
    added++
  }
  return added
}
