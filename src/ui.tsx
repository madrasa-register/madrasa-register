import { AR } from './i18n/ar'
// Shared UI: language, live queries, form controls, dialogs.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

// ---------- language (Urdu primary, English second) ----------
export type Lang = 'ur' | 'ar' | 'en'
export const LANGS: { v: Lang; t: string }[] = [{ v: 'ur', t: 'اردو' }, { v: 'ar', t: 'العربية' }, { v: 'en', t: 'English' }]
export let lang: Lang = (() => { try { const v = localStorage.getItem('maktab.lang'); return v === 'ar' || v === 'en' ? v : 'ur' } catch { return 'ur' } })()
export function setLang(l: Lang) {
  lang = l
  try { localStorage.setItem('maktab.lang', l) } catch { /* ignore */ }
  document.documentElement.lang = l
  document.documentElement.dir = l === 'en' ? 'ltr' : 'rtl'
}
/**
 * tr('اردو', 'English') — picks the active language. Arabic comes from the
 * AR dictionary (keyed by the English text) or an explicit third argument;
 * a missing Arabic string falls back to Urdu.
 */
export const tr = (ur: string, en: string, ar?: string) =>
  lang === 'ur' ? ur : lang === 'en' ? en : (ar ?? AR[en] ?? ur)

/** Language picker used in the menu and on the setup screen. */
export function LangSelect({ onChange }: { onChange?: () => void }) {
  return (
    <select aria-label="Language" value={lang} onChange={(e) => { setLang(e.target.value as Lang); bumpVersion(); onChange?.() }}>
      {LANGS.map((l) => <option key={l.v} value={l.v}>{l.t}</option>)}
    </select>
  )
}

// ---------- vocab from the spec ----------
export const TRACKS = [
  { v: 'nazira', ur: 'ناظرہ', en: 'Nazira' },
  { v: 'hifz', ur: 'حفظ', en: 'Hifz' },
  { v: 'sanawi', ur: 'ثانوی', en: 'Secondary' },
]
export const PARTS = [
  { v: 'ibtidaiya', ur: 'حصہ ابتدائیہ', en: 'Preliminary part' },
  { v: 'awwal', ur: 'حصہ اول', en: 'Part 1' },
  { v: 'doam', ur: 'حصہ دوم', en: 'Part 2' },
  { v: 'soam', ur: 'حصہ سوم', en: 'Part 3' },
  { v: 'chaharum', ur: 'حصہ چہارم', en: 'Part 4' },
  { v: 'panjum', ur: 'حصہ پنجم', en: 'Part 5' },
]
export const GENDERS = [
  { v: 'boys', ur: 'بنین', en: 'Boys' },
  { v: 'girls', ur: 'بنات', en: 'Girls' },
]
export const STUDENT_GENDERS = [
  { v: 'm', ur: 'طالب علم', en: 'Boy' },
  { v: 'f', ur: 'طالبہ', en: 'Girl' },
]
export const ROLES = [
  { v: 'admin', ur: 'ہیڈ آفس', en: 'Head office' },
  { v: 'nazim', ur: 'ناظم', en: 'Nazim' },
  { v: 'teacher', ur: 'معلم / معلمہ', en: 'Teacher' },
  { v: 'examiner', ur: 'ممتحن', en: 'Examiner' },
]
export const STATUS_LABEL: Record<string, [string, string]> = {
  P: ['حاضر', 'Present'], A: ['غیر حاضر', 'Absent'], L: ['رخصت', 'Leave'],
}
export const label = (list: { v: string; ur: string; en: string }[], v: string | null | undefined) => {
  const x = list.find((i) => i.v === v)
  return x ? tr(x.ur, x.en) : (v ?? '')
}

// ---------- dates (Gregorian only in Phase 1; English digits) ----------
export const fmtDate = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('-') : '—')
export const monthStart = (ym: string) => `${ym}-01`
export const monthEnd = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const weekday = (iso: string) => new Date(iso + 'T00:00:00').getDay() // 0 = Sunday
export const WEEKDAYS_UR = ['اتوار', 'پیر', 'منگل', 'بدھ', 'جمعرات', 'جمعہ', 'ہفتہ']
export const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const WEEKDAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
export const dayName = (iso: string) => (lang === 'ur' ? WEEKDAYS_UR : lang === 'ar' ? WEEKDAYS_AR : WEEKDAYS_EN)[weekday(iso)]

// ---------- live query hook ----------
let version = 0
const vListeners = new Set<() => void>()
export function bumpVersion() { version++; vListeners.forEach((l) => l()) }

export function useQuery<T>(fn: () => Promise<T>, deps: any[] = []): T | undefined {
  const [v, setV] = useState(version)
  const [data, setData] = useState<T>()
  useEffect(() => {
    const l = () => setV(version)
    vListeners.add(l)
    return () => { vListeners.delete(l) }
  }, [])
  useEffect(() => {
    let alive = true
    fn().then((d) => { if (alive) setData(d) }).catch((e) => console.error(e))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, ...deps])
  return data
}

// ---------- dialogs (reason prompt, confirm, toast) ----------
type DialogReq = { title: string; message?: string; input?: boolean; placeholder?: string; resolve: (v: string | null) => void }
const DialogCtx = createContext<{ open: (r: Omit<DialogReq, 'resolve'>) => Promise<string | null>; toast: (m: string, kind?: 'ok' | 'err') => void }>(null as any)
export const useDialog = () => useContext(DialogCtx)

export function DialogHost({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<DialogReq | null>(null)
  const [val, setVal] = useState('')
  const [toastMsg, setToast] = useState<{ m: string; kind: string } | null>(null)
  const timer = useRef<any>(null)
  const open = (r: Omit<DialogReq, 'resolve'>) => new Promise<string | null>((resolve) => { setVal(''); setReq({ ...r, resolve }) })
  const toast = (m: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ m, kind }); clearTimeout(timer.current); timer.current = setTimeout(() => setToast(null), 3200)
  }
  const close = (v: string | null) => { req?.resolve(v); setReq(null) }
  return (
    <DialogCtx.Provider value={{ open, toast }}>
      {children}
      {req && (
        <div className="overlay" onClick={() => close(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog">
            <h3>{req.title}</h3>
            {req.message && <p className="muted">{req.message}</p>}
            {req.input && (
              <textarea autoFocus rows={2} value={val} placeholder={req.placeholder} onChange={(e) => setVal(e.target.value)} />
            )}
            <div className="row end">
              <button className="ghost" onClick={() => close(null)}>{tr('منسوخ', 'Cancel')}</button>
              <button className="primary" disabled={req.input && !val.trim()} onClick={() => close(req.input ? val.trim() : 'ok')}>
                {tr('ٹھیک ہے', 'OK')}
              </button>
            </div>
          </div>
        </div>
      )}
      {toastMsg && <div className={`toast ${toastMsg.kind}`}>{toastMsg.m}</div>}
    </DialogCtx.Provider>
  )
}
/** Ask for a reason (required). Returns null if cancelled. */
export function useAskReason() {
  const d = useDialog()
  return (title: string, message?: string) =>
    d.open({ title, message, input: true, placeholder: tr('وجہ لکھیں (ضروری)', 'Write the reason (required)') })
}

// ---------- form controls ----------
export function Field({ label: l, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="flabel">{l}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  )
}
export function Select({ value, onChange, options, empty }: {
  value: string; onChange: (v: string) => void; options: { v: string; t: string }[]; empty?: string
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
    </select>
  )
}
export const opts = (list: { v: string; ur: string; en: string }[]) => list.map((i) => ({ v: i.v, t: tr(i.ur, i.en) }))

export function Num({ children }: { children: ReactNode }) {
  return <span className="num" dir="ltr">{children}</span>
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}
export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card">
      {(title || actions) && <div className="card-head"><h2>{title}</h2><div className="row">{actions}</div></div>}
      {children}
    </section>
  )
}
export function Badge({ kind, children }: { kind: 'ok' | 'warn' | 'err' | 'muted'; children: ReactNode }) {
  return <span className={`badge ${kind}`}>{children}</span>
}
