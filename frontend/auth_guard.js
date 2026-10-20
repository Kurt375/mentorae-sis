/**
 * Mentorae Universal Role-Based Access Control (RBAC) Guard
 * Runs synchronously in <head> before page render to guarantee
 * zero content leakage when users attempt cross-entity URL tampering.
 */
(function() {
    try {
        var path = window.location.pathname.toLowerCase();

        // 1. Skip public and neutral pages
        var publicPages = [
            'login.html',
            'unauthorized.html',
            'index.html',
            'download_pilot_kit.html',
            'evaluation_forms.html',
            'google5d7caed29dd9b0e1.html',
            'forgot_password.html',
            'reset_password.html'
        ];
        for (var i = 0; i < publicPages.length; i++) {
            if (path.endsWith('/' + publicPages[i]) || path.endsWith('\\' + publicPages[i]) || path === publicPages[i]) {
                return;
            }
        }

        var isTeacherPage = path.includes('/teacher/') || path.includes('\\teacher\\');
        var isStudentPage = path.includes('/student/') || path.includes('\\student\\');
        var isParentPage = path.includes('/parent/') || path.includes('\\parent\\');
        var isAdminPage = path.includes('_admin.') || path.includes('admin_') || path.includes('/admin/') || path.includes('\\admin\\');
        var isScannerPage = path.includes('attendance_scanner_teacher');

        // Only enforce on recognized portal pages
        if (!isTeacherPage && !isStudentPage && !isParentPage && !isAdminPage && !isScannerPage) {
            return;
        }

        var isSubdir = isTeacherPage || isStudentPage || isParentPage;
        var loginUrl = isSubdir ? '../login.html' : 'login.html';
        var unauthUrl = isSubdir ? '../unauthorized.html' : 'unauthorized.html';

        // 2. Validate token and user session
        var token = localStorage.getItem('mentorae_token');
        var userRaw = localStorage.getItem('mentorae_user');
        var user = null;
        try {
            user = JSON.parse(userRaw || 'null');
        } catch (e) {
            user = null;
        }

        if (!token || !user || !user.role) {
            if (document.documentElement) document.documentElement.style.display = 'none';
            window.location.replace(loginUrl);
            return;
        }

        var role = String(user.role).toLowerCase().trim();

        // 3. Entity Permission Matrix
        // - Teacher Pages: Strictly 'teacher' (and supervising 'admin')
        // - Student Pages: Strictly 'student' (and auditing 'admin')
        // - Parent Pages: Strictly 'parent' (and auditing 'admin')
        // - Admin Pages: Strictly 'admin'
        // - Attendance Scanner: 'teacher', 'admin', 'security'
        var isAllowed = false;
        if (isTeacherPage) {
            isAllowed = (role === 'teacher' || role === 'admin');
        } else if (isStudentPage) {
            isAllowed = (role === 'student' || role === 'admin');
        } else if (isParentPage) {
            isAllowed = (role === 'parent' || role === 'admin');
        } else if (isAdminPage) {
            isAllowed = (role === 'admin');
        } else if (isScannerPage) {
            isAllowed = (role === 'teacher' || role === 'admin' || role === 'security');
        }

        // 4. Block unauthorized access instantly
        if (!isAllowed) {
            if (document.documentElement) {
                document.documentElement.style.display = 'none';
            }
            window.location.replace(unauthUrl);
            throw new Error('Access denied: role "' + role + '" is unauthorized for ' + path);
        }
    } catch (err) {
        // Log in dev / console
        console.warn('RBAC Guard:', err);
    }
})();
