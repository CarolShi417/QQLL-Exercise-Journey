const STORAGE_KEY = 'ca-exercise-journey-v1';
const $ = (selector) => document.querySelector(selector);
let entries = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
let displayedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedDate = null;
const calorieRates = { '瑜伽':3.5, '无氧/力量':6, '游泳':8, '骑行':7, '跑步':10 };
const levels = [{ level:0, start:0, next:100 }, { level:1, start:100, next:300 }, { level:2, start:300, next:600 }, { level:3, start:600, next:null }];

function dateKey(date) { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function number(value) { return new Intl.NumberFormat('zh-CN').format(value); }
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); }
function totals(list = entries) { return list.reduce((all, entry) => { all[entry.person] += entry.calories; return all; }, { Carol:0, Allen:0 }); }
function calculateCalories(activity, minutes) { return Math.round((calorieRates[activity] || 0) * minutes); }
function experience(calories) { return calories / 10; }
function currentLevel(xp) { return [...levels].reverse().find((level) => xp >= level.start); }
function recordId(entry) { return String(entry.id || entry.createdAt); }
function weekRange() { const now = new Date(); const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); monday.setHours(0,0,0,0); const sunday = new Date(monday); sunday.setDate(monday.getDate()+6); return { monday, sunday }; }
function isThisWeek(entry) { const { monday, sunday } = weekRange(); const date = new Date(`${entry.date}T00:00:00`); return date >= monday && date <= sunday; }
function renderToday() {
  const weekly = entries.filter(isThisWeek); const t = totals(weekly); const sessions = weekly.reduce((all, entry) => { all[entry.person] += 1; return all; }, { Carol:0, Allen:0 }); const { monday, sunday } = weekRange(); const opt = {month:'numeric',day:'numeric'};
  $('#weekPeriod').textContent = `${new Intl.DateTimeFormat('zh-CN',opt).format(monday)} — ${new Intl.DateTimeFormat('zh-CN',opt).format(sunday)} 本周`;
  $('#carolSessions').textContent = sessions.Carol; $('#allenSessions').textContent = sessions.Allen; $('#carolCalories').textContent = number(t.Carol); $('#allenCalories').textContent = number(t.Allen);
}
function entryPeople(date) { const people = new Set(entries.filter((entry) => entry.date === date).map((entry) => entry.person)); return people.size === 2 ? 'both' : people.has('Carol') ? 'carol' : people.has('Allen') ? 'allen' : ''; }
function renderCalendar() {
  const year = displayedMonth.getFullYear(); const month = displayedMonth.getMonth(); const firstWeekday = (new Date(year, month, 1).getDay()+6)%7; const firstCell = new Date(year, month, 1-firstWeekday); $('#calendarMonth').textContent = new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'long'}).format(displayedMonth); let html='';
  for(let i=0;i<42;i+=1){ const date = new Date(firstCell); date.setDate(firstCell.getDate()+i); const key=dateKey(date); const inMonth=date.getMonth()===month; const people=entryPeople(key); const daily = entries.filter((entry) => entry.date === key).slice(0, 2); const summary = daily.map((entry) => `<span class="calendar-entry ${entry.person === 'Carol' ? 'calendar-carol' : 'calendar-allen'}" data-date="${key}" data-entry-id="${recordId(entry)}" title="长按删除"><i>${entry.person[0]}</i><b>${entry.activity}</b></span>`).join(''); html += `<button class="day ${inMonth?'':'other-month'} ${people?`has-${people}`:''} ${selectedDate===key?'is-selected':''}" data-date="${key}" type="button"><span class="day-number">${date.getDate()}</span>${summary}</button>`; }
  $('#calendar').innerHTML=html; document.querySelectorAll('.day').forEach((day)=>day.addEventListener('click',()=>{selectedDate=day.dataset.date;renderCalendar();renderDayRecords();})); bindCalendarRecordActions();
}
function deleteRecord(id) { const record = entries.find((entry) => recordId(entry) === id); if (!record || !confirm(`删除 ${record.person} 的「${record.activity}」记录？`)) return; entries = entries.filter((entry) => recordId(entry) !== id); save(); render(); showToast('记录已删除'); }
function bindCalendarRecordActions() { document.querySelectorAll('.calendar-entry').forEach((item) => { let timer; let longPressed = false; const clearTimer = () => { clearTimeout(timer); timer = null; }; item.addEventListener('pointerdown', (event) => { event.stopPropagation(); longPressed = false; timer = setTimeout(() => { longPressed = true; deleteRecord(item.dataset.entryId); }, 600); }); item.addEventListener('pointerup', clearTimer); item.addEventListener('pointerleave', clearTimer); item.addEventListener('pointercancel', clearTimer); item.addEventListener('click', (event) => { event.stopPropagation(); if (longPressed) return; selectedDate = item.dataset.date; renderCalendar(); renderDayRecords(); }); item.addEventListener('contextmenu', (event) => { event.preventDefault(); event.stopPropagation(); deleteRecord(item.dataset.entryId); }); }); }
function renderDayRecords() { const host=$('#dayRecords'); if(!selectedDate){host.innerHTML='<p>点按日期，查看当天记录</p>';return;} const daily=entries.filter((entry)=>entry.date===selectedDate); if(!daily.length){host.innerHTML=`<p>${selectedDate} 没有运动记录</p>`;return;} host.innerHTML=daily.map((entry)=>`<article class="day-entry ${entry.person==='Carol'?'carol-entry':'allen-entry'}"><strong>${entry.person} · ${entry.activity}</strong><span>${entry.minutes} 分钟 · ${entry.calories} kcal</span></article>`).join(''); }
function renderAchievements() { const t=totals(); ['Carol','Allen'].forEach((person) => { const xp = experience(t[person]); const level = currentLevel(xp); const prefix = person.toLowerCase(); const progress = level.next ? (xp - level.start) / (level.next - level.start) * 100 : 100; $(`#${prefix}Level`).textContent = `Lv.${level.level}`; $(`#${prefix}ProgressText`).textContent = level.next ? `${number(xp)} / ${number(level.next)} XP` : `${number(xp)} XP · 满级`; $(`#${prefix}Progress`).style.width = `${Math.min(100, progress)}%`; }); }
function render() { renderToday();renderCalendar();renderDayRecords();renderAchievements(); }
function showToast(text){const toast=$('#toast');toast.textContent=text;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2200);}
document.querySelectorAll('.nav-item').forEach((button)=>button.addEventListener('click',()=>{document.querySelectorAll('.nav-item,.view').forEach((item)=>item.classList.remove('is-active'));button.classList.add('is-active');$(`#${button.dataset.view}`).classList.add('is-active');}));
$('#previousMonth').addEventListener('click',()=>{displayedMonth.setMonth(displayedMonth.getMonth()-1);selectedDate=null;renderCalendar();renderDayRecords();});
$('#nextMonth').addEventListener('click',()=>{displayedMonth.setMonth(displayedMonth.getMonth()+1);selectedDate=null;renderCalendar();renderDayRecords();});
$('#openCheckin').addEventListener('click',()=>{ if (!$('#workoutDate').value) $('#workoutDate').value=dateKey(new Date()); $('#checkinDialog').showModal(); }); $('#closeCheckin').addEventListener('click',()=>$('#checkinDialog').close());
document.querySelectorAll('.person-option').forEach((option)=>option.addEventListener('change',()=>document.querySelectorAll('.person-option').forEach((item)=>item.classList.toggle('is-selected',item.querySelector('input').checked))));
function updatePreview() { const calories = calculateCalories($('#activity').value, Number($('#minutes').value) || 0); $('#caloriePreview').textContent = number(calories); $('#xpPreview').textContent = number(experience(calories)); }
$('#activity').addEventListener('change', updatePreview); $('#minutes').addEventListener('input', updatePreview);
$('#activityForm').addEventListener('submit',(event)=>{event.preventDefault();const person=document.querySelector('input[name="person"]:checked').value;const minutes=Number($('#minutes').value);const activity=$('#activity').value;const calories=calculateCalories(activity, minutes);const workoutDate=$('#workoutDate').value;if(!minutes||!calories||!workoutDate)return;entries.push({id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,person,activity,minutes,calories,date:workoutDate,createdAt:Date.now()});save();event.target.reset();$('#minutes').value=30;$('#workoutDate').value=dateKey(new Date());$('#checkinDialog').close();displayedMonth=new Date(`${workoutDate}T00:00:00`);selectedDate=workoutDate;render();document.querySelector('.nav-item[data-view="records"]').click();updatePreview();showToast(`打卡已保存，获得 ${number(experience(calories))} XP`);});
$('#workoutDate').value=dateKey(new Date());
updatePreview();
render();
