// Backup files: the app's JSON export and the daily auto-backup share one format,
// { exported_at, workouts: [{ person, activity, minutes, calories, date }] }, so either can be imported.
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

  function parseBackup(text, today = new Date()) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('不是有效的备份文件'); }
    if (!data || !Array.isArray(data.workouts)) throw new Error('不是有效的备份文件');
    const todayKey = Q.dateKey(today);
    const records = []; let invalid = 0;
    data.workouts.forEach((row) => { const record = validRecord(row, todayKey); if (record) records.push(record); else invalid += 1; });
    return { records, invalid };
  }

  // Multiset match: two identical runs on the same day in the backup but one in the app → import one.
  function recordKey(record) { return `${record.person}|${record.activity}|${record.minutes}|${record.date}`; }
  function planImport(existing, incoming) {
    const counts = new Map();
    existing.forEach((record) => counts.set(recordKey(record), (counts.get(recordKey(record)) || 0) + 1));
    const toInsert = []; let duplicates = 0;
    incoming.forEach((record) => {
      const left = counts.get(recordKey(record)) || 0;
      if (left > 0) { counts.set(recordKey(record), left - 1); duplicates += 1; } else toInsert.push(record);
    });
    return { toInsert, duplicates };
  }

  const api = { parseBackup, planImport };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.QQLLBackup = api;
})(this);
