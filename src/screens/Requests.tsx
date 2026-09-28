// Platform owner: approve or reject new organizations that want to sync online.
import { useState } from 'react'
import { tr, useQuery, Card, Empty, Badge, useDialog, fmtDate, Num } from '../ui'
import { orgRequests, decideOrgRequest } from '../sync'

export function OrgRequests() {
  const d = useDialog()
  const [v, setV] = useState(0)
  const rows = useQuery(() => orgRequests().catch(() => null), [v])
  async function decide(uid: string, approve: boolean) {
    const ok = await d.open({ title: approve ? tr('منظور کریں؟', 'Approve?', 'موافقة؟') : tr('نامنظور کریں؟', 'Reject?', 'رفض؟') })
    if (!ok) return
    try {
      const r = await decideOrgRequest(uid, approve)
      d.toast(r === 'ok' ? tr('محفوظ', 'Saved', 'حُفظ') : r, r === 'ok' ? 'ok' : 'err')
      setV(v + 1)
    } catch (e) { d.toast(tr('انٹرنیٹ درکار ہے', 'Internet needed', 'يلزم الإنترنت') + ' — ' + String(e), 'err') }
  }
  const badge = (s: string) => s === 'approved' ? <Badge kind="ok">{tr('منظور', 'Approved', 'موافق')}</Badge>
    : s === 'rejected' ? <Badge kind="err">{tr('نامنظور', 'Rejected', 'مرفوض')}</Badge> : <Badge kind="warn">{tr('انتظار', 'Pending', 'قيد الانتظار')}</Badge>
  return (
    <div className="stack">
      <h1>{tr('نئے اداروں کی درخواستیں', 'New organization requests', 'طلبات المؤسسات الجديدة')}</h1>
      <p className="hint">{tr('منظوری کے بعد ادارے کا ڈیٹا آن لائن محفوظ ہونے لگتا ہے اور وہ اپنے اساتذہ کو خود لاگ اِن دے سکتا ہے۔ ہر ادارے کا ڈیٹا الگ رہتا ہے۔', 'Once approved, the organization syncs online and can give logins to its own staff. Each organization\'s data stays separate.', 'بعد الموافقة تُزامَن بيانات المؤسسة وتبقى منفصلة.')}</p>
      {rows === null && <Empty>{tr('انٹرنیٹ درکار ہے', 'Internet needed', 'يلزم الإنترنت')}</Empty>}
      {rows && rows.length === 0 && <Empty>{tr('کوئی درخواست نہیں', 'No requests', 'لا طلبات')}</Empty>}
      {rows?.map((r) => (
        <Card key={r.user_id} title={r.org_name ?? r.organization_id} actions={badge(r.status)}>
          <div>{r.branch_name}{r.address ? ` · ${r.address}` : ''}</div>
          <div className="muted"><span dir="ltr">{r.email}</span> · <Num>{fmtDate(r.created_at)}</Num></div>
          {r.status !== 'approved' && (
            <div className="row end wrap">
              {r.status === 'pending' && <button className="ghost" onClick={() => decide(r.user_id, false)}>{tr('نامنظور', 'Reject', 'رفض')}</button>}
              <button className="primary" onClick={() => decide(r.user_id, true)}>{tr('منظور کریں', 'Approve', 'موافقة')}</button>
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}
