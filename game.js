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
  const LEVEL_TITLES = [[0, '小奶猫'], [1, '好奇小猫'], [2, '跑酷猫'], [3, '爬架猫'], [4, '捕鼠学徒'], [5, '屋顶游侠'], [6, '肉垫武士'], [7, '猫拳宗师'], [8, '疾风猫'], [9, '九命猫'], [10, '猫大王'], [15, '喵星战神'], [20, '传说喵神']];
  function levelTitle(level) { let title = LEVEL_TITLES[0][1]; LEVEL_TITLES.forEach(([from, name]) => { if (level >= from) title = name; }); return title; }

  // ---------- weekly couple boss (a cat's natural enemy) ----------
  // Both people's calories this week (Monday–Sunday) are damage against one shared HP pool.
  const BOSS_HP = 3000;
  const BOSS_NAMES = ['吸尘器魔王', '洗澡盆怪', '剪指甲大师', '宠物医院使者', '吹风机巨龙', '黄瓜刺客', '红点幽灵', '空罐头诅咒', '封箱胶带怪', '雷雨怪', '猫粮小偷', '伊丽莎白圈'];
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
    { id:'first', name:'第一个肉垫印', desc:'完成第 1 次打卡', icon:'paw', metric:'sessions', target:1 },
    { id:'streak7', name:'七日猫步', desc:'连续打卡 7 天', icon:'flame', metric:'longestStreak', target:7 },
    { id:'streak30', name:'满月夜巡', desc:'连续打卡 30 天', icon:'moon', metric:'longestStreak', target:30 },
    { id:'sessions50', name:'五十次巡逻', desc:'累计打卡 50 次', icon:'shield', metric:'sessions', target:50 },
    { id:'sessions100', name:'百战老猫', desc:'累计打卡 100 次', icon:'trophy', metric:'sessions', target:100 },
    { id:'kcal10k', name:'万卡小火炉', desc:'累计消耗 10,000 kcal', icon:'zap', metric:'calories', target:10000 },
    { id:'run20', name:'追光猫', desc:'跑步 20 次', icon:'run', metric:'activity:跑步', target:20 },
    { id:'strength20', name:'猫猫举铁', desc:'无氧/力量 20 次', icon:'barbell', metric:'activity:无氧/力量', target:20 },
    { id:'swim10', name:'不怕水的猫', desc:'游泳 10 次', icon:'swim', metric:'activity:游泳', target:10 },
    { id:'bike20', name:'车筐猫', desc:'骑行 20 次', icon:'bike', metric:'activity:骑行', target:20 },
    { id:'yoga20', name:'猫式伸展', desc:'瑜伽 20 次', icon:'yoga', metric:'activity:瑜伽', target:20 },
    { id:'allround', name:'十项全能猫', desc:'5 种运动都完成过', icon:'star', metric:'activityKinds', target:5 },
  ];
  const COUPLE_BADGES = [
    { id:'together1', name:'第一次贴贴', desc:'第一次同一天都打卡', icon:'heart', metric:'togetherDays', target:1 },
    { id:'together10', name:'双猫同行', desc:'一起运动 10 天', icon:'users', metric:'togetherDays', target:10 },
    { id:'togetherStreak7', name:'连体猫', desc:'连续 7 天一起运动', icon:'paw', metric:'togetherStreak', target:7 },
    { id:'boss1', name:'赶走天敌', desc:'击退 1 个每周天敌', icon:'sword', metric:'bossWins', target:1 },
    { id:'boss10', name:'猫界守护者', desc:'击退 10 个每周天敌', icon:'crown', metric:'bossWins', target:10 },
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
