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
                statusText.textContent = data.message;
                playSound(successSound);
            } else {
                statusText.textContent = data.message;
                playSound(failSound);
            }
        } catch (err) {
            console.error(err);
            statusText.textContent = 'Could not reach the server.';
            playSound(failSound);
        } finally {
            // cooldown so the same code isn't processed repeatedly while still in frame
            setTimeout(() => { isProcessing = false; }, 3000);
        }
    }

    function playSound(el) {
        if (el && el.src) {
            el.currentTime = 0;
            el.play().catch(() => {});
        }
    }

    startBtn.addEventListener('click', startScan);
    stopBtn.addEventListener('click', stopScan);
});
