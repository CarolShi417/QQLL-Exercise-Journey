-- 在【旧】Supabase 项目的 SQL Editor 里运行：生成一条把全部记录搬到新项目的 insert 语句。
-- 结果只有一格，复制整格内容，到【新】项目的 SQL Editor 里运行（需先运行过迁移 SQL）。
-- 结果是 NULL 说明旧项目里没有记录，跳过即可。
select 'insert into public.workouts (person, activity, minutes, calories, workout_date, created_at) values '
  || string_agg(format('(%L, %L, %s, %s, %L, %L)', person, activity, minutes, calories, workout_date, created_at), ', ' order by created_at)
  || ';' as insert_sql
from public.workouts;
