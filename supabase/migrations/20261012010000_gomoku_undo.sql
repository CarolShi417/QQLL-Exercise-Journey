-- 五子棋悔棋：只能悔自己刚下的那一步，并且要在对方落子之前；对局结束后不能悔。不需要对方同意。
-- 在 Supabase SQL Editor 里整段运行（可重复运行）。需要先运行 20261012000000_gomoku.sql。

create or replace function public.gomoku_undo(p_game bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me text := public.my_person();
  v_game public.gomoku_games;
  v_last public.gomoku_moves;
begin
  if not public.is_member() then raise exception '这个账号没有使用权限'; end if;
  -- 和落子触发器锁同一行：悔棋与对方落子同时发生时按先后排队
  select * into v_game from public.gomoku_games where id = p_game for update;
  if v_game.id is null then raise exception '棋局不存在'; end if;
  if v_game.status <> 'playing' then raise exception '这一局已经结束了'; end if;
  select * into v_last from public.gomoku_moves where game_id = p_game and move_no = v_game.move_count;
  if v_last.game_id is null then raise exception '还没有可以悔的棋'; end if;
  if v_last.person is distinct from v_me then raise exception '只能在对方落子前，悔自己刚下的那一步'; end if;

  delete from public.gomoku_moves where game_id = p_game and move_no = v_game.move_count;
  update public.gomoku_games set move_count = v_game.move_count - 1 where id = p_game;
end $$;

revoke execute on function public.gomoku_undo(bigint) from public, anon;
grant execute on function public.gomoku_undo(bigint) to authenticated;
