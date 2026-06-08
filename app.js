// ----------------------------------------------------
// SAFE STORAGE & SCRIPT RESILIENCE UTILITIES
// ----------------------------------------------------
// Global Mobile Error Diagnostics & Visual Logger
window.addEventListener('error', function(event) {
  console.error("Global Error Caught:", event.error);
  if (typeof showToast === 'function') {
    showToast("⚠️ Runtime Error", event.message || "An unexpected error occurred on this device.", "error");
  }
});

window.addEventListener('unhandledrejection', function(event) {
  console.error("Global Unhandled Promise Rejection:", event.reason);
  if (typeof showToast === 'function') {
    showToast("⚠️ Connection/Auth Error", (event.reason && event.reason.message) || "Cloud authentication or network request failed.", "error");
  }
});

// Safe storage helper with in-memory fallback for private modes / security blocks
const _storageFallback = {};
const safeStorage = {
  getItem(type, key) {
    try {
      return window[type].getItem(key);
    } catch (e) {
      console.warn(`[SafeStorage] Failed to read ${key} from ${type}:`, e);
      return _storageFallback[`${type}_${key}`] || null;
    }
  },
  setItem(type, key, value) {
    try {
      window[type].setItem(key, value);
    } catch (e) {
      console.warn(`[SafeStorage] Failed to write ${key} to ${type}:`, e);
      _storageFallback[`${type}_${key}`] = String(value);
    }
  },
  removeItem(type, key) {
    try {
      window[type].removeItem(key);
    } catch (e) {
      console.warn(`[SafeStorage] Failed to remove ${key} from ${type}:`, e);
      delete _storageFallback[`${type}_${key}`];
    }
  }
};

// Safe Lucide icon creation wrapper
function safeCreateIcons(options) {
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    try {
      lucide.createIcons(options);
    } catch (e) {
      console.warn("Failed to create icons:", e);
    }
  } else {
    console.warn("Lucide is not loaded yet.");
  }
}

// ----------------------------------------------------
// CONSTANTS & STATE HOOKS
// ----------------------------------------------------
let currentTab = 'dashboard';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBAlW7HUANkHvHq1ydpUX1lSe8rC3soOIU",
  authDomain: "daily-forge-planner.firebaseapp.com",
  projectId: "daily-forge-planner",
  storageBucket: "daily-forge-planner.firebasestorage.app",
  messagingSenderId: "823042016385",
  appId: "1:823042016385:web:5539a66464975b3fdd7980",
  measurementId: "G-MLV3FB5EXQ"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Session status hooks
let currentUser = safeStorage.getItem('localStorage', 'planner_logged_in_user') || safeStorage.getItem('sessionStorage', 'planner_logged_in_user') || null;

// Core state (lazy loaded)
let tasks = [];
let goals = [];
let thoughts = [];
let notifs = [];
let profileName = 'Mindlogger';
let profileBio = 'Crafting daily productivity';

// Helper to get local YYYY-MM-DD
function toLocalISODate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Filters & Navigation Selectors
let activeTaskDate = toLocalISODate(new Date());
let activeGoalFilter = 'all';
let activeThoughtCategory = 'all';
let thoughtSearchQuery = '';
let editingThoughtId = null;
let editorIsPinned = false;
let openSidebarDates = new Set();
let showPendingMobile = false;

// Set default theme state
const savedTheme = safeStorage.getItem('localStorage', 'planner_theme') || 'light';
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
  document.getElementById('new-goal-date').value = toLocalISODate(tomorrow);
  const currentYearEl = document.getElementById('current-year');
  if (currentYearEl) {
    currentYearEl.textContent = new Date().getFullYear();
  }

  // Update Clock initially and launch loop
  updateClock();
  setInterval(updateClock, 1000);

  // Set up Thought Editor live count listeners
  const editorTitle = document.getElementById('editor-thought-title');
  const editorContent = document.getElementById('editor-thought-content');
  if (editorTitle) {
    editorTitle.addEventListener('input', updateEditorCounts);
  }
  if (editorContent) {
    editorContent.addEventListener('input', updateEditorCounts);
  }

  // Close task dropdown menus when clicking outside
  document.addEventListener('click', () => {
    document.querySelectorAll('[id^="task-menu-"]').forEach(menu => {
      menu.classList.add('hidden');
    });
    document.querySelectorAll('.task-card-wrapper').forEach(card => {
      card.classList.remove('z-40', 'relative');
    });
  });

  // Initialize Session / Auth Check
  if (currentUser) {
    initUserSession(currentUser);
  } else {
    document.getElementById('auth-overlay').classList.remove('hidden');
    updateSyncStatus('offline');
  }

  safeCreateIcons();
});

function renderAll() {
  renderDashboard();
  renderTasks();
  renderGoals();
  renderThoughts();
  renderNotifsList();
  renderProfile();
  safeCreateIcons();
}

// Save state helper
function saveState() {
  if (currentUser) {
    safeStorage.setItem('localStorage', `planner_${currentUser}_tasks`, JSON.stringify(tasks));
    safeStorage.setItem('localStorage', `planner_${currentUser}_goals`, JSON.stringify(goals));
    safeStorage.setItem('localStorage', `planner_${currentUser}_thoughts`, JSON.stringify(thoughts));
    safeStorage.setItem('localStorage', `planner_${currentUser}_notifs`, JSON.stringify(notifs));
    safeStorage.setItem('localStorage', `planner_${currentUser}_profile_name`, profileName);
    safeStorage.setItem('localStorage', `planner_${currentUser}_profile_bio`, profileBio);
    syncWithFirebase();
  }
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
  const clockEl = document.getElementById('clock-display');
  if (clockEl) {
    const clockStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    clockEl.textContent = clockStr;
  }

  // Greeting
  const hours = now.getHours();
  let greeting = 'Good morning';
  if (hours >= 12 && hours < 17) greeting = 'Good afternoon';
  else if (hours >= 17) greeting = 'Good evening';
  document.getElementById('greeting-title').textContent = `${greeting}, ${profileName}!`;
}

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  safeStorage.setItem('localStorage', 'planner_theme', isDark ? 'dark' : 'light');
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
    
    // Remove active desktop button classes
    const btn = document.getElementById(`tab-${t}`);
    if (btn) {
      btn.className = "px-4 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all duration-205 cursor-pointer text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200";
    }

    // Remove active mobile button classes
    const mBtn = document.getElementById(`mobile-tab-${t}`);
    if (mBtn) {
      mBtn.className = "flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all duration-205 cursor-pointer text-slate-500 dark:text-slate-400";
    }
  });

  // Show selected tab container
  document.getElementById(`content-${tabId}`).classList.remove('hidden');
  
  // Add active desktop button classes
  const activeBtn = document.getElementById(`tab-${tabId}`);
  if (activeBtn) {
    if (tabId === 'goals') {
      activeBtn.className = "px-4 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all duration-205 cursor-pointer bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm";
    } else if (tabId === 'tasks') {
      activeBtn.className = "px-4 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all duration-205 cursor-pointer bg-gradient-to-r from-rose-500 to-orange-500 text-white shadow-sm";
    } else if (tabId === 'thoughts') {
      activeBtn.className = "px-4 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all duration-205 cursor-pointer bg-gradient-to-r from-violet-600 to-cyan-500 text-white shadow-sm";
    } else {
      activeBtn.className = "px-4 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all duration-205 cursor-pointer bg-gradient-to-r from-violet-600 to-pink-500 text-white shadow-sm";
    }
  }

  // Add active mobile button classes
  const activeMBtn = document.getElementById(`mobile-tab-${tabId}`);
  if (activeMBtn) {
    if (tabId === 'goals') {
      activeMBtn.className = "flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all duration-205 cursor-pointer text-emerald-600 dark:text-emerald-400 font-bold";
    } else if (tabId === 'tasks') {
      activeMBtn.className = "flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all duration-205 cursor-pointer text-rose-600 dark:text-rose-500 font-bold";
    } else if (tabId === 'thoughts') {
      activeMBtn.className = "flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all duration-205 cursor-pointer text-cyan-600 dark:text-cyan-400 font-bold";
    } else {
      activeMBtn.className = "flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all duration-205 cursor-pointer text-violet-600 dark:text-violet-400 font-bold";
    }
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
    thoughts.forEach(th => { datesSet.add(toLocalISODate(new Date(th.createdAt))); });

    const sortedDates = Array.from(datesSet).sort((a, b) => b.localeCompare(a));
    if (sortedDates.length === 0) return 0;

    let streak = 0;
    let checkDate = new Date();
    const todayStr = toLocalISODate(checkDate);
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = toLocalISODate(yesterday);

    if (!datesSet.has(todayStr) && !datesSet.has(yesterdayStr)) {
      return 0;
    }

    for (let i = 0; i < sortedDates.length; i++) {
      const expectedStr = toLocalISODate(checkDate);
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
  if (pct > 80) rank = "Grand Mindlogger";
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
    document.getElementById('profile-edit-container').classList.add('hidden');
    saveState();
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
  safeCreateIcons({
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
    safeCreateIcons();
    
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
function getWeekdayName(isoString) {
  try {
    const parts = isoString.split('-');
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  } catch {
    return '';
  }
}

function getFormattedDateText(isoString) {
  try {
    const parts = isoString.split('-');
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  } catch {
    return '';
  }
}

function getPickerLabelDate(isoString) {
  try {
    const parts = isoString.split('-'); // YYYY-MM-DD
    return `${parts[1]} / ${parts[2]} / ${parts[0]}`;
  } catch {
    return isoString;
  }
}

function renderTasks() {
  // Date Picker & Header Sync
  const weekdayEl = document.getElementById('task-date-weekday');
  if (weekdayEl) {
    weekdayEl.textContent = getWeekdayName(activeTaskDate);
  }
  const formattedEl = document.getElementById('task-date-formatted');
  if (formattedEl) {
    formattedEl.textContent = getFormattedDateText(activeTaskDate);
  }
  const labelEl = document.getElementById('task-date-picker-label');
  if (labelEl) {
    labelEl.textContent = getPickerLabelDate(activeTaskDate);
  }
  const pickerEl = document.getElementById('task-date-picker');
  if (pickerEl) {
    pickerEl.value = activeTaskDate;
  }

  // Today button dynamic styling
  const todayBtn = document.getElementById('today-btn');
  if (todayBtn) {
    const todayStr = toLocalISODate(new Date());
    if (activeTaskDate === todayStr) {
      todayBtn.className = "h-9 px-4 flex items-center justify-center bg-[#ff5252] hover:bg-[#ff3b3b] dark:bg-red-600 dark:hover:bg-red-500 text-white text-[11px] font-black uppercase tracking-wider rounded-md transition-all cursor-pointer shadow-sm border border-transparent";
    } else {
      todayBtn.className = "h-9 px-4 flex items-center justify-center bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-bold uppercase tracking-wider rounded-md transition-all cursor-pointer shadow-xs";
    }
  }

  // 1. Filter tasks for current date
  const activeTasks = tasks.filter(t => t.targetDate === activeTaskDate);

  // 2. Locate uncompleted tasks from past dates and populate Pending Past Days Sidebar
  const todayStr = toLocalISODate(new Date());
  const pendingPastTasks = tasks.filter(t => t.targetDate < todayStr && !t.completed);
  const uniquePendingDatesSet = new Set(pendingPastTasks.map(t => t.targetDate));
  const uniquePendingDates = Array.from(uniquePendingDatesSet).sort((a, b) => b.localeCompare(a));
  
  const sidebarContainer = document.getElementById('pending-days-sidebar');
  const listContainer = document.getElementById('pending-days-list');
  const boardCol = document.getElementById('tasks-board-column');
  const mobileToggleBtn = document.getElementById('mobile-pending-toggle');
  const sidebarColumn = document.getElementById('tasks-sidebar-column');
  
  if (sidebarContainer && listContainer) {
    if (uniquePendingDates.length > 0) {
      // Toggle button setup for mobile view
      if (mobileToggleBtn) {
        mobileToggleBtn.classList.remove('hidden');
        const count = uniquePendingDates.length;
        document.getElementById('mobile-pending-toggle-text').textContent = `Show Pending Past Tasks (${count})`;
        
        const toggleIcon = document.getElementById('mobile-pending-toggle-icon');
        if (toggleIcon) {
          toggleIcon.style.transform = 'rotate(0deg)';
        }
      }

      // Sidebar column is visible
      if (sidebarColumn) {
        sidebarColumn.className = "lg:col-span-4 space-y-4 w-full h-auto lg:h-full flex flex-col overflow-visible lg:overflow-hidden shrink-0";
      }

      // Sidebar visibility is flex on desktop, but hidden on mobile
      const baseSidebarClass = "glass-card rounded-2xl p-4 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 border-l-4 border-l-amber-500 h-auto max-h-[320px] lg:max-h-full flex flex-col overflow-hidden mb-16 lg:mb-0 relative z-10";
      sidebarContainer.className = `${baseSidebarClass} hidden lg:flex`;

      if (boardCol) {
        boardCol.className = "pwa-section-card lg:col-span-8 glass-card rounded-2xl p-4 sm:p-6 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 font-sans border-l-4 border-l-rose-500 w-full h-full flex flex-col overflow-hidden min-h-0 relative z-10 shrink-0";
      }

      const listHTML = uniquePendingDates.map(dateStr => {
        const tasksForDate = pendingPastTasks.filter(t => t.targetDate === dateStr);
        const count = tasksForDate.length;
        const parts = dateStr.split('-');
        const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        const readableDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        
        const isOpen = openSidebarDates.has(dateStr);
        const chevronIcon = isOpen ? "chevron-down" : "chevron-right";
        const contentClass = isOpen ? "" : "hidden";
        
        const tasksHTML = tasksForDate.map(task => `
          <div class="flex items-center justify-between gap-3 text-xs p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900/50 transition">
            <div class="flex items-center gap-2 min-w-0">
              <button onclick="toggleTaskCompletion('${task.id}')" type="button"
                class="p-0.5 shrink-0 rounded transition-colors text-slate-400 hover:text-emerald-500 cursor-pointer">
                <i data-lucide="circle" class="w-3.5 h-3.5"></i>
              </button>
              <span class="truncate text-[10px] text-slate-700 dark:text-slate-300 font-semibold leading-tight">${task.title}</span>
            </div>
            <button onclick="rescheduleSidebarTask('${task.id}')" type="button" title="Reschedule to today"
              class="text-[9px] shrink-0 font-bold bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-1 rounded border border-slate-100 dark:border-slate-800 transition flex items-center gap-1 cursor-pointer whitespace-nowrap">
              Reschedule <i data-lucide="arrow-right" class="w-2.5 h-2.5"></i>
            </button>
          </div>
        `).join('');
        
        return `
          <div class="border border-slate-100 dark:border-slate-800/60 rounded-xl bg-slate-50/50 dark:bg-slate-900/30 overflow-hidden shadow-2xs transition-all duration-200">
            <!-- Accordion Header -->
            <div class="p-3 flex items-center justify-between gap-2 cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-900/80 transition"
                 onclick="toggleSidebarAccordion('${dateStr}')">
              <div class="flex items-center gap-2">
                <i data-lucide="${chevronIcon}" class="w-3.5 h-3.5 text-slate-400 dark:text-slate-500"></i>
                <div>
                  <p class="text-[11px] font-bold text-slate-800 dark:text-slate-200 font-mono leading-none">${dateStr}</p>
                  <p class="text-[9px] text-slate-400 dark:text-slate-500 font-semibold mt-1.5">${readableDate}</p>
                </div>
              </div>
              
              <span class="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-500/15">
                ${count} pending
              </span>
            </div>

            <!-- Accordion Content -->
            <div class="${contentClass} border-t border-slate-100 dark:border-slate-800/50 p-3 bg-white dark:bg-slate-950 space-y-2 animate-fadeIn">
              <!-- Jump to Date Action -->
              <div class="flex justify-between items-center pb-2 border-b border-dashed border-slate-100 dark:border-slate-800/40">
                <span class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Missed Items</span>
                <button onclick="setTaskDate('${dateStr}')" type="button"
                  class="text-[9px] font-bold text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 flex items-center gap-1 cursor-pointer">
                  Jump to Day <i data-lucide="arrow-right" class="w-2.5 h-2.5"></i>
                </button>
              </div>
              
              <!-- Tasks List -->
              <div class="space-y-1.5 mt-1.5">
                ${tasksHTML}
              </div>
            </div>
          </div>
        `;
      }).join('');
      
      listContainer.innerHTML = listHTML;
      const listContainerMobile = document.getElementById('pending-days-list-mobile');
      if (listContainerMobile) {
        listContainerMobile.innerHTML = listHTML;
      }
    } else {
      if (mobileToggleBtn) {
        mobileToggleBtn.classList.add('hidden');
      }
      sidebarContainer.className = "hidden";
      if (sidebarColumn) {
        sidebarColumn.className = "hidden";
      }
      if (boardCol) {
        boardCol.className = "pwa-section-card lg:col-span-12 glass-card rounded-2xl p-4 sm:p-6 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 font-sans border-l-4 border-l-rose-500 w-full h-full flex flex-col overflow-hidden min-h-0 relative z-10 shrink-0";
      }
      listContainer.innerHTML = '';
      const listContainerMobile = document.getElementById('pending-days-list-mobile');
      if (listContainerMobile) {
        listContainerMobile.innerHTML = '';
      }
    }
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
      priorityBadge = `<span class="text-[9px] font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300 shrink-0 border border-rose-500/20">High</span>`;
    } else if (task.priority === 'low') {
      priorityBadge = `<span class="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300 shrink-0 border border-emerald-500/20">Low</span>`;
    } else {
      priorityBadge = `<span class="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300 shrink-0 border border-amber-500/20">Medium</span>`;
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
        <div class="mt-1.5 flex items-center gap-2">
          <div class="flex-1 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div class="${barColor} h-full rounded-full transition-all duration-300" style="width: ${subtaskPct}%;"></div>
          </div>
          <span class="text-[9px] font-mono text-slate-400 dark:text-slate-500 font-bold shrink-0">${completedSubtasks}/${subtasksCount} steps</span>
        </div>
      `;
    }

    let subtaskContainer = "";
    if (subtasksCount > 0) {
      subtaskContainer = `
        <!-- Micro-step subtasks -->
        <div class="mt-2 pl-4 border-l border-slate-200 dark:border-slate-800 block space-y-1">
          ${(task.subtasks || []).map(sub => `
            <div class="flex justify-between items-center gap-4 text-xs group">
              <button onclick="toggleSubtask('${task.id}', '${sub.id}')" class="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-left min-w-0 flex-1 cursor-pointer select-none">
                <span class="${sub.completed ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400'}">
                  <i data-lucide="${sub.completed ? 'check-circle' : 'circle'}" class="w-4 h-4"></i>
                </span>
                <span class="truncate text-xs ${sub.completed ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-200'} font-semibold">${sub.title}</span>
              </button>
              <button onclick="deleteSubtask('${task.id}', '${sub.id}')" class="text-slate-400 hover:text-rose-500 p-0.5 rounded cursor-pointer">
                <i data-lucide="trash-2" class="w-3 h-3"></i>
              </button>
            </div>
          `).join('')}
        </div>
      `;
    }

    return `
      <div class="task-card-wrapper py-2.5 px-3.5 border transition duration-200 rounded-xl ${task.completed ? 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/80 opacity-60 shadow-none' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm'}">
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <button onclick="toggleTaskCompletion('${task.id}')" class="p-0.5 shrink-0 rounded-lg transition-colors cursor-pointer ${task.completed ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}">
              <i data-lucide="${task.completed ? 'check-circle' : 'circle'}" class="w-5 h-5"></i>
            </button>
            <div class="min-w-0 pr-4">
              <h3 class="text-xs font-bold leading-none ${task.completed ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}">${task.title}</h3>
            </div>
          </div>
          
          <div class="flex items-center gap-2 shrink-0 relative">
            ${priorityBadge}
            
            <!-- Three Dots Menu Button -->
            <button onclick="toggleTaskMenu('${task.id}', event)" type="button" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer">
              <i data-lucide="more-vertical" class="w-3.5 h-3.5"></i>
            </button>
            
            <!-- Dropdown Menu -->
            <div id="task-menu-${task.id}" class="hidden absolute right-0 top-full mt-1 w-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg py-1.5 z-30 font-sans">
              <button onclick="triggerAddSubtask('${task.id}', event)" type="button" class="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold flex items-center gap-2 cursor-pointer">
                <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i> Add Subtask
              </button>
              <button onclick="triggerChangeTaskDate('${task.id}', event)" type="button" class="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold flex items-center gap-2 cursor-pointer">
                <i data-lucide="calendar" class="w-3.5 h-3.5"></i> Change Date
              </button>
              <div class="h-px bg-slate-100 dark:bg-slate-800 my-1"></div>
              <button onclick="deleteTask('${task.id}')" type="button" class="w-full text-left px-3 py-2 text-xs text-rose-600 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 font-bold flex items-center gap-2 cursor-pointer">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Delete Task
              </button>
            </div>
            
            <!-- Hidden Date Input for Rescheduling -->
            <input type="date" id="change-date-input-${task.id}" onchange="changeTaskDate('${task.id}', this.value)" onclick="event.stopPropagation()" class="absolute pointer-events-none opacity-0 w-0 h-0">
          </div>
        </div>

        <!-- Progress metrics bar -->
        ${subtaskProgressBar}

        <!-- Micro-step subtasks -->
        ${subtaskContainer}
      </div>
    `;
  }).join('') + '<div class="h-4 shrink-0"></div>';
}

function openDatePicker() {
  const picker = document.getElementById('task-date-picker');
  if (picker && typeof picker.showPicker === 'function') {
    picker.showPicker();
  } else if (picker) {
    picker.click();
  }
}

function setTaskDate(val) {
  activeTaskDate = val;
  closePendingTasksSheet();
  renderAll();
}

function setTaskDateToday() {
  activeTaskDate = toLocalISODate(new Date());
  renderAll();
}

function navigateDay(amt) {
  const parts = activeTaskDate.split('-');
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  d.setDate(d.getDate() + amt);
  activeTaskDate = toLocalISODate(d);
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

  const container = document.getElementById('tasks-list-container');
  if (container) {
    setTimeout(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }, 50);
  }
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

function toggleSidebarAccordion(dateStr) {
  if (openSidebarDates.has(dateStr)) {
    openSidebarDates.delete(dateStr);
  } else {
    openSidebarDates.add(dateStr);
  }
  renderAll();
}

function toggleMobilePendingTasks() {
  openPendingTasksSheet();
}

function openPendingTasksSheet() {
  const sheet = document.getElementById('pending-tasks-sheet');
  if (sheet) {
    sheet.classList.remove('hidden');
    const content = sheet.querySelector('.animate-slideUp');
    if (content) {
      content.style.transform = 'translateY(100%)';
      setTimeout(() => {
        content.style.transform = 'translateY(0)';
      }, 10);
    }
    safeCreateIcons();
  }
}

function closePendingTasksSheet() {
  const sheet = document.getElementById('pending-tasks-sheet');
  if (sheet) {
    const content = sheet.querySelector('.animate-slideUp');
    if (content) {
      content.style.transform = 'translateY(100%)';
    }
    setTimeout(() => {
      sheet.classList.add('hidden');
    }, 200);
  }
}

function rescheduleSidebarTask(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  const todayStr = toLocalISODate(new Date());
  task.targetDate = todayStr;
  task.createdAt = new Date().toISOString();
  pushNotificationLog("🚀 Rescheduled", `Rescheduled task "${task.title}" to today (${todayStr})`);
  showToast("🚀 Task Rescheduled", `Moved task to today.`, "info");
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

let activeSheetTaskId = null;

function openTaskActionsSheet(taskId) {
  activeSheetTaskId = taskId;
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  
  const sheet = document.getElementById('task-actions-sheet');
  const titleEl = document.getElementById('sheet-task-title');
  if (sheet && titleEl) {
    titleEl.textContent = task.title;
    sheet.classList.remove('hidden');
    
    // Reset layout transition state
    const content = sheet.querySelector('.animate-slideUp');
    if (content) {
      content.style.transform = 'translateY(100%)';
      setTimeout(() => {
        content.style.transform = 'translateY(0)';
      }, 10);
    }
    
    safeCreateIcons();
  }
}

function closeTaskActionsSheet() {
  const sheet = document.getElementById('task-actions-sheet');
  if (sheet) {
    const content = sheet.querySelector('.animate-slideUp');
    if (content) {
      content.style.transform = 'translateY(100%)';
    }
    setTimeout(() => {
      sheet.classList.add('hidden');
      activeSheetTaskId = null;
    }, 200);
  }
}

function executeSheetAction(action) {
  const taskId = activeSheetTaskId;
  closeTaskActionsSheet();
  if (!taskId) return;
  
  // Delay action implementation to let slide-down animation close cleanly
  setTimeout(() => {
    if (action === 'add-subtask') {
      triggerAddSubtask(taskId);
    } else if (action === 'change-date') {
      triggerChangeTaskDate(taskId);
    } else if (action === 'delete') {
      deleteTask(taskId);
    }
  }, 250);
}

function toggleTaskMenu(taskId, event) {
  if (event) event.stopPropagation();
  
  // Use globally placed bottom action sheet for mobile viewport sizes
  const isMobile = window.innerWidth < 1024;
  if (isMobile) {
    openTaskActionsSheet(taskId);
    return;
  }
  
  // Hide all other menus first
  document.querySelectorAll('[id^="task-menu-"]').forEach(menu => {
    if (menu.id !== `task-menu-${taskId}`) {
      menu.classList.add('hidden');
      const parentCard = menu.closest('.task-card-wrapper');
      if (parentCard) parentCard.classList.remove('z-40', 'relative');
    }
  });
  
  const menu = document.getElementById(`task-menu-${taskId}`);
  if (menu) {
    menu.classList.toggle('hidden');
    const parentCard = menu.closest('.task-card-wrapper');
    if (parentCard) {
      if (!menu.classList.contains('hidden')) {
        parentCard.classList.add('z-40', 'relative');
      } else {
        parentCard.classList.remove('z-40', 'relative');
      }
    }
  }
}

function triggerAddSubtask(taskId, event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById(`task-menu-${taskId}`);
  if (menu) {
    menu.classList.add('hidden');
    const parentCard = menu.closest('.task-card-wrapper');
    if (parentCard) parentCard.classList.remove('z-40', 'relative');
  }
  
  const title = prompt("Enter subtask step title:");
  if (title && title.trim()) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const newSub = {
      id: Math.random().toString(36).substr(2, 9),
      title: title.trim(),
      completed: false
    };
    task.subtasks.push(newSub);
    task.completed = false; // Reset task completion since new step added
    showToast("➕ Step Added", "Micro-step added to task checklist.", "success");
    saveState();
  }
}

function triggerChangeTaskDate(taskId, event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById(`task-menu-${taskId}`);
  if (menu) {
    menu.classList.add('hidden');
    const parentCard = menu.closest('.task-card-wrapper');
    if (parentCard) parentCard.classList.remove('z-40', 'relative');
  }
  
  const dateInput = document.getElementById(`change-date-input-${taskId}`);
  if (dateInput) {
    if (typeof dateInput.showPicker === 'function') {
      dateInput.showPicker();
    } else {
      dateInput.click();
    }
  }
}

function changeTaskDate(taskId, newDate) {
  if (!newDate) return;
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  const oldDate = task.targetDate;
  task.targetDate = newDate;
  showToast("🚀 Task Rescheduled", `Moved task from ${oldDate} to ${newDate}.`, "success");
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
    <div class="p-2.5 border transition duration-200 rounded-xl flex items-center justify-between gap-4 select-none ${goal.completed ? 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/80 opacity-60 shadow-none' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm'}">
      <div class="flex items-center gap-3.5 min-w-0 flex-1">
        <button onclick="toggleGoal('${goal.id}')" class="shrink-0 cursor-pointer rounded-lg p-0.5 transition-colors ${goal.completed ? 'text-emerald-600 dark:text-emerald-500' : 'text-slate-400 hover:text-emerald-500'}">
          <i data-lucide="${goal.completed ? 'check-circle' : 'circle'}" class="w-5 h-5"></i>
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
  `).join('') + '<div class="h-4 shrink-0"></div>';
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

  const container = document.getElementById('goals-list-container');
  if (container) {
    setTimeout(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }, 50);
  }
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

function getFilteredThoughtsList() {
  return thoughts.filter(th => {
    const thDate = th.date || (th.createdAt ? th.createdAt.split('T')[0] : activeTaskDate);
    const dateMatch = thoughtSearchQuery ? true : (thDate === activeTaskDate);
    
    const searchMatch = !thoughtSearchQuery || 
      (th.title && th.title.toLowerCase().includes(thoughtSearchQuery.toLowerCase())) ||
      (th.content && th.content.toLowerCase().includes(thoughtSearchQuery.toLowerCase()));
      
    return dateMatch && searchMatch;
  });
}

function renderThoughts() {
  updateCategoryFiltersUI();

  // Sync Thoughts Date Navigation UI
  const weekdayEl = document.getElementById('thought-date-weekday');
  if (weekdayEl) {
    weekdayEl.textContent = getWeekdayName(activeTaskDate);
  }
  const formattedEl = document.getElementById('thought-date-formatted');
  if (formattedEl) {
    formattedEl.textContent = getFormattedDateText(activeTaskDate);
  }
  const labelEl = document.getElementById('thought-date-picker-label');
  if (labelEl) {
    labelEl.textContent = getPickerLabelDate(activeTaskDate);
  }
  const pickerEl = document.getElementById('thought-date-picker');
  if (pickerEl) {
    pickerEl.value = activeTaskDate;
  }

  // Today button styling toggle
  const todayBtn = document.getElementById('thought-today-btn');
  if (todayBtn) {
    const todayStr = toLocalISODate(new Date());
    if (activeTaskDate === todayStr) {
      todayBtn.className = "h-7 px-3 flex items-center justify-center bg-[#ff5252] hover:bg-[#ff3b3b] dark:bg-red-600 dark:hover:bg-red-500 text-white text-[10px] font-black uppercase tracking-wider rounded-md transition-all cursor-pointer shadow-sm border border-transparent";
    } else {
      todayBtn.className = "h-7 px-3 flex items-center justify-center bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all cursor-pointer shadow-2xs";
    }
  }

  const container = document.getElementById('thoughts-list-container');
  if (!container) return;

  const baseFiltered = getFilteredThoughtsList();
  const filtered = baseFiltered.filter(th => activeThoughtCategory === 'all' || th.category === activeThoughtCategory);

  filtered.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return timeB - timeA;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/30 font-semibold w-full">
        <i data-lucide="book-open" class="w-8 h-8 opacity-20 mb-2 text-slate-500"></i>
        <p class="text-xs font-bold text-slate-700 dark:text-slate-300">
          ${thoughtSearchQuery ? 'No matching thoughts found' : 'No notes on this day'}
        </p>
        <p class="text-[10px] text-slate-400 mt-1 max-w-xs px-4 font-normal">
          ${thoughtSearchQuery ? 'Try adjusting your search keywords.' : 'Tap "New Note" to add an entry for this date.'}
        </p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(th => {
    const category = th.category || 'note';
    let categoryClass = "thought-card-note";
    let categoryLabel = "📌 Note";
    
    if (category === 'idea') {
      categoryClass = "thought-card-idea";
      categoryLabel = "💡 Idea";
    } else if (category === 'reflection') {
      categoryClass = "thought-card-reflection";
      categoryLabel = "🧠 Reflection";
    } else if (category === 'learning') {
      categoryClass = "thought-card-learning";
      categoryLabel = "📚 Learning";
    }

    let displayTitle = th.title ? th.title.trim() : "";
    let displaySnippet = th.content ? th.content.trim() : "";
    
    if (!displayTitle) {
      if (displaySnippet) {
        const lines = displaySnippet.split('\n');
        displayTitle = lines[0];
        if (displayTitle.length > 40) {
          displayTitle = displayTitle.substring(0, 40) + '...';
        }
        displaySnippet = lines.slice(1).join('\n').trim();
      } else {
        displayTitle = "Untitled Note";
      }
    }

    let previewText = displaySnippet;
    if (previewText.length > 80) {
      previewText = previewText.substring(0, 80) + '...';
    }
    if (!previewText) {
      previewText = "Empty note content";
    }

    const dateObj = new Date(th.updatedAt || th.createdAt || new Date());
    const formattedDate = dateObj.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    // If global search is active, show the thought's actual date on the card
    const thDateStr = th.date || (th.createdAt ? th.createdAt.split('T')[0] : activeTaskDate);
    const dateLabelStr = thoughtSearchQuery ? `${formattedDate} (${thDateStr})` : formattedDate;

    return `
      <div onclick="openThoughtEditor('${th.id}')" 
           class="thought-card ${categoryClass} p-3.5 rounded-xl flex flex-col gap-2 hover:scale-[1.01] transition-all duration-200 cursor-pointer premium-transition relative select-none">
        
        <div class="flex items-start justify-between gap-3">
          <h3 class="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 tracking-tight truncate flex-1 font-sans">
            ${displayTitle}
          </h3>
          <div class="flex items-center gap-1 shrink-0">
            <button onclick="togglePinThought('${th.id}', event)" 
                    class="p-1 rounded text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer flex items-center justify-center" 
                    title="${th.pinned ? 'Unpin' : 'Pin'}">
              <i data-lucide="pin" class="w-3.5 h-3.5 ${th.pinned ? 'text-amber-500 fill-amber-500 dark:text-amber-400 dark:fill-amber-400' : ''}"></i>
            </button>
            <button onclick="deleteThought('${th.id}', event)" 
                    class="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer flex items-center justify-center" 
                    title="Delete Note">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>

        <p class="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed font-sans font-medium line-clamp-2 pr-2">
          ${previewText}
        </p>

        <div class="flex items-center justify-between mt-1 pt-1.5 border-t border-slate-100 dark:border-slate-800/80">
          <div class="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 font-mono font-semibold">
            <span class="font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              ${categoryLabel}
            </span>
            <span class="flex items-center gap-1">
              <i data-lucide="calendar" class="w-3 h-3"></i>
              ${dateLabelStr}
            </span>
            ${th.createdAt !== th.updatedAt ? '<span class="italic opacity-70">(edited)</span>' : ''}
          </div>
        </div>

      </div>
    `;
  }).join('') + '<div class="h-4 shrink-0"></div>';
}

function searchThoughts(val) {
  thoughtSearchQuery = val;
  renderAll();
}

function filterThoughtsByCategory(category) {
  activeThoughtCategory = category;
  renderAll();
}

function openNewThoughtEditor() {
  editingThoughtId = null;
  editorIsPinned = false;

  document.getElementById('editor-header-mode').textContent = "New Note";
  document.getElementById('editor-thought-title').value = "";
  document.getElementById('editor-thought-content').value = "";
  document.getElementById('editor-thought-category').value = "note";
  document.getElementById('editor-time-info').textContent = "";

  updateEditorPinUI();
  updateEditorCounts();

  const overlay = document.getElementById('thought-editor-overlay');
  overlay.classList.remove('hidden');
  document.getElementById('editor-thought-title').focus();
}

function openThoughtDatePicker() {
  const picker = document.getElementById('thought-date-picker');
  if (picker && typeof picker.showPicker === 'function') {
    picker.showPicker();
  } else if (picker) {
    picker.click();
  }
}

function openThoughtEditor(thId) {
  const th = thoughts.find(t => t.id === thId);
  if (!th) return;

  editingThoughtId = thId;
  editorIsPinned = !!th.pinned;

  document.getElementById('editor-header-mode').textContent = "Edit Note";
  document.getElementById('editor-thought-title').value = th.title || "";
  document.getElementById('editor-thought-content').value = th.content || "";
  document.getElementById('editor-thought-category').value = th.category || "note";

  const savedDate = new Date(th.updatedAt || th.createdAt || new Date());
  const formattedTime = savedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formattedDate = savedDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
  document.getElementById('editor-time-info').textContent = `Saved ${formattedDate} at ${formattedTime}`;

  updateEditorPinUI();
  updateEditorCounts();

  const overlay = document.getElementById('thought-editor-overlay');
  overlay.classList.remove('hidden');
}

function closeThoughtEditor() {
  const overlay = document.getElementById('thought-editor-overlay');
  overlay.classList.add('hidden');
  editingThoughtId = null;
}

function toggleEditorPin() {
  editorIsPinned = !editorIsPinned;
  updateEditorPinUI();
}

function updateEditorPinUI() {
  const btn = document.getElementById('editor-pin-btn');
  if (!btn) return;
  const icon = btn.querySelector('i') || btn.querySelector('svg');
  if (editorIsPinned) {
    btn.className = "p-2 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-lg text-amber-500 dark:text-amber-400 transition cursor-pointer flex items-center justify-center";
    btn.title = "Unpin Thought";
    if (icon) {
      icon.className = "w-4 h-4 text-amber-500 fill-amber-500 dark:text-amber-400 dark:fill-amber-400";
    }
  } else {
    btn.className = "p-2 hover:bg-slate-100 dark:hover:bg-slate-900 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer flex items-center justify-center";
    btn.title = "Pin Thought";
    if (icon) {
      icon.className = "w-4 h-4 text-slate-400";
    }
  }
  safeCreateIcons();
}

function updateEditorCounts() {
  const content = document.getElementById('editor-thought-content')?.value || '';
  const charCount = content.length;
  const words = content.trim().split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  const charEl = document.getElementById('editor-char-count');
  const wordEl = document.getElementById('editor-word-count');

  if (charEl) charEl.textContent = `${charCount} character${charCount === 1 ? '' : 's'}`;
  if (wordEl) wordEl.textContent = `${wordCount} word${wordCount === 1 ? '' : 's'}`;
}

function saveThoughtFromEditor() {
  const title = document.getElementById('editor-thought-title').value.trim();
  const content = document.getElementById('editor-thought-content').value.trim();
  const category = document.getElementById('editor-thought-category').value;

  if (!title && !content) {
    showToast("⚠️ Empty Note", "Cannot save note without title or content.", "warning");
    return;
  }

  const now = new Date().toISOString();

  if (editingThoughtId === null) {
    // Add new thought
    const newTh = {
      id: Math.random().toString(36).substr(2, 9),
      title: title,
      content: content,
      category: category,
      pinned: editorIsPinned,
      date: activeTaskDate, // Set to active day for day-wise journaling
      createdAt: now,
      updatedAt: now
    };
    thoughts.push(newTh);
    showToast("💭 Note Created", "Saved new note to timeline.", "success");
    pushNotificationLog("💭 Note Created", `Saved note: "${title || content.substring(0, 20)}..."`);
  } else {
    // Edit existing thought
    const th = thoughts.find(t => t.id === editingThoughtId);
    if (th) {
      th.title = title;
      th.content = content;
      th.category = category;
      th.pinned = editorIsPinned;
      th.updatedAt = now;
      showToast("✏️ Note Updated", "Your changes have been saved.", "success");
    }
  }

  saveState();
  closeThoughtEditor();
}

function togglePinThought(thId, event) {
  if (event) event.stopPropagation();
  const th = thoughts.find(t => t.id === thId);
  if (!th) return;

  th.pinned = !th.pinned;
  th.updatedAt = new Date().toISOString();
  
  showToast(
    th.pinned ? "📌 Note Pinned" : "📍 Note Unpinned",
    th.pinned ? "This note will stay at the top of your timeline." : "Note returned to normal sorting.",
    "info"
  );
  saveState();
}

function deleteThought(thId, event) {
  if (event) event.stopPropagation();
  confirmCustom("Delete Note", "Are you sure you want to permanently delete this note?").then(approved => {
    if (approved) {
      thoughts = thoughts.filter(t => t.id !== thId);
      showToast("🗑️ Note Deleted", "The note has been removed.", "info");
      if (editingThoughtId === thId) {
        closeThoughtEditor();
      }
      saveState();
    }
  });
}

function updateCategoryFiltersUI() {
  const baseFiltered = getFilteredThoughtsList();
  const counts = {
    all: baseFiltered.length,
    note: baseFiltered.filter(t => t.category === 'note').length,
    idea: baseFiltered.filter(t => t.category === 'idea').length,
    reflection: baseFiltered.filter(t => t.category === 'reflection').length,
    learning: baseFiltered.filter(t => t.category === 'learning').length
  };

  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'note', label: '📌 Notes' },
    { id: 'idea', label: '💡 Ideas' },
    { id: 'reflection', label: '🧠 Reflections' },
    { id: 'learning', label: '📚 Learnings' }
  ];

  tabs.forEach(tab => {
    const btn = document.getElementById(`thought-filter-${tab.id}`);
    if (!btn) return;

    btn.innerHTML = `${tab.label} <span class="ml-1 px-1.5 py-0.5 text-[9px] rounded-full ${
      activeThoughtCategory === tab.id 
        ? 'bg-white/20 text-white dark:bg-slate-950/20 dark:text-slate-900' 
        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
    }">${counts[tab.id]}</span>`;

    if (activeThoughtCategory === tab.id) {
      btn.className = "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm flex items-center gap-1";
    } else {
      btn.className = "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1";
    }
  });
}

// ----------------------------------------------------
// 5. CUSTOM USER AUTHENTICATION & SYNC CORE
// ----------------------------------------------------
function initUserSession(username, firstName, lastName) {
  currentUser = username.toLowerCase();
  
  if (firstName && lastName) {
    profileName = `${firstName} ${lastName}`;
  } else {
    profileName = safeStorage.getItem('localStorage', `planner_${currentUser}_profile_name`) || username;
  }
  profileBio = safeStorage.getItem('localStorage', `planner_${currentUser}_profile_bio`) || 'Crafting daily productivity';
  
  // Load local cache fallback safely
  try {
    const cachedTasks = safeStorage.getItem('localStorage', `planner_${currentUser}_tasks`);
    tasks = cachedTasks ? (JSON.parse(cachedTasks) || []) : [];
  } catch (e) {
    console.error("Failed to parse cached tasks:", e);
    tasks = [];
  }
  
  try {
    const cachedGoals = safeStorage.getItem('localStorage', `planner_${currentUser}_goals`);
    goals = cachedGoals ? (JSON.parse(cachedGoals) || []) : [];
  } catch (e) {
    console.error("Failed to parse cached goals:", e);
    goals = [];
  }
  
  try {
    const cachedThoughts = safeStorage.getItem('localStorage', `planner_${currentUser}_thoughts`);
    thoughts = cachedThoughts ? (JSON.parse(cachedThoughts) || []) : [];
  } catch (e) {
    console.error("Failed to parse cached thoughts:", e);
    thoughts = [];
  }
  
  try {
    const cachedNotifs = safeStorage.getItem('localStorage', `planner_${currentUser}_notifs`);
    notifs = cachedNotifs ? (JSON.parse(cachedNotifs) || []) : [];
  } catch (e) {
    console.error("Failed to parse cached notifications:", e);
    notifs = [];
  }

  // Hide auth screen overlay
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.classList.add('hidden');
  
  // Update UI greetings
  const greetingEl = document.getElementById('greeting-title');
  if (greetingEl) {
    const hours = new Date().getHours();
    let greeting = 'Good morning';
    if (hours >= 12 && hours < 17) greeting = 'Good afternoon';
    else if (hours >= 17) greeting = 'Good evening';
    greetingEl.textContent = `${greeting}, ${profileName}!`;
  }
  
  updateSyncStatus('syncing');

  // Load latest cloud data
  loadFromFirebase().then(() => {
    updateSyncStatus('synced');
  }).catch((err) => {
    console.error("Cloud data fetch failed:", err);
    updateSyncStatus('offline');
  });

  renderAll();
}

function toggleAuthTab(tab) {
  const loginForm = document.getElementById('auth-login-form');
  const signupForm = document.getElementById('auth-signup-form');
  const loginTabBtn = document.getElementById('auth-tab-login');
  const signupTabBtn = document.getElementById('auth-tab-signup');
  
  if (tab === 'login') {
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
    loginTabBtn.className = "flex-1 py-2 text-center text-xs font-extrabold tracking-wide rounded-full transition-all duration-200 cursor-pointer bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm";
    signupTabBtn.className = "flex-1 py-2 text-center text-xs font-extrabold tracking-wide rounded-full transition-all duration-200 cursor-pointer text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200";
  } else {
    loginForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
    signupTabBtn.className = "flex-1 py-2 text-center text-xs font-extrabold tracking-wide rounded-full transition-all duration-200 cursor-pointer bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm";
    loginTabBtn.className = "flex-1 py-2 text-center text-xs font-extrabold tracking-wide rounded-full transition-all duration-200 cursor-pointer text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200";
  }
}

function submitSignUp(e) {
  e.preventDefault();
  const firstName = document.getElementById('signup-firstname').value.trim();
  const lastName = document.getElementById('signup-lastname').value.trim();
  const username = document.getElementById('signup-username').value.trim();
  const password = document.getElementById('signup-password').value;
  
  if (!firstName || !lastName || !username || !password) {
    showToast("⚠️ Validation Error", "All fields are required.", "warning");
    return;
  }
  
  const usernameLower = username.toLowerCase();
  showToast("🔍 Verifying Account", "Validating username uniqueness...", "info");
  
  const userRef = db.collection('users').doc(usernameLower);
  userRef.get().then(docSnapshot => {
    if (docSnapshot.exists) {
      showToast("❌ Username Taken", `"${username}" is already in use. Please select a different username.`, "error");
    } else {
      const userData = {
        username: username,
        password: password,
        firstName: firstName,
        lastName: lastName,
        createdAt: new Date().toISOString()
      };
      
      userRef.set(userData).then(() => {
        showToast("🎉 Sign Up Complete", `Welcome, ${firstName}! Registration successful.`, "success");
        
        // Auto-login and persist session
        safeStorage.setItem('localStorage', 'planner_logged_in_user', usernameLower);
        initUserSession(usernameLower, firstName, lastName);
        
        // Sync initial blank space to DB
        syncWithFirebase();
      }).catch(err => {
        showToast("❌ DB Registration Error", "Failed to write user document.", "error");
        console.error(err);
      });
    }
  }).catch(err => {
    showToast("❌ Connection Failure", "Unable to connect to database.", "error");
    console.error(err);
  });
}

// Custom handler for Lucide re-creation inside auth views
function reCreateAuthIcons() {
  safeCreateIcons();
}

function submitLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const remember = document.getElementById('login-remember').checked;
  
  if (!username || !password) {
    showToast("⚠️ Credentials Missing", "Please enter username and password.", "warning");
    return;
  }
  
  const usernameLower = username.toLowerCase();
  showToast("🔑 Accessing Vault", "Checking user credentials...", "info");
  
  const userRef = db.collection('users').doc(usernameLower);
  userRef.get().then(docSnapshot => {
    if (!docSnapshot.exists) {
      showToast("❌ Account Not Found", "No profile matches that username.", "error");
      return;
    }
    
    const userData = docSnapshot.data();
    if (userData.password === password) {
      showToast("🔓 Access Granted", `Welcome back, ${userData.firstName}!`, "success");
      
      if (remember) {
        safeStorage.setItem('localStorage', 'planner_logged_in_user', usernameLower);
      } else {
        safeStorage.setItem('sessionStorage', 'planner_logged_in_user', usernameLower);
      }
      
      initUserSession(usernameLower, userData.firstName, userData.lastName);
    } else {
      showToast("❌ Password Error", "The password you entered is incorrect.", "error");
    }
  }).catch(err => {
    showToast("❌ Server Connection Error", "Unable to read auth data.", "error");
    console.error(err);
  });
}

function logoutUser() {
  safeStorage.removeItem('localStorage', 'planner_logged_in_user');
  safeStorage.removeItem('sessionStorage', 'planner_logged_in_user');
  showToast("🔒 Securely Logged Out", "You have been signed out.", "info");
  
  setTimeout(() => {
    window.location.reload();
  }, 1000);
}

function updateSyncStatus(status) {
  const badge = document.getElementById('sync-status-badge');
  if (!badge) return;
  
  if (status === 'synced') {
    badge.className = "text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-500/15 flex items-center gap-1";
    badge.innerHTML = `<i data-lucide="cloud" class="w-2.5 h-2.5"></i> Synced`;
  } else if (status === 'syncing') {
    badge.className = "text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 border border-blue-500/15 flex items-center gap-1";
    badge.innerHTML = `<i data-lucide="cloud-lightning" class="w-2.5 h-2.5 animate-pulse"></i> Syncing`;
  } else if (status === 'offline') {
    badge.className = "text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 border border-rose-500/15 flex items-center gap-1";
    badge.innerHTML = `<i data-lucide="cloud-off" class="w-2.5 h-2.5"></i> Offline`;
  } else {
    badge.className = "text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-500/15 flex items-center gap-1";
    badge.innerHTML = `<i data-lucide="cloud" class="w-2.5 h-2.5"></i> Connecting`;
  }
  reCreateAuthIcons();
}

function syncWithFirebase() {
  if (!currentUser) return;
  
  updateSyncStatus('syncing');
  
  const plannerData = {
    tasks,
    goals,
    thoughts,
    notifs,
    profileName,
    profileBio,
    updatedAt: new Date().toISOString()
  };
  
  db.collection('users').doc(currentUser).collection('planner').doc('data').set(plannerData)
    .then(() => {
      updateSyncStatus('synced');
    })
    .catch(err => {
      console.error("Firebase sync error:", err);
      updateSyncStatus('offline');
    });
}

function loadFromFirebase() {
  if (!currentUser) return Promise.resolve();
  
  return db.collection('users').doc(currentUser).collection('planner').doc('data').get()
    .then(docSnapshot => {
      if (docSnapshot.exists) {
        const data = docSnapshot.data();
        
        tasks = data.tasks || [];
        goals = data.goals || [];
        thoughts = data.thoughts || [];
        notifs = data.notifs || [];
        profileName = data.profileName || profileName;
        profileBio = data.profileBio || profileBio;
        
        safeStorage.setItem('localStorage', `planner_${currentUser}_tasks`, JSON.stringify(tasks));
        safeStorage.setItem('localStorage', `planner_${currentUser}_goals`, JSON.stringify(goals));
        safeStorage.setItem('localStorage', `planner_${currentUser}_thoughts`, JSON.stringify(thoughts));
        safeStorage.setItem('localStorage', `planner_${currentUser}_notifs`, JSON.stringify(notifs));
        safeStorage.setItem('localStorage', `planner_${currentUser}_profile_name`, profileName);
        safeStorage.setItem('localStorage', `planner_${currentUser}_profile_bio`, profileBio);
        
        renderAll();
      }
    });
}

