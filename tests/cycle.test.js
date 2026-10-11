const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../cycle.js');

const day = (y, m, d) => new Date(y, m - 1, d, 15, 0);
const range = (start, length) => { const [y, m, d] = start.split('-').map(Number); return Array.from({ length }, (_, i) => { const date = new Date(y, m - 1, d + i); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }); };

test('marked days group into periods, bridging a single forgotten day', () => {
  const periods = C.periodsFromDays(['2026-09-03', '2026-09-01', '2026-09-02', '2026-09-05', '2026-09-29', '2026-09-30']);
  assert.deepEqual(periods, [
    { start:'2026-09-01', end:'2026-09-05', length:5 },
    { start:'2026-09-29', end:'2026-09-30', length:2 },
  ]);
  assert.deepEqual(C.periodsFromDays([]), []);
});

test('a date range expands to every day in it, inclusive', () => {
  assert.deepEqual(C.rangeDays('2026-09-29', '2026-10-02', day(2026, 10, 11)), { days:['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'] });
  assert.deepEqual(C.rangeDays('2026-10-11', '2026-10-11', day(2026, 10, 11)), { days:['2026-10-11'] });
  assert.deepEqual(C.rangeDays('2025-12-30', '2026-01-02', day(2026, 10, 11)).days.length, 4);
});

test('invalid ranges explain what is wrong', () => {
  const today = day(2026, 10, 11);
  assert.match(C.rangeDays('2026-10-05', '2026-10-01', today).error, /结束日期不能早于开始日期/);
  assert.match(C.rangeDays('2026-10-10', '2026-10-12', today).error, /不能晚于今天/);
  assert.match(C.rangeDays('2026-09-01', '2026-09-20', today).error, /最多/);
  assert.match(C.rangeDays('', '2026-10-01', today).error, /选择/);
  assert.match(C.rangeDays('2019-12-30', '2020-01-02', today).error, /2020/);
});

test('no records yet', () => {
  assert.deepEqual(C.cycleSummary([], day(2026, 10, 11)), { status:'none' });
});

test('in a period: reports the day number of the current period', () => {
  const summary = C.cycleSummary([...range('2026-09-12', 5), ...range('2026-10-10', 2)], day(2026, 10, 11));
  assert.deepEqual(summary, { status:'in', dayOfPeriod:2, current:{ start:'2026-10-10', end:'2026-10-11', length:2 } });
});

test('not in a period: reports only the most recent recorded period, never a prediction', () => {
  const summary = C.cycleSummary([...range('2026-08-15', 5), ...range('2026-09-12', 4)], day(2026, 10, 11));
  assert.deepEqual(summary, { status:'after', last:{ start:'2026-09-12', end:'2026-09-15', length:4 } });
  for (const key of ['predicted', 'nextStart', 'daysUntil', 'daysLate', 'avgCycle']) assert.ok(!(key in summary), key);
});

test('a period that ended yesterday is "after", not "in"', () => {
  assert.equal(C.cycleSummary(range('2026-10-06', 5), day(2026, 10, 11)).status, 'after');
});
