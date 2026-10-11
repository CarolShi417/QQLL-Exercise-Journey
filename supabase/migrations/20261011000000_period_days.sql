-- 经期记录：每一行表示"某人某天在经期"。只能标记 / 取消自己的；按决定始终共享，两人都能看到。
-- 在 Supabase SQL Editor 里整段运行（可重复运行）。需要先运行过前面的迁移（is_member / my_person / backup_reader）。

create table if not exists public.period_days (
  person text not null check (person in ('Carol', 'Allen')),
  period_date date not null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (person, period_date)
);

-- 写入前：只能标记自己的、不能标未来的日子；SQL Editor（管理员）恢复数据不受限
create or replace function public.period_days_before_insert()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Shanghai')::date;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if not public.is_member() then
    raise exception '这个账号没有使用权限';
  end if;
  if new.person is distinct from public.my_person() then
    raise exception '只能标记自己的经期';
  end if;
  if new.period_date is null or new.period_date > v_today or new.period_date < date '2020-01-01' then
    raise exception '经期日期不能晚于今天';
  end if;
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end $$;
revoke execute on function public.period_days_before_insert() from public, anon;

drop trigger if exists period_days_before_insert on public.period_days;
create trigger period_days_before_insert
before insert on public.period_days
for each row execute function public.period_days_before_insert();

-- 权限：未登录什么都拿不到；不允许修改（取消标记 = 删除那一天）
alter table public.period_days enable row level security;
revoke all on public.period_days from anon, authenticated;
grant select, insert, delete on public.period_days to authenticated;

drop policy if exists "members read period days" on public.period_days;
create policy "members read period days" on public.period_days
  for select to authenticated using (public.is_member());

drop policy if exists "members mark own period days" on public.period_days;
create policy "members mark own period days" on public.period_days
  for insert to authenticated with check (public.is_member() and person = public.my_person());

drop policy if exists "members unmark own period days" on public.period_days;
create policy "members unmark own period days" on public.period_days
  for delete to authenticated using (public.is_member() and person = public.my_person());

-- 每日自动备份：只读账号可以读这两列
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'backup_reader') then
    revoke all on public.period_days from backup_reader;
    grant select (person, period_date) on public.period_days to backup_reader;
  end if;
end $$;
drop policy if exists "backup reader reads period days" on public.period_days;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'backup_reader') then
    create policy "backup reader reads period days" on public.period_days for select to backup_reader using (true);
  end if;
end $$;

-- 实时同步：对方标记后另一台手机马上看到
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'period_days') then
    alter publication supabase_realtime add table public.period_days;
  end if;
end $$;
