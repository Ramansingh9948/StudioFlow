/**
 * StudioFlow — Teleprompter
 * Auto-scrolling script overlay with speed control
 */

window.Teleprompter = (() => {
  let scrollInterval = null;
  let isRunning = false;
  let speed = 3; // pixels per step
  let script = '';
  let scrollY = 0;

  function init() {
    // Teleprompter button in storytelling toolbar
    document.getElementById('story-teleprompter-btn')?.addEventListener('click', show);

    // Teleprompter overlay controls
    document.getElementById('tp-play-btn')?.addEventListener('click', togglePlay);
    document.getElementById('tp-close-btn')?.addEventListener('click', hide);
    document.getElementById('tp-edit-btn')?.addEventListener('click', openEditor);

    // Speed slider
    document.getElementById('tp-speed')?.addEventListener('input', (e) => {
      speed = parseInt(e.target.value);
    });

    // Editor modal
    document.getElementById('tp-save-btn')?.addEventListener('click', saveScript);
    document.getElementById('tp-modal-close')?.addEventListener('click', closeEditor);
  }

  function show() {
    const overlay = document.getElementById('teleprompter-overlay');
    if (!overlay) return;

    overlay.classList.remove('hidden');
    document.getElementById('story-teleprompter-btn').classList.add('active');

    if (!script) {
      openEditor();
    }
  }

  function hide() {
    const overlay = document.getElementById('teleprompter-overlay');
    if (overlay) overlay.classList.add('hidden');
    document.getElementById('story-teleprompter-btn').classList.remove('active');
    stopScroll();
  }

  function togglePlay() {
    isRunning ? stopScroll() : startScroll();
  }

  function startScroll() {
    isRunning = true;
    const btn = document.getElementById('tp-play-btn');
    if (btn) btn.textContent = '⏸';

    const textEl = document.getElementById('teleprompter-text');
    if (!textEl) return;

    scrollInterval = setInterval(() => {
      scrollY += speed * 0.5;
      textEl.style.transform = `translateY(-${scrollY}px)`;

      // Auto-stop at end
      const maxScroll = textEl.scrollHeight;
      if (scrollY >= maxScroll) {
        stopScroll();
        scrollY = 0;
        textEl.style.transform = 'translateY(0)';
      }
    }, 50);
  }

  function stopScroll() {
    isRunning = false;
    clearInterval(scrollInterval);
    scrollInterval = null;
    const btn = document.getElementById('tp-play-btn');
    if (btn) btn.textContent = '▶';
  }

  function openEditor() {
    const input = document.getElementById('tp-script-input');
    if (input) input.value = script;
    openModal('tp-modal-backdrop');
  }

  function closeEditor() {
    closeModal('tp-modal-backdrop');
  }

  function saveScript() {
    const input = document.getElementById('tp-script-input');
    if (!input) return;
    script = input.value.trim();

    const textEl = document.getElementById('teleprompter-text');
    if (textEl) {
      textEl.textContent = script || 'Start typing your script here...';
    }

    scrollY = 0;
    if (textEl) textEl.style.transform = 'translateY(0)';

    closeEditor();

    if (script) {
      show();
      showToast('📝', 'Teleprompter script saved');
    }
  }

  function reset() {
    stopScroll();
    scrollY = 0;
    const textEl = document.getElementById('teleprompter-text');
    if (textEl) textEl.style.transform = 'translateY(0)';
  }

  return { init, show, hide, toggle: () => {
    const overlay = document.getElementById('teleprompter-overlay');
    overlay?.classList.contains('hidden') ? show() : hide();
  }};
})();

document.addEventListener('DOMContentLoaded', () => Teleprompter.init());
