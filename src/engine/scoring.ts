// Scoring (Spec §7.2–7.5). Pure functions: given a component definition, the
// raw inputs and the tap rows, return the marks. Every tap is its own row, so
// devices never need to merge scores; the marks are always recomputed.
import { componentMax, hifzQuestions, type Component, type RecitationVariant } from './scheme'
import { attendanceMarks } from './attendance'
import type { Band } from './settings'

export type Tap = { type: string; key?: string | null; q?: number | null; voided?: boolean }
export type Outcome = 'c' | 'p' | 'w' | null

export type Raw = {
  values?: (number | null)[] // manual, per question
  outcomes?: Outcome[] // outcome
  easy?: 'yes' | 'no' | null // outcome: both wrong → easy questions answered?
  option?: string | null // category
  variant?: string // recitation
  paras?: number // recitation (hifz)
  fixed?: Record<string, boolean> // recitation: تعوذ / تسمیہ read correctly
  whole?: string | null // recitation: whole-component deduction chosen
  bonus?: boolean // deduction: explained the tajweed rules (+2)
  checked?: boolean // deduction / recitation: examiner confirmed (no tap = full marks)
}

export type Result = { marks: number; max: number; complete: boolean; lines?: { label: string; marks: number; max: number }[]; counted?: boolean[] }

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

export function scoreManual(c: Component, raw: Raw): Result {
  const qs = c.questions ?? []
  const vals = raw.values ?? []
  const complete = qs.length > 0 && qs.every((_, i) => vals[i] !== null && vals[i] !== undefined && !Number.isNaN(Number(vals[i])))
  const marks = qs.reduce((a, q, i) => a + clamp(Number(vals[i] ?? 0) || 0, 0, q.marks), 0)
  return { marks, max: componentMax(c), complete }
}

/**
 * Subjects (Reg. p. 57): buttons درست / کچھ درست / غلط per question.
 * درست = full, کچھ درست = full − partialDeduct, غلط = 0. When every answer is
 * wrong, the easy-question fallback gives fallbackMin (answered) or 0.
 */
export function scoreOutcome(c: Component, raw: Raw): Result {
  const qs = c.questions ?? []
  const out = raw.outcomes ?? []
  const pd = c.cfg?.partialDeduct ?? 5
  const allSet = qs.length > 0 && qs.every((_, i) => out[i])
  const allWrong = allSet && qs.every((_, i) => out[i] === 'w')
  if (allWrong) {
    const min = c.cfg?.fallbackMin ?? 8
    return { marks: raw.easy === 'yes' ? min : 0, max: componentMax(c), complete: raw.easy === 'yes' || raw.easy === 'no' }
  }
  const marks = qs.reduce((a, q, i) => a + (out[i] === 'c' ? q.marks : out[i] === 'p' ? Math.max(0, q.marks - pd) : 0), 0)
  return { marks, max: componentMax(c), complete: allSet }
}

/**
 * Deduction component (تجوید): every tap is recorded; the same mistake
 * (type + letter/rule) repeated counts once when the type says so. No tap =
 * full marks. Bonus (+2) for explaining the rules; capped at the maximum.
 */
export function scoreDeduction(c: Component, raw: Raw, taps: Tap[], allowBonus = true): Result {
  const max = componentMax(c)
  const types = new Map((c.cfg?.types ?? []).map((t) => [t.key, t]))
  const seen = new Set<string>()
  const counted: boolean[] = []
  let ded = 0
  for (const t of taps) {
    if (t.voided) { counted.push(false); continue }
    const def = types.get(t.type)
    if (!def) { counted.push(false); continue }
    const id = `${t.type}|${t.key ?? ''}`
    if (def.oncePerKey && seen.has(id)) { counted.push(false); continue }
    seen.add(id)
    counted.push(true)
    ded += def.points
  }
  const bonus = allowBonus && raw.bonus ? c.cfg?.bonus ?? 0 : 0
  return { marks: clamp(max - ded + bonus, 0, max), max, complete: !!raw.checked || taps.length > 0, counted }
}

export function recitationQuestions(v: RecitationVariant, raw: Raw, max: number) {
  if (v.hifzByParas) return hifzQuestions(v, raw.paras ?? 1, max).questions
  return v.questions ?? []
}

/**
 * پختگی (Reg. p. 55–57): fixed items (تعوذ، تسمیہ) + questions, each question
 * losing its deductions but never below 0 (capped at its own marks), minus an
 * optional whole-component deduction (e.g. cannot read fluently −40).
 */
export function scoreRecitation(c: Component, raw: Raw, taps: Tap[]): Result {
  const max = componentMax(c)
  const v = c.cfg?.variants?.[raw.variant ?? '']
  if (!v) return { marks: 0, max, complete: false }
  const qs = recitationQuestions(v, raw, max)
  const dmap = new Map(v.deductions.map((d) => [d.key, d.points]))
  const lines: Result['lines'] = []
  let total = 0
  for (const f of v.fixed) {
    const ok = raw.fixed?.[f.key] !== false
    lines.push({ label: f.key, marks: ok ? f.marks : 0, max: f.marks })
    total += ok ? f.marks : 0
  }
  qs.forEach((q, i) => {
    const ded = taps.filter((t) => !t.voided && (t.q ?? 0) === i + 1).reduce((a, t) => a + (dmap.get(t.type) ?? 0), 0)
    const m = clamp(q.marks - ded, 0, q.marks)
    lines.push({ label: `q${i + 1}`, marks: m, max: q.marks })
    total += m
  })
  const whole = v.whole.find((w) => w.key === raw.whole)
  if (whole) total -= whole.points
  return { marks: clamp(total, 0, max), max, complete: !!raw.checked || taps.length > 0, lines }
}

export function scoreCategory(c: Component, raw: Raw, gender: string): Result {
  const opts = c.cfg?.options?.[gender === 'f' ? 'f' : 'm'] ?? []
  const o = opts.find((x) => x.key === raw.option)
  return { marks: o ? Math.min(o.marks, componentMax(c)) : 0, max: componentMax(c), complete: !!o }
}

export function scoreBand(c: Component, percent: number | null, bands: Band[]): Result {
  const max = componentMax(c)
  // bands are defined out of 10 in settings; scale if a scheme uses another maximum
  const m = attendanceMarks(percent, bands)
  const top = Math.max(...bands.map((b) => b.marks), 1)
  return { marks: top === max ? m : Math.round((m * max) / top), max, complete: percent !== null }
}

export type Ctx = { gender: string; attendancePercent: number | null; bands: Band[]; makeup?: boolean }
export function scoreComponent(c: Component, raw: Raw, taps: Tap[], ctx: Ctx): Result {
  switch (c.method) {
    case 'manual': return scoreManual(c, raw)
    case 'outcome': return scoreOutcome(c, raw)
    case 'deduction': return scoreDeduction(c, raw, taps, !ctx.makeup)
    case 'recitation': return scoreRecitation(c, raw, taps)
    case 'category': return scoreCategory(c, raw, ctx.gender)
    case 'band': return scoreBand(c, ctx.attendancePercent, ctx.bands)
  }
}
