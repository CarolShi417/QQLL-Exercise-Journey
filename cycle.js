// Period tracking: marked days → periods → averages → a calendar-based prediction of the next period.
// Like Clue/Flo it only estimates from past starts; it is not medical advice and cannot predict ovulation.
(function (root) {
  const Q = typeof module === 'object' && module.exports ? require('./logic.js') : root.QQLL;
  const DEFAULT_CYCLE = 28;
  const DEFAULT_LENGTH = 5;
  const PLAUSIBLE_CYCLE = [15, 60];   // longer gaps usually mean a month went unlogged
  const RECENT = 6;                   // average over the last six cycles, as most apps do

  function toDate(key) { return new Date(`${key}T00:00:00`); }
  function addDays(key, days) { const d = toDate(key); return Q.dateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)); }
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

  function average(values, fallback) { return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : fallback; }

  function cycleSummary(dayKeys, today = new Date()) {
    const todayKey = Q.dateKey(today);
    const marked = new Set(dayKeys);
    const periods = periodsFromDays(dayKeys);
    const cycles = periods.slice(1).map((period, i) => daysBetween(periods[i].start, period.start)).filter((gap) => gap >= PLAUSIBLE_CYCLE[0] && gap <= PLAUSIBLE_CYCLE[1]).slice(-RECENT);
    const avgCycle = average(cycles, DEFAULT_CYCLE);
    // An ongoing period (today marked) is still growing, so it doesn't count towards the average length.
    const finished = marked.has(todayKey) ? periods.slice(0, -1) : periods;
    const avgLength = Math.min(10, Math.max(2, average(finished.slice(-RECENT).map((period) => period.length), DEFAULT_LENGTH)));
    const base = { periods, avgCycle, avgLength, cyclesUsed:cycles.length, predicted:new Set() };
    if (!periods.length) return { ...base, status:'none' };

    const last = periods[periods.length - 1];
    const predict = (start, length) => { for (let i = 0; i < length; i += 1) { const key = addDays(start, i); if (key > todayKey && !marked.has(key)) base.predicted.add(key); } };
    if (marked.has(todayKey)) {
      const dayOfPeriod = daysBetween(last.start, todayKey) + 1;
      predict(last.start, avgLength);
      return { ...base, status:'in', dayOfPeriod, nextStart:addDays(last.start, avgCycle) };
    }
    const nextStart = addDays(last.start, avgCycle);
    const daysUntil = daysBetween(todayKey, nextStart);
    if (daysUntil < 0) return { ...base, status:'late', nextStart, daysLate:-daysUntil };
    predict(nextStart, avgLength);
    if (daysUntil === 0 && !marked.has(todayKey)) base.predicted.add(todayKey);
    return { ...base, status:'upcoming', nextStart, daysUntil };
  }

  const api = { DEFAULT_CYCLE, DEFAULT_LENGTH, periodsFromDays, cycleSummary };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.QQLLCycle = api;
})(this);
