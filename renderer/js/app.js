/**
 * StudioFlow — App Controller
 * Global state, mode switching, shared utilities, toast notifications
 */

// ── Global App State ──────────────────────────────────────────────
window.StudioFlow = {
  currentMode: 'teaching',
  isRecording: false,
  isPaused: false,
  recordingTimer: null,
  recordingSeconds: 0,
  chapterMarkers: [],
  settings: {
    quality: 'medium',
    fps: 30,
    countdown: 3,
    bubbleSize: 180,
    bubblePos: 'bottom-right',
  },
  outputDirs: null,
};

// ── DOM Ready ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Load output dirs from main process
  if (window.electronAPI) {
    StudioFlow.outputDirs = await window.electronAPI.getOutputDirs();
    document.getElementById('settings-save-path').textContent =
      StudioFlow.outputDirs.root.replace(process.env.HOME || '/Users', '~');
  }

  initModeNav();
  initKeyboardShortcuts();
  initSettings();
  initLibrary();
  loadSettings();

  // Fade in the app
  document.getElementById('app').style.opacity = '0';
  requestAnimationFrame(() => {
    document.getElementById('app').style.transition = 'opacity 0.4s ease';
    document.getElementById('app').style.opacity = '1';
  });
});

// ── Mode Navigation ────────────────────────────────────────────────
function initModeNav() {
  const navItems = document.querySelectorAll('.nav-item[data-mode]');
  navItems.forEach(btn => {
    btn.addEventListener('click', () => switchMode(btn.dataset.mode));
  });
}

function switchMode(mode) {
  const prev = StudioFlow.currentMode;
  if (prev === mode) return;

  // If recording, don't allow mode switch
  if (StudioFlow.isRecording) {
    showToast('⚠️', 'Stop the recording before switching modes');
    return;
  }

  // Hide all panels
  document.querySelectorAll('.mode-panel').forEach(p => p.classList.add('hidden'));

  // Show target panel
  const panel = document.getElementById(`mode-${mode}`);
  if (panel) panel.classList.remove('hidden');

  // Update nav active state
  document.querySelectorAll('.nav-item[data-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  StudioFlow.currentMode = mode;

  // Mode-specific initialization
  if (mode === 'storytelling' && window.StorytellingMode) {
    StorytellingMode.onActivate();
  }
  if (mode === 'teaching' && window.TeachingMode) {
    TeachingMode.onActivate();
  }
  if (mode === 'library') {
    loadLibrary();
  }
}

// ── Timer Utilities ────────────────────────────────────────────────
function startTimer(displayId) {
  StudioFlow.recordingSeconds = 0;
  updateTimerDisplay(displayId, 0);

  StudioFlow.recordingTimer = setInterval(() => {
    if (!StudioFlow.isPaused) {
      StudioFlow.recordingSeconds++;
      updateTimerDisplay(displayId, StudioFlow.recordingSeconds);

      // Update titlebar rec time
      const recTime = document.getElementById('rec-time-display');
      if (recTime) recTime.textContent = formatDuration(StudioFlow.recordingSeconds);
    }
  }, 1000);
}

function stopTimer(displayId) {
  clearInterval(StudioFlow.recordingTimer);
  StudioFlow.recordingTimer = null;
}

function updateTimerDisplay(displayId, seconds) {
  const el = document.getElementById(displayId);
  if (el) el.textContent = formatDuration(seconds);
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

// ── Recording State UI ─────────────────────────────────────────────
function setRecordingUI(isRecording) {
  StudioFlow.isRecording = isRecording;

  // Title bar badge
  const badge = document.getElementById('recording-indicator');
  badge.classList.toggle('hidden', !isRecording);
}

// ── Countdown ─────────────────────────────────────────────────────
function runCountdown(overlayId, seconds) {
  return new Promise((resolve) => {
    if (seconds <= 0) return resolve();

    const overlay = document.getElementById(overlayId);
    const numEl = document.getElementById('countdown-number');
    if (!overlay || !numEl) return resolve();

    overlay.classList.remove('hidden');
    let count = seconds;
    numEl.textContent = count;

    const tick = () => {
      numEl.style.animation = 'none';
      void numEl.offsetWidth; // reflow to restart animation
      numEl.style.animation = 'countdownPop 1s var(--ease-bounce) forwards';
      numEl.textContent = count;

      if (count <= 0) {
        overlay.classList.add('hidden');
        resolve();
        return;
      }

      count--;
      setTimeout(tick, 1000);
    };

    tick();
  });
}

// ── Chapter Markers ───────────────────────────────────────────────
function addChapterMarker(listId) {
  if (!StudioFlow.isRecording) return;
  const ts = StudioFlow.recordingSeconds;
  StudioFlow.chapterMarkers.push(ts);

  const container = document.getElementById(listId);
  if (container) {
    const pill = document.createElement('div');
    pill.className = 'chapter-pill';
    pill.textContent = formatDuration(ts);
    container.appendChild(pill);
  }

  showToast('📌', `Chapter marker at ${formatDuration(ts)}`);
}

// ── File Save Helpers ─────────────────────────────────────────────
async function saveRecording(chunks, mimeType, mode) {
  const blob = new Blob(chunks, { type: mimeType });
  const buffer = await blob.arrayBuffer();
  const ext = mimeType.includes('webm') ? 'webm' : 'mp4';
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${mode === 'teaching' ? 'teach' : 'story'}_${ts}.${ext}`;

  const result = await window.electronAPI.saveRecording({
    buffer,
    mode,
    filename,
  });

  if (result.success) {
    showToast('✅', `Saved: ${filename}`);
    return result.filePath;
  } else {
    showToast('❌', `Save failed: ${result.error}`);
    return null;
  }
}

// ── Toast Notifications ───────────────────────────────────────────
let toastTimeout;
function showToast(icon, message) {
  const toast = document.getElementById('toast');
  const iconEl = document.getElementById('toast-icon');
  const msgEl = document.getElementById('toast-msg');

  if (!toast) return;

  clearTimeout(toastTimeout);
  toast.classList.remove('hidden', 'hiding');
  iconEl.textContent = icon;
  msgEl.textContent = message;

  toastTimeout = setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.classList.add('hidden'), 400);
  }, 3500);
}

// ── Keyboard Shortcuts ────────────────────────────────────────────
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't fire when typing in inputs/textareas
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

    const mode = StudioFlow.currentMode;

    // Space = record/stop
    if (e.code === 'Space') {
      e.preventDefault();
      if (mode === 'teaching' && window.TeachingMode) {
        StudioFlow.isRecording ? TeachingMode.stopRecording() : TeachingMode.startRecording();
      } else if (mode === 'storytelling' && window.StorytellingMode) {
        StudioFlow.isRecording ? StorytellingMode.stopRecording() : StorytellingMode.startRecording();
      }
    }

    // M = chapter marker
    if (e.code === 'KeyM') {
      const listId = mode === 'teaching' ? 'chapter-markers-list' : 'chapter-markers-list';
      addChapterMarker(listId);
    }

    // Escape = close modals
    if (e.code === 'Escape') closeAllModals();
  });
}

// ── Modal Helpers ──────────────────────────────────────────────────
function openModal(backdropId) {
  document.getElementById(backdropId).classList.remove('hidden');
}

function closeModal(backdropId) {
  document.getElementById(backdropId).classList.add('hidden');
}

function closeAllModals() {
  document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.add('hidden'));
}

// Close modal on backdrop click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-backdrop')) closeAllModals();
});

// Wire all modal close buttons
document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', closeAllModals);
});

// ── Settings ──────────────────────────────────────────────────────
function initSettings() {
  // Bubble size display
  const sizeInput = document.getElementById('setting-bubble-size');
  const sizeVal = document.getElementById('setting-bubble-size-val');
  if (sizeInput) {
    sizeInput.addEventListener('input', () => {
      sizeVal.textContent = `${sizeInput.value}px`;
      StudioFlow.settings.bubbleSize = parseInt(sizeInput.value);
      const bubble = document.getElementById('webcam-bubble');
      if (bubble) {
        bubble.style.width = `${sizeInput.value}px`;
        bubble.style.height = `${sizeInput.value}px`;
      }
    });
  }

  const qualInput = document.getElementById('setting-quality');
  if (qualInput) qualInput.addEventListener('change', () => {
    StudioFlow.settings.quality = qualInput.value;
    saveSettings();
  });

  const fpsInput = document.getElementById('setting-fps');
  if (fpsInput) fpsInput.addEventListener('change', () => {
    StudioFlow.settings.fps = parseInt(fpsInput.value);
    saveSettings();
  });

  const cdInput = document.getElementById('setting-countdown');
  if (cdInput) cdInput.addEventListener('change', () => {
    StudioFlow.settings.countdown = parseInt(cdInput.value);
    saveSettings();
  });

  const posInput = document.getElementById('setting-bubble-pos');
  if (posInput) posInput.addEventListener('change', () => {
    StudioFlow.settings.bubblePos = posInput.value;
    saveSettings();
  });
}

function saveSettings() {
  localStorage.setItem('sf_settings', JSON.stringify(StudioFlow.settings));
}

function loadSettings() {
  const saved = localStorage.getItem('sf_settings');
  if (saved) {
    try { Object.assign(StudioFlow.settings, JSON.parse(saved)); } catch(e) {}
  }

  // Apply to UI
  const qEl = document.getElementById('setting-quality');
  if (qEl) qEl.value = StudioFlow.settings.quality;
  const fEl = document.getElementById('setting-fps');
  if (fEl) fEl.value = StudioFlow.settings.fps;
  const cdEl = document.getElementById('setting-countdown');
  if (cdEl) cdEl.value = StudioFlow.settings.countdown;
  const posEl = document.getElementById('setting-bubble-pos');
  if (posEl) posEl.value = StudioFlow.settings.bubblePos;
  const szEl = document.getElementById('setting-bubble-size');
  if (szEl) szEl.value = StudioFlow.settings.bubbleSize;
  const szV = document.getElementById('setting-bubble-size-val');
  if (szV) szV.textContent = `${StudioFlow.settings.bubbleSize}px`;
}

// ── Library ───────────────────────────────────────────────────────
function initLibrary() {
  const openFolderBtn = document.getElementById('open-folder-btn');
  if (openFolderBtn) {
    openFolderBtn.addEventListener('click', () => {
      if (StudioFlow.outputDirs) {
        window.electronAPI.openInFinder(StudioFlow.outputDirs.root);
      }
    });
  }

  document.querySelectorAll('.lib-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.lib-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadLibrary(tab.dataset.lib);
    });
  });
}

async function loadLibrary(type = 'teaching') {
  // In a real implementation we'd scan the filesystem
  // For now, show a friendly empty state or any saved info from localStorage
  const grid = document.getElementById('library-grid');
  if (!grid) return;

  const saved = JSON.parse(localStorage.getItem('sf_recordings') || '[]');
  const filtered = saved.filter(r => r.mode === type);

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="lib-empty">
        <div class="empty-icon">🎬</div>
        <p>No ${type === 'teaching' ? 'teaching' : 'story'} recordings yet.<br>Start recording to see them here!</p>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map(r => `
    <div class="recording-card">
      <div class="recording-card-thumb">🎥</div>
      <div class="recording-card-info">
        <div class="recording-card-name">${r.filename}</div>
        <div class="recording-card-meta">${r.date} · ${r.duration}</div>
        <div class="recording-card-actions">
          <button class="recording-card-btn" onclick="window.electronAPI.openInFinder('${r.path}')">Show in Finder</button>
        </div>
      </div>
    </div>`).join('');
}

function logRecording(filename, path, mode, duration) {
  const saved = JSON.parse(localStorage.getItem('sf_recordings') || '[]');
  saved.unshift({
    filename,
    path,
    mode,
    duration: formatDuration(duration),
    date: new Date().toLocaleDateString(),
  });
  localStorage.setItem('sf_recordings', JSON.stringify(saved.slice(0, 100)));
}

// ── Source Picker Modal ────────────────────────────────────────────
async function openSourcePicker(onSelect) {
  openModal('source-modal-backdrop');

  const grid = document.getElementById('source-grid');
  grid.innerHTML = '<div style="color:var(--text-3);padding:20px;text-align:center">Loading sources...</div>';

  const sources = await window.electronAPI.getSources();

  grid.innerHTML = '';
  sources.forEach(src => {
    const item = document.createElement('div');
    item.className = 'source-item';
    item.innerHTML = `
      <img class="source-thumbnail" src="${src.thumbnail}" alt="${src.name}" />
      <div class="source-name">${src.name}</div>`;
    item.addEventListener('click', () => {
      document.querySelectorAll('.source-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      setTimeout(() => {
        closeModal('source-modal-backdrop');
        onSelect(src);
      }, 250);
    });
    grid.appendChild(item);
  });
}

// Wire the close button of source modal
document.getElementById('source-modal-close')?.addEventListener('click', () => {
  closeModal('source-modal-backdrop');
});
