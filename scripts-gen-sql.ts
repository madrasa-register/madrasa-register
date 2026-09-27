import { AppSchema } from './src/db/schema'
import { writeFileSync } from 'fs'
const tables = AppSchema.tables
const pgType = (t: string) => (t === 'INTEGER' ? 'bigint' : t === 'REAL' ? 'double precision' : 'text')
let sql = `-- Maktab App: Supabase schema, access rules and PowerSync publication.
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- Nothing is ever deleted: there are no DELETE rights for app users.

create table if not exists public.app_member (
  user_id uuid primary key references auth.users(id),
  organization_id text not null,
  branch_id text,
  role text not null check (role in ('admin','nazim','teacher','examiner')),
  app_user_id text,
  created_at timestamptz default now()
);
alter table public.app_member enable row level security;
drop policy if exists "member reads self" on public.app_member;
create policy "member reads self" on public.app_member for select to authenticated using (user_id = auth.uid());
grant select on public.app_member to authenticated;

-- helpers (security definer so policies can read app_member)
create or replace function public.m_org() returns text language sql stable security definer set search_path = public as
$$ select organization_id from app_member where user_id = auth.uid() $$;
create or replace function public.m_branch() returns text language sql stable security definer set search_path = public as
$$ select branch_id from app_member where user_id = auth.uid() $$;
create or replace function public.m_role() returns text language sql stable security definer set search_path = public as
$$ select role from app_member where user_id = auth.uid() $$;

-- read: own organization; non-admins only their branch plus organization-wide rows
-- write: admins anywhere in the organization; others only in their branch
`
for (const t of tables) {
  const cols = t.columns.map((c: any) => `  ${c.name} ${pgType(c.type)}`).join(',\n')
  const n = t.name
  sql += `
create table if not exists public.${n} (
  id text primary key,
${cols}
);
${t.columns.map((c: any) => `alter table public.${n} add column if not exists ${c.name} ${pgType(c.type)};`).join('\n')}
alter table public.${n} enable row level security;
drop policy if exists "${n} read" on public.${n};
create policy "${n} read" on public.${n} for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "${n} insert" on public.${n};
create policy "${n} insert" on public.${n} for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "${n} update" on public.${n};
create policy "${n} update" on public.${n} for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.${n} to authenticated;
`
}
sql += `
-- First sign-in: the first user of a new organization becomes its head-office admin.
create or replace function public.claim_organization(org text, app_user text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from app_member where user_id = auth.uid()) then return 'already-member'; end if;
  if exists (select 1 from app_member where organization_id = org) then return 'organization-taken'; end if;
  insert into app_member(user_id, organization_id, branch_id, role, app_user_id) values (auth.uid(), org, null, 'admin', app_user);
  return 'ok';
end $$;
grant execute on function public.claim_organization(text, text) to authenticated;

-- Head office / nazim gives an existing sign-in (by e-mail) a role in their organization.
create or replace function public.add_member(member_email text, member_role text, member_branch text, app_user text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid; me app_member;
begin
  select * into me from app_member where user_id = auth.uid();
  if me is null or me.role not in ('admin','nazim') then return 'not-allowed'; end if;
  if me.role = 'nazim' and (member_role = 'admin' or member_branch is distinct from me.branch_id) then return 'not-allowed'; end if;
  select id into uid from auth.users where lower(email) = lower(member_email);
  if uid is null then return 'no-such-user'; end if;
  insert into app_member(user_id, organization_id, branch_id, role, app_user_id)
  values (uid, me.organization_id, member_branch, member_role, app_user)
  on conflict (user_id) do update set role = excluded.role, branch_id = excluded.branch_id, app_user_id = excluded.app_user_id
  where app_member.organization_id = me.organization_id;
  return 'ok';
end $$;
grant execute on function public.add_member(text, text, text, text) to authenticated;

-- PowerSync reads changes through this publication
drop publication if exists powersync;
create publication powersync for table public.app_member, ${tables.map((t: any) => 'public.' + t.name).join(', ')};
`
writeFileSync('supabase/schema.sql', sql)

let yaml = `# PowerSync sync rules for Maktab App. Paste into PowerSync dashboard → Sync Streams (sync config editor).
bucket_definitions:
  # head office admins: everything in their organization
  org_admin:
    parameters: SELECT organization_id AS org FROM app_member WHERE user_id = request.user_id() AND role = 'admin'
    data:
${tables.map((t: any) => `      - SELECT * FROM ${t.name} WHERE organization_id = bucket.org`).join('\n')}
  # everyone else: their branch
  branch:
    parameters: SELECT organization_id AS org, branch_id AS branch FROM app_member WHERE user_id = request.user_id() AND role != 'admin'
    data:
${tables.map((t: any) => `      - SELECT * FROM ${t.name} WHERE organization_id = bucket.org AND branch_id = bucket.branch`).join('\n')}
  # organization-wide rows (settings, years, schemes, Hijri overrides, organization)
  org_shared:
    parameters: SELECT organization_id AS org FROM app_member WHERE user_id = request.user_id() AND role != 'admin'
    data:
${tables.map((t: any) => `      - SELECT * FROM ${t.name} WHERE organization_id = bucket.org AND branch_id IS NULL`).join('\n')}
`
writeFileSync('supabase/sync-rules.yaml', yaml)
console.log('tables', tables.length, 'sql bytes', sql.length)
