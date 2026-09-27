// Phase 1 schema (Spec §4). PowerSync tables: each gets a text `id` column
// automatically. Every row carries organization_id and branch_id (Spec §3,
// tenancy) plus who/when fields. There is no delete anywhere in the app.
import { Schema, Table, column } from '@powersync/web'

const base = {
  organization_id: column.text,
  branch_id: column.text,
  created_at: column.text,
  created_by: column.text,
  updated_at: column.text,
  updated_by: column.text,
}

export const AppSchema = new Schema({
  organization: new Table({ ...base, name: column.text, logo: column.text }),
  setting: new Table({ ...base, key: column.text, value: column.text }, { indexes: { k: ['key'] } }),
  branch: new Table({ ...base, name: column.text, address: column.text, weekly_holiday: column.text }),
  academic_year: new Table({ ...base, label: column.text, start_date: column.text, end_date: column.text, config: column.text }),
  hijri_override: new Table({ ...base, hy: column.integer, hm: column.integer, start: column.text, reason: column.text }),
  app_user: new Table({ ...base, name: column.text, role: column.text, teacher_id: column.text, status: column.text, email: column.text }),
  teacher: new Table({
    ...base, name: column.text, phone: column.text, gender: column.text,
    status: column.text, left_date: column.text, left_reason: column.text,
  }),
  class: new Table({
    ...base, academic_year_id: column.text, name: column.text, track: column.text, curriculum_part: column.text,
    shift: column.text, start_time: column.text, end_time: column.text, gender: column.text,
    capacity: column.integer, status: column.text,
  }),
  class_teacher: new Table({ ...base, class_id: column.text, teacher_id: column.text, from_date: column.text, to_date: column.text },
    { indexes: { cls: ['class_id'], tch: ['teacher_id'] } }),
  family: new Table({
    ...base, guardian_name: column.text, relation: column.text,
    phone1: column.text, phone2: column.text, whatsapp1: column.integer, whatsapp2: column.integer, address: column.text,
  }),
  student: new Table({
    ...base, family_id: column.text, serial_no: column.integer, name: column.text, walidiyat: column.text,
    gender: column.text, dob: column.text, admission_date: column.text,
    status: column.text, left_date: column.text, left_reason: column.text, notes: column.text,
  }, { indexes: { fam: ['family_id'] } }),
  enrollment: new Table({
    ...base, student_id: column.text, academic_year_id: column.text, class_id: column.text,
    track: column.text, curriculum_part: column.text, miqdar: column.text,
    from_date: column.text, to_date: column.text, roll_no: column.integer,
  }, { indexes: { stu: ['student_id'], cls: ['class_id'] } }),
  monthly_class_record: new Table({ ...base, class_id: column.text, month: column.text, curriculum_part: column.text, lesson_no: column.text }),
  class_day: new Table({
    ...base, class_id: column.text, date: column.text, kind: column.text, holiday_reason: column.text,
    submitted_at: column.text, submitted_by: column.text,
  }, { indexes: { cd: ['class_id', 'date'] } }),
  student_attendance: new Table({
    ...base, class_id: column.text, student_id: column.text, date: column.text, status: column.text,
    absence_reason: column.text, follow_up_note: column.text,
  }, { indexes: { sd: ['student_id', 'date'], cd: ['class_id', 'date'] } }),
  teacher_attendance: new Table({ ...base, teacher_id: column.text, date: column.text, arrival: column.text, departure: column.text, note: column.text },
    { indexes: { td: ['teacher_id', 'date'] } }),
  alert: new Table({
    ...base, type: column.text, student_id: column.text, class_id: column.text, trigger_date: column.text,
    detail: column.text, status: column.text, action: column.text, note: column.text,
    resolved_at: column.text, resolved_by: column.text,
  }),
  eligibility_exception: new Table({ ...base, student_id: column.text, from_date: column.text, to_date: column.text, reason: column.text }),
  message_log: new Table({ ...base, family_id: column.text, student_id: column.text, channel: column.text, purpose: column.text, body: column.text }),
  mark_scheme: new Table({
    ...base, name: column.text, version: column.integer, lineage_id: column.text, scope: column.text, scope_id: column.text,
    kinds: column.text, definition: column.text, status: column.text,
  }),
  exam: new Table({
    ...base, class_id: column.text, academic_year_id: column.text, kind: column.text, cycle: column.integer, date: column.text,
    scheme_id: column.text, examiner_name: column.text, examiner_user_id: column.text, class_remark: column.text,
    signed_by: column.text, signed_at: column.text, finalized_at: column.text, finalized_by: column.text, makeup_of: column.text,
  }, { indexes: { cls: ['class_id'] } }),
  exam_student: new Table({
    ...base, exam_id: column.text, student_id: column.text, variant: column.text, paras: column.integer,
    absent: column.integer, makeup: column.integer, grace: column.real, hold_promotion: column.integer, remark: column.text,
    concerns: column.text, practical: column.text, practical_reason: column.text,
    total: column.real, max: column.real, percent: column.integer, grade: column.text, complete: column.integer,
    att_percent: column.real, namazi: column.real, position: column.integer,
  }, { indexes: { ex: ['exam_id'], stu: ['student_id'] } }),
  score_entry: new Table({ ...base, exam_id: column.text, student_id: column.text, component_key: column.text, raw: column.text, marks: column.real, complete: column.integer },
    { indexes: { es: ['exam_id', 'student_id'] } }),
  deduction_event: new Table({
    ...base, exam_id: column.text, student_id: column.text, component_key: column.text, type: column.text, key: column.text,
    q: column.integer, points: column.real, voided: column.integer,
  }, { indexes: { es: ['exam_id', 'student_id'] } }),
  card_status: new Table({ ...base, student_id: column.text, academic_year_id: column.text, handed_five: column.text, returned_five: column.text, handed_annual: column.text }),
  fee_plan: new Table({ ...base, student_id: column.text, from_month: column.text, amount: column.real, exempt: column.integer, sponsor: column.text, note: column.text },
    { indexes: { stu: ['student_id'] } }),
  payment: new Table({
    ...base, family_id: column.text, payer: column.text, sponsor: column.integer, date: column.text, amount: column.real,
    receipt_no: column.integer, collector: column.text, kind: column.text, note: column.text,
  }),
  payment_allocation: new Table({ ...base, payment_id: column.text, student_id: column.text, month: column.text, amount: column.real, kind: column.text },
    { indexes: { stu: ['student_id'], pay: ['payment_id'] } }),
  fund_entry: new Table({ ...base, kind: column.text, date: column.text, amount: column.real, note: column.text }),
  activity_log: new Table({
    ...base, class_id: column.text, month: column.text, activity: column.text, done: column.integer,
    invited: column.integer, attended: column.integer, name: column.text, date: column.text,
  }, { indexes: { cls: ['class_id'] } }),
  audit_log: new Table({
    ...base, table_name: column.text, row_id: column.text, action: column.text,
    old_json: column.text, new_json: column.text, reason: column.text, device_id: column.text,
  }, { indexes: { row: ['row_id'] } }),
})

