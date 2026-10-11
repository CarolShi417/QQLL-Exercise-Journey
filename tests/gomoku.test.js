const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../gomoku.js');

// Moves alternate black/white starting with black; `cells` are [x, y] in play order.
const play = (cells, black = 'Carol', white = 'Allen') => cells.map(([x, y], i) => ({ moveNo:i + 1, person:i % 2 === 0 ? black : white, x, y }));

test('turn alternates starting with black', () => {
  const game = { black:'Carol', white:'Allen', status:'playing' };
  assert.equal(K.nextTurn(game, []), 'Carol');
  assert.equal(K.nextTurn(game, play([[7, 7]])), 'Allen');
  assert.equal(K.nextTurn(game, play([[7, 7], [7, 8]])), 'Carol');
  assert.equal(K.nextTurn({ ...game, status:'finished' }, []), null);
});

test('five in a row wins in every direction', () => {
  // black on a row, white answering elsewhere
  const horizontal = play([[3, 7], [3, 9], [4, 7], [4, 9], [5, 7], [5, 9], [6, 7], [6, 9], [7, 7]]);
  assert.deepEqual(K.winningLine(horizontal), { person:'Carol', cells:[[3, 7], [4, 7], [5, 7], [6, 7], [7, 7]] });
  const vertical = play([[2, 2], [9, 0], [2, 3], [9, 1], [2, 4], [9, 2], [2, 5], [9, 3], [0, 14], [9, 4]]);
  assert.equal(K.winningLine(vertical).person, 'Allen');
  const diagonal = play([[0, 0], [14, 0], [1, 1], [14, 1], [2, 2], [14, 2], [3, 3], [13, 5], [4, 4]]);
  assert.equal(K.winningLine(diagonal).cells.length, 5);
  const antiDiagonal = play([[4, 0], [0, 14], [3, 1], [1, 14], [2, 2], [2, 14], [1, 3], [3, 13], [0, 4]]);
  assert.equal(K.winningLine(antiDiagonal).person, 'Carol');
});

test('four in a row is not a win, and an overline (six) still wins in free gomoku', () => {
  assert.equal(K.winningLine(play([[0, 0], [0, 5], [1, 0], [1, 5], [2, 0], [2, 5], [3, 0]])), null);
  const six = play([[0, 0], [0, 9], [1, 0], [1, 9], [2, 0], [2, 9], [4, 0], [4, 9], [5, 0], [5, 9], [3, 0]]);
  assert.equal(K.winningLine(six).cells.length, 6);
});

test('a line broken by the opponent or the board edge does not win', () => {
  const blocked = play([[0, 0], [2, 0], [1, 0], [9, 9], [3, 0], [9, 8], [4, 0], [9, 7], [5, 0]]);
  assert.equal(K.winningLine(blocked), null);
  // x = 11..14 at the right edge of row 3, then x = 0 on row 4: would be "five" if the board wrapped around
  assert.equal(K.winningLine(play([[11, 3], [0, 0], [12, 3], [0, 2], [13, 3], [0, 6], [14, 3], [0, 8], [0, 4]])), null);
});

test('move validation mirrors the database rules', () => {
  const game = { black:'Carol', white:'Allen', status:'playing' };
  const moves = play([[7, 7]]);
  assert.equal(K.canPlay(game, moves, 'Allen', 7, 8), null);
  assert.match(K.canPlay(game, moves, 'Carol', 7, 8), /还没轮到/);
  assert.match(K.canPlay(game, moves, 'Allen', 7, 7), /已经有子/);
  assert.match(K.canPlay(game, moves, 'Allen', 15, 0), /棋盘外/);
  assert.match(K.canPlay({ ...game, status:'finished' }, moves, 'Allen', 0, 0), /已经结束/);
});

test('undo: only your own last move, before the opponent replies, while the game is on', () => {
  const game = { black:'Carol', white:'Allen', status:'playing' };
  assert.equal(K.canUndo(game, play([[7, 7]]), 'Carol'), null);
  assert.match(K.canUndo(game, play([[7, 7]]), 'Allen'), /对方落子前/);
  assert.match(K.canUndo(game, play([[7, 7], [7, 8]]), 'Carol'), /对方落子前/);
  assert.equal(K.canUndo(game, play([[7, 7], [7, 8]]), 'Allen'), null);
  assert.match(K.canUndo(game, [], 'Carol'), /还没有/);
  assert.match(K.canUndo({ ...game, status:'finished' }, play([[7, 7]]), 'Carol'), /已经结束/);
});

test('record counts wins per person and draws over finished games only', () => {
  const games = [
    { status:'finished', winner:'Carol' }, { status:'finished', winner:'Carol' }, { status:'finished', winner:'Allen' },
    { status:'finished', winner:null }, { status:'playing', winner:null },
  ];
  assert.deepEqual(K.record(games), { Carol:2, Allen:1, draws:1, finished:4 });
});

test('the next game is started by whoever did not start the last one', () => {
  assert.equal(K.nextBlack([], 'Allen'), 'Allen');
  assert.equal(K.nextBlack([{ id:1, black:'Carol' }, { id:2, black:'Allen' }], 'Allen'), 'Carol');
});
