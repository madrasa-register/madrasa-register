// Three real academic calendars (2023/24 – 2025/26), entered as the
// head-office inputs they imply (start date, holidays, pinned meetings and the
// exam/ceremony lengths printed that year), together with the dates and totals
// printed on each calendar. Used by the tests and the "sample years" loader.
import { DEFAULT_YEAR, type YearConfig } from './calendar'

export type Printed = {
  jaiza: string[][]; tarbiyati: string[]; bazm: string[]; musabqa: string[]; parents: string[]; fuzala: string[]
  fiveMonthly: string[]; annual: string[]; totals: Record<string, number>
}
export type Sample = { label: string; config: YearConfig; printed: Printed }

const r = (from: string, to: string, reason: string) => ({ from, to, reason })
const pins = (parents: string[], fuzala: string[]) => [
  ...parents.map((date) => ({ date, type: 'parents' as const, label: 'والدین ملاقات' })),
  ...fuzala.map((date) => ({ date, type: 'fuzala' as const, label: 'فضلاء جوڑ' })),
]
const span = (from: string, n: number) => Array.from({ length: n }, (_, i) => {
  const d = new Date(from + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10)
})

export const SAMPLES: Sample[] = [
  {
    label: '2023/24',
    config: {
      ...DEFAULT_YEAR,
      start: '2023-04-26',
      eidFitr: { from: '2024-04-06', to: '2024-04-14' },
      holidays: [
        r('2023-06-25', '2023-07-01', 'عیدالاضحیٰ'),
        r('2023-07-28', '2023-07-29', '9–10 محرم'),
        r('2023-08-14', '2023-08-14', 'یومِ آزادی'),
        r('2023-09-28', '2023-09-28', '12 ربیع الاول'),
      ],
      pins: pins(['2023-05-14', '2023-09-10', '2023-10-22', '2024-01-14'], ['2023-07-16', '2023-12-17']),
      fiveMonthly: { prepDays: 3, examDays: 4, countWeeklyHoliday: false },
      annual: { prepDays: 3, examDays: 6, countWeeklyHoliday: false },
      ceremony: { days: 5, countWeeklyHoliday: false },
    },
    printed: {
      jaiza: [['2023-05-24', '2023-05-25'], ['2023-06-23', '2023-06-24'], ['2023-08-02', '2023-08-03'], ['2023-09-02', '2023-09-04'],
        ['2023-11-06', '2023-11-07'], ['2023-12-06', '2023-12-07'], ['2024-01-05', '2024-01-06'], ['2024-03-16', '2024-03-18']],
      tarbiyati: ['2023-05-20', '2023-06-20', '2023-07-27', '2023-08-30', '2023-11-02', '2023-12-02', '2024-01-02', '2024-03-13'],
      bazm: ['2023-05-26', '2023-07-03', '2023-08-04', '2023-11-08', '2023-12-08', '2024-03-19'],
      musabqa: ['2023-09-05', '2024-01-08'],
      parents: ['2023-05-14', '2023-09-10', '2023-10-22', '2024-01-14'],
      fuzala: ['2023-07-16', '2023-12-17'],
      fiveMonthly: span('2023-10-04', 4),
      annual: span('2024-02-05', 6),
      totals: { opening: 1, padhai: 167, practice: 33, dohrai: 16, dohrai_tarbiyati: 8, jaiza: 16, bazm: 6, musabqa: 2, exam_prep: 6, exam: 10, parents: 4, fuzala: 2, ceremony: 5, izala: 15, holiday: 64 },
    },
  },
  {
    label: '2024/25',
    config: {
      ...DEFAULT_YEAR,
      start: '2024-04-15',
      eidFitr: { from: '2025-03-28', to: '2025-03-31' },
      holidays: [
        r('2024-06-15', '2024-06-23', 'عیدالاضحیٰ'),
        r('2024-07-16', '2024-07-17', '9–10 محرم'),
        r('2024-08-14', '2024-08-14', 'یومِ آزادی'),
        r('2024-09-16', '2024-09-16', '12 ربیع الاول'),
      ],
      pins: pins(['2024-05-05', '2024-09-01', '2024-10-20', '2025-01-05'], ['2024-07-07', '2024-12-08']),
      fiveMonthly: { prepDays: 2, examDays: 5, countWeeklyHoliday: false },
      annual: { prepDays: 4, examDays: 5, countWeeklyHoliday: false },
      ceremony: { days: 6, countWeeklyHoliday: false },
    },
    printed: {
      jaiza: [['2024-05-13', '2024-05-14'], ['2024-06-12', '2024-06-13'], ['2024-07-23', '2024-07-24'], ['2024-08-23', '2024-08-24'],
        ['2024-10-26', '2024-10-28'], ['2024-11-26', '2024-11-27'], ['2024-12-26', '2024-12-27'], ['2025-03-08', '2025-03-10']],
      tarbiyati: ['2024-05-09', '2024-06-08', '2024-07-19', '2024-08-20', '2024-10-23', '2024-11-22', '2024-12-23', '2025-03-05'],
      bazm: ['2024-05-15', '2024-06-14', '2024-07-25', '2024-10-29', '2024-11-28', '2025-03-11'],
      musabqa: ['2024-08-26', '2024-12-28'],
      parents: ['2024-05-05', '2024-09-01', '2024-10-20', '2025-01-05'],
      fuzala: ['2024-07-07', '2024-12-08'],
      fiveMonthly: span('2024-09-23', 5),
      annual: span('2025-01-27', 5),
      totals: { opening: 1, padhai: 168, practice: 32, dohrai: 16, dohrai_tarbiyati: 8, jaiza: 16, bazm: 6, musabqa: 2, exam_prep: 6, exam: 10, parents: 4, fuzala: 2, ceremony: 6, izala: 14, holiday: 60 },
    },
  },
  {
    label: '2025/26',
    config: {
      ...DEFAULT_YEAR,
      start: '2025-04-05',
      eidFitr: { from: '2026-03-15', to: '2026-03-25' },
      holidays: [
        r('2025-06-06', '2025-06-15', 'عیدالاضحیٰ'),
        r('2025-07-06', '2025-07-07', '9–10 محرم'),
        r('2025-08-14', '2025-08-14', 'یومِ آزادی'),
        r('2025-09-06', '2025-09-06', '12 ربیع الاول'),
      ],
      pins: pins(['2025-04-27', '2025-08-24', '2025-10-05', '2025-12-28'], ['2025-06-29', '2025-11-16']),
      fiveMonthly: { prepDays: 2, examDays: 5, countWeeklyHoliday: true },
      annual: { prepDays: 4, examDays: 6, countWeeklyHoliday: true },
      ceremony: { days: 6, countWeeklyHoliday: true },
    },
    printed: {
      jaiza: [['2025-05-03', '2025-05-05'], ['2025-06-03', '2025-06-04'], ['2025-07-14', '2025-07-15'], ['2025-08-13', '2025-08-15'],
        ['2025-10-16', '2025-10-17'], ['2025-11-15', '2025-11-17'], ['2025-12-16', '2025-12-17'], ['2026-02-25', '2026-02-26']],
      tarbiyati: ['2025-04-30', '2025-05-30', '2025-07-10', '2025-08-09', '2025-10-13', '2025-11-12', '2025-12-12', '2026-02-21'],
      bazm: ['2025-05-06', '2025-06-05', '2025-07-16', '2025-10-18', '2025-11-18', '2026-02-27'],
      musabqa: ['2025-08-16', '2025-12-18'],
      parents: ['2025-04-27', '2025-08-24', '2025-10-05', '2025-12-28'],
      fuzala: ['2025-06-29', '2025-11-16'],
      fiveMonthly: span('2025-09-13', 5),
      annual: span('2026-01-16', 6),
      // As printed. تعطیل 68 includes 1–4 April 2025 (Eid holidays before the opening day).
      totals: { opening: 1, padhai: 169, practice: 31, dohrai: 16, dohrai_tarbiyati: 8, jaiza: 16, bazm: 6, musabqa: 2, exam_prep: 6, exam: 11, parents: 4, fuzala: 2, ceremony: 6, izala: 13, holiday: 68 },
    },
  },
]
