import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { all, get, session, type Row } from '../db/db'
import { ensureDefaultSchemes, saveSchemeVersion, copyScheme, schemeDef, schemeKinds, EXAM_KINDS, type ExamKind } from '../db/examRepo'
import { componentMax, schemeTotal, groupTotal, validateScheme, type SchemeDef, type Component, type Method } from '../engine/scheme'
import { tr, useQuery, Card, Num, Badge, Field, Select, useDialog, useAskReason, TRACKS, PARTS, opts } from '../ui'
import { lt, kindName } from './Exams'

const METHODS: { v: Method; ur: string; en: string; ar: string }[] = [
  { v: 'manual', ur: 'نمبر لکھیں (ہر سوال)', en: 'Type marks (per question)', ar: 'إدخال الدرجات' },
  { v: 'outcome', ur: 'درست / کچھ درست / غلط', en: 'Correct / partly / wrong', ar: 'صحيح / جزئي / خطأ' },
  { v: 'deduction', ur: 'غلطی پر نمبر کٹیں', en: 'Deduct per mistake', ar: 'خصم لكل خطأ' },
  { v: 'band', ur: 'حاضری سے (خودکار)', en: 'From attendance (automatic)', ar: 'من الحضور' },
  { v: 'category', ur: 'زمرہ منتخب کریں', en: 'Pick a category', ar: 'اختيار فئة' },
  { v: 'recitation', ur: 'پختگی (قاعدہ / ناظرہ / حفظ)', en: 'Recitation (Qaida / Nazira / Hifz)', ar: 'الإتقان' },
]
const methodName = (m: string) => { const x = METHODS.find((y) => y.v === m); return x ? tr(x.ur, x.en, x.ar) : m }
const scopeName = (s: string) => ({ org: tr('پورا ادارہ', 'Whole organization'), branch: tr('مکتب', 'Branch'), class: tr('جماعت', 'Class') } as Record<string, string>)[s] ?? s

export function SchemeList() {
  const d = useDialog()
  const nav = useNavigate()
  const rows = useQuery(async () => { await ensureDefaultSchemes(); return all<Row>('select * from mark_scheme where organization_id = ? order by lineage_id, version desc', [session.orgId]) }, [])
  const active = rows?.filter((r) => r.status === 'active') ?? []
  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>{tr('نمبروں کی اسکیم', 'Mark schemes', 'مخططات الدرجات')}</h1>
        <Link className="btn ghost" to="/exams">{tr('امتحانات', 'Exams', 'الامتحانات')}</Link>
      </div>
      <p className="hint">{tr('ترمیم سے نیا ورژن بنتا ہے؛ پچھلے امتحانات کے نمبر نہیں بدلتے۔', 'Editing makes a new version; past marks never change.', 'التعديل ينشئ نسخة جديدة؛ لا تتغير درجات الامتحانات السابقة.')}</p>
      {active.map((r) => {
        const def = schemeDef(r)
        const old = rows!.filter((x) => x.lineage_id === r.lineage_id && x.id !== r.id)
        return (
          <Card key={r.id} title={`${r.name} · v${r.version}`} actions={<>
            <Badge kind="muted"><Num>{schemeTotal(def)}</Num> {tr('نمبر', 'marks')}</Badge>
            <button className="ghost sm" onClick={() => nav(`/schemes/${r.id}`)}>{tr('ترمیم', 'Edit', 'تعديل')}</button>
            <button className="ghost sm" onClick={async () => { const id = await copyScheme(r, `${r.name} (${tr('کاپی', 'copy', 'نسخة')})`); d.toast(tr('کاپی بن گئی', 'Copied', 'نُسخ')); nav(`/schemes/${id}`) }}>{tr('کاپی', 'Copy', 'نسخ')}</button>
          </>}>
            <div className="muted">{scopeName(r.scope)} · {schemeKinds(r).length ? schemeKinds(r).map(kindName).join('، ') : tr('کسی امتحان کے لیے فعال نہیں', 'Not used for any exam kind', 'غير مفعّل')}</div>
            <div className="row wrap">{def.components.map((c) => <span key={c.key} className="chip t-padhai">{lt(c.name)} <Num>{componentMax(c)}</Num></span>)}</div>
            {old.length > 0 && <div className="hint">{tr('پرانے ورژن', 'Earlier versions', 'نسخ سابقة')}: {old.map((o) => `v${o.version}`).join(', ')}</div>}
          </Card>
        )
      })}
    </div>
  )
}

export function SchemeEditor() {
  const { id = '' } = useParams()
  const d = useDialog()
  const ask = useAskReason()
  const nav = useNavigate()
  const row = useQuery(() => get('mark_scheme', id), [id])
  const classes = useQuery(() => all<Row>(`select * from class where organization_id = ? and status = 'active' order by name`, [session.orgId]), [])
  const branches = useQuery(() => all<Row>('select * from branch where organization_id = ?', [session.orgId]), [])
  const [def, setDef] = useState<SchemeDef | null>(null)
  const [meta, setMeta] = useState<{ name: string; scope: string; scope_id: string | null; kinds: ExamKind[] } | null>(null)
  if (row && !def) { setDef(schemeDef(row)); setMeta({ name: row.name, scope: row.scope, scope_id: row.scope_id, kinds: schemeKinds(row) }) }
  if (!row || !def || !meta) return null
  const issues = validateScheme(def)
  const errors = issues.filter((x) => x.level === 'error')
  const upC = (i: number, p: Partial<Component>) => setDef({ ...def, components: def.components.map((c, j) => (j === i ? { ...c, ...p } : c)) })
  const move = (i: number, dir: number) => { const cs = [...def.components]; const j = i + dir; if (j < 0 || j >= cs.length) return; [cs[i], cs[j]] = [cs[j], cs[i]]; setDef({ ...def, components: cs }) }

  async function save() {
    const r = await ask(tr('تبدیلی کی وجہ (نیا ورژن بنے گا)', 'Reason (a new version will be created)', 'سبب التعديل (ستُنشأ نسخة جديدة)')); if (!r) return
    const nid = await saveSchemeVersion(row!, def!, meta!, r)
    d.toast(tr('نیا ورژن محفوظ ہو گیا', 'New version saved', 'حُفظت النسخة الجديدة')); nav(`/schemes/${nid}`)
    setDef(null)
  }
  const addComponent = () => setDef({ ...def, components: [...def.components, { key: `c${Date.now().toString(36)}`, group: def.groups[0]?.key ?? 'main', method: 'manual', name: { ur: tr('نیا مضمون', 'New subject'), en: 'New subject' }, questions: [{ marks: 10 }] }] })

  return (
    <div className="stack">
      <div className="row between wrap">
        <h1>{tr('اسکیم بنائیں / ترمیم', 'Build / edit scheme', 'بناء المخطط')} · v<Num>{row.version}</Num></h1>
        <div className="row"><Link className="btn ghost" to="/schemes">{tr('واپس', 'Back', 'رجوع')}</Link><button className="primary" disabled={errors.length > 0 || row.status !== 'active'} onClick={save}>{tr('نیا ورژن محفوظ کریں', 'Save as new version', 'حفظ نسخة جديدة')}</button></div>
      </div>
      {row.status !== 'active' && <div className="banner warn">{tr('یہ پرانا ورژن ہے؛ صرف دیکھا جا سکتا ہے۔', 'This is an earlier version; read only.', 'نسخة قديمة للعرض فقط.')}</div>}
      <div className="totals-bar">
        <b>{tr('کل', 'Total', 'المجموع')}: <Num>{schemeTotal(def)}</Num></b>
        {def.groups.map((g) => <span key={g.key}>{lt(g.name)}: <Num>{groupTotal(def, g.key, 'nazira', 'awwal')}</Num></span>)}
        {schemeTotal(def, 'nazira', 'ibtidaiya') !== schemeTotal(def) && <span>{tr('حصہ ابتدائیہ', 'Preliminary part')}: <Num>{schemeTotal(def, 'nazira', 'ibtidaiya')}</Num></span>}
        {issues.map((x, i) => <Badge key={i} kind={x.level === 'error' ? 'err' : 'warn'}>{({
          'non-positive-marks': tr('صفر یا منفی نمبر نہیں ہو سکتے', 'Marks must be above zero', 'الدرجة يجب أن تكون موجبة'),
          'total-mismatch': tr(`مطلوبہ کل ${def.intendedTotal} ہے، سوالات کا مجموعہ ${schemeTotal(def)}`, `Intended total is ${def.intendedTotal}, questions add up to ${schemeTotal(def)}`, `المجموع المقصود ${def.intendedTotal}`),
          'duplicate-key': tr('ایک ہی نام کا حصہ دو بار', 'Duplicate component', 'مكوّن مكرر'),
          'no-questions': tr('کم از کم ایک سوال شامل کریں', 'Add at least one question', 'أضف سؤالاً'),
          'option-above-max': tr('زمرے کے نمبر کل سے زیادہ', 'Category marks above the maximum', 'درجة الفئة أعلى من الحد'),
        } as Record<string, string>)[x.msg]}{x.key ? ` (${x.key})` : ''}</Badge>)}
      </div>

      <Card title={tr('بنیادی معلومات', 'Basics', 'الأساسيات')}>
        <div className="grid2">
          <Field label={tr('نام', 'Name')}><input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} /></Field>
          <Field label={tr('مطلوبہ کل نمبر (اختیاری)', 'Intended total (optional)', 'المجموع المقصود')}><input type="number" dir="ltr" value={def.intendedTotal ?? ''} onChange={(e) => setDef({ ...def, intendedTotal: e.target.value ? +e.target.value : undefined })} /></Field>
          <Field label={tr('دائرہ', 'Scope', 'النطاق')}>
            <Select value={meta.scope} onChange={(v) => setMeta({ ...meta, scope: v, scope_id: null })} options={[{ v: 'org', t: scopeName('org') }, { v: 'branch', t: scopeName('branch') }, { v: 'class', t: scopeName('class') }]} />
          </Field>
          {meta.scope !== 'org' && <Field label={scopeName(meta.scope)}>
            <Select value={meta.scope_id ?? ''} empty="" onChange={(v) => setMeta({ ...meta, scope_id: v })} options={(meta.scope === 'class' ? classes ?? [] : branches ?? []).map((x) => ({ v: x.id, t: x.name }))} />
          </Field>}
        </div>
        <div className="row wrap"><span className="qlabel">{tr('کن امتحانات کے لیے', 'Used for', 'يُستخدم في')}:</span>
          {EXAM_KINDS.map((k) => <label key={k.v} className="check"><input type="checkbox" checked={meta.kinds.includes(k.v)} onChange={(e) => setMeta({ ...meta, kinds: e.target.checked ? [...meta.kinds, k.v] : meta.kinds.filter((x) => x !== k.v) })} />{tr(k.ur, k.en, k.ar)}</label>)}
        </div>
      </Card>

      {def.components.map((c, i) => (
        <Card key={c.key} title={`${lt(c.name)} · ${methodName(c.method)}`} actions={<>
          <Badge kind="muted"><Num>{componentMax(c)}</Num></Badge>
          <button className="ghost sm" onClick={() => move(i, -1)}>↑</button><button className="ghost sm" onClick={() => move(i, 1)}>↓</button>
          <button className="ghost sm" onClick={() => setDef({ ...def, components: def.components.filter((_, j) => j !== i) })}>✕</button>
        </>}>
          <div className="grid2">
            <Field label={tr('نام (اردو)', 'Name (Urdu)', 'الاسم (أردو)')}><input value={c.name.ur} onChange={(e) => upC(i, { name: { ...c.name, ur: e.target.value } })} /></Field>
            <Field label={tr('نام (انگریزی)', 'Name (English)', 'الاسم (إنجليزي)')}><input dir="ltr" value={c.name.en} onChange={(e) => upC(i, { name: { ...c.name, en: e.target.value } })} /></Field>
            <Field label={tr('طریقہ', 'Scoring method', 'طريقة الرصد')}>
              <Select value={c.method} onChange={(v) => upC(i, { method: v as Method, ...(v === 'band' || v === 'category' ? { max: c.max ?? 10 } : {}), ...(v === 'deduction' ? { max: c.max ?? 40, cfg: { ...c.cfg, types: c.cfg?.types ?? [{ key: 'ghalti', name: { ur: 'غلطی', en: 'Mistake' }, points: 1 }] } } : {}), ...(v === 'category' ? { cfg: { ...c.cfg, options: c.cfg?.options ?? { m: [{ key: 'a', name: { ur: 'اچھا', en: 'Good' }, marks: c.max ?? 10 }], f: [{ key: 'a', name: { ur: 'اچھا', en: 'Good' }, marks: c.max ?? 10 }] } } } : {}) })}
                options={METHODS.filter((m) => m.v !== 'recitation' || c.method === 'recitation').map((m) => ({ v: m.v, t: tr(m.ur, m.en, m.ar) }))} />
            </Field>
            <Field label={tr('گروپ', 'Group', 'المجموعة')}><Select value={c.group} onChange={(v) => upC(i, { group: v })} options={def.groups.map((g) => ({ v: g.key, t: lt(g.name) }))} /></Field>
          </div>
          <AppliesTo c={c} onChange={(appliesTo) => upC(i, { appliesTo })} />
          {(c.method === 'manual' || c.method === 'outcome') && <Questions c={c} onChange={(questions) => upC(i, { questions })} />}
          {c.method === 'outcome' && (
            <div className="row wrap">
              <Field label={tr('کچھ درست پر کٹوتی', 'Deduction for partly correct', 'خصم الجزئي')}><input type="number" dir="ltr" value={c.cfg?.partialDeduct ?? 5} onChange={(e) => upC(i, { cfg: { ...c.cfg, partialDeduct: +e.target.value } })} /></Field>
              <Field label={tr('سب غلط: آسان سوال پر کم از کم', 'All wrong: minimum for easy questions', 'الحد الأدنى للأسئلة السهلة')}><input type="number" dir="ltr" value={c.cfg?.fallbackMin ?? 8} onChange={(e) => upC(i, { cfg: { ...c.cfg, fallbackMin: +e.target.value } })} /></Field>
            </div>
          )}
          {(c.method === 'band' || c.method === 'category' || c.method === 'deduction' || c.method === 'recitation') && (
            <Field label={tr('کل نمبر', 'Maximum', 'الحد الأعلى')}><input type="number" dir="ltr" value={c.max ?? 0} disabled={c.method === 'recitation'} onChange={(e) => upC(i, { max: +e.target.value })} /></Field>
          )}
          {c.method === 'deduction' && (
            <div className="stack">
              {(c.cfg?.types ?? []).map((t, k) => (
                <div key={k} className="row wrap">
                  <input value={t.name.ur} onChange={(e) => upC(i, { cfg: { ...c.cfg, types: c.cfg!.types!.map((x, z) => z === k ? { ...x, name: { ...x.name, ur: e.target.value } } : x) } })} />
                  <input type="number" dir="ltr" style={{ width: 80 }} value={t.points} onChange={(e) => upC(i, { cfg: { ...c.cfg, types: c.cfg!.types!.map((x, z) => z === k ? { ...x, points: +e.target.value } : x) } })} />
                  <label className="check"><input type="checkbox" checked={!!t.oncePerKey} onChange={(e) => upC(i, { cfg: { ...c.cfg, types: c.cfg!.types!.map((x, z) => z === k ? { ...x, oncePerKey: e.target.checked, askKey: e.target.checked ? x.askKey ?? 'rule' : undefined } : x) } })} />{tr('ایک ہی غلطی ایک بار', 'Same mistake counts once', 'الخطأ نفسه مرة')}</label>
                  <button className="ghost sm" onClick={() => upC(i, { cfg: { ...c.cfg, types: c.cfg!.types!.filter((_, z) => z !== k) } })}>✕</button>
                </div>
              ))}
              <div className="row"><button className="ghost sm" onClick={() => upC(i, { cfg: { ...c.cfg, types: [...(c.cfg?.types ?? []), { key: `t${Date.now().toString(36)}`, name: { ur: 'غلطی', en: 'Mistake' }, points: 1 }] } })}>{tr('غلطی کی قسم شامل کریں', 'Add mistake type', 'إضافة نوع خطأ')}</button>
                <Field label={tr('اضافی نمبر', 'Bonus', 'إضافي')}><input type="number" dir="ltr" style={{ width: 80 }} value={c.cfg?.bonus ?? 0} onChange={(e) => upC(i, { cfg: { ...c.cfg, bonus: +e.target.value } })} /></Field></div>
            </div>
          )}
          {c.method === 'category' && (
            <div className="grid2">{(['m', 'f'] as const).map((g) => (
              <div key={g} className="stack"><b>{g === 'm' ? tr('طلبہ', 'Boys', 'البنون') : tr('طالبات', 'Girls', 'البنات')}</b>
                {(c.cfg?.options?.[g] ?? []).map((o, k) => (
                  <div key={k} className="row">
                    <input value={o.name.ur} onChange={(e) => upC(i, { cfg: { ...c.cfg, options: { ...c.cfg!.options, [g]: c.cfg!.options![g].map((x, z) => z === k ? { ...x, name: { ...x.name, ur: e.target.value } } : x) } } })} />
                    <input type="number" dir="ltr" style={{ width: 70 }} value={o.marks} onChange={(e) => upC(i, { cfg: { ...c.cfg, options: { ...c.cfg!.options, [g]: c.cfg!.options![g].map((x, z) => z === k ? { ...x, marks: +e.target.value } : x) } } })} />
                    <button className="ghost sm" onClick={() => upC(i, { cfg: { ...c.cfg, options: { ...c.cfg!.options, [g]: c.cfg!.options![g].filter((_, z) => z !== k) } } })}>✕</button>
                  </div>
                ))}
                <button className="ghost sm" onClick={() => upC(i, { cfg: { ...c.cfg, options: { ...(c.cfg?.options ?? {}), [g]: [...(c.cfg?.options?.[g] ?? []), { key: `o${Date.now().toString(36)}`, name: { ur: '', en: '' }, marks: 0 }] } } })}>{tr('زمرہ شامل کریں', 'Add category', 'إضافة فئة')}</button>
              </div>
            ))}</div>
          )}
          {c.method === 'recitation' && <p className="hint">{tr('قاعدہ: 3 × 18 + تعوذ 3 + تسمیہ 3 · ناظرہ: 2 × 22 + حفظ سورۃ 10 + 6 · حفظ: پاروں کے حساب سے 2 / 3 / 4 سوال', 'Qaida: 3 × 18 + 3 + 3 · Nazira: 2 × 22 + surah 10 + 6 · Hifz: 2 / 3 / 4 questions by paras', 'القاعدة 3×18+6 · النظرة 2×22+10+6 · الحفظ 2/3/4 أسئلة')}</p>}
        </Card>
      ))}
      <div className="row wrap">
        <button className="primary" onClick={addComponent}>{tr('مضمون / حصہ شامل کریں', 'Add subject or component', 'إضافة مادة')}</button>
        <button className="ghost" onClick={() => setDef({ ...def, groups: [...def.groups, { key: `g${Date.now().toString(36)}`, name: { ur: tr('نیا گروپ', 'New group'), en: 'New group' } }] })}>{tr('گروپ شامل کریں', 'Add group', 'إضافة مجموعة')}</button>
      </div>
    </div>
  )
}

function Questions({ c, onChange }: { c: Component; onChange: (q: { marks: number }[]) => void }) {
  const qs = c.questions ?? []
  return (
    <div className="row wrap">
      {qs.map((q, i) => (
        <span key={i} className="qchip">
          <span className="muted">{tr('سوال', 'Q', 'س')} <Num>{i + 1}</Num></span>
          <input type="number" dir="ltr" min={1} value={q.marks} onChange={(e) => onChange(qs.map((x, j) => (j === i ? { marks: +e.target.value } : x)))} />
          <button className="ghost sm" onClick={() => onChange(qs.filter((_, j) => j !== i))}>✕</button>
        </span>
      ))}
      <button className="ghost sm" onClick={() => onChange([...qs, { marks: qs[qs.length - 1]?.marks ?? 10 }])}>{tr('سوال شامل کریں', 'Add question', 'إضافة سؤال')}</button>
      <span className="muted">= <Num>{qs.reduce((a, q) => a + (q.marks || 0), 0)}</Num></span>
    </div>
  )
}

function AppliesTo({ c, onChange }: { c: Component; onChange: (a: Component['appliesTo']) => void }) {
  const a = c.appliesTo ?? {}
  const toggle = (k: 'tracks' | 'excludeParts', v: string) => {
    const cur = a[k] ?? []
    onChange({ ...a, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] })
  }
  return (
    <div className="stack">
      <div className="row wrap"><span className="qlabel">{tr('شعبے (خالی = سب)', 'Tracks (none = all)', 'الأقسام')}:</span>
        {opts(TRACKS).map((t) => <label key={t.v} className="check"><input type="checkbox" checked={(a.tracks ?? []).includes(t.v)} onChange={() => toggle('tracks', t.v)} />{t.t}</label>)}</div>
      <div className="row wrap"><span className="qlabel">{tr('ان حصوں میں نہیں', 'Not in parts', 'لا يشمل الأجزاء')}:</span>
        {opts(PARTS).map((t) => <label key={t.v} className="check"><input type="checkbox" checked={(a.excludeParts ?? []).includes(t.v)} onChange={() => toggle('excludeParts', t.v)} />{t.t}</label>)}</div>
    </div>
  )
}
