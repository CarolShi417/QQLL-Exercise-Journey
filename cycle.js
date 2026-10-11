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

  // A start–end range picked in the period sheet, expanded to days. Same limits as the period_days trigger
  // (not in the future, not before 2020), plus a cap so a mistyped month can't mark half a year.
  const MAX_RANGE = 15;
  function rangeDays(start, end, today = new Date()) {
    const isKey = (key) => typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && Q.dateKey(toDate(key)) === key;
    if (!isKey(start) || !isKey(end)) return { error:'请选择开始和结束日期' };
    if (end < start) return { error:'结束日期不能早于开始日期' };
    if (end > Q.dateKey(today)) return { error:'经期日期不能晚于今天' };
    if (start < '2020-01-01') return { error:'日期需在 2020 年之后' };
    const length = daysBetween(start, end) + 1;
    if (length > MAX_RANGE) return { error:`一次最多标记 ${MAX_RANGE} 天` };
    return { days:Array.from({ length }, (_, i) => { const d = toDate(start); return Q.dateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + i)); }) };
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

  const api = { MAX_RANGE, periodsFromDays, rangeDays, cycleSummary };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.QQLLCycle = api;
})(this);
