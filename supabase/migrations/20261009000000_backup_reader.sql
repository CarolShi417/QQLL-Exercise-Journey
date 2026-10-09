-- 自动备份用的只读账号 backup_reader：只能读 workouts 里备份需要的几列，不能写，读不到 members 和登录信息。
-- 在 Supabase SQL Editor 里整段运行（可重复运行）。
-- 密码不要写进这个文件：另外单独运行一次
--   alter role backup_reader password '一串足够长的随机密码';
-- 运行完把那条语句从 SQL Editor 里删掉，不要保存。
-- 注意：重新运行 20261008000000_secure_workouts.sql 会清掉 workouts 上的所有策略，之后要再运行一次本文件。

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'backup_reader') then
    create role backup_reader login noinherit;
  end if;
end $$;

grant usage on schema public to backup_reader;
revoke all on public.workouts from backup_reader;
grant select (person, activity, minutes, calories, workout_date, created_at) on public.workouts to backup_reader;

drop policy if exists "backup reader reads workouts" on public.workouts;
create policy "backup reader reads workouts" on public.workouts
  for select to backup_reader using (true);
