/**
 * Mentorae Avatar Cropper & Alignment Utility
 * Provides interactive circular cropping, zooming, panning, and rotation
 * for profile photos, exporting high-res images and saving to /api/auth/profile.
 */

(function (global) {
  'use strict';

  // Inject CSS styles for the cropper modal if not already present
  function ensureStyles() {
    if (document.getElementById('avatar-cropper-styles')) return;
    const style = document.createElement('style');
    style.id = 'avatar-cropper-styles';
    style.textContent = `
      .cropper-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.75);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10500;
        padding: 1rem;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
      }
      .cropper-modal-backdrop.active {
        opacity: 1;
        pointer-events: auto;
      }
      .cropper-dialog-card {
        background: #ffffff;
        border-radius: 20px;
        box-shadow: 0 20px 45px rgba(0, 0, 0, 0.25);
        max-width: 440px;
        width: 100%;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        animation: cropperSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes cropperSlideUp {
        from { transform: translateY(20px) scale(0.96); opacity: 0; }
        to { transform: translateY(0) scale(1); opacity: 1; }
      }
      .cropper-header {
        padding: 1.25rem 1.5rem 0.75rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid #f1f5f9;
      }
      .cropper-header h3 {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 700;
        color: #1e293b;
      }
      .cropper-close-btn {
        border: none;
        background: transparent;
        font-size: 1.3rem;
        color: #64748b;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 8px;
        line-height: 1;
        transition: all 0.15s;
      }
      .cropper-close-btn:hover {
        background: #f1f5f9;
        color: #0f172a;
      }
      .cropper-body {
        padding: 1.25rem 1.5rem;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .cropper-hint {
        font-size: 0.82rem;
        color: #64748b;
        margin-bottom: 1rem;
        text-align: center;
      }
      .cropper-canvas-wrap {
        position: relative;
        width: 320px;
        height: 320px;
        max-width: 100%;
        border-radius: 16px;
        background: #0f172a;
        overflow: hidden;
        cursor: grab;
        box-shadow: inset 0 2px 8px rgba(0,0,0,0.4);
        touch-action: none;
      }
      .cropper-canvas-wrap:active {
        cursor: grabbing;
      }
      #avatarCropperCanvas {
        display: block;
        width: 100%;
        height: 100%;
      }
      .cropper-controls {
        width: 100%;
        margin-top: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .cropper-zoom-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        width: 100%;
      }
      .cropper-zoom-btn {
        background: #f1f5f9;
        border: 1px solid #e2e8f0;
        color: #334155;
        border-radius: 8px;
        width: 34px;
        height: 34px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 1rem;
        transition: all 0.15s;
        flex-shrink: 0;
      }
      .cropper-zoom-btn:hover {
        background: #e2e8f0;
        color: #0f172a;
      }
      .cropper-zoom-slider {
        flex-grow: 1;
        accent-color: #0a5c2c;
        cursor: pointer;
      }
      .cropper-actions-row {
        display: flex;
        justify-content: center;
        gap: 0.5rem;
      }
      .cropper-tool-btn {
        border: 1px solid #e2e8f0;
        background: #ffffff;
        color: #475569;
        font-size: 0.8rem;
        font-weight: 600;
        padding: 0.4rem 0.85rem;
        border-radius: 8px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        transition: all 0.15s;
      }
      .cropper-tool-btn:hover {
        background: #f8fafc;
        color: #0f172a;
        border-color: #cbd5e1;
      }
      .cropper-footer {
        padding: 1rem 1.5rem 1.25rem;
        background: #f8fafc;
        border-top: 1px solid #f1f5f9;
        display: flex;
        justify-content: flex-end;
        gap: 0.75rem;
      }
      .cropper-btn-cancel {
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #475569;
        font-weight: 600;
        font-size: 0.9rem;
        padding: 0.55rem 1.2rem;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.15s;
      }
      .cropper-btn-cancel:hover {
        background: #f1f5f9;
        color: #1e293b;
      }
      .cropper-btn-save {
        border: none;
        background: #0a5c2c;
        color: #ffffff;
        font-weight: 600;
        font-size: 0.9rem;
        padding: 0.55rem 1.4rem;
        border-radius: 10px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        box-shadow: 0 4px 12px rgba(10, 92, 44, 0.25);
        transition: all 0.15s;
      }
      .cropper-btn-save:hover {
        background: #084923;
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(10, 92, 44, 0.35);
      }
      .cropper-btn-save:disabled {
        opacity: 0.65;
        cursor: not-allowed;
        transform: none;
      }
      .cropper-toast-notification {
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: #0a5c2c;
        color: #ffffff;
        padding: 12px 20px;
        border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        display: flex;
        align-items: center;
        gap: 10px;
        font-weight: 600;
        font-size: 0.9rem;
        z-index: 10600;
        animation: cropperToastIn 0.3s ease;
      }
      @keyframes cropperToastIn {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  // Create or return the modal DOM structure
  function getCropperModal() {
    ensureStyles();
    let modal = document.getElementById('avatarCropperModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'avatarCropperModal';
      modal.className = 'cropper-modal-backdrop';
      modal.innerHTML = `
        <div class="cropper-dialog-card" role="dialog" aria-modal="true" aria-labelledby="cropperTitle">
          <div class="cropper-header">
            <h3 id="cropperTitle"><i class="bi bi-crop me-2"></i>Adjust Profile Photo</h3>
            <button type="button" class="cropper-close-btn" id="cropperCloseBtn" aria-label="Close">&times;</button>
          </div>
          <div class="cropper-body">
            <div class="cropper-hint">
              <i class="bi bi-arrows-move me-1"></i> Drag to position photo &bull; Use slider to zoom
            </div>
            <div class="cropper-canvas-wrap" id="cropperWrap">
              <canvas id="avatarCropperCanvas" width="320" height="320"></canvas>
            </div>
            <div class="cropper-controls">
              <div class="cropper-zoom-row">
                <button type="button" class="cropper-zoom-btn" id="cropperZoomOutBtn" title="Zoom Out"><i class="bi bi-dash"></i></button>
                <input type="range" class="cropper-zoom-slider" id="cropperZoomSlider" min="0.5" max="3.0" step="0.01" value="1.0">
                <button type="button" class="cropper-zoom-btn" id="cropperZoomInBtn" title="Zoom In"><i class="bi bi-plus"></i></button>
              </div>
              <div class="cropper-actions-row">
                <button type="button" class="cropper-tool-btn" id="cropperRotateBtn" title="Rotate 90 degrees">
                  <i class="bi bi-arrow-clockwise"></i> Rotate 90°
                </button>
                <button type="button" class="cropper-tool-btn" id="cropperResetBtn" title="Reset alignment">
                  <i class="bi bi-arrow-counterclockwise"></i> Center & Reset
                </button>
              </div>
            </div>
          </div>
          <div class="cropper-footer">
            <button type="button" class="cropper-btn-cancel" id="cropperCancelBtn">Cancel</button>
            <button type="button" class="cropper-btn-save" id="cropperSaveBtn">
              <i class="bi bi-check2-circle"></i> Save & Set Photo
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }
    return modal;
  }

  function showToast(message, iconClass = 'bi-check-circle-fill') {
    const toast = document.createElement('div');
    toast.className = 'cropper-toast-notification';
    toast.innerHTML = `<i class="bi ${iconClass}"></i> <span>${message}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(15px)';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  /**
   * Main Cropper Class
   */
  class AvatarCropper {
    constructor() {
      this.modal = getCropperModal();
      this.canvas = document.getElementById('avatarCropperCanvas');
      this.ctx = this.canvas.getContext('2d');
      this.wrap = document.getElementById('cropperWrap');
      this.zoomSlider = document.getElementById('cropperZoomSlider');
      this.zoomInBtn = document.getElementById('cropperZoomInBtn');
      this.zoomOutBtn = document.getElementById('cropperZoomOutBtn');
      this.rotateBtn = document.getElementById('cropperRotateBtn');
      this.resetBtn = document.getElementById('cropperResetBtn');
      this.closeBtn = document.getElementById('cropperCloseBtn');
      this.cancelBtn = document.getElementById('cropperCancelBtn');
      this.saveBtn = document.getElementById('cropperSaveBtn');

      this.VIEW_SIZE = 320;
      this.APERTURE_RADIUS = 115; // 230px circle diameter
      this.APERTURE_CENTER = this.VIEW_SIZE / 2; // 160

      this.img = null;
      this.scale = 1.0;
      this.minScale = 0.5;
      this.maxScale = 3.5;
      this.offsetX = 0;
      this.offsetY = 0;
      this.rotation = 0; // in degrees
      this.isDragging = false;
      this.dragStartX = 0;
      this.dragStartY = 0;

      this.token = null;
      this.onSuccess = null;

      this.bindEvents();
    }

    bindEvents() {
      // Close & Cancel
      const close = () => this.hide();
      this.closeBtn.addEventListener('click', close);
      this.cancelBtn.addEventListener('click', close);
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) close();
      });

      // Dragging (Mouse)
      this.wrap.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.isDragging = true;
        this.dragStartX = e.clientX - this.offsetX;
        this.dragStartY = e.clientY - this.offsetY;
      });

      window.addEventListener('mousemove', (e) => {
        if (!this.isDragging) return;
        this.offsetX = e.clientX - this.dragStartX;
        this.offsetY = e.clientY - this.dragStartY;
        this.draw();
      });

      window.addEventListener('mouseup', () => {
        this.isDragging = false;
      });

      // Dragging (Touch)
      this.wrap.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          this.isDragging = true;
          this.dragStartX = e.touches[0].clientX - this.offsetX;
          this.dragStartY = e.touches[0].clientY - this.offsetY;
        }
      }, { passive: true });

      window.addEventListener('touchmove', (e) => {
        if (!this.isDragging || e.touches.length !== 1) return;
        this.offsetX = e.touches[0].clientX - this.dragStartX;
        this.offsetY = e.touches[0].clientY - this.dragStartY;
        this.draw();
      }, { passive: true });

      window.addEventListener('touchend', () => {
        this.isDragging = false;
      });

      // Mouse Wheel Zoom
      this.wrap.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.08 : -0.08;
        this.setZoom(this.scale + delta);
      }, { passive: false });

      // Slider Zoom
      this.zoomSlider.addEventListener('input', () => {
        this.scale = parseFloat(this.zoomSlider.value);
        this.draw();
      });

      // Zoom Buttons
      this.zoomInBtn.addEventListener('click', () => this.setZoom(this.scale + 0.15));
      this.zoomOutBtn.addEventListener('click', () => this.setZoom(this.scale - 0.15));

      // Rotate
      this.rotateBtn.addEventListener('click', () => {
        this.rotation = (this.rotation + 90) % 360;
        this.draw();
      });

      // Reset
      this.resetBtn.addEventListener('click', () => this.resetTransform());

      // Save
      this.saveBtn.addEventListener('click', () => this.saveCroppedImage());

      // Escape key to close
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.modal.classList.contains('active')) {
          this.hide();
        }
      });
    }

    setZoom(newZoom) {
      this.scale = Math.max(this.minScale, Math.min(this.maxScale, newZoom));
      this.zoomSlider.value = this.scale.toFixed(2);
      this.draw();
    }

    resetTransform() {
      if (!this.img) return;
      this.offsetX = 0;
      this.offsetY = 0;
      this.rotation = 0;

      // Fit the image so the smaller dimension covers the aperture diameter (2 * radius)
      const apertureDiameter = this.APERTURE_RADIUS * 2;
      const fitScale = Math.max(
        apertureDiameter / this.img.naturalWidth,
        apertureDiameter / this.img.naturalHeight
      );
      this.minScale = fitScale * 0.7;
      this.maxScale = fitScale * 4.0;
      this.zoomSlider.min = this.minScale.toFixed(2);
      this.zoomSlider.max = this.maxScale.toFixed(2);
      this.scale = fitScale * 1.05; // slightly larger than snug fit
      this.zoomSlider.value = this.scale.toFixed(2);

      this.draw();
    }

    open({ file, imageUrl, token, uploadEndpoint, customUpload, onSuccess }) {
      this.token = token;
      this.uploadEndpoint = uploadEndpoint;
      this.customUpload = customUpload;
      this.onSuccess = onSuccess;

      const loadFromSrc = (src) => {
        const image = new Image();
        image.onload = () => {
          this.img = image;
          this.resetTransform();
          this.show();
        };
        image.onerror = () => {
          alert('Could not load image. Please select another file.');
        };
        image.src = src;
      };

      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => loadFromSrc(e.target.result);
        reader.readAsDataURL(file);
      } else if (imageUrl) {
        loadFromSrc(imageUrl);
      }
    }

    show() {
      this.modal.classList.add('active');
      this.saveBtn.disabled = false;
      this.saveBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Save & Set Photo';
      this.draw();
    }

    hide() {
      this.modal.classList.remove('active');
    }

    draw() {
      if (!this.img) return;
      const { ctx, VIEW_SIZE, APERTURE_CENTER, APERTURE_RADIUS } = this;

      // Clear viewport
      ctx.clearRect(0, 0, VIEW_SIZE, VIEW_SIZE);

      // Background fill
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, VIEW_SIZE, VIEW_SIZE);

      // 1. Draw transformed image
      ctx.save();
      ctx.translate(APERTURE_CENTER + this.offsetX, APERTURE_CENTER + this.offsetY);
      ctx.rotate((this.rotation * Math.PI) / 180);
      ctx.scale(this.scale, this.scale);
      ctx.drawImage(
        this.img,
        -this.img.naturalWidth / 2,
        -this.img.naturalHeight / 2,
        this.img.naturalWidth,
        this.img.naturalHeight
      );
      ctx.restore();

      // 2. Draw circular aperture mask
      // Semi-transparent overlay outside the circle
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, VIEW_SIZE, VIEW_SIZE);
      ctx.arc(APERTURE_CENTER, APERTURE_CENTER, APERTURE_RADIUS, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
      ctx.fill();
      ctx.restore();

      // 3. Subtle inner grid lines inside the circle for face alignment
      ctx.save();
      ctx.beginPath();
      ctx.arc(APERTURE_CENTER, APERTURE_CENTER, APERTURE_RADIUS, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      // Vertical third lines
      ctx.beginPath();
      ctx.moveTo(APERTURE_CENTER - APERTURE_RADIUS / 3, APERTURE_CENTER - APERTURE_RADIUS);
      ctx.lineTo(APERTURE_CENTER - APERTURE_RADIUS / 3, APERTURE_CENTER + APERTURE_RADIUS);
      ctx.moveTo(APERTURE_CENTER + APERTURE_RADIUS / 3, APERTURE_CENTER - APERTURE_RADIUS);
      ctx.lineTo(APERTURE_CENTER + APERTURE_RADIUS / 3, APERTURE_CENTER + APERTURE_RADIUS);
      // Horizontal third lines
      ctx.moveTo(APERTURE_CENTER - APERTURE_RADIUS, APERTURE_CENTER - APERTURE_RADIUS / 3);
      ctx.lineTo(APERTURE_CENTER + APERTURE_RADIUS, APERTURE_CENTER - APERTURE_RADIUS / 3);
      ctx.moveTo(APERTURE_CENTER - APERTURE_RADIUS, APERTURE_CENTER + APERTURE_RADIUS / 3);
      ctx.lineTo(APERTURE_CENTER + APERTURE_RADIUS, APERTURE_CENTER + APERTURE_RADIUS / 3);
      ctx.stroke();
      ctx.restore();

      // 4. Clean white ring around the circle aperture
      ctx.save();
      ctx.beginPath();
      ctx.arc(APERTURE_CENTER, APERTURE_CENTER, APERTURE_RADIUS, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }

    async saveCroppedImage() {
      if (!this.img) return;

      this.saveBtn.disabled = true;
      this.saveBtn.innerHTML = `
        <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
        Saving…
      `;

      try {
        // High-resolution output canvas (400x400)
        const OUTPUT_SIZE = 400;
        const outCanvas = document.createElement('canvas');
        outCanvas.width = OUTPUT_SIZE;
        outCanvas.height = OUTPUT_SIZE;
        const outCtx = outCanvas.getContext('2d');

        // Circular clipping
        outCtx.save();
        outCtx.beginPath();
        outCtx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
        outCtx.clip();

        // Scale ratio from viewfinder aperture (2 * APERTURE_RADIUS = 230) to output (400)
        const ratio = OUTPUT_SIZE / (this.APERTURE_RADIUS * 2);

        outCtx.translate(OUTPUT_SIZE / 2 + this.offsetX * ratio, OUTPUT_SIZE / 2 + this.offsetY * ratio);
        outCtx.rotate((this.rotation * Math.PI) / 180);
        outCtx.scale(this.scale * ratio, this.scale * ratio);
        outCtx.drawImage(
          this.img,
          -this.img.naturalWidth / 2,
          -this.img.naturalHeight / 2,
          this.img.naturalWidth,
          this.img.naturalHeight
        );
        outCtx.restore();

        const croppedBase64 = outCanvas.toDataURL('image/jpeg', 0.92);

        // Upload to backend
        if (typeof this.customUpload === 'function') {
          await this.customUpload(croppedBase64);
        } else if (this.token && typeof global.authedFetch === 'function') {
          const endpoint = this.uploadEndpoint || '/api/auth/profile';
          const res = await global.authedFetch(endpoint, this.token, {
            method: 'PATCH',
            body: JSON.stringify({ avatarBase64: croppedBase64 }),
          });

          if (!res.success) {
            throw new Error(res.message || 'Server error updating profile picture.');
          }

          // Only update session user if modifying logged-in user's own profile
          if (!this.uploadEndpoint || this.uploadEndpoint === '/api/auth/profile') {
            try {
              const userStr = localStorage.getItem('mentorae_user');
              if (userStr) {
                const u = JSON.parse(userStr);
                u.profile_picture_url = croppedBase64;
                localStorage.setItem('mentorae_user', JSON.stringify(u));
              }
            } catch (_) {}
          }
        }

        // Notify callback
        if (typeof this.onSuccess === 'function') {
          this.onSuccess(croppedBase64);
        }

        this.hide();
        showToast('Profile photo updated & aligned perfectly!');
      } catch (err) {
        console.error('Cropper save error:', err);
        alert(err.message || 'Could not save profile picture. Please try again.');
        this.saveBtn.disabled = false;
        this.saveBtn.innerHTML = '<i class="bi bi-check2-circle"></i> Save & Set Photo';
      }
    }
  }

  // Singleton cropper instance
  let cropperInstance = null;
  function getCropper() {
    if (!cropperInstance) {
      cropperInstance = new AvatarCropper();
    }
    return cropperInstance;
  }

  /**
   * Universal helper function to bind any avatar circle & file input
   */
  global.setupAvatarCropper = function ({ triggerEl, fileInputEl, avatarImgEl, avatarIconEl, token, onUpdated }) {
    if (!triggerEl || !fileInputEl) return;

    // Trigger file picker on click
    triggerEl.addEventListener('click', (e) => {
      e.preventDefault();
      fileInputEl.click();
    });

    // Handle file selection
    fileInputEl.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      // Validate file type
      if (!file.type.match(/^image\/(png|jpeg|jpg|webp)$/i)) {
        alert('Please choose a valid image file (PNG, JPG, or WEBP).');
        fileInputEl.value = '';
        return;
      }

      const cropper = getCropper();
      cropper.open({
        file,
        token,
        onSuccess: (newBase64) => {
          if (avatarImgEl) {
            avatarImgEl.src = newBase64;
            avatarImgEl.classList.remove('d-none');
          }
          if (avatarIconEl) {
            avatarIconEl.classList.add('d-none');
          }
          if (typeof onUpdated === 'function') {
            onUpdated(newBase64);
          }
        },
      });

      // Clear input so same file can be re-selected if desired
      fileInputEl.value = '';
    });
  };

  global.openAvatarCropper = function (options) {
    const cropper = getCropper();
    cropper.open(options);
  };
})(window);
