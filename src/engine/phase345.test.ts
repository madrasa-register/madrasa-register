import { describe, it, expect } from 'vitest'
import { DEFAULT_TEMPLATE, BMK_TEMPLATE, schemeTotal, componentMax, componentsFor, validateScheme, hifzQuestions, type SchemeDef } from './scheme'
import { scoreOutcome, scoreDeduction, scoreRecitation, scoreCategory, scoreBand, scoreManual, type Tap } from './scoring'
import { percentHalfDown, gradeFor, gradeRanges, positions, practicalStatus, teacherPrize } from './grading'
import { chartRow, autoAllocate, monthsBetween } from './hadiya'
import { dueActivities, activityStatus } from './activity'
import { generatePlan } from './calendar'
import { SAMPLES } from './calendarSamples'
import { defaultSettings, type Band } from './settings'

const C = (k: string) => DEFAULT_TEMPLATE.components.find((c) => c.key === k)!
const bands = defaultSettings()['attendance.bands'] as Band[]

describe('mark scheme (§7.0, §7.1)', () => {
  it('default template totals 200, and 190 for حصہ ابتدائیہ (no نمازی ڈائری)', () => {
    expect(schemeTotal(DEFAULT_TEMPLATE)).toBe(200)
    expect(schemeTotal(DEFAULT_TEMPLATE, 'nazira', 'awwal')).toBe(200)
    expect(schemeTotal(DEFAULT_TEMPLATE, 'nazira', 'ibtidaiya')).toBe(190)
    expect(componentsFor(DEFAULT_TEMPLATE, 'nazira', 'ibtidaiya').some((c) => c.key === 'namazi')).toBe(false)
  })
  it('Quran 60 + 40 = 100; four subjects × (10 + 10)', () => {
    expect(componentMax(C('pukhtagi')) + componentMax(C('tajweed'))).toBe(100)
    expect(['slotA', 'slotB', 'slotC', 'slotD'].map((k) => componentMax(C(k)))).toEqual([20, 20, 20, 20])
  })
  it('recitation variants add up to 60', () => {
    const v = C('pukhtagi').cfg!.variants!
    const sum = (x: typeof v.qaida) => x.fixed.reduce((a, f) => a + f.marks, 0) + (x.questions ?? []).reduce((a, q) => a + q.marks, 0)
    expect(sum(v.qaida)).toBe(60)
    expect(sum(v.nazira)).toBe(60)
    expect(hifzQuestions(v.hifz, 5, 60)).toEqual({ lines: 15, questions: [{ marks: 30 }, { marks: 30 }] })
    expect(hifzQuestions(v.hifz, 12, 60).questions.map((q) => q.marks)).toEqual([20, 20, 20])
    expect(hifzQuestions(v.hifz, 22, 60)).toEqual({ lines: 10, questions: [{ marks: 15 }, { marks: 15 }, { marks: 15 }, { marks: 15 }] })
  })
  it('any total works: school paper 33 + 33 + 34 = 100; 8 subjects × 100 = 800', () => {
    const school: SchemeDef = { name: { ur: '', en: '' }, groups: [], components: [{ key: 'p', group: 'g', name: { ur: '', en: '' }, method: 'manual', questions: [{ marks: 33 }, { marks: 33 }, { marks: 34 }] }] }
    expect(schemeTotal(school)).toBe(100)
    const eight: SchemeDef = { name: { ur: '', en: '' }, groups: [], components: Array.from({ length: 8 }, (_, i) => ({ key: `s${i}`, group: 'g', name: { ur: '', en: '' }, method: 'manual' as const, questions: [{ marks: 100 }] })) }
    expect(schemeTotal(eight)).toBe(800)
  })
  it('validation blocks zero/negative marks and warns on a total mismatch', () => {
    const bad: SchemeDef = { name: { ur: '', en: '' }, groups: [], intendedTotal: 100, components: [{ key: 'p', group: 'g', name: { ur: '', en: '' }, method: 'manual', questions: [{ marks: 0 }, { marks: 50 }] }] }
    const v = validateScheme(bad)
    expect(v.some((x) => x.level === 'error' && x.msg === 'non-positive-marks')).toBe(true)
    expect(v.some((x) => x.level === 'warn' && x.msg === 'total-mismatch')).toBe(true)
    expect(validateScheme(DEFAULT_TEMPLATE)).toEqual([])
  })
  it('the book ب / م / ک form ships as an alternative template', () => {
    expect(schemeTotal(BMK_TEMPLATE)).toBe(15)
  })
})

describe('subjects: question outcomes (§7.4)', () => {
  const s = C('slotA')
  it('both correct 20, one wrong 10, one partly correct 15', () => {
    expect(scoreOutcome(s, { outcomes: ['c', 'c'] }).marks).toBe(20)
    expect(scoreOutcome(s, { outcomes: ['c', 'w'] }).marks).toBe(10)
    expect(scoreOutcome(s, { outcomes: ['p', 'c'] }).marks).toBe(15)
  })
  it('both wrong → easy questions answered 8, not answered 0', () => {
    expect(scoreOutcome(s, { outcomes: ['w', 'w'], easy: 'yes' })).toMatchObject({ marks: 8, complete: true })
    expect(scoreOutcome(s, { outcomes: ['w', 'w'], easy: 'no' })).toMatchObject({ marks: 0, complete: true })
    expect(scoreOutcome(s, { outcomes: ['w', 'w'] }).complete).toBe(false)
  })
  it('incomplete until both questions are marked', () => {
    expect(scoreOutcome(s, { outcomes: ['c', null] }).complete).toBe(false)
  })
})

describe('تجوید: same mistake counts once (§7.3)', () => {
  const t = C('tajweed')
  it('no tap = full marks', () => expect(scoreDeduction(t, { checked: true }, []).marks).toBe(40))
  it('ض twice deducts once; ظ deducts again', () => {
    const taps: Tap[] = [{ type: 'makhraj', key: 'ض' }, { type: 'makhraj', key: 'ض' }, { type: 'makhraj', key: 'ظ' }]
    const r = scoreDeduction(t, {}, taps)
    expect(r.marks).toBe(34)
    expect(r.counted).toEqual([true, false, true])
  })
  it('light mistakes deduct 1; voided taps are ignored', () => {
    expect(scoreDeduction(t, {}, [{ type: 'qalqala', key: 'ق' }, { type: 'lahn-khafi', key: 'غنہ' }, { type: 'waqf', key: 'x', voided: true }]).marks).toBe(38)
  })
  it('+2 bonus for explaining the rules, capped at 40; no bonus in a makeup exam', () => {
    expect(scoreDeduction(t, { bonus: true }, []).marks).toBe(40)
    expect(scoreDeduction(t, { bonus: true }, [{ type: 'makhraj', key: 'ض' }]).marks).toBe(39)
    expect(scoreDeduction(t, { bonus: true }, [{ type: 'makhraj', key: 'ض' }], false).marks).toBe(37)
  })
})

describe('پختگی by track (§7.2)', () => {
  const p = C('pukhtagi')
  it('ناظرہ: غلطی 3, اٹکن 1, capped at 22 per question', () => {
    const taps: Tap[] = [{ type: 'ghalti', q: 1 }, { type: 'atkan', q: 1 }, ...Array.from({ length: 10 }, () => ({ type: 'ghalti', q: 2 }))]
    const r = scoreRecitation(p, { variant: 'nazira' }, taps)
    // 6 fixed + (22 − 4) + max(0, 22 − 30) + 10 = 34
    expect(r.marks).toBe(34)
  })
  it('ناظرہ: cannot read fluently −40', () => {
    expect(scoreRecitation(p, { variant: 'nazira', whole: 'not-fluent' }, []).marks).toBe(20)
  })
  it('قاعدہ: 3 × 18 + تعوذ 3 + تسمیہ 3; −30 / −10 whole deductions', () => {
    expect(scoreRecitation(p, { variant: 'qaida', checked: true }, []).marks).toBe(60)
    expect(scoreRecitation(p, { variant: 'qaida', fixed: { taawwuz: false } }, []).marks).toBe(57)
    expect(scoreRecitation(p, { variant: 'qaida', whole: 'no-rawan-after' }, []).marks).toBe(30)
    expect(scoreRecitation(p, { variant: 'qaida', whole: 'no-rawan-before' }, [{ type: 'hijje', q: 3 }]).marks).toBe(47)
  })
  it('حفظ: questions from paras, split evenly', () => {
    expect(scoreRecitation(p, { variant: 'hifz', paras: 10 }, [{ type: 'ghalti', q: 3 }]).marks).toBe(57)
  })
})

describe('نمازی ڈائری (§7.5) and attendance band', () => {
  const n = C('namazi')
  it('boys and girls have different categories', () => {
    expect(scoreCategory(n, { option: 'jamaat' }, 'm').marks).toBe(10)
    expect(scoreCategory(n, { option: 'ontime' }, 'm').marks).toBe(7)
    expect(scoreCategory(n, { option: 'ontime' }, 'f').marks).toBe(10)
    expect(scoreCategory(n, { option: 'jamaat' }, 'f').complete).toBe(false)
  })
  it('attendance marks come from the band (89.6% → 6)', () => {
    expect(scoreBand(C('attendance'), 89.6, bands).marks).toBe(6)
  })
  it('manual entry is capped at the question marks', () => {
    expect(scoreManual({ key: 'x', group: 'g', name: { ur: '', en: '' }, method: 'manual', questions: [{ marks: 33 }, { marks: 34 }] }, { values: [40, 20] }).marks).toBe(53)
  })
})

describe('grading reproduces the book tables (§8, Book p. 77)', () => {
  it('.5 rounds down: 101/200 = 50.5% → 50 → مقبول', () => {
    expect(percentHalfDown(101, 200)).toBe(50)
    expect(gradeFor(101, 200).ur).toBe('مقبول')
  })
  const table = (total: number) => gradeRanges(total).map((r) => [r.band.ur, r.from, r.to])
  it('200 marks', () => expect(table(200)).toEqual([['ممتاز', 160, 200], ['جید جداً', 132, 159], ['جید', 102, 131], ['مقبول', 80, 101], ['راسب', 0, 79]]))
  it('190 marks', () => expect(table(190)).toEqual([['ممتاز', 152, 190], ['جید جداً', 125, 151], ['جید', 96, 124], ['مقبول', 76, 95], ['راسب', 0, 75]]))
  it('500 marks', () => expect(table(500)).toEqual([['ممتاز', 398, 500], ['جید جداً', 328, 397], ['جید', 253, 327], ['مقبول', 198, 252], ['راسب', 0, 197]]))
  it('800 marks (spec example)', () => expect(table(800)).toEqual([['ممتاز', 637, 800], ['جید جداً', 525, 636], ['جید', 405, 524], ['مقبول', 317, 404], ['راسب', 0, 316]]))
})

describe('position (§8.1)', () => {
  const rows = [{ id: 'a', total: 180 }, { id: 'b', total: 175 }, { id: 'c', total: 180 }, { id: 'd', total: 150 }, { id: 'e', total: 190, makeup: true }]
  it('equal totals share a position; makeup gets none', () => {
    const p = positions(rows)
    expect([p.get('a'), p.get('c'), p.get('b'), p.get('d'), p.get('e')]).toEqual([1, 1, 3, 4, undefined])
    expect(positions(rows, 'dense').get('b')).toBe(2)
  })
})

describe('عملی کیفیت (§8.2) and teacher prize', () => {
  it('rule', () => {
    expect(practicalStatus(95, 10, false)).toBe('behtar')
    expect(practicalStatus(95, 7, false)).toBe('behtar')
    expect(practicalStatus(92, 10, true)).toBe('qabil-e-tawajjuh')
    expect(practicalStatus(69.9, 10, false)).toBe('qabil-e-tawajjuh')
    expect(practicalStatus(95, 4, false)).toBe('qabil-e-tawajjuh')
    expect(practicalStatus(85, 10, false)).toBe('munasib')
    expect(practicalStatus(95, null, false)).toBe('behtar') // حصہ ابتدائیہ
  })
  it('teacher prize at 95% ممتاز or صاحبِ ترتیب', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ grade: i < 18 ? 'mumtaz' : 'jayyid', perfect: i === 18 }))
    expect(teacherPrize(rows)).toEqual({ eligible: true, percent: 95 })
  })
})

describe('hadiya ledger (§10)', () => {
  const months = monthsBetween('2026-04', '2026-06')
  const plans = [{ student_id: 's', from_month: '2026-04', amount: 500 }, { student_id: 's', from_month: '2026-06', amount: 700 }]
  it('one Rs 1000 payment covers two months; the rate can rise', () => {
    const alloc = autoAllocate(1000, months.map((m) => ({ student_id: 's', month: m, outstanding: m < '2026-06' ? 500 : 700 })))
    expect(alloc).toEqual([{ student_id: 's', month: '2026-04', amount: 500 }, { student_id: 's', month: '2026-05', amount: 500 }])
    const row = chartRow('s', months, plans, alloc, new Set(months))
    expect(row.cells.map((c) => c.status)).toEqual(['paid', 'paid', 'unpaid'])
    expect(row.balance).toBe(700)
  })
  it('a payment split across siblings', () => {
    const a = autoAllocate(1200, [{ student_id: 'x', month: '2026-04', outstanding: 500 }, { student_id: 'y', month: '2026-04', outstanding: 700 }])
    expect(a.map((z) => z.amount)).toEqual([500, 700])
  })
  it('exempt students owe nothing', () => {
    const row = chartRow('s', months, [{ student_id: 's', from_month: '2026-04', amount: 500, exempt: true }], [], new Set(months))
    expect(row.balance).toBe(0)
  })
})

describe('activity log due months come from the calendar (§11)', () => {
  it('2024/25: six بزم, two مسابقہ, four parent meetings; overdue after the date', () => {
    const plan = generatePlan(SAMPLES[1].config, { weeklyHoliday: 0, practiceWeekday: 6 })
    const due = dueActivities(plan)
    expect(due.filter((d) => d.key === 'bazm').length).toBe(6)
    expect(due.filter((d) => d.key === 'musabqa').map((d) => d.due)).toEqual(['2024-08-26', '2024-12-28'])
    expect(due.filter((d) => d.key === 'parents').length).toBe(4)
    const st = activityStatus(due, [{ month: '2024-05', activity: 'bazm', done: 1 }], '2024-07-01')
    expect(st.find((s) => s.month === '2024-05' && s.key === 'bazm')!.status).toBe('done')
    expect(st.find((s) => s.month === '2024-06' && s.key === 'bazm')!.status).toBe('overdue')
    expect(st.find((s) => s.month === '2024-07' && s.key === 'bazm')!.status).toBe('upcoming')
  })
})
