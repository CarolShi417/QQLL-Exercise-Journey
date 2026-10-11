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

test('no data: defaults and no prediction', () => {
  const summary = C.cycleSummary([], day(2026, 10, 11));
  assert.equal(summary.status, 'none');
  assert.equal(summary.avgCycle, 28);
  assert.equal(summary.avgLength, 5);
  assert.equal(summary.predicted.size, 0);
});

test('averages use recent plausible cycles and ignore gaps from missed logging', () => {
  const days = [...range('2026-05-01', 5), ...range('2026-05-31', 5), ...range('2026-08-28', 5), ...range('2026-09-27', 4)];
  // gaps: 30, 89 (missed months: excluded), 30 → average 30; lengths 5,5,5,4 → 5 (rounded 4.75)
  const summary = C.cycleSummary(days, day(2026, 10, 11));
  assert.equal(summary.avgCycle, 30);
  assert.equal(summary.avgLength, 5);
  assert.equal(summary.cyclesUsed, 2);
});

test('upcoming: counts down to the predicted start and predicts its days', () => {
  const days = [...range('2026-08-30', 5), ...range('2026-09-27', 5)];   // 28-day cycle
  const summary = C.cycleSummary(days, day(2026, 10, 11));
  assert.equal(summary.status, 'upcoming');
  assert.equal(summary.nextStart, '2026-10-25');
  assert.equal(summary.daysUntil, 14);
  assert.deepEqual([...summary.predicted].sort(), range('2026-10-25', 5));
});

test('in period: reports the day number and predicts only the remaining days', () => {
  const days = [...range('2026-09-12', 5), ...range('2026-10-10', 2)];
  const summary = C.cycleSummary(days, day(2026, 10, 11));
  assert.equal(summary.status, 'in');
  assert.equal(summary.dayOfPeriod, 2);
  assert.deepEqual([...summary.predicted].sort(), ['2026-10-12', '2026-10-13', '2026-10-14']);
});

test('late: past the predicted start without a new period', () => {
  const days = [...range('2026-08-01', 5), ...range('2026-08-29', 5)];   // next expected 9/26
  const summary = C.cycleSummary(days, day(2026, 10, 1));
  assert.equal(summary.status, 'late');
  assert.equal(summary.daysLate, 5);
  assert.equal(summary.predicted.size, 0);
});

test('predicted days never overlap marked days', () => {
  const days = [...range('2026-09-13', 5), '2026-10-11'];
  const summary = C.cycleSummary(days, day(2026, 10, 11));
  assert.ok(![...summary.predicted].some((key) => days.includes(key)));
});
