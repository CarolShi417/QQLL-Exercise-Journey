const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../backup.js');

const today = new Date(2026, 9, 9, 15, 0);
const row = (overrides = {}) => ({ person:'Carol', activity:'跑步', minutes:30, calories:300, date:'2026-10-01', ...overrides });
const file = (workouts) => JSON.stringify({ exported_at:'2026-10-09T00:00:00Z', workouts });

test('a backup exported by the app parses back into records', () => {
  const { records, invalid } = B.parseBackup(file([row(), row({ person:'Allen', activity:'游泳', minutes:45, date:'2026-10-02' })]), today);
  assert.equal(invalid, 0);
  assert.deepEqual(records, [
    { person:'Carol', activity:'跑步', minutes:30, date:'2026-10-01' },
    { person:'Allen', activity:'游泳', minutes:45, date:'2026-10-02' },
  ]);
});

test('files that are not backups are rejected outright', () => {
  assert.throws(() => B.parseBackup('not json', today), /不是有效的备份文件/);
  assert.throws(() => B.parseBackup('{"workouts": 3}', today), /不是有效的备份文件/);
  assert.throws(() => B.parseBackup('[]', today), /不是有效的备份文件/);
});

test('rows the server would refuse are counted as invalid instead of imported', () => {
  const { records, invalid } = B.parseBackup(file([
    row(),
    row({ person:'Eve' }),
    row({ activity:'<img src=x>' }),
    row({ minutes:0 }),
    row({ minutes:1441 }),
    row({ minutes:12.5 }),
    row({ date:'2026-10-10' }),   // future
    row({ date:'2026-02-30' }),   // not a real day
    row({ date:'2019-12-31' }),   // before the server's lower bound
    row({ date:'10/01/2026' }),
    null,
  ]), today);
  assert.equal(records.length, 1);
  assert.equal(invalid, 10);
});

test('records already in the app are skipped, counting duplicates one for one', () => {
  const existing = [row(), row({ date:'2026-10-02' })];
  const incoming = [row(), row(), row({ date:'2026-10-02' }), row({ date:'2026-10-03' })];
  const { toInsert, duplicates } = B.planImport(existing, incoming);
  assert.equal(duplicates, 2);
  assert.deepEqual(toInsert.map((record) => record.date), ['2026-10-01', '2026-10-03']);
});

test('importing into an empty account inserts everything, and a second import inserts nothing', () => {
  const incoming = [row(), row({ person:'Allen' })];
  assert.equal(B.planImport([], incoming).toInsert.length, 2);
  assert.equal(B.planImport(incoming, incoming).toInsert.length, 0);
});
