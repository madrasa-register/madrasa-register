-- Maktab App: Supabase schema, access rules and PowerSync publication.
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

create table if not exists public.organization (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  name text,
  logo text
);
alter table public.organization add column if not exists organization_id text;
alter table public.organization add column if not exists branch_id text;
alter table public.organization add column if not exists created_at text;
alter table public.organization add column if not exists created_by text;
alter table public.organization add column if not exists updated_at text;
alter table public.organization add column if not exists updated_by text;
alter table public.organization add column if not exists name text;
alter table public.organization add column if not exists logo text;
alter table public.organization enable row level security;
drop policy if exists "organization read" on public.organization;
create policy "organization read" on public.organization for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "organization insert" on public.organization;
create policy "organization insert" on public.organization for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "organization update" on public.organization;
create policy "organization update" on public.organization for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.organization to authenticated;

create table if not exists public.setting (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  key text,
  value text
);
alter table public.setting add column if not exists organization_id text;
alter table public.setting add column if not exists branch_id text;
alter table public.setting add column if not exists created_at text;
alter table public.setting add column if not exists created_by text;
alter table public.setting add column if not exists updated_at text;
alter table public.setting add column if not exists updated_by text;
alter table public.setting add column if not exists key text;
alter table public.setting add column if not exists value text;
alter table public.setting enable row level security;
drop policy if exists "setting read" on public.setting;
create policy "setting read" on public.setting for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "setting insert" on public.setting;
create policy "setting insert" on public.setting for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "setting update" on public.setting;
create policy "setting update" on public.setting for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.setting to authenticated;

create table if not exists public.branch (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  name text,
  address text,
  weekly_holiday text
);
alter table public.branch add column if not exists organization_id text;
alter table public.branch add column if not exists branch_id text;
alter table public.branch add column if not exists created_at text;
alter table public.branch add column if not exists created_by text;
alter table public.branch add column if not exists updated_at text;
alter table public.branch add column if not exists updated_by text;
alter table public.branch add column if not exists name text;
alter table public.branch add column if not exists address text;
alter table public.branch add column if not exists weekly_holiday text;
alter table public.branch enable row level security;
drop policy if exists "branch read" on public.branch;
create policy "branch read" on public.branch for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "branch insert" on public.branch;
create policy "branch insert" on public.branch for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "branch update" on public.branch;
create policy "branch update" on public.branch for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.branch to authenticated;

create table if not exists public.academic_year (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  label text,
  start_date text,
  end_date text,
  config text
);
alter table public.academic_year add column if not exists organization_id text;
alter table public.academic_year add column if not exists branch_id text;
alter table public.academic_year add column if not exists created_at text;
alter table public.academic_year add column if not exists created_by text;
alter table public.academic_year add column if not exists updated_at text;
alter table public.academic_year add column if not exists updated_by text;
alter table public.academic_year add column if not exists label text;
alter table public.academic_year add column if not exists start_date text;
alter table public.academic_year add column if not exists end_date text;
alter table public.academic_year add column if not exists config text;
alter table public.academic_year enable row level security;
drop policy if exists "academic_year read" on public.academic_year;
create policy "academic_year read" on public.academic_year for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "academic_year insert" on public.academic_year;
create policy "academic_year insert" on public.academic_year for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "academic_year update" on public.academic_year;
create policy "academic_year update" on public.academic_year for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.academic_year to authenticated;

create table if not exists public.hijri_override (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  hy bigint,
  hm bigint,
  start text,
  reason text
);
alter table public.hijri_override add column if not exists organization_id text;
alter table public.hijri_override add column if not exists branch_id text;
alter table public.hijri_override add column if not exists created_at text;
alter table public.hijri_override add column if not exists created_by text;
alter table public.hijri_override add column if not exists updated_at text;
alter table public.hijri_override add column if not exists updated_by text;
alter table public.hijri_override add column if not exists hy bigint;
alter table public.hijri_override add column if not exists hm bigint;
alter table public.hijri_override add column if not exists start text;
alter table public.hijri_override add column if not exists reason text;
alter table public.hijri_override enable row level security;
drop policy if exists "hijri_override read" on public.hijri_override;
create policy "hijri_override read" on public.hijri_override for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "hijri_override insert" on public.hijri_override;
create policy "hijri_override insert" on public.hijri_override for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "hijri_override update" on public.hijri_override;
create policy "hijri_override update" on public.hijri_override for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.hijri_override to authenticated;

create table if not exists public.app_user (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  name text,
  role text,
  teacher_id text,
  status text,
  email text
);
alter table public.app_user add column if not exists organization_id text;
alter table public.app_user add column if not exists branch_id text;
alter table public.app_user add column if not exists created_at text;
alter table public.app_user add column if not exists created_by text;
alter table public.app_user add column if not exists updated_at text;
alter table public.app_user add column if not exists updated_by text;
alter table public.app_user add column if not exists name text;
alter table public.app_user add column if not exists role text;
alter table public.app_user add column if not exists teacher_id text;
alter table public.app_user add column if not exists status text;
alter table public.app_user add column if not exists email text;
alter table public.app_user enable row level security;
drop policy if exists "app_user read" on public.app_user;
create policy "app_user read" on public.app_user for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "app_user insert" on public.app_user;
create policy "app_user insert" on public.app_user for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "app_user update" on public.app_user;
create policy "app_user update" on public.app_user for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.app_user to authenticated;

create table if not exists public.teacher (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  name text,
  phone text,
  gender text,
  status text,
  left_date text,
  left_reason text
);
alter table public.teacher add column if not exists organization_id text;
alter table public.teacher add column if not exists branch_id text;
alter table public.teacher add column if not exists created_at text;
alter table public.teacher add column if not exists created_by text;
alter table public.teacher add column if not exists updated_at text;
alter table public.teacher add column if not exists updated_by text;
alter table public.teacher add column if not exists name text;
alter table public.teacher add column if not exists phone text;
alter table public.teacher add column if not exists gender text;
alter table public.teacher add column if not exists status text;
alter table public.teacher add column if not exists left_date text;
alter table public.teacher add column if not exists left_reason text;
alter table public.teacher enable row level security;
drop policy if exists "teacher read" on public.teacher;
create policy "teacher read" on public.teacher for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "teacher insert" on public.teacher;
create policy "teacher insert" on public.teacher for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "teacher update" on public.teacher;
create policy "teacher update" on public.teacher for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.teacher to authenticated;

create table if not exists public.class (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  academic_year_id text,
  name text,
  track text,
  curriculum_part text,
  shift text,
  start_time text,
  end_time text,
  gender text,
  capacity bigint,
  status text
);
alter table public.class add column if not exists organization_id text;
alter table public.class add column if not exists branch_id text;
alter table public.class add column if not exists created_at text;
alter table public.class add column if not exists created_by text;
alter table public.class add column if not exists updated_at text;
alter table public.class add column if not exists updated_by text;
alter table public.class add column if not exists academic_year_id text;
alter table public.class add column if not exists name text;
alter table public.class add column if not exists track text;
alter table public.class add column if not exists curriculum_part text;
alter table public.class add column if not exists shift text;
alter table public.class add column if not exists start_time text;
alter table public.class add column if not exists end_time text;
alter table public.class add column if not exists gender text;
alter table public.class add column if not exists capacity bigint;
alter table public.class add column if not exists status text;
alter table public.class enable row level security;
drop policy if exists "class read" on public.class;
create policy "class read" on public.class for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "class insert" on public.class;
create policy "class insert" on public.class for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "class update" on public.class;
create policy "class update" on public.class for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.class to authenticated;

create table if not exists public.class_teacher (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  class_id text,
  teacher_id text,
  from_date text,
  to_date text
);
alter table public.class_teacher add column if not exists organization_id text;
alter table public.class_teacher add column if not exists branch_id text;
alter table public.class_teacher add column if not exists created_at text;
alter table public.class_teacher add column if not exists created_by text;
alter table public.class_teacher add column if not exists updated_at text;
alter table public.class_teacher add column if not exists updated_by text;
alter table public.class_teacher add column if not exists class_id text;
alter table public.class_teacher add column if not exists teacher_id text;
alter table public.class_teacher add column if not exists from_date text;
alter table public.class_teacher add column if not exists to_date text;
alter table public.class_teacher enable row level security;
drop policy if exists "class_teacher read" on public.class_teacher;
create policy "class_teacher read" on public.class_teacher for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "class_teacher insert" on public.class_teacher;
create policy "class_teacher insert" on public.class_teacher for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "class_teacher update" on public.class_teacher;
create policy "class_teacher update" on public.class_teacher for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.class_teacher to authenticated;

create table if not exists public.family (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  guardian_name text,
  relation text,
  phone1 text,
  phone2 text,
  whatsapp1 bigint,
  whatsapp2 bigint,
  address text
);
alter table public.family add column if not exists organization_id text;
alter table public.family add column if not exists branch_id text;
alter table public.family add column if not exists created_at text;
alter table public.family add column if not exists created_by text;
alter table public.family add column if not exists updated_at text;
alter table public.family add column if not exists updated_by text;
alter table public.family add column if not exists guardian_name text;
alter table public.family add column if not exists relation text;
alter table public.family add column if not exists phone1 text;
alter table public.family add column if not exists phone2 text;
alter table public.family add column if not exists whatsapp1 bigint;
alter table public.family add column if not exists whatsapp2 bigint;
alter table public.family add column if not exists address text;
alter table public.family enable row level security;
drop policy if exists "family read" on public.family;
create policy "family read" on public.family for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "family insert" on public.family;
create policy "family insert" on public.family for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "family update" on public.family;
create policy "family update" on public.family for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.family to authenticated;

create table if not exists public.student (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  family_id text,
  serial_no bigint,
  name text,
  walidiyat text,
  gender text,
  dob text,
  admission_date text,
  status text,
  left_date text,
  left_reason text,
  notes text
);
alter table public.student add column if not exists organization_id text;
alter table public.student add column if not exists branch_id text;
alter table public.student add column if not exists created_at text;
alter table public.student add column if not exists created_by text;
alter table public.student add column if not exists updated_at text;
alter table public.student add column if not exists updated_by text;
alter table public.student add column if not exists family_id text;
alter table public.student add column if not exists serial_no bigint;
alter table public.student add column if not exists name text;
alter table public.student add column if not exists walidiyat text;
alter table public.student add column if not exists gender text;
alter table public.student add column if not exists dob text;
alter table public.student add column if not exists admission_date text;
alter table public.student add column if not exists status text;
alter table public.student add column if not exists left_date text;
alter table public.student add column if not exists left_reason text;
alter table public.student add column if not exists notes text;
alter table public.student enable row level security;
drop policy if exists "student read" on public.student;
create policy "student read" on public.student for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "student insert" on public.student;
create policy "student insert" on public.student for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "student update" on public.student;
create policy "student update" on public.student for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.student to authenticated;

create table if not exists public.enrollment (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  student_id text,
  academic_year_id text,
  class_id text,
  track text,
  curriculum_part text,
  miqdar text,
  from_date text,
  to_date text,
  roll_no bigint
);
alter table public.enrollment add column if not exists organization_id text;
alter table public.enrollment add column if not exists branch_id text;
alter table public.enrollment add column if not exists created_at text;
alter table public.enrollment add column if not exists created_by text;
alter table public.enrollment add column if not exists updated_at text;
alter table public.enrollment add column if not exists updated_by text;
alter table public.enrollment add column if not exists student_id text;
alter table public.enrollment add column if not exists academic_year_id text;
alter table public.enrollment add column if not exists class_id text;
alter table public.enrollment add column if not exists track text;
alter table public.enrollment add column if not exists curriculum_part text;
alter table public.enrollment add column if not exists miqdar text;
alter table public.enrollment add column if not exists from_date text;
alter table public.enrollment add column if not exists to_date text;
alter table public.enrollment add column if not exists roll_no bigint;
alter table public.enrollment enable row level security;
drop policy if exists "enrollment read" on public.enrollment;
create policy "enrollment read" on public.enrollment for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "enrollment insert" on public.enrollment;
create policy "enrollment insert" on public.enrollment for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "enrollment update" on public.enrollment;
create policy "enrollment update" on public.enrollment for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.enrollment to authenticated;

create table if not exists public.monthly_class_record (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  class_id text,
  month text,
  curriculum_part text,
  lesson_no text
);
alter table public.monthly_class_record add column if not exists organization_id text;
alter table public.monthly_class_record add column if not exists branch_id text;
alter table public.monthly_class_record add column if not exists created_at text;
alter table public.monthly_class_record add column if not exists created_by text;
alter table public.monthly_class_record add column if not exists updated_at text;
alter table public.monthly_class_record add column if not exists updated_by text;
alter table public.monthly_class_record add column if not exists class_id text;
alter table public.monthly_class_record add column if not exists month text;
alter table public.monthly_class_record add column if not exists curriculum_part text;
alter table public.monthly_class_record add column if not exists lesson_no text;
alter table public.monthly_class_record enable row level security;
drop policy if exists "monthly_class_record read" on public.monthly_class_record;
create policy "monthly_class_record read" on public.monthly_class_record for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "monthly_class_record insert" on public.monthly_class_record;
create policy "monthly_class_record insert" on public.monthly_class_record for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "monthly_class_record update" on public.monthly_class_record;
create policy "monthly_class_record update" on public.monthly_class_record for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.monthly_class_record to authenticated;

create table if not exists public.class_day (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  class_id text,
  date text,
  kind text,
  holiday_reason text,
  submitted_at text,
  submitted_by text
);
alter table public.class_day add column if not exists organization_id text;
alter table public.class_day add column if not exists branch_id text;
alter table public.class_day add column if not exists created_at text;
alter table public.class_day add column if not exists created_by text;
alter table public.class_day add column if not exists updated_at text;
alter table public.class_day add column if not exists updated_by text;
alter table public.class_day add column if not exists class_id text;
alter table public.class_day add column if not exists date text;
alter table public.class_day add column if not exists kind text;
alter table public.class_day add column if not exists holiday_reason text;
alter table public.class_day add column if not exists submitted_at text;
alter table public.class_day add column if not exists submitted_by text;
alter table public.class_day enable row level security;
drop policy if exists "class_day read" on public.class_day;
create policy "class_day read" on public.class_day for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "class_day insert" on public.class_day;
create policy "class_day insert" on public.class_day for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "class_day update" on public.class_day;
create policy "class_day update" on public.class_day for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.class_day to authenticated;

create table if not exists public.student_attendance (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  class_id text,
  student_id text,
  date text,
  status text,
  absence_reason text,
  follow_up_note text
);
alter table public.student_attendance add column if not exists organization_id text;
alter table public.student_attendance add column if not exists branch_id text;
alter table public.student_attendance add column if not exists created_at text;
alter table public.student_attendance add column if not exists created_by text;
alter table public.student_attendance add column if not exists updated_at text;
alter table public.student_attendance add column if not exists updated_by text;
alter table public.student_attendance add column if not exists class_id text;
alter table public.student_attendance add column if not exists student_id text;
alter table public.student_attendance add column if not exists date text;
alter table public.student_attendance add column if not exists status text;
alter table public.student_attendance add column if not exists absence_reason text;
alter table public.student_attendance add column if not exists follow_up_note text;
alter table public.student_attendance enable row level security;
drop policy if exists "student_attendance read" on public.student_attendance;
create policy "student_attendance read" on public.student_attendance for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "student_attendance insert" on public.student_attendance;
create policy "student_attendance insert" on public.student_attendance for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "student_attendance update" on public.student_attendance;
create policy "student_attendance update" on public.student_attendance for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.student_attendance to authenticated;

create table if not exists public.teacher_attendance (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  teacher_id text,
  date text,
  arrival text,
  departure text,
  note text
);
alter table public.teacher_attendance add column if not exists organization_id text;
alter table public.teacher_attendance add column if not exists branch_id text;
alter table public.teacher_attendance add column if not exists created_at text;
alter table public.teacher_attendance add column if not exists created_by text;
alter table public.teacher_attendance add column if not exists updated_at text;
alter table public.teacher_attendance add column if not exists updated_by text;
alter table public.teacher_attendance add column if not exists teacher_id text;
alter table public.teacher_attendance add column if not exists date text;
alter table public.teacher_attendance add column if not exists arrival text;
alter table public.teacher_attendance add column if not exists departure text;
alter table public.teacher_attendance add column if not exists note text;
alter table public.teacher_attendance enable row level security;
drop policy if exists "teacher_attendance read" on public.teacher_attendance;
create policy "teacher_attendance read" on public.teacher_attendance for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "teacher_attendance insert" on public.teacher_attendance;
create policy "teacher_attendance insert" on public.teacher_attendance for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "teacher_attendance update" on public.teacher_attendance;
create policy "teacher_attendance update" on public.teacher_attendance for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.teacher_attendance to authenticated;

create table if not exists public.alert (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  type text,
  student_id text,
  class_id text,
  trigger_date text,
  detail text,
  status text,
  action text,
  note text,
  resolved_at text,
  resolved_by text
);
alter table public.alert add column if not exists organization_id text;
alter table public.alert add column if not exists branch_id text;
alter table public.alert add column if not exists created_at text;
alter table public.alert add column if not exists created_by text;
alter table public.alert add column if not exists updated_at text;
alter table public.alert add column if not exists updated_by text;
alter table public.alert add column if not exists type text;
alter table public.alert add column if not exists student_id text;
alter table public.alert add column if not exists class_id text;
alter table public.alert add column if not exists trigger_date text;
alter table public.alert add column if not exists detail text;
alter table public.alert add column if not exists status text;
alter table public.alert add column if not exists action text;
alter table public.alert add column if not exists note text;
alter table public.alert add column if not exists resolved_at text;
alter table public.alert add column if not exists resolved_by text;
alter table public.alert enable row level security;
drop policy if exists "alert read" on public.alert;
create policy "alert read" on public.alert for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "alert insert" on public.alert;
create policy "alert insert" on public.alert for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "alert update" on public.alert;
create policy "alert update" on public.alert for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.alert to authenticated;

create table if not exists public.eligibility_exception (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  student_id text,
  from_date text,
  to_date text,
  reason text
);
alter table public.eligibility_exception add column if not exists organization_id text;
alter table public.eligibility_exception add column if not exists branch_id text;
alter table public.eligibility_exception add column if not exists created_at text;
alter table public.eligibility_exception add column if not exists created_by text;
alter table public.eligibility_exception add column if not exists updated_at text;
alter table public.eligibility_exception add column if not exists updated_by text;
alter table public.eligibility_exception add column if not exists student_id text;
alter table public.eligibility_exception add column if not exists from_date text;
alter table public.eligibility_exception add column if not exists to_date text;
alter table public.eligibility_exception add column if not exists reason text;
alter table public.eligibility_exception enable row level security;
drop policy if exists "eligibility_exception read" on public.eligibility_exception;
create policy "eligibility_exception read" on public.eligibility_exception for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "eligibility_exception insert" on public.eligibility_exception;
create policy "eligibility_exception insert" on public.eligibility_exception for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "eligibility_exception update" on public.eligibility_exception;
create policy "eligibility_exception update" on public.eligibility_exception for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.eligibility_exception to authenticated;

create table if not exists public.message_log (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  family_id text,
  student_id text,
  channel text,
  purpose text,
  body text
);
alter table public.message_log add column if not exists organization_id text;
alter table public.message_log add column if not exists branch_id text;
alter table public.message_log add column if not exists created_at text;
alter table public.message_log add column if not exists created_by text;
alter table public.message_log add column if not exists updated_at text;
alter table public.message_log add column if not exists updated_by text;
alter table public.message_log add column if not exists family_id text;
alter table public.message_log add column if not exists student_id text;
alter table public.message_log add column if not exists channel text;
alter table public.message_log add column if not exists purpose text;
alter table public.message_log add column if not exists body text;
alter table public.message_log enable row level security;
drop policy if exists "message_log read" on public.message_log;
create policy "message_log read" on public.message_log for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "message_log insert" on public.message_log;
create policy "message_log insert" on public.message_log for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "message_log update" on public.message_log;
create policy "message_log update" on public.message_log for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.message_log to authenticated;

create table if not exists public.mark_scheme (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  name text,
  version bigint,
  lineage_id text,
  scope text,
  scope_id text,
  kinds text,
  definition text,
  status text
);
alter table public.mark_scheme add column if not exists organization_id text;
alter table public.mark_scheme add column if not exists branch_id text;
alter table public.mark_scheme add column if not exists created_at text;
alter table public.mark_scheme add column if not exists created_by text;
alter table public.mark_scheme add column if not exists updated_at text;
alter table public.mark_scheme add column if not exists updated_by text;
alter table public.mark_scheme add column if not exists name text;
alter table public.mark_scheme add column if not exists version bigint;
alter table public.mark_scheme add column if not exists lineage_id text;
alter table public.mark_scheme add column if not exists scope text;
alter table public.mark_scheme add column if not exists scope_id text;
alter table public.mark_scheme add column if not exists kinds text;
alter table public.mark_scheme add column if not exists definition text;
alter table public.mark_scheme add column if not exists status text;
alter table public.mark_scheme enable row level security;
drop policy if exists "mark_scheme read" on public.mark_scheme;
create policy "mark_scheme read" on public.mark_scheme for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "mark_scheme insert" on public.mark_scheme;
create policy "mark_scheme insert" on public.mark_scheme for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "mark_scheme update" on public.mark_scheme;
create policy "mark_scheme update" on public.mark_scheme for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.mark_scheme to authenticated;

create table if not exists public.exam (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  class_id text,
  academic_year_id text,
  kind text,
  cycle bigint,
  date text,
  scheme_id text,
  examiner_name text,
  examiner_user_id text,
  class_remark text,
  signed_by text,
  signed_at text,
  finalized_at text,
  finalized_by text,
  makeup_of text
);
alter table public.exam add column if not exists organization_id text;
alter table public.exam add column if not exists branch_id text;
alter table public.exam add column if not exists created_at text;
alter table public.exam add column if not exists created_by text;
alter table public.exam add column if not exists updated_at text;
alter table public.exam add column if not exists updated_by text;
alter table public.exam add column if not exists class_id text;
alter table public.exam add column if not exists academic_year_id text;
alter table public.exam add column if not exists kind text;
alter table public.exam add column if not exists cycle bigint;
alter table public.exam add column if not exists date text;
alter table public.exam add column if not exists scheme_id text;
alter table public.exam add column if not exists examiner_name text;
alter table public.exam add column if not exists examiner_user_id text;
alter table public.exam add column if not exists class_remark text;
alter table public.exam add column if not exists signed_by text;
alter table public.exam add column if not exists signed_at text;
alter table public.exam add column if not exists finalized_at text;
alter table public.exam add column if not exists finalized_by text;
alter table public.exam add column if not exists makeup_of text;
alter table public.exam enable row level security;
drop policy if exists "exam read" on public.exam;
create policy "exam read" on public.exam for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "exam insert" on public.exam;
create policy "exam insert" on public.exam for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "exam update" on public.exam;
create policy "exam update" on public.exam for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.exam to authenticated;

create table if not exists public.exam_student (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  exam_id text,
  student_id text,
  variant text,
  paras bigint,
  absent bigint,
  makeup bigint,
  grace double precision,
  hold_promotion bigint,
  remark text,
  concerns text,
  practical text,
  practical_reason text,
  total double precision,
  max double precision,
  percent bigint,
  grade text,
  complete bigint,
  att_percent double precision,
  namazi double precision,
  position bigint
);
alter table public.exam_student add column if not exists organization_id text;
alter table public.exam_student add column if not exists branch_id text;
alter table public.exam_student add column if not exists created_at text;
alter table public.exam_student add column if not exists created_by text;
alter table public.exam_student add column if not exists updated_at text;
alter table public.exam_student add column if not exists updated_by text;
alter table public.exam_student add column if not exists exam_id text;
alter table public.exam_student add column if not exists student_id text;
alter table public.exam_student add column if not exists variant text;
alter table public.exam_student add column if not exists paras bigint;
alter table public.exam_student add column if not exists absent bigint;
alter table public.exam_student add column if not exists makeup bigint;
alter table public.exam_student add column if not exists grace double precision;
alter table public.exam_student add column if not exists hold_promotion bigint;
alter table public.exam_student add column if not exists remark text;
alter table public.exam_student add column if not exists concerns text;
alter table public.exam_student add column if not exists practical text;
alter table public.exam_student add column if not exists practical_reason text;
alter table public.exam_student add column if not exists total double precision;
alter table public.exam_student add column if not exists max double precision;
alter table public.exam_student add column if not exists percent bigint;
alter table public.exam_student add column if not exists grade text;
alter table public.exam_student add column if not exists complete bigint;
alter table public.exam_student add column if not exists att_percent double precision;
alter table public.exam_student add column if not exists namazi double precision;
alter table public.exam_student add column if not exists position bigint;
alter table public.exam_student enable row level security;
drop policy if exists "exam_student read" on public.exam_student;
create policy "exam_student read" on public.exam_student for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "exam_student insert" on public.exam_student;
create policy "exam_student insert" on public.exam_student for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "exam_student update" on public.exam_student;
create policy "exam_student update" on public.exam_student for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.exam_student to authenticated;

create table if not exists public.score_entry (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  exam_id text,
  student_id text,
  component_key text,
  raw text,
  marks double precision,
  complete bigint
);
alter table public.score_entry add column if not exists organization_id text;
alter table public.score_entry add column if not exists branch_id text;
alter table public.score_entry add column if not exists created_at text;
alter table public.score_entry add column if not exists created_by text;
alter table public.score_entry add column if not exists updated_at text;
alter table public.score_entry add column if not exists updated_by text;
alter table public.score_entry add column if not exists exam_id text;
alter table public.score_entry add column if not exists student_id text;
alter table public.score_entry add column if not exists component_key text;
alter table public.score_entry add column if not exists raw text;
alter table public.score_entry add column if not exists marks double precision;
alter table public.score_entry add column if not exists complete bigint;
alter table public.score_entry enable row level security;
drop policy if exists "score_entry read" on public.score_entry;
create policy "score_entry read" on public.score_entry for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "score_entry insert" on public.score_entry;
create policy "score_entry insert" on public.score_entry for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "score_entry update" on public.score_entry;
create policy "score_entry update" on public.score_entry for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.score_entry to authenticated;

create table if not exists public.deduction_event (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  exam_id text,
  student_id text,
  component_key text,
  type text,
  key text,
  q bigint,
  points double precision,
  voided bigint
);
alter table public.deduction_event add column if not exists organization_id text;
alter table public.deduction_event add column if not exists branch_id text;
alter table public.deduction_event add column if not exists created_at text;
alter table public.deduction_event add column if not exists created_by text;
alter table public.deduction_event add column if not exists updated_at text;
alter table public.deduction_event add column if not exists updated_by text;
alter table public.deduction_event add column if not exists exam_id text;
alter table public.deduction_event add column if not exists student_id text;
alter table public.deduction_event add column if not exists component_key text;
alter table public.deduction_event add column if not exists type text;
alter table public.deduction_event add column if not exists key text;
alter table public.deduction_event add column if not exists q bigint;
alter table public.deduction_event add column if not exists points double precision;
alter table public.deduction_event add column if not exists voided bigint;
alter table public.deduction_event enable row level security;
drop policy if exists "deduction_event read" on public.deduction_event;
create policy "deduction_event read" on public.deduction_event for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "deduction_event insert" on public.deduction_event;
create policy "deduction_event insert" on public.deduction_event for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "deduction_event update" on public.deduction_event;
create policy "deduction_event update" on public.deduction_event for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.deduction_event to authenticated;

create table if not exists public.card_status (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  student_id text,
  academic_year_id text,
  handed_five text,
  returned_five text,
  handed_annual text
);
alter table public.card_status add column if not exists organization_id text;
alter table public.card_status add column if not exists branch_id text;
alter table public.card_status add column if not exists created_at text;
alter table public.card_status add column if not exists created_by text;
alter table public.card_status add column if not exists updated_at text;
alter table public.card_status add column if not exists updated_by text;
alter table public.card_status add column if not exists student_id text;
alter table public.card_status add column if not exists academic_year_id text;
alter table public.card_status add column if not exists handed_five text;
alter table public.card_status add column if not exists returned_five text;
alter table public.card_status add column if not exists handed_annual text;
alter table public.card_status enable row level security;
drop policy if exists "card_status read" on public.card_status;
create policy "card_status read" on public.card_status for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "card_status insert" on public.card_status;
create policy "card_status insert" on public.card_status for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "card_status update" on public.card_status;
create policy "card_status update" on public.card_status for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.card_status to authenticated;

create table if not exists public.fee_plan (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  student_id text,
  from_month text,
  amount double precision,
  exempt bigint,
  sponsor text,
  note text
);
alter table public.fee_plan add column if not exists organization_id text;
alter table public.fee_plan add column if not exists branch_id text;
alter table public.fee_plan add column if not exists created_at text;
alter table public.fee_plan add column if not exists created_by text;
alter table public.fee_plan add column if not exists updated_at text;
alter table public.fee_plan add column if not exists updated_by text;
alter table public.fee_plan add column if not exists student_id text;
alter table public.fee_plan add column if not exists from_month text;
alter table public.fee_plan add column if not exists amount double precision;
alter table public.fee_plan add column if not exists exempt bigint;
alter table public.fee_plan add column if not exists sponsor text;
alter table public.fee_plan add column if not exists note text;
alter table public.fee_plan enable row level security;
drop policy if exists "fee_plan read" on public.fee_plan;
create policy "fee_plan read" on public.fee_plan for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "fee_plan insert" on public.fee_plan;
create policy "fee_plan insert" on public.fee_plan for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "fee_plan update" on public.fee_plan;
create policy "fee_plan update" on public.fee_plan for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.fee_plan to authenticated;

create table if not exists public.payment (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  family_id text,
  payer text,
  sponsor bigint,
  date text,
  amount double precision,
  receipt_no bigint,
  collector text,
  kind text,
  note text
);
alter table public.payment add column if not exists organization_id text;
alter table public.payment add column if not exists branch_id text;
alter table public.payment add column if not exists created_at text;
alter table public.payment add column if not exists created_by text;
alter table public.payment add column if not exists updated_at text;
alter table public.payment add column if not exists updated_by text;
alter table public.payment add column if not exists family_id text;
alter table public.payment add column if not exists payer text;
alter table public.payment add column if not exists sponsor bigint;
alter table public.payment add column if not exists date text;
alter table public.payment add column if not exists amount double precision;
alter table public.payment add column if not exists receipt_no bigint;
alter table public.payment add column if not exists collector text;
alter table public.payment add column if not exists kind text;
alter table public.payment add column if not exists note text;
alter table public.payment enable row level security;
drop policy if exists "payment read" on public.payment;
create policy "payment read" on public.payment for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "payment insert" on public.payment;
create policy "payment insert" on public.payment for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "payment update" on public.payment;
create policy "payment update" on public.payment for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.payment to authenticated;

create table if not exists public.payment_allocation (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  payment_id text,
  student_id text,
  month text,
  amount double precision,
  kind text
);
alter table public.payment_allocation add column if not exists organization_id text;
alter table public.payment_allocation add column if not exists branch_id text;
alter table public.payment_allocation add column if not exists created_at text;
alter table public.payment_allocation add column if not exists created_by text;
alter table public.payment_allocation add column if not exists updated_at text;
alter table public.payment_allocation add column if not exists updated_by text;
alter table public.payment_allocation add column if not exists payment_id text;
alter table public.payment_allocation add column if not exists student_id text;
alter table public.payment_allocation add column if not exists month text;
alter table public.payment_allocation add column if not exists amount double precision;
alter table public.payment_allocation add column if not exists kind text;
alter table public.payment_allocation enable row level security;
drop policy if exists "payment_allocation read" on public.payment_allocation;
create policy "payment_allocation read" on public.payment_allocation for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "payment_allocation insert" on public.payment_allocation;
create policy "payment_allocation insert" on public.payment_allocation for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "payment_allocation update" on public.payment_allocation;
create policy "payment_allocation update" on public.payment_allocation for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.payment_allocation to authenticated;

create table if not exists public.fund_entry (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  kind text,
  date text,
  amount double precision,
  note text
);
alter table public.fund_entry add column if not exists organization_id text;
alter table public.fund_entry add column if not exists branch_id text;
alter table public.fund_entry add column if not exists created_at text;
alter table public.fund_entry add column if not exists created_by text;
alter table public.fund_entry add column if not exists updated_at text;
alter table public.fund_entry add column if not exists updated_by text;
alter table public.fund_entry add column if not exists kind text;
alter table public.fund_entry add column if not exists date text;
alter table public.fund_entry add column if not exists amount double precision;
alter table public.fund_entry add column if not exists note text;
alter table public.fund_entry enable row level security;
drop policy if exists "fund_entry read" on public.fund_entry;
create policy "fund_entry read" on public.fund_entry for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "fund_entry insert" on public.fund_entry;
create policy "fund_entry insert" on public.fund_entry for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "fund_entry update" on public.fund_entry;
create policy "fund_entry update" on public.fund_entry for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.fund_entry to authenticated;

create table if not exists public.activity_log (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  class_id text,
  month text,
  activity text,
  done bigint,
  invited bigint,
  attended bigint,
  name text,
  date text
);
alter table public.activity_log add column if not exists organization_id text;
alter table public.activity_log add column if not exists branch_id text;
alter table public.activity_log add column if not exists created_at text;
alter table public.activity_log add column if not exists created_by text;
alter table public.activity_log add column if not exists updated_at text;
alter table public.activity_log add column if not exists updated_by text;
alter table public.activity_log add column if not exists class_id text;
alter table public.activity_log add column if not exists month text;
alter table public.activity_log add column if not exists activity text;
alter table public.activity_log add column if not exists done bigint;
alter table public.activity_log add column if not exists invited bigint;
alter table public.activity_log add column if not exists attended bigint;
alter table public.activity_log add column if not exists name text;
alter table public.activity_log add column if not exists date text;
alter table public.activity_log enable row level security;
drop policy if exists "activity_log read" on public.activity_log;
create policy "activity_log read" on public.activity_log for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "activity_log insert" on public.activity_log;
create policy "activity_log insert" on public.activity_log for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "activity_log update" on public.activity_log;
create policy "activity_log update" on public.activity_log for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.activity_log to authenticated;

create table if not exists public.audit_log (
  id text primary key,
  organization_id text,
  branch_id text,
  created_at text,
  created_by text,
  updated_at text,
  updated_by text,
  table_name text,
  row_id text,
  action text,
  old_json text,
  new_json text,
  reason text,
  device_id text
);
alter table public.audit_log add column if not exists organization_id text;
alter table public.audit_log add column if not exists branch_id text;
alter table public.audit_log add column if not exists created_at text;
alter table public.audit_log add column if not exists created_by text;
alter table public.audit_log add column if not exists updated_at text;
alter table public.audit_log add column if not exists updated_by text;
alter table public.audit_log add column if not exists table_name text;
alter table public.audit_log add column if not exists row_id text;
alter table public.audit_log add column if not exists action text;
alter table public.audit_log add column if not exists old_json text;
alter table public.audit_log add column if not exists new_json text;
alter table public.audit_log add column if not exists reason text;
alter table public.audit_log add column if not exists device_id text;
alter table public.audit_log enable row level security;
drop policy if exists "audit_log read" on public.audit_log;
create policy "audit_log read" on public.audit_log for select to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch() or branch_id is null));
drop policy if exists "audit_log insert" on public.audit_log;
create policy "audit_log insert" on public.audit_log for insert to authenticated
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
drop policy if exists "audit_log update" on public.audit_log;
create policy "audit_log update" on public.audit_log for update to authenticated
  using (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()))
  with check (organization_id = m_org() and (m_role() = 'admin' or branch_id = m_branch()));
grant select, insert, update on public.audit_log to authenticated;

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
create publication powersync for table public.app_member, public.organization, public.setting, public.branch, public.academic_year, public.hijri_override, public.app_user, public.teacher, public.class, public.class_teacher, public.family, public.student, public.enrollment, public.monthly_class_record, public.class_day, public.student_attendance, public.teacher_attendance, public.alert, public.eligibility_exception, public.message_log, public.mark_scheme, public.exam, public.exam_student, public.score_entry, public.deduction_event, public.card_status, public.fee_plan, public.payment, public.payment_allocation, public.fund_entry, public.activity_log, public.audit_log;
