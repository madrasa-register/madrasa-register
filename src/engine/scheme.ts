// Mark schemes (Spec §7.0). No mark value is hard-coded in the scoring code:
// every number comes from a scheme. The maktab's 200-mark paper is only the
// preloaded default template (v1). Totals are always sums of questions.

export type L = { ur: string; en: string; ar?: string }
export type Method = 'manual' | 'outcome' | 'deduction' | 'recitation' | 'band' | 'category'

export type DeductionType = { key: string; name: L; points: number; oncePerKey?: boolean; askKey?: 'letter' | 'rule' }
export type CategoryOption = { key: string; name: L; marks: number }
export type RecitationVariant = {
  name: L
  fixed: { key: string; name: L; marks: number }[] // تعوذ، تسمیہ
  questions?: { name?: L; marks: number }[]
  hifzByParas?: { upTo: number; questions: number; lines: number }[] // حفظ: question count by paras memorised
  deductions: DeductionType[]
  whole: { key: string; name: L; points: number }[] // e.g. cannot read fluently −40 (choose one)
}
export type Component = {
  key: string
  name: L
  names?: Record<string, L> // subject name per track (slots A–D)
  group: string
  method: Method
  questions?: { marks: number }[]
  max?: number // band / category / recitation
  appliesTo?: { tracks?: string[]; parts?: string[]; excludeParts?: string[] }
  cardRole?: 'quran' | 'slotA' | 'slotB' | 'slotC' | 'slotD' | 'namazi' | 'attendance'
  cfg?: {
    partialDeduct?: number; fallbackMin?: number // outcome
    types?: DeductionType[]; bonus?: number // deduction
    options?: Record<string, CategoryOption[]> // category, by gender key ('m' | 'f')
    variants?: Record<string, RecitationVariant> // recitation
  }
}
export type Group = { key: string; name: L }
export type SchemeDef = { name: L; groups: Group[]; components: Component[]; intendedTotal?: number }

const l = (ur: string, en: string, ar?: string): L => ({ ur, en, ar })

// ---------- totals ----------
export function componentMax(c: Component): number {
  if (c.method === 'recitation' || c.method === 'band' || c.method === 'category') return c.max ?? 0
  if (c.method === 'deduction') return c.max ?? sumQ(c)
  return sumQ(c) || (c.max ?? 0)
}
const sumQ = (c: Component) => (c.questions ?? []).reduce((a, q) => a + (Number(q.marks) || 0), 0)

export function applies(c: Component, track: string, part: string): boolean {
  const a = c.appliesTo
  if (!a) return true
  if (a.tracks?.length && !a.tracks.includes(track)) return false
  if (a.parts?.length && !a.parts.includes(part)) return false
  if (a.excludeParts?.includes(part)) return false
  return true
}
export const componentsFor = (s: SchemeDef, track: string, part: string) => s.components.filter((c) => applies(c, track, part))
export const schemeTotal = (s: SchemeDef, track?: string, part?: string) =>
  (track !== undefined ? componentsFor(s, track, part ?? '') : s.components).reduce((a, c) => a + componentMax(c), 0)
export const groupTotal = (s: SchemeDef, g: string, track: string, part: string) =>
  componentsFor(s, track, part).filter((c) => c.group === g).reduce((a, c) => a + componentMax(c), 0)

/** Builder validation (§7.0 step 4). */
export function validateScheme(s: SchemeDef): { level: 'error' | 'warn'; msg: string; key?: string }[] {
  const out: { level: 'error' | 'warn'; msg: string; key?: string }[] = []
  const keys = new Set<string>()
  for (const c of s.components) {
    if (keys.has(c.key)) out.push({ level: 'error', msg: 'duplicate-key', key: c.key })
    keys.add(c.key)
    for (const q of c.questions ?? []) if (!(Number(q.marks) > 0)) out.push({ level: 'error', msg: 'non-positive-marks', key: c.key })
    if ((c.method === 'band' || c.method === 'category' || c.method === 'recitation') && !(Number(c.max) > 0)) out.push({ level: 'error', msg: 'non-positive-marks', key: c.key })
    if ((c.method === 'manual' || c.method === 'outcome') && !(c.questions?.length)) out.push({ level: 'error', msg: 'no-questions', key: c.key })
    if (c.method === 'category') {
      for (const opts of Object.values(c.cfg?.options ?? {})) for (const o of opts) if (o.marks > (c.max ?? 0)) out.push({ level: 'error', msg: 'option-above-max', key: c.key })
    }
  }
  if (s.intendedTotal && s.intendedTotal !== schemeTotal(s)) out.push({ level: 'warn', msg: 'total-mismatch' })
  return out
}

// ---------- the maktab default template v1 (Reg. p. 28, 55–58; Card) ----------
const SLOT_NAMES: Record<'A' | 'B' | 'C' | 'D', Record<string, L>> = {
  A: { nazira: l('ایمانیات و عبادات', 'Beliefs and worship', 'الإيمانيات والعبادات'), hifz: l('تجوید و ایمانیات', 'Tajweed and beliefs', 'التجويد والإيمانيات'), sanawi: l('ترجمہ و تفسیر', 'Translation and tafsir', 'الترجمة والتفسير') },
  B: { nazira: l('احادیث و مسنون دعائیں', 'Hadith and sunnah duas', 'الأحاديث والأدعية المسنونة'), hifz: l('عبادات', 'Worship', 'العبادات'), sanawi: l('ایمانیات و عبادات', 'Beliefs and worship', 'الإيمانيات والعبادات') },
  C: { nazira: l('سیرت و اخلاق و آداب', 'Seerah, character and manners', 'السيرة والأخلاق والآداب'), hifz: l('احادیث و مسنون دعائیں', 'Hadith and sunnah duas', 'الأحاديث والأدعية المسنونة'), sanawi: l('احادیث و مسنون دعائیں', 'Hadith and sunnah duas', 'الأحاديث والأدعية المسنونة') },
  D: { nazira: l('زبان (عربی، اردو)', 'Language (Arabic, Urdu)', 'اللغة (العربية، الأردية)'), hifz: l('سیرت و اخلاق و آداب', 'Seerah, character and manners', 'السيرة والأخلاق والآداب'), sanawi: l('معاشرت و معاملات', 'Social life and dealings', 'المعاشرة والمعاملات') },
}
const fixedItems = [{ key: 'taawwuz', name: l('تعوذ', "Ta'awwudh", 'التعوذ'), marks: 3 }, { key: 'tasmiya', name: l('تسمیہ', 'Tasmiyah', 'التسمية'), marks: 3 }]
const ghalti = { key: 'ghalti', name: l('غلطی', 'Mistake', 'خطأ'), points: 3 }
const atkan = { key: 'atkan', name: l('اٹکن', 'Hesitation', 'تلعثم'), points: 1 }

export const DEFAULT_TEMPLATE: SchemeDef = {
  name: l('مکتب کا 200 نمبر کا پرچہ', 'Maktab 200-mark paper', 'ورقة المكتب من 200 درجة'),
  intendedTotal: 200,
  groups: [
    { key: 'quran', name: l('قاعدہ / قرآن', 'Qaida / Quran', 'القاعدة / القرآن') },
    { key: 'subjects', name: l('مضامین', 'Subjects', 'المواد') },
  ],
  components: [
    {
      key: 'pukhtagi', group: 'quran', method: 'recitation', max: 60, cardRole: 'quran',
      name: l('پختگی', 'Fluency', 'الإتقان'),
      cfg: {
        variants: {
          qaida: { // Reg. p. 55
            name: l('نورانی قاعدہ', 'Noorani Qaida', 'القاعدة النورانية'),
            fixed: fixedItems,
            questions: [{ marks: 18 }, { marks: 18 }, { marks: 18 }],
            deductions: [
              { key: 'shanakht', name: l('حروف کی شناخت', 'Letter recognition', 'معرفة الحروف'), points: 3 },
              { key: 'hijje', name: l('ہجے', 'Spelling', 'التهجئة'), points: 3 },
              { key: 'rawan', name: l('رواں', 'Flow', 'الطلاقة'), points: 3 },
              atkan,
            ],
            whole: [
              { key: 'no-rawan-after', name: l('حرکات و تنوین مشق کے بعد رواں نہیں پڑھ سکتا', 'Cannot read fluently after the harakat/tanween lessons', 'لا يقرأ بطلاقة بعد دروس الحركات والتنوين'), points: 30 },
              { key: 'no-rawan-before', name: l('حرکات و تنوین مشق تک یا اس سے پہلے رواں نہیں پڑھ سکتا', 'Cannot read fluently, at or before the harakat/tanween lessons', 'لا يقرأ بطلاقة قبل دروس الحركات أو عندها'), points: 10 },
            ],
          },
          nazira: { // Reg. p. 56
            name: l('ناظرہ قرآن', 'Quran reading', 'قراءة القرآن نظراً'),
            fixed: fixedItems,
            questions: [{ marks: 22 }, { marks: 22 }, { name: l('حفظ سورۃ', 'Memorised surah', 'حفظ سورة'), marks: 10 }],
            deductions: [ghalti, atkan],
            whole: [{ key: 'not-fluent', name: l('رواں نہیں پڑھ سکتا', 'Cannot read fluently', 'لا يقرأ بطلاقة'), points: 40 }],
          },
          hifz: { // Reg. p. 57 — marks split evenly across the questions (to confirm)
            name: l('حفظ', 'Hifz', 'الحفظ'),
            fixed: [],
            hifzByParas: [{ upTo: 7, questions: 2, lines: 15 }, { upTo: 15, questions: 3, lines: 12 }, { upTo: 30, questions: 4, lines: 10 }],
            deductions: [ghalti, atkan],
            whole: [],
          },
        },
      },
    },
    {
      key: 'tajweed', group: 'quran', method: 'deduction', max: 40, // Reg. p. 56–57
      name: l('تجوید', 'Tajweed', 'التجويد'),
      cfg: {
        bonus: 2,
        types: [
          { key: 'makhraj', name: l('مخرج', 'Makhraj (letter)', 'المخرج'), points: 3, oncePerKey: true, askKey: 'letter' },
          { key: 'waqf', name: l('وقف کی غلطی', 'Waqf', 'الوقف'), points: 3, oncePerKey: true, askKey: 'rule' },
          { key: 'lahn-jali', name: l('لحن جلی', 'Lahn jali', 'اللحن الجلي'), points: 3, oncePerKey: true, askKey: 'rule' },
          { key: 'qalqala', name: l('قلقلہ کی غلطی', 'Qalqalah', 'القلقلة'), points: 1, oncePerKey: true, askKey: 'letter' },
          { key: 'lahn-khafi', name: l('لحن خفی', 'Lahn khafi', 'اللحن الخفي'), points: 1, oncePerKey: true, askKey: 'rule' },
        ],
      },
    },
    ...(['A', 'B', 'C', 'D'] as const).map((s): Component => ({
      key: `slot${s}`, group: 'subjects', method: 'outcome', cardRole: `slot${s}` as Component['cardRole'],
      name: SLOT_NAMES[s].nazira, names: SLOT_NAMES[s],
      questions: [{ marks: 10 }, { marks: 10 }],
      cfg: { partialDeduct: 5, fallbackMin: 8 }, // Reg. p. 57 (partly correct −5: to confirm)
    })),
    {
      key: 'namazi', group: 'subjects', method: 'category', max: 10, cardRole: 'namazi', // Reg. p. 58
      name: l('نمازی ڈائری', 'Prayer diary', 'دفتر الصلاة'),
      appliesTo: { excludeParts: ['ibtidaiya'] },
      cfg: {
        options: {
          m: [
            { key: 'jamaat', name: l('با جماعت', 'With congregation', 'مع الجماعة'), marks: 10 },
            { key: 'ontime', name: l('وقت پر (بغیر جماعت)', 'On time (without congregation)', 'في الوقت (بلا جماعة)'), marks: 7 },
            { key: 'qaza', name: l('اکثر قضا', 'Mostly qaza', 'غالباً قضاء'), marks: 4 },
            { key: 'none', name: l('نماز نہیں پڑھی یا ڈائری نہیں بنائی', 'Not prayed or no diary', 'لم يصلّ أو لا دفتر'), marks: 0 },
          ],
          f: [
            { key: 'ontime', name: l('وقت پر', 'On time', 'في الوقت'), marks: 10 },
            { key: 'qaza', name: l('اکثر قضا', 'Mostly qaza', 'غالباً قضاء'), marks: 4 },
            { key: 'none', name: l('نماز نہیں پڑھی یا ڈائری نہیں بنائی', 'Not prayed or no diary', 'لم تصلّ أو لا دفتر'), marks: 0 },
          ],
        },
      },
    },
    { key: 'attendance', group: 'subjects', method: 'band', max: 10, cardRole: 'attendance', name: l('حاضری', 'Attendance', 'الحضور') },
  ],
}

/** Book ب / م / ک form (three marks per subject) — shipped as an alternative template (Spec §2). */
export const BMK_TEMPLATE: SchemeDef = {
  name: l('کتاب کا ماہانہ جائزہ (ب / م / ک)', "Book's monthly review (B / M / K)", 'تقييم الكتاب الشهري'),
  groups: [{ key: 'main', name: l('مضامین', 'Subjects', 'المواد') }],
  components: [
    { key: 'quran', group: 'main', method: 'manual', name: l('قاعدہ / قرآن', 'Qaida / Quran'), questions: [{ marks: 3 }] },
    ...(['A', 'B', 'C', 'D'] as const).map((s): Component => ({ key: `slot${s}`, group: 'main', method: 'manual', name: SLOT_NAMES[s].nazira, names: SLOT_NAMES[s], questions: [{ marks: 3 }] })),
  ],
}

/** Hifz questions from the number of paras memorised (Reg. p. 57); marks split evenly. */
export function hifzQuestions(v: RecitationVariant, paras: number, max: number) {
  const rule = (v.hifzByParas ?? []).find((r) => paras <= r.upTo) ?? v.hifzByParas?.[v.hifzByParas.length - 1]
  const n = rule?.questions ?? 2
  const base = Math.floor(max / n), extra = max - base * n
  return { lines: rule?.lines ?? 0, questions: Array.from({ length: n }, (_, i) => ({ marks: base + (i < extra ? 1 : 0) })) }
}

/** Name of a component for a track (slots change name per track). */
export const nameFor = (c: Component, track: string) => c.names?.[track] ?? c.name

/** Default recitation variant from track and part. */
export const defaultVariant = (track: string, part: string) => (track === 'hifz' ? 'hifz' : part === 'ibtidaiya' ? 'qaida' : 'nazira')
