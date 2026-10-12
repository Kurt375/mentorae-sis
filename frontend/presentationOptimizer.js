/**
 * Mentorae SIS - Presentation & Document Media Optimizer
 * Automatically optimizes and compresses embedded images in PowerPoint (.pptx)
 * and Word (.docx) files directly in the browser using JSZip and HTML5 Canvas.
 * 
 * - Preserves 100% of presentation layouts, shapes, text, animations, transitions, and XML relations.
 * - Compresses oversized photos and screenshots down to full HD 1080p (1920px max).
 * - Drastically reduces presentation file sizes (e.g., 35 MB -> 3.5 MB) so they effortlessly stay
 *   under the 25 MB limit and load up to 10x faster on student mobile phones and tablets.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MentoraePresentationOptimizer = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const MAX_DIMENSION = 1920; // 1080p full HD slide resolution
    const JPEG_QUALITY = 0.82;  // Visually lossless on slide displays
    const MIN_IMAGE_SIZE_BYTES = 120 * 1024; // 120 KB (skip tiny icons & bullets)
    const AUTO_OPTIMIZE_THRESHOLD = 8 * 1024 * 1024; // 8 MB (always optimize if >= 8MB or > 25MB)
    const SYSTEM_FILE_LIMIT = 25 * 1024 * 1024; // 25 MB system limit

    /**
     * Format byte sizes into human-readable strings
     */
    function formatBytes(bytes, decimals = 1) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    /**
     * Ensure JSZip is available on the page, dynamically loading it if needed
     */
    async function ensureJSZip() {
        if (typeof window !== 'undefined' && window.JSZip) {
            return window.JSZip;
        }
        if (typeof require !== 'undefined') {
            try { return require('jszip'); } catch (e) {}
        }
        if (typeof window !== 'undefined') {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
                script.onload = () => resolve(window.JSZip);
                script.onerror = () => reject(new Error('Could not load JSZip library.'));
                document.head.appendChild(script);
            });
        }
        throw new Error('JSZip library is required for presentation optimization.');
    }

    /**
     * Load an image from an Object URL or Blob
     */
    function loadImageAsync(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = url;
        });
    }

    /**
     * Compress an image blob using HTML5 Canvas
     */
    async function compressImageBlob(rawBlob, filePath, options = {}) {
        if (!rawBlob || rawBlob.size < MIN_IMAGE_SIZE_BYTES) {
            return null;
        }

        const maxDim = options.maxDimension || MAX_DIMENSION;
        const jpegQuality = options.jpegQuality || JPEG_QUALITY;
        const url = URL.createObjectURL(rawBlob);

        try {
            const img = await loadImageAsync(url);
            if (!img || !img.width || !img.height) return null;

            const origW = img.naturalWidth || img.width;
            const origH = img.naturalHeight || img.height;

            // If image is already smaller than max dimensions and under 400KB, skip
            if (origW <= maxDim && origH <= maxDim && rawBlob.size < 400 * 1024) {
                return null;
            }

            // Calculate scaled dimensions
            let targetW = origW;
            let targetH = origH;
            if (targetW > maxDim || targetH > maxDim) {
                if (targetW >= targetH) {
                    targetH = Math.round((targetH * maxDim) / targetW);
                    targetW = maxDim;
                } else {
                    targetW = Math.round((targetW * maxDim) / targetH);
                    targetH = maxDim;
                }
            }

            // Create canvas and render downscaled image
            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, targetW, targetH);

            const lowerPath = filePath.toLowerCase();
            const isJpeg = lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg');
            const mimeType = isJpeg ? 'image/jpeg' : 'image/png';
            const quality = isJpeg ? jpegQuality : undefined;

            const compressedBlob = await new Promise((resolve) => {
                canvas.toBlob(resolve, mimeType, quality);
            });

            // Clean up canvas
            canvas.width = 1;
            canvas.height = 1;

            // Only return if it achieved a noticeable compression reduction (at least 5% smaller)
            if (compressedBlob && compressedBlob.size < rawBlob.size * 0.95) {
                return {
                    blob: compressedBlob,
                    origSize: rawBlob.size,
                    newSize: compressedBlob.size,
                    savedBytes: rawBlob.size - compressedBlob.size,
                    origDimensions: `${origW}x${origH}`,
                    newDimensions: `${targetW}x${targetH}`
                };
            }

            return null;
        } catch (err) {
            console.warn(`[Optimizer] Error compressing media ${filePath}:`, err);
            return null;
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    /**
     * Display a floating status notification for optimization
     */
    function showOptimizerToast(type, message, details = '') {
        if (typeof document === 'undefined') return;

        let container = document.getElementById('mentorae-optimizer-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'mentorae-optimizer-toast-container';
            container.style.cssText = `
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 10950;
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-width: 420px;
                pointer-events: none;
                font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            `;
            document.body.appendChild(container);
        }

        let existingToast = document.getElementById('mentorae-active-optimizer-toast');
        if (type === 'progress') {
            if (!existingToast) {
                existingToast = document.createElement('div');
                existingToast.id = 'mentorae-active-optimizer-toast';
                existingToast.style.cssText = `
                    background: rgba(15, 23, 42, 0.92);
                    backdrop-filter: blur(12px);
                    color: #fff;
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 12px;
                    padding: 14px 18px;
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
                    pointer-events: auto;
                    transition: all 0.3s ease;
                `;
                container.appendChild(existingToast);
            }
            existingToast.innerHTML = `
                <div class="d-flex align-items-center gap-2 mb-1">
                    <div class="spinner-border spinner-border-sm text-warning" role="status" style="width: 1rem; height: 1rem;"></div>
                    <span class="fw-semibold fs-6 text-white">${message}</span>
                </div>
                ${details ? `<div class="small text-light text-opacity-75" style="font-size: 0.82rem;">${details}</div>` : ''}
            `;
        } else if (type === 'success' || type === 'info') {
            if (existingToast) {
                existingToast.remove();
            }
            const successToast = document.createElement('div');
            successToast.style.cssText = `
                background: rgba(16, 185, 129, 0.94);
                backdrop-filter: blur(12px);
                color: #fff;
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 12px;
                padding: 14px 18px;
                box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.35);
                pointer-events: auto;
                transition: all 0.3s ease;
            `;
            successToast.innerHTML = `
                <div class="d-flex align-items-center gap-2 mb-1">
                    <i class="bi bi-lightning-charge-fill text-warning fs-5"></i>
                    <span class="fw-bold fs-6 text-white">${message}</span>
                </div>
                ${details ? `<div class="small text-white text-opacity-90 mt-1" style="font-size: 0.84rem;">${details}</div>` : ''}
            `;
            container.appendChild(successToast);
            setTimeout(() => {
                successToast.style.opacity = '0';
                successToast.style.transform = 'translateY(10px)';
                setTimeout(() => successToast.remove(), 300);
            }, 4500);
        } else if (type === 'clear') {
            if (existingToast) existingToast.remove();
        }
    }

    /**
     * Check whether a file qualifies for presentation optimization
     */
    function isOptimizable(fileOrName, fileSize = 0) {
        const name = typeof fileOrName === 'string' ? fileOrName : (fileOrName?.name || '');
        const size = typeof fileOrName === 'object' && fileOrName?.size ? fileOrName.size : fileSize;
        const ext = name.split('.').pop().toLowerCase();
        return (ext === 'pptx' || ext === 'docx');
    }

    /**
     * Main optimization method
     * Accepts a File or Blob, compresses embedded media, and returns an optimized File
     * 
     * @param {File|Blob} file - The file to optimize
     * @param {Object} [options] - Configuration options
     * @returns {Promise<Object>} - { file, wasOptimized, originalSize, optimizedSize, savedBytes, percentSaved, imagesCompressed }
     */
    async function optimizeOfficeFile(file, options = {}) {
        const fileName = options.fileName || file.name || 'presentation.pptx';
        const ext = fileName.split('.').pop().toLowerCase();

        // 1. Only PPTX and DOCX are OpenXML archives with embedded media
        if (ext !== 'pptx' && ext !== 'docx') {
            return {
                file,
                wasOptimized: false,
                reason: 'not_openxml'
            };
        }

        const originalSize = file.size;
        const threshold = options.thresholdBytes || AUTO_OPTIMIZE_THRESHOLD;
        const isExceedingLimit = originalSize > SYSTEM_FILE_LIMIT;

        // Skip small files unless forced or above threshold / 25MB limit
        if (!options.force && originalSize < threshold && !isExceedingLimit) {
            return {
                file,
                wasOptimized: false,
                reason: 'below_threshold',
                originalSize
            };
        }

        const showToast = options.showToast !== false;
        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

        const startTime = Date.now();
        if (showToast) {
            showOptimizerToast(
                'progress',
                'Optimizing presentation...',
                `Scanning ${fileName} (${formatBytes(originalSize)}) for large media...`
            );
        }

        try {
            const JSZip = await ensureJSZip();

            onProgress({ stage: 'reading', message: 'Reading presentation archive...', percent: 10 });
            const arrayBuffer = await file.arrayBuffer();
            const zip = await JSZip.loadAsync(arrayBuffer);

            // Locate media folder (ppt/media/ for presentations, word/media/ for documents)
            const mediaFolder = ext === 'pptx' ? 'ppt/media/' : 'word/media/';
            const mediaPaths = Object.keys(zip.files).filter((path) => {
                if (!path.startsWith(mediaFolder)) return false;
                const fileEntry = zip.files[path];
                if (fileEntry && fileEntry.dir) return false;
                const lower = path.toLowerCase();
                return (
                    lower.endsWith('.jpg') ||
                    lower.endsWith('.jpeg') ||
                    lower.endsWith('.png') ||
                    lower.endsWith('.webp')
                );
            });

            if (mediaPaths.length === 0) {
                if (showToast) showOptimizerToast('clear');
                return {
                    file,
                    wasOptimized: false,
                    reason: 'no_media_found',
                    originalSize
                };
            }

            let imagesCompressed = 0;
            let totalSavedBytes = 0;

            // Iterate and compress oversized images
            for (let i = 0; i < mediaPaths.length; i++) {
                const path = mediaPaths[i];
                const fileEntry = zip.files[path];

                const currentPercent = 15 + Math.round(((i + 1) / mediaPaths.length) * 65);
                onProgress({
                    stage: 'compressing_images',
                    current: i + 1,
                    total: mediaPaths.length,
                    percent: currentPercent,
                    message: `Optimizing image ${i + 1} of ${mediaPaths.length}...`
                });

                if (showToast) {
                    showOptimizerToast(
                        'progress',
                        'Optimizing presentation images...',
                        `Compressing image ${i + 1} of ${mediaPaths.length} for fast student loading...`
                    );
                }

                const rawBlob = await fileEntry.async('blob');
                const compressionResult = await compressImageBlob(rawBlob, path, options);

                if (compressionResult) {
                    zip.file(path, compressionResult.blob);
                    imagesCompressed++;
                    totalSavedBytes += compressionResult.savedBytes;
                }
            }

            // If no media benefited from compression, keep original file
            if (imagesCompressed === 0) {
                if (showToast) showOptimizerToast('clear');
                return {
                    file,
                    wasOptimized: false,
                    reason: 'already_optimal',
                    originalSize
                };
            }

            // Repack the presentation
            onProgress({ stage: 'repacking', message: 'Repacking presentation archive...', percent: 85 });
            if (showToast) {
                showOptimizerToast(
                    'progress',
                    'Finalizing presentation...',
                    `Rebuilding compressed archive with ${imagesCompressed} optimized images...`
                );
            }

            const optimizedBlob = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            }, (meta) => {
                const repackPercent = 85 + Math.round((meta.percent || 0) * 0.14);
                onProgress({
                    stage: 'repacking',
                    percent: repackPercent,
                    message: `Repacking presentation archive (${Math.round(meta.percent)}%)...`
                });
            });

            const optimizedSize = optimizedBlob.size;
            const netSavedBytes = originalSize - optimizedSize;
            const percentSaved = Math.round((netSavedBytes / originalSize) * 100);

            // Safety check: Ensure the newly generated file is actually smaller
            if (optimizedSize >= originalSize) {
                if (showToast) showOptimizerToast('clear');
                return {
                    file,
                    wasOptimized: false,
                    reason: 'no_size_reduction',
                    originalSize
                };
            }

            // Create drop-in replacement File object
            const optimizedFile = new File([optimizedBlob], fileName, {
                type: file.type || 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                lastModified: Date.now()
            });

            const durationMs = Date.now() - startTime;

            if (showToast) {
                const wasUnderLimit = isExceedingLimit && optimizedSize <= SYSTEM_FILE_LIMIT;
                const toastTitle = wasUnderLimit
                    ? '🎉 Successfully compressed under 25 MB limit!'
                    : '⚡ Presentation automatically optimized!';
                const toastDetails = `${formatBytes(originalSize)} → ${formatBytes(optimizedSize)} (${percentSaved}% saved, ${imagesCompressed} images). Ready for fast student loading!`;

                showOptimizerToast('success', toastTitle, toastDetails);
            }

            onProgress({ stage: 'complete', percent: 100, message: 'Optimization complete!' });

            return {
                file: optimizedFile,
                wasOptimized: true,
                originalSize,
                optimizedSize,
                savedBytes: netSavedBytes,
                percentSaved,
                imagesCompressed,
                durationMs
            };

        } catch (error) {
            console.error('[Optimizer] Failed to optimize presentation:', error);
            if (showToast) showOptimizerToast('clear');
            return {
                file,
                wasOptimized: false,
                reason: 'error',
                error: error.message,
                originalSize
            };
        }
    }

    return {
        optimizeOfficeFile,
        isOptimizable,
        formatBytes,
        SYSTEM_FILE_LIMIT,
        AUTO_OPTIMIZE_THRESHOLD
    };

}));
