// Period records: marked days → periods. Recording only — by the user's decision there is no prediction
// of future periods, no cycle averages, and nothing about ovulation.
(function (root) {
  const Q = typeof module === 'object' && module.exports ? require('./logic.js') : root.QQLL;

  function toDate(key) { return new Date(`${key}T00:00:00`); }
  function daysBetween(from, to) { return Math.round((toDate(to) - toDate(from)) / 864e5); }

  // A single unmarked day inside a period (forgot to tap) does not split it.
  function periodsFromDays(dayKeys) {
    const periods = [];
    [...new Set(dayKeys)].sort().forEach((key) => {
      const last = periods[periods.length - 1];
      if (last && daysBetween(last.end, key) <= 2) { last.end = key; last.length = daysBetween(last.start, key) + 1; }
      else periods.push({ start:key, end:key, length:1 });
    });
    return periods;
  }

  // What the records say about today: in a period (and which day of it), or when the last one was.
  function cycleSummary(dayKeys, today = new Date()) {
    const periods = periodsFromDays(dayKeys);
    if (!periods.length) return { status:'none' };
    const todayKey = Q.dateKey(today);
    const last = periods[periods.length - 1];
    if (dayKeys.includes(todayKey)) return { status:'in', dayOfPeriod:daysBetween(last.start, todayKey) + 1, current:last };
    return { status:'after', last };
  }

  const api = { periodsFromDays, cycleSummary };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.QQLLCycle = api;
})(this);
