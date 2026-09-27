import type { DayType } from '../engine/calendar'
import { lang, tr } from '../ui'
import { HIJRI_MONTHS_AR, HIJRI_MONTHS_EN, HIJRI_MONTHS_UR } from '../engine/hijri'

// Names and colours follow the printed تعلیمی کیلنڈر.
export const DAY_META: Record<DayType, { ur: string; en: string; ar: string; short: [string, string, string] }> = {
  before: { ur: 'گزشتہ سال', en: 'Previous year', ar: 'العام السابق', short: ['', '', ''] },
  after: { ur: 'نیا سال', en: 'Next year', ar: 'العام الجديد', short: ['', '', ''] },
  opening: { ur: 'افتتاحِ سال', en: 'Year opening', ar: 'افتتاح العام', short: ['افتتاح', 'Open', 'افتتاح'] },
  padhai: { ur: 'پڑھائی', en: 'Teaching', ar: 'دراسة', short: ['پڑھائی', 'Teach', 'دراسة'] },
  practice: { ur: 'پڑھائی / وضو، نماز کی عملی مشق', en: 'Teaching + wudu/salah practice', ar: 'دراسة + تطبيق الوضوء والصلاة', short: ['مشق', 'Pract.', 'تطبيق'] },
  dohrai_tarbiyati: { ur: 'دہرائی / تربیتی سرگرمی', en: 'Revision + tarbiyah activity', ar: 'مراجعة + نشاط تربوي', short: ['تربیتی', 'Activity', 'تربوي'] },
  dohrai: { ur: 'دہرائی', en: 'Revision', ar: 'مراجعة', short: ['دہرائی', 'Revise', 'مراجعة'] },
  jaiza: { ur: 'ماہانہ جائزہ', en: 'Monthly review', ar: 'التقييم الشهري', short: ['جائزہ', 'Review', 'تقييم'] },
  bazm: { ur: 'بزم', en: 'Bazm', ar: 'بزم', short: ['بزم', 'Bazm', 'بزم'] },
  musabqa: { ur: 'مسابقہ', en: 'Competition', ar: 'مسابقة', short: ['مسابقہ', 'Comp.', 'مسابقة'] },
  exam_prep: { ur: 'امتحان کی تیاری', en: 'Exam preparation', ar: 'الاستعداد للامتحان', short: ['تیاری', 'Prep', 'استعداد'] },
  exam: { ur: 'امتحان', en: 'Exam', ar: 'امتحان', short: ['امتحان', 'Exam', 'امتحان'] },
  ceremony: { ur: 'سالانہ تقریب کی تیاری', en: 'Annual ceremony', ar: 'الحفل السنوي', short: ['تقریب', 'Cerem.', 'حفل'] },
  izala: { ur: 'کمزوری کا ازالہ', en: 'Remediation', ar: 'معالجة الضعف', short: ['ازالہ', 'Remed.', 'معالجة'] },
  holiday: { ur: 'تعطیل', en: 'Holiday', ar: 'عطلة', short: ['تعطیل', 'Off', 'عطلة'] },
  parents: { ur: 'والدین ملاقات', en: 'Parent meeting', ar: 'لقاء أولياء الأمور', short: ['والدین', 'Parents', 'أولياء'] },
  fuzala: { ur: 'فضلاء جوڑ', en: 'Alumni gathering', ar: 'لقاء الخريجين', short: ['فضلاء', 'Alumni', 'خريجون'] },
  event: { ur: 'تقریب', en: 'Event', ar: 'مناسبة', short: ['تقریب', 'Event', 'مناسبة'] },
  unscheduled: { ur: 'غیر مقرر', en: 'Not scheduled', ar: 'غير مجدول', short: ['؟', '?', '؟'] },
}
export const dayName = (t: DayType) => tr(DAY_META[t].ur, DAY_META[t].en, DAY_META[t].ar)
export const dayShort = (t: DayType) => DAY_META[t].short[lang === 'ur' ? 0 : lang === 'en' ? 1 : 2]
export const hijriMonth = (m: number) => (lang === 'ur' ? HIJRI_MONTHS_UR : lang === 'ar' ? HIJRI_MONTHS_AR : HIJRI_MONTHS_EN)[m - 1]
export const GREG_UR = ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر']
export const GREG_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
export const GREG_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const gregMonth = (m: number) => (lang === 'ur' ? GREG_UR : lang === 'ar' ? GREG_AR : GREG_EN)[m - 1]
export const hijriText = (h: { y: number; m: number; d: number }) => `${h.d} ${hijriMonth(h.m)} ${h.y}`
/** Order of the totals column on the printed calendar. */
export const TOTALS_ORDER: DayType[] = ['opening', 'padhai', 'practice', 'dohrai', 'dohrai_tarbiyati', 'jaiza', 'bazm', 'musabqa', 'exam_prep', 'exam', 'parents', 'fuzala', 'ceremony', 'izala', 'holiday', 'unscheduled']
