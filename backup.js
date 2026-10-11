// Backup files: the app's JSON export and the daily auto-backup share one format,
// { exported_at, workouts: [{ person, activity, minutes, calories, date }], periods: [{ person, date }] },
// so either can be imported. `periods` is optional — backups made before period tracking simply have none.
// Rows are checked against the same rules as workouts_before_write() so a batch insert never trips the trigger;
// calories in the file are ignored because the server recomputes them.
(function (root) {
  const Q = typeof module === 'object' && module.exports ? require('./logic.js') : root.QQLL;
  const EARLIEST = '2020-01-01';

  function validRecord(row, todayKey) {
    if (!row || typeof row !== 'object') return null;
    const { person, activity, minutes, date } = row;
    if (!Q.PEOPLE.includes(person) || !(activity in Q.CALORIE_RATES)) return null;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return null;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    if (Q.dateKey(new Date(`${date}T00:00:00`)) !== date || date < EARLIEST || date > todayKey) return null;
    return { person, activity, minutes, date };
  }

  function validPeriod(row, todayKey) {
    if (!row || typeof row !== 'object' || !Q.PEOPLE.includes(row.person) || typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return null;
    if (Q.dateKey(new Date(`${row.date}T00:00:00`)) !== row.date || row.date < EARLIEST || row.date > todayKey) return null;
    return { person:row.person, date:row.date };
  }

  function parseBackup(text, today = new Date()) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('不是有效的备份文件'); }
    if (!data || !Array.isArray(data.workouts)) throw new Error('不是有效的备份文件');
    const todayKey = Q.dateKey(today);
    const records = []; let invalid = 0;
    data.workouts.forEach((row) => { const record = validRecord(row, todayKey); if (record) records.push(record); else invalid += 1; });
    const periods = [];
    (Array.isArray(data.periods) ? data.periods : []).forEach((row) => { const period = validPeriod(row, todayKey); if (period) periods.push(period); else invalid += 1; });
    return { records, periods, invalid };
  }

  // Multiset match: two identical runs on the same day in the backup but one in the app → import one.
  // With `person`, only that person's records are imported (accounts may only log their own); the rest are counted in `others`.
  function recordKey(record) { return `${record.person}|${record.activity}|${record.minutes}|${record.date}`; }
  function planImport(existing, incoming, person = null) {
    const counts = new Map();
    existing.forEach((record) => counts.set(recordKey(record), (counts.get(recordKey(record)) || 0) + 1));
    const toInsert = []; let duplicates = 0; let others = 0;
    incoming.forEach((record) => {
      if (person && record.person !== person) { others += 1; return; }
      const left = counts.get(recordKey(record)) || 0;
      if (left > 0) { counts.set(recordKey(record), left - 1); duplicates += 1; } else toInsert.push(record);
    });
    return { toInsert, duplicates, others };
  }

  // Period days are a set per person (no multiplicity): skip days already marked.
  function planPeriodImport(existing, incoming, person) {
    const marked = new Set(existing.map((period) => `${period.person}|${period.date}`));
    const toInsert = []; let duplicates = 0; let others = 0;
    incoming.forEach((period) => {
      if (period.person !== person) { others += 1; return; }
      const key = `${period.person}|${period.date}`;
      if (marked.has(key)) { duplicates += 1; return; }
      marked.add(key); toInsert.push(period);
    });
    return { toInsert, duplicates, others };
  }

  const api = { parseBackup, planImport, planPeriodImport };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.QQLLBackup = api;
})(this);
