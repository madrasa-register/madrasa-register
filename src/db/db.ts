// Local SQLite (via PowerSync) + write helpers. All writes go through here so
// that: every row is stamped with organization/branch/user/time, nothing is
// ever deleted, and every change to an existing record leaves an audit row.
import { PowerSyncDatabase } from '@powersync/web'
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid'
import { AppSchema } from './schema'

export type Row = Record<string, any> & { id: string }

const NS = '6f1c2b8e-7a44-4b6a-9a51-3c0f1d7e9b21' // namespace for deterministic ids

/** Same inputs → same id on every device, so offline marks for (student, date) never duplicate. */
export function detId(...parts: string[]) {
  return uuidv5(parts.join('|'), NS)
}
export const newId = () => uuidv4()
export const nowIso = () => new Date().toISOString()
export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function deviceId(): string {
  try {
    let id = localStorage.getItem('maktab.device')
    if (!id) { id = uuidv4(); localStorage.setItem('maktab.device', id) }
    return id
  } catch { return 'device-unknown' }
}

// ---- Opening the database ---------------------------------------------------
let _db: PowerSyncDatabase | null = null
export let dbMode = ''

async function tryOpen(useWebWorker: boolean): Promise<PowerSyncDatabase> {
  const db = new PowerSyncDatabase({
    schema: AppSchema,
    database: { dbFilename: 'maktab.db', enableMultiTabs: false, useWebWorker },
  })
  await Promise.race([
    db.init(),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000)),
  ])
  await db.getAll('select 1')
  return db
}

export async function openDb(): Promise<PowerSyncDatabase> {
  if (_db) return _db
  try {
    _db = await tryOpen(true); dbMode = 'worker'
  } catch (e) {
    console.warn('Worker SQLite failed, falling back to main thread', e)
    _db = await tryOpen(false); dbMode = 'main'
  }
  return _db
}
export function db(): PowerSyncDatabase {
  if (!_db) throw new Error('db not open')
  return _db
}

// ---- Session (who is using this device) --------------------------------------
export type Session = { orgId: string; branchId: string | null; userId: string; role: string; teacherId: string | null }
export const session: Session = { orgId: '', branchId: null, userId: '', role: '', teacherId: null }

// ---- Reads -------------------------------------------------------------------
export const all = <T = Row>(sql: string, params: any[] = []) => db().getAll<T>(sql, params)
export const one = <T = Row>(sql: string, params: any[] = []) => db().getOptional<T>(sql, params)
export const get = (table: string, id: string) => one(`select * from ${table} where id = ?`, [id])

// ---- Writes ------------------------------------------------------------------
type InsertOpts = { id?: string; audit?: boolean; branchId?: string | null; reason?: string }

export async function insert(table: string, data: Record<string, any>, opts: InsertOpts = {}): Promise<string> {
  const id = opts.id ?? newId()
  const t = nowIso()
  const row: Record<string, any> = {
    organization_id: session.orgId,
    branch_id: opts.branchId !== undefined ? opts.branchId : session.branchId,
    created_at: t, created_by: session.userId, updated_at: t, updated_by: session.userId,
    ...data,
  }
  const cols = Object.keys(row)
  await db().writeTransaction(async (tx) => {
    await tx.execute(
      `insert into ${table} (id, ${cols.join(',')}) values (?, ${cols.map(() => '?').join(',')})`,
      [id, ...cols.map((c) => row[c])],
    )
    if (opts.audit !== false) await writeAudit(tx, table, id, 'create', null, data, opts.reason ?? null, row.branch_id)
  })
  return id
}

export class ReasonRequired extends Error {}

/**
 * Change fields of an existing record. The previous values are kept in the
 * audit log together with the reason. Pass requireReason=false only for the
 * cases the approved rules allow (attendance before the register is saved).
 */
export async function update(
  table: string, id: string, changes: Record<string, any>,
  reason: string | null, opts: { action?: string; requireReason?: boolean; audit?: boolean } = {},
) {
  const requireReason = opts.requireReason ?? true
  if (requireReason && !reason?.trim()) throw new ReasonRequired('reason required')
  const old = await get(table, id)
  if (!old) throw new Error(`${table} ${id} not found`)
  const diffOld: Record<string, any> = {}, diffNew: Record<string, any> = {}
  for (const [k, v] of Object.entries(changes)) {
    if ((old[k] ?? null) !== (v ?? null)) { diffOld[k] = old[k] ?? null; diffNew[k] = v ?? null }
  }
  if (!Object.keys(diffNew).length) return
  const t = nowIso()
  const set: Record<string, any> = { ...diffNew, updated_at: t, updated_by: session.userId }
  const cols = Object.keys(set)
  await db().writeTransaction(async (tx) => {
    await tx.execute(`update ${table} set ${cols.map((c) => `${c} = ?`).join(', ')} where id = ?`, [...cols.map((c) => set[c]), id])
    if (opts.audit !== false) await writeAudit(tx, table, id, opts.action ?? 'update', diffOld, diffNew, reason, old.branch_id)
  })
}

async function writeAudit(tx: any, table: string, rowId: string, action: string, oldV: any, newV: any, reason: string | null, branchId: string | null) {
  const t = nowIso()
  await tx.execute(
    `insert into audit_log (id, organization_id, branch_id, created_at, created_by, updated_at, updated_by, table_name, row_id, action, old_json, new_json, reason, device_id)
     values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [newId(), session.orgId, branchId, t, session.userId, t, session.userId, table, rowId, action,
      oldV ? JSON.stringify(oldV) : null, newV ? JSON.stringify(newV) : null, reason, deviceId()],
  )
}

// ---- Change notifications -----------------------------------------------------
type Listener = () => void
const listeners = new Set<Listener>()
export function subscribe(fn: Listener) { listeners.add(fn); return () => { listeners.delete(fn) } }
export function startWatching() {
  db().onChange({ onChange: () => listeners.forEach((l) => l()) }, { tables: AppSchema.tables.map((t) => t.name), throttleMs: 50 })
}
