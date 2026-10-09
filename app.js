// Supabase URL and publishable key are public by design; access control lives in RLS (supabase/migrations).
const SUPABASE_URL = 'https://pnjwkpxmkyoutpazlfuf.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_JSN0j-Lr3IbIiH2eGT5elg_5LhLHIDh';
const LEGACY_STORAGE_KEYS = ['ca-exercise-journey-v1', 'ca-exercise-journey-supabase-migrated-v1'];
const PAGE_SIZE = 1000;
const HEATMAP_WEEKS = 22;
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

function number(value) { return new Intl.NumberFormat('zh-CN').format(value); }
function icon(name) { return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`; }
function recordId(entry) { return String(entry.id); }
function appEntry(row) { return { id:row.id, person:row.person, activity:row.activity, minutes:row.minutes, calories:row.calories, date:row.workout_date, createdAt:new Date(row.created_at).getTime() }; }
function errorText(error) {
  const message = error?.message || String(error);
  if (/Invalid login credentials/i.test(message)) return '邮箱或密码不对';
  if (/Email not confirmed/i.test(message)) return '账号还没有确认，请联系管理员';
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) return '网络连接失败，请检查网络';
  return message;
}

function showToast(text) {
  const toast = $('#toast');
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
}
function setAuthMessage(message, isError = false) { const element = $('#authMessage'); element.textContent = message; element.classList.toggle('is-error', isError); }
function showAuthScreen() { $('#authScreen').classList.remove('is-hidden'); }
function hideAuthScreen() { $('#authScreen').classList.add('is-hidden'); }
function showView(name) {
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('is-active', item.dataset.view === name));
  document.querySelectorAll('.view').forEach((view) => view.classList.toggle('is-active', view.id === name));
}

// ---------- home ----------
function pixelHtml(day, level, label) {
  const classes = ['px', `l${level}`, day.today ? 'is-today' : '', day.future ? 'is-future' : ''].filter(Boolean).join(' ');
  return day.future ? `<i class="${classes}"></i>` : `<i class="${classes}" data-date="${day.key}" title="${Q.escapeHtml(label)}"></i>`;
}
function habitCardHtml(card) {
  const checkin = card.checkin ? `<button class="round-button" type="button" data-checkin="${card.checkin}" aria-label="给 ${card.checkin} 打卡">${icon('plus')}</button>` : '';
  return `<article class="habit-card ${card.scope}">
    <header class="habit-head"><span class="habit-tile">${card.tile}</span><div class="habit-title"><strong>${card.title}</strong><span>${card.subtitle}</span></div>${checkin}</header>
    <div class="pixel-grid" role="img" aria-label="${Q.escapeHtml(card.gridLabel)}">${card.pixels}</div>
    <footer class="habit-foot"><span class="streak ${card.streak.current ? '' : 'is-cold'}">${icon('flame')}${card.streakLabel} ${card.streak.current} 天</span><span>最长 ${card.streak.longest} 天</span><button class="icon-button" type="button" data-open-calendar aria-label="查看日历">${icon('calendar')}</button></footer>
  </article>`;
}
function renderHome() {
  const today = new Date();
  const weekly = entries.filter((entry) => Q.isInWeek(entry, today));
  const weekCalories = Q.totals(weekly);
  const weekSessions = Q.sessions(weekly);
  const lifetime = Q.totals(entries);
  const daily = G.dailyCalories(entries);
  const days = G.heatmapDays(today, HEATMAP_WEEKS);
  const { monday, sunday } = Q.weekRange(today);
  const format = new Intl.DateTimeFormat('zh-CN', { month:'numeric', day:'numeric' });
  $('#weekPeriod').textContent = `${format.format(monday)} — ${format.format(sunday)} 本周`;

  const cards = Q.PEOPLE.map((person) => {
    const activeDays = G.personDays(entries, person);
    return habitCardHtml({
      scope:`is-${person.toLowerCase()}`, tile:person[0], checkin:person,
      title:`${person} <em>Lv.${Q.currentLevel(Q.experience(lifetime[person])).level}</em>`,
      subtitle:`本周 ${weekSessions[person]} 次 · ${number(weekCalories[person])} kcal`,
      gridLabel:`${person} 最近 ${HEATMAP_WEEKS} 周的运动热力图，共 ${activeDays.size} 天有运动`,
      pixels:days.map((day) => { const calories = daily.get(day.key)?.[person] || 0; return pixelHtml(day, G.heatLevel(calories), `${day.key} · ${number(calories)} kcal`); }).join(''),
      streak:G.streaks(activeDays, today), streakLabel:'连续',
    });
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
  host.querySelectorAll('.pixel-grid').forEach((grid) => grid.style.setProperty('--weeks', HEATMAP_WEEKS));
}

// ---------- calendar ----------
function entriesOn(date) { return entries.filter((entry) => entry.date === date); }
function entryPeople(daily) { const people = new Set(daily.map((entry) => entry.person)); return people.size === 2 ? 'both' : people.has('Carol') ? 'carol' : people.has('Allen') ? 'allen' : ''; }
function renderCalendar() {
  const year = displayedMonth.getFullYear();
  const month = displayedMonth.getMonth();
  const firstCell = new Date(year, month, 1 - (new Date(year, month, 1).getDay() + 6) % 7);
  $('#calendarMonth').textContent = new Intl.DateTimeFormat('zh-CN', { year:'numeric', month:'long' }).format(displayedMonth);
  let html = '';
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(firstCell.getFullYear(), firstCell.getMonth(), firstCell.getDate() + i);
    const key = Q.dateKey(date);
    const daily = entriesOn(key);
    const people = entryPeople(daily);
    const summary = daily.slice(0, 2).map((entry) => Q.calendarEntryHtml(entry, key)).join('') + (daily.length > 2 ? `<span class="calendar-more">+${daily.length - 2}</span>` : '');
    const classes = ['day', date.getMonth() === month ? '' : 'other-month', people ? `has-${people}` : '', selectedDate === key ? 'is-selected' : ''].filter(Boolean).join(' ');
    html += `<button class="${classes}" data-date="${key}" type="button"><span class="day-number">${date.getDate()}</span>${summary}</button>`;
  }
  $('#calendar').innerHTML = html;
  document.querySelectorAll('.day').forEach((day) => day.addEventListener('click', () => { selectedDate = day.dataset.date; renderCalendar(); renderDayRecords(); }));
  bindCalendarRecordActions();
}
function renderDayRecords() {
  const host = $('#dayRecords');
  if (!selectedDate) { host.innerHTML = '<p>点按日期，查看当天记录</p>'; return; }
  const daily = entriesOn(selectedDate);
  host.innerHTML = daily.length ? daily.map(Q.dayEntryHtml).join('') : `<p>${Q.escapeHtml(selectedDate)} 没有运动记录</p>`;
}
function openCalendarAt(key) {
  displayedMonth = Q.workoutMonth(key);
  selectedDate = key;
  renderCalendar(); renderDayRecords(); showView('records');
}

// ---------- achievements ----------
function renderAchievements() {
  const t = Q.totals(entries);
  Q.PEOPLE.forEach((person) => {
    const xp = Q.experience(t[person]);
    const level = Q.currentLevel(xp);
    const prefix = person.toLowerCase();
    const progress = level.next ? (xp - level.start) / (level.next - level.start) * 100 : 100;
    $(`#${prefix}Level`).textContent = `Lv.${level.level}`;
    $(`#${prefix}ProgressText`).textContent = level.next ? `${number(xp)} / ${number(level.next)} XP` : `${number(xp)} XP · 满级`;
    $(`#${prefix}Progress`).style.width = `${Math.min(100, progress)}%`;
  });
  $('#accountInfo').textContent = me ? `当前账号：${me.person}` : '';
}
function render() { renderHome(); renderCalendar(); renderDayRecords(); renderAchievements(); }

// ---------- data ----------
async function fetchAllRows() {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseClient.from('workouts').select('id,person,activity,minutes,calories,workout_date,created_at').order('workout_date', { ascending:false }).order('created_at', { ascending:false }).order('id', { ascending:false }).range(from, from + PAGE_SIZE - 1);
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
  const { data:row, error } = await supabaseClient.from('workouts').insert({ person:entry.person, activity:entry.activity, minutes:entry.minutes, calories:entry.calories, workout_date:entry.date }).select('id,person,activity,minutes,calories,workout_date,created_at').single();
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
function bindCalendarRecordActions() {
  document.querySelectorAll('.calendar-entry').forEach((item) => {
    let timer = null; let longPressed = false;
    const clear = () => { clearTimeout(timer); timer = null; };
    const trigger = () => { if (longPressed) return; clear(); longPressed = true; deleteRecord(item.dataset.entryId); };
    item.addEventListener('pointerdown', (event) => { event.stopPropagation(); longPressed = false; timer = setTimeout(trigger, 600); });
    item.addEventListener('pointerup', clear);
    item.addEventListener('pointerleave', clear);
    item.addEventListener('pointercancel', clear);
    item.addEventListener('click', (event) => { event.stopPropagation(); if (longPressed) return; selectedDate = item.dataset.date; renderCalendar(); renderDayRecords(); });
    item.addEventListener('contextmenu', (event) => { event.preventDefault(); event.stopPropagation(); trigger(); });
  });
}

// ---------- check-in ----------
function setPerson(person) {
  document.querySelectorAll('.person-option').forEach((option) => { const input = option.querySelector('input'); input.checked = input.value === person; option.classList.toggle('is-selected', input.checked); });
}
function updatePreview() { const calories = Q.calculateCalories($('#activity').value, Number($('#minutes').value) || 0); $('#caloriePreview').textContent = number(calories); $('#xpPreview').textContent = number(Q.experience(calories)); }
function resetCheckinForm(person = me?.person || 'Carol') {
  $('#activityForm').reset();
  $('#minutes').value = 30;
  $('#workoutDate').value = Q.dateKey(new Date());
  $('#workoutDate').max = Q.dateKey(new Date());
  setPerson(person); updatePreview();
}
function openCheckin(person) { resetCheckinForm(person); $('#checkinDialog').showModal(); }

// ---------- session ----------
function subscribeToChanges() {
  if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
  realtimeChannel = supabaseClient.channel('workouts-live-sync').on('postgres_changes', { event:'*', schema:'public', table:'workouts' }, scheduleReload).subscribe();
}
async function startAuthenticatedApp(user) {
  if (me) return;
  const current = ++session;
  try {
    const { data:member, error } = await supabaseClient.from('members').select('person').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    if (current !== session) return;
    if (!member) { await supabaseClient.auth.signOut(); setAuthMessage('这个账号没有使用权限', true); return; }
    me = { id:user.id, person:member.person };
    await loadRemoteRecords();
    if (current !== session) return;
    hideAuthScreen(); resetCheckinForm(); subscribeToChanges();
  } catch (error) {
    if (current !== session) return;
    me = null; showAuthScreen(); setAuthMessage(`无法读取云端记录：${errorText(error)}`, true);
  }
}
function stopApp() {
  session += 1; me = null; entries = []; selectedDate = null; clearTimeout(reloadTimer);
  if (realtimeChannel) { supabaseClient.removeChannel(realtimeChannel); realtimeChannel = null; }
  if ($('#checkinDialog').open) $('#checkinDialog').close();
  render(); showView('today'); showAuthScreen();
}
function exportRecords() {
  const blob = new Blob([JSON.stringify({ exported_at:new Date().toISOString(), workouts:entries.map(({ person, activity, minutes, calories, date }) => ({ person, activity, minutes, calories, date })) }, null, 2)], { type:'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `CA-Exercise-Journey-${Q.dateKey(new Date())}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function submitCheckin(event) {
  event.preventDefault();
  const button = event.target.querySelector('button[type="submit"]');
  const person = document.querySelector('input[name="person"]:checked').value;
  const minutes = Number($('#minutes').value);
  const activity = $('#activity').value;
  const calories = Q.calculateCalories(activity, minutes);
  const workoutDate = $('#workoutDate').value;
  if (!minutes || !calories || !workoutDate) return;
  button.disabled = true;
  try {
    const saved = await addWorkout({ person, activity, minutes, calories, date:workoutDate });
    $('#checkinDialog').close();
    displayedMonth = Q.workoutMonth(saved.date); selectedDate = saved.date;
    render();
    showToast(`打卡已保存，获得 ${number(Q.experience(saved.calories))} XP`);
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
  $('#closeCheckin').addEventListener('click', () => $('#checkinDialog').close());
  $('#habitList').addEventListener('click', (event) => {
    const checkin = event.target.closest('[data-checkin]');
    if (checkin) { openCheckin(checkin.dataset.checkin); return; }
    const pixel = event.target.closest('[data-date]');
    if (pixel) { openCalendarAt(pixel.dataset.date); return; }
    if (event.target.closest('[data-open-calendar]')) showView('records');
  });
  document.querySelectorAll('.person-option input').forEach((input) => input.addEventListener('change', () => setPerson(input.value)));
  $('#activity').addEventListener('change', updatePreview);
  $('#minutes').addEventListener('input', updatePreview);
  $('#activityForm').addEventListener('submit', submitCheckin);
  $('#authForm').addEventListener('submit', submitLogin);
  $('#signOut').addEventListener('click', async () => { if (!confirm('退出登录？')) return; const { error } = await supabaseClient.auth.signOut(); if (error) showToast(`退出失败：${errorText(error)}`); });
  $('#exportRecords').addEventListener('click', exportRecords);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleReload(); });
}

function boot() {
  try { LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key)); } catch { /* storage unavailable */ }
  render();
  if (!window.supabase) { showAuthScreen(); $('#authForm button').disabled = true; setAuthMessage('登录组件加载失败，请检查网络后刷新页面', true); return; }
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:false } });
  bindUi();
  // Defer Supabase calls out of the auth callback: awaiting them inside it can deadlock the auth lock.
  supabaseClient.auth.onAuthStateChange((event, authSession) => setTimeout(() => {
    if (authSession?.user) startAuthenticatedApp(authSession.user);
    else if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') stopApp();
  }, 0));
}
boot();
