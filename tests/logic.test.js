const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../logic.js');

const ym = (d) => `${d.getFullYear()}-${d.getMonth() + 1}`;

test('month switching after saving a workout on the 31st does not skip months', () => {
  assert.equal(ym(Q.shiftMonth(Q.workoutMonth('2026-01-31'), 1)), '2026-2');
  assert.equal(ym(Q.shiftMonth(Q.workoutMonth('2026-03-31'), -1)), '2026-2');
  assert.equal(ym(Q.shiftMonth(Q.workoutMonth('2026-12-15'), 1)), '2027-1');
});

test('record fields are escaped before being written as HTML', () => {
  const evil = { id:'1" onclick="x', person:'Carol', activity:'<img src=x onerror=alert(1)>', minutes:'<b>', calories:1, date:'2026-10-08' };
  for (const html of [Q.dayEntryHtml(evil, false), Q.dayEntryHtml(evil, true)]) {
    assert.ok(!html.includes('<img src=x'), html);
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), html);
    assert.ok(!html.includes('<b><b>'), html);
    assert.ok(!html.includes('" onclick="'), html);
  }
});

test('delete button only appears when the record can be deleted', () => {
  const record = { id:42, person:'Allen', activity:'跑步', minutes:30, calories:300 };
  assert.ok(Q.dayEntryHtml(record, true).includes('data-delete="42"'));
  assert.ok(!Q.dayEntryHtml(record, false).includes('data-delete'));
});

test('levels keep the original 100 / 300 / 600 thresholds and continue without a cap', () => {
  assert.deepEqual(Q.currentLevel(0), { level:0, start:0, next:100 });
  assert.deepEqual(Q.currentLevel(300), { level:2, start:300, next:600 });
  assert.deepEqual(Q.currentLevel(999.9), { level:3, start:600, next:1000 });
  assert.deepEqual(Q.currentLevel(1000), { level:4, start:1000, next:1500 });
  assert.equal(Q.currentLevel(5500).level, 10);
  assert.equal(Q.currentLevel(5499).level, 9);
  assert.equal(Q.currentLevel(-5).level, 0);
});

test('unknown person values render as a neutral label instead of crashing', () => {
  const html = Q.dayEntryHtml({ id:'1', person:'', activity:'跑步', minutes:10, calories:100 });
  assert.ok(html.includes('跑步'));
});

test('calories, XP and levels', () => {
  assert.equal(Q.calculateCalories('跑步', 30), 300);
  assert.equal(Q.calculateCalories('瑜伽', 31), 109);
  assert.equal(Q.calculateCalories('未知', 30), 0);
  assert.equal(Q.currentLevel(0).level, 0);
  assert.equal(Q.currentLevel(99.9).level, 0);
  assert.equal(Q.currentLevel(100).level, 1);
  assert.equal(Q.currentLevel(600).level, 3);
});

test('week runs Monday through Sunday inclusive', () => {
  const wed = new Date(2026, 9, 7, 15, 0); // 2026-10-07 Wednesday
  assert.ok(Q.isInWeek({ date:'2026-10-05' }, wed));
  assert.ok(Q.isInWeek({ date:'2026-10-11' }, wed));
  assert.ok(!Q.isInWeek({ date:'2026-10-04' }, wed));
  assert.ok(!Q.isInWeek({ date:'2026-10-12' }, wed));
  const sunday = new Date(2026, 9, 11, 23, 59);
  assert.ok(Q.isInWeek({ date:'2026-10-05' }, sunday));
});

test('totals ignore records for unknown people', () => {
  const t = Q.totals([{ person:'Carol', calories:100 }, { person:'Allen', calories:50 }, { person:'Eve', calories:999 }]);
  assert.deepEqual(t, { Carol:100, Allen:50 });
});
