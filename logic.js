// Pure helpers shared by the page (window.QQLL) and the Node tests (require).
// CALORIE_RATES must stay in sync with workouts_before_write() in supabase/migrations.
(function (root) {
  const CALORIE_RATES = { '瑜伽':3.5, '无氧/力量':6, '游泳':8, '骑行':7, '跑步':10 };
  const PEOPLE = ['Carol', 'Allen'];
  const HTML_ESCAPES = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };

  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]); }
  function dateKey(date) { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  // Months are always normalised to day 1; setMonth() on the 29th–31st overflows into the following month.
  function monthStart(date) { const d = new Date(date); return new Date(d.getFullYear(), d.getMonth(), 1); }
  function workoutMonth(key) { return monthStart(`${key}T00:00:00`); }
  function shiftMonth(month, delta) { const d = monthStart(month); return new Date(d.getFullYear(), d.getMonth() + delta, 1); }
  function calculateCalories(activity, minutes) { return Math.round((CALORIE_RATES[activity] || 0) * minutes); }
  function experience(calories) { return calories / 10; }
  // Level n starts at 100 × (1 + 2 + … + n) XP: 100, 300, 600, 1000, 1500 … with no cap.
  function levelStart(level) { return 50 * level * (level + 1); }
  function currentLevel(xp) {
    const value = Math.max(0, Number(xp) || 0);
    let level = Math.floor((Math.sqrt(1 + value / 12.5) - 1) / 2);
    while (levelStart(level + 1) <= value) level += 1;
    while (level > 0 && levelStart(level) > value) level -= 1;
    return { level, start:levelStart(level), next:levelStart(level + 1) };
  }
  function countBy(list, value) { return list.reduce((all, entry) => { if (entry.person in all) all[entry.person] += value(entry); return all; }, { Carol:0, Allen:0 }); }
  function totals(list) { return countBy(list, (entry) => Number(entry.calories) || 0); }
  function sessions(list) { return countBy(list, () => 1); }
  function weekRange(now = new Date()) { const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); monday.setHours(0,0,0,0); const sunday = new Date(monday); sunday.setDate(monday.getDate()+6); return { monday, sunday }; }
  function isInWeek(entry, now = new Date()) { const { monday, sunday } = weekRange(now); const date = new Date(`${entry.date}T00:00:00`); return date >= monday && date <= sunday; }

  function personClass(person, prefix) { return person === 'Carol' ? `${prefix}carol` : `${prefix}allen`; }
  function catHtml(person) { return `<img class="sprite" src="icons/pixel/${personClass(person, 'cat-')}.svg" alt="" />`; }
  function dayEntryHtml(entry, canDelete) {
    const remove = canDelete ? `<button class="icon-button is-danger" type="button" data-delete="${escapeHtml(entry.id)}" aria-label="删除这条记录"><svg class="icon" aria-hidden="true"><use href="#i-trash"/></svg></button>` : '';
    return `<article class="day-entry ${personClass(entry.person, 'is-')}"><span class="habit-tile">${catHtml(entry.person)}</span><div class="day-entry-copy"><strong>${escapeHtml(entry.person)} · ${escapeHtml(entry.activity)}</strong><span>${escapeHtml(entry.minutes)} 分钟 · ${escapeHtml(entry.calories)} kcal</span></div>${remove}</article>`;
  }

  const api = { CALORIE_RATES, PEOPLE, escapeHtml, dateKey, monthStart, workoutMonth, shiftMonth, calculateCalories, experience, levelStart, currentLevel, totals, sessions, weekRange, isInWeek, catHtml, dayEntryHtml };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.QQLL = api;
})(this);
