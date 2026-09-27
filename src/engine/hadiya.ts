// Hadiya (fee) ledger (Spec §10). Payments are the source of truth; the
// monthly chart and balances are derived from them.

export type FeePlan = { student_id: string; from_month: string; amount: number; exempt?: boolean; sponsor?: string | null }
export type Allocation = { student_id: string; month: string; amount: number; kind?: string }
export type Cell = { month: string; due: number; paid: number; status: 'paid' | 'partial' | 'unpaid' | 'exempt' | 'none' }

export const monthsBetween = (from: string, to: string) => {
  const out: string[] = []
  let [y, m] = from.split('-').map(Number)
  const [y2, m2] = to.split('-').map(Number)
  while (y < y2 || (y === y2 && m <= m2)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++ } }
  return out
}

/** Plan in force for a student in a month (latest from_month ≤ month). */
export function planFor(plans: FeePlan[], studentId: string, month: string): FeePlan | null {
  return plans.filter((p) => p.student_id === studentId && p.from_month <= month).sort((a, b) => b.from_month.localeCompare(a.from_month))[0] ?? null
}

export function chartRow(studentId: string, months: string[], plans: FeePlan[], allocs: Allocation[], activeMonths: Set<string>): { cells: Cell[]; due: number; paid: number; balance: number } {
  let due = 0, paid = 0
  const cells = months.map((month): Cell => {
    const p = planFor(plans, studentId, month)
    const got = allocs.filter((a) => a.student_id === studentId && a.month === month && (a.kind ?? 'monthly') === 'monthly').reduce((s, a) => s + a.amount, 0)
    paid += got
    if (!activeMonths.has(month)) return { month, due: 0, paid: got, status: got ? 'paid' : 'none' }
    if (p?.exempt) return { month, due: 0, paid: got, status: 'exempt' }
    const d = p?.amount ?? 0
    due += d
    return { month, due: d, paid: got, status: got >= d && d > 0 ? 'paid' : got > 0 ? 'partial' : d > 0 ? 'unpaid' : 'none' }
  })
  return { cells, due, paid, balance: due - paid }
}

/**
 * Spread one payment over the oldest unpaid months of one or more children
 * (a Rs 1000 payment can cover two months; one payment can be split across
 * siblings).
 */
export function autoAllocate(amount: number, dueList: { student_id: string; month: string; outstanding: number }[]): Allocation[] {
  const out: Allocation[] = []
  let left = amount
  for (const d of [...dueList].sort((a, b) => a.month.localeCompare(b.month))) {
    if (left <= 0) break
    if (d.outstanding <= 0) continue
    const x = Math.min(left, d.outstanding)
    out.push({ student_id: d.student_id, month: d.month, amount: x })
    left -= x
  }
  return out
}

export const ADMISSION_ITEMS = [
  { key: 'qaida', ur: 'قاعدہ / قرآن', en: 'Qaida / Quran', ar: 'القاعدة / القرآن' },
  { key: 'book', ur: 'نصاب کی کتاب', en: 'Curriculum book', ar: 'كتاب المنهج' },
  { key: 'uniform', ur: 'یونیفارم / عبایا', en: 'Uniform / abaya', ar: 'الزي / العباءة' },
  { key: 'bag', ur: 'بستہ', en: 'Bag', ar: 'الحقيبة' },
  { key: 'card', ur: 'شناختی کارڈ', en: 'ID card', ar: 'بطاقة الهوية' },
]
