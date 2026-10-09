-- 每个账号只能给自己打卡（此前按最初的决定允许替对方打卡）。
-- 在 Supabase SQL Editor 里整段运行（可重复运行）。
-- 用独立的触发器而不是改 workouts_before_write：重新运行第一份迁移会重建那个函数并清掉所有策略，
-- 但不会动这个触发器，规则依然生效。

create or replace function public.workouts_own_person()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  -- SQL Editor（管理员）恢复数据时不受限制，和 workouts_before_write 一致
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.person is distinct from public.my_person() then
    raise exception '只能给自己打卡';
  end if;
  return new;
end $$;
revoke execute on function public.workouts_own_person() from public, anon;

drop trigger if exists workouts_own_person on public.workouts;
create trigger workouts_own_person
before insert on public.workouts
for each row execute function public.workouts_own_person();

-- 权限规则也同步收紧，双保险
drop policy if exists "members insert workouts" on public.workouts;
drop policy if exists "members insert own workouts" on public.workouts;
create policy "members insert own workouts" on public.workouts
  for insert to authenticated
  with check (public.is_member() and person = public.my_person());
