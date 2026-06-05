// ----------------------------------------------------
// CONSTANTS & STATE HOOKS
// ----------------------------------------------------
let currentTab = 'dashboard';

// Core state loaded from LocalStorage
let tasks = JSON.parse(localStorage.getItem('planner_local_tasks')) || [];
let goals = JSON.parse(localStorage.getItem('planner_local_goals')) || [];
let thoughts = JSON.parse(localStorage.getItem('planner_local_thoughts')) || [];
let notifs = JSON.parse(localStorage.getItem('planner_notification_logs')) || [];

// Core profile state loaded from LocalStorage
let profileName = localStorage.getItem('planner_profile_name') || 'Forgemaker';
let profileBio = localStorage.getItem('planner_profile_bio') || 'Crafting daily productivity';

// Filters & Navigation Selectors
let activeTaskDate = new Date().toISOString().split('T')[0];
let activeGoalFilter = 'all';
let thoughtSearchQuery = '';
let editingThoughtId = null;

// Set default theme state
const savedTheme = localStorage.getItem('planner_theme') || 'light';
if (savedTheme === 'dark') {
  document.documentElement.classList.add('dark');
}

// ----------------------------------------------------
// APP INITIALIZATION & RE-RENDER DISPATCH
// ----------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  // Set initial state values
  document.getElementById('task-date-picker').value = activeTaskDate;
  
  // Set Default New Goal date to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById('new-goal-date').value = tomorrow.toISOString().split('T')[0];
  document.getElementById('current-year').textContent = new Date().getFullYear();

  // Update Clock initially and launch loop
  updateClock();
  setInterval(updateClock, 1000);

  // Trigger state re-renders
  renderProfile();
  renderAll();
  lucide.createIcons();
});

function renderAll() {
  renderDashboard();
  renderTasks();
  renderGoals();
  renderThoughts();
  renderNotifsList();
  renderProfile();
  lucide.createIcons();
}

// Save state helper
function saveState() {
  localStorage.setItem('planner_local_tasks', JSON.stringify(tasks));
  localStorage.setItem('planner_local_goals', JSON.stringify(goals));
  localStorage.setItem('planner_local_thoughts', JSON.stringify(thoughts));
  localStorage.setItem('planner_notification_logs', JSON.stringify(notifs));
  renderAll();
}

// Push notification logger helper
function pushNotificationLog(title, message) {
  const newNotif = {
    id: Math.random().toString(36).substr(2, 9),
    title,
    message,
    timestamp: new Date().toISOString()
  };
  notifs.unshift(newNotif);
  saveState();
}

// ----------------------------------------------------
// CLOCK, TAB NAVIGATION & THEME SWITCHING
// ----------------------------------------------------
function updateClock() {
  const now = new Date();
  const clockStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  document.getElementById('clock-display').textContent = clockStr;

  // Greeting
  const hours = now.getHours();
  let greeting = 'Good morning';
  if (hours >= 12 && hours < 17) greeting = 'Good afternoon';
  else if (hours >= 17) greeting = 'Good evening';
  document.getElementById('greeting-title').textContent = `${greeting}, ${profileName}!`;
}

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('planner_theme', isDark ? 'dark' : 'light');
  showToast(
    isDark ? "🌙 Dark Mode Activated" : "☀️ Light Mode Activated",
    isDark ? "Contrast tailored for low-light focus." : "Vibrant daytime interface active.",
    "info"
  );
}

function switchTab(tabId) {
  currentTab = tabId;
  
  // Hide all tabs
  ['dashboard', 'tasks', 'goals', 'thoughts'].forEach(t => {
    document.getElementById(`content-${t}`).classList.add('hidden');
    
    // Remove active button classes
    const btn = document.getElementById(`tab-${t}`);
    btn.className = "px-4 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all duration-205 cursor-pointer text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200";
  });

  // Show selected tab container
  document.getElementById(`content-${tabId}`).classList.remove('hidden');
  
  // Add active button classes
  const activeBtn = document.getElementById(`tab-${tabId}`);
  if (tabId === 'goals') {
    activeBtn.className = "px-4 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all duration-205 cursor-pointer bg-emerald-600 text-white shadow-sm";
  } else {
    activeBtn.className = "px-4 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all duration-205 cursor-pointer bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm";
  }
  
  renderAll();
}

// ----------------------------------------------------
// 1. WORKSPACE (DASHBOARD) MODULE
// ----------------------------------------------------
function renderDashboard() {
  // Diagnostic stats calculations
  const completedTasks = tasks.filter(t => t.completed).length;
  const totalTasks = tasks.length;
  const taskPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const completedGoals = goals.filter(g => g.completed).length;
  const totalGoals = goals.length;
  const goalPct = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;

  // Update metrics UI
  document.getElementById('tasks-percentage').textContent = `${taskPct}%`;
  document.getElementById('tasks-fraction').textContent = `(${completedTasks}/${totalTasks})`;
  document.getElementById('goals-percentage').textContent = `${goalPct}%`;
  document.getElementById('goals-fraction').textContent = `(${completedGoals}/${totalGoals})`;
  document.getElementById('center-task-pct').textContent = `${taskPct}%`;

  // Update Streak
  const streak = calculateStreak();
  document.getElementById('streak-counter').textContent = streak;

  // Update SVG rings attributes dynamically
  const taskRing = document.getElementById('svg-task-ring');
  const goalRing = document.getElementById('svg-goal-ring');
  
  // Ring circumference dimensions: 282.7 (tasks), 201 (goals)
  taskRing.setAttribute('stroke-dashoffset', 282.7 - (282.7 * taskPct) / 100);
  goalRing.setAttribute('stroke-dashoffset', 201 - (201 * goalPct) / 100);
}

function calculateStreak() {
  try {
    const datesSet = new Set();
    tasks.forEach(t => { if (t.completed) datesSet.add(t.targetDate); });
    thoughts.forEach(th => { datesSet.add(th.createdAt.split('T')[0]); });

    const sortedDates = Array.from(datesSet).sort((a, b) => b.localeCompare(a));
    if (sortedDates.length === 0) return 0;

    let streak = 0;
    let checkDate = new Date();
    const todayStr = checkDate.toISOString().split('T')[0];
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (!datesSet.has(todayStr) && !datesSet.has(yesterdayStr)) {
      return 0;
    }

    for (let i = 0; i < sortedDates.length; i++) {
      const expectedStr = checkDate.toISOString().split('T')[0];
      if (datesSet.has(expectedStr)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        if (i === 1 && streak === 0 && datesSet.has(yesterdayStr)) {
          streak = 1;
          checkDate = yesterday;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }
    return streak;
  } catch {
    return 0;
  }
}

// ----------------------------------------------------
// USER PROFILE MODULE
// ----------------------------------------------------
function renderProfile() {
  document.getElementById('profile-display-name').textContent = profileName;
  document.getElementById('profile-display-bio').textContent = profileBio;
  document.getElementById('profile-avatar-initial').textContent = profileName.charAt(0).toUpperCase();
  
  // Update stats
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.completed).length;
  const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  
  document.getElementById('profile-stat-tasks').textContent = completedTasks;
  document.getElementById('profile-stat-efficiency').textContent = `${pct}%`;
  
  // Dynamic Focus Rank:
  let rank = "Focus Apprentice";
  if (pct > 80) rank = "Grand Forgemaster";
  else if (pct > 50) rank = "Focus Sentinel";
  else if (pct > 20) rank = "Skilled Artisan";
  
  const rankBadge = document.getElementById('profile-rank-badge');
  rankBadge.textContent = rank;
  
  // Update badge styling
  if (pct > 80) {
    rankBadge.className = "text-[9px] font-mono font-bold tracking-wide uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-500/25 shadow-sm shadow-emerald-500/5";
  } else if (pct > 50) {
    rankBadge.className = "text-[9px] font-mono font-bold tracking-wide uppercase px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-300 border border-cyan-500/25 shadow-sm shadow-cyan-500/5";
  } else if (pct > 20) {
    rankBadge.className = "text-[9px] font-mono font-bold tracking-wide uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-500/25 shadow-sm shadow-amber-500/5";
  } else {
    rankBadge.className = "text-[9px] font-mono font-bold tracking-wide uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-sm";
  }
}

function startProfileEdit() {
  document.getElementById('profile-name-input').value = profileName;
  document.getElementById('profile-bio-input').value = profileBio;
  document.getElementById('profile-edit-container').classList.remove('hidden');
}

function cancelProfileEdit() {
  document.getElementById('profile-edit-container').classList.add('hidden');
}

function saveProfile() {
  const name = document.getElementById('profile-name-input').value.trim();
  const bio = document.getElementById('profile-bio-input').value.trim();
  
  if (name) {
    profileName = name;
    profileBio = bio || 'Crafting daily productivity';
    localStorage.setItem('planner_profile_name', profileName);
    localStorage.setItem('planner_profile_bio', profileBio);
    document.getElementById('profile-edit-container').classList.add('hidden');
    renderProfile();
    showToast("👤 Profile Updated", "Your profile details have been saved.", "success");
  } else {
    showToast("⚠️ Validation Error", "Profile name cannot be blank.", "warning");
  }
}

// ----------------------------------------------------
// TOAST NOTIFICATIONS ENGINE
// ----------------------------------------------------
function showToast(title, message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toastId = Math.random().toString(36).substr(2, 9);
  
  // Style properties mapped by type
  let typeClasses = "";
  let iconName = "info";
  
  if (type === 'success') {
    typeClasses = "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-emerald-600 dark:text-emerald-400";
    iconName = "check-circle";
  } else if (type === 'warning') {
    typeClasses = "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-amber-600 dark:text-amber-400";
    iconName = "alert-circle";
  } else if (type === 'error') {
    typeClasses = "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-rose-600 dark:text-rose-400";
    iconName = "x-circle";
  } else {
    typeClasses = "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300";
    iconName = "info";
  }
  
  const toastHTML = `
    <div id="toast-${toastId}" class="toast-item flex gap-3 p-4 rounded-xl border shadow-sm ${typeClasses} premium-transition">
      <div class="mt-0.5 shrink-0">
        <i data-lucide="${iconName}" class="w-4 h-4"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-xs font-bold leading-tight font-display">${title}</p>
        <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed font-semibold">${message}</p>
      </div>
      <button onclick="removeToast('${toastId}')" class="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer">
        <i data-lucide="x" class="w-3.5 h-3.5"></i>
      </button>
    </div>
  `;
  
  const wrapper = document.createElement('div');
  wrapper.innerHTML = toastHTML;
  const toastElement = wrapper.firstElementChild;
  container.appendChild(toastElement);
  
  // Render Lucide SVG icons in the toast
  lucide.createIcons({
    attrs: {
      class: 'w-4 h-4'
    },
    nameAttr: 'data-lucide'
  });
  
  // Auto remove
  const autoTimeout = setTimeout(() => {
    removeToast(toastId);
  }, 4000);
  
  toastElement.dataset.timeoutId = autoTimeout;
}

function removeToast(toastId) {
  const el = document.getElementById(`toast-${toastId}`);
  if (!el) return;
  
  if (el.dataset.timeoutId) {
    clearTimeout(Number(el.dataset.timeoutId));
  }
  
  el.classList.add('toast-exit');
  el.addEventListener('animationend', () => {
    el.remove();
  });
}

// ----------------------------------------------------
// PROMISE-BASED CONFIRMATION MODAL SYSTEM
// ----------------------------------------------------
let currentConfirmPromiseResolver = null;

function confirmCustom(title, message) {
  return new Promise((resolve) => {
    document.getElementById('confirm-modal-title').textContent = title;
    document.getElementById('confirm-modal-message').textContent = message;
    
    const modal = document.getElementById('confirm-modal');
    modal.classList.remove('hidden');
    
    // Create icons in modal
    lucide.createIcons();
    
    currentConfirmPromiseResolver = resolve;
  });
}

function closeConfirmModal(approved) {
  const modal = document.getElementById('confirm-modal');
  modal.classList.add('hidden');
  if (currentConfirmPromiseResolver) {
    currentConfirmPromiseResolver(approved);
    currentConfirmPromiseResolver = null;
  }
}

// ----------------------------------------------------
// BACKUPS & BACKUP RESTORES (JSON/CSV)
// ----------------------------------------------------
function downloadBackupJSON() {
  const backupData = {
    app: 'PersonalizedWebPlanner',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    tasks,
    goals,
    thoughts
  };
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `planner_backup_${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  pushNotificationLog("💾 Backup Generated", "Full system JSON backup downloaded.");
  showToast("💾 Backup Generated", "Full system JSON backup downloaded.", "success");
}

// Export data CSV
function exportCSVData() {
  let csvContent = "Entity,ID,Title/Content,TargetDate/DateLogged,CompletedStatus,TimestampCreated,ExtraData\n";
  tasks.forEach(t => {
    csvContent += `Task,${t.id},"${t.title.replace(/"/g, '""')}",${t.targetDate},${t.completed},${t.createdAt},${t.priority || 'medium'}\n`;
  });
  goals.forEach(g => {
    csvContent += `Goal,${g.id},"${g.title.replace(/"/g, '""')}",${g.targetDate},${g.completed},${g.createdAt},N/A\n`;
  });
  thoughts.forEach(th => {
    csvContent += `Thought,${th.id},"${th.content.replace(/"/g, '""').replace(/\n/g, ' ')}",${th.createdAt.split('T')[0]},N/A,${th.createdAt},${th.category || 'idea'}\n`;
  });
  
  const encodedUri = encodeURI("data:text/csv;charset=utf-8,\uFEFF" + csvContent);
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", encodedUri);
  downloadAnchor.setAttribute("download", `productivity_analytics_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  pushNotificationLog("📊 CSV Sheet Exported", "Productivity data exported as spreadsheet ledger.");
  showToast("📊 CSV Sheet Exported", "Productivity data exported as CSV spreadsheet.", "success");
}

function restoreBackupJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  const alertBadge = document.getElementById('import-alert-msg');
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (parsed.app !== 'PersonalizedWebPlanner') {
        alertBadge.textContent = "❌ Invalid backup format.";
        alertBadge.className = "text-[10px] text-rose-500 font-bold mt-1 flex items-center gap-1";
        showToast("❌ Restore Failed", "Invalid backup file format.", "error");
        return;
      }
      tasks = parsed.tasks || [];
      goals = parsed.goals || [];
      thoughts = parsed.thoughts || [];
      
      alertBadge.textContent = "✅ Backup Restored!";
      alertBadge.className = "text-[10px] text-emerald-600 font-bold mt-1 flex items-center gap-1";
      pushNotificationLog("🔄 Backup Restored", "Data updated from file backup.");
      showToast("🔄 Backup Restored", "Data successfully restored from backup file.", "success");
      saveState();
    } catch {
      alertBadge.textContent = "❌ Failed to parse backup file.";
      alertBadge.className = "text-[10px] text-rose-500 font-bold mt-1 flex items-center gap-1";
      showToast("❌ Restore Failed", "Failed to parse backup JSON file.", "error");
    }
  };
  reader.readAsText(file);
}

// ----------------------------------------------------
// NOTIFICATIONS MODULE
// ----------------------------------------------------
function renderNotifsList() {
  const container = document.getElementById('notif-logs-list');
  const badge = document.getElementById('notif-count-badge');
  
  if (notifs.length === 0) {
    badge.classList.add('hidden');
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-8 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/30">
        <i data-lucide="bell" class="w-8 h-8 opacity-25 mb-2 text-slate-500"></i>
        <p class="text-xs font-semibold text-slate-700 dark:text-slate-300">No recent alerts</p>
        <p class="text-[10px] text-slate-400 mt-0.5 px-4 max-w-xs leading-normal">Accomplishments summaries will populate here.</p>
      </div>
    `;
    return;
  }

  badge.classList.remove('hidden');
  badge.textContent = `${notifs.length} logs`;
  
  container.innerHTML = notifs.map(log => `
    <div class="p-3 rounded-xl border bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs flex gap-3">
      <div class="mt-0.5 shrink-0">
        <i data-lucide="${log.title.includes('Backup') || log.title.includes('CSV') ? 'database' : 'trophy'}" class="w-4 h-4 text-amber-500"></i>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex justify-between items-center gap-2">
          <span class="text-slate-800 dark:text-slate-200 font-bold truncate">${log.title}</span>
          <span class="text-[9px] text-slate-400 font-mono whitespace-nowrap">${new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <p class="text-slate-500 dark:text-slate-400 mt-1 leading-relaxed text-[11px] font-medium">${log.message}</p>
      </div>
    </div>
  `).join('');
}

function clearNotifs() {
  notifs = [];
  showToast("🗑️ Notifications Cleared", "Alert registry has been cleared.", "info");
  saveState();
}

function simulateProductivityAlert() {
  const pct = tasks.length > 0 ? Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100) : 100;
  pushNotificationLog("📈 Daily Productivity Summary", `Completed ${tasks.filter(t => t.completed).length}/${tasks.length} tasks (${pct}%) and ${goals.filter(g => g.completed).length}/${goals.length} targets.`);
  showToast("📈 Summary Triggered", "Mock daily statistics alert pushed to registry.", "info");
}

// ----------------------------------------------------
// 2. DAILY TASKS MODULE
// ----------------------------------------------------
function formatHeaderDate(isoString) {
  try {
    const parts = isoString.split('-');
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return isoString;
  }
}

function renderTasks() {
  // Date Picker & Header Sync
  document.getElementById('task-date-header').textContent = formatHeaderDate(activeTaskDate);
  document.getElementById('task-date-picker').value = activeTaskDate;

  // 1. Filter tasks for current date
  const activeTasks = tasks.filter(t => t.targetDate === activeTaskDate);

  // 2. Locate uncompleted tasks from past dates
  const pastUncompleted = tasks.filter(t => t.targetDate < activeTaskDate && !t.completed);
  const alertContainer = document.getElementById('past-uncompleted-alert');
  
  if (pastUncompleted.length > 0) {
    alertContainer.classList.remove('hidden');
    document.getElementById('past-alert-title').textContent = `You have ${pastUncompleted.length} uncompleted task${pastUncompleted.length > 1 ? 's' : ''} from past days`;
    
    const listHTML = pastUncompleted.map(pt => `
      <div class="flex justify-between items-center bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2.5 rounded-xl text-xs text-slate-800 dark:text-slate-200">
        <div class="truncate pr-4 min-w-0">
          <span class="font-bold text-[10px] bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 px-2 py-0.5 rounded mr-2 font-mono">${pt.targetDate}</span>
          <span class="font-semibold">${pt.title}</span>
        </div>
        <button onclick="rescheduleTask('${pt.id}')" class="text-[10px] shrink-0 font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 transition flex items-center gap-1 cursor-pointer whitespace-nowrap">
          Reschedule
          <i data-lucide="arrow-right" class="w-3 h-3"></i>
        </button>
      </div>
    `).join('');
    document.getElementById('past-alert-list').innerHTML = listHTML;
  } else {
    alertContainer.classList.add('hidden');
  }

  // 3. Render active day tasks list
  const container = document.getElementById('tasks-list-container');
  if (activeTasks.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/30">
        <i data-lucide="list-todo" class="w-8 h-8 opacity-25 mb-2 text-slate-500"></i>
        <p class="text-xs font-semibold text-slate-700 dark:text-slate-300">Agenda Empty for this day</p>
        <p class="text-[10px] text-slate-400 mt-0.5 px-4 max-w-sm leading-relaxed">Everything complete, or nothing planned. Reschedule past items or log above.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = activeTasks.map(task => {
    // Priority badge HTML
    let priorityBadge = "";
    if (task.priority === 'high') {
      priorityBadge = `<span class="text-[9px] font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300 mr-1.5 shrink-0 border border-rose-500/20">High</span>`;
    } else if (task.priority === 'low') {
      priorityBadge = `<span class="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300 mr-1.5 shrink-0 border border-emerald-500/20">Low</span>`;
    } else {
      priorityBadge = `<span class="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300 mr-1.5 shrink-0 border border-amber-500/20">Medium</span>`;
    }

    // Subtask progress indicator calculations
    const subtasksCount = task.subtasks ? task.subtasks.length : 0;
    const completedSubtasks = task.subtasks ? task.subtasks.filter(s => s.completed).length : 0;
    const subtaskPct = subtasksCount > 0 ? Math.round((completedSubtasks / subtasksCount) * 100) : 0;
    
    let subtaskProgressBar = "";
    if (subtasksCount > 0) {
      let barColor = "bg-rose-500";
      if (task.priority === "medium") barColor = "bg-amber-500";
      else if (task.priority === "low") barColor = "bg-emerald-500";
      
      subtaskProgressBar = `
        <div class="mt-2.5 flex items-center gap-2">
          <div class="flex-1 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div class="${barColor} h-full rounded-full transition-all duration-300" style="width: ${subtaskPct}%;"></div>
          </div>
          <span class="text-[9px] font-mono text-slate-400 dark:text-slate-500 font-bold shrink-0">${completedSubtasks}/${subtasksCount} steps</span>
        </div>
      `;
    }

    return `
      <div class="p-4 border transition duration-200 rounded-xl ${task.completed ? 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/80 opacity-60 shadow-none' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm'}">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-start gap-3 min-w-0 flex-1">
            <button onclick="toggleTaskCompletion('${task.id}')" class="p-0.5 mt-0.5 shrink-0 rounded-lg transition-colors cursor-pointer ${task.completed ? 'text-slate-500 dark:text-slate-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}">
              <i data-lucide="${task.completed ? 'check-square' : 'square'}" class="w-5 h-5"></i>
            </button>
            <div class="min-w-0 pr-4 flex flex-wrap items-center gap-y-1">
              ${priorityBadge}
              <h3 class="text-xs font-bold leading-tight ${task.completed ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}">${task.title}</h3>
            </div>
          </div>
          <button onclick="deleteTask('${task.id}')" class="text-slate-400 hover:text-rose-600 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>

        <!-- Progress metrics bar -->
        ${subtaskProgressBar}

        <!-- Micro-step subtasks -->
        <div class="mt-3.5 pl-6 border-l border-slate-200 dark:border-slate-800 block space-y-1.5">
          ${(task.subtasks || []).map(sub => `
            <div class="flex justify-between items-center gap-4 text-xs group">
              <button onclick="toggleSubtask('${task.id}', '${sub.id}')" class="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-left min-w-0 flex-1 cursor-pointer select-none">
                <span class="${sub.completed ? 'text-slate-500' : 'text-slate-400'}">
                  <i data-lucide="${sub.completed ? 'check-square' : 'square'}" class="w-4 h-4"></i>
                </span>
                <span class="truncate text-xs ${sub.completed ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-200'} font-semibold">${sub.title}</span>
              </button>
              <button onclick="deleteSubtask('${task.id}', '${sub.id}')" class="text-slate-400 hover:text-rose-500 p-0.5 rounded cursor-pointer">
                <i data-lucide="trash-2" class="w-3 h-3"></i>
              </button>
            </div>
          `).join('')}

          <!-- Subtask Add form -->
          <form onsubmit="addSubtask('${task.id}', event)" class="flex gap-2 pt-1.5">
            <input type="text" id="subtask-input-${task.id}" required placeholder="Add step/subtask..." class="w-full text-xs p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:border-slate-400 dark:focus:border-slate-700 dark:text-slate-200 font-semibold">
            <button type="submit" class="p-1 px-3 text-[11px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg font-bold transition active:scale-[0.98] cursor-pointer">Add Step</button>
          </form>
        </div>
      </div>
    `;
  }).join('');
}

function setTaskDate(val) {
  activeTaskDate = val;
  renderAll();
}

function setTaskDateToday() {
  activeTaskDate = new Date().toISOString().split('T')[0];
  renderAll();
}

function navigateDay(amt) {
  const parts = activeTaskDate.split('-');
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  d.setDate(d.getDate() + amt);
  activeTaskDate = d.toISOString().split('T')[0];
  renderAll();
}

function addTask(e) {
  e.preventDefault();
  const input = document.getElementById('new-task-input');
  const prioritySelect = document.getElementById('new-task-priority');
  
  const title = input.value.trim();
  const priority = prioritySelect ? prioritySelect.value : 'medium';
  
  if (!title) return;

  const newTask = {
    id: Math.random().toString(36).substr(2, 9),
    title,
    targetDate: activeTaskDate,
    completed: false,
    priority,
    subtasks: [],
    createdAt: new Date().toISOString()
  };
  tasks.push(newTask);
  input.value = '';
  
  showToast("📝 Task Registered", `Registered task: "${title}".`, "success");
  pushNotificationLog("📝 Task Registered", `Registered task: "${title}".`);
  saveState();
}

function toggleTaskCompletion(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  task.completed = !task.completed;
  // Auto-toggle all subtasks to match parent
  task.subtasks.forEach(s => s.completed = task.completed);
  
  if (task.completed) {
    showToast("🎉 Task Completed!", `You completed: "${task.title}"!`, "success");
    pushNotificationLog("🎉 Task Completed!", `You completed "${task.title}"!`);
  }
  saveState();
}

function deleteTask(taskId) {
  confirmCustom("Delete Task", "Delete this task from your daily log?").then(approved => {
    if (approved) {
      tasks = tasks.filter(t => t.id !== taskId);
      showToast("🗑️ Task Deleted", "Task has been removed from agenda.", "info");
      saveState();
    }
  });
}

function addSubtask(taskId, e) {
  e.preventDefault();
  const input = document.getElementById(`subtask-input-${taskId}`);
  const title = input.value.trim();
  if (!title) return;

  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  const newSub = {
    id: Math.random().toString(36).substr(2, 9),
    title,
    completed: false
  };
  task.subtasks.push(newSub);
  task.completed = false; // Add new steps -> reset main complete
  input.value = '';
  showToast("➕ Step Added", "Micro-step added to task checklist.", "success");
  saveState();
}

// Subtasks Toggles
function toggleSubtask(taskId, subId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  const sub = task.subtasks.find(s => s.id === subId);
  if (!sub) return;
  sub.completed = !sub.completed;
  task.completed = task.subtasks.length > 0 && task.subtasks.every(s => s.completed);
  saveState();
}

function deleteSubtask(taskId, subId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  task.subtasks = task.subtasks.filter(s => s.id !== subId);
  task.completed = task.subtasks.length > 0 && task.subtasks.every(s => s.completed);
  showToast("🗑️ Step Removed", "Subtask step deleted.", "info");
  saveState();
}

function rescheduleTask(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  task.targetDate = activeTaskDate;
  task.createdAt = new Date().toISOString();
  pushNotificationLog("🚀 Rescheduled", `Rescheduled task "${task.title}" to ${activeTaskDate}`);
  showToast("🚀 Task Rescheduled", `Moved task to ${activeTaskDate}.`, "info");
  saveState();
}

// ----------------------------------------------------
// 3. TARGETS (GOALS) MODULE
// ----------------------------------------------------
function renderGoals() {
  const totalCount = goals.length;
  const completedCount = goals.filter(g => g.completed).length;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const summaryBox = document.getElementById('goals-summary-box');
  if (totalCount > 0) {
    summaryBox.classList.remove('hidden');
    document.getElementById('goals-stat-text').textContent = `${completedCount} / ${totalCount} completed`;
    document.getElementById('goals-progress-bar').style.width = `${pct}%`;
    
    const trophy = document.getElementById('goals-trophy-icon');
    trophy.setAttribute('data-lucide', pct === 100 ? 'trophy' : 'star');
  } else {
    summaryBox.classList.add('hidden');
  }

  // Render items list
  const container = document.getElementById('goals-list-container');
  const filtered = goals.filter(g => {
    if (activeGoalFilter === 'active') return !g.completed;
    if (activeGoalFilter === 'completed') return g.completed;
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/30">
        <i data-lucide="target" class="w-8 h-8 opacity-25 mb-2 text-slate-500"></i>
        <p class="text-xs font-semibold text-slate-700 dark:text-slate-300">No results cataloged</p>
        <p class="text-[10px] text-slate-400 mt-0.5">Create progress targets to support long term growth.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(goal => `
    <div class="p-3.5 border transition duration-200 rounded-xl flex items-center justify-between gap-4 select-none ${goal.completed ? 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/80 opacity-60 shadow-none' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm'}">
      <div class="flex items-center gap-3.5 min-w-0 flex-1">
        <button onclick="toggleGoal('${goal.id}')" class="shrink-0 cursor-pointer rounded-lg p-0.5 transition-colors ${goal.completed ? 'text-emerald-600 dark:text-emerald-500' : 'text-slate-400 hover:text-emerald-500'}">
          <i data-lucide="${goal.completed ? 'check-square' : 'square'}" class="w-5 h-5"></i>
        </button>
        <div class="min-w-0 font-sans">
          <p class="text-xs font-bold tracking-tight leading-tight ${goal.completed ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}">${goal.title}</p>
          <div class="flex items-center gap-1 text-[9px] text-slate-400 mt-1 font-mono font-semibold">
            <i data-lucide="calendar" class="w-3 h-3 text-emerald-500"></i>
            Target Date: ${new Date(goal.targetDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
      </div>
      <button onclick="deleteGoal('${goal.id}')" class="text-slate-400 hover:text-rose-600 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer" title="Delete target">
        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
      </button>
    </div>
  `).join('');
}

function setGoalFilter(filterId) {
  activeGoalFilter = filterId;
  
  // Update filters UI classes
  ['all', 'active', 'completed'].forEach(f => {
    const btn = document.getElementById(`goal-filter-${f}`);
    btn.className = "px-3.5 py-1.5 rounded-lg text-xs font-bold select-none text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer";
  });
  document.getElementById(`goal-filter-${filterId}`).className = "px-3.5 py-1.5 rounded-lg text-xs font-bold select-none bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm cursor-pointer";
  
  renderAll();
}

function addGoal(e) {
  e.preventDefault();
  const input = document.getElementById('new-goal-input');
  const dateInput = document.getElementById('new-goal-date');
  const title = input.value.trim();
  const targetDateVal = dateInput.value;
  if (!title || !targetDateVal) return;

  const newGoal = {
    id: Math.random().toString(36).substr(2, 9),
    title,
    targetDate: targetDateVal,
    completed: false,
    createdAt: new Date().toISOString()
  };
  goals.push(newGoal);
  input.value = '';
  
  showToast("🎯 Target Added", `Established target: "${title}".`, "success");
  pushNotificationLog("🎯 Goal Established", `Set target: "${title}".`);
  saveState();
}

function toggleGoal(goalId) {
  const goal = goals.find(g => g.id === goalId);
  if (!goal) return;
  goal.completed = !goal.completed;
  if (goal.completed) {
    showToast("🏆 Focus Goal Completed!", `You achieved: "${goal.title}"!`, "success");
    pushNotificationLog("🏆 Goal Completed!", `You completed target intent: "${goal.title}"!`);
  }
  saveState();
}

function deleteGoal(goalId) {
  confirmCustom("Delete Target", "Are you sure you want to remove this focus commitment?").then(approved => {
    if (approved) {
      goals = goals.filter(g => g.id !== goalId);
      showToast("🗑️ Target Removed", "Focus target has been deleted.", "info");
      saveState();
    }
  });
}

// ----------------------------------------------------
// 4. THOUGHTS LOGGER MODULE
// ----------------------------------------------------
function renderThoughts() {
  const container = document.getElementById('thoughts-list-container');
  const filtered = thoughts.filter(th => 
    th.content.toLowerCase().includes(thoughtSearchQuery.toLowerCase())
  );

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/30 font-semibold">
        <i data-lucide="book-open" class="w-8 h-8 opacity-20 mb-2 text-slate-500"></i>
        <p class="text-xs font-bold text-slate-700 dark:text-slate-300">${thoughtSearchQuery ? 'No matching logs' : 'Your stream of thoughts is empty'}</p>
        <p class="text-[10px] text-slate-400 mt-1 max-w-xs px-4 font-normal">Jot down reflections, ideas, learning logs, or quick notes.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(th => {
    // Categorize selection
    const category = th.category || 'idea';
    let categoryClass = "thought-card-idea";
    let categoryLabel = "💡 Idea";
    
    if (category === 'note') {
      categoryClass = "thought-card-note";
      categoryLabel = "📌 Note";
    } else if (category === 'reflection') {
      categoryClass = "thought-card-reflection";
      categoryLabel = "🧠 Reflection";
    } else if (category === 'learning') {
      categoryClass = "thought-card-learning";
      categoryLabel = "📚 Learning";
    }

    return `
      <div class="thought-card ${categoryClass} p-4 rounded-xl flex flex-col gap-2">
        ${editingThoughtId === th.id ? `
          <div class="flex flex-col gap-2">
            <textarea id="edit-thought-textarea-${th.id}" rows="2" class="w-full text-xs p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:border-slate-400 dark:focus:border-slate-700 dark:text-slate-100 resize-none font-sans font-semibold">${th.content}</textarea>
            
            <div class="flex justify-between items-center gap-2">
              <div class="flex items-center gap-1.5">
                <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Category:</span>
                <select id="edit-thought-category-${th.id}" class="text-[10px] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md p-1 focus:outline-none dark:text-slate-200 font-bold cursor-pointer">
                  <option value="note" ${category === 'note' ? 'selected' : ''}>📌 Note</option>
                  <option value="idea" ${category === 'idea' ? 'selected' : ''}>💡 Idea</option>
                  <option value="reflection" ${category === 'reflection' ? 'selected' : ''}>🧠 Reflection</option>
                  <option value="learning" ${category === 'learning' ? 'selected' : ''}>📚 Learning</option>
                </select>
              </div>
              
              <div class="flex gap-2">
                <button onclick="cancelThoughtEdit()" class="p-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 font-bold cursor-pointer">
                  <i data-lucide="x" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="saveThoughtEdit('${th.id}')" class="p-1 px-3 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer">
                  <i data-lucide="check" class="w-3.5 h-3.5"></i> Save
                </button>
              </div>
            </div>
          </div>
        ` : `
          <p class="text-slate-800 dark:text-slate-100 text-xs whitespace-pre-wrap leading-relaxed font-sans font-medium">${th.content}</p>
          
          <div class="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div class="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 font-mono font-semibold">
              <span class="font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">${categoryLabel}</span>
              <span class="flex items-center gap-1">
                <i data-lucide="calendar" class="w-3 h-3 text-slate-400"></i>
                ${new Date(th.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
              ${th.createdAt !== th.updatedAt ? '<span class="italic opacity-70">(edited)</span>' : ''}
            </div>

            <div class="flex items-center gap-1">
              <button onclick="startThoughtEdit('${th.id}')" class="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer" title="Edit thought">
                <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
              </button>
              <button onclick="deleteThought('${th.id}')" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer" title="Delete thought">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>
        `}
      </div>
    `;
  }).join('');
}

function searchThoughts(val) {
  thoughtSearchQuery = val;
  renderAll();
}

function addThought(e) {
  e.preventDefault();
  const input = document.getElementById('new-thought-input');
  const categorySelect = document.getElementById('new-thought-category');
  
  const content = input.value.trim();
  const category = categorySelect ? categorySelect.value : 'idea';
  
  if (!content) return;

  const newTh = {
    id: Math.random().toString(36).substr(2, 9),
    content,
    category,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  thoughts.push(newTh);
  input.value = '';
  
  showToast("💭 Thought Logged", "Logged a reflection note to your timeline.", "success");
  pushNotificationLog("💭 Thought Logged", "Logged a reflection note to your timeline.");
  saveState();
}

function startThoughtEdit(thId) {
  editingThoughtId = thId;
  renderAll();
}

function cancelThoughtEdit() {
  editingThoughtId = null;
  renderAll();
}

function saveThoughtEdit(thId) {
  const textarea = document.getElementById(`edit-thought-textarea-${thId}`);
  const categorySelect = document.getElementById(`edit-thought-category-${thId}`);
  
  const text = textarea.value.trim();
  const category = categorySelect ? categorySelect.value : 'idea';
  
  if (!text) return;

  const th = thoughts.find(t => t.id === thId);
  if (!th) return;
  th.content = text;
  th.category = category;
  th.updatedAt = new Date().toISOString();
  editingThoughtId = null;
  showToast("✏️ Note Updated", "Your thought log has been updated.", "success");
  saveState();
}

function deleteThought(thId) {
  confirmCustom("Delete Thought", "Are you sure you want to delete this note log?").then(approved => {
    if (approved) {
      thoughts = thoughts.filter(t => t.id !== thId);
      showToast("🗑️ Thought Deleted", "Thought log has been removed.", "info");
      saveState();
    }
  });
}
