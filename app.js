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
const Cy = window.QQLLCycle;
const K = window.QQLLGomoku;
// Only Carol tracks a period; the data model allows either person, the UI shows it for her.
const CYCLE_PERSON = 'Carol';

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
let periodDays = [];          // [{ person, date }]
let periodsAvailable = false; // false until the period_days migration has been run
let games = [];               // newest first
let boardMoves = [];          // moves of the game on the board (the active one, else the latest)
let gomokuAvailable = false;  // false until the gomoku migration has been run
let pendingCell = null;       // { x, y } picked but not yet confirmed
let announcedGame = null;     // id of the last finished game we already announced

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
  if (typeof renderBattle === 'function') renderBattle();
}

// ---------- period ----------
function periodKeys(person) { return periodDays.filter((period) => period.person === person).map((period) => period.date); }
function restDays(person) { return new Set(periodKeys(person)); }
function cycleFor(person) { return Cy.cycleSummary(periodKeys(person), new Date()); }
function periodDayNumber(person, key) {
  const period = Cy.periodsFromDays(periodKeys(person)).find((item) => key >= item.start && key <= item.end);
  return period && periodKeys(person).includes(key) ? Math.round((new Date(`${key}T00:00:00`) - new Date(`${period.start}T00:00:00`)) / 864e5) + 1 : 0;
}
function periodClass(person, key) {
  return periodsAvailable && person === CYCLE_PERSON && periodKeys(person).includes(key) ? 'is-period' : '';
}
function shortDate(key) { return new Intl.DateTimeFormat('zh-CN', { month:'numeric', day:'numeric' }).format(new Date(`${key}T00:00:00`)); }
function cycleCardHtml(cycle) {
  const todayKey = Q.dateKey(new Date());
  const mine = me?.person === CYCLE_PERSON;
  // Recording only: what has been marked, never a prediction.
  const status = {
    none:'还没有记录',
    in:`经期第 ${cycle.dayOfPeriod} 天`,
    after:cycle.last ? `上次经期 ${shortDate(cycle.last.start)}${cycle.last.length > 1 ? `–${shortDate(cycle.last.end)}` : ''}，共 ${cycle.last.length} 天` : '',
  }[cycle.status];
  const action = mine
    ? '<button class="primary-button is-period" type="button" data-period-open>记录经期</button>'
    : `<p class="cycle-note">由 ${CYCLE_PERSON} 记录</p>`;
  return `<article class="habit-card cycle-card">
    <header class="habit-head"><span class="habit-tile cycle-tile">${icon('paw')}</span><div class="habit-title"><strong>${CYCLE_PERSON} 的经期</strong><span>${status}</span></div></header>
    ${action}
    ${mine ? '<p class="cycle-note">选开始和结束日期，一次标记整段；日历里也能单独修改某一天。</p>' : ''}
  </article>`;
}
// Range sheet: pick start and end, mark (or unmark) every day in between at once.
function periodRange() { return Cy.rangeDays($('#periodStart').value, $('#periodEnd').value, new Date()); }
function updatePeriodSummary() {
  const range = periodRange();
  const marked = range.days ? range.days.filter((key) => periodKeys(CYCLE_PERSON).includes(key)).length : 0;
  $('#periodSummary').textContent = range.error || `${shortDate(range.days[0])}${range.days.length > 1 ? ` – ${shortDate(range.days[range.days.length - 1])}` : ''}，共 ${range.days.length} 天${marked ? `（其中 ${marked} 天已标记）` : ''}`;
  $('#periodSummary').classList.toggle('is-error', !!range.error);
}
function openPeriodSheet() {
  const todayKey = Q.dateKey(new Date());
  const cycle = cycleFor(CYCLE_PERSON);
  $('#periodStart').value = cycle.status === 'in' ? cycle.current.start : todayKey;
  $('#periodEnd').value = todayKey;
  $('#periodStart').max = todayKey; $('#periodEnd').max = todayKey;
  updatePeriodSummary(); $('#periodDialog').showModal();
}
async function savePeriodRange(event) {
  event.preventDefault();
  if (me?.person !== CYCLE_PERSON || !periodsAvailable) return;
  const range = periodRange();
  if (range.error) { updatePeriodSummary(); return; }
  const missing = range.days.filter((key) => !periodKeys(me.person).includes(key));
  if (!missing.length) { showToast('这段日期已经都标记过了', { key:'period' }); $('#periodDialog').close(); return; }
  const { error } = await supabaseClient.from('period_days').insert(missing.map((key) => ({ person:me.person, period_date:key })));
  if (error) { showToast(`保存失败：${errorText(error)}`, { key:'period' }); return; }
  periodDays = [...periodDays, ...missing.map((date) => ({ person:me.person, date }))];
  $('#periodDialog').close(); render();
  showToast(`已标记 ${shortDate(range.days[0])}–${shortDate(range.days[range.days.length - 1])} 为经期`, { key:'period' });
}
async function clearPeriodRange() {
  if (me?.person !== CYCLE_PERSON || !periodsAvailable) return;
  const range = periodRange();
  if (range.error) { updatePeriodSummary(); return; }
  const marked = range.days.filter((key) => periodKeys(me.person).includes(key));
  if (!marked.length) { showToast('这段日期里没有经期标记', { key:'period' }); return; }
  if (!confirm(`取消 ${shortDate(range.days[0])}–${shortDate(range.days[range.days.length - 1])} 之间 ${marked.length} 天的经期标记？`)) return;
  const { error } = await supabaseClient.from('period_days').delete().eq('person', me.person).gte('period_date', range.days[0]).lte('period_date', range.days[range.days.length - 1]);
  if (error) { showToast(`保存失败：${errorText(error)}`, { key:'period' }); return; }
  periodDays = periodDays.filter((period) => !(period.person === me.person && marked.includes(period.date)));
  $('#periodDialog').close(); render();
  showToast(`已取消 ${marked.length} 天的经期标记`, { key:'period' });
}
async function togglePeriodDay(key) {
  if (me?.person !== CYCLE_PERSON || !periodsAvailable) return;
  const marked = periodKeys(me.person).includes(key);
  const request = marked
    ? supabaseClient.from('period_days').delete().eq('person', me.person).eq('period_date', key)
    : supabaseClient.from('period_days').insert({ person:me.person, period_date:key });
  const { error } = await request;
  if (error) { showToast(`保存失败：${errorText(error)}`); return; }
  periodDays = marked ? periodDays.filter((period) => !(period.person === me.person && period.date === key)) : [...periodDays, { person:me.person, date:key }];
  render(); showToast(marked ? `已取消 ${shortDate(key)} 的经期标记` : `已标记 ${shortDate(key)} 为经期`, { key:'period' });
}

// ---------- home ----------
function personTitle(person) { const level = Q.currentLevel(Q.experience(Q.totals(entries)[person])).level; return `Lv.${level} · ${G.levelTitle(level)}`; }
function pixelHtml(day, level, label, extra = '') {
  const classes = ['px', `l${level}`, day.today ? 'is-today' : '', day.future ? 'is-future' : ''].filter(Boolean).join(' ');
  if (day.future) return `<i class="${classes}"></i>`;
  if (extra === 'is-period') return `<span class="px-box" data-date="${day.key}" title="${Q.escapeHtml(label)}"><i class="${classes}"></i></span>`;
  return `<i class="${classes}" data-date="${day.key}" title="${Q.escapeHtml(label)}"></i>`;
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

  // Shared items first: the weekly enemy and "together", then each person.
  const cards = [bossCardHtml(G.weeklyBoss(entries, today), G.bossWins(entries, today))];
  const together = G.togetherDays(entries);
  cards.push(habitCardHtml({
    scope:'is-both', tile:icon('heart'),
    title:'一起运动', subtitle:`两人同一天都打卡 · 本月 ${G.countInMonth(together, today)} 天`,
    gridLabel:`最近 ${HEATMAP_WEEKS} 周两人一起运动的热力图，共 ${together.size} 天`,
    pixels:days.map((day) => { const totals = daily.get(day.key); const level = together.has(day.key) ? G.heatLevel(Math.min(totals.Carol, totals.Allen)) : 0; return pixelHtml(day, level, level ? `${day.key} · 一起运动` : day.key); }).join(''),
    streak:G.streaks(together, today), streakLabel:'同步',
  }));
  Q.PEOPLE.forEach((person) => {
    const activeDays = G.personDays(entries, person);
    const cycle = cycleFor(person);
    cards.push(habitCardHtml({
      scope:`is-${person.toLowerCase()}`, tile:Q.catHtml(person), checkin:me?.person === person ? person : null,
      title:`${person} <em>${personTitle(person)}</em>`,
      subtitle:`本周 ${weekSessions[person]} 次 · ${number(weekCalories[person])} kcal`,
      gridLabel:`${person} 最近 ${HEATMAP_WEEKS} 周的运动热力图，共 ${activeDays.size} 天有运动`,
      pixels:days.map((day) => {
        const calories = daily.get(day.key)?.[person] || 0;
        const extra = periodClass(person, day.key);
        const note = extra ? ' · 经期' : '';
        return pixelHtml(day, G.heatLevel(calories), `${day.key} · ${number(calories)} kcal${note}`, extra);
      }).join(''),
      streak:G.streaks(activeDays, today, restDays(person)), streakLabel:'连续',
    }));
    if (person === CYCLE_PERSON && periodsAvailable) cards.push(cycleCardHtml(cycle));
  });
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
    const classes = ['day', date.getMonth() === month ? '' : 'other-month', key === todayKey ? 'is-today' : '', selectedDate === key ? 'is-selected' : '', periodClass(CYCLE_PERSON, key) ? 'is-period-day' : ''].filter(Boolean).join(' ');
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
  host.innerHTML = (daily.length
    ? `<h3 class="day-heading">${heading} · ${daily.length} 条记录</h3>${daily.map((entry) => Q.dayEntryHtml(entry, canDelete(entry))).join('')}`
    : `<p>${heading} 没有运动记录</p>`) + periodRowHtml(selectedDate);
}
function periodRowHtml(key) {
  if (!periodsAvailable) return '';
  const dayNumber = periodDayNumber(CYCLE_PERSON, key);
  const text = dayNumber ? `${CYCLE_PERSON} 经期第 ${dayNumber} 天` : '';
  const canToggle = me?.person === CYCLE_PERSON && key <= Q.dateKey(new Date());
  if (!text && !canToggle) return '';
  const toggle = canToggle ? `<button class="link-button" type="button" data-period-toggle="${key}">${dayNumber ? '取消经期标记' : '标记为经期'}</button>` : '';
  return `<div class="period-row${dayNumber ? ' is-marked' : ''}"><span>${icon('paw')}${text || '不在经期'}</span>${toggle}</div>`;
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
  const owner = badgeOwner || 'couple';
  document.querySelectorAll('[data-badge-owner]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.badgeOwner === owner)));
  const rec = K.record(games);
  const badges = owner === 'couple' ? G.coupleBadges(entries, new Date(), { gomokuGames:rec.finished }) : G.personalBadges(entries, owner, restDays(owner), { gomokuWins:rec[owner] });
  const scope = owner === 'couple' ? 'is-both' : `is-${owner.toLowerCase()}`;
  $('#badgeGrid').innerHTML = badges.map((badge) => badgeHtml(badge, scope)).join('');
  $('#accountInfo').textContent = me ? `当前账号：${me.person}` : '';
}
function render() {
  document.querySelectorAll('.period-legend').forEach((item) => { item.hidden = !periodsAvailable; });
  renderHome(); renderCalendar(); renderDayRecords(); renderAchievements(); renderBattle();
}

// ---------- gomoku ----------
function shownGame() { return games.find((game) => game.status === 'playing') || games[0] || null; }
function gomokuPlayerHtml(person, game, turn) {
  const role = game ? (game.black === person ? '先手' : '后手') : '';
  return `<div class="gomoku-player is-${person.toLowerCase()}${turn === person ? ' is-turn' : ''}"><span class="habit-tile">${Q.catHtml(person)}</span><span>${person}<small>${role}${me?.person === person ? ' · 你' : ''}</small></span><i class="stone-swatch"></i></div>`;
}
function renderBattle() {
  $('#battleTab').hidden = !gomokuAvailable;
  const game = shownGame();
  const turn = K.nextTurn(game, boardMoves);
  const myTurn = !!me && turn === me.person;
  $('#battleDot').hidden = !(myTurn && !$('#battle').classList.contains('is-active'));
  if (!gomokuAvailable) return;

  $('#gomokuPlayers').innerHTML = Q.PEOPLE.map((person) => gomokuPlayerHtml(person, game, turn)).join('');
  const win = game?.status === 'finished' ? K.winningLine(boardMoves) : null;
  const status = $('#gomokuStatus');
  status.classList.toggle('is-mine', myTurn);
  if (!game) status.textContent = '还没有对局，开一局吧';
  else if (game.status === 'playing') status.textContent = `第 ${boardMoves.length + 1} 手 · ${myTurn ? (pendingCell ? '再点一次或按「落子」确认' : '轮到你了') : `等 ${turn} 落子`}`;
  else if (!game.winner) status.textContent = `平局 · 下满了 ${game.move_count} 手`;
  else status.textContent = `${game.winner} 赢了这局 · 共 ${game.move_count} 手${win ? '' : `（${game.winner === game.black ? game.white : game.black} 认输）`}`;

  const stones = K.board(boardMoves);
  const last = boardMoves[boardMoves.length - 1];
  const winning = new Set((win?.cells || []).map(([x, y]) => `${x},${y}`));
  const stars = new Set(['3,3', '3,11', '11,3', '11,11', '7,7']);
  let html = '';
  for (let y = 0; y < K.SIZE; y += 1) {
    for (let x = 0; x < K.SIZE; x += 1) {
      const key = `${x},${y}`;
      const owner = stones.get(key);
      const pending = !owner && pendingCell && pendingCell.x === x && pendingCell.y === y;
      const classes = ['gomoku-cell', x === 0 ? 'edge-l' : '', x === K.SIZE - 1 ? 'edge-r' : '', y === 0 ? 'edge-t' : '', y === K.SIZE - 1 ? 'edge-b' : '', stars.has(key) ? 'is-star' : '', last && last.x === x && last.y === y ? 'is-last' : '', winning.has(key) ? 'is-win' : ''].filter(Boolean).join(' ');
      const stone = owner ? `<i class="stone is-${owner.toLowerCase()}"></i>` : pending ? `<i class="stone is-pending is-${me.person.toLowerCase()}"></i>` : '';
      html += `<button class="${classes}" type="button" data-x="${x}" data-y="${y}" aria-label="${x + 1} 列 ${y + 1} 行${owner ? `，${owner} 的子` : ''}">${stone}</button>`;
    }
  }
  $('#gomokuBoard').innerHTML = html;
  $('#gomokuPlace').hidden = !(myTurn && pendingCell);
  $('#gomokuNew').hidden = !(game?.status !== 'playing' && me);
  $('#gomokuResign').hidden = !(game?.status === 'playing' && me && (game.black === me.person || game.white === me.person));

  const rec = K.record(games);
  const format = new Intl.DateTimeFormat('zh-CN', { month:'numeric', day:'numeric' });
  const history = games.filter((item) => item.status === 'finished').slice(0, 5).map((item) => `<li><span>${format.format(new Date(item.finished_at || item.created_at))}</span><span>${item.winner ? `${item.winner} 胜` : '平局'} · ${item.move_count} 手</span></li>`).join('');
  $('#gomokuRecord').innerHTML = `<h3>战绩</h3><div class="gomoku-score"><div class="is-carol"><b>${rec.Carol}</b><span>Carol 胜</span></div><div class="is-both"><b>${rec.draws}</b><span>平局</span></div><div class="is-allen"><b>${rec.Allen}</b><span>Allen 胜</span></div></div>${history ? `<ul class="gomoku-history">${history}</ul>` : ''}`;
}
async function placeStone(x, y) {
  const game = shownGame();
  const problem = K.canPlay(game, boardMoves, me?.person, x, y);
  if (problem) { showToast(problem, { key:'gomoku' }); return; }
  pendingCell = null;
  boardMoves = [...boardMoves, { moveNo:boardMoves.length + 1, person:me.person, x, y }];   // optimistic; the reload confirms
  renderBattle();
  const { error } = await supabaseClient.from('gomoku_moves').insert({ game_id:game.id, x, y });
  if (error) showToast(`落子失败：${errorText(error)}`, { key:'gomoku' });
  await loadRemoteRecords().catch((reloadError) => console.error(reloadError));
}
function tapCell(x, y) {
  const game = shownGame();
  if (!me || game?.status !== 'playing') return;
  if (K.nextTurn(game, boardMoves) !== me.person) { showToast(`还没轮到你，等 ${K.nextTurn(game, boardMoves)} 落子`, { key:'gomoku' }); return; }
  if (K.board(boardMoves).has(`${x},${y}`)) return;
  if (pendingCell && pendingCell.x === x && pendingCell.y === y) { placeStone(x, y); return; }
  pendingCell = { x, y }; renderBattle();
}
async function startGame() {
  // black / white are decided by the gomoku_games_before_insert trigger; these placeholders only satisfy NOT NULL.
  const { error } = await supabaseClient.from('gomoku_games').insert({ black:'Carol', white:'Allen' });
  if (error) { showToast(`开局失败：${errorText(error)}`, { key:'gomoku' }); return; }
  pendingCell = null; await loadRemoteRecords().catch((reloadError) => console.error(reloadError));
  const game = shownGame();
  if (game) showToast(`新的一局，${game.black} 先手`, { key:'gomoku' });
}
async function resignGame() {
  const game = shownGame();
  if (!game || game.status !== 'playing' || !confirm('认输这一局？')) return;
  const { error } = await supabaseClient.rpc('gomoku_resign', { p_game:game.id });
  if (error) { showToast(`认输失败：${errorText(error)}`, { key:'gomoku' }); return; }
  await loadRemoteRecords().catch((reloadError) => console.error(reloadError));
}
// When the game on the board has just finished (by either phone), say who won — once per game.
function announceResult(previous) {
  const game = shownGame();
  if (!me || !game || game.status !== 'finished' || announcedGame === game.id) return;
  const justFinished = previous && previous.id === game.id && previous.status === 'playing';
  announcedGame = game.id;
  if (!justFinished) return;
  if (!game.winner) showToast('这局下成了平局', { key:'gomoku' });
  else if (game.winner === me.person) showToast('你赢了这局五子棋', { celebrate:true });
  else showToast(`${game.winner} 赢了这局`, { key:'gomoku' });
}

// ---------- celebrations ----------
// Snapshot before and after a save; anything newly earned becomes a celebration toast.
function progressSnapshot() {
  const today = new Date();
  const unlocked = (list) => new Set(list.filter((badge) => badge.unlocked).map((badge) => badge.name));
  return {
    levels:Object.fromEntries(Q.PEOPLE.map((person) => [person, Q.currentLevel(Q.experience(Q.totals(entries)[person])).level])),
    badges:Object.fromEntries([['一起', unlocked(G.coupleBadges(entries, today, { gomokuGames:K.record(games).finished }))], ...Q.PEOPLE.map((person) => [person, unlocked(G.personalBadges(entries, person, restDays(person), { gomokuWins:K.record(games)[person] }))])]),
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
  // On period days data-date sits on the pink box around the paw, so resolve to the paw itself.
  const cells = document.querySelectorAll(`.habit-card.is-${freshPixel.person.toLowerCase()} [data-date="${freshPixel.date}"], .habit-card.is-both [data-date="${freshPixel.date}"]`);
  cells.forEach((cell) => { const pixel = cell.classList.contains('px') ? cell : cell.querySelector('.px'); if (!pixel || pixel.classList.contains('l0')) return; pixel.style.animationDelay = `-${elapsed}ms`; pixel.classList.add('is-new'); });
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
// Period days are optional: before the period_days migration runs, the query fails and the feature stays hidden.
async function fetchPeriodDays() {
  const { data, error } = await supabaseClient.from('period_days').select('person,period_date').order('period_date');
  if (error) { console.warn('period tracking unavailable:', error.message); return null; }
  return data.map((row) => ({ person:row.person, date:row.period_date }));
}
// Gomoku is optional in the same way: before its migration runs the battle tab stays hidden.
async function fetchGomoku() {
  const { data:list, error } = await supabaseClient.from('gomoku_games').select('id,black,white,status,winner,move_count,created_at,finished_at').order('id', { ascending:false }).limit(50);
  if (error) { console.warn('gomoku unavailable:', error.message); return null; }
  const shown = list.find((game) => game.status === 'playing') || list[0];
  if (!shown) return { games:list, moves:[] };
  const { data:moves, error:movesError } = await supabaseClient.from('gomoku_moves').select('move_no,person,x,y').eq('game_id', shown.id).order('move_no');
  if (movesError) { console.warn('gomoku moves unavailable:', movesError.message); return null; }
  return { games:list, moves:moves.map((move) => ({ moveNo:move.move_no, person:move.person, x:move.x, y:move.y })) };
}
async function loadRemoteRecords() {
  const current = session;
  const [rows, periods, gomoku] = await Promise.all([fetchAllRows(), fetchPeriodDays(), fetchGomoku()]);
  if (current !== session) return;
  entries = rows.map(appEntry); periodDays = periods || []; periodsAvailable = periods !== null;
  const previous = shownGame();
  games = gomoku?.games || []; boardMoves = gomoku?.moves || []; gomokuAvailable = gomoku !== null;
  if (pendingCell && (shownGame()?.status !== 'playing' || K.board(boardMoves).has(`${pendingCell.x},${pendingCell.y}`))) pendingCell = null;
  announceResult(previous);
  render();
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
  realtimeChannel = supabaseClient.channel('workouts-live-sync')
    .on('postgres_changes', { event:'*', schema:'public', table:'workouts' }, scheduleReload)
    .on('postgres_changes', { event:'*', schema:'public', table:'period_days' }, scheduleReload)
    .on('postgres_changes', { event:'*', schema:'public', table:'gomoku_games' }, scheduleReload)
    .on('postgres_changes', { event:'*', schema:'public', table:'gomoku_moves' }, scheduleReload)
    .subscribe();
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
  session += 1; me = null; entries = []; periodDays = []; periodsAvailable = false; games = []; boardMoves = []; gomokuAvailable = false; pendingCell = null; announcedGame = null; selectedDate = null; badgeOwner = null; freshPixel = null; clearTimeout(reloadTimer);
  if (realtimeChannel) { supabaseClient.removeChannel(realtimeChannel); realtimeChannel = null; }
  if ($('#checkinDialog').open) $('#checkinDialog').close();
  if ($('#periodDialog').open) $('#periodDialog').close();
  render(); showView('today'); showAuthScreen(); hideSplash();
}
// Re-import a JSON backup (from this app or the daily auto-backup). Records already present are skipped,
// so importing the same file twice is harmless. Rows go through the normal insert path, so the server
// still recomputes calories and records who imported them.
const IMPORT_BATCH = 200;
async function importRecords(file) {
  let plan;
  try {
    const { records, periods, invalid } = window.QQLLBackup.parseBackup(await file.text());
    plan = { ...window.QQLLBackup.planImport(entries, records, me.person), invalid, total:records.length + invalid };
    plan.periods = periodsAvailable ? window.QQLLBackup.planPeriodImport(periodDays, periods, me.person) : { toInsert:[], duplicates:0, others:0 };
  } catch (error) { showToast(error.message); return; }
  const partner = Q.PEOPLE.find((person) => person !== me.person);
  const skipped = [plan.duplicates ? `跳过已存在的 ${plan.duplicates} 条` : '', plan.others ? `${plan.others} 条是 ${partner} 的，需要 ${partner} 登录后自己导入` : '', plan.invalid ? `${plan.invalid} 条格式不对` : ''].filter(Boolean).join('，');
  const periodNote = plan.periods.toInsert.length ? `，以及 ${plan.periods.toInsert.length} 天经期标记` : '';
  if (!plan.toInsert.length && !plan.periods.toInsert.length) { showToast(`没有需要导入的新记录${skipped ? `（${skipped}）` : ''}`); return; }
  if (!confirm(`备份里有 ${plan.total} 条记录，将导入你的 ${plan.toInsert.length} 条${periodNote}${skipped ? `（${skipped}）` : ''}。继续？`)) return;
  const button = $('#importRecords'); button.disabled = true; showToast('正在导入…', { key:'import' });
  let imported = 0;
  try {
    for (let i = 0; i < plan.toInsert.length; i += IMPORT_BATCH) {
      const batch = plan.toInsert.slice(i, i + IMPORT_BATCH).map((record) => ({ person:record.person, activity:record.activity, minutes:record.minutes, calories:Q.calculateCalories(record.activity, record.minutes), workout_date:record.date }));
      const { error } = await supabaseClient.from('workouts').insert(batch);
      if (error) throw error;
      imported += batch.length;
    }
    if (plan.periods.toInsert.length) {
      const { error } = await supabaseClient.from('period_days').insert(plan.periods.toInsert.map((period) => ({ person:period.person, period_date:period.date })));
      if (error) throw error;
    }
    showToast(`已导入 ${imported} 条记录${periodNote}`, { key:'import' });
  } catch (error) {
    showToast(imported ? `导入了 ${imported} 条后出错：${errorText(error)}` : `导入失败：${errorText(error)}`, { key:'import' });
  } finally {
    button.disabled = false;
    await loadRemoteRecords().catch((error) => console.error(error));
  }
}
function exportRecords() {
  const blob = new Blob([JSON.stringify({ exported_at:new Date().toISOString(), workouts:entries.map(({ person, activity, minutes, calories, date }) => ({ person, activity, minutes, calories, date })), periods:periodDays.map(({ person, date }) => ({ person, date })) }, null, 2)], { type:'application/json' });
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
    if (event.target.closest('[data-period-open]')) { openPeriodSheet(); return; }
    const checkin = event.target.closest('[data-checkin]');
    if (checkin) { openCheckin(); return; }
    const pixel = event.target.closest('[data-date]');
    if (pixel) { openCalendarAt(pixel.dataset.date); return; }
    if (event.target.closest('[data-open-calendar]')) showView('records');
  });
  $('#calendar').addEventListener('click', (event) => { const day = event.target.closest('[data-date]'); if (!day) return; selectedDate = day.dataset.date; renderCalendar(); renderDayRecords(); });
  $('#dayRecords').addEventListener('click', (event) => {
    const periodToggle = event.target.closest('[data-period-toggle]');
    if (periodToggle) { togglePeriodDay(periodToggle.dataset.periodToggle); return; }
    const remove = event.target.closest('[data-delete]'); if (remove) deleteRecord(remove.dataset.delete);
  });
  document.querySelectorAll('[data-badge-owner]').forEach((button) => button.addEventListener('click', () => { badgeOwner = button.dataset.badgeOwner; renderAchievements(); }));
  $('#gomokuBoard').addEventListener('click', (event) => { const cell = event.target.closest('[data-x]'); if (cell) tapCell(Number(cell.dataset.x), Number(cell.dataset.y)); });
  $('#gomokuPlace').addEventListener('click', () => { if (pendingCell) placeStone(pendingCell.x, pendingCell.y); });
  $('#gomokuNew').addEventListener('click', startGame);
  $('#gomokuResign').addEventListener('click', resignGame);
  $('#periodForm').addEventListener('submit', savePeriodRange);
  $('#periodUnmark').addEventListener('click', clearPeriodRange);
  $('#closePeriod').addEventListener('click', () => $('#periodDialog').close());
  $('#periodStart').addEventListener('input', updatePeriodSummary);
  $('#periodEnd').addEventListener('input', updatePeriodSummary);
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
