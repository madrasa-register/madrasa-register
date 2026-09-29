import { DateInput } from '../DateInput'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { all, get, session, today, ReasonRequired, type Row } from '../db/db'
import { myClasses } from '../db/repo'
import {
  EXAM_KINDS, visibleExams, createExam, examSheet, loadStudentScore, saveRaw, addTap, voidTap, saveStudentMeta,
  finalizeExam, reopenExam, signExam, calendarExamDates, schemeDef, type ExamKind, type StudentScore,
} from '../db/examRepo'
import { nameFor, schemeTotal, type Component, type L } from '../engine/scheme'
import { recitationQuestions, type Raw, type Outcome } from '../engine/scoring'
import { GRADES, PRACTICAL, type Practical } from '../engine/grading'
import { fmtPercent } from '../engine/attendance'
import { tr, useQuery, Card, Empty, Num, Badge, Field, Select, useDialog, useAskReason, fmtDate, label, TRACKS, PARTS, bumpVersion } from '../ui'

export const lt = (x?: L | null) => (x ? tr(x.ur, x.en, x.ar) : '')
export const kindName = (k: string) => { const x = EXAM_KINDS.find((e) => e.v === k); return x ? tr(x.ur, x.en, x.ar) : k }
export const gradeName = (key?: string | null) => { const g = GRADES.find((x) => x.key === key); return g ? tr(g.ur, g.en, g.ar) : '—' }
export const practicalName = (k?: string | null) => (k && PRACTICAL[k as Practical] ? tr(PRACTICAL[k as Practical].ur, PRACTICAL[k as Practical].en, PRACTICAL[k as Practical].ar) : '—')

// ============ Exam list ============
export function ExamList() {
  const d = useDialog()
  const nav = useNavigate()
  const exams = useQuery(() => visibleExams(), [])
  const classes = useQuery(() => myClasses(), [])
  const examiners = useQuery(() => all<Row>(`select * from app_user where organization_id = ? and status = 'active' and role in ('examiner','nazim','admin','teacher') order by name`, [session.orgId]), [])
  const [f, setF] = useState<{ classId: string; kind: ExamKind; date: string; cycle: string; examiner: string; makeupOf: string } | null>(null)
  const sug = useQuery(() => (f?.classId ? calendarExamDates(f.classId) : Promise.resolve(null)), [f?.classId])
  const canCreate = session.role !== 'examiner'

  async function create() {
    if (!f) return
    const ex = examiners?.find((u) => u.id === f.examiner)
    try {
      const id = await createExam({ classId: f.classId, kind: f.kind, date: f.date, cycle: f.cycle ? +f.cycle : null, examinerName: ex?.name ?? '', examinerUserId: ex?.id ?? null, makeupOf: f.kind === 'makeup' ? f.makeupOf : null })
      setF(null); nav(`/exams/${id}`)
    } catch (e) { d.toast(String(e), 'err') }
  }
  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>{tr('امتحانات و جائزے', 'Exams and reviews', 'الامتحانات والتقييمات')}</h1>
        <div className="row">
          {session.role === 'admin' || session.role === 'nazim' ? <Link className="btn ghost" to="/schemes">{tr('نمبروں کی اسکیم', 'Mark schemes', 'مخططات الدرجات')}</Link> : null}
          {canCreate && <button className="primary" onClick={() => setF({ classId: classes?.[0]?.id ?? '', kind: 'monthly', date: today(), cycle: '', examiner: session.userId, makeupOf: '' })}>{tr('نیا امتحان', 'New exam', 'امتحان جديد')}</button>}
        </div>
      </div>
      {exams && exams.length === 0 && <Empty>{tr('ابھی کوئی امتحان نہیں', 'No exams yet', 'لا امتحانات بعد')}</Empty>}
      <div className="list">
        {exams?.map((e) => (
          <Link key={e.id} to={`/exams/${e.id}`} className="list-item">
            <div><strong>{kindName(e.kind)}{e.cycle ? ` ${e.cycle}` : ''}</strong> · {e.class_name}<div className="muted"><Num>{fmtDate(e.date)}</Num> · {tr('ممتحن', 'Examiner')}: {e.examiner_name || '—'}</div></div>
            {e.finalized_at ? <Badge kind="ok">{tr('حتمی', 'Final', 'نهائي')}</Badge> : <Badge kind="warn">{tr('جاری', 'In progress')}</Badge>}
          </Link>
        ))}
      </div>
      {f && (
        <div className="overlay" onClick={() => setF(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{tr('نیا امتحان', 'New exam', 'امتحان جديد')}</h3>
            <Field label={tr('جماعت', 'Class')}><Select value={f.classId} onChange={(v) => setF({ ...f, classId: v })} options={(classes ?? []).map((c) => ({ v: c.id, t: c.name }))} /></Field>
            <Field label={tr('قسم', 'Kind', 'النوع')}><Select value={f.kind} onChange={(v) => setF({ ...f, kind: v as ExamKind })} options={EXAM_KINDS.map((k) => ({ v: k.v, t: tr(k.ur, k.en, k.ar) }))} /></Field>
            {f.kind === 'makeup' && <MakeupPicker classId={f.classId} value={f.makeupOf} onChange={(v) => setF({ ...f, makeupOf: v })} />}
            <Field label={tr('تاریخ', 'Date')}><DateInput value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            {sug && (
              <div className="row wrap">
                <span className="muted">{tr('کیلنڈر سے', 'From the calendar', 'من التقويم')}:</span>
                {f.kind === 'monthly' && sug.jaiza.map((j) => <button key={j.cycle} className="ghost sm" onClick={() => setF({ ...f, date: j.date, cycle: String(j.cycle) })}>{j.cycle}: <Num>{fmtDate(j.date)}</Num></button>)}
                {f.kind === 'five' && sug.five && <button className="ghost sm" onClick={() => setF({ ...f, date: sug.five! })}><Num>{fmtDate(sug.five)}</Num></button>}
                {f.kind === 'annual' && sug.annual && <button className="ghost sm" onClick={() => setF({ ...f, date: sug.annual! })}><Num>{fmtDate(sug.annual)}</Num></button>}
              </div>
            )}
            <Field label={tr('ممتحن', 'Examiner')}><Select value={f.examiner} onChange={(v) => setF({ ...f, examiner: v })} options={(examiners ?? []).map((u) => ({ v: u.id, t: u.name }))} /></Field>
            <p className="hint">{tr('نمبروں کی اسکیم خود منتخب ہوتی ہے: امتحان → جماعت → مکتب → ادارہ۔', 'The mark scheme is picked automatically: exam → class → branch → organization.', 'يُختار المخطط تلقائياً.')}</p>
            <div className="row end"><button className="ghost" onClick={() => setF(null)}>{tr('منسوخ', 'Cancel')}</button><button className="primary" disabled={!f.classId || !f.date || (f.kind === 'makeup' && !f.makeupOf)} onClick={create}>{tr('بنائیں', 'Create', 'إنشاء')}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
function MakeupPicker({ classId, value, onChange }: { classId: string; value: string; onChange: (v: string) => void }) {
  const exams = useQuery(() => all<Row>(`select * from exam where class_id = ? and kind != 'makeup' order by date desc`, [classId]), [classId])
  return <Field label={tr('کس امتحان کے غیر حاضر طلبہ', 'Absent students of which exam', 'طلاب أي امتحان')}><Select value={value} empty="" onChange={onChange} options={(exams ?? []).map((e) => ({ v: e.id, t: `${kindName(e.kind)} ${fmtDate(e.date)}` }))} /></Field>
}

// ============ Exam page (class sheet) ============
export function ExamPage() {
  const { id = '' } = useParams()
  const d = useDialog()
  const ask = useAskReason()
  const data = useQuery(async () => {
    const exam = await get('exam', id)
    if (!exam) return null
    const cls = await get('class', exam.class_id)
    const scheme = await get('mark_scheme', exam.scheme_id)
    return { exam, cls, scheme, sheet: await examSheet(exam) }
  }, [id])
  const [remark, setRemark] = useState<string | null>(null)
  if (!data) return null
  const { exam, cls, scheme, sheet } = data
  const final = !!exam.finalized_at
  const done = sheet.filter((r) => r.es && (r.es.complete || r.es.absent)).length
  const canFinalize = session.role === 'admin' || session.role === 'nazim'
  const canScore = !final && (session.role !== 'examiner' || exam.examiner_user_id === session.userId)

  return (
    <div className="stack">
      <div className="row between wrap">
        <div>
          <h1>{kindName(exam.kind)}{exam.cycle ? ` ${exam.cycle}` : ''} · {cls?.name}</h1>
          <div className="muted"><Num>{fmtDate(exam.date)}</Num> · {tr('ممتحن', 'Examiner')}: {exam.examiner_name} · {scheme?.name} v<Num>{scheme?.version}</Num></div>
        </div>
        <div className="row wrap">
          <Link className="btn ghost" to={`/results/${exam.id}`}>{tr('نتیجہ', 'Results', 'النتيجة')}</Link>
          {final ? <Badge kind="ok">{tr('حتمی', 'Final', 'نهائي')} · <Num>{fmtDate(exam.finalized_at)}</Num></Badge> : <Badge kind="warn"><Num>{done}/{sheet.length}</Num> {tr('مکمل', 'done')}</Badge>}
        </div>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>#</th><th>{tr('نام', 'Name')}</th><th>{tr('نمبر', 'Marks')}</th><th>%</th><th>{tr('درجہ', 'Grade', 'التقدير')}</th><th>{tr('کیفیت', 'Status')}</th><th /></tr></thead>
          <tbody>{sheet.map(({ student: s, es }) => (
            <tr key={s.id} className={es?.absent ? 'left-row' : ''}>
              <td><Num>{s.serial_no}</Num></td>
              <td>{s.name}</td>
              <td><Num>{es?.total ?? '—'}/{es?.max ?? '—'}</Num></td>
              <td><Num>{es?.percent ?? '—'}</Num></td>
              <td>{es?.complete ? gradeName(es.grade) : '—'}</td>
              <td>{es?.absent ? <Badge kind="muted">{tr('غیر حاضر', 'Absent')}</Badge> : es?.complete ? <Badge kind="ok">{tr('مکمل', 'Done')}</Badge> : es ? <Badge kind="warn">{tr('جاری', 'In progress')}</Badge> : <Badge kind="muted">{tr('شروع نہیں ہوئی', 'Not started')}</Badge>}
                {es?.hold_promotion ? <> <Badge kind="err">{tr('ترقی روکیں', 'Hold promotion', 'إيقاف الترفيع')}</Badge></> : null}</td>
              <td>{canScore ? <Link className="btn ghost sm" to={`/exams/${exam.id}/s/${s.id}`}>{tr('نمبر دیں', 'Score', 'رصد')}</Link> : <Link className="btn ghost sm" to={`/exams/${exam.id}/s/${s.id}`}>{tr('دیکھیں', 'View', 'عرض')}</Link>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <Card title={tr('جماعت کی مجموعی کیفیت اور ممتحن کے دستخط', 'Class remark and examiner signature', 'ملاحظة الفصل وتوقيع الممتحن')}>
        <textarea rows={2} value={remark ?? exam.class_remark ?? ''} disabled={final} onChange={(e) => setRemark(e.target.value)} />
        <div className="row wrap between">
          <div className="muted">{exam.signed_by ? <>{tr('دستخط', 'Signed', 'وُقّع')}: {exam.signed_by} · <Num>{fmtDate(exam.signed_at)}</Num></> : tr('ابھی دستخط نہیں ہوئے', 'Not signed yet', 'لم يوقَّع بعد')}</div>
          <div className="row">
            {!final && remark !== null && <button className="ghost" onClick={async () => { const { update } = await import('../db/db'); await update('exam', exam.id, { class_remark: remark }, null, { requireReason: false, action: 'class-remark' }); setRemark(null); d.toast(tr('محفوظ', 'Saved')) }}>{tr('کیفیت محفوظ کریں', 'Save remark', 'حفظ الملاحظة')}</button>}
            {!final && (session.userId === exam.examiner_user_id || session.role !== 'teacher') && <button className="ghost" onClick={async () => { const u = await get('app_user', session.userId); await signExam(exam.id, u?.name ?? exam.examiner_name); d.toast(tr('دستخط ہو گئے', 'Signed', 'تم التوقيع')) }}>{tr('ممتحن کے دستخط', 'Examiner signs', 'توقيع الممتحن')}</button>}
          </div>
        </div>
      </Card>
      {canFinalize && (
        <div className="row end wrap">
          {!final ? <button className="primary" onClick={async () => {
            try { await finalizeExam(exam.id); d.toast(tr('نتیجہ حتمی ہو گیا؛ پوزیشن بن گئی', 'Finalized; positions computed', 'اعتُمدت النتيجة وحُسبت المراكز')) } catch (e) {
              const m = String(e).match(/incomplete:(\d+):([^:]*):(.*)/)
              d.toast(m ? tr(`${m[1]} طلبہ کے نمبر نامکمل ہیں (مثلاً ${m[2]}: ${m[3]})؛ یا انہیں غیر حاضر لگائیں`, `${m[1]} students are incomplete (e.g. ${m[2]}: ${m[3]}); or mark them absent`, `${m[1]} طلاب غير مكتملين`) : String(e), 'err')
            }
          }}>{tr('نتیجہ حتمی کریں', 'Finalize results', 'اعتماد النتيجة')}</button>
            : <button className="ghost" onClick={async () => { const r = await ask(tr('دوبارہ کھولنے کی وجہ', 'Reason to reopen', 'سبب إعادة الفتح')); if (r) await reopenExam(exam.id, r) }}>{tr('دوبارہ کھولیں', 'Reopen', 'إعادة فتح')}</button>}
        </div>
      )}
    </div>
  )
}

// ============ Score one student ============
export function ScoreStudent() {
  const { id = '', sid = '' } = useParams()
  const nav = useNavigate()
  const d = useDialog()
  const ask = useAskReason()
  const data = useQuery(async () => {
    const exam = await get('exam', id)
    if (!exam) return null
    const s = await loadStudentScore(exam, sid)
    const sheet = await examSheet(exam)
    const idx = sheet.findIndex((r) => r.student.id === sid)
    return { exam, s, next: sheet[idx + 1]?.student.id ?? null, prev: sheet[idx - 1]?.student.id ?? null }
  }, [id, sid])
  // taps shown at once, before the database answers (the list refreshes a moment later)
  const [opt, setOpt] = useState<{ id: string; comp: string; type: string; q: number | null; voided?: boolean }[]>([])
  const [seen, setSeen] = useState<any>(null)
  if (data && data !== seen) { setSeen(data); if (opt.length) setOpt([]) }
  if (!data) return null
  const { exam, s, next, prev } = data
  const final = !!exam.finalized_at
  const locked = final || (session.role === 'examiner' && exam.examiner_user_id !== session.userId)

  async function guard(fn: () => Promise<void>) {
    try { await fn() } catch (e) { if (e instanceof ReasonRequired) d.toast(tr('نتیجہ حتمی ہو چکا ہے', 'Results are final', 'النتيجة نهائية'), 'err'); else d.toast(String(e), 'err') }
  }
  const raw = (key: string) => s.comps.find((x) => x.c.key === key)!.raw
  const setRaw = (key: string, patch: Partial<Raw>) => guard(() => saveRaw(exam.id, sid, key, { ...raw(key), ...patch }))
  const tap = (c: Component, type: string, key: string | null, q: number | null, points: number) => {
    setOpt((o) => [...o, { id: 'tmp' + Math.random(), comp: c.key, type, q }])
    return guard(() => addTap(exam.id, sid, c.key, type, key, q, points))
  }
  const withOpt = (key: string, taps: any[]) => [...taps, ...opt.filter((t) => t.comp === key)]

  return (
    <div className="stack">
      <div className="row between wrap sticky-bar">
        <div>
          <h1>{s.student.name} <span className="muted">{tr('ولد', 's/o')} {s.student.walidiyat}</span></h1>
          <div className="muted">{label(TRACKS, s.track)} · {label(PARTS, s.part)} · {kindName(exam.kind)} <Num>{fmtDate(exam.date)}</Num></div>
        </div>
        <div className="scorebox"><b><Num>{s.total}</Num></b><span>/ <Num>{s.max}</Num></span><small>{s.complete ? gradeName(s.grade.key) : tr('نامکمل', 'Incomplete', 'غير مكتمل')} · <Num>{s.percent}%</Num></small></div>
      </div>
      {final && <div className="banner">{tr('یہ نتیجہ حتمی ہو چکا ہے؛ تبدیلی کے لیے ناظم دوبارہ کھولے۔', 'These results are final; the nazim must reopen to change them.', 'النتيجة نهائية.')}</div>}
      <label className="check"><input type="checkbox" checked={!!s.es?.absent} disabled={locked} onChange={(e) => guard(() => saveStudentMeta(exam.id, sid, { absent: e.target.checked ? 1 : 0 }))} />
        {tr('امتحان کے دن غیر حاضر (بعد میں امتحان ہوگا؛ پوزیشن اور اضافی نمبر نہیں)', 'Absent on exam day (examined later: no position, no bonus marks)', 'غائب يوم الامتحان')}</label>

      {!s.es?.absent && s.comps.map(({ c, raw: r, taps: savedTaps, r: res }) => { const taps = withOpt(c.key, savedTaps); return (
        <Card key={c.key} title={lt(nameFor(c, s.track))} actions={<Badge kind={res.complete ? 'ok' : 'warn'}><Num>{res.marks}/{res.max}</Num></Badge>}>
          {c.method === 'outcome' && <OutcomeInput c={c} raw={r} disabled={locked} onChange={(p) => setRaw(c.key, p)} />}
          {c.method === 'category' && (
            <div className="row wrap">{(c.cfg?.options?.[s.student.gender === 'f' ? 'f' : 'm'] ?? []).map((o) => (
              <button key={o.key} disabled={locked} className={`opt ${r.option === o.key ? 'on' : ''}`} onClick={() => setRaw(c.key, { option: o.key })}>{lt(o.name)} <Num>{o.marks}</Num></button>
            ))}</div>
          )}
          {c.method === 'band' && <div>{tr('حاضری', 'Attendance')}: <b><Num>{fmtPercent(s.attPercent)}</Num></b> · <Num>{fmtDate(s.window.from)} → {fmtDate(s.window.to)}</Num> <span className="hint">{tr('(خودکار، حاضری رجسٹر سے)', '(automatic, from the register)', '(تلقائي)')}</span></div>}
          {c.method === 'manual' && (
            <div className="row wrap">{(c.questions ?? []).map((q, i) => (
              <Field key={i} label={`${tr('سوال', 'Q', 'س')} ${i + 1} (${q.marks})`}>
                <input type="number" dir="ltr" min={0} max={q.marks} disabled={locked} defaultValue={r.values?.[i] ?? ''} onBlur={(e) => { const v = [...(r.values ?? [])]; v[i] = e.target.value === '' ? null : Math.min(q.marks, Math.max(0, +e.target.value)); setRaw(c.key, { values: v }) }} />
              </Field>
            ))}</div>
          )}
          {c.method === 'deduction' && (
            <>
              <div className="row wrap">{(c.cfg?.types ?? []).map((t) => {
                const on = taps.find((x) => x.type === t.key && !x.voided)
                return <button key={t.key} disabled={locked} className={`ded ${on ? 'on' : ''}`}
                  onClick={() => (on ? (String(on.id).startsWith('tmp') ? undefined : guard(() => voidTap(on.id))) : tap(c, t.key, null, null, t.points))}>
                  {on ? '✓ ' : ''}{lt(t.name)} <Num>−{t.points}</Num></button>
              })}</div>
              <div className="row wrap">
                {c.cfg?.bonus ? <label className="check"><input type="checkbox" disabled={locked} checked={!!r.bonus} onChange={(e) => setRaw(c.key, { bonus: e.target.checked })} />{tr(`قواعد بتا دیے (+${c.cfg.bonus})`, `Explained the rules (+${c.cfg.bonus})`, `شرح القواعد (+${c.cfg.bonus})`)}{s.es?.makeup || exam.makeup_of ? ` — ${tr('بعد والے امتحان میں شامل نہیں', 'not in a makeup exam', 'لا يُحتسب')}` : ''}</label> : null}
                {!r.checked && taps.length === 0 && <button className="ghost sm" disabled={locked} onClick={() => setRaw(c.key, { checked: true })}>{tr('کوئی غلطی نہیں — مکمل', 'No mistakes — done', 'لا أخطاء — تم')}</button>}
              </div>
              <p className="hint">{tr('ہر غلطی ایک ہی بار کٹتی ہے؛ دوبارہ دبانے سے واپس ہو جاتی ہے۔', 'Each mistake counts once; tap again to undo.', 'كل خطأ يُحتسب مرة؛ اضغط ثانية للتراجع.')}</p>
            </>
          )}
          {c.method === 'recitation' && <RecitationInput c={c} raw={r} taps={taps} res={res} disabled={locked} onRaw={(p) => setRaw(c.key, p)} onTap={(type, q, pts) => tap(c, type, null, q, pts)} onUndo={(tid) => guard(() => voidTap(tid))} />}
        </Card>
      ) })}

      <StudentMeta s={s} disabled={locked} onSave={(ch, reason) => guard(() => saveStudentMeta(exam.id, sid, ch, reason))} ask={ask} />

      <div className="row between wrap">
        <button className="ghost" disabled={!prev} onClick={() => nav(`/exams/${exam.id}/s/${prev}`)}>{tr('پچھلا طالب علم', 'Previous student', 'الطالب السابق')}</button>
        <Link className="btn ghost" to={`/exams/${exam.id}`}>{tr('جماعت کی فہرست', 'Class list', 'قائمة الفصل')}</Link>
        <button className="primary" disabled={!next} onClick={() => nav(`/exams/${exam.id}/s/${next}`)}>{tr('اگلا طالب علم', 'Next student', 'الطالب التالي')}</button>
      </div>

      <TajweedGuide />
    </div>
  )
}

function OutcomeInput({ c, raw, disabled, onChange }: { c: Component; raw: Raw; disabled: boolean; onChange: (p: Partial<Raw>) => void }) {
  const out = raw.outcomes ?? []
  const set = (i: number, v: Outcome) => { const o = [...out]; o[i] = v; onChange({ outcomes: o, easy: o.every((x) => x === 'w') ? raw.easy ?? null : null }) }
  const allWrong = (c.questions ?? []).length > 0 && (c.questions ?? []).every((_, i) => out[i] === 'w')
  return (
    <div className="stack">
      {(c.questions ?? []).map((q, i) => (
        <div key={i} className="row wrap">
          <span className="qlabel">{tr('سوال', 'Q', 'س')} <Num>{i + 1}</Num> (<Num>{q.marks}</Num>)</span>
          {([['c', tr('درست', 'Correct', 'صحيح')], ['p', tr('کچھ درست', 'Partly', 'صحيح جزئياً')], ['w', tr('غلط', 'Wrong', 'خطأ')]] as [Outcome, string][]).map(([v, t]) => (
            <button key={v} disabled={disabled} className={`opt o-${v} ${out[i] === v ? 'on' : ''}`} onClick={() => set(i, v)}>{t}</button>
          ))}
        </div>
      ))}
      {allWrong && (
        <div className="row wrap">
          <span className="qlabel">{tr('آسان سوالات', 'Easy questions', 'أسئلة سهلة')}:</span>
          <button disabled={disabled} className={`opt ${raw.easy === 'yes' ? 'on' : ''}`} onClick={() => onChange({ easy: 'yes' })}>{tr('جواب دیا', 'Answered', 'أجاب')} (<Num>{c.cfg?.fallbackMin ?? 8}</Num>)</button>
          <button disabled={disabled} className={`opt ${raw.easy === 'no' ? 'on' : ''}`} onClick={() => onChange({ easy: 'no' })}>{tr('جواب نہیں دیا', 'Not answered', 'لم يجب')} (<Num>0</Num>)</button>
        </div>
      )}
    </div>
  )
}

/** Short reference for examiners; kept closed so it does not get in the way during the exam. */
function TajweedGuide() {
  const items: [string, string][] = [
    [tr('مخرج', 'Makhraj', 'المخرج'), tr('حرف اپنے صحیح مخرج سے ادا نہ ہو، جیسے ث کو س یا ض کو د پڑھنا۔', 'A letter not pronounced from its proper point, e.g. ث read as س.', 'عدم إخراج الحرف من مخرجه.')],
    [tr('وقف', 'Waqf', 'الوقف'), tr('غلط جگہ رکنا، یا رک کر اس طرح شروع کرنا کہ معنی بگڑ جائے۔', 'Stopping in the wrong place, or resuming so the meaning is spoiled.', 'الوقف في غير موضعه.')],
    [tr('لحن جلی', 'Lahn jali', 'اللحن الجلي'), tr('کھلی غلطی جس سے لفظ یا معنی بدل جائے، جیسے حرف یا حرکت بدل دینا۔', 'An obvious error that changes a word or its meaning, e.g. a letter or vowel changed.', 'خطأ ظاهر يغيّر اللفظ أو المعنى.')],
    [tr('لحن خفی', 'Lahn khafi', 'اللحن الخفي'), tr('چھپی غلطی جو تجوید کے قواعد (غنہ، مد، اخفاء، ادغام وغیرہ) کے خلاف ہو مگر معنی نہ بدلے۔', 'A hidden error against the tajweed rules (ghunnah, madd, ikhfa, idgham…) that does not change the meaning.', 'خطأ خفي في أحكام التجويد لا يغيّر المعنى.')],
    [tr('قلقلہ', 'Qalqalah', 'القلقلة'), tr('ق ط ب ج د ساکن ہوں تو ان میں قلقلہ (ہلکا جھٹکا) ادا نہ کرنا۔', 'Not giving the echo (qalqalah) on a sakin ق ط ب ج د.', 'عدم إظهار القلقلة في ق ط ب ج د الساكنة.')],
  ]
  return (
    <details className="card">
      <summary><b>{tr('تجوید کی غلطیوں کی وضاحت (مطالعہ کے لیے)', 'Tajweed mistakes explained (for study)', 'شرح أخطاء التجويد (للمطالعة)')}</b></summary>
      <dl className="guide">{items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </details>
  )
}

function RecitationInput({ c, raw, taps, res, disabled, onRaw, onTap, onUndo }: {
  c: Component; raw: Raw; taps: { id: string; type: string; q?: number | null; voided?: boolean }[]; res: { lines?: { label: string; marks: number; max: number }[] }
  disabled: boolean; onRaw: (p: Partial<Raw>) => void; onTap: (type: string, q: number, pts: number) => void; onUndo: (id: string) => void
}) {
  const variants = c.cfg?.variants ?? {}
  const v = variants[raw.variant ?? '']
  const qs = v ? recitationQuestions(v, raw, c.max ?? 60) : []
  return (
    <div className="stack">
      <div className="row wrap">{Object.entries(variants).map(([k, x]) => <button key={k} disabled={disabled} className={`opt ${raw.variant === k ? 'on' : ''}`} onClick={() => onRaw({ variant: k })}>{lt(x.name)}</button>)}</div>
      {v?.hifzByParas && <Field label={tr('کتنے پارے حفظ ہیں؟', 'Paras memorised', 'عدد الأجزاء المحفوظة')}><input type="number" dir="ltr" min={1} max={30} disabled={disabled} value={raw.paras ?? 1} onChange={(e) => onRaw({ paras: Math.max(1, +e.target.value) })} /></Field>}
      {v && v.fixed.length > 0 && (
        <div className="row wrap">{v.fixed.map((f) => {
          const ok = raw.fixed?.[f.key] !== false
          return <button key={f.key} disabled={disabled} className={`ded ${ok ? '' : 'on'}`} onClick={() => onRaw({ fixed: { ...(raw.fixed ?? {}), [f.key]: !ok } })}>{ok ? '' : '✓ '}{lt(f.name)} {tr('نہیں پڑھا', 'not read', 'لم يُقرأ')} <Num>−{f.marks}</Num></button>
        })}</div>
      )}
      {v && qs.map((q, i) => {
        const qTaps = taps.filter((t) => (t.q ?? 0) === i + 1)
        const line = res.lines?.find((l) => l.label === `q${i + 1}`)
        const last = [...qTaps].reverse().find((t) => !t.voided)
        const qName = v.questions?.[i]?.name
        return (
          <div key={i} className="qbox">
            <div className="row between"><b>{qName ? lt(qName) : `${tr('سوال', 'Question', 'السؤال')} ${i + 1}`}</b><Num>{line?.marks ?? q.marks}/{q.marks}</Num></div>
            <div className="row wrap">
              {v.deductions.map((dd) => {
                const n = qTaps.filter((t) => !t.voided && t.type === dd.key).length
                return <button key={dd.key} disabled={disabled} className="ded" onClick={() => onTap(dd.key, i + 1, dd.points)}>{lt(dd.name)} <Num>−{dd.points}</Num>{n ? <span className="cnt"><Num>{n}</Num></span> : null}</button>
              })}
              {last && <button className="ghost sm" disabled={disabled} onClick={() => onUndo(last.id)}>{tr('آخری واپس', 'Undo last', 'تراجع')}</button>}
            </div>
          </div>
        )
      })}
      {v && v.whole.length > 0 && (
        <div className="row wrap">{v.whole.map((w) => (
          <button key={w.key} disabled={disabled} className={`opt o-w ${raw.whole === w.key ? 'on' : ''}`} onClick={() => onRaw({ whole: raw.whole === w.key ? null : w.key })}>{lt(w.name)} <Num>−{w.points}</Num></button>
        ))}</div>
      )}
      {!raw.checked && taps.length === 0 && <button className="ghost sm" disabled={disabled} onClick={() => onRaw({ checked: true })}>{tr('جانچ مکمل', 'Checked — done', 'تم الفحص')}</button>}
    </div>
  )
}

function StudentMeta({ s, disabled, onSave, ask }: { s: StudentScore; disabled: boolean; onSave: (ch: Record<string, any>, reason: string | null) => void; ask: (t: string, m?: string) => Promise<string | null> }) {
  const es = s.es
  const concerns: string[] = es?.concerns ? JSON.parse(es.concerns) : []
  const [remark, setRemark] = useState<string | null>(null)
  const current = (es?.practical_reason ? es.practical : s.practicalAuto) as Practical
  const toggleConcern = (k: string) => onSave({ concerns: JSON.stringify(concerns.includes(k) ? concerns.filter((x) => x !== k) : [...concerns, k]) }, null)
  const gradeWord = gradeName(s.grade.key)
  const r = remark ?? es?.remark ?? ''
  const contradicts = s.complete && GRADES.some((g) => g.key !== s.grade.key && r.includes(g.ur))
  return (
    <Card title={tr('کیفیت، عملی کیفیت اور نشانات', 'Remark, practical status and flags', 'الملاحظة والحالة العملية')}>
      <Field label={tr('طالب علم کی کیفیت (نمبروں کے مطابق)', "Student's remark (must match the marks)", 'ملاحظة الطالب')}>
        <input value={r} disabled={disabled} onChange={(e) => setRemark(e.target.value)} onBlur={() => remark !== null && onSave({ remark }, null)} />
      </Field>
      <div className="row wrap">
        {s.complete && <button className="ghost sm" disabled={disabled} onClick={() => { setRemark(gradeWord); onSave({ remark: gradeWord }, null) }}>{gradeWord}</button>}
        {contradicts && <Badge kind="err">{tr('کیفیت نمبروں کے خلاف ہے', 'Remark contradicts the marks', 'الملاحظة تخالف الدرجات')}</Badge>}
      </div>
      <div className="row wrap">
        <span className="qlabel">{tr('تشویش', 'Concern', 'ملاحظة سلوكية')}:</span>
        {[['akhlaq', tr('اخلاق', 'Conduct', 'الأخلاق')], ['uniform', tr('یونیفارم', 'Uniform', 'الزي')], ['safai', tr('صفائی', 'Cleanliness', 'النظافة')]].map(([k, t]) => (
          <label key={k} className="check"><input type="checkbox" disabled={disabled} checked={concerns.includes(k)} onChange={() => toggleConcern(k)} />{t}</label>
        ))}
      </div>
      <div className="row wrap">
        <span className="qlabel">{tr('عملی کیفیت', 'Practical status', 'الحالة العملية')}:</span>
        {(['behtar', 'munasib', 'qabil-e-tawajjuh'] as Practical[]).map((p) => (
          <button key={p} disabled={disabled} className={`opt ${current === p ? 'on' : ''}`} onClick={async () => {
            if (p === s.practicalAuto) { onSave({ practical: p, practical_reason: null }, null); return }
            const reason = await ask(tr('عملی کیفیت بدلنے کی وجہ (ایک سطر)', 'One-line reason for changing the practical status', 'سبب تغيير الحالة العملية'))
            if (reason) onSave({ practical: p, practical_reason: reason }, null)
          }}>{practicalName(p)}{p === s.practicalAuto ? ' ●' : ''}</button>
        ))}
      </div>
      <p className="hint">● {tr('قاعدے کے مطابق', 'by the rule', 'حسب القاعدة')}: {tr('حاضری', 'attendance')} <Num>{fmtPercent(s.attPercent)}</Num>{s.namazi !== null ? <> · {tr('نمازی ڈائری', 'prayer diary', 'دفتر الصلاة')} <Num>{s.namazi}</Num></> : null}{es?.practical_reason ? ` · ${tr('تبدیلی کی وجہ', 'changed because', 'سبب التغيير')}: ${es.practical_reason}` : ''}</p>
      <div className="row wrap">
        <Field label={tr('رعایتی نمبر', 'Grace marks', 'درجات التسامح')} hint={tr('کمزور طالب علم کو فیل نہ کریں؛ کیفیت میں درج کریں', 'Avoid failing weak students; note it in the remark', 'تُذكر في الملاحظة')}>
          <input type="number" dir="ltr" min={0} disabled={disabled || !!s.es?.makeup} defaultValue={es?.grace ?? 0} onBlur={(e) => onSave({ grace: Math.max(0, +e.target.value || 0) }, null)} />
        </Field>
        <label className="check"><input type="checkbox" disabled={disabled} checked={!!es?.hold_promotion} onChange={(e) => onSave({ hold_promotion: e.target.checked ? 1 : 0 }, null)} />{tr('ترقی روکیں (کچھ نہ بتا سکا)', 'Hold promotion (could answer nothing)', 'إيقاف الترفيع')}</label>
      </div>
      <p className="hint"><Num>{schemeTotal({ name: { ur: '', en: '' }, groups: [], components: s.comps.map((x) => x.c) })}</Num> {tr('کل نمبر', 'total marks', 'مجموع الدرجات')}</p>
    </Card>
  )
}
export { bumpVersion, schemeDef }
