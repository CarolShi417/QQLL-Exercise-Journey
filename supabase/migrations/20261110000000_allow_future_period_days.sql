-- 放宽经期记录日期限制：允许标记未来时间（预估查看使用），不早于 2020-01-01。
-- 在 Supabase SQL Editor 里整段运行（可重复运行）。

create or replace function public.period_days_before_insert()
returns trigger
language plpgsql set search_path = ''
as $$
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
  if new.period_date is null or new.period_date < date '2020-01-01' then
    raise exception '经期日期需在 2020 年之后';
  end if;
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end $$;

revoke execute on function public.period_days_before_insert() from public, anon, authenticated;
