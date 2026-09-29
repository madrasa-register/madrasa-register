// Date field that can be typed (dd/mm/yyyy) or picked from a small calendar with month and year choosers,
// so going to e.g. August 2025 takes two taps instead of paging month by month.
import { useEffect, useRef, useState } from 'react'
import { lang, tr } from './ui'

const MONTHS: Record<string, string[]> = {
  ur: ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'],
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}
const WD: Record<string, string[]> = { ur: ['اتوار', 'پیر', 'منگل', 'بدھ', 'جمعرات', 'جمعہ', 'ہفتہ'], ar: ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'], en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] }
const pad = (n: number) => String(n).padStart(2, '0')
const toText = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')
function parse(t: string): string | null {
  const m = t.trim().match(/^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{4})$/)
  if (!m) return null
  const d = +m[1], mo = +m[2], y = +m[3]
  if (mo < 1 || mo > 12 || d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return null
  return `${y}-${pad(mo)}-${pad(d)}`
}
function mask(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

type Props = { value?: string; onChange?: (e: { target: { value: string } }) => void; min?: string; max?: string; disabled?: boolean; style?: React.CSSProperties }

export function DateInput({ value, onChange, min, max, disabled, style }: Props) {
  const [text, setText] = useState(toText(value))
  const [open, setOpen] = useState(false)
  const [bad, setBad] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { setText(toText(value)); setBad(false) }, [value])
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  const emit = (iso: string) => { if ((min && iso < min) || (max && iso > max)) { setBad(true); return } setBad(false); onChange?.({ target: { value: iso } }) }
  return (
    <div className="dateinput" ref={box} style={style}>
      <input dir="ltr" inputMode="numeric" placeholder="dd/mm/yyyy" value={text} disabled={disabled} className={bad ? 'bad' : ''}
        onChange={(e) => { const t = mask(e.target.value); setText(t); const iso = parse(t); if (iso) emit(iso); else setBad(t.length === 10) }}
        onBlur={() => { if (!parse(text)) setText(toText(value)) }} />
      <button type="button" className="ghost sm" disabled={disabled} aria-label={tr('کیلنڈر', 'Calendar', 'التقويم')} onClick={() => setOpen(!open)}>📅</button>
      {open && <Picker value={parse(text) ?? value} onPick={(iso) => { setOpen(false); emit(iso) }} />}
    </div>
  )
}

function Picker({ value, onPick }: { value?: string; onPick: (iso: string) => void }) {
  const t = new Date()
  const [y, setY] = useState(value ? +value.slice(0, 4) : t.getFullYear())
  const [m, setM] = useState(value ? +value.slice(5, 7) : t.getMonth() + 1)
  const L = lang in MONTHS ? lang : 'ur'
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  const len = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells = [...Array(first).fill(0), ...Array.from({ length: len }, (_, i) => i + 1)]
  const years = Array.from({ length: 41 }, (_, i) => t.getFullYear() - 30 + i)
  const step = (d: number) => { let mm = m + d, yy = y; if (mm < 1) { mm = 12; yy-- } if (mm > 12) { mm = 1; yy++ } setM(mm); setY(yy) }
  return (
    <div className="dp">
      <div className="dp-head">
        <button type="button" className="ghost sm" onClick={() => step(-1)}>‹</button>
        <select value={m} onChange={(e) => setM(+e.target.value)}>{MONTHS[L].map((n, i) => <option key={i} value={i + 1}>{n}</option>)}</select>
        <select value={y} onChange={(e) => setY(+e.target.value)} dir="ltr">{years.map((yy) => <option key={yy} value={yy}>{yy}</option>)}</select>
        <button type="button" className="ghost sm" onClick={() => step(1)}>›</button>
      </div>
      <div className="dp-grid">
        {WD[L].map((w) => <span key={w} className="dp-wd">{w}</span>)}
        {cells.map((d, i) => d ? <button type="button" key={i} className={`dp-d ${value === `${y}-${pad(m)}-${pad(d)}` ? 'on' : ''}`} onClick={() => onPick(`${y}-${pad(m)}-${pad(d)}`)}>{d}</button> : <span key={i} />)}
      </div>
      <button type="button" className="ghost sm" onClick={() => onPick(`${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`)}>{tr('آج', 'Today', 'اليوم')}</button>
    </div>
  )
}
