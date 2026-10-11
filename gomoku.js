// Free-style gomoku on a 15×15 board: black moves first, five or more in a row wins, no forbidden moves.
// The database (gomoku_moves triggers) is the authority on turns and wins; this mirrors it for the UI.
(function (root) {
  const SIZE = 15;
  const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

  function board(moves) { const cells = new Map(); moves.forEach((move) => cells.set(`${move.x},${move.y}`, move.person)); return cells; }

  function nextTurn(game, moves) {
    if (!game || game.status !== 'playing') return null;
    return moves.length % 2 === 0 ? game.black : game.white;
  }

  // The winning run through the most recent move, or null. Only the last move can complete a line.
  function winningLine(moves) {
    if (!moves.length) return null;
    const cells = board(moves);
    const last = moves[moves.length - 1];
    for (const [dx, dy] of DIRECTIONS) {
      const run = [[last.x, last.y]];
      for (const sign of [1, -1]) {
        for (let step = 1; ; step += 1) {
          const x = last.x + dx * step * sign; const y = last.y + dy * step * sign;
          if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || cells.get(`${x},${y}`) !== last.person) break;
          if (sign === 1) run.push([x, y]); else run.unshift([x, y]);
        }
      }
      if (run.length >= 5) return { person:last.person, cells:run };
    }
    return null;
  }

  function canPlay(game, moves, person, x, y) {
    if (!game || game.status !== 'playing') return '这一局已经结束了';
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= SIZE || y >= SIZE) return '不能下在棋盘外';
    if (nextTurn(game, moves) !== person) return '还没轮到你';
    if (board(moves).has(`${x},${y}`)) return '这里已经有子了';
    return null;
  }

  // Undo needs no consent: you may take back only your own last move, and only before the opponent replies.
  function canUndo(game, moves, person) {
    if (!game || game.status !== 'playing') return '这一局已经结束了';
    if (!moves.length) return '还没有可以悔的棋';
    if (moves[moves.length - 1].person !== person) return '只能在对方落子前，悔自己刚下的那一步';
    return null;
  }

  function record(games) {
    const result = { Carol:0, Allen:0, draws:0, finished:0 };
    games.filter((game) => game.status === 'finished').forEach((game) => {
      result.finished += 1;
      if (game.winner in result) result[game.winner] += 1; else result.draws += 1;
    });
    return result;
  }

  // Alternate the first move between games; the very first game is opened by whoever starts it.
  function nextBlack(games, starter) {
    if (!games.length) return starter;
    const latest = games.reduce((a, b) => (a.id > b.id ? a : b));
    return latest.black === 'Carol' ? 'Allen' : 'Carol';
  }

  const api = { SIZE, board, nextTurn, winningLine, canPlay, canUndo, record, nextBlack };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.QQLLGomoku = api;
})(this);
