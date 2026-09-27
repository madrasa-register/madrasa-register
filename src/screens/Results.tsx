import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { all, get, today, type Row } from '../db/db'
import { myClasses, classPeriodStats } from '../db/repo'
import { yearOn } from '../db/calendarRepo'
import { examSheet } from '../db/examRepo'
import { teacherPrize } from '../engine/grading'
import { tr, useQuery, Card, Empty, Num, Badge, Select, useDialog, fmtDate } from '../ui'
import { kindName, gradeName, practicalName } from './Exams'
import { pagesToPdf, savePdf } from '../pdf'

// ============ Result sheet, public sheet, ceremony list (§8.1, §8.3) ============
export function ExamResults() {
  const { id = '' } = useParams()
  const d = useDialog()
  const [view, setView] = useState<'sheet' | 'public' | 'ceremony'>('sheet')
  const [preview, setPreview] = useState<string[] | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const data = useQuery(async () => {
    const exam = await get('exam', id)
    if (!exam) return null
    const cls = await get('class', exam.class_id)
    const branch = cls ? await get('branch', cls.branch_id) : null
    const sheet = (await examSheet(exam)).sort((a, b) => (a.es?.position ?? 999) - (b.es?.position ?? 999) || (b.es?.total ?? 0) - (a.es?.total ?? 0))
    return { exam, cls, branch, sheet }
  }, [id])
  if (!data) return null
  const { exam, cls, branch, sheet } = data
  const final = !!exam.finalized_at
  async function pdf() {
    if (!ref.current) return
    const { pdf, images } = await pagesToPdf([ref.current], 'portrait')
    setPreview(images)
    try { await savePdf(pdf, `result-${cls?.name}-${exam.date}.pdf`) } catch { d.toast(tr('اس جگہ فائل محفوظ نہیں ہو سکتی؛ نیچے پیش منظر دیکھیں', 'Saving is blocked here; see the preview below', 'لا يمكن الحفظ هنا'), 'err') }
  }
  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>{tr('نتیجہ', 'Results', 'النتيجة')} · {kindName(exam.kind)} · {cls?.name}</h1>
        <div className="row wrap">
          <Link className="btn ghost" to={`/exams/${exam.id}`}>{tr('امتحان', 'Exam', 'الامتحان')}</Link>
          <Select value={view} onChange={(v) => setView(v as any)} options={[
            { v: 'sheet', t: tr('جماعت کا نتیجہ', 'Class result sheet', 'كشف نتيجة الفصل') },
            { v: 'public', t: tr('عوامی نتیجہ (مسجد / مکتب)', 'Public result sheet', 'النتيجة العامة') },
            { v: 'ceremony', t: tr('تقریب کی فہرست (اول، دوم، سوم)', 'Ceremony list (1st–3rd)', 'قائمة الحفل') },
          ]} />
          <button className="primary" onClick={pdf}>PDF</button>
        </div>
      </div>
      {!final && <div className="banner warn">{tr('نتیجہ ابھی حتمی نہیں؛ پوزیشن حتمی کرنے کے بعد بنے گی۔', 'Not final yet; positions appear after finalizing.', 'لم تُعتمد بعد؛ تظهر المراكز بعد الاعتماد.')}</div>}
      <div ref={ref} className="printpage">
        <div className="pp-head"><b>{branch?.name}</b> · {kindName(exam.kind)} · {cls?.name} · <Num>{fmtDate(exam.date)}</Num></div>
        {view === 'sheet' && (
          <table className="tbl">
            <thead><tr><th>{tr('پوزیشن', 'Position', 'المركز')}</th><th>{tr('نام', 'Name')}</th><th>{tr('ولدیت', 'Father')}</th><th>{tr('نمبر', 'Marks')}</th><th>%</th><th>{tr('درجۂ کامیابی', 'Grade', 'التقدير')}</th><th>{tr('عملی کیفیت', 'Practical', 'العملية')}</th><th>{tr('کیفیت', 'Remark', 'ملاحظة')}</th></tr></thead>
            <tbody>{sheet.map(({ student: s, es }) => (
              <tr key={s.id}>
                <td><Num>{es?.absent ? '—' : es?.position ?? '—'}</Num></td><td>{s.name}</td><td>{s.walidiyat}</td>
                <td><Num>{es?.absent ? tr('غیر حاضر', 'Absent') : `${es?.total ?? '—'}/${es?.max ?? '—'}`}</Num></td><td><Num>{es?.absent ? '' : es?.percent ?? ''}</Num></td>
                <td>{es?.absent ? '' : gradeName(es?.grade)}{es?.hold_promotion ? ` · ${tr('ترقی روکیں', 'Hold promotion')}` : ''}</td>
                <td>{practicalName(es?.practical)}</td><td>{es?.remark}{es?.grace ? ` (${tr('رعایتی', 'grace', 'تسامح')} ${es.grace})` : ''}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {view === 'public' && (
          <table className="tbl big">
            <thead><tr><th>{tr('پوزیشن', 'Position', 'المركز')}</th><th>{tr('نام', 'Name')}</th><th>{tr('ولدیت', 'Father')}</th><th>{tr('درجۂ کامیابی', 'Grade', 'التقدير')}</th></tr></thead>
            <tbody>{sheet.filter((r) => r.es && !r.es.absent).map(({ student: s, es }) => (
              <tr key={s.id}><td><Num>{es?.position ?? ''}</Num></td><td>{s.name}</td><td>{s.walidiyat}</td><td>{gradeName(es?.grade)}</td></tr>
            ))}</tbody>
          </table>
        )}
        {view === 'ceremony' && (
          <div className="stack">
            {exam.kind !== 'annual' && <p className="hint">{tr('شیلڈ سالانہ امتحان میں اول، دوم، سوم کو دی جاتی ہے (کتاب ص 83)۔', 'Shields go to annual 1st, 2nd and 3rd (Book p. 83).', 'الدروع للأوائل في الامتحان السنوي.')}</p>}
            {[1, 2, 3].map((p) => {
              const who = sheet.filter((r) => r.es?.position === p)
              return <div key={p} className="podium"><b>{[tr('اول', '1st', 'الأول'), tr('دوم', '2nd', 'الثاني'), tr('سوم', '3rd', 'الثالث')][p - 1]}</b> {who.length ? who.map((r) => `${r.student.name} (${r.es?.total})`).join('، ') : '—'}</div>
            })}
          </div>
        )}
        <div className="pp-foot"><span>{tr('ممتحن', 'Examiner')}: {exam.signed_by ?? exam.examiner_name}</span><span>{tr('جماعت کی کیفیت', 'Class remark', 'ملاحظة الفصل')}: {exam.class_remark ?? ''}</span></div>
      </div>
      <p className="hint">{tr('پوزیشن نتیجہ کارڈ پر نہیں چھپتی؛ صرف اس فہرست اور تقریب کی فہرست میں ہوتی ہے۔ اصل فارم مکتب میں رہے، PDF مقامی معاون کو بھیجیں (کتاب ص 70)۔', 'Position is not printed on the result card, only here and on the ceremony list. The original stays with the maktab; send the PDF to the local mu‘awin (Book p. 70).', 'لا يُطبع المركز على البطاقة.')}</p>
      {preview && <Card title={tr('PDF پیش منظر', 'PDF preview', 'معاينة PDF')}>{preview.map((src, i) => <img key={i} src={src} className="pdfprev" alt="" />)}</Card>}
    </div>
  )
}

// ============ Prizes and follow-up lists (§8.3) ============
export function Prizes() {
  const data = useQuery(async () => {
    const y = await yearOn(today())
    const classes = await myClasses()
    const st = await (await import('../db/repo')).loadSettings()
    const share = Number(st['prizes.teacherShare'] ?? 95)
    const out: any[] = []
    for (const c of classes) {
      const exams = await all<Row>(`select * from exam where class_id = ? and finalized_at is not null order by date desc`, [c.id])
      const main = exams.find((e) => e.kind === 'annual') ?? exams.find((e) => e.kind === 'five') ?? null
      const rows = main ? await all<Row>(`select es.*, s.name, s.walidiyat from exam_student es join student s on s.id = es.student_id where es.exam_id = ? and es.absent = 0`, [main.id]) : []
      const att = y ? await classPeriodStats(c.id, y.start_date, today(), st) : []
      const perfect = att.filter((a) => a.perfect)
      const perfectIds = new Set(perfect.map((p) => p.student.id))
      const monthly = exams.filter((e) => e.kind === 'monthly').slice(0, 2)
      const weakMap = new Map<string, { name: string; grades: string[] }>()
      for (const m of monthly) {
        const ws = await all<Row>(`select es.grade, s.id, s.name from exam_student es join student s on s.id = es.student_id where es.exam_id = ? and es.grade in ('rasib','maqbool')`, [m.id])
        for (const w of ws) { const cur = weakMap.get(w.id) ?? { name: w.name as string, grades: [] as string[] }; cur.grades.push(w.grade); weakMap.set(w.id, cur) }
      }
      out.push({
        c, main, perfect, top: rows.filter((r) => r.position && r.position <= 3).sort((a, b) => a.position - b.position),
        namaz: rows.filter((r) => r.namazi === 10), conduct: rows.filter((r) => r.practical === 'behtar'),
        teacher: teacherPrize(rows.map((r) => ({ grade: r.grade, perfect: perfectIds.has(r.student_id) })), share),
        weak: [...weakMap.values()],
      })
    }
    return { y, out, share }
  }, [])
  if (!data) return null
  const list = (rows: any[]) => (rows.length ? rows.map((r) => r.name).join('، ') : '—')
  return (
    <div className="stack">
      <h1>{tr('انعامات اور توجہ طلب طلبہ', 'Prizes and follow-up lists', 'الجوائز وقوائم المتابعة')}</h1>
      <p className="hint">{tr('کتاب ص 83: مکمل حاضری، نماز کی پابندی، اچھا کردار؛ سالانہ اول، دوم، سوم کو شیلڈ۔ معلم کا انعام جب جماعت کے 95% طلبہ ممتاز یا صاحبِ ترتیب ہوں۔', 'Book p. 83: full attendance, regular prayer, good conduct; shields for annual 1st–3rd. Teacher prize when 95% of the class is ممتاز or صاحبِ ترتیب.', 'الكتاب ص 83.')}</p>
      {data.out.length === 0 && <Empty>{tr('کوئی جماعت نہیں', 'No classes', 'لا فصول')}</Empty>}
      {data.out.map(({ c, main, perfect, top, namaz, conduct, teacher, weak }: any) => (
        <Card key={c.id} title={c.name} actions={main ? <Badge kind="muted">{kindName(main.kind)} <Num>{fmtDate(main.date)}</Num></Badge> : <Badge kind="warn">{tr('کوئی حتمی امتحان نہیں', 'No finalized exam', 'لا امتحان معتمد')}</Badge>}>
          <table className="tbl"><tbody>
            <tr><td>{tr('شیلڈ (اول، دوم، سوم)', 'Shields (1st–3rd)', 'الدروع')}</td><td className="wrapcell">{top.length ? top.map((t: any) => `${t.position}. ${t.name}`).join('، ') : '—'}</td></tr>
            <tr><td>{tr('مکمل حاضری (صاحبِ ترتیب، سال بھر)', 'Full attendance (whole year)', 'المواظبة التامة')}</td><td className="wrapcell">{list(perfect.map((p: any) => p.student))}</td></tr>
            <tr><td>{tr('نماز کی پابندی', 'Regular prayer', 'المحافظة على الصلاة')}</td><td className="wrapcell">{list(namaz)}</td></tr>
            <tr><td>{tr('اچھا کردار (عملی کیفیت: بہتر)', 'Good conduct (practical: good)', 'حسن السلوك')}</td><td className="wrapcell">{list(conduct)}</td></tr>
            <tr><td>{tr('بروقت آمد', 'Punctuality', 'الانضباط في الحضور')}</td><td className="muted">{tr('طلبہ کی آمد کا وقت ابھی درج نہیں ہوتا', "Students' arrival times are not recorded yet", 'لا تُسجَّل أوقات الوصول')}</td></tr>
            <tr><td>{tr('معلم کا انعام', 'Teacher prize', 'جائزة المعلم')}</td><td>{teacher.eligible ? <Badge kind="ok">{tr('حقدار', 'Eligible', 'مستحق')}</Badge> : <Badge kind="muted">{tr('نہیں', 'No', 'لا')}</Badge>} <Num>{Math.floor(teacher.percent)}%</Num></td></tr>
            <tr><td>{tr('کمزور طلبہ — والدین سے انفرادی ملاقات (امتحان سے ایک ماہ پہلے)', 'Weak students — individual parent meeting (a month before the exam)', 'الطلاب الضعاف')}</td><td className="wrapcell">{weak.length ? weak.map((w: any) => `${w.name} (${w.grades.map((g: string) => gradeName(g)).join('، ')})`).join(' · ') : '—'}</td></tr>
          </tbody></table>
        </Card>
      ))}
    </div>
  )
}
