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

  const api = { HEAT_STEPS, heatLevel, dailyCalories, heatmapDays, personDays, togetherDays, streaks, countInMonth };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.QQLLGame = api;
})(this);
