// Grading, position and عملی کیفیت (Spec §8).
export type GradeBand = { min: number; key: string; ur: string; en: string; ar: string }

/** Book p. 77 — one percentage rule for any total. */
export const GRADES: GradeBand[] = [
  { min: 80, key: 'mumtaz', ur: 'ممتاز', en: 'Mumtaz (excellent)', ar: 'ممتاز' },
  { min: 66, key: 'jayyid-jiddan', ur: 'جید جداً', en: 'Jayyid jiddan (very good)', ar: 'جيد جداً' },
  { min: 51, key: 'jayyid', ur: 'جید', en: 'Jayyid (good)', ar: 'جيد' },
  { min: 40, key: 'maqbool', ur: 'مقبول', en: 'Maqbool (pass)', ar: 'مقبول' },
  { min: 0, key: 'rasib', ur: 'راسب', en: 'Rasib (fail)', ar: 'راسب' },
]

/** Nearest whole percent; an exact .5 rounds down (101/200 = 50.5% → 50). Exact integer arithmetic. */
export function percentHalfDown(marks: number, total: number): number {
  if (total <= 0) return 0
  // allow half marks: scale to integers
  const n = Math.round(marks * 100 * 2), d = Math.round(total * 2)
  const q = Math.floor(n / d), r = n - q * d
  return 2 * r > d ? q + 1 : q
}

export function gradeOf(percent: number, bands: GradeBand[] = GRADES): GradeBand {
  const sorted = [...bands].sort((a, b) => b.min - a.min)
  return sorted.find((b) => percent >= b.min) ?? sorted[sorted.length - 1]
}
export const gradeFor = (marks: number, total: number, bands: GradeBand[] = GRADES) => gradeOf(percentHalfDown(marks, total), bands)

/** Mark ranges for each grade for any total (the book's table, computed). */
export function gradeRanges(total: number, bands: GradeBand[] = GRADES) {
  const out: { band: GradeBand; from: number; to: number }[] = []
  for (const b of bands) {
    const ms: number[] = []
    for (let m = 0; m <= total; m++) if (gradeFor(m, total, bands).key === b.key) ms.push(m)
    if (ms.length) out.push({ band: b, from: ms[0], to: ms[ms.length - 1] })
  }
  return out
}

/**
 * Position within the class by total marks (after finalize). Equal totals
 * share a position. 'competition' = 1, 1, 3 ; 'dense' = 1, 1, 2 (setting).
 * Students examined late (makeup) get no position.
 */
export function positions<T extends { id: string; total: number; makeup?: boolean; absent?: boolean }>(rows: T[], style: 'competition' | 'dense' = 'competition') {
  const ranked = rows.filter((r) => !r.makeup && !r.absent).sort((a, b) => b.total - a.total)
  const pos = new Map<string, number>()
  let prev: number | null = null, place = 0, dense = 0
  ranked.forEach((r, i) => {
    if (prev === null || r.total !== prev) { place = i + 1; dense++ }
    pos.set(r.id, style === 'dense' ? dense : place)
    prev = r.total
  })
  return pos
}

export type Practical = 'behtar' | 'munasib' | 'qabil-e-tawajjuh'
export const PRACTICAL: Record<Practical, { ur: string; en: string; ar: string }> = {
  behtar: { ur: 'بہتر', en: 'Good', ar: 'جيد' },
  munasib: { ur: 'مناسب', en: 'Satisfactory', ar: 'مناسب' },
  'qabil-e-tawajjuh': { ur: 'قابلِ توجہ', en: 'Needs attention', ar: 'يحتاج إلى عناية' },
}
/**
 * عملی کیفیت (approved rule, §8.2). namazi = نمازی ڈائری marks (null when the
 * component does not apply, e.g. حصہ ابتدائیہ — then only attendance and
 * concerns decide).
 */
export function practicalStatus(attendance: number | null, namazi: number | null, concern: boolean): Practical {
  const att = attendance ?? 0
  if (att < 70 || namazi === 4 || namazi === 0 || concern) return 'qabil-e-tawajjuh'
  if (att >= 90 && (namazi === null || namazi === 7 || namazi === 10)) return 'behtar'
  return 'munasib'
}

/** Teacher prize: 95% of the class is ممتاز or صاحبِ ترتیب (§8.3). */
export function teacherPrize(rows: { grade: string; perfect: boolean }[], share = 95) {
  if (!rows.length) return { eligible: false, percent: 0 }
  const n = rows.filter((r) => r.grade === 'mumtaz' || r.perfect).length
  const percent = (n * 100) / rows.length
  return { eligible: percent >= share, percent }
}
