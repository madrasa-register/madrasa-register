import { DateInput } from '../DateInput'
import { useState } from 'react'
import { all, get, insert, session, today, type Row } from '../db/db'
import { myClasses, findFamiliesByPhone, loadSettings, waNumber, logMessage } from '../db/repo'
import { yearOn } from '../db/calendarRepo'
import { studentLedger, recordPayment, reversePayment, setFeePlan } from '../db/hadiyaRepo'
import { autoAllocate, ADMISSION_ITEMS, type Allocation } from '../engine/hadiya'
import { tr, useQuery, Card, Empty, Num, Badge, Field, Select, useDialog, useAskReason, fmtDate } from '../ui'
import { gregMonth } from './calendarMeta'

const mLabel = (m: string) => `${gregMonth(+m.slice(5, 7))} ${m.slice(2, 4)}`
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString('en-US')}`

export function Hadiya() {
  const [tab, setTab] = useState<'chart' | 'pay' | 'fees' | 'receipts' | 'fund'>('chart')
  const st = useQuery(() => loadSettings(), [])
  const headOnly = session.role === 'admin' && !(st?.['hadiya.shareWithHeadOffice'])
  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>{tr('فیس', 'Fees', 'الرسوم')}</h1>
        {!headOnly && <div className="row wrap">
          {([['chart', tr('ماہانہ چارٹ', 'Monthly chart', 'الجدول الشهري')], ['pay', tr('وصولی', 'Receive payment', 'استلام')], ['fees', tr('فیس کی مقدار', 'Fee amounts', 'مقدار الرسوم')], ['receipts', tr('رسیدیں', 'Receipts', 'الإيصالات')], ['fund', tr('مٹھی فنڈ', 'Mutthi fund', 'صندوق القبضة')]] as const).map(([k, t]) => (
            <button key={k} className={tab === k ? 'primary' : 'ghost'} onClick={() => setTab(k)}>{t}</button>
          ))}
        </div>}
      </div>
      {headOnly ? <HeadOfficeTotals /> : tab === 'chart' ? <Chart /> : tab === 'pay' ? <Payment /> : tab === 'fees' ? <Fees /> : tab === 'receipts' ? <Receipts /> : <Fund />}
    </div>
  )
}

function useClassPicker() {
  const classes = useQuery(() => myClasses(), [])
  const [classId, setClassId] = useState('')
  if (classes?.length && !classId) setTimeout(() => setClassId(classes[0].id))
  return { classes, classId, setClassId }
}
async function yearMonths() {
  const y = await yearOn(today())
  const from = (y?.start_date ?? today()).slice(0, 7)
  return { from, to: today().slice(0, 7) }
}

function Chart() {
  const { classes, classId, setClassId } = useClassPicker()
  const data = useQuery(async () => {
    if (!classId) return null
    const studs = await all<Row>(`select distinct s.* from enrollment e join student s on s.id = e.student_id where e.class_id = ? order by s.serial_no`, [classId])
    const { from, to } = await yearMonths()
    return studentLedger(studs, from, to)
  }, [classId])
  return (
    <>
      <Select value={classId} onChange={setClassId} options={(classes ?? []).map((c) => ({ v: c.id, t: c.name }))} />
      {data && (
        <div className="table-wrap"><table className="register">
          <thead><tr><th className="sticky-col">{tr('نام', 'Name')}</th>{data.months.map((m) => <th key={m}>{mLabel(m)}</th>)}<th>{tr('واجب', 'Due', 'المستحق')}</th><th>{tr('ادا', 'Paid', 'المدفوع')}</th><th>{tr('باقی', 'Balance', 'المتبقي')}</th></tr></thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.s.id} className={r.s.status === 'left' ? 'left-row' : ''}>
                <td className="sticky-col">{r.s.name}</td>
                {r.cells.map((c) => <td key={c.month} className={`hc ${c.status}`} title={`${rs(c.paid)} / ${rs(c.due)}`}><Num>{c.status === 'paid' ? '✓' : c.status === 'partial' ? c.paid : c.status === 'exempt' ? tr('معاف', 'Exempt', 'معفى') : c.status === 'unpaid' ? '·' : ''}</Num></td>)}
                <td><Num>{rs(r.due)}</Num></td><td><Num>{rs(r.paid)}</Num></td><td><Num>{r.balance > 0 ? rs(r.balance) : '—'}</Num></td>
              </tr>
            ))}
            <tr className="rc-sum"><td className="sticky-col">{tr('میزان', 'Total', 'المجموع')}</td>{data.months.map((m) => <td key={m} />)}<td><Num>{rs(data.rows.reduce((a, r) => a + r.due, 0))}</Num></td><td><Num>{rs(data.rows.reduce((a, r) => a + r.paid, 0))}</Num></td><td><Num>{rs(data.rows.reduce((a, r) => a + Math.max(0, r.balance), 0))}</Num></td></tr>
          </tbody>
        </table></div>
      )}
      <p className="hint">✓ {tr('ادا', 'paid')} · {tr('عدد = جزوی ادائیگی', 'number = part paid', 'رقم = دفعة جزئية')} · · {tr('باقی', 'unpaid')}</p>
    </>
  )
}

function Payment() {
  const d = useDialog()
  const [q, setQ] = useState('')
  const [fam, setFam] = useState<Row | null>(null)
  const [amount, setAmount] = useState('')
  const [kind, setKind] = useState<'fee' | 'admission'>('fee')
  const [items, setItems] = useState<Record<string, string>>({})
  const [payer, setPayer] = useState('')
  const [sponsor, setSponsor] = useState(false)
  const [collector, setCollector] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [done, setDone] = useState<{ receipt: number; amount: number; allocs: Allocation[]; fam: Row } | null>(null)
  const me = useQuery(() => get('app_user', session.userId), [])
  const matches = useQuery(async () => {
    if (q.trim().length < 2) return []
    const byPhone = await findFamiliesByPhone(q)
    const byName = await all<Row>(`select distinct f.* from family f left join student s on s.family_id = f.id where f.organization_id = ? and (f.guardian_name like ? or s.name like ?) limit 10`, [session.orgId, `%${q}%`, `%${q}%`])
    const m = new Map([...byPhone, ...byName].map((f) => [f.id, f]))
    return [...m.values()]
  }, [q])
  const data = useQuery(async () => {
    if (!fam) return null
    const kids = await all<Row>(`select * from student where family_id = ? and status = 'active' order by serial_no`, [fam.id])
    const { from, to } = await yearMonths()
    return studentLedger(kids, from, addMonth(to, 3))
  }, [fam?.id])
  const due = data ? data.rows.flatMap((r) => r.cells.filter((c) => c.due > c.paid).map((c) => ({ student_id: r.s.id, month: c.month, outstanding: c.due - c.paid }))) : []
  const allocs: Allocation[] = kind === 'fee' ? autoAllocate(Number(amount) || 0, due)
    : Object.entries(items).filter(([, v]) => Number(v) > 0).map(([k, v]) => ({ student_id: data?.rows[0]?.s.id ?? '', month: today().slice(0, 7), amount: Number(v), kind: `admission:${k}` }))
  const total = allocs.reduce((a, x) => a + x.amount, 0)
  async function save() {
    if (!fam || !total) return
    const r = await recordPayment({ familyId: fam.id, payer: payer || fam.guardian_name, sponsor, date, collector: collector || me?.name || '', note, kind, allocations: allocs, branchId: fam.branch_id })
    setDone({ receipt: r.receipt, amount: r.amount, allocs, fam }); setAmount(''); setItems({})
    d.toast(tr(`رسید نمبر ${r.receipt} محفوظ`, `Receipt ${r.receipt} saved`, `حُفظ الإيصال ${r.receipt}`))
  }
  if (done) return <Receipt r={done} names={new Map((data?.rows ?? []).map((x) => [x.s.id, x.s.name]))} onClose={() => setDone(null)} />
  return (
    <div className="stack">
      <Field label={tr('خاندان تلاش کریں (فون، سرپرست یا بچے کا نام)', 'Find family (phone, guardian or child name)', 'ابحث عن الأسرة')}><input value={q} onChange={(e) => { setQ(e.target.value); setFam(null) }} /></Field>
      {!fam && matches?.map((f) => <button key={f.id} className="list-item" onClick={() => { setFam(f); setPayer(f.guardian_name) }}><strong>{f.guardian_name}</strong><span className="muted"><Num>{f.phone1}</Num></span></button>)}
      {fam && data && (
        <>
          <Card title={`${fam.guardian_name} · ${tr('بچے', 'Children')}: ${data.rows.map((r) => r.s.name).join('، ')}`}>
            <div className="muted">{tr('باقی', 'Outstanding', 'المتبقي')}: <Num>{rs(data.rows.reduce((a, r) => a + Math.max(0, r.balance), 0))}</Num> ({tr('اس ماہ تک', 'up to this month', 'حتى هذا الشهر')})</div>
            <div className="row wrap">
              <button className={kind === 'fee' ? 'primary' : 'ghost'} onClick={() => setKind('fee')}>{tr('ماہانہ فیس', 'Monthly fee', 'الرسوم الشهرية')}</button>
              <button className={kind === 'admission' ? 'primary' : 'ghost'} onClick={() => setKind('admission')}>{tr('داخلہ (ایک بار)', 'Admission (one-off)', 'القبول (مرة واحدة)')}</button>
            </div>
            {kind === 'fee' ? (
              <>
                <Field label={tr('رقم', 'Amount', 'المبلغ')} hint={tr('ایک ادائیگی کئی مہینوں اور بہن بھائیوں میں خود تقسیم ہوتی ہے (پرانے مہینے پہلے)', 'One payment is spread over months and siblings automatically (oldest first)', 'تُوزَّع تلقائياً')}><input type="number" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
                <div className="row wrap">{[500, 1000, 1500, 3000, 6000].map((v) => <button key={v} className="ghost sm" onClick={() => setAmount(String(v))}><Num>{v}</Num></button>)}</div>
              </>
            ) : (
              <div className="grid2">{ADMISSION_ITEMS.map((it) => <Field key={it.key} label={tr(it.ur, it.en, it.ar)}><input type="number" dir="ltr" value={items[it.key] ?? ''} onChange={(e) => setItems({ ...items, [it.key]: e.target.value })} /></Field>)}</div>
            )}
            {allocs.length > 0 && <table className="tbl"><tbody>{allocs.map((a, i) => <tr key={i}><td>{data.rows.find((r) => r.s.id === a.student_id)?.s.name}</td><td>{a.kind?.startsWith('admission') ? tr(ADMISSION_ITEMS.find((x) => `admission:${x.key}` === a.kind)!.ur, a.kind!) : mLabel(a.month)}</td><td><Num>{rs(a.amount)}</Num></td></tr>)}</tbody></table>}
            {kind === 'fee' && Number(amount) > total && <Badge kind="warn">{tr('رقم باقی واجبات سے زیادہ ہے؛ اگلے مہینوں کے لیے مقدار مقرر کریں', 'Amount exceeds what is due; set fee amounts for coming months first', 'المبلغ أكبر من المستحق')}</Badge>}
          </Card>
          <div className="grid2">
            <Field label={tr('ادا کرنے والا', 'Paid by', 'الدافع')}><input value={payer} onChange={(e) => setPayer(e.target.value)} /></Field>
            <Field label={tr('وصول کنندہ (معلم، ناظم یا مہتمم)', 'Collected by (teacher, nazim or muhtamim)', 'المستلم')}><input value={collector} placeholder={me?.name} onChange={(e) => setCollector(e.target.value)} /></Field>
            <Field label={tr('تاریخ', 'Date')}><DateInput value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label={tr('نوٹ', 'Note')}><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>
          <label className="check"><input type="checkbox" checked={sponsor} onChange={(e) => setSponsor(e.target.checked)} />{tr('اہلِ خیر (کفیل) کی طرف سے', 'Paid by a sponsor (ahl-e-khair)', 'من كفيل')}</label>
          <div className="row end"><button className="primary" disabled={!total} onClick={save}>{tr(`وصول کریں · ${rs(total)}`, `Receive · ${rs(total)}`, `استلام · ${rs(total)}`)}</button></div>
        </>
      )}
    </div>
  )
}
const addMonth = (m: string, n: number) => { let [y, mo] = m.split('-').map(Number); mo += n; while (mo > 12) { mo -= 12; y++ } return `${y}-${String(mo).padStart(2, '0')}` }

function Receipt({ r, names, onClose }: { r: { receipt: number; amount: number; allocs: Allocation[]; fam: Row }; names: Map<string, string>; onClose: () => void }) {
  const st = useQuery(() => loadSettings(), [])
  const text = `رسید نمبر ${r.receipt}\n${r.fam.guardian_name}\n${r.allocs.map((a) => `${names.get(a.student_id) ?? ''}: ${a.kind?.startsWith('admission') ? 'داخلہ' : a.month} — ${a.amount}`).join('\n')}\nکل: ${r.amount} روپے · ${fmtDate(today())}\nجزاک اللہ خیراً`
  return (
    <Card title={tr(`رسید نمبر ${r.receipt}`, `Receipt no. ${r.receipt}`, `إيصال رقم ${r.receipt}`)}>
      <div className="pre receipt">{text}</div>
      <div className="row wrap">
        <a className="btn ghost" target="_blank" rel="noreferrer" href={`https://wa.me/${waNumber(r.fam.phone1, String(st?.['phone.countryCode'] ?? '92'))}?text=${encodeURIComponent(text)}`} onClick={() => logMessage(r.fam.id, null, 'whatsapp', 'receipt', text)}>WhatsApp</a>
        <button className="ghost" onClick={() => { navigator.clipboard?.writeText(text).catch(() => {}) }}>{tr('کاپی', 'Copy', 'نسخ')}</button>
        <button className="primary" onClick={onClose}>{tr('نئی وصولی', 'New payment', 'دفعة جديدة')}</button>
      </div>
    </Card>
  )
}

function Fees() {
  const d = useDialog()
  const ask = useAskReason()
  const { classes, classId, setClassId } = useClassPicker()
  const st = useQuery(() => loadSettings(), [])
  const data = useQuery(async () => {
    if (!classId) return null
    const studs = await all<Row>(`select distinct s.* from enrollment e join student s on s.id = e.student_id where e.class_id = ? and (e.to_date is null or e.to_date = '') order by s.serial_no`, [classId])
    const plans = await all<Row>(`select * from fee_plan where student_id in (select student_id from enrollment where class_id = ?) order by from_month desc, created_at desc`, [classId])
    return { studs, plans }
  }, [classId])
  const [edit, setEdit] = useState<{ s: Row; amount: string; from: string; exempt: boolean; sponsor: string } | null>(null)
  const def = Number(st?.['hadiya.defaultAmount'] ?? 500)
  return (
    <>
      <Select value={classId} onChange={setClassId} options={(classes ?? []).map((c) => ({ v: c.id, t: c.name }))} />
      {data && <div className="table-wrap"><table className="tbl">
        <thead><tr><th>{tr('نام', 'Name')}</th><th>{tr('ماہانہ فیس', 'Monthly fee', 'الرسوم الشهرية')}</th><th>{tr('کب سے', 'From', 'من')}</th><th>{tr('کیفیت', 'Status')}</th><th /></tr></thead>
        <tbody>{data.studs.map((s) => {
          const p = data.plans.find((x) => x.student_id === s.id)
          return <tr key={s.id}><td>{s.name}</td><td><Num>{rs(p?.amount ?? def)}</Num></td><td><Num>{p ? mLabel(p.from_month) : '—'}</Num></td>
            <td>{p?.exempt ? <Badge kind="muted">{tr('معاف', 'Exempt', 'معفى')}</Badge> : null}{p?.sponsor ? <Badge kind="ok">{tr('کفیل', 'Sponsor', 'كفيل')}: {p.sponsor}</Badge> : null}</td>
            <td><button className="ghost sm" onClick={() => setEdit({ s, amount: String(p?.amount ?? def), from: today().slice(0, 7), exempt: !!p?.exempt, sponsor: p?.sponsor ?? '' })}>{tr('تبدیل', 'Change', 'تغيير')}</button></td></tr>
        })}</tbody>
      </table></div>}
      {edit && (
        <div className="overlay" onClick={() => setEdit(null)}><div className="dialog" onClick={(e) => e.stopPropagation()}>
          <h3>{edit.s.name}</h3>
          <Field label={tr('ماہانہ فیس', 'Monthly fee', 'الرسوم الشهرية')}><input type="number" dir="ltr" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} /></Field>
          <Field label={tr('کس مہینے سے', 'From month', 'من شهر')}><input type="month" value={edit.from} onChange={(e) => setEdit({ ...edit, from: e.target.value })} /></Field>
          <label className="check"><input type="checkbox" checked={edit.exempt} onChange={(e) => setEdit({ ...edit, exempt: e.target.checked })} />{tr('معاف (ادائیگی کی استطاعت نہیں)', 'Exempt (cannot pay)', 'معفى')}</label>
          <Field label={tr('کفیل (اہلِ خیر) کا نام', 'Sponsor name (ahl-e-khair)', 'اسم الكفيل')}><input value={edit.sponsor} onChange={(e) => setEdit({ ...edit, sponsor: e.target.value })} /></Field>
          <div className="row end"><button className="ghost" onClick={() => setEdit(null)}>{tr('منسوخ', 'Cancel')}</button>
            <button className="primary" onClick={async () => { const r = await ask(tr('تبدیلی کی وجہ', 'Reason for the change')); if (!r) return; await setFeePlan(edit.s.id, edit.s.branch_id, edit.from, Number(edit.amount) || 0, edit.exempt, edit.sponsor, r); setEdit(null); d.toast(tr('محفوظ', 'Saved')) }}>{tr('محفوظ کریں', 'Save')}</button></div>
        </div></div>
      )}
    </>
  )
}

function Receipts() {
  const ask = useAskReason()
  const rows = useQuery(() => all<Row>(`select p.*, f.guardian_name from payment p left join family f on f.id = p.family_id where p.organization_id = ? and (? is null or p.branch_id = ?) order by p.receipt_no desc limit 200`, [session.orgId, session.branchId, session.branchId]), [])
  if (!rows?.length) return <Empty>{tr('ابھی کوئی رسید نہیں', 'No receipts yet', 'لا إيصالات')}</Empty>
  return (
    <div className="table-wrap"><table className="tbl">
      <thead><tr><th>#</th><th>{tr('تاریخ', 'Date')}</th><th>{tr('خاندان', 'Family')}</th><th>{tr('رقم', 'Amount', 'المبلغ')}</th><th>{tr('وصول کنندہ', 'Collector', 'المستلم')}</th><th>{tr('نوٹ', 'Note')}</th><th /></tr></thead>
      <tbody>{rows.map((p) => <tr key={p.id} className={p.amount < 0 ? 'warn-row' : ''}>
        <td><Num>{p.receipt_no}</Num></td><td><Num>{fmtDate(p.date)}</Num></td><td>{p.guardian_name}{p.sponsor ? ` · ${tr('کفیل', 'sponsor')}` : ''}</td><td><Num>{rs(p.amount)}</Num></td><td>{p.collector}</td><td>{p.kind === 'admission' ? tr('داخلہ', 'Admission') + ' · ' : ''}{p.note}</td>
        <td>{p.amount > 0 && <button className="ghost sm" onClick={async () => { const r = await ask(tr('رسید واپس کرنے کی وجہ (اصل رسید محفوظ رہے گی)', 'Reason to reverse (the original stays)', 'سبب العكس')); if (r) await reversePayment(p.id, r) }}>{tr('واپسی', 'Reverse', 'عكس')}</button>}</td>
      </tr>)}</tbody>
    </table></div>
  )
}

function Fund() {
  const d = useDialog()
  const rows = useQuery(() => all<Row>(`select * from fund_entry where organization_id = ? and (? is null or branch_id = ?) order by date desc`, [session.orgId, session.branchId, session.branchId]), [])
  const [f, setF] = useState({ amount: '', date: today(), note: '' })
  const total = (rows ?? []).reduce((a, r) => a + r.amount, 0)
  return (
    <div className="stack">
      <div className="row wrap">
        <input type="number" dir="ltr" placeholder={tr('رقم', 'Amount', 'المبلغ')} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        <DateInput value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <input placeholder={tr('نوٹ', 'Note')} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <button className="primary" disabled={!Number(f.amount)} onClick={async () => { await insert('fund_entry', { kind: 'mutthi', amount: Number(f.amount), date: f.date, note: f.note }); setF({ amount: '', date: today(), note: '' }); d.toast(tr('محفوظ', 'Saved')) }}>{tr('درج کریں', 'Add', 'إضافة')}</button>
      </div>
      <b>{tr('کل', 'Total', 'المجموع')}: <Num>{rs(total)}</Num></b>
      <table className="tbl"><tbody>{rows?.map((r) => <tr key={r.id}><td><Num>{fmtDate(r.date)}</Num></td><td><Num>{rs(r.amount)}</Num></td><td>{r.note}</td></tr>)}</tbody></table>
    </div>
  )
}

function HeadOfficeTotals() {
  const rows = useQuery(() => all<Row>(`select b.name, sum(p.amount) total, count(p.id) n from payment p join branch b on b.id = p.branch_id where p.organization_id = ? group by b.id`, [session.orgId]), [])
  return (
    <Card title={tr('مکاتب کے کل (تفصیل مکتب کی اجازت سے)', 'Branch totals (details only if the branch allows)', 'مجاميع المكاتب')}>
      {rows?.length ? <table className="tbl"><tbody>{rows.map((r, i) => <tr key={i}><td>{r.name}</td><td><Num>{rs(r.total ?? 0)}</Num></td><td><Num>{r.n}</Num> {tr('رسیدیں', 'receipts', 'إيصالات')}</td></tr>)}</tbody></table> : <Empty>{tr('ابھی کچھ نہیں', 'Nothing yet', 'لا شيء')}</Empty>}
      <p className="hint">{tr('تفصیل دیکھنے کے لیے مکتب اپنی ترتیبات میں «ہیڈ آفس کو فیس کی تفصیل دکھائیں» آن کرے۔', 'To see details, the branch turns on “Show fee details to head office” in its Settings.', 'لعرض التفاصيل يفعّل الفرع «إظهار تفاصيل الرسوم للمكتب الرئيسي» في إعداداته.')}</p>
    </Card>
  )
}
