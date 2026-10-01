document.addEventListener('DOMContentLoaded', () => {
    // Accept either a full teacher/admin login, or a scanner-key session
    const token = localStorage.getItem('mentorae_token');
    const user = JSON.parse(localStorage.getItem('mentorae_user') || 'null');
    if (!token || !user) {
        window.location.href = 'login.html';
        return;
    }

    document.getElementById('backToDashboardBtn').addEventListener('click', (e) => {
        e.preventDefault();
        const paths = { teacher: 'Teacher/dashboard_teacher.html', admin: 'dashboard_admin.html' };
        window.location.href = paths[user.role] || 'login.html';
    });

    const liveDateElement = document.getElementById('liveDate');
    const liveTimeElement = document.getElementById('liveTime');
    function updateDateTime() {
        const now = new Date();
        liveDateElement.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        liveTimeElement.textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    const video = document.getElementById('scannerVideo');
    const startBtn = document.getElementById('startScanBtn');
    const stopBtn = document.getElementById('stopScanBtn');
    const statusText = document.getElementById('scannerStatusText');
    const successSound = document.getElementById('scanSuccessSound');
    const failSound = document.getElementById('scanFailSound');

    const canvasEl = document.createElement('canvas');
    const canvas = canvasEl.getContext('2d', { willReadFrequently: true });

    let stream = null;
    let scanning = false;
    let isProcessing = false;

    async function startScan() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            video.srcObject = stream;
            video.classList.remove('d-none');
            await video.play();
            scanning = true;
            startBtn.disabled = true;
            stopBtn.disabled = false;
            statusText.textContent = 'Scanning…';
            requestAnimationFrame(tick);
        } catch (err) {
            console.error(err);
            statusText.textContent = 'Camera access denied or unavailable.';
        }
    }

    function stopScan() {
        scanning = false;
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
        }
        video.classList.add('d-none');
        startBtn.disabled = false;
        stopBtn.disabled = true;
        statusText.textContent = 'Ready to Scan';
    }

    function tick() {
        if (!scanning) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvasEl.height = video.videoHeight;
            canvasEl.width = video.videoWidth;
            canvas.drawImage(video, 0, 0, canvasEl.width, canvasEl.height);
            const imageData = canvas.getImageData(0, 0, canvasEl.width, canvasEl.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code && !isProcessing) {
                handleScan(code.data);
            }
        }
        requestAnimationFrame(tick);
    }

    async function handleScan(idNumber) {
        isProcessing = true;
        statusText.textContent = `Detected: ${idNumber}`;

        try {
            const res = await fetch(`${window.MENTORAE_CONFIG.API_BASE_URL}/api/attendance/scan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ idNumber }),
            });
            const data = await res.json();

            if (data.success) {
                document.getElementById('studentName').textContent = data.student.name;
                document.getElementById('studentID').textContent = data.student.idNumber;
                document.getElementById('studentStrand').textContent = data.student.strand;

                const img = document.getElementById('studentImg');
                if (data.student.profilePictureUrl) {
                    img.outerHTML = `<img id="studentImg" src="${data.student.profilePictureUrl}" class="w-100 h-100" style="object-fit: cover;" alt="Student photo">`;
                } else {
                    img.outerHTML = '<i class="bi bi-person-fill text-secondary display-4 d-flex align-items-center justify-content-center h-100" id="studentImg"></i>';
                }

                // Color the status pill by outcome: green (present/out), yellow (late), red (excused/absent)
                const metaWrap = document.getElementById('studentMetaWrap');
                const statusColors = {
                    present: 'alert-success-custom', out: 'alert-success-custom',
                    late: 'bg-warning-subtle text-warning',
                    excused: 'bg-danger-subtle text-danger', absent: 'bg-danger-subtle text-danger',
                };
                metaWrap.className = `d-inline-flex align-items-center gap-2 px-3 py-1.5 rounded-pill fs-6 fw-semibold ${statusColors[data.student.status] || 'alert-success-custom'}`;

                statusText.textContent = data.message;
                playScanSuccessTone();
            } else {
                statusText.textContent = data.message;
                playScanFailTone();
            }
        } catch (err) {
            console.error(err);
            statusText.textContent = 'Could not reach the server.';
            playScanFailTone();
        } finally {
            // cooldown so the same code isn't processed repeatedly while still in frame
            setTimeout(() => { isProcessing = false; }, 3000);
        }
    }

    let audioCtx = null;
    function getAudioContext() {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) audioCtx = new AudioContextClass();
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        return audioCtx;
    }

    function playScanSuccessTone() {
        try {
            const ctx = getAudioContext();
            if (!ctx) return;
            const now = ctx.currentTime;
            // Two pleasant chimes: 523.25 Hz (C5) then 659.25 Hz (E5)
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(523.25, now);
            gain1.gain.setValueAtTime(0.15, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.15);

            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(659.25, now + 0.12);
            gain2.gain.setValueAtTime(0.15, now + 0.12);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.12);
            osc2.stop(now + 0.35);
        } catch (e) {
            console.warn('Audio tone error:', e);
        }
    }

    function playScanFailTone() {
        try {
            const ctx = getAudioContext();
            if (!ctx) return;
            const now = ctx.currentTime;
            // Short warning buzz
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(180, now);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.3);
        } catch (e) {
            console.warn('Audio tone error:', e);
        }
    }

    startBtn.addEventListener('click', () => {
        getAudioContext();
        startScan();
    });
    stopBtn.addEventListener('click', stopScan);
});
