-- 加固 workouts：只有白名单里的两个账号能读写；卡路里、记录人、时间由数据库决定。
-- 在 Supabase SQL Editor 里整段运行一次即可（可重复运行）。
-- 运行前提：public.workouts 已存在，且有 id / person / activity / minutes / calories / workout_date / created_at 列。

-- ========== 成员白名单 ==========
-- 账号在控制台手动创建后，用 README 里的 insert 语句把账号和 Carol / Allen 对应起来。
create table if not exists public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  person text not null unique check (person in ('Carol', 'Allen')),
  created_at timestamptz not null default now()
);

create or replace function public.is_member()
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.members where user_id = auth.uid()) $$;

create or replace function public.my_person()
returns text
language sql stable security definer set search_path = ''
as $$ select person from public.members where user_id = auth.uid() $$;

-- ========== workouts 结构 ==========
alter table public.workouts add column if not exists created_by uuid references auth.users (id) on delete set null;

-- 旧数据可能不满足约束，用 not valid 只约束新写入的行
do $$ begin
  alter table public.workouts add constraint workouts_person_check check (person in ('Carol', 'Allen')) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.workouts add constraint workouts_minutes_check check (minutes between 1 and 1440) not valid;
exception when duplicate_object then null; end $$;

-- 写入前：服务器校验并覆盖卡路里、记录人和创建时间（前端传来的值不可信）
-- 卡路里系数必须和 logic.js 的 CALORIE_RATES 保持一致
create or replace function public.workouts_before_write()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_rate numeric;
  v_today date := (now() at time zone 'Asia/Shanghai')::date;
begin
  if not public.is_member() then
    raise exception '这个账号没有使用权限';
  end if;
  if new.person is null or new.person not in ('Carol', 'Allen') then
    raise exception '记录人只能是 Carol 或 Allen';
  end if;
  if new.minutes is null or new.minutes < 1 or new.minutes > 1440 then
    raise exception '运动时间需在 1–1440 分钟之间';
  end if;
  if new.workout_date is null or new.workout_date > v_today or new.workout_date < date '2020-01-01' then
    raise exception '运动日期不能晚于今天';
  end if;

  v_rate := case new.activity
    when '瑜伽' then 3.5
    when '无氧/力量' then 6
    when '游泳' then 8
    when '骑行' then 7
    when '跑步' then 10
  end;
  if v_rate is null then
    raise exception '未知的运动项目';
  end if;

  new.calories := round(v_rate * new.minutes)::int;
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end $$;

drop trigger if exists workouts_before_write on public.workouts;
create trigger workouts_before_write
before insert on public.workouts
for each row execute function public.workouts_before_write();

-- ========== 行级权限(RLS) ==========
alter table public.workouts enable row level security;
alter table public.members enable row level security;

-- 清掉旧的 workouts 策略（名字未知，逐条删除），再按下面重建
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'workouts' loop
    execute format('drop policy %I on public.workouts', p.policyname);
  end loop;
end $$;

-- 未登录用户什么都拿不到；记录不允许修改（防止改卡路里）
revoke all on public.workouts, public.members from anon;
revoke all on public.workouts, public.members from authenticated;
grant select, insert, delete on public.workouts to authenticated;
grant select on public.members to authenticated;
revoke execute on function public.is_member(), public.my_person(), public.workouts_before_write() from public, anon;
grant execute on function public.is_member(), public.my_person() to authenticated;

drop policy if exists "members read members" on public.members;
create policy "members read members" on public.members
  for select to authenticated using (public.is_member());

create policy "members read workouts" on public.workouts
  for select to authenticated using (public.is_member());

-- 可以替对方打卡：记录人可选 Carol / Allen，但 created_by 由触发器写成当前账号
create policy "members insert workouts" on public.workouts
  for insert to authenticated with check (public.is_member());

-- 只能删自己的记录，或自己替对方/对方替自己记下的记录
create policy "members delete own or created workouts" on public.workouts
  for delete to authenticated
  using (public.is_member() and (created_by = auth.uid() or person = public.my_person()));

-- ========== 实时同步 ==========
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workouts') then
    alter publication supabase_realtime add table public.workouts;
  end if;
end $$;
