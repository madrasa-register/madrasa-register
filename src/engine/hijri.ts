// Hijri dates (Spec §5). The base is the Umm al-Qura calendar built into every
// modern browser/phone (Intl, works offline). Pakistan follows local moon
// sighting, so head office can set a general offset (+1 = every month starts
// one day later than Umm al-Qura) and override the start of any Hijri month; an
// override shifts that month and every later month until the next override, so
// all later dates recompute.

export type HijriOverride = { hy: number; hm: number; start: string } // start = Gregorian ISO date of the 1st
export type Hijri = { y: number; m: number; d: number }

export const HIJRI_MONTHS_UR = ['محرم', 'صفر', 'ربیع الاول', 'ربیع الثانی', 'جمادی الاولیٰ', 'جمادی الثانیہ', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذوالقعدہ', 'ذوالحجہ']
export const HIJRI_MONTHS_AR = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة']
export const HIJRI_MONTHS_EN = ['Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani', 'Jumada al-Ula', 'Jumada al-Thaniya', 'Rajab', "Sha'ban", 'Ramadan', 'Shawwal', "Dhu al-Qa'dah", 'Dhu al-Hijjah']

const DAY = 86400000
export const toMs = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
export const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export const addDaysIso = (iso: string, n: number) => fromMs(toMs(iso) + n * DAY)
export const diffDays = (a: string, b: string) => Math.round((toMs(a) - toMs(b)) / DAY)

let fmt: Intl.DateTimeFormat | null = null
function baseHijri(iso: string): Hijri {
  fmt ??= new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' })
  const p = fmt.formatToParts(new Date(toMs(iso)))
  const get = (t: string) => parseInt(p.find((x) => x.type === t)!.value, 10)
  return { y: get('year'), m: get('month'), d: get('day') }
}

type MonthStart = { hy: number; hm: number; start: string }
const cache = new Map<string, MonthStart[]>()

/** Month starts (base calendar) covering a Gregorian range. */
function baseMonthStarts(from: string, to: string): MonthStart[] {
  const out: MonthStart[] = []
  let d = addDaysIso(from, -40)
  const end = addDaysIso(to, 40)
  // jump to a day 1
  while (baseHijri(d).d !== 1) d = addDaysIso(d, 1)
  while (d <= end) {
    const h = baseHijri(d)
    out.push({ hy: h.y, hm: h.m, start: d })
    d = addDaysIso(d, 28)
    while (baseHijri(d).d !== 1) d = addDaysIso(d, 1)
  }
  return out
}

export function monthStarts(from: string, to: string, offsetDays = 0, overrides: HijriOverride[] = []): MonthStart[] {
  const key = `${from}|${to}|${offsetDays}|${JSON.stringify(overrides)}`
  const hit = cache.get(key)
  if (hit) return hit
  const base = baseMonthStarts(from, to)
  const ov = new Map(overrides.map((o) => [o.hy * 12 + o.hm, o.start]))
  let delta = offsetDays
  const out = base.map((b) => {
    const o = ov.get(b.hy * 12 + b.hm)
    if (o) delta = diffDays(o, b.start)
    return { ...b, start: addDaysIso(b.start, delta) }
  })
  cache.set(key, out)
  return out
}

/** Hijri date for a Gregorian ISO date, after offset and overrides. */
// Month-start tables are built per Gregorian year window so they can be cached.
const win = (iso: string) => { const y = +iso.slice(0, 4); return [`${y - 1}-01-01`, `${y + 1}-12-31`] as const }

export function toHijri(iso: string, offsetDays = 0, overrides: HijriOverride[] = []): Hijri {
  const [a, b] = win(iso)
  const ms = monthStarts(a, b, offsetDays, overrides)
  let cur = ms[0]
  for (const m of ms) if (m.start <= iso) cur = m
  return { y: cur.hy, m: cur.hm, d: diffDays(iso, cur.start) + 1 }
}

/** Gregorian date of a Hijri day (after offset and overrides), searched near a Gregorian hint. */
export function fromHijri(h: Hijri, nearIso: string, offsetDays = 0, overrides: HijriOverride[] = []): string | null {
  const [a, b] = win(nearIso)
  const ms = monthStarts(a, b, offsetDays, overrides)
  const m = ms.find((x) => x.hy === h.y && x.hm === h.m)
  return m ? addDaysIso(m.start, h.d - 1) : null
}

export type SuggestedHoliday = { from: string; to: string; reason: string; key: string }
/**
 * Suggested Islamic holidays for a Gregorian range, from Hijri dates. These
 * are suggestions only: the printed calendars show that the length of the
 * Eid al-Adha break differs each year, so head office confirms the dates.
 */
export function suggestIslamicHolidays(from: string, to: string, offsetDays = 0, overrides: HijriOverride[] = []): SuggestedHoliday[] {
  const ms = monthStarts(from, to, offsetDays, overrides)
  const out: SuggestedHoliday[] = []
  for (const m of ms) {
    const at = (d: number) => addDaysIso(m.start, d - 1)
    if (m.hm === 1) out.push({ from: at(9), to: at(10), reason: '9–10 محرم (عاشورہ)', key: `ashura-${m.hy}` })
    if (m.hm === 3) out.push({ from: at(12), to: at(12), reason: '12 ربیع الاول', key: `rabi-${m.hy}` })
    if (m.hm === 12) out.push({ from: at(10), to: at(12), reason: 'عیدالاضحیٰ', key: `adha-${m.hy}` })
    if (m.hm === 10) out.push({ from: at(1), to: at(3), reason: 'عیدالفطر', key: `fitr-${m.hy}` })
  }
  return out.filter((x) => x.to >= from && x.from <= to)
}

/** Months whose length is not 29 or 30 days after offsets/overrides (a sign of a wrong override). */
export function monthLengthIssues(from: string, to: string, offsetDays = 0, overrides: HijriOverride[] = []) {
  const ms = monthStarts(from, to, offsetDays, overrides)
  const out: { hy: number; hm: number; length: number }[] = []
  for (let i = 0; i + 1 < ms.length; i++) {
    const len = diffDays(ms[i + 1].start, ms[i].start)
    if (len !== 29 && len !== 30 && ms[i].start >= from && ms[i].start <= to) out.push({ hy: ms[i].hy, hm: ms[i].hm, length: len })
  }
  return out
}
