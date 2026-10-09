// Supabase URL and publishable key are public by design; access control lives in RLS (supabase/migrations).
const SUPABASE_URL = 'https://pnjwkpxmkyoutpazlfuf.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_JSN0j-Lr3IbIiH2eGT5elg_5LhLHIDh';
const LEGACY_STORAGE_KEYS = ['ca-exercise-journey-v1', 'ca-exercise-journey-supabase-migrated-v1'];
const PAGE_SIZE = 1000;
const HEATMAP_WEEKS = 22;
const RECORD_COLUMNS = 'id,person,activity,minutes,calories,workout_date,created_at,created_by';
const $ = (selector) => document.querySelector(selector);
const Q = window.QQLL;
const G = window.QQLLGame;

let supabaseClient = null;
let entries = [];
let me = null;
let displayedMonth = Q.monthStart(new Date());
let selectedDate = null;
let realtimeChannel = null;
let reloadTimer = null;
let session = 0;
let badgeOwner = null;
let freshPixel = null;

function number(value) { return new Intl.NumberFormat('zh-CN').format(value); }
function icon(name) { return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`; }
function recordId(entry) { return String(entry.id); }
function appEntry(row) { return { id:row.id, person:row.person, activity:row.activity, minutes:row.minutes, calories:row.calories, date:row.workout_date, createdAt:new Date(row.created_at).getTime(), createdBy:row.created_by }; }
// Mirrors the delete policy: records you created, or records logged under your name.
function canDelete(entry) { return !!me && (entry.createdBy === me.id || entry.person === me.person); }
function errorText(error) {
  const message = error?.message || String(error);
  if (/Invalid login credentials/i.test(message)) return '邮箱或密码不对';
  if (/Email not confirmed/i.test(message)) return '账号还没有确认，请联系管理员';
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) return '网络连接失败，请检查网络';
  return message;
}

const toastQueue = [];
let toastTimer = null;
let toastGapTimer = null;
// A toast with a `key` replaces a showing or waiting toast with the same key instead of queueing behind it,
// so tapping the theme button three times shows one updating toast, not eight seconds of them.
function showToast(text, { celebrate = false, key = null } = {}) {
  const same = key ? toastQueue.findIndex((item) => item.key === key) : -1;
  if (same === 0) {
    clearTimeout(toastTimer); clearTimeout(toastGapTimer);
    toastQueue[0].text = text;
    const toast = $('#toast'); toast.textContent = text; toast.classList.add('show');
    toastTimer = setTimeout(endToast, 2600);
    return;
  }
  if (same > 0) { toastQueue[same].text = text; return; }
  toastQueue.push({ text, celebrate, key });
  if (toastQueue.length === 1) playToast();
}
function playToast() {
  const toast = $('#toast'); const { text, celebrate } = toastQueue[0];
  toast.textContent = text;
  toast.classList.toggle('is-celebrate', celebrate);
  toast.classList.add('show');
  if (celebrate) pixelBurst(toast);
  toastTimer = setTimeout(endToast, celebrate ? 3000 : 2600);
}
function endToast() {
  $('#toast').classList.remove('show');
  toastGapTimer = setTimeout(() => { toastQueue.shift(); if (toastQueue.length) playToast(); }, 220);
}
function pixelBurst(host) {
  const burst = document.createElement('span'); burst.className = 'burst';
  for (let i = 0; i < 14; i += 1) {
    const bit = document.createElement('i'); const angle = (Math.PI * 2 * i) / 14;
    bit.className = ['is-carol', 'is-allen', 'is-both'][i % 3];
    bit.style.setProperty('--dx', `${Math.round(Math.cos(angle) * (60 + (i % 4) * 14))}px`);
    bit.style.setProperty('--dy', `${Math.round(Math.sin(angle) * (34 + (i % 3) * 12))}px`);
    burst.append(bit);
  }
  host.append(burst); setTimeout(() => burst.remove(), 1000);
}
function showSplash() { $('#splash').classList.remove('is-done'); }
function hideSplash() { $('#splash').classList.add('is-done'); }
function updateThemeButton() {
  const choice = window.QQLLTheme.preference(); const label = `外观：${window.QQLLTheme.LABELS[choice]}`;
  const button = $('#themeToggle'); button.setAttribute('aria-label', `${label}，点按切换`); button.title = label;
  button.querySelector('use').setAttribute('href', `#i-theme-${choice}`);
}
function toggleTheme() {
  const next = window.QQLLTheme.nextTheme(window.QQLLTheme.preference());
  window.QQLLTheme.set(next); updateThemeButton(); showToast(`外观：${window.QQLLTheme.LABELS[next]}`, { key:'theme' });
}
function setAuthMessage(message, isError = false) { const element = $('#authMessage'); element.textContent = message; element.classList.toggle('is-error', isError); }
function showAuthScreen() { $('#authScreen').classList.remove('is-hidden'); }
function hideAuthScreen() { $('#authScreen').classList.add('is-hidden'); }
function showView(name) {
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('is-active', item.dataset.view === name));
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('is-active', view.id === name));
}

// ---------- home ----------
function personTitle(person) { const level = Q.currentLevel(Q.experience(Q.totals(entries)[person])).level; return `Lv.${level} · ${G.levelTitle(level)}`; }
function pixelHtml(day, level, label) {
  const classes = ['px', `l${level}`, day.today ? 'is-today' : '', day.future ? 'is-future' : ''].filter(Boolean).join(' ');
  return day.future ? `<i class="${classes}"></i>` : `<i class="${classes}" data-date="${day.key}" title="${Q.escapeHtml(label)}"></i>`;
}
function habitCardHtml(card) {
  const checkin = card.checkin ? `<button class="round-button" type="button" data-checkin aria-label="新增我的打卡">${icon('plus')}</button>` : '';
  return `<article class="habit-card ${card.scope}">
    <header class="habit-head"><span class="habit-tile">${card.tile}</span><div class="habit-title"><strong>${card.title}</strong><span>${card.subtitle}</span></div>${checkin}</header>
    <div class="pixel-grid" role="img" aria-label="${Q.escapeHtml(card.gridLabel)}">${card.pixels}</div>
    <footer class="habit-foot"><span class="streak ${card.streak.current ? '' : 'is-cold'}">${icon('flame')}${card.streakLabel} ${card.streak.current} 天</span><span>最长 ${card.streak.longest} 天</span><button class="icon-button" type="button" data-open-calendar aria-label="查看日历">${icon('calendar')}</button></footer>
  </article>`;
}
function bossCardHtml(boss, wins) {
  // Overkill still splits the bar by each person's share of the damage.
  const scale = Math.max(boss.hp, boss.damage.Carol + boss.damage.Allen);
  const carolShare = boss.damage.Carol / scale * 100;
  const allenShare = boss.damage.Allen / scale * 100;
  const status = boss.defeated ? `已赶走 · 本周还剩 ${boss.daysLeft} 天` : boss.daysLeft ? `剩余 HP ${number(boss.remaining)} / ${number(boss.hp)} · 还剩 ${boss.daysLeft} 天` : `剩余 HP ${number(boss.remaining)} · 今天是最后一天`;
  return `<article class="habit-card boss-card ${boss.defeated ? 'is-defeated' : ''}">
    <header class="habit-head"><span class="habit-tile boss-tile">${icon(boss.defeated ? 'crown' : 'sword')}</span><div class="habit-title"><strong>本周天敌 · ${boss.name}</strong><span>${status}</span></div></header>
    <div class="boss-bar" role="img" aria-label="Carol 造成 ${boss.damage.Carol} 伤害，Allen 造成 ${boss.damage.Allen} 伤害，天敌共 ${boss.hp} HP"><span class="boss-hit is-carol" data-share="${carolShare}"></span><span class="boss-hit is-allen" data-share="${allenShare}"></span></div>
    <footer class="habit-foot"><span><i class="dot is-carol"></i> Carol ${number(boss.damage.Carol)}</span><span><i class="dot is-allen"></i> Allen ${number(boss.damage.Allen)}</span><span class="boss-wins">已赶走 ${wins} 个</span></footer>
  </article>`;
}
function renderHome() {
  const today = new Date();
  const weekly = entries.filter((entry) => Q.isInWeek(entry, today));
  const weekCalories = Q.totals(weekly);
  const weekSessions = Q.sessions(weekly);
  const daily = G.dailyCalories(entries);
  const days = G.heatmapDays(today, HEATMAP_WEEKS);
  const { monday, sunday } = Q.weekRange(today);
  const format = new Intl.DateTimeFormat('zh-CN', { month:'numeric', day:'numeric' });
  $('#weekPeriod').textContent = `${me ? `嗨，${me.person} 喵 · ` : ''}${format.format(monday)} — ${format.format(sunday)}`;

  const cards = [bossCardHtml(G.weeklyBoss(entries, today), G.bossWins(entries, today))];
  Q.PEOPLE.forEach((person) => {
    const activeDays = G.personDays(entries, person);
    cards.push(habitCardHtml({
      scope:`is-${person.toLowerCase()}`, tile:Q.catHtml(person), checkin:me?.person === person ? person : null,
      title:`${person} <em>${personTitle(person)}</em>`,
      subtitle:`本周 ${weekSessions[person]} 次 · ${number(weekCalories[person])} kcal`,
      gridLabel:`${person} 最近 ${HEATMAP_WEEKS} 周的运动热力图，共 ${activeDays.size} 天有运动`,
      pixels:days.map((day) => { const calories = daily.get(day.key)?.[person] || 0; return pixelHtml(day, G.heatLevel(calories), `${day.key} · ${number(calories)} kcal`); }).join(''),
      streak:G.streaks(activeDays, today), streakLabel:'连续',
    }));
  });
  const together = G.togetherDays(entries);
  cards.push(habitCardHtml({
    scope:'is-both', tile:icon('heart'),
    title:'一起运动', subtitle:`两人同一天都打卡 · 本月 ${G.countInMonth(together, today)} 天`,
    gridLabel:`最近 ${HEATMAP_WEEKS} 周两人一起运动的热力图，共 ${together.size} 天`,
    pixels:days.map((day) => { const totals = daily.get(day.key); const level = together.has(day.key) ? G.heatLevel(Math.min(totals.Carol, totals.Allen)) : 0; return pixelHtml(day, level, level ? `${day.key} · 一起运动` : day.key); }).join(''),
    streak:G.streaks(together, today), streakLabel:'同步',
  }));
  const host = $('#habitList');
  host.innerHTML = cards.join('');
  // CSP forbids inline style attributes, so sizes go through CSSOM.
  host.querySelectorAll('.pixel-grid').forEach((grid) => grid.style.setProperty('--weeks', HEATMAP_WEEKS));
  host.querySelectorAll('[data-share]').forEach((bar) => { bar.style.width = `${bar.dataset.share}%`; });
  highlightFreshPixel();
}

// ---------- calendar ----------
function entriesOn(date) { return entries.filter((entry) => entry.date === date); }
function renderCalendar() {
  const year = displayedMonth.getFullYear();
  const month = displayedMonth.getMonth();
  const firstCell = new Date(year, month, 1 - (new Date(year, month, 1).getDay() + 6) % 7);
  const todayKey = Q.dateKey(new Date());
  const daily = G.dailyCalories(entries);
  $('#calendarMonth').textContent = new Intl.DateTimeFormat('zh-CN', { year:'numeric', month:'long' }).format(displayedMonth);
  let html = '';
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(firstCell.getFullYear(), firstCell.getMonth(), firstCell.getDate() + i);
    const key = Q.dateKey(date);
    const totals = daily.get(key) || { Carol:0, Allen:0 };
    const classes = ['day', date.getMonth() === month ? '' : 'other-month', key === todayKey ? 'is-today' : '', selectedDate === key ? 'is-selected' : ''].filter(Boolean).join(' ');
    const minis = Q.PEOPLE.map((person) => `<i class="mini is-${person.toLowerCase()} l${G.heatLevel(totals[person])}"></i>`).join('');
    html += `<button class="${classes}" data-date="${key}" type="button" aria-label="${key}"><span class="day-number">${date.getDate()}</span><span class="day-pixels">${minis}</span></button>`;
  }
  $('#calendar').innerHTML = html;
}
function renderDayRecords() {
  const host = $('#dayRecords');
  if (!selectedDate) { host.innerHTML = '<p>点按日期，查看当天记录</p>'; return; }
  const daily = entriesOn(selectedDate);
  const heading = new Intl.DateTimeFormat('zh-CN', { month:'long', day:'numeric', weekday:'short' }).format(new Date(`${selectedDate}T00:00:00`));
  host.innerHTML = daily.length
    ? `<h3 class="day-heading">${heading} · ${daily.length} 条记录</h3>${daily.map((entry) => Q.dayEntryHtml(entry, canDelete(entry))).join('')}`
    : `<p>${heading} 没有运动记录</p>`;
}
function openCalendarAt(key) {
  displayedMonth = Q.workoutMonth(key);
  selectedDate = key;
  renderCalendar(); renderDayRecords(); showView('records');
}

// ---------- achievements ----------
function levelCardHtml(person) {
  const xp = Math.floor(Q.experience(Q.totals(entries)[person]));
  const level = Q.currentLevel(xp);
  const share = (xp - level.start) / (level.next - level.start) * 100;
  return `<article class="card level-card is-${person.toLowerCase()}">
    <div class="level-row"><span class="habit-tile">${Q.catHtml(person)}</span><div class="level-copy"><strong>${person} <em>Lv.${level.level}</em></strong><span>${G.levelTitle(level.level)}</span></div><b>${number(xp)} / ${number(level.next)} XP</b></div>
    <div class="progress-track"><div class="progress-bar" data-share="${share}"></div></div>
    <p class="level-next">再获得 ${number(level.next - xp)} XP 升到 Lv.${level.level + 1} · ${G.levelTitle(level.level + 1)}</p>
  </article>`;
}
function badgeHtml(badge, scope) {
  const state = badge.unlocked ? '已解锁' : `${number(badge.value)} / ${number(badge.target)}`;
  return `<div class="badge ${scope} ${badge.unlocked ? 'is-unlocked' : ''}"><span class="badge-icon">${icon(badge.unlocked ? badge.icon : 'lock')}</span><strong>${badge.name}</strong><span>${badge.desc}</span><em>${state}</em></div>`;
}
function renderAchievements() {
  const host = $('#levelList');
  host.innerHTML = Q.PEOPLE.map(levelCardHtml).join('');
  host.querySelectorAll('[data-share]').forEach((bar) => { bar.style.width = `${bar.dataset.share}%`; });
  const owner = badgeOwner || me?.person || 'Carol';
  document.querySelectorAll('[data-badge-owner]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.badgeOwner === owner)));
  const badges = owner === 'couple' ? G.coupleBadges(entries, new Date()) : G.personalBadges(entries, owner);
  const scope = owner === 'couple' ? 'is-both' : `is-${owner.toLowerCase()}`;
  $('#badgeGrid').innerHTML = badges.map((badge) => badgeHtml(badge, scope)).join('');
  $('#accountInfo').textContent = me ? `当前账号：${me.person}` : '';
}
function render() { renderHome(); renderCalendar(); renderDayRecords(); renderAchievements(); }

// ---------- celebrations ----------
// Snapshot before and after a save; anything newly earned becomes a celebration toast.
function progressSnapshot() {
  const today = new Date();
  const unlocked = (list) => new Set(list.filter((badge) => badge.unlocked).map((badge) => badge.name));
  return {
    levels:Object.fromEntries(Q.PEOPLE.map((person) => [person, Q.currentLevel(Q.experience(Q.totals(entries)[person])).level])),
    badges:Object.fromEntries([...Q.PEOPLE.map((person) => [person, unlocked(G.personalBadges(entries, person))]), ['一起', unlocked(G.coupleBadges(entries, today))]]),
    boss:G.weeklyBoss(entries, today),
  };
}
function celebrationsBetween(before, after) {
  const messages = [];
  if (!before.boss.defeated && after.boss.defeated) messages.push(`赶走了本周天敌「${after.boss.name}」`);
  Q.PEOPLE.forEach((person) => { if (after.levels[person] > before.levels[person]) messages.push(`${person} 升到 Lv.${after.levels[person]} · ${G.levelTitle(after.levels[person])}`); });
  // One toast per owner, however many badges they just earned, so a big save doesn't queue a minute of toasts.
  Object.entries(after.badges).forEach(([owner, names]) => {
    const fresh = [...names].filter((name) => !before.badges[owner].has(name));
    if (fresh.length) messages.push(`${owner === '一起' ? '你们' : `${owner} `}解锁徽章${fresh.map((name) => `「${name}」`).join('')}`);
  });
  return messages;
}
// Realtime reloads re-render the cards right after a save; a negative delay keeps the pop animation continuous.
function highlightFreshPixel() {
  if (!freshPixel) return;
  const elapsed = Date.now() - freshPixel.at;
  if (elapsed > 900) { freshPixel = null; return; }
  document.querySelectorAll(`.habit-card.is-${freshPixel.person.toLowerCase()} .px[data-date="${freshPixel.date}"], .habit-card.is-both .px[data-date="${freshPixel.date}"]:not(.l0)`).forEach((pixel) => { pixel.style.animationDelay = `-${elapsed}ms`; pixel.classList.add('is-new'); });
}

// ---------- data ----------
async function fetchAllRows() {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseClient.from('workouts').select(RECORD_COLUMNS).order('workout_date', { ascending:false }).order('created_at', { ascending:false }).order('id', { ascending:false }).range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}
async function loadRemoteRecords() {
  const current = session; const rows = await fetchAllRows();
  if (current !== session) return;
  entries = rows.map(appEntry); render();
}
function scheduleReload() { clearTimeout(reloadTimer); reloadTimer = setTimeout(() => { if (me) loadRemoteRecords().catch((error) => console.error(error)); }, 300); }
async function addWorkout(entry) {
  const { data:row, error } = await supabaseClient.from('workouts').insert({ person:entry.person, activity:entry.activity, minutes:entry.minutes, calories:entry.calories, workout_date:entry.date }).select(RECORD_COLUMNS).single();
  if (error) throw error;
  if (!entries.some((item) => item.id === row.id)) entries.push(appEntry(row));
  return appEntry(row);
}
async function deleteRecord(id) {
  const record = entries.find((entry) => recordId(entry) === id);
  if (!record || !confirm(`删除 ${record.person} 的「${record.activity}」记录？`)) return;
  const { data, error } = await supabaseClient.from('workouts').delete().eq('id', record.id).select('id');
  if (error) { showToast(`删除失败：${errorText(error)}`); return; }
  if (!data.length) { showToast('只能删除自己的记录，或自己记下的记录'); return; }
  entries = entries.filter((entry) => entry.id !== record.id); render(); showToast('记录已删除');
}

// ---------- check-in ----------
function updatePreview() { const calories = Q.calculateCalories($('#activity').value, Number($('#minutes').value) || 0); $('#caloriePreview').textContent = number(calories); $('#xpPreview').textContent = number(Math.floor(Q.experience(calories))); }
// Accounts may only log their own workouts (enforced by the workouts_own_person trigger), so there is no person picker.
function resetCheckinForm() {
  $('#activityForm').reset();
  $('#minutes').value = 30;
  $('#workoutDate').value = Q.dateKey(new Date());
  $('#workoutDate').max = Q.dateKey(new Date());
  const person = me?.person || 'Carol';
  $('#checkinWho').className = `checkin-who is-${person.toLowerCase()}`;
  $('#checkinTile').innerHTML = Q.catHtml(person);
  $('#checkinName').textContent = person;
  updatePreview();
}
function openCheckin() { resetCheckinForm(); $('#checkinDialog').showModal(); }

// ---------- session ----------
function subscribeToChanges() {
  if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
  realtimeChannel = supabaseClient.channel('workouts-live-sync').on('postgres_changes', { event:'*', schema:'public', table:'workouts' }, scheduleReload).subscribe();
}
async function startAuthenticatedApp(user) {
  if (me) return;
  const current = ++session;
  showSplash();
  try {
    const { data:member, error } = await supabaseClient.from('members').select('person').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    if (current !== session) return;
    if (!member) { await supabaseClient.auth.signOut(); hideSplash(); setAuthMessage('这个账号没有使用权限', true); return; }
    me = { id:user.id, person:member.person };
    await loadRemoteRecords();
    if (current !== session) return;
    hideAuthScreen(); resetCheckinForm(); subscribeToChanges(); hideSplash();
  } catch (error) {
    if (current !== session) return;
    me = null; showAuthScreen(); hideSplash(); setAuthMessage(`无法读取云端记录：${errorText(error)}`, true);
  }
}
function stopApp() {
  session += 1; me = null; entries = []; selectedDate = null; badgeOwner = null; freshPixel = null; clearTimeout(reloadTimer);
  if (realtimeChannel) { supabaseClient.removeChannel(realtimeChannel); realtimeChannel = null; }
  if ($('#checkinDialog').open) $('#checkinDialog').close();
  render(); showView('today'); showAuthScreen(); hideSplash();
}
// Re-import a JSON backup (from this app or the daily auto-backup). Records already present are skipped,
// so importing the same file twice is harmless. Rows go through the normal insert path, so the server
// still recomputes calories and records who imported them.
const IMPORT_BATCH = 200;
async function importRecords(file) {
  let plan;
  try {
    const { records, invalid } = window.QQLLBackup.parseBackup(await file.text());
    plan = { ...window.QQLLBackup.planImport(entries, records, me.person), invalid, total:records.length + invalid };
  } catch (error) { showToast(error.message); return; }
  const partner = Q.PEOPLE.find((person) => person !== me.person);
  const skipped = [plan.duplicates ? `跳过已存在的 ${plan.duplicates} 条` : '', plan.others ? `${plan.others} 条是 ${partner} 的，需要 ${partner} 登录后自己导入` : '', plan.invalid ? `${plan.invalid} 条格式不对` : ''].filter(Boolean).join('，');
  if (!plan.toInsert.length) { showToast(`没有需要导入的新记录${skipped ? `（${skipped}）` : ''}`); return; }
  if (!confirm(`备份里有 ${plan.total} 条记录，将导入你的 ${plan.toInsert.length} 条${skipped ? `（${skipped}）` : ''}。继续？`)) return;
  const button = $('#importRecords'); button.disabled = true; showToast('正在导入…', { key:'import' });
  let imported = 0;
  try {
    for (let i = 0; i < plan.toInsert.length; i += IMPORT_BATCH) {
      const batch = plan.toInsert.slice(i, i + IMPORT_BATCH).map((record) => ({ person:record.person, activity:record.activity, minutes:record.minutes, calories:Q.calculateCalories(record.activity, record.minutes), workout_date:record.date }));
      const { error } = await supabaseClient.from('workouts').insert(batch);
      if (error) throw error;
      imported += batch.length;
    }
    showToast(`已导入 ${imported} 条记录`, { key:'import' });
  } catch (error) {
    showToast(imported ? `导入了 ${imported} 条后出错：${errorText(error)}` : `导入失败：${errorText(error)}`, { key:'import' });
  } finally {
    button.disabled = false;
    await loadRemoteRecords().catch((error) => console.error(error));
  }
}
function exportRecords() {
  const blob = new Blob([JSON.stringify({ exported_at:new Date().toISOString(), workouts:entries.map(({ person, activity, minutes, calories, date }) => ({ person, activity, minutes, calories, date })) }, null, 2)], { type:'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `CA-Exercise-Journey-${Q.dateKey(new Date())}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function submitCheckin(event) {
  event.preventDefault();
  const button = event.target.querySelector('button[type="submit"]');
  const person = me.person;
  const minutes = Number($('#minutes').value);
  const activity = $('#activity').value;
  const calories = Q.calculateCalories(activity, minutes);
  const workoutDate = $('#workoutDate').value;
  if (!minutes || !calories || !workoutDate) return;
  button.disabled = true;
  try {
    const before = progressSnapshot();
    const saved = await addWorkout({ person, activity, minutes, calories, date:workoutDate });
    $('#checkinDialog').close();
    displayedMonth = Q.workoutMonth(saved.date); selectedDate = saved.date;
    freshPixel = { person:saved.person, date:saved.date, at:Date.now() };
    render();
    showToast(`打卡已保存，获得 ${number(Math.floor(Q.experience(saved.calories)))} XP`);
    celebrationsBetween(before, progressSnapshot()).forEach((message) => showToast(message, { celebrate:true }));
  } catch (error) {
    showToast(`保存失败：${errorText(error)}`);
  } finally {
    button.disabled = false;
  }
}
async function submitLogin(event) {
  event.preventDefault();
  const button = $('#authForm button');
  button.disabled = true; setAuthMessage('正在登录…');
  const { error } = await supabaseClient.auth.signInWithPassword({ email:$('#emailInput').value.trim(), password:$('#passwordInput').value });
  $('#passwordInput').value = ''; button.disabled = false;
  if (error) { setAuthMessage(errorText(error), true); return; }
  setAuthMessage('');
}

function bindUi() {
  document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
  $('#previousMonth').addEventListener('click', () => { displayedMonth = Q.shiftMonth(displayedMonth, -1); selectedDate = null; renderCalendar(); renderDayRecords(); });
  $('#nextMonth').addEventListener('click', () => { displayedMonth = Q.shiftMonth(displayedMonth, 1); selectedDate = null; renderCalendar(); renderDayRecords(); });
  $('#openCheckin').addEventListener('click', () => openCheckin());
  $('#themeToggle').addEventListener('click', toggleTheme);
  $('#closeCheckin').addEventListener('click', () => $('#checkinDialog').close());
  $('#habitList').addEventListener('click', (event) => {
    const checkin = event.target.closest('[data-checkin]');
    if (checkin) { openCheckin(); return; }
    const pixel = event.target.closest('[data-date]');
    if (pixel) { openCalendarAt(pixel.dataset.date); return; }
    if (event.target.closest('[data-open-calendar]')) showView('records');
  });
  $('#calendar').addEventListener('click', (event) => { const day = event.target.closest('[data-date]'); if (!day) return; selectedDate = day.dataset.date; renderCalendar(); renderDayRecords(); });
  $('#dayRecords').addEventListener('click', (event) => { const remove = event.target.closest('[data-delete]'); if (remove) deleteRecord(remove.dataset.delete); });
  document.querySelectorAll('[data-badge-owner]').forEach((button) => button.addEventListener('click', () => { badgeOwner = button.dataset.badgeOwner; renderAchievements(); }));
  $('#activity').addEventListener('change', updatePreview);
  $('#minutes').addEventListener('input', updatePreview);
  $('#activityForm').addEventListener('submit', submitCheckin);
  $('#authForm').addEventListener('submit', submitLogin);
  $('#signOut').addEventListener('click', async () => { if (!confirm('退出登录？')) return; const { error } = await supabaseClient.auth.signOut(); if (error) showToast(`退出失败：${errorText(error)}`); });
  $('#exportRecords').addEventListener('click', exportRecords);
  $('#importRecords').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', (event) => { const [file] = event.target.files; event.target.value = ''; if (file) importRecords(file); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleReload(); });
}

function boot() {
  try { LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key)); } catch { /* storage unavailable */ }
  render(); updateThemeButton();
  if (!window.supabase) { showAuthScreen(); hideSplash(); $('#authForm button').disabled = true; setAuthMessage('登录组件加载失败，请检查网络后刷新页面', true); return; }
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:false } });
  bindUi();
  // Defer Supabase calls out of the auth callback: awaiting them inside it can deadlock the auth lock.
  supabaseClient.auth.onAuthStateChange((event, authSession) => setTimeout(() => {
    if (authSession?.user) startAuthenticatedApp(authSession.user);
    else if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') stopApp();
  }, 0));
}
boot();
