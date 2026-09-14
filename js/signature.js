'use strict';
// Signature pad on the Report tab. Draw, trim, save as PNG data URL in the
// settings store (key 'signature'). Ported from initSignaturePad/trimCanvas.
const Signature = {
  KEY: 'signature',

  get() { return Data.getSetting(this.KEY, '') || ''; },

  init() {
    const canvas = document.getElementById('sig-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let drawing = false, lastX = 0, lastY = 0;

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      if (e.touches) {
        return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
      }
      return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    }
    function startDraw(e) { e.preventDefault(); drawing = true; const p = getPos(e); lastX = p.x; lastY = p.y; }
    function draw(e) {
      if (!drawing) return;
      e.preventDefault();
      const p = getPos(e);
      ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.stroke();
      lastX = p.x; lastY = p.y;
    }
    function stopDraw() { drawing = false; }

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseleave', stopDraw);
    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDraw);

    document.getElementById('btn-sig-clear').addEventListener('click', () => this.clear());
    document.getElementById('btn-sig-save').addEventListener('click', () => this.save());
    this.showPreview();
  },

  showPreview() {
    const saved = this.get();
    const wrap = document.getElementById('sig-preview-wrap');
    const status = document.getElementById('sig-status');
    if (saved) {
      document.getElementById('sig-preview').src = saved;
      wrap.hidden = false;
      status.textContent = 'Signature saved';
      status.style.color = 'var(--green)';
    } else {
      wrap.hidden = true;
      status.textContent = 'No signature saved';
      status.style.color = '';
    }
  },

  clear() {
    const canvas = document.getElementById('sig-canvas');
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  },

  async save() {
    const canvas = document.getElementById('sig-canvas');
    const ctx = canvas.getContext('2d');
    const status = document.getElementById('sig-status');
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let hasContent = false;
    for (let i = 3; i < pixels.length; i += 4) { if (pixels[i] > 0) { hasContent = true; break; } }
    if (!hasContent) {
      status.textContent = 'Please draw your signature first';
      status.style.color = 'var(--red)';
      return;
    }
    const dataUrl = this.trimCanvas(canvas).toDataURL('image/png');
    try {
      await Data.setSetting(this.KEY, dataUrl);
      this.showPreview();
    } catch (e) {
      status.textContent = 'Error saving signature: ' + e.message;
      status.style.color = 'var(--red)';
    }
  },

  trimCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let top = canvas.height, left = canvas.width, right = 0, bottom = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (d[i + 3] > 0) {
          if (y < top) top = y;
          if (y > bottom) bottom = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }
    const pad = 4;
    top = Math.max(0, top - pad);
    left = Math.max(0, left - pad);
    right = Math.min(canvas.width - 1, right + pad);
    bottom = Math.min(canvas.height - 1, bottom + pad);
    const w = right - left + 1, h = bottom - top + 1;
    const trimmed = document.createElement('canvas');
    trimmed.width = w; trimmed.height = h;
    trimmed.getContext('2d').drawImage(canvas, left, top, w, h, 0, 0, w, h);
    return trimmed;
  }
};
