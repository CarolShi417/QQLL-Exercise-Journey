const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../game.js');

const day = (y, m, d) => new Date(y, m - 1, d, 15, 30);
const entry = (person, date, calories = 100) => ({ person, date, calories });

test('heat level buckets daily calories', () => {
  assert.equal(G.heatLevel(0), 0);
  assert.equal(G.heatLevel(1), 1);
  assert.equal(G.heatLevel(199), 1);
  assert.equal(G.heatLevel(200), 2);
  assert.equal(G.heatLevel(399), 2);
  assert.equal(G.heatLevel(400), 3);
  assert.equal(G.heatLevel(5000), 3);
});

test('daily calories sum every record of the same day per person', () => {
  const daily = G.dailyCalories([entry('Carol', '2026-10-07', 100), entry('Carol', '2026-10-07', 250), entry('Allen', '2026-10-07', 80), entry('Eve', '2026-10-07', 999)]);
  assert.deepEqual(daily.get('2026-10-07'), { Carol:350, Allen:80 });
  assert.equal(daily.get('2026-10-06'), undefined);
});

test('heatmap covers whole Monday-first weeks ending with the current week', () => {
  const days = G.heatmapDays(day(2026, 10, 7), 2); // Wednesday
  assert.equal(days.length, 14);
  assert.equal(days[0].key, '2026-09-28');
  assert.equal(days[6].key, '2026-10-04');
  assert.equal(days[13].key, '2026-10-11');
  assert.deepEqual(days.filter((d) => d.future).map((d) => d.key), ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
  assert.ok(days.find((d) => d.key === '2026-10-07').today);
});

test('heatmap crosses year boundaries and handles Sunday as the last row', () => {
  const days = G.heatmapDays(day(2026, 1, 1), 1); // Thursday
  assert.deepEqual(days.map((d) => d.key), ['2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
  const sunday = G.heatmapDays(day(2026, 10, 11), 1);
  assert.equal(sunday[6].key, '2026-10-11');
  assert.equal(sunday.filter((d) => d.future).length, 0);
});

test('streak counts back from today, or from yesterday when today is still open', () => {
  const set = new Set(['2026-10-05', '2026-10-06', '2026-10-07']);
  assert.deepEqual(G.streaks(set, day(2026, 10, 7)), { current:3, longest:3 });
  assert.deepEqual(G.streaks(set, day(2026, 10, 8)), { current:3, longest:3 });
  assert.deepEqual(G.streaks(set, day(2026, 10, 9)), { current:0, longest:3 });
});

test('streak and longest run survive month and year boundaries', () => {
  const set = new Set(['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-02-27', '2026-02-28', '2026-03-01']);
  assert.deepEqual(G.streaks(set, day(2026, 3, 1)), { current:3, longest:4 });
  assert.deepEqual(G.streaks(new Set(), day(2026, 3, 1)), { current:0, longest:0 });
});

test('person days and together days', () => {
  const list = [entry('Carol', '2026-10-05'), entry('Carol', '2026-10-05'), entry('Allen', '2026-10-05'), entry('Carol', '2026-10-06'), entry('Allen', '2026-10-07')];
  assert.deepEqual([...G.personDays(list, 'Carol')].sort(), ['2026-10-05', '2026-10-06']);
  assert.deepEqual([...G.togetherDays(list)], ['2026-10-05']);
});

test('days in the current month', () => {
  const set = new Set(['2026-09-30', '2026-10-01', '2026-10-07', '2027-10-02']);
  assert.equal(G.countInMonth(set, day(2026, 10, 7)), 2);
});
