-- 触发器函数不该被任何人直接调用。
-- Supabase 的默认权限会给 public schema 里每个新建函数授予 anon / authenticated 的 EXECUTE，
-- 之前的迁移只做了 "revoke ... from public, anon"，漏了 authenticated（Security Advisor 报
-- "Signed-In Users Can Execute SECURITY DEFINER Function"）。触发器触发时不检查 EXECUTE，撤销后照常工作。
-- 在 Supabase SQL Editor 里整段运行（可重复运行）。需要先运行前面的全部迁移。

revoke execute on function
  public.workouts_before_write(),
  public.workouts_own_person(),
  public.period_days_before_insert(),
  public.gomoku_games_before_insert(),
  public.gomoku_moves_before_insert(),
  public.gomoku_moves_after_insert()
from public, anon, authenticated;
