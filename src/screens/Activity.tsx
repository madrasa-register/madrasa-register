import { DateInput } from '../DateInput'
import { useState } from 'react'
import { all, get, insert, update, detId, today, type Row } from '../db/db'
import { myClasses } from '../db/repo'
import { planOn } from '../db/calendarRepo'
import { ACTIVITIES, dueActivities, activityStatus, type ActivityKey } from '../engine/activity'
import { tr, useQuery, Empty, Num, Field, Select, useDialog, useAskReason, fmtDate } from '../ui'
import { gregMonth } from './calendarMeta'

const aName = (k: string) => { const a = ACTIVITIES.find((x) => x.key === k)!; return tr(a.ur, a.en, a.ar) }

export function ActivityLog() {
  const d = useDialog()
  const ask = useAskReason()
  const classes = useQuery(() => myClasses(), [])
  const [classId, setClassId] = useState('')
  if (classes?.length && !classId) setTimeout(() => setClassId(classes[0].id))
  const data = useQuery(async () => {
    if (!classId) return null
    const cls = await get('class', classId)
    const r = await planOn(today(), cls?.branch_id ?? null)
    if (!r) return { none: true as const }
    const entries = await all<Row>('select * from activity_log where class_id = ?', [classId])
    const st = activityStatus(dueActivities(r.plan), entries.map((e) => ({ month: e.month, activity: e.activity, done: e.done })), today())
    const months = [...new Set(st.map((x) => x.month))]
    return { none: false as const, cls, st, months, entries }
  }, [classId])
  const [edit, setEdit] = useState<{ month: string; key: ActivityKey; due: string; entry: Row | null } | null>(null)
  const [f, setF] = useState({ done: 1, invited: '', attended: '', name: '', date: '' })

  function open(month: string, key: ActivityKey, due: string) {
    const entry = data && !data.none ? data.entries.find((e) => e.month === month && e.activity === key) ?? null : null
    setF({ done: entry?.done ?? 1, invited: entry?.invited?.toString() ?? '', attended: entry?.attended?.toString() ?? '', name: entry?.name ?? '', date: entry?.date ?? due })
    setEdit({ month, key, due, entry })
  }
  async function save() {
    if (!edit || !data || data.none) return
    const id = detId('act', classId, edit.month, edit.key)
    const ch = { done: f.done, invited: f.invited ? +f.invited : null, attended: f.attended ? +f.attended : null, name: f.name || null, date: f.date || null }
    if (edit.entry) { const r = await ask(tr('تبدیلی کی وجہ', 'Reason for the change')); if (!r) return; await update('activity_log', id, ch, r) }
    else await insert('activity_log', { class_id: classId, month: edit.month, activity: edit.key, ...ch }, { id, branchId: data.cls!.branch_id })
    setEdit(null); d.toast(tr('محفوظ', 'Saved'))
  }
  const meta = edit ? ACTIVITIES.find((a) => a.key === edit.key)! : null
  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>{tr('کارگزاری — مکتب کی بہتری کے چھ امور', 'Activity log — six activities', 'سجل الأنشطة الستة')}</h1>
        <Select value={classId} onChange={setClassId} options={(classes ?? []).map((c) => ({ v: c.id, t: c.name }))} />
      </div>
      {data?.none && <Empty>{tr('اس تاریخ کے لیے تعلیمی سال مقرر نہیں۔', 'No academic year covers today.', 'لا عام دراسي')}</Empty>}
      {data && !data.none && (
        <div className="table-wrap"><table className="tbl act">
          <thead><tr><th>{tr('مہینہ', 'Month')}</th>{ACTIVITIES.map((a) => <th key={a.key}>{tr(a.ur, a.en, a.ar)}</th>)}</tr></thead>
          <tbody>{data.months.map((m) => (
            <tr key={m}>
              <td>{gregMonth(+m.slice(5, 7))} <Num>{m.slice(0, 4)}</Num></td>
              {ACTIVITIES.map((a) => {
                const x = data.st.find((s) => s.month === m && s.key === a.key)
                if (!x) return <td key={a.key} className="muted">—</td>
                const sym = x.status === 'done' ? '✓' : x.status === 'not-done' ? '☒' : x.status === 'overdue' ? tr('باقی', 'Overdue', 'متأخر') : tr('آنے والا', 'Upcoming', 'قادم')
                return <td key={a.key}><button className={`actb ${x.status}`} onClick={() => open(m, a.key, x.due)}>{sym} <small><Num>{fmtDate(x.due).slice(0, 5)}</Num></small>
                  {x.entry && a.extra === 'counts' && x.status === 'done' ? <small> <Num>{(data.entries.find((e) => e.month === m && e.activity === a.key)?.attended ?? '')}/{(data.entries.find((e) => e.month === m && e.activity === a.key)?.invited ?? '')}</Num></small> : null}</button></td>
              })}
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {edit && meta && (
        <div className="overlay" onClick={() => setEdit(null)}><div className="dialog" onClick={(e) => e.stopPropagation()}>
          <h3>{aName(edit.key)} · {gregMonth(+edit.month.slice(5, 7))}</h3>
          <div className="row">
            <button className={`opt ${f.done ? 'on' : ''}`} onClick={() => setF({ ...f, done: 1 })}>✓ {tr('ہو گیا', 'Done', 'تم')}</button>
            <button className={`opt o-w ${!f.done ? 'on' : ''}`} onClick={() => setF({ ...f, done: 0 })}>☒ {tr('نہیں ہوا', 'Not done', 'لم يتم')}</button>
          </div>
          <Field label={tr('تاریخ', 'Date')}><DateInput value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          {meta.extra === 'counts' && <div className="grid2">
            <Field label={tr('کل مدعو', 'Total invited', 'المدعوون')}><input type="number" dir="ltr" value={f.invited} onChange={(e) => setF({ ...f, invited: e.target.value })} /></Field>
            <Field label={tr('کل شریک', 'Total attended', 'الحاضرون')}><input type="number" dir="ltr" value={f.attended} onChange={(e) => setF({ ...f, attended: e.target.value })} /></Field>
          </div>}
          {meta.extra === 'name' && <Field label={tr('سرگرمی کا نام', 'Activity name', 'اسم النشاط')}><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>}
          <div className="row end"><button className="ghost" onClick={() => setEdit(null)}>{tr('منسوخ', 'Cancel')}</button><button className="primary" onClick={save}>{tr('محفوظ کریں', 'Save')}</button></div>
        </div></div>
      )}
    </div>
  )
}
