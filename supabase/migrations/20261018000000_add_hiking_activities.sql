-- 运动项目增加徒步山地（7.5 kcal/min）、徒步平地（4.5 kcal/min）。
-- 在 Supabase SQL Editor 里整段运行（可重复运行）。

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
    when '徒步平地' then 4.5
    when '无氧/力量' then 6
    when '骑行' then 7
    when '徒步山地' then 7.5
    when '游泳' then 8
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

revoke execute on function public.workouts_before_write() from public, anon, authenticated;
