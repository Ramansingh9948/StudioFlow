/**
 * StudioFlow — Storytelling Mode
 * Camera-primary recording with: video player, document projector,
 * virtual backgrounds, teleprompter, drawing, background music,
 * countdown, chapter markers.
 */

window.StorytellingMode = (() => {
  let cameraStream = null;
  let mimeType = 'video/webm';
  let recordedChunks = [];

  // PDF.js state
  let pdfDoc = null;
  let pdfPage = 1;

  // Video player state
  let contentVideoLoaded = false;

  // Background music
  let bgAudio = null;

  // Virtual background
  let currentBg = 'none';

  function init() {
    bindUI();
    initPanelTabs();
    initVideoPlayer();
    initDocProjector();
    initVirtualBackground();
    initBackgroundMusic();
    initCountdownButtons();
  }

  // ── UI Bindings ──────────────────────────────────────────────────
  function bindUI() {
    // Record controls
    document.getElementById('story-rec-btn').addEventListener('click', () => {
      StudioFlow.isRecording ? stopRecording() : startRecording();
    });
    document.getElementById('story-pause-btn').addEventListener('click', togglePause);
    document.getElementById('story-stop-btn').addEventListener('click', stopRecording);

    // Chapter marker
    document.getElementById('story-marker-btn').addEventListener('click', () => {
      addChapterMarker('chapter-markers-list');
    });

    // Toolbar buttons
    document.getElementById('story-draw-btn').addEventListener('click', () => Annotator.toggle());
    document.getElementById('story-teleprompter-btn').addEventListener('click', () => Teleprompter.toggle());
    document.getElementById('story-blur-btn').addEventListener('click', () => openModal('bg-modal-backdrop'));
    document.getElementById('story-music-btn').addEventListener('click', () => openModal('music-modal-backdrop'));

    // Background modal
    document.getElementById('apply-bg-btn').addEventListener('click', applySelectedBackground);
    document.querySelectorAll('.bg-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.bg-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
      });
    });

    // Close buttons for modals
    document.getElementById('bg-modal-close')?.addEventListener('click', () => closeModal('bg-modal-backdrop'));
    document.getElementById('music-modal-close')?.addEventListener('click', () => closeModal('music-modal-backdrop'));
  }

  // ── Camera Setup ─────────────────────────────────────────────────
  async function startCamera() {
    const videoEl = document.getElementById('story-camera-video');
    const panel   = document.getElementById('story-camera-panel');

    try {
      cameraStream = await Recorder.getCameraStream(true, true);
      videoEl.srcObject = cameraStream;
      await videoEl.play();
      panel.classList.remove('no-camera');
    } catch (err) {
      console.warn('Camera unavailable:', err.message);
      panel.classList.add('no-camera');
      showToast('⚠️', 'Camera unavailable — check permissions');
    }
  }

  // ── Panel Tabs ────────────────────────────────────────────────────
  function initPanelTabs() {
    document.querySelectorAll('.panel-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const panelId = tab.dataset.panel;

        // Update tabs
        document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Update sub-panels
        document.querySelectorAll('.content-subpanel').forEach(p => p.classList.remove('active'));
        document.getElementById(`panel-${panelId}`)?.classList.add('active');
      });
    });
  }

  // ── Video Player Panel ────────────────────────────────────────────
  function initVideoPlayer() {
    document.getElementById('load-video-btn').addEventListener('click', loadVideo);
    document.getElementById('change-video-btn')?.addEventListener('click', loadVideo);

    const videoEl  = document.getElementById('content-video');
    const playBtn  = document.getElementById('video-play-pause');
    const progress = document.getElementById('video-progress');
    const fill     = document.getElementById('video-progress-fill');
    const timeEl   = document.getElementById('video-time-display');

    playBtn?.addEventListener('click', () => {
      if (videoEl.paused) {
        videoEl.play();
        playBtn.textContent = '⏸';
      } else {
        videoEl.pause();
        playBtn.textContent = '▶';
      }
    });

    videoEl?.addEventListener('timeupdate', () => {
      if (!videoEl.duration) return;
      const pct = (videoEl.currentTime / videoEl.duration) * 100;
      if (fill) fill.style.width = pct + '%';
      if (timeEl) timeEl.textContent = formatVideoTime(videoEl.currentTime);
    });

    progress?.addEventListener('click', (e) => {
      if (!videoEl.duration) return;
      const rect = progress.getBoundingClientRect();
      const pct  = (e.clientX - rect.left) / rect.width;
      videoEl.currentTime = pct * videoEl.duration;
    });

    videoEl?.addEventListener('ended', () => {
      if (playBtn) playBtn.textContent = '▶';
    });
  }

  async function loadVideo() {
    const path = await window.electronAPI.openFile({
      title: 'Select Video',
      filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'webm', 'avi', 'm4v'] }],
    });
    if (!path) return;

    const dataUrl = await window.electronAPI.readFileAsBase64(path);
    if (!dataUrl) {
      showToast('❌', 'Could not load video');
      return;
    }

    const videoEl = document.getElementById('content-video');
    videoEl.src = dataUrl;
    videoEl.classList.remove('hidden');
    document.getElementById('video-empty').classList.add('hidden');
    document.getElementById('video-panel-controls').classList.remove('hidden');
    document.getElementById('video-play-pause').textContent = '▶';
    contentVideoLoaded = true;
    showToast('🎬', 'Video loaded');
  }

  function formatVideoTime(secs) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // ── Document Projector Panel ──────────────────────────────────────
  function initDocProjector() {
    document.getElementById('load-doc-btn').addEventListener('click', loadDocument);
    document.getElementById('change-doc-btn')?.addEventListener('click', loadDocument);
    document.getElementById('doc-prev-btn')?.addEventListener('click', () => navigatePdf(-1));
    document.getElementById('doc-next-btn')?.addEventListener('click', () => navigatePdf(1));
  }

  async function loadDocument() {
    const path = await window.electronAPI.openFile({
      title: 'Select Document or Image',
      filters: [
        { name: 'Documents & Images', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp'] },
      ],
    });
    if (!path) return;

    const ext = path.split('.').pop().toLowerCase();
    const dataUrl = await window.electronAPI.readFileAsBase64(path);
    if (!dataUrl) {
      showToast('❌', 'Could not load document');
      return;
    }

    document.getElementById('doc-empty').classList.add('hidden');
    document.getElementById('doc-viewer').classList.remove('hidden');
    document.getElementById('doc-controls').classList.remove('hidden');

    if (ext === 'pdf') {
      await loadPdf(dataUrl);
    } else {
      loadImage(dataUrl);
    }
  }

  async function loadPdf(dataUrl) {
    try {
      // Dynamically load PDF.js if not already loaded
      if (!window.pdfjsLib) {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }

      // Convert data URL to ArrayBuffer
      const base64 = dataUrl.split(',')[1];
      const binary  = atob(base64);
      const bytes   = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
      pdfPage = 1;

      document.getElementById('img-viewer').classList.add('hidden');
      await renderPdfPage();

      showToast('📄', `PDF loaded — ${pdfDoc.numPages} pages`);
    } catch (err) {
      showToast('❌', `PDF load failed: ${err.message}`);
    }
  }

  async function renderPdfPage() {
    if (!pdfDoc) return;
    const page    = await pdfDoc.getPage(pdfPage);
    const pdfCanvas = document.getElementById('pdf-canvas');
    const container = document.getElementById('doc-viewer');

    const viewport = page.getViewport({ scale: container.clientWidth / page.getViewport({ scale: 1 }).width });
    pdfCanvas.width  = viewport.width;
    pdfCanvas.height = viewport.height;
    pdfCanvas.classList.remove('hidden');

    await page.render({ canvasContext: pdfCanvas.getContext('2d'), viewport }).promise;

    document.getElementById('doc-page-info').textContent = `${pdfPage} / ${pdfDoc.numPages}`;
  }

  async function navigatePdf(delta) {
    if (!pdfDoc) return;
    const newPage = pdfPage + delta;
    if (newPage < 1 || newPage > pdfDoc.numPages) return;
    pdfPage = newPage;
    await renderPdfPage();
  }

  function loadImage(dataUrl) {
    pdfDoc = null;
    const img = document.getElementById('img-viewer');
    const pdfCanvas = document.getElementById('pdf-canvas');
    pdfCanvas.classList.add('hidden');
    img.src = dataUrl;
    img.classList.remove('hidden');
    document.getElementById('doc-page-info').textContent = '1 / 1';
    showToast('🖼', 'Image loaded');
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // ── Virtual Background ────────────────────────────────────────────
  function initVirtualBackground() {}

  function applySelectedBackground() {
    const selected = document.querySelector('.bg-option.active');
    const bg = selected ? selected.dataset.bg : 'none';
    currentBg = bg;

    const videoEl = document.getElementById('story-camera-video');
    videoEl.className = ''; // reset classes
    if (bg === 'blur')     videoEl.classList.add('bg-blur');
    if (bg === 'dark')     videoEl.classList.add('bg-dark');
    if (bg === 'gradient') videoEl.classList.add('bg-gradient');

    document.getElementById('story-blur-btn').classList.toggle('active', bg !== 'none');
    closeModal('bg-modal-backdrop');
    showToast('🌅', `Background: ${bg}`);
  }

  // ── Background Music ──────────────────────────────────────────────
  function initBackgroundMusic() {
    document.getElementById('load-music-btn')?.addEventListener('click', loadMusic);
    document.getElementById('change-music-btn')?.addEventListener('click', loadMusic);

    document.getElementById('music-play-btn')?.addEventListener('click', () => {
      bgAudio = document.getElementById('bg-audio');
      if (bgAudio.paused) {
        bgAudio.play();
        document.getElementById('music-play-btn').textContent = '⏸';
      } else {
        bgAudio.pause();
        document.getElementById('music-play-btn').textContent = '▶';
      }
    });

    document.getElementById('music-stop-btn')?.addEventListener('click', () => {
      bgAudio = document.getElementById('bg-audio');
      bgAudio.pause();
      bgAudio.currentTime = 0;
      document.getElementById('music-play-btn').textContent = '▶';
    });

    document.getElementById('music-vol')?.addEventListener('input', (e) => {
      bgAudio = document.getElementById('bg-audio');
      bgAudio.volume = parseInt(e.target.value) / 100;
    });
  }

  async function loadMusic() {
    const path = await window.electronAPI.openFile({
      title: 'Select Audio File',
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] }],
    });
    if (!path) return;

    const dataUrl = await window.electronAPI.readFileAsBase64(path);
    if (!dataUrl) {
      showToast('❌', 'Could not load audio');
      return;
    }

    bgAudio = document.getElementById('bg-audio');
    bgAudio.src = dataUrl;
    bgAudio.volume = 0.3;

    const name = path.split('/').pop();
    document.getElementById('music-track-name').textContent = name;
    document.getElementById('music-empty').classList.add('hidden');
    document.getElementById('music-controls').classList.remove('hidden');
    document.getElementById('story-music-btn').classList.add('active');
    showToast('🎵', `Loaded: ${name}`);
  }

  // ── Countdown ─────────────────────────────────────────────────────
  function initCountdownButtons() {
    document.getElementById('story-countdown-btn')?.addEventListener('click', () => {
      const current = StudioFlow.settings.countdown;
      const next = current === 3 ? 5 : current === 5 ? 0 : 3;
      StudioFlow.settings.countdown = next;
      document.getElementById('story-countdown-btn').querySelector('.ctrl-label').textContent =
        next > 0 ? `${next}s` : 'No CD';
      showToast('⏱', `Countdown: ${next > 0 ? next + 's' : 'off'}`);
    });
  }

  // ── Recording ─────────────────────────────────────────────────────
  async function startRecording() {
    if (!cameraStream) {
      await startCamera();
      if (!cameraStream) {
        showToast('❌', 'Camera required for Storytelling mode');
        return;
      }
    }

    // Countdown
    await runCountdown('countdown-overlay', StudioFlow.settings.countdown);

    recordedChunks = [];
    mimeType = Recorder.start(cameraStream, (chunk) => {
      recordedChunks.push(chunk);
    });

    // Update UI
    setRecordingUI(true);
    startTimer('story-timer');
    document.getElementById('story-timer').classList.add('recording');
    document.getElementById('story-rec-btn').classList.add('recording');
    document.getElementById('story-pause-btn').disabled = false;
    document.getElementById('story-stop-btn').disabled = false;
    document.getElementById('story-marker-btn').disabled = false;
    document.getElementById('story-camera-panel').classList.add('recording');

    showToast('🔴', 'Storytelling recording started');
  }

  async function stopRecording() {
    if (!StudioFlow.isRecording) return;

    const chunks = await Recorder.stop();
    const duration = StudioFlow.recordingSeconds;
    stopTimer('story-timer');
    setRecordingUI(false);

    // Reset UI
    document.getElementById('story-timer').classList.remove('recording');
    document.getElementById('story-rec-btn').classList.remove('recording');
    document.getElementById('story-pause-btn').disabled = true;
    document.getElementById('story-stop-btn').disabled = true;
    document.getElementById('story-marker-btn').disabled = true;
    document.getElementById('story-camera-panel').classList.remove('recording');
    StudioFlow.isPaused = false;
    document.getElementById('story-pause-btn').querySelector('.ctrl-label').textContent = 'Pause';

    // Save
    const filePath = await saveRecording(chunks, mimeType, 'stories');
    if (filePath) {
      logRecording(filePath.split('/').pop(), filePath, 'stories', duration);
    }

    StudioFlow.chapterMarkers = [];

    // Restart camera (don't stop tracks, just re-use stream)
    const videoEl = document.getElementById('story-camera-video');
    if (cameraStream && videoEl.paused) videoEl.play();
  }

  function togglePause() {
    if (!StudioFlow.isRecording) return;
    StudioFlow.isPaused = !StudioFlow.isPaused;

    if (StudioFlow.isPaused) {
      Recorder.pause();
      document.getElementById('story-pause-btn').querySelector('.ctrl-label').textContent = 'Resume';
      showToast('⏸', 'Recording paused');
    } else {
      Recorder.resume();
      document.getElementById('story-pause-btn').querySelector('.ctrl-label').textContent = 'Pause';
      showToast('▶', 'Recording resumed');
    }
  }

  // Called when switching to storytelling mode
  async function onActivate() {
    if (!cameraStream) {
      await startCamera();
    }
  }

  return { init, startRecording, stopRecording, onActivate };
})();

document.addEventListener('DOMContentLoaded', () => StorytellingMode.init());
