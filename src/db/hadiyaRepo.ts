// Hadiya ledger storage (Spec §10). Nothing is deleted: a fee change is a new
// plan row from a month; a wrong payment is reversed by a correcting entry.
import { all, one, insert, session, today, type Row } from './db'
import { loadSettings } from './repo'
import { chartRow, monthsBetween, type FeePlan, type Allocation } from '../engine/hadiya'

export async function plansFor(studentIds: string[]): Promise<FeePlan[]> {
  if (!studentIds.length) return []
  const rows = await all<Row>(`select * from fee_plan where student_id in (${studentIds.map(() => '?').join(',')})`, studentIds)
  return rows.map((r) => ({ student_id: r.student_id, from_month: r.from_month, amount: r.amount, exempt: !!r.exempt, sponsor: r.sponsor }))
}
export async function allocsFor(studentIds: string[]): Promise<Allocation[]> {
  if (!studentIds.length) return []
  const rows = await all<Row>(`select * from payment_allocation where student_id in (${studentIds.map(() => '?').join(',')})`, studentIds)
  return rows.map((r) => ({ student_id: r.student_id, month: r.month, amount: r.amount, kind: r.kind }))
}

/** Months a student is on the roll (admission month → left month). */
export function activeMonthsOf(s: Row, months: string[]) {
  const from = (s.admission_date ?? '0000-01').slice(0, 7)
  const to = s.left_date ? s.left_date.slice(0, 7) : '9999-12'
  return new Set(months.filter((m) => m >= from && m <= to))
}

export async function studentLedger(students: Row[], fromMonth: string, toMonth: string) {
  const ids = students.map((s) => s.id)
  const plans = await plansFor(ids)
  const st = await loadSettings()
  const def = Number(st['hadiya.defaultAmount'] ?? 500)
  // students without a plan use the branch default amount
  for (const s of students) if (!plans.some((p) => p.student_id === s.id)) plans.push({ student_id: s.id, from_month: '0000-01', amount: def })
  const allocs = await allocsFor(ids)
  const months = monthsBetween(fromMonth, toMonth)
  return { months, plans, rows: students.map((s) => ({ s, ...chartRow(s.id, months, plans, allocs, activeMonthsOf(s, months)) })) }
}

export async function nextReceiptNo(branchId: string | null) {
  const r = await one<{ m: number }>('select max(receipt_no) m from payment where organization_id = ? and (? is null or branch_id = ?)', [session.orgId, branchId, branchId])
  return (r?.m ?? 0) + 1
}

export async function recordPayment(p: {
  familyId: string; payer: string; sponsor: boolean; date: string; collector: string; note: string; kind: 'fee' | 'admission'
  allocations: Allocation[]; branchId: string | null
}) {
  const amount = p.allocations.reduce((a, x) => a + x.amount, 0)
  const receipt = await nextReceiptNo(p.branchId)
  const pid = await insert('payment', {
    family_id: p.familyId, payer: p.payer, sponsor: p.sponsor ? 1 : 0, date: p.date, amount, receipt_no: receipt,
    collector: p.collector, kind: p.kind, note: p.note,
  }, { branchId: p.branchId })
  for (const a of p.allocations) {
    await insert('payment_allocation', { payment_id: pid, student_id: a.student_id, month: a.month, amount: a.amount, kind: a.kind ?? 'monthly' }, { branchId: p.branchId, audit: false })
  }
  return { id: pid, receipt, amount }
}

/** Correction: a reversing entry with a reason (the original stays). */
export async function reversePayment(paymentId: string, reason: string) {
  const p = await one<Row>('select * from payment where id = ?', [paymentId])
  if (!p) return
  const allocs = await all<Row>('select * from payment_allocation where payment_id = ?', [paymentId])
  const receipt = await nextReceiptNo(p.branch_id)
  const rid = await insert('payment', { family_id: p.family_id, payer: p.payer, sponsor: p.sponsor, date: today(), amount: -p.amount, receipt_no: receipt, collector: p.collector, kind: p.kind, note: `واپسی: رسید ${p.receipt_no} — ${reason}` }, { branchId: p.branch_id, reason })
  for (const a of allocs) await insert('payment_allocation', { payment_id: rid, student_id: a.student_id, month: a.month, amount: -a.amount, kind: a.kind }, { branchId: p.branch_id, audit: false })
}

export async function setFeePlan(studentId: string, branchId: string, fromMonth: string, amount: number, exempt: boolean, sponsor: string, reason: string) {
  await insert('fee_plan', { student_id: studentId, from_month: fromMonth, amount, exempt: exempt ? 1 : 0, sponsor: sponsor || null, note: reason }, { branchId, reason })
}
