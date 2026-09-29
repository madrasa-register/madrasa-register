import { DateInput } from '../DateInput'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { all, one, session, today, type Row } from '../db/db'
import { loadSettings } from '../db/repo'
import { planForYear, saveYearConfig, saveHijriOverride, loadHijriCtx } from '../db/calendarRepo'
import { generatePlan, suggestStart, startFromShawwal, type Plan, type DayType, type YearConfig, type Range, type Pin, type ExamCfg, type Move } from '../engine/calendar'
import { addDaysIso, diffDays, fromHijri, monthStarts, monthLengthIssues, suggestIslamicHolidays, toHijri } from '../engine/hijri'
import { tr, useQuery, Card, Empty, Num, Badge, Field, Select, useDialog, useAskReason, fmtDate, WEEKDAYS_UR, WEEKDAYS_EN, WEEKDAYS_AR, lang } from '../ui'
import { dayName, dayShort, hijriText, hijriMonth, gregMonth, TOTALS_ORDER } from './calendarMeta'

const wd = (iso: string) => new Date(iso + 'T00:00:00Z').getUTCDay()
const wdNames = () => (lang === 'ur' ? WEEKDAYS_UR : lang === 'ar' ? WEEKDAYS_AR : WEEKDAYS_EN)
const dm = (iso: string) => `${+iso.slice(8, 10)} ${gregMonth(+iso.slice(5, 7))}`

function useYears() {
  return useQuery(() => all<Row>('select * from academic_year where organization_id = ? order by start_date desc', [session.orgId]), [])
}

// ============ Calendar screen ============
export function CalendarScreen() {
  const d = useDialog()
  const years = useYears()
  const [yearId, setYearId] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const current = years?.find((y) => y.id === yearId) ?? years?.find((y) => y.start_date <= today() && !y.label.includes('نمونہ')) ?? years?.[0]
  const data = useQuery(async () => (current ? planForYear(current, session.branchId) : null), [current?.id, current?.updated_at, session.branchId])
  const canEdit = session.role === 'admin'
  const org = useQuery(() => one<Row>('select * from organization where id = ?', [session.orgId]), [])
  const st = useQuery(() => loadSettings(), [])

  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>{tr('تعلیمی کیلنڈر', 'Academic calendar')}</h1>
        <div className="row wrap">
          <Select value={current?.id ?? ''} onChange={setYearId} options={(years ?? []).map((y) => ({ v: y.id, t: y.label }))} />
          {canEdit && current && <Link className="btn ghost" to={`/calendar/settings/${current.id}`}>{tr('کیلنڈر کی ترتیب', 'Calendar settings')}</Link>}
        </div>
      </div>
      {!years ? null : !current ? <Empty>{tr('ابھی کوئی تعلیمی سال نہیں۔', 'No academic year yet.')} <Link to="/setup/years">{tr('تعلیمی سال', 'Academic years')}</Link></Empty> : data && (
        <>
          <YearSummary plan={data.plan} label={current.label} orgName={org?.name ?? ''} hijri={data.hijri} />
          {st && <HijriRules plan={data.plan} hijri={data.hijri} shawwalDay={Number(st['calendar.startShawwalDay'])} beforeRamadan={Number(st['calendar.ceremonyDaysBeforeRamadan'])} />}
          <Warnings plan={data.plan} holidaysEstimated={data.info.holidaysEstimated} eidEstimated={data.info.eidEstimated} izalaTarget={data.info.config.izala.days} hijri={data.hijri} from={data.info.config.start} to={data.info.config.eidFitr.to} />
          <YearGrid hijri={data.hijri} plan={data.plan} start={data.info.config.start} end={data.info.config.eidFitr.to} weeklyHoliday={data.branch.weeklyHoliday} selected={sel} onSelect={setSel} />
          {sel && data.plan.byDate.get(sel) && <DayDetail key={sel} plan={data.plan} date={sel} canEdit={canEdit} onMove={async (to, reason) => { await saveYearConfig(current.id, { ...data.info.config, moves: [...(data.info.config.moves ?? []), { from: sel, to, reason }] }, reason); setSel(to); d.toast(tr('منتقل ہو گیا', 'Moved', 'نُقل')) }} />}
          <Legend />
          <Totals plan={data.plan} />
        </>
      )}
    </div>
  )
}

/** Checks the two Hijri anchors of the printed calendars: opening on N Shawwal, annual ijtima in Sha‘ban before Ramadan. */
function HijriRules({ plan, hijri, shawwalDay, beforeRamadan }: { plan: Plan; hijri: { offset: number; overrides: any[] }; shawwalDay: number; beforeRamadan: number }) {
  const items: string[] = []
  const open = plan.days[0]
  if (open.hijri.m !== 10 || open.hijri.d < shawwalDay || open.hijri.d > shawwalDay + 2)
    items.push(tr(`افتتاح ${hijriText(open.hijri)} کو ہے؛ معمول ${shawwalDay} شوال ہے۔`, `The year opens on ${hijriText(open.hijri)}; the usual day is ${shawwalDay} Shawwal.`, `يبدأ العام في ${hijriText(open.hijri)}؛ المعتاد ${shawwalDay} شوال.`))
  const cer = plan.events.ceremony
  if (cer.length) {
    const last = cer[cer.length - 1], h = toHijri(last, hijri.offset, hijri.overrides)
    const ram = fromHijri({ y: h.y, m: 9, d: 1 }, last, hijri.offset, hijri.overrides)
    const gap = ram ? diffDays(ram, last) : null
    if (h.m !== 8 || gap === null || Math.abs(gap - beforeRamadan) > 7)
      items.push(tr(`سالانہ اجتماع ${hijriText(h)} کو ختم ہو رہا ہے${gap !== null ? `، رمضان سے ${gap} دن پہلے` : ''}؛ معمول شعبان میں رمضان سے تقریباً ${beforeRamadan} دن پہلے ہے۔ ضرورت ہو تو دستی تبدیلی سے دن بدلیں۔`,
        `The annual ijtima ends on ${hijriText(h)}${gap !== null ? `, ${gap} days before Ramadan` : ''}; usually it is in Sha‘ban about ${beforeRamadan} days before Ramadan.`, `ينتهي الاجتماع السنوي في ${hijriText(h)}.`))
  }
  if (!items.length) return null
  return <div className="banner warn" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>{items.map((x, i) => <div key={i}>{x}</div>)}</div>
}

function Warnings({ plan, holidaysEstimated, eidEstimated, izalaTarget, hijri, from, to }: { plan: Plan; holidaysEstimated: boolean; eidEstimated: boolean; izalaTarget: number; hijri: { offset: number; overrides: any[] }; from: string; to: string }) {
  const items: string[] = []
  if (holidaysEstimated) items.push(tr('عیدالاضحیٰ، عاشورہ، 12 ربیع الاول اور 14 اگست کی تعطیلات ام القریٰ سے اندازاً رکھی گئی ہیں؛ «کیلنڈر کی ترتیب» میں تصدیق کر کے محفوظ کریں۔', 'Eid al-Adha, Ashura, 12 Rabi al-Awwal and 14 August holidays are estimated from Umm al-Qura; confirm them in Calendar settings.', 'العطل مقدَّرة من أم القرى؛ أكّدها في الإعدادات.'))
  if (eidEstimated) items.push(tr('عیدالفطر کی تعطیلات ابھی مقرر نہیں؛ ہجری کیلنڈر سے اندازہ لگایا گیا ہے۔', 'Eid al-Fitr holidays are not set yet; estimated from the Hijri calendar.', 'لم تُحدَّد عطلة عيد الفطر بعد؛ قُدّرت من التقويم الهجري.'))
  for (const w of plan.warnings) {
    if (w === 'overflow') items.push(tr('سال کے دن عیدالفطر سے پہلے پورے نہیں ہو رہے۔ تعطیلات یا امتحان کے دن کم کریں۔', 'The year does not fit before Eid al-Fitr. Reduce holidays or exam days.', 'لا تتسع أيام العام قبل عيد الفطر.'))
    else if (w.startsWith('izala:')) items.push(tr(`کمزوری کا ازالہ ${w.slice(6)} دن بنتا ہے (معمول ${izalaTarget})۔`, `Remediation comes to ${w.slice(6)} days (usual ${izalaTarget}).`, `معالجة الضعف ${w.slice(6)} أيام (المعتاد ${izalaTarget}).`))
    else if (w.startsWith('pin-not-holiday:')) items.push(tr(`${fmtDate(w.slice(16))} ہفتہ وار تعطیل نہیں، مگر اس پر ملاقات مقرر ہے۔`, `${fmtDate(w.slice(16))} is not the weekly holiday but has a meeting pinned.`, `${fmtDate(w.slice(16))} ليس العطلة الأسبوعية لكن عليه لقاء.`))
    else if (w.startsWith('move-outside:')) items.push(tr(`${fmtDate(w.slice(13))} کی دستی تبدیلی سال سے باہر ہے۔`, `The manual change on ${fmtDate(w.slice(13))} is outside the year.`, `التغيير اليدوي خارج العام.`))
    else if (w.startsWith('unscheduled:')) items.push(tr(`${w.slice(12)} دن کسی کام کے بغیر رہ گئے۔`, `${w.slice(12)} days are left unscheduled.`, `${w.slice(12)} أيام بلا جدولة.`))
  }
  for (const m of monthLengthIssues(from, to, hijri.offset, hijri.overrides)) {
    items.push(tr(`${hijriMonth(m.hm)} ${m.hy} کے ${m.length} دن بن رہے ہیں؛ چاند کی رؤیت کی تاریخ چیک کریں۔`, `${hijriMonth(m.hm)} ${m.hy} comes to ${m.length} days; check the moon-sighting date.`, `${hijriMonth(m.hm)} ${m.hy} = ${m.length} يوماً؛ راجع تاريخ الرؤية.`))
  }
  if (!items.length) return null
  return <div className="banner warn" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>{items.map((x, i) => <div key={i}>{x}</div>)}</div>
}

const MONTH_TYPES: DayType[] = ['padhai', 'practice', 'dohrai_tarbiyati', 'dohrai', 'jaiza', 'bazm', 'musabqa', 'exam_prep', 'exam', 'izala', 'holiday']

function YearGrid({ hijri, plan, start, end, weeklyHoliday, selected, onSelect }: { hijri: { offset: number; overrides: any[] }; plan: Plan; start: string; end: string; weeklyHoliday: number; selected: string | null; onSelect: (d: string) => void }) {
  const weekStart = (weeklyHoliday + 1) % 7
  const months: string[] = []
  for (let m = start.slice(0, 7); m <= end.slice(0, 7);) {
    months.push(m)
    const [y, mo] = m.split('-').map(Number)
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
  }
  const COLS = 37
  const t = today()
  const names = wdNames()
  return (
    <div className="table-wrap">
      <table className="cal">
        <thead>
          <tr><th className="sticky-col">{tr('مہینہ', 'Month')}</th>{Array.from({ length: COLS }, (_, i) => <th key={i} className={(weekStart + i) % 7 === weeklyHoliday ? 'wk' : ''}>{names[(weekStart + i) % 7]}</th>)}<th>{tr('ماہانہ ترتیب', 'Month totals', 'مجموع الشهر')}</th></tr>
        </thead>
        <tbody>
          {months.map((m) => {
            const first = `${m}-01`
            const lead = (wd(first) - weekStart + 7) % 7
            const [y, mo] = m.split('-').map(Number)
            const len = new Date(Date.UTC(y, mo, 0)).getUTCDate()
            const hFirst = toHijri(first, hijri.offset, hijri.overrides), hLast = toHijri(`${m}-${len}`, hijri.offset, hijri.overrides)
            return (
              <tr key={m}>
                <th className="sticky-col mon">
                  <div>{gregMonth(mo)} <Num>{y}</Num></div>
                  <small>{hijriMonth(hFirst.m)}{hFirst.m !== hLast.m ? ` / ${hijriMonth(hLast.m)}` : ''}</small>
                </th>
                {Array.from({ length: COLS }, (_, i) => {
                  const day = i - lead + 1
                  if (day < 1 || day > len) return <td key={i} className="blank" />
                  const iso = `${m}-${String(day).padStart(2, '0')}`
                  const dd = plan.byDate.get(iso)
                  const type: DayType = dd ? dd.type : iso < start ? 'before' : 'after'
                  return (
                    <td key={i} className={`dc t-${type} ${iso === t ? 'today' : ''} ${iso === selected ? 'sel' : ''}`}
                      title={`${fmtDate(iso)} · ${dd ? hijriText(dd.hijri) : ''} · ${dayName(type)}${dd?.label && dd.label !== 'weekly' ? ' · ' + dd.label : ''}`}
                      onClick={() => dd && onSelect(iso)}>
                      <span className="g">{day}</span>
                      {dd && <span className="h">{dd.hijri.d}</span>}
                      <span className="s">{dayShort(type)}</span>
                    </td>
                  )
                })}
                <td className="mcount">{MONTH_TYPES.map((ty) => { const n = plan.days.filter((x) => x.date.startsWith(m) && x.type === ty).length; return n ? <span key={ty} className={`chip t-${ty}`} title={dayName(ty)}>{dayShort(ty)} <Num>{n}</Num></span> : null })}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function DayDetail({ plan, date, canEdit, onMove }: { plan: Plan; date: string; canEdit: boolean; onMove: (to: string, reason: string) => Promise<void> }) {
  const d = plan.byDate.get(date)!
  const ask = useAskReason()
  const [to, setTo] = useState('')
  const target = to ? plan.byDate.get(to) : null
  return (
    <Card>
      <div className="row between wrap">
        <strong><Num>{fmtDate(date)}</Num> · {wdNames()[wd(date)]} · {hijriText(d.hijri)}</strong>
        <span className={`chip t-${d.type}`}>{dayName(d.type)}</span>
      </div>
      <div className="muted">
        {d.cycle ? tr(`دور ${d.cycle}`, `Cycle ${d.cycle}`, `الدورة ${d.cycle}`) : d.cycle === 0 ? tr('امتحانی دور', 'Exam block', 'فترة الامتحان') : ''}
        {d.label && d.label !== 'weekly' ? ` · ${d.label}` : ''}
        {d.label === 'weekly' ? ` · ${tr('ہفتہ وار تعطیل', 'Weekly holiday')}` : ''}
        {d.ramadan ? ` · ${tr('رمضان: مختصر اوقات (صبح یا ظہر تا عصر)', 'Ramadan: reduced timings (morning or Zuhr–Asr)', 'رمضان: أوقات مختصرة')}` : ''}
      </div>
      {canEdit && (
        <div className="row wrap" style={{ marginTop: 6 }}>
          <span>{tr('مشورے سے یہ دن اس تاریخ پر منتقل کریں:', 'Move this day (by mashwara) to:', 'انقل هذا اليوم (بالمشورة) إلى:')}</span>
          <DateInput value={to} min={plan.days[0].date} max={plan.days[plan.days.length - 1].date} onChange={(e) => setTo(e.target.value)} style={{ width: 'auto' }} />
          {target && <span className="muted">{tr('وہاں اب', 'There now', 'هناك الآن')}: <span className={`chip t-${target.type}`}>{dayName(target.type)}</span> — {tr('دونوں دن آپس میں بدل جائیں گے', 'the two days swap', 'يتبادل اليومان')}</span>}
          <button className="primary sm" disabled={!target || to === date} onClick={async () => { const r = await ask(tr('منتقلی کی وجہ (مشورہ)', 'Reason for the move (mashwara)', 'سبب النقل')); if (r) await onMove(to, r) }}>{tr('منتقل کریں', 'Move', 'انقل')}</button>
        </div>
      )}
    </Card>
  )
}

function Legend() {
  const types: DayType[] = ['opening', 'padhai', 'practice', 'dohrai_tarbiyati', 'dohrai', 'jaiza', 'bazm', 'musabqa', 'exam_prep', 'exam', 'ceremony', 'izala', 'holiday', 'parents', 'fuzala']
  return <div className="legend">{types.map((t) => <span key={t} className={`chip t-${t}`}>{dayName(t)}</span>)}</div>
}

/** The opening page of the printed calendar: title, the dates people ask about, and «یاد دہانی برائے اہم امور». */
function YearSummary({ plan, label, orgName, hijri }: { plan: Plan; label: string; orgName: string; hijri: { offset: number; overrides: any[] } }) {
  const e = plan.events
  const span = (a: string[]) => { if (!a.length) return '—'; const x = a[0], y = a[a.length - 1]; return a.length === 1 ? dm(x) : x.slice(0, 7) === y.slice(0, 7) ? `${+x.slice(8, 10)}–${dm(y)}` : `${dm(x)} – ${dm(y)}` }
  const t = today()
  const upcoming = plan.days.find((d) => d.date >= t && ['jaiza', 'exam', 'bazm', 'parents', 'musabqa', 'fuzala', 'ceremony', 'dohrai_tarbiyati'].includes(d.type))
  const hj = (a: string[]) => (a.length ? hijriText(toHijri(a[a.length - 1], hijri.offset, hijri.overrides)) : '')
  const big: [string, string, string, string][] = [
    ['opening', tr('افتتاحِ سال', 'Year opening', 'افتتاح العام'), dm(plan.days[0].date), hijriText(plan.days[0].hijri)],
    ['exam', tr('پنج ماہی امتحان', 'Five-monthly exam', 'امتحان نصف العام'), span(e.fiveMonthly), hj(e.fiveMonthly)],
    ['exam', tr('سالانہ امتحان', 'Annual exam', 'الامتحان السنوي'), span(e.annual), hj(e.annual)],
    ['ceremony', tr('سالانہ اجتماع / تقریب', 'Annual ijtima / ceremony', 'الاجتماع السنوي'), span(e.ceremony), hj(e.ceremony)],
  ]
  const rows: [string, string, string[]][] = [
    ['jaiza', dayName('jaiza'), e.jaiza.map(span)],
    ['dohrai_tarbiyati', tr('تربیتی سرگرمی', 'Tarbiyati activity', 'النشاط التربوي'), e.tarbiyati.map(dm)],
    ['bazm', dayName('bazm'), e.bazm.map(dm)],
    ['parents', dayName('parents'), e.parents.map(dm)],
    ['exam', tr('پنج ماہی / سالانہ امتحان', 'Five-monthly / annual exam', 'نصف العام / السنوي'), [span(e.fiveMonthly), span(e.annual)]],
    ['musabqa', dayName('musabqa'), e.musabqa.map(dm)],
    ['fuzala', dayName('fuzala'), e.fuzala.map(dm)],
    ['izala', dayName('izala'), [span(e.izala)]],
  ]
  return (
    <div className="ys">
      <div className="ys-head">
        <div className="ys-title">{tr('تعلیمی کیلنڈر', 'Academic calendar', 'التقويم الدراسي')}</div>
        <div className="ys-year"><Num>{label}</Num></div>
        <div className="ys-org">{orgName}</div>
      </div>
      <div className="ys-big">
        {big.map(([k, n, v, h]) => <div key={n} className={`ys-tile t-${k}`}><small>{n}</small><b><Num>{v}</Num></b>{h && <small>{h}</small>}</div>)}
        {upcoming && <div className="ys-tile next"><small>{tr('اگلا اہم دن', 'Next key day', 'اليوم المهم القادم')}</small><b><Num>{dm(upcoming.date)}</Num> · {dayName(upcoming.type)}</b></div>}
      </div>
      <div className="ys-rem">
        <div className="ys-remtitle">{tr('یاد دہانی برائے اہم امور', 'Reminder of key dates', 'تذكير بالأمور المهمة')}</div>
        {rows.filter(([, , v]) => v.length && v.some((x) => x !== '—')).map(([k, n, v]) => (
          <div key={n} className="ys-row">
            <span className={`ys-pill t-${k}`}>{n}</span>
            <div className="ys-dates">{v.filter((x) => x !== '—').map((x, i) => <span key={i} className="ys-date"><Num>{x}</Num></span>)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Totals({ plan }: { plan: Plan }) {
  const total = plan.days.length
  return (
    <Card title={tr('کل ایام', 'Day totals', 'مجموع الأيام')}>
      <table className="tbl"><tbody>
        {TOTALS_ORDER.filter((t) => plan.totals[t]).map((t) => <tr key={t}><td><span className={`chip t-${t}`}>{dayName(t)}</span></td><td><Num>{plan.totals[t]}</Num></td></tr>)}
        <tr><td><b>{tr('میزان', 'Total', 'المجموع')}</b></td><td><b><Num>{total}</Num></b></td></tr>
      </tbody></table>
    </Card>
  )
}

export function CalendarSettings() {
  const d = useDialog()
  const ask = useAskReason()
  const years = useYears()
  const { id: yearId = '' } = useParams()
  const row = years?.find((y) => y.id === yearId)
  const data = useQuery(async () => (row ? planForYear(row, session.branchId) : null), [row?.id, row?.updated_at])
  const [cfg, setCfg] = useState<YearConfig | null>(null)
  const st = useQuery(() => loadSettings(), [])
  const [loadedFor, setLoadedFor] = useState('')
  if (data && loadedFor !== `${row?.id}|${row?.updated_at}`) { setLoadedFor(`${row?.id}|${row?.updated_at}`); setCfg(structuredClone(data.info.config)) }
  if (!row || !cfg || !data) return null
  const preview = generatePlan(cfg, data.branch, data.hijri)
  const set = (patch: Partial<YearConfig>) => setCfg({ ...cfg, ...patch })

  async function save() {
    const r = await ask(tr('کیلنڈر بدلنے کی وجہ', 'Reason for changing the calendar', 'سبب تغيير التقويم')); if (!r) return
    await saveYearConfig(row!.id, cfg!, r)
    d.toast(tr('محفوظ ہو گیا — پورا سال دوبارہ بن گیا', 'Saved — the whole year was regenerated', 'حُفظ — أُعيد إنشاء العام كله'))
  }
  const suggestions = suggestIslamicHolidays(cfg.start, cfg.eidFitr.to, data.hijri.offset, data.hijri.overrides)
    .filter((sug) => !sug.key.startsWith('fitr'))
    .filter((sug) => !cfg.holidays.some((h) => h.from <= addDaysIso(sug.to, 3) && h.to >= addDaysIso(sug.from, -3)))

  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>{tr('کیلنڈر کی ترتیب', 'Calendar settings')} · {row.label}</h1>
        <div className="row"><Link className="btn ghost" to="/calendar">{tr('کیلنڈر', 'Calendar', 'التقويم')}</Link><button className="primary" onClick={save}>{tr('محفوظ کریں', 'Save')}</button></div>
      </div>
      <div className="banner">
        {tr('پیش منظر', 'Preview', 'معاينة')}: {tr('پنج ماہی', 'five-monthly', 'نصف العام')} <Num>{preview.events.fiveMonthly[0] ? fmtDate(preview.events.fiveMonthly[0]) : '—'}</Num> · {tr('سالانہ', 'annual', 'السنوي')} <Num>{preview.events.annual[0] ? fmtDate(preview.events.annual[0]) : '—'}</Num> · {dayName('izala')} <Num>{preview.events.izala.length}</Num>
        {preview.warnings.includes('overflow') && <Badge kind="err">{tr('سال پورا نہیں آ رہا', 'Year does not fit', 'العام لا يتسع')}</Badge>}
      </div>

      <Card title={tr('سال کا آغاز اور اختتام', 'Start and end of the year', 'بداية العام ونهايته')}>
        <div className="grid2">
          <Field label={tr('عیدالفطر کی تعطیلات (پچھلے سال) کا آخری دن', 'Last day of the previous Eid al-Fitr holidays', 'آخر يوم في عطلة عيد الفطر السابقة')}>
            <DateInput onChange={(e) => e.target.value && set({ start: suggestStart(e.target.value, data.branch) })} />
          </Field>
          <Field label={tr('افتتاحِ سال', 'Year opening', 'افتتاح العام')} hint={hijriText(toHijri(cfg.start, data.hijri.offset, data.hijri.overrides))}>
            <DateInput value={cfg.start} onChange={(e) => e.target.value && set({ start: e.target.value })} />
            {st && <button className="ghost sm" onClick={() => { const hy = toHijri(cfg.start, data.hijri.offset, data.hijri.overrides).y; const hs = toHijri(cfg.start, data.hijri.offset, data.hijri.overrides); const y = hs.m >= 10 ? hy : hy - 1; const d0 = startFromShawwal(y, Number(st['calendar.startShawwalDay']), data.branch, cfg.start, data.hijri.offset, data.hijri.overrides); if (d0) set({ start: d0 }) }}>
              {tr(`${st['calendar.startShawwalDay']} شوال کے مطابق رکھیں`, `Set to ${st['calendar.startShawwalDay']} Shawwal`, `اضبط على ${st['calendar.startShawwalDay']} شوال`)}</button>}
          </Field>
          <Field label={tr('عیدالفطر کی تعطیلات: سے', 'Eid al-Fitr holidays: from', 'عطلة عيد الفطر: من')}><DateInput value={cfg.eidFitr.from} onChange={(e) => set({ eidFitr: { ...cfg.eidFitr, from: e.target.value } })} /></Field>
          <Field label={tr('تک', 'To')}><DateInput value={cfg.eidFitr.to} onChange={(e) => set({ eidFitr: { ...cfg.eidFitr, to: e.target.value } })} /></Field>
        </div>
      </Card>

      <Card title={tr('دستی تبدیلیاں (مشورے سے)', 'Manual changes (by mashwara)', 'تغييرات يدوية (بالمشورة)')} actions={<button className="ghost sm" onClick={() => set({ moves: [...(cfg.moves ?? []), { from: cfg.start, to: cfg.start, reason: '' }] })}>{tr('نئی تبدیلی', 'New change', 'تغيير جديد')}</button>}>
        <p className="hint">{tr('دو تاریخیں چنیں؛ دونوں دن آپس میں بدل جائیں گے۔ باقی ترتیب وہی رہے گی۔ کیلنڈر میں کسی دن کو دبا کر بھی منتقل کر سکتے ہیں۔', 'Pick two dates; the two days swap. Everything else stays. You can also tap a day in the calendar to move it.', 'اختر تاريخين؛ يتبادل اليومان.')}</p>
        {(cfg.moves ?? []).length === 0 && <Empty>{tr('کوئی دستی تبدیلی نہیں', 'No manual changes', 'لا تغييرات')}</Empty>}
        {(cfg.moves ?? []).map((m, i) => {
          const upd = (patch: Partial<Move>) => set({ moves: cfg.moves!.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
          const a = preview.byDate.get(m.from)
          return (
            <div key={i} className="row wrap">
              <Field label={tr('یہ دن', 'This day', 'هذا اليوم')}><DateInput value={m.from} onChange={(e) => upd({ from: e.target.value })} /></Field>
              <Field label={tr('اس دن سے بدلیں', 'Swap with', 'مبادلة مع')}><DateInput value={m.to} onChange={(e) => upd({ to: e.target.value })} /></Field>
              <Field label={tr('وجہ', 'Reason', 'السبب')}><input value={m.reason} onChange={(e) => upd({ reason: e.target.value })} /></Field>
              {a && <span className={`chip t-${a.type}`}>{dayName(a.type)}</span>}
              <button className="ghost sm" onClick={() => set({ moves: cfg.moves!.filter((_, j) => j !== i) })}>{tr('ہٹائیں', 'Remove', 'إزالة')}</button>
            </div>
          )
        })}
      </Card>
      <Card title={tr('تعطیلات', 'Holidays', 'العطلات')} actions={<button className="ghost sm" onClick={() => set({ holidays: [...cfg.holidays, { from: cfg.start, to: cfg.start, reason: '' }] })}>{tr('تعطیل شامل کریں', 'Add holiday', 'إضافة عطلة')}</button>}>
        <p className="hint">{tr('ہفتہ وار تعطیل مکتب کی ترتیب سے آتی ہے۔ یہاں عیدالاضحیٰ، محرم، قومی اور مقامی تعطیلات درج کریں۔ درمیان میں آنے والی تعطیل باقی سال کو آگے کر دیتی ہے۔', 'The weekly holiday comes from the branch. Enter Eid al-Adha, Muharram, national and local holidays here. A holiday inside a cycle pushes the rest of the year forward.', 'العطلة الأسبوعية من إعداد المكتب. أدخل هنا عيد الأضحى ومحرم والعطلات الوطنية والمحلية.')}</p>
        <RangeRows rows={cfg.holidays} onChange={(holidays) => set({ holidays })} />
        {suggestions.length > 0 && (
          <div className="banner">
            {tr('ہجری کیلنڈر سے تجویز:', 'Suggested from the Hijri calendar:', 'مقترح من التقويم الهجري:')}
            {suggestions.map((s) => <button key={s.key} className="ghost sm" onClick={() => set({ holidays: [...cfg.holidays, { from: s.from, to: s.to, reason: s.reason }].sort((a, b) => a.from.localeCompare(b.from)) })}>{s.reason} <Num>{fmtDate(s.from)}{s.to !== s.from ? '–' + fmtDate(s.to) : ''}</Num> +</button>)}
          </div>
        )}
      </Card>

      <Card title={tr('والدین ملاقات، فضلاء جوڑ اور دیگر', 'Parent meetings, alumni gatherings and events', 'لقاءات أولياء الأمور والخريجين')} actions={<button className="ghost sm" onClick={() => set({ pins: [...cfg.pins, { date: cfg.start, type: 'parents', label: '' }] })}>{tr('شامل کریں', 'Add', 'إضافة')}</button>}>
        <p className="hint">{tr('یہ ہمیشہ ہفتہ وار تعطیل کے دن ہوتے ہیں اور کیلنڈر دوبارہ بننے پر بھی قائم رہتے ہیں۔', 'Always on the weekly holiday; pinned dates survive regeneration.', 'دائماً في العطلة الأسبوعية وتبقى عند إعادة الإنشاء.')}</p>
        <PinRows rows={cfg.pins} onChange={(pins) => set({ pins })} />
      </Card>

      <Card title={tr('امتحانات، تقریب اور ازالہ', 'Exams, ceremony and remediation', 'الامتحانات والحفل والمعالجة')}>
        <div className="grid2">
          <ExamEditor title={tr('پنج ماہی امتحان', 'Five-monthly exam', 'امتحان نصف العام')} v={cfg.fiveMonthly} onChange={(fiveMonthly) => set({ fiveMonthly })} />
          <ExamEditor title={tr('سالانہ امتحان', 'Annual exam', 'الامتحان السنوي')} v={cfg.annual} onChange={(annual) => set({ annual })} />
          <div className="stack">
            <b>{dayName('ceremony')}</b>
            <Field label={tr('دن', 'Days', 'الأيام')}><input type="number" dir="ltr" value={cfg.ceremony.days} onChange={(e) => set({ ceremony: { ...cfg.ceremony, days: +e.target.value } })} /></Field>
            <label className="check"><input type="checkbox" checked={cfg.ceremony.countWeeklyHoliday} onChange={(e) => set({ ceremony: { ...cfg.ceremony, countWeeklyHoliday: e.target.checked } })} />{tr('ہفتہ وار تعطیل بھی شامل', 'Includes the weekly holiday', 'تشمل العطلة الأسبوعية')}</label>
            <Field label={tr('امتحان کے بعد تعطیل (دن)', 'Holiday after each exam (days)', 'عطلة بعد كل امتحان')}><input type="number" dir="ltr" value={cfg.postExamHolidays} onChange={(e) => set({ postExamHolidays: +e.target.value })} /></Field>
          </div>
          <div className="stack">
            <b>{dayName('izala')}</b>
            <Select value={cfg.izala.mode} onChange={(v) => set({ izala: { ...cfg.izala, mode: v as any } })} options={[
              { v: 'untilEid', t: tr('عیدالفطر تک کے تمام دن', 'All days until Eid al-Fitr', 'كل الأيام حتى عيد الفطر') },
              { v: 'fixed', t: tr('مقررہ دن', 'Fixed number of days', 'عدد ثابت') },
            ]} />
            <Field label={tr('دن (معمول)', 'Days (usual)', 'الأيام (المعتاد)')}><input type="number" dir="ltr" value={cfg.izala.days} onChange={(e) => set({ izala: { ...cfg.izala, days: +e.target.value } })} /></Field>
          </div>
        </div>
      </Card>

      <Card title={tr('ماہانہ دور', 'Monthly cycle', 'الدورة الشهرية')}>
        <div className="grid2">
          {(['padhai', 'dohrai', 'jaiza', 'bazm'] as const).map((k) => (
            <Field key={k} label={dayName(k)}><input type="number" dir="ltr" value={cfg.cycle[k]} onChange={(e) => set({ cycle: { ...cfg.cycle, [k]: +e.target.value } })} /></Field>
          ))}
          <Field label={tr('امتحان سے پہلے پڑھائی', 'Teaching days before each exam', 'أيام الدراسة قبل الامتحان')}><input type="number" dir="ltr" value={cfg.examPadhai} onChange={(e) => set({ examPadhai: +e.target.value })} /></Field>
        </div>
      </Card>

      <HijriOverrides from={cfg.start} to={cfg.eidFitr.to} />
    </div>
  )
}

function RangeRows({ rows, onChange }: { rows: Range[]; onChange: (r: Range[]) => void }) {
  if (!rows.length) return <Empty>{tr('کوئی تعطیل نہیں', 'No holidays', 'لا عطلات')}</Empty>
  const up = (i: number, p: Partial<Range>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)))
  return (
    <div className="table-wrap"><table className="tbl"><thead><tr><th>{tr('سے', 'From')}</th><th>{tr('تک', 'To')}</th><th>{tr('وجہ', 'Reason')}</th><th /></tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i}>
          <td><DateInput value={r.from} onChange={(e) => up(i, { from: e.target.value, to: r.to < e.target.value ? e.target.value : r.to })} /></td>
          <td><DateInput value={r.to} onChange={(e) => up(i, { to: e.target.value })} /></td>
          <td><input value={r.reason} onChange={(e) => up(i, { reason: e.target.value })} /></td>
          <td><button className="ghost sm" onClick={() => onChange(rows.filter((_, j) => j !== i))}>✕</button></td>
        </tr>
      ))}</tbody></table></div>
  )
}
function PinRows({ rows, onChange }: { rows: Pin[]; onChange: (r: Pin[]) => void }) {
  if (!rows.length) return <Empty>{tr('کچھ مقرر نہیں', 'Nothing pinned', 'لا شيء')}</Empty>
  const up = (i: number, p: Partial<Pin>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)))
  return (
    <div className="table-wrap"><table className="tbl"><tbody>{rows.map((r, i) => (
      <tr key={i}>
        <td><DateInput value={r.date} onChange={(e) => up(i, { date: e.target.value })} /></td>
        <td><Select value={r.type} onChange={(v) => up(i, { type: v as Pin['type'] })} options={[{ v: 'parents', t: dayName('parents') }, { v: 'fuzala', t: dayName('fuzala') }, { v: 'event', t: dayName('event') }]} /></td>
        <td><input value={r.label ?? ''} placeholder={tr('نام (اختیاری)', 'Name (optional)', 'الاسم (اختياري)')} onChange={(e) => up(i, { label: e.target.value })} /></td>
        <td><button className="ghost sm" onClick={() => onChange(rows.filter((_, j) => j !== i))}>✕</button></td>
      </tr>
    ))}</tbody></table></div>
  )
}
function ExamEditor({ title, v, onChange }: { title: string; v: ExamCfg; onChange: (v: ExamCfg) => void }) {
  return (
    <div className="stack">
      <b>{title}</b>
      <div className="row">
        <Field label={dayName('exam_prep')}><input type="number" dir="ltr" value={v.prepDays} onChange={(e) => onChange({ ...v, prepDays: +e.target.value })} /></Field>
        <Field label={tr('امتحان کے دن', 'Exam days', 'أيام الامتحان')}><input type="number" dir="ltr" value={v.examDays} onChange={(e) => onChange({ ...v, examDays: +e.target.value })} /></Field>
      </div>
      <label className="check"><input type="checkbox" checked={v.countWeeklyHoliday} onChange={(e) => onChange({ ...v, countWeeklyHoliday: e.target.checked })} />{tr('ہفتہ وار تعطیل کو بھی امتحان کا دن گنیں', 'Count the weekly holiday as an exam day', 'احتساب العطلة الأسبوعية يوم امتحان')}</label>
    </div>
  )
}

function HijriOverrides({ from, to }: { from: string; to: string }) {
  const d = useDialog()
  const ask = useAskReason()
  const ctx = useQuery(() => loadHijriCtx(), [])
  if (!ctx) return null
  const base = monthStarts(from, to, 0, [])
  const eff = monthStarts(from, to, ctx.offset, ctx.overrides)
  const rows = eff.map((m, i) => ({
    ...m,
    base: base[i]?.start ?? m.start,
    len: eff[i + 1] ? diffDays(eff[i + 1].start, m.start) : null,
  })).filter((m) => m.start <= to && (m.len === null || addDaysIso(m.start, m.len) > from))

  async function shift(m: { hy: number; hm: number; start: string }, days: number, reset = false) {
    const target = reset ? base.find((b) => b.hy === m.hy && b.hm === m.hm)!.start : addDaysIso(m.start, days)
    const r = await ask(
      reset ? tr(`${hijriMonth(m.hm)} ${m.hy}: ام القریٰ کی تاریخ پر واپس`, `${hijriMonth(m.hm)} ${m.hy}: back to Umm al-Qura`, `${hijriMonth(m.hm)} ${m.hy}: العودة إلى أم القرى`)
        : tr(`${hijriMonth(m.hm)} ${m.hy} کا آغاز ${fmtDate(target)}`, `${hijriMonth(m.hm)} ${m.hy} starts on ${fmtDate(target)}`, `بداية ${hijriMonth(m.hm)} ${m.hy}: ${fmtDate(target)}`),
      tr('رؤیت کی تفصیل لکھیں۔ اس مہینے کے بعد کے مہینے بھی اسی حساب سے بدلیں گے۔', 'Write the sighting details. Later months follow this change.', 'اكتب تفاصيل الرؤية. الأشهر التالية تتبع هذا التغيير.'))
    if (!r) return
    await saveHijriOverride(m.hy, m.hm, target, r)
    d.toast(tr('محفوظ ہو گیا — کیلنڈر دوبارہ بن گیا', 'Saved — calendar regenerated', 'حُفظ — أُعيد إنشاء التقويم'))
  }
  return (
    <Card title={tr('ہجری مہینے (ام القریٰ)', 'Hijri months (Umm al-Qura)', 'الأشهر الهجرية (أم القرى)')}>
      <p className="hint">{tr('ہجری تاریخیں ام القریٰ کیلنڈر کے مطابق ہیں۔ اگر کسی مہینے کا چاند ایک دن پہلے یا بعد نظر آئے تو اس مہینے کے سامنے بٹن دبائیں؛ بعد کے مہینے بھی اسی حساب سے بدل جائیں گے۔',
        'Hijri dates follow the Umm al-Qura calendar. If a month is sighted a day earlier or later, press the button for that month; later months follow.',
        'التواريخ الهجرية وفق تقويم أم القرى. إن رُئي الهلال قبل يوم أو بعده فاضغط الزر أمام الشهر؛ وتتبعه الأشهر التالية.')}</p>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>{tr('مہینہ', 'Month')}</th><th>{tr('یکم', '1st', 'اليوم الأول')}</th><th>{tr('دن', 'Days', 'الأيام')}</th><th /></tr></thead>
          <tbody>
            {rows.map((m) => {
              const moved = diffDays(m.start, m.base)
              const own = ctx.overrides.find((o) => o.hy === m.hy && o.hm === m.hm)
              return (
                <tr key={`${m.hy}-${m.hm}`}>
                  <td>{hijriMonth(m.hm)} <Num>{m.hy}</Num></td>
                  <td>
                    <Num>{fmtDate(m.start)}</Num>{' '}
                    {moved !== 0 && <Badge kind="warn"><Num>{moved > 0 ? '+' : ''}{moved}</Num> {tr('ام القریٰ سے', 'vs Umm al-Qura', 'عن أم القرى')}</Badge>}
                  </td>
                  <td>{m.len === null ? '' : m.len === 29 || m.len === 30 ? <Num>{m.len}</Num> : <Badge kind="err"><Num>{m.len}</Num></Badge>}</td>
                  <td><div className="row">
                    <button className="ghost sm" onClick={() => shift(m, -1)}>{tr('ایک دن پہلے', 'One day earlier', 'قبل يوم')}</button>
                    <button className="ghost sm" onClick={() => shift(m, 1)}>{tr('ایک دن بعد', 'One day later', 'بعد يوم')}</button>
                    {moved !== 0 && <button className="ghost sm" onClick={() => shift(m, 0, true)}>{tr('ام القریٰ پر واپس', 'Back to Umm al-Qura', 'العودة لأم القرى')}</button>}
                    {own && <span className="muted" title={own.start}>✎</span>}
                  </div></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
