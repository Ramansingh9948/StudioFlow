/**
 * StudioFlow — Canvas Annotation / Drawing Overlay
 * Supports: pen, arrow, rectangle, circle tools with color/size controls
 */

window.Annotator = (() => {
  let canvas, ctx;
  let isDrawing = false;
  let tool = 'pen';
  let color = '#ef4444';
  let lineWidth = 4;
  let startX, startY;
  let snapshot; // for shapes that need live preview
  let active = false;
  let history = []; // for undo

  function init() {
    canvas = document.getElementById('annotation-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    bindToolbar();
    bindCanvas();

    // Resize observer for camera panel
    const panel = document.querySelector('.story-camera-panel');
    if (panel) {
      new ResizeObserver(resizeCanvas).observe(panel);
    }
  }

  function resizeCanvas() {
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const prev = ctx.getImageData(0, 0, canvas.width, canvas.height);
    canvas.width  = parent.clientWidth;
    canvas.height = parent.clientHeight;
    ctx.putImageData(prev, 0, 0);
    applyStyle();
  }

  function applyStyle() {
    ctx.strokeStyle = color;
    ctx.lineWidth   = lineWidth;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
  }

  // ── Toolbar Bindings ─────────────────────────────────────────────
  function bindToolbar() {
    // Tool buttons
    document.querySelectorAll('.draw-tool[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.draw-tool[data-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tool = btn.dataset.tool;
      });
    });

    // Color buttons
    document.querySelectorAll('.color-dot').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.color-dot').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        color = btn.dataset.color;
        applyStyle();
      });
    });

    // Size slider
    const sizeSlider = document.getElementById('draw-size');
    if (sizeSlider) {
      sizeSlider.addEventListener('input', () => {
        lineWidth = parseInt(sizeSlider.value);
        applyStyle();
      });
    }

    // Clear button
    document.getElementById('draw-clear-btn')?.addEventListener('click', clearCanvas);

    // Close button
    document.getElementById('draw-close-btn')?.addEventListener('click', deactivate);
  }

  // ── Canvas Bindings ──────────────────────────────────────────────
  function bindCanvas() {
    if (!canvas) return;

    canvas.addEventListener('mousedown', (e) => {
      if (!active) return;
      isDrawing = true;
      const { x, y } = getPos(e);
      startX = x;
      startY = y;

      if (tool === 'pen') {
        ctx.beginPath();
        ctx.moveTo(x, y);
      } else {
        // For shapes, snapshot the canvas for live preview
        snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!isDrawing || !active) return;
      const { x, y } = getPos(e);
      applyStyle();

      if (tool === 'pen') {
        ctx.lineTo(x, y);
        ctx.stroke();
      } else {
        // Restore snapshot and draw preview shape
        ctx.putImageData(snapshot, 0, 0);
        drawShape(startX, startY, x, y);
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      if (!isDrawing) return;
      isDrawing = false;

      if (tool !== 'pen') {
        const { x, y } = getPos(e);
        ctx.putImageData(snapshot, 0, 0);
        drawShape(startX, startY, x, y);
      }

      // Save to history
      history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    });

    // Touch support
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      canvas.dispatchEvent(new MouseEvent('mousedown', getTouchEvent(e)));
    });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      canvas.dispatchEvent(new MouseEvent('mousemove', getTouchEvent(e)));
    });
    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      canvas.dispatchEvent(new MouseEvent('mouseup', getTouchEvent(e)));
    });
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top)  * (canvas.height / rect.height),
    };
  }

  function getTouchEvent(e) {
    const touch = e.touches[0] || e.changedTouches[0];
    return { clientX: touch.clientX, clientY: touch.clientY };
  }

  function drawShape(x1, y1, x2, y2) {
    applyStyle();
    ctx.beginPath();

    switch (tool) {
      case 'rect':
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        break;
      case 'circle': {
        const rx = (x2 - x1) / 2;
        const ry = (y2 - y1) / 2;
        ctx.ellipse(x1 + rx, y1 + ry, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'arrow': {
        const headLen = 20;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(
          x2 - headLen * Math.cos(angle - Math.PI / 6),
          y2 - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - headLen * Math.cos(angle + Math.PI / 6),
          y2 - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
        break;
      }
    }
  }

  function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    history = [];
    snapshot = null;
  }

  function activate() {
    active = true;
    canvas.classList.remove('hidden');
    document.getElementById('draw-toolbar').classList.remove('hidden');
    resizeCanvas();
    applyStyle();
    document.getElementById('story-draw-btn').classList.add('active');
  }

  function deactivate() {
    active = false;
    canvas.classList.add('hidden');
    document.getElementById('draw-toolbar').classList.add('hidden');
    document.getElementById('story-draw-btn').classList.remove('active');
  }

  function toggle() {
    active ? deactivate() : activate();
  }

  return { init, activate, deactivate, toggle, clearCanvas };
})();

document.addEventListener('DOMContentLoaded', () => Annotator.init());
