// Online sync and real sign-in.
// Supabase Auth gives the user a login; PowerSync uses that login's token to
// download the rows the user may see (sync rules) and to know who uploads.
// Local writes are queued by PowerSync and sent to Supabase by uploadData,
// where row-level security decides again what is allowed.
import { createClient, type Session as SbSession } from '@supabase/supabase-js'
import { UpdateType, type AbstractPowerSyncDatabase, type PowerSyncBackendConnector } from '@powersync/web'
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, POWERSYNC_URL } from './config'
import { db } from './db/db'

export const syncConfigured = !!(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && POWERSYNC_URL)

export const supabase = createClient(SUPABASE_URL || 'http://localhost', SUPABASE_PUBLISHABLE_KEY || 'none', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'maktab.auth' },
})

export type Member = { user_id: string; organization_id: string; branch_id: string | null; role: string; app_user_id: string | null }

// ---- local-only mode (device used without an account) -------------------------
export const isLocalOnly = () => { try { return localStorage.getItem('maktab.localOnly') === '1' } catch { return false } }
export const setLocalOnly = (on: boolean) => { try { on ? localStorage.setItem('maktab.localOnly', '1') : localStorage.removeItem('maktab.localOnly') } catch { /* ignore */ } }

// ---- membership (cached so the app opens offline) -----------------------------
const MEMBER_KEY = 'maktab.member'
export function cachedMember(): Member | null {
  try { const s = localStorage.getItem(MEMBER_KEY); return s ? JSON.parse(s) : null } catch { return null }
}
function cacheMember(m: Member | null) {
  try { m ? localStorage.setItem(MEMBER_KEY, JSON.stringify(m)) : localStorage.removeItem(MEMBER_KEY) } catch { /* ignore */ }
}

/** Reads this login's membership from Supabase; falls back to the cached copy when offline. */
export async function loadMember(userId: string): Promise<Member | null> {
  const { data, error } = await supabase.from('app_member').select('*').eq('user_id', userId).maybeSingle()
  if (error) {
    const c = cachedMember()
    return c && c.user_id === userId ? c : null
  }
  cacheMember(data as Member | null)
  return (data as Member) ?? null
}

export async function claimOrganization(orgId: string, appUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc('claim_organization', { org: orgId, app_user: appUserId })
  if (error) throw error
  return data as string
}

export async function addMember(email: string, role: string, branchId: string | null, appUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc('add_member', {
    member_email: email.trim(), member_role: role, member_branch: branchId, app_user: appUserId,
  })
  if (error) throw error
  return data as string
}

// ---- auth -----------------------------------------------------------------------
export async function currentSession(): Promise<SbSession | null> {
  const { data } = await supabase.auth.getSession()
  return data.session
}
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw error
  return data.session
}
export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
  if (error) throw error
  return data.session // null when e-mail confirmation is switched on
}
export async function signOut() {
  await disconnect()
  cacheMember(null)
  await supabase.auth.signOut()
}

// ---- uploads rejected by the server are kept, never silently dropped -------------
const REJ_KEY = 'maktab.rejected'
export function rejectedUploads(): any[] { try { return JSON.parse(localStorage.getItem(REJ_KEY) || '[]') } catch { return [] } }
function keepRejected(op: any, err: any) {
  try {
    const list = rejectedUploads()
    list.push({ at: new Date().toISOString(), table: op.table, id: op.id, op: op.op, data: op.opData, error: err?.message ?? String(err), code: err?.code })
    localStorage.setItem(REJ_KEY, JSON.stringify(list.slice(-500)))
  } catch { /* ignore */ }
}
// Postgres errors that will never succeed on retry: data errors, constraint errors, permission (RLS).
const FATAL = [/^22...$/, /^23...$/, /^42501$/]

class Connector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const s = await currentSession()
    if (!s) return null
    return { endpoint: POWERSYNC_URL, token: s.access_token, expiresAt: s.expires_at ? new Date(s.expires_at * 1000) : undefined }
  }

  async uploadData(database: AbstractPowerSyncDatabase) {
    const tx = await database.getNextCrudTransaction()
    if (!tx) return
    let last: any = null
    try {
      for (const op of tx.crud) {
        last = op
        const t = supabase.from(op.table)
        let res: any
        if (op.op === UpdateType.PUT) res = await t.upsert({ ...op.opData, id: op.id })
        else if (op.op === UpdateType.PATCH) res = await t.update(op.opData!).eq('id', op.id)
        else continue // the app never deletes; ignore just in case
        if (res.error) throw res.error
      }
      await tx.complete()
    } catch (e: any) {
      if (typeof e?.code === 'string' && FATAL.some((r) => r.test(e.code))) {
        console.error('Upload rejected by server, kept locally', e, last)
        keepRejected(last, e)
        await tx.complete()
      } else {
        throw e // network or temporary problem: PowerSync retries later
      }
    }
  }
}

// ---- connection status for the header ---------------------------------------------
export type SyncState = { connected: boolean; connecting: boolean; uploading: boolean; downloading: boolean; lastSyncedAt?: Date; hasSynced?: boolean }
let state: SyncState = { connected: false, connecting: false, uploading: false, downloading: false }
const listeners = new Set<(s: SyncState) => void>()
export const syncState = () => state
export function onSyncState(fn: (s: SyncState) => void) { listeners.add(fn); return () => { listeners.delete(fn) } }
let unregister: (() => void) | null = null
let active = false

export async function connect() {
  if (!syncConfigured || active) return
  active = true
  const d = db()
  unregister?.()
  unregister = d.registerListener({
    statusChanged: (s: any) => {
      state = {
        connected: s.connected, connecting: s.connecting,
        uploading: !!s.dataFlowStatus?.uploading, downloading: !!s.dataFlowStatus?.downloading,
        lastSyncedAt: s.lastSyncedAt, hasSynced: s.hasSynced,
      }
      listeners.forEach((l) => l(state))
    },
  })
  await d.connect(new Connector())
}
export async function disconnect() {
  if (!active) return
  active = false
  await db().disconnect()
}
/** Waits (up to `ms`) until the first full download from the server has finished. */
export async function waitForFirstSync(ms = 60000) {
  await Promise.race([db().waitForFirstSync(), new Promise((r) => setTimeout(r, ms))])
}
