// Derived game stats (heatmap, streaks). Everything is computed from workout records, so the
// database stays the single source of truth and there is nothing extra for a client to tamper with.
(function (root) {
  const Q = typeof module === 'object' && module.exports ? require('./logic.js') : root.QQLL;
  const HEAT_STEPS = [200, 400];

  function addDays(date, days) { return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days); }
  function heatLevel(calories) { if (!(calories > 0)) return 0; return calories < HEAT_STEPS[0] ? 1 : calories < HEAT_STEPS[1] ? 2 : 3; }

  function dailyCalories(list) {
    const daily = new Map();
    list.forEach((entry) => {
      if (!Q.PEOPLE.includes(entry.person)) return;
      const totals = daily.get(entry.date) || { Carol:0, Allen:0 };
      totals[entry.person] += Number(entry.calories) || 0;
      daily.set(entry.date, totals);
    });
    return daily;
  }

  // Column-major: one column per week (Monday → Sunday), the last column is the current week.
  function heatmapDays(today, weeks) {
    const now = addDays(today, 0); const todayKey = Q.dateKey(now);
    const start = addDays(now, -((now.getDay() + 6) % 7) - (weeks - 1) * 7);
    return Array.from({ length:weeks * 7 }, (_, i) => { const date = addDays(start, i); const key = Q.dateKey(date); return { key, today:key === todayKey, future:date > now }; });
  }

  function personDays(list, person) { return new Set(list.filter((entry) => entry.person === person).map((entry) => entry.date)); }
  function togetherDays(list) { const carol = personDays(list, 'Carol'); return new Set([...personDays(list, 'Allen')].filter((key) => carol.has(key))); }

  // A streak stays alive through today until the day is over, so it counts back from yesterday when today has no record yet.
  function streaks(days, today) {
    let cursor = addDays(today, 0); if (!days.has(Q.dateKey(cursor))) cursor = addDays(cursor, -1);
    let current = 0; while (days.has(Q.dateKey(cursor))) { current += 1; cursor = addDays(cursor, -1); }
    let longest = 0; let run = 0; let previous = null;
    [...days].sort().forEach((key) => { const date = new Date(`${key}T00:00:00`); run = previous && Q.dateKey(addDays(previous, 1)) === key ? run + 1 : 1; longest = Math.max(longest, run); previous = date; });
    return { current, longest };
  }

  function countInMonth(days, today) { const prefix = Q.dateKey(today).slice(0, 7); return [...days].filter((key) => key.startsWith(prefix)).length; }

  // ---------- levels ----------
  const LEVEL_TITLES = [[0, '新手村民'], [1, '见习冒险者'], [2, '汗水学徒'], [3, '晨光骑士'], [4, '铁人学徒'], [5, '耐力游侠'], [6, '燃脂法师'], [7, '钢铁卫士'], [8, '疾风行者'], [9, '运动贤者'], [10, '传奇勇者'], [15, '不朽战神'], [20, '神话之躯']];
  function levelTitle(level) { let title = LEVEL_TITLES[0][1]; LEVEL_TITLES.forEach(([from, name]) => { if (level >= from) title = name; }); return title; }

  // ---------- weekly couple boss ----------
  // Both people's calories this week (Monday–Sunday) are damage against one shared HP pool.
  const BOSS_HP = 3000;
  const BOSS_NAMES = ['沙发巨魔', '懒惰史莱姆', '熬夜蝙蝠', '奶茶魔像', '拖延之龙', '宵夜幽灵', '外卖九头蛇', '被窝结界', '手机吸血鬼', '赖床石像', '久坐巨人', '甜点女巫'];
  function weekStart(date) { const d = addDays(date, 0); return addDays(d, -((d.getDay() + 6) % 7)); }
  function weekIndex(monday) { return Math.floor(Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()) / (7 * 864e5)); }
  function weeklyBoss(list, today) {
    const monday = weekStart(today); const from = Q.dateKey(monday); const to = Q.dateKey(addDays(monday, 6));
    const damage = Q.totals(list.filter((entry) => entry.date >= from && entry.date <= to));
    const total = damage.Carol + damage.Allen;
    return { name:BOSS_NAMES[weekIndex(monday) % BOSS_NAMES.length], hp:BOSS_HP, damage, remaining:Math.max(0, BOSS_HP - total), defeated:total >= BOSS_HP, daysLeft:6 - ((today.getDay() + 6) % 7) };
  }
  function bossWins(list, today) {
    const weeks = new Map(); const limit = Q.dateKey(addDays(weekStart(today), 6));
    list.forEach((entry) => {
      if (!Q.PEOPLE.includes(entry.person) || entry.date > limit) return;
      const key = Q.dateKey(weekStart(new Date(`${entry.date}T00:00:00`)));
      weeks.set(key, (weeks.get(key) || 0) + (Number(entry.calories) || 0));
    });
    return [...weeks.values()].filter((total) => total >= BOSS_HP).length;
  }

  // ---------- badges ----------
  const PERSONAL_BADGES = [
    { id:'first', name:'初次出发', desc:'完成第 1 次打卡', icon:'flag', metric:'sessions', target:1 },
    { id:'streak7', name:'七日之火', desc:'连续打卡 7 天', icon:'flame', metric:'longestStreak', target:7 },
    { id:'streak30', name:'月度不灭', desc:'连续打卡 30 天', icon:'bolt', metric:'longestStreak', target:30 },
    { id:'sessions50', name:'五十次冒险', desc:'累计打卡 50 次', icon:'medal', metric:'sessions', target:50 },
    { id:'sessions100', name:'百战之身', desc:'累计打卡 100 次', icon:'award', metric:'sessions', target:100 },
    { id:'kcal10k', name:'万卡燃烧', desc:'累计消耗 10,000 kcal', icon:'trophy', metric:'calories', target:10000 },
    { id:'run20', name:'跑者之魂', desc:'跑步 20 次', icon:'run', metric:'activity:跑步', target:20 },
    { id:'strength20', name:'力量之心', desc:'无氧/力量 20 次', icon:'barbell', metric:'activity:无氧/力量', target:20 },
    { id:'swim10', name:'水中精灵', desc:'游泳 10 次', icon:'swimming', metric:'activity:游泳', target:10 },
    { id:'bike20', name:'风之骑手', desc:'骑行 20 次', icon:'bike', metric:'activity:骑行', target:20 },
    { id:'yoga20', name:'静心修行', desc:'瑜伽 20 次', icon:'yoga', metric:'activity:瑜伽', target:20 },
    { id:'allround', name:'全能冒险家', desc:'5 种运动都完成过', icon:'star', metric:'activityKinds', target:5 },
  ];
  const COUPLE_BADGES = [
    { id:'together1', name:'并肩出发', desc:'第一次同一天都打卡', icon:'heart-handshake', metric:'togetherDays', target:1 },
    { id:'together10', name:'双人同行', desc:'一起运动 10 天', icon:'heart', metric:'togetherDays', target:10 },
    { id:'togetherStreak7', name:'形影不离', desc:'连续 7 天一起运动', icon:'target', metric:'togetherStreak', target:7 },
    { id:'boss1', name:'屠龙者', desc:'击败 1 只每周 Boss', icon:'sword', metric:'bossWins', target:1 },
    { id:'boss10', name:'传奇猎人', desc:'击败 10 只每周 Boss', icon:'crown', metric:'bossWins', target:10 },
  ];
  function progress(definitions, stats) {
    return definitions.map((badge) => { const value = Math.min(stats[badge.metric] || 0, badge.target); return { ...badge, value, unlocked:value >= badge.target }; });
  }
  function personalBadges(list, person) {
    const own = list.filter((entry) => entry.person === person);
    const stats = { sessions:own.length, calories:Q.totals(own)[person], longestStreak:streaks(personDays(list, person), new Date()).longest };
    own.forEach((entry) => { stats[`activity:${entry.activity}`] = (stats[`activity:${entry.activity}`] || 0) + 1; });
    stats.activityKinds = Object.keys(Q.CALORIE_RATES).filter((activity) => stats[`activity:${activity}`]).length;
    return progress(PERSONAL_BADGES, stats);
  }
  function coupleBadges(list, today) {
    const together = togetherDays(list);
    return progress(COUPLE_BADGES, { togetherDays:together.size, togetherStreak:streaks(together, today).longest, bossWins:bossWins(list, today) });
  }

  const api = { HEAT_STEPS, heatLevel, dailyCalories, heatmapDays, personDays, togetherDays, streaks, countInMonth, levelTitle, BOSS_HP, weeklyBoss, bossWins, personalBadges, coupleBadges };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.QQLLGame = api;
})(this);
