import { useRef, useState } from 'react'
import { all, get, one, session, today, detId, insert, update, nowIso, type Row } from '../db/db'
import { myClasses, loadSettings, currentTeacherOf, studentPeriod } from '../db/repo'
import { examWindow } from '../db/examRepo'
import { summarize } from '../engine/attendance'
import { ageYM } from '../engine/attendance'
import { tr, useQuery, Card, Empty, Num, Select, useDialog, fmtDate, label, PARTS } from '../ui'
import { gradeName, practicalName } from './Exams'
import { pagesToPdf, savePdf } from '../pdf'

type Panel = {
  exam: Row | null; es: Row | null; rows: { label: string; max: number; marks: number | null; na?: boolean }[]
  total: number; max: number; days: { teaching: number; present: number; absent: number } | null; track: string
}

async function panelFor(exam: Row | null, studentId: string, track: string, part: string): Promise<Panel> {
  const slots = { slotA: 20, slotB: 20, slotC: 20, slotD: 20 }
  const names = await slotNames(track)
  const base = [
    { key: 'quran', label: tr('قرآن کریم', 'Holy Quran', 'القرآن الكريم'), max: 100 },
    ...(['slotA', 'slotB', 'slotC', 'slotD'] as const).map((k) => ({ key: k, label: names[k], max: slots[k] })),
    { key: 'namazi', label: tr('نمازی ڈائری', 'Prayer diary', 'دفتر الصلاة'), max: 10 },
    { key: 'attendance', label: tr('حاضری', 'Attendance', 'الحضور'), max: 10 },
  ]
  const ibt = part === 'ibtidaiya'
  if (!exam) return { exam: null, es: null, rows: base.map((b) => ({ label: b.label, max: b.max, marks: null, na: ibt && b.key === 'namazi' })), total: 0, max: ibt ? 190 : 200, days: null, track }
  const es = await get('exam_student', detId('es', exam.id, studentId))
  const entries = await all<Row>('select * from score_entry where exam_id = ? and student_id = ?', [exam.id, studentId])
  const scheme = await get('mark_scheme', exam.scheme_id)
  const def = scheme ? JSON.parse(scheme.definition) : { components: [] }
  const byRole = (role: string) => def.components.filter((c: any) => c.cardRole === role || (role === 'quran' && c.group === 'quran')).map((c: any) => c.key)
  const sum = (keys: string[]) => entries.filter((e) => keys.includes(e.component_key)).reduce((a, e) => a + (e.marks ?? 0), 0)
  const rows = base.map((b) => {
    const keys = byRole(b.key)
    const na = ibt && b.key === 'namazi'
    return { label: b.label, max: b.max, marks: na ? null : keys.length && es && !es.absent ? sum(keys) : null, na }
  })
  const win = await examWindow(exam)
  const st = await loadSettings()
  const p = await studentPeriod(studentId, win.from, win.to)
  const s = summarize(p.dates, p.map, st['attendance.leaveCountsAsAbsent'] as boolean)
  return { exam, es, rows, total: es?.total ?? 0, max: es?.max ?? (ibt ? 190 : 200), days: { teaching: s.teachingDays, present: s.present, absent: s.notPresent }, track }
}
async function slotNames(track: string) {
  const { DEFAULT_TEMPLATE } = await import('../engine/scheme')
  const out: Record<string, string> = {}
  for (const c of DEFAULT_TEMPLATE.components) if (c.cardRole?.startsWith('slot')) { const n = c.names?.[track] ?? c.name; out[c.cardRole] = tr(n.ur, n.en, n.ar) }
  return out
}

export function ResultCards() {
  const d = useDialog()
  const classes = useQuery(() => myClasses(), [])
  const [classId, setClassId] = useState('')
  const [studentId, setStudentId] = useState<string | null>(null)
  if (classes?.length && !classId) setTimeout(() => setClassId(classes[0].id))
  const data = useQuery(async () => {
    if (!classId) return null
    const cls = await get('class', classId)
    const studs = await all<Row>(`select distinct s.* from enrollment e join student s on s.id = e.student_id where e.class_id = ? and (e.to_date is null or e.to_date = '') order by s.serial_no`, [classId])
    const yearId = cls?.academic_year_id
    const statuses = await all<Row>('select * from card_status where academic_year_id = ?', [yearId])
    return { cls, studs, yearId, statuses }
  }, [classId])

  async function flag(sid: string, field: 'handed_five' | 'returned_five' | 'handed_annual', on: boolean) {
    const id = detId('card', sid, data!.yearId)
    const ex = await get('card_status', id)
    const v = on ? nowIso() : null
    if (ex) await update('card_status', id, { [field]: v }, null, { requireReason: false, action: 'card-status' })
    else await insert('card_status', { student_id: sid, academic_year_id: data!.yearId, [field]: v }, { id, branchId: data!.cls!.branch_id })
    d.toast(tr('محفوظ', 'Saved'))
  }
  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>{tr('نتیجۂ امتحان کارڈ', 'Result card', 'بطاقة النتيجة')}</h1>
        <Select value={classId} onChange={(v) => { setClassId(v); setStudentId(null) }} options={(classes ?? []).map((c) => ({ v: c.id, t: c.name }))} />
      </div>
      {data && (
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>#</th><th>{tr('نام', 'Name')}</th><th>{tr('پنج ماہی: سرپرست کو دیا', 'Five-monthly: handed to guardian', 'سُلّمت (نصف العام)')}</th><th>{tr('دستخط شدہ واپس', 'Signed card returned', 'أُعيدت موقّعة')}</th><th>{tr('سالانہ: سرپرست کو دیا', 'Annual: handed to guardian', 'سُلّمت (السنوي)')}</th><th /></tr></thead>
          <tbody>{data.studs.map((s) => {
            const st = data.statuses.find((x) => x.student_id === s.id)
            return (
              <tr key={s.id}>
                <td><Num>{s.serial_no}</Num></td><td>{s.name}</td>
                {(['handed_five', 'returned_five', 'handed_annual'] as const).map((f) => (
                  <td key={f}><label className="check"><input type="checkbox" checked={!!st?.[f]} onChange={(e) => flag(s.id, f, e.target.checked)} />{st?.[f] ? <Num>{fmtDate(st[f])}</Num> : ''}</label></td>
                ))}
                <td><button className="ghost sm" onClick={() => setStudentId(s.id)}>{tr('کارڈ دیکھیں', 'View card', 'عرض البطاقة')}</button></td>
              </tr>
            )
          })}</tbody>
        </table></div>
      )}
      {data && data.studs.length === 0 && <Empty>{tr('کوئی طالب علم نہیں', 'No students', 'لا طلاب')}</Empty>}
      {studentId && data?.cls && <CardPreview key={studentId} studentId={studentId} cls={data.cls} />}
    </div>
  )
}

function CardPreview({ studentId, cls }: { studentId: string; cls: Row }) {
  const d = useDialog()
  const p1 = useRef<HTMLDivElement>(null), p2 = useRef<HTMLDivElement>(null)
  const [imgs, setImgs] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const data = useQuery(async () => {
    const s = (await get('student', studentId))!
    const en = await one<Row>(`select * from enrollment where student_id = ? and class_id = ? order by from_date desc limit 1`, [studentId, cls.id])
    const track = en?.track ?? 'nazira', part = en?.curriculum_part ?? 'awwal'
    const exams = await all<Row>(`select * from exam where class_id = ? and academic_year_id = ? and kind in ('five','annual','makeup') order by date`, [cls.id, cls.academic_year_id])
    // a makeup counts for the exam it replaces when the student was absent
    const pick = async (kind: 'five' | 'annual') => {
      const main = exams.find((e) => e.kind === kind) ?? null
      if (!main) return null
      const es = await get('exam_student', detId('es', main.id, studentId))
      if (es?.absent) { const mk = exams.find((e) => e.makeup_of === main.id); if (mk) return mk }
      return main
    }
    const five = await panelFor(await pick('five'), studentId, track, part)
    const annual = await panelFor(await pick('annual'), studentId, track, part)
    const teacher = await currentTeacherOf(cls.id)
    const branch = await get('branch', cls.branch_id)
    const org = await one<Row>('select * from organization where id = ?', [session.orgId])
    const st = await loadSettings()
    const instructions = String(st['card.instructions'] ?? '').split('\n').map((x) => x.trim()).filter(Boolean)
    return { s, track, part, five, annual, teacher, branch, org, instructions }
  }, [studentId])
  if (!data) return null
  const { s, part, five, annual, teacher, branch, org, instructions } = data
  const age = s.dob ? ageYM(s.dob, today()) : null
  async function makePdf() {
    if (!p1.current || !p2.current) return
    setBusy(true)
    try {
      const { pdf, images } = await pagesToPdf([p1.current, p2.current], 'landscape')
      setImgs(images)
      try { await savePdf(pdf, `card-${s.serial_no}-${s.name}.pdf`) } catch { d.toast(tr('اس جگہ فائل محفوظ نہیں ہو سکتی؛ نیچے پیش منظر دیکھیں', 'Saving is blocked here; see the preview below', 'لا يمكن الحفظ هنا'), 'err') }
    } finally { setBusy(false) }
  }
  return (
    <Card title={`${tr('کارڈ', 'Card', 'البطاقة')}: ${s.name}`} actions={<button className="primary" disabled={busy} onClick={makePdf}>{busy ? '…' : tr('PDF بنائیں', 'Make PDF', 'إنشاء PDF')}</button>}>
      <div className="cardscroll">
        <div ref={p1} className="rc-page" dir="rtl">
          <div className="rc-half rc-cover">
            <div className="rc-rays" />
            <div className="rc-logo">{org?.logo ? <img src={org.logo} alt="" /> : <Emblem />}</div>
            <div className="rc-orgname">{org?.name}</div>
            <div className="rc-badge">نتیجۂ امتحان</div>
            <div className="rc-info">
              <div><span>طالب علم / طالبہ کا نام:</span><b>{s.name}</b><span>ولدیت:</span><b>{s.walidiyat}</b></div>
              <div><span>معلم / معلمہ کا نام:</span><b>{teacher?.name ?? ''}</b><span>مکتب (مدرسہ) کا نام:</span><b>{branch?.name}</b></div>
              <div><span>تربیتی نصاب حصہ:</span><b>{label(PARTS, part)}</b><span>عمر:</span><b><Num>{age ? `${age.years}` : ''}</Num>{age ? ' سال ' : ''}<Num>{age ? age.months : ''}</Num>{age ? ' ماہ' : ''}</b></div>
            </div>
          </div>
          <div className="rc-half rc-back">
            <div className="rc-badge wide">ہدایات برائے والد / سرپرست حضرات</div>
            {instructions.length ? <ol className="rc-ins">{instructions.slice(0, 6).map((x, i) => <li key={i}><span className="rc-n"><Num>{i + 1}</Num></span><span>{x}</span></li>)}</ol>
              : <p className="rc-empty">{tr('کارڈ کی چھ ہدایات ترتیبات میں درج کریں۔', 'Enter the six card instructions in Settings.', 'أدخل التعليمات الست في الإعدادات.')}</p>}
          </div>
        </div>
        <div ref={p2} className="rc-page" dir="rtl">
          <ResultPanel title="پنج ماہی نتیجہ" p={five} part={part} />
          <ResultPanel title="سالانہ نتیجہ" p={annual} part={part} />
        </div>
      </div>
      {imgs && <div className="stack"><b>{tr('PDF کے صفحات (تصویر کی شکل میں، تاکہ نستعلیق درست رہے)', 'PDF pages (rasterized so Nastaliq stays correct)', 'صفحات PDF')}</b>{imgs.map((src, i) => <img key={i} className="pdfprev" src={src} alt="" />)}</div>}
    </Card>
  )
}

function Emblem() {
  // neutral emblem (open book) used when the organization has not added its own logo
  return (
    <svg viewBox="0 0 120 120" width="110" height="110" aria-hidden>
      <circle cx="60" cy="60" r="54" fill="#0f6e66" />
      <circle cx="60" cy="60" r="47" fill="none" stroke="#c9973b" strokeWidth="3" />
      <path d="M30 44 Q45 36 60 44 Q75 36 90 44 V82 Q75 74 60 82 Q45 74 30 82 Z" fill="#fff" />
      <path d="M60 44 V82" stroke="#0f6e66" strokeWidth="2.5" />
      <path d="M72 40 V58 L76 54 L80 58 V38" fill="#c9973b" />
    </svg>
  )
}

const TRACK_COLS = [['nazira', 'ناظرہ'], ['hifz', 'حفظ'], ['sanawi', 'سیکنڈری']] as const
const ROW_NAMES: Record<string, string[]> = {
  nazira: ['نورانی قاعدہ / قرآن کریم', 'ایمانیات و عبادات', 'احادیث و مسنون دعائیں', 'سیرت و اخلاق و آداب', 'زبان (عربی، اردو)', 'نمازی ڈائری', 'طالب علم / طالبہ کی حاضری'],
  hifz: ['قرآن کریم', 'تجوید و ایمانیات', 'عبادات', 'احادیث و مسنون دعائیں', 'سیرت و اخلاق و آداب', 'نمازی ڈائری', 'طالب علم / طالبہ کی حاضری'],
  sanawi: ['قرآن کریم', 'ترجمہ و تفسیر', 'ایمانیات و عبادات', 'احادیث و مسنون دعائیں', 'معاشرت و معاملات', 'نمازی ڈائری', 'طالب علم / طالبہ کی حاضری'],
}

function ResultPanel({ title, p, part }: { title: string; p: Panel; part: string }) {
  const blank = !p.exam || !p.es
  const ibt = part === 'ibtidaiya'
  return (
    <div className="rc-half rc-panel">
      <div className="rc-ptitle">{title}</div>
      <table className="rc-table">
        <thead><tr>
          <th className="rc-sn">نمبر<br />شمار</th>
          {TRACK_COLS.map(([k, n]) => <th key={k}>{n} <span className="rc-box">{!blank && p.track === k ? '✓' : ''}</span></th>)}
          <th className="rc-mx">کل<br />نمبرات</th><th className="rc-ob">حاصل کردہ<br />نمبرات</th>
        </tr></thead>
        <tbody>
          {p.rows.map((r, i) => (
            <tr key={i} className={p.track && !blank ? '' : ''}>
              <td className="rc-sn"><Num>{i + 1}</Num></td>
              {TRACK_COLS.map(([k]) => <td key={k} className={!blank && p.track === k ? 'rc-mine' : ''}>{ROW_NAMES[k][i]}</td>)}
              <td className="rc-mx"><Num>{r.na ? '—' : r.max}</Num></td>
              <td className="rc-ob"><Num>{r.na ? '—' : blank || r.marks === null ? '' : r.marks}</Num></td>
            </tr>
          ))}
          <tr className="rc-sum"><td colSpan={4}>کل نمبرات</td><td className="rc-mx"><Num>{ibt ? 190 : 200}</Num></td><td className="rc-ob"><Num>{blank ? '' : p.total}</Num></td></tr>
        </tbody>
      </table>
      <div className="rc-lines">
        <div><span>تاریخِ امتحان:</span><b><Num>{blank ? '' : fmtDate(p.exam!.date)}</Num></b><span>درجۂ کامیابی:</span><b>{blank ? '' : gradeName(p.es!.grade)}</b></div>
        <div><span>عملی کیفیت:</span>{['behtar', 'munasib', 'qabil-e-tawajjuh'].map((k) => <span key={k} className={`rc-chip ${!blank && p.es!.practical === k ? 'on' : ''}`}>{practicalName(k)}</span>)}</div>
        <div><span>کل ایامِ تعلیم:</span><b><Num>{blank || !p.days ? '' : p.days.teaching}</Num></b><span>حاضری:</span><b><Num>{blank || !p.days ? '' : p.days.present}</Num></b><span>غیر حاضری:</span><b><Num>{blank || !p.days ? '' : p.days.absent}</Num></b></div>
      </div>
      <div className="rc-sign"><span>دستخط معلم / معلمہ</span><span>دستخط مقامی ذمہ دار / ناظم</span><span>دستخط سرپرست</span></div>
    </div>
  )
}
