/**
 * StudioFlow — Teaching Mode
 * Screen recording + draggable webcam bubble composite
 */

window.TeachingMode = (() => {
  // State
  let screenStream  = null;
  let cameraStream  = null;
  let compositeStream = null;
  let animFrame     = null;
  let selectedSource = null;
  let mimeType      = 'video/webm';
  let recordedChunks = [];
  let isMirrored    = false;

  // DOM refs (resolved after DOMContentLoaded)
  let canvas, ctx, screenVideo, webcamVideo, bubble;

  function init() {
    canvas      = document.getElementById('teaching-canvas');
    ctx         = canvas.getContext('2d');
    screenVideo = document.createElement('video');
    screenVideo.autoplay = true;
    screenVideo.muted = true;
    webcamVideo = document.getElementById('webcam-video');
    bubble      = document.getElementById('webcam-bubble');

    bindUI();
    makeBubbleDraggable();
    makeBubbleResizable();
    initCameraToggle();
  }

  // ── UI Bindings ──────────────────────────────────────────────────
  function bindUI() {
    // Source picker
    document.getElementById('teaching-source-btn').addEventListener('click', pickSource);
    document.getElementById('teaching-pick-source-cta').addEventListener('click', pickSource);

    // Record controls
    document.getElementById('teaching-rec-btn').addEventListener('click', () => {
      StudioFlow.isRecording ? stopRecording() : startRecording();
    });
    document.getElementById('teaching-pause-btn').addEventListener('click', togglePause);
    document.getElementById('teaching-stop-btn').addEventListener('click', stopRecording);

    // Countdown button
    document.getElementById('teaching-countdown-btn').addEventListener('click', () => {
      const current = StudioFlow.settings.countdown;
      const next = current === 3 ? 5 : current === 5 ? 0 : 3;
      StudioFlow.settings.countdown = next;
      document.getElementById('teaching-countdown-btn').querySelector('.ctrl-label').textContent =
        next > 0 ? `${next}s` : 'No CD';
      showToast('⏱', `Countdown set to ${next > 0 ? next + 's' : 'off'}`);
    });

    // Chapter marker
    document.getElementById('teaching-chapter-btn').addEventListener('click', () => {
      addChapterMarker('chapter-markers-list');
    });

    // Bubble mirror
    document.getElementById('bubble-mirror-btn').addEventListener('click', () => {
      isMirrored = !isMirrored;
      bubble.classList.toggle('mirrored', isMirrored);
    });

    // Bubble hide
    document.getElementById('bubble-hide-btn').addEventListener('click', () => {
      bubble.style.display = 'none';
      document.getElementById('teaching-cam-toggle').checked = false;
    });

    // Mic toggle
    document.getElementById('teaching-mic-toggle').addEventListener('change', (e) => {
      if (cameraStream) {
        cameraStream.getAudioTracks().forEach(t => t.enabled = e.target.checked);
      }
    });
  }

  // ── Camera Toggle ────────────────────────────────────────────────
  function initCameraToggle() {
    const toggle = document.getElementById('teaching-cam-toggle');
    toggle.addEventListener('change', (e) => {
      if (e.target.checked) {
        bubble.style.display = '';
        startCamera();
      } else {
        bubble.style.display = 'none';
        if (cameraStream) {
          cameraStream.getVideoTracks().forEach(t => t.stop());
        }
      }
    });
  }

  // ── Source Picker ────────────────────────────────────────────────
  async function pickSource() {
    openSourcePicker(async (source) => {
      selectedSource = source;
      document.getElementById('teaching-source-name').textContent = source.name;

      // Show canvas, hide empty state
      document.getElementById('teaching-empty').classList.add('hidden');
      document.getElementById('teaching-canvas').classList.remove('hidden');

      // Start screen stream
      await startScreenPreview(source.id);
    });
  }

  async function startScreenPreview(sourceId) {
    // Stop existing screen stream
    if (screenStream) screenStream.getTracks().forEach(t => t.stop());

    try {
      screenStream = await Recorder.getScreenStream(sourceId);
      screenVideo.srcObject = screenStream;
      await screenVideo.play();

      // Set canvas size from video
      screenVideo.onloadedmetadata = () => {
        canvas.width  = screenVideo.videoWidth  || 1280;
        canvas.height = screenVideo.videoHeight || 720;
        startCompositeLoop();
      };
    } catch (err) {
      showToast('❌', `Screen capture failed: ${err.message}`);
    }

    // Start camera
    await startCamera();
  }

  async function startCamera() {
    if (!document.getElementById('teaching-cam-toggle').checked) return;

    try {
      const micOn = document.getElementById('teaching-mic-toggle').checked;
      cameraStream = await Recorder.getCameraStream(true, micOn);
      webcamVideo.srcObject = cameraStream;
      await webcamVideo.play();
      bubble.style.display = '';
    } catch (err) {
      console.warn('Camera not available:', err.message);
      document.getElementById('teaching-cam-toggle').checked = false;
      bubble.style.display = 'none';
    }
  }

  // ── Composite Loop ───────────────────────────────────────────────
  // Draws screen + webcam bubble onto canvas in real-time
  function startCompositeLoop() {
    if (animFrame) cancelAnimationFrame(animFrame);

    function drawFrame() {
      if (!ctx) return;

      const W = canvas.width;
      const H = canvas.height;

      // 1. Draw screen
      if (screenVideo.readyState >= 2) {
        ctx.drawImage(screenVideo, 0, 0, W, H);
      }

      // 2. Draw circular webcam bubble
      const camVisible = document.getElementById('teaching-cam-toggle').checked
        && bubble.style.display !== 'none'
        && webcamVideo.readyState >= 2;

      if (camVisible) {
        const bSize = parseInt(bubble.style.width) || StudioFlow.settings.bubbleSize;

        // Get bubble position relative to canvas
        const canvasRect = canvas.getBoundingClientRect();
        const bubRect  = bubble.getBoundingClientRect();

        // Scale position to canvas coordinates
        const scaleX = W / (canvasRect.width || 1);
        const scaleY = H / (canvasRect.height || 1);

        const bx = (bubRect.left - canvasRect.left + bubRect.width / 2) * scaleX;
        const by = (bubRect.top  - canvasRect.top  + bubRect.height / 2) * scaleY;
        const br = (bubRect.width / 2) * scaleX;

        ctx.save();
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.clip();

        // Mirror if needed
        if (isMirrored) {
          ctx.translate(bx * 2, 0);
          ctx.scale(-1, 1);
        }

        const minDim = Math.min(webcamVideo.videoWidth, webcamVideo.videoHeight);
        const cropX = (webcamVideo.videoWidth - minDim) / 2;
        const cropY = (webcamVideo.videoHeight - minDim) / 2;
        ctx.drawImage(webcamVideo, cropX, cropY, minDim, minDim, bx - br, by - br, br * 2, br * 2);
        ctx.restore();

        // Draw glowing ring around bubble
        ctx.save();
        ctx.beginPath();
        ctx.arc(bx, by, br + 2, 0, Math.PI * 2);
        const ringGrad = ctx.createLinearGradient(bx - br, by, bx + br, by);
        ringGrad.addColorStop(0, '#6366f1');
        ringGrad.addColorStop(1, '#8b5cf6');
        ctx.strokeStyle = StudioFlow.isRecording ? '#ef4444' : ringGrad;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();
      }

      // Draw recording indicator overlay
      if (StudioFlow.isRecording && !StudioFlow.isPaused) {
        ctx.save();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(W - 24, 20, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.fillText('REC', W - 58, 25);
        ctx.restore();
      }

      animFrame = requestAnimationFrame(drawFrame);
    }

    drawFrame();
  }

  // ── Recording ────────────────────────────────────────────────────
  async function startRecording() {
    if (!selectedSource) {
      showToast('⚠️', 'Please select a screen source first');
      return;
    }

    // Countdown
    await runCountdown('countdown-overlay', StudioFlow.settings.countdown);

    // Build composite stream from canvas + audio
    const fps = StudioFlow.settings.fps;
    const canvasStream = canvas.captureStream(fps);

    // Add audio track from camera/mic
    let audioTrack = null;
    if (cameraStream) {
      const audioTracks = cameraStream.getAudioTracks();
      if (audioTracks.length > 0) audioTrack = audioTracks[0];
    }

    const tracks = [...canvasStream.getVideoTracks()];
    if (audioTrack) tracks.push(audioTrack);
    const compositeMediaStream = new MediaStream(tracks);

    recordedChunks = [];
    mimeType = Recorder.start(compositeMediaStream, (chunk) => {
      recordedChunks.push(chunk);
    });

    // Update UI
    setRecordingUI(true);
    startTimer('teaching-timer');
    document.getElementById('teaching-timer').classList.add('recording');
    document.getElementById('teaching-rec-btn').classList.add('recording');
    document.getElementById('teaching-pause-btn').disabled = false;
    document.getElementById('teaching-stop-btn').disabled = false;
    document.getElementById('teaching-chapter-btn').disabled = false;
    bubble.classList.add('recording');

    document.getElementById('teaching-canvas').style.outline = '2px solid #ef4444';
    showToast('🔴', 'Recording started');
  }

  async function stopRecording() {
    if (!StudioFlow.isRecording) return;

    const chunks = await Recorder.stop();
    Recorder.stopAllTracks();

    const duration = StudioFlow.recordingSeconds;
    stopTimer('teaching-timer');
    setRecordingUI(false);

    // Reset UI
    document.getElementById('teaching-timer').classList.remove('recording');
    document.getElementById('teaching-rec-btn').classList.remove('recording');
    document.getElementById('teaching-pause-btn').disabled = true;
    document.getElementById('teaching-stop-btn').disabled = true;
    document.getElementById('teaching-chapter-btn').disabled = true;
    bubble.classList.remove('recording');
    document.getElementById('teaching-canvas').style.outline = '';
    StudioFlow.isPaused = false;
    document.getElementById('teaching-pause-btn').querySelector('.ctrl-label').textContent = 'Pause';

    // Save recording
    const filePath = await saveRecording(chunks, mimeType, 'teaching');
    if (filePath) {
      logRecording(filePath.split('/').pop(), filePath, 'teaching', duration);
    }

    StudioFlow.chapterMarkers = [];
    document.getElementById('chapter-markers-list').innerHTML = '';

    // Re-start screen preview (don't stop streams)
    if (selectedSource) {
      await startScreenPreview(selectedSource.id);
    }
  }

  function togglePause() {
    if (!StudioFlow.isRecording) return;
    StudioFlow.isPaused = !StudioFlow.isPaused;

    if (StudioFlow.isPaused) {
      Recorder.pause();
      document.getElementById('teaching-pause-btn').querySelector('.ctrl-label').textContent = 'Resume';
      document.getElementById('teaching-canvas').style.outline = '2px dashed #f59e0b';
      showToast('⏸', 'Recording paused');
    } else {
      Recorder.resume();
      document.getElementById('teaching-pause-btn').querySelector('.ctrl-label').textContent = 'Pause';
      document.getElementById('teaching-canvas').style.outline = '2px solid #ef4444';
      showToast('▶', 'Recording resumed');
    }
  }

  // ── Draggable Bubble ─────────────────────────────────────────────
  function makeBubbleDraggable() {
    let dragging = false;
    let startX, startY, startLeft, startTop;

    bubble.addEventListener('mousedown', (e) => {
      if (e.target.closest('.bubble-controls, .bubble-resize-handle')) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = bubble.getBoundingClientRect();
      const wrap = document.getElementById('teaching-preview-wrap').getBoundingClientRect();
      startLeft = rect.left - wrap.left;
      startTop  = rect.top  - wrap.top;
      bubble.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const wrap = document.getElementById('teaching-preview-wrap');
      const wrapRect = wrap.getBoundingClientRect();
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const bw = bubble.offsetWidth;
      const bh = bubble.offsetHeight;

      let newLeft = Math.max(0, Math.min(startLeft + dx, wrapRect.width  - bw));
      let newTop  = Math.max(0, Math.min(startTop  + dy, wrapRect.height - bh));

      bubble.style.left   = newLeft + 'px';
      bubble.style.top    = newTop + 'px';
      bubble.style.right  = 'auto';
      bubble.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      dragging = false;
      bubble.style.cursor = 'move';
    });
  }

  // ── Resizable Bubble ─────────────────────────────────────────────
  function makeBubbleResizable() {
    const handle = document.getElementById('bubble-resize');
    if (!handle) return;

    let resizing = false;
    let startX, startY, startSize;

    handle.addEventListener('mousedown', (e) => {
      resizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startSize = bubble.offsetWidth;
      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener('mousemove', (e) => {
      if (!resizing) return;
      const delta = ((e.clientX - startX) + (e.clientY - startY)) / 2;
      const newSize = Math.max(80, Math.min(300, startSize + delta));
      bubble.style.width  = newSize + 'px';
      bubble.style.height = newSize + 'px';
    });

    document.addEventListener('mouseup', () => { resizing = false; });
  }

  function onActivate() {
    // Re-check if camera was running
  }

  return { init, startRecording, stopRecording, onActivate };
})();

// Initialize when DOM ready
document.addEventListener('DOMContentLoaded', () => TeachingMode.init());
