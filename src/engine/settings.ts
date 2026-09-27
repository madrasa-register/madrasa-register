// Settings registry. Every rule value lives here with the spec's value as the
// default; nothing in the engines is hard-coded. Values can be overridden per
// organization or per branch (branch wins) from the Settings screen.

export type Band = { min: number; marks: number }

export type SettingDef = {
  key: string
  default: unknown
  kind: 'number' | 'boolean' | 'bands' | 'text' | 'choice'
  choices?: string[]
  source: string // spec reference
  toConfirm?: boolean
}

export const SETTING_DEFS: SettingDef[] = [
  {
    key: 'attendance.bands',
    kind: 'bands',
    // Reg. p. 58 — band reached only at its lower edge (no rounding up)
    default: [
      { min: 100, marks: 10 },
      { min: 90, marks: 8 },
      { min: 80, marks: 6 },
      { min: 70, marks: 4 },
      { min: 60, marks: 2 },
      { min: 0, marks: 0 },
    ] satisfies Band[],
    source: 'Spec §6, Reg. p. 58',
  },
  { key: 'attendance.leaveCountsAsAbsent', kind: 'boolean', default: true, source: 'Spec §6 (user decision 2026-09-24)' },
  { key: 'attendance.eligibilityMinPercent', kind: 'number', default: 60, source: 'Spec §6, Reg. p. 54' },
  { key: 'alerts.consecutiveAbsences', kind: 'number', default: 3, source: 'Spec §6, Reg. p. 54' },
  { key: 'alerts.leaveBreaksStreak', kind: 'boolean', default: true, source: 'Phase 1 approval (2026-09-26)' },
  { key: 'phone.countryCode', kind: 'text', default: '92', source: 'For WhatsApp links (03xx → 923xx)' },
  { key: 'hijri.offsetDays', kind: 'number', default: 0, source: 'Spec §5 rule 3 (+1 = months start a day after Umm al-Qura)' },
  { key: 'calendar.practiceWeekday', kind: 'number', default: 6, source: 'Spec §5 (Saturday in the sample calendars; 0 = Sunday … 6 = Saturday)' },
  { key: 'position.tieStyle', kind: 'choice', choices: ['competition', 'dense'], default: 'competition', source: 'Spec §8.1: equal totals share a position (1,1,3 or 1,1,2 — to confirm)', toConfirm: true },
  { key: 'hadiya.defaultAmount', kind: 'number', default: 500, source: 'Spec §10: minimum Rs 500 (Reg. p. 51, 64)' },
  { key: 'hadiya.shareWithHeadOffice', kind: 'boolean', default: false, source: 'Spec §10 proposal: head office sees totals only if the branch allows' },
  { key: 'prizes.teacherShare', kind: 'number', default: 95, source: 'Spec §8.3' },
  { key: 'card.instructions', kind: 'text', default: '', source: 'Spec §9: six guardian instructions from the printed card (one per line)' },
  { key: 'ui.language', kind: 'choice', choices: ['ur', 'ar', 'en'], default: 'ur', source: 'Spec §12' },
]

export type SettingsMap = Record<string, unknown>

export function defaultSettings(): SettingsMap {
  const m: SettingsMap = {}
  for (const d of SETTING_DEFS) m[d.key] = d.default
  return m
}

export function resolveSettings(
  rows: { key: string; value: string; branch_id: string | null }[],
  branchId: string | null,
): SettingsMap {
  const m = defaultSettings()
  for (const r of rows.filter((r) => !r.branch_id)) m[r.key] = JSON.parse(r.value)
  for (const r of rows.filter((r) => branchId && r.branch_id === branchId)) m[r.key] = JSON.parse(r.value)
  return m
}
