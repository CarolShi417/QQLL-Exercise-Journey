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

test('level titles step up and hold between milestones', () => {
  assert.equal(G.levelTitle(0), '小奶猫');
  assert.equal(G.levelTitle(3), '爬架猫');
  assert.equal(G.levelTitle(12), G.levelTitle(10));
  assert.notEqual(G.levelTitle(15), G.levelTitle(14));
  assert.equal(G.levelTitle(99), G.levelTitle(20));
});

test('weekly boss takes damage only from this week, Monday to Sunday', () => {
  const list = [entry('Carol', '2026-10-04', 999), entry('Carol', '2026-10-05', 1000), entry('Allen', '2026-10-07', 800), entry('Allen', '2026-10-11', 200), entry('Eve', '2026-10-06', 5000)];
  const boss = G.weeklyBoss(list, day(2026, 10, 9));
  assert.equal(boss.hp, G.BOSS_HP);
  assert.deepEqual(boss.damage, { Carol:1000, Allen:1000 });
  assert.equal(boss.remaining, G.BOSS_HP - 2000);
  assert.equal(boss.defeated, false);
  assert.equal(boss.daysLeft, 2);
  assert.equal(G.weeklyBoss(list, day(2026, 10, 11)).daysLeft, 0);
});

test('weekly boss is defeated at full damage, never goes below zero, and keeps its name within a week', () => {
  const list = [entry('Carol', '2026-10-06', 2000), entry('Allen', '2026-10-06', 1500)];
  const boss = G.weeklyBoss(list, day(2026, 10, 7));
  assert.equal(boss.defeated, true);
  assert.equal(boss.remaining, 0);
  assert.equal(G.weeklyBoss([], day(2026, 10, 5)).name, G.weeklyBoss([], day(2026, 10, 11)).name);
  assert.notEqual(G.weeklyBoss([], day(2026, 10, 11)).name, G.weeklyBoss([], day(2026, 10, 12)).name);
});

test('boss wins count every week whose combined damage reached the HP', () => {
  const list = [
    entry('Carol', '2026-09-21', 3000),                                   // week of 9/21: win
    entry('Carol', '2026-09-28', 1500), entry('Allen', '2026-10-04', 1500), // week of 9/28: win (Mon + Sun)
    entry('Allen', '2026-10-05', 2999),                                    // current week: not yet
  ];
  assert.equal(G.bossWins(list, day(2026, 10, 8)), 2);
  assert.equal(G.bossWins([...list, entry('Carol', '2026-10-08', 1)], day(2026, 10, 8)), 3);
  assert.equal(G.bossWins([], day(2026, 10, 8)), 0);
});

test('personal badges track progress and unlock at their targets', () => {
  const list = [];
  for (let i = 0; i < 7; i += 1) list.push({ person:'Carol', activity:'跑步', calories:300, date:`2026-10-0${i + 1}` });
  list.push({ person:'Carol', activity:'瑜伽', calories:100, date:'2026-10-07' }, { person:'Allen', activity:'游泳', calories:400, date:'2026-10-07' });
  const badges = Object.fromEntries(G.personalBadges(list, 'Carol').map((badge) => [badge.id, badge]));
  assert.equal(badges.first.unlocked, true);
  assert.equal(badges.streak7.unlocked, true);
  assert.deepEqual([badges.streak30.value, badges.streak30.target, badges.streak30.unlocked], [7, 30, false]);
  assert.equal(badges.sessions50.value, 8);
  assert.equal(badges.run20.value, 7);
  assert.equal(badges.swim10.value, 0);
  assert.equal(badges.allround.value, 2);
  assert.equal(badges.kcal10k.value, 2200);
  assert.equal(G.personalBadges([], 'Allen').filter((badge) => badge.unlocked).length, 0);
});

test('couple badges use together days, together streaks and boss wins', () => {
  const list = [entry('Carol', '2026-10-05', 1600), entry('Allen', '2026-10-05', 1500), entry('Carol', '2026-10-06'), entry('Allen', '2026-10-06'), entry('Carol', '2026-10-08')];
  const badges = Object.fromEntries(G.coupleBadges(list, day(2026, 10, 8)).map((badge) => [badge.id, badge]));
  assert.equal(badges.together1.unlocked, true);
  assert.equal(badges.together10.value, 2);
  assert.equal(badges.togetherStreak7.value, 2);
  assert.equal(badges.boss1.unlocked, true);
  assert.equal(badges.boss10.value, 1);
});

test('days in the current month', () => {
  const set = new Set(['2026-09-30', '2026-10-01', '2026-10-07', '2027-10-02']);
  assert.equal(G.countInMonth(set, day(2026, 10, 7)), 2);
});
