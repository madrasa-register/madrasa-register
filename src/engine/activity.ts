// Activity log / کارگزاری (Spec §11, Reg. p. 49): six activities per class per
// month. The months in which each activity is due come from the calendar, so
// a missing entry after its date shows as overdue.
import type { Plan, DayType } from './calendar'

export type ActivityKey = 'parents' | 'dohrai' | 'bazm' | 'practice' | 'musabqa' | 'tarbiyati'
export const ACTIVITIES: { key: ActivityKey; ur: string; en: string; ar: string; from: DayType[]; extra?: 'counts' | 'name' }[] = [
  { key: 'parents', ur: 'والدین ملاقات', en: 'Parent meeting', ar: 'لقاء أولياء الأمور', from: ['parents'], extra: 'counts' },
  { key: 'dohrai', ur: 'دہرائی', en: 'Revision', ar: 'المراجعة', from: ['dohrai', 'dohrai_tarbiyati'] },
  { key: 'bazm', ur: 'بزم', en: 'Bazm', ar: 'بزم', from: ['bazm'] },
  { key: 'practice', ur: 'وضو / نماز کی عملی مشق', en: 'Wudu / salah practice', ar: 'تطبيق الوضوء والصلاة', from: ['practice'] },
  { key: 'musabqa', ur: 'مسابقہ', en: 'Competition', ar: 'المسابقة', from: ['musabqa'] },
  { key: 'tarbiyati', ur: 'تربیتی سرگرمی', en: 'Tarbiyah activity', ar: 'النشاط التربوي', from: ['dohrai_tarbiyati'], extra: 'name' },
]

export type Due = { month: string; key: ActivityKey; due: string } // due = last calendar date of that activity in the month

export function dueActivities(plan: Plan): Due[] {
  const out = new Map<string, Due>()
  for (const d of plan.days) {
    for (const a of ACTIVITIES) {
      if (!a.from.includes(d.type)) continue
      const month = d.date.slice(0, 7)
      const k = `${month}|${a.key}`
      const cur = out.get(k)
      if (!cur || cur.due < d.date) out.set(k, { month, key: a.key, due: d.date })
    }
  }
  return [...out.values()].sort((a, b) => a.month.localeCompare(b.month))
}

export type Entry = { month: string; activity: string; done: number }
export function activityStatus(due: Due[], entries: Entry[], today: string) {
  return due.map((d) => {
    const e = entries.find((x) => x.month === d.month && x.activity === d.key)
    const status = e ? (e.done ? 'done' : 'not-done') : d.due < today ? 'overdue' : 'upcoming'
    return { ...d, entry: e ?? null, status }
  })
}
