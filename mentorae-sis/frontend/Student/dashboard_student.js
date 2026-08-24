document.addEventListener('DOMContentLoaded', () => {

    const { token, user } = requireSession('../login.html');

    // 1. Live Real-time Clock Sync Element bindings
    const dateEl = document.getElementById('liveDate');
    const timeEl = document.getElementById('liveTime');

    function updateClock() {
        const now = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateEl.textContent = now.toLocaleDateString('en-US', options);
        timeEl.textContent = now.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        });
    }
    updateClock();
    setInterval(updateClock, 1000);

    // 2. Populate profile banner with the real logged-in student
    document.getElementById('studentNameDisplay').textContent = user.full_name;
    authedFetch('/api/auth/profile', token).then((data) => {
        if (data.success && data.profile.section) {
            document.getElementById('studentSectionDisplay').textContent = data.profile.section;
        }
    }).catch(() => {});

    // 2b. Semester/year/strand/present-status summary
    authedFetch('/api/auth/status-summary', token).then((data) => {
        if (!data.success) return;
        const { presentStatus } = data.summary;
        const statusLabels = { present: 'Present', late: 'Late', absent: 'Absent', excused: 'Excused', out: 'Checked Out' };
        const statusDots = { present: 'bg-success', out: 'bg-success', late: 'bg-warning', absent: 'bg-danger', excused: 'bg-danger' };
        const statusEl = document.getElementById('studentStatusDisplay');
        const dotEl = statusEl?.previousElementSibling;
        if (statusEl) statusEl.textContent = statusLabels[presentStatus] || 'Absent';
        if (dotEl) dotEl.className = `status-dot-mini me-1 ${statusDots[presentStatus] || 'bg-danger'}`;

        const termEl = document.getElementById('studentTermDisplay');
        if (termEl) {
            termEl.textContent = [data.summary.semester, data.summary.schoolYear].filter(Boolean).join(' • ') || '—';
        }
    }).catch(() => {});

    // 3. Logout — now actually logs out
    wireLogout('logoutBtn', '../login.html', token);

    // 4. Show QR Code modal — quick access right from the dashboard, no navigation needed
    const qrModal = document.getElementById('qrModalHome');
    const qrContainer = document.getElementById('qrCodeContainerHome');
    const btnShowQr = document.getElementById('btnShowQrHome');
    const btnCloseQr = document.getElementById('btnCloseQrHome');
    let qrRendered = false;

    async function renderQrCode() {
        if (qrRendered) return;
        try {
            const data = await authedFetch('/api/attendance/my-qr', token);
            if (!data.success) {
                qrContainer.innerHTML = `<p class="text-danger small m-0">${data.message}</p>`;
                return;
            }
            new QRCode(qrContainer, {
                text: data.qrText, // the student's own unique ID number
                width: 200,
                height: 200,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
            qrRendered = true;
        } catch (err) {
            console.error(err);
            qrContainer.innerHTML = '<p class="text-danger small m-0">Could not load your QR code.</p>';
        }
    }

    btnShowQr.addEventListener('click', () => {
        qrModal.classList.remove('d-none');
        renderQrCode();
    });
    btnCloseQr.addEventListener('click', () => qrModal.classList.add('d-none'));
    qrModal.addEventListener('click', (e) => {
        if (e.target === qrModal) qrModal.classList.add('d-none');
    });
});
