// Pure helpers shared by the page (window.QQLL) and the Node tests (require).
// CALORIE_RATES must stay in sync with workouts_before_write() in supabase/migrations.
(function (root) {
  const CALORIE_RATES = { '瑜伽':3.5, '无氧/力量':6, '游泳':8, '骑行':7, '跑步':10 };
  const PEOPLE = ['Carol', 'Allen'];
  const LEVELS = [{ level:0, start:0, next:100 }, { level:1, start:100, next:300 }, { level:2, start:300, next:600 }, { level:3, start:600, next:null }];
  const HTML_ESCAPES = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };

  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]); }
  function dateKey(date) { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  // Months are always normalised to day 1; setMonth() on the 29th–31st overflows into the following month.
  function monthStart(date) { const d = new Date(date); return new Date(d.getFullYear(), d.getMonth(), 1); }
  function workoutMonth(key) { return monthStart(`${key}T00:00:00`); }
  function shiftMonth(month, delta) { const d = monthStart(month); return new Date(d.getFullYear(), d.getMonth() + delta, 1); }
  function calculateCalories(activity, minutes) { return Math.round((CALORIE_RATES[activity] || 0) * minutes); }
  function experience(calories) { return calories / 10; }
  function currentLevel(xp) { return [...LEVELS].reverse().find((level) => xp >= level.start); }
  function countBy(list, value) { return list.reduce((all, entry) => { if (entry.person in all) all[entry.person] += value(entry); return all; }, { Carol:0, Allen:0 }); }
  function totals(list) { return countBy(list, (entry) => Number(entry.calories) || 0); }
  function sessions(list) { return countBy(list, () => 1); }
  function weekRange(now = new Date()) { const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); monday.setHours(0,0,0,0); const sunday = new Date(monday); sunday.setDate(monday.getDate()+6); return { monday, sunday }; }
  function isInWeek(entry, now = new Date()) { const { monday, sunday } = weekRange(now); const date = new Date(`${entry.date}T00:00:00`); return date >= monday && date <= sunday; }

  function personClass(person, prefix, suffix = '') { return person === 'Carol' ? `${prefix}carol${suffix}` : `${prefix}allen${suffix}`; }
  function calendarEntryHtml(entry, key) { return `<span class="calendar-entry ${personClass(entry.person, 'calendar-')}" data-date="${escapeHtml(key)}" data-entry-id="${escapeHtml(entry.id)}" title="长按删除"><i>${escapeHtml(String(entry.person || '?')[0])}</i><b>${escapeHtml(entry.activity)}</b></span>`; }
  function dayEntryHtml(entry) { return `<article class="day-entry ${personClass(entry.person, '', '-entry')}"><strong>${escapeHtml(entry.person)} · ${escapeHtml(entry.activity)}</strong><span>${escapeHtml(entry.minutes)} 分钟 · ${escapeHtml(entry.calories)} kcal</span></article>`; }

  const api = { CALORIE_RATES, PEOPLE, LEVELS, escapeHtml, dateKey, monthStart, workoutMonth, shiftMonth, calculateCalories, experience, currentLevel, totals, sessions, weekRange, isInWeek, calendarEntryHtml, dayEntryHtml };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.QQLL = api;
})(this);
