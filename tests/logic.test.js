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
  for (const html of [Q.calendarEntryHtml(evil, '2026-10-08'), Q.dayEntryHtml(evil)]) {
    assert.ok(!html.includes('<img'), html);
    assert.ok(!html.includes('<b><b>'), html);
    assert.ok(!html.includes('" onclick="'), html);
  }
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
