/**
 * Achievements & Rewards Student Portal Script
 * Mentorae SIS AY 2025-2026
 * Real-time synchronization with Backend API:
 *   - GET /api/badges/catalog
 *   - GET /api/badges/student/:studentId
 *   - GET /api/badges/leaderboard?scope=section|school
 */

document.addEventListener('DOMContentLoaded', async () => {
    // 0. Session Guard & Authentication
    const { token, user } = requireSession('../login.html', ['student', 'admin']);
    wireLogout('logoutBtn', '../login.html');

    const STUDENT_ID = user.id;
    const STUDENT_NAME = user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Student';

    // Local storage keys scoped to user
    const STORAGE_KEY_FEATURED_BADGES = `mentorae_featured_badges_${STUDENT_ID}`;
    const STORAGE_KEY_AURA_THEME = `mentorae_aura_theme_${STUDENT_ID}`;
    const STORAGE_KEY_BADGE_SORT = 'mentorae_badge_sort';
    const STORAGE_KEY_BADGE_CATEGORY = 'mentorae_badge_category';
    const STORAGE_KEY_BADGE_VIEW = 'mentorae_badge_view';
    const STORAGE_KEY_LEADERBOARD_SCOPE = 'mentorae_lb_scope';

    // State
    let allCatalogBadges = [];
    let earnedBadges = [];
    let studentActivities = [];
    let leaderboardList = [];
    let currentScope = localStorage.getItem(STORAGE_KEY_LEADERBOARD_SCOPE) || 'section';
    let currentModalFilter = 'all';
    let currentActiveSlotIndex = 0;
    let tempFeaturedBadgeIds = [];
    let tempAuraTheme = 'aura-emerald';

    // 1. Live Date & Time Clock
    function updateDateTime() {
        const liveDateElement = document.getElementById('liveDate');
        const liveTimeElement = document.getElementById('liveTime');
        if (!liveDateElement || !liveTimeElement) return;

        const now = new Date();
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        liveDateElement.textContent = now.toLocaleDateString('en-US', dateOptions);
        const timeOptions = { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true };
        liveTimeElement.textContent = now.toLocaleTimeString('en-US', timeOptions);
    }
    updateDateTime();
    setInterval(updateDateTime, 1000);

    // 2. Comprehensive Badge Metadata Dictionary
    const BADGE_METADATA = {
        perfect_attendance: {
            title: 'Perfect Attendance',
            icon: '🎯',
            category: 'Attendance',
            description: 'Awarded automatically by the system to students who maintained a 100% on-time attendance record for the entire month without unexcused absences or tardiness.',
            requirement: 'Achieve 100% attendance rate with zero tardiness across all enrolled subject periods (Verified and awarded automatically by the system).',
            points: 100,
            bg: '#d5ebd5',
            color: '#1f6e1f'
        },
        honor_student: {
            title: 'Honor Student',
            icon: '🏆',
            category: 'Academics',
            description: 'Awarded automatically by the system to recognize outstanding academic performance, mastery, and general weighted excellence (GWA 90+).',
            requirement: 'Achieve a General Weighted Average (GWA) of 90 or higher across subjects (Verified and awarded automatically by the system).',
            points: 150,
            bg: '#fef2cb',
            color: '#b27a00'
        },
        quiz_master: {
            title: 'Quiz Master',
            icon: '🧠',
            category: 'Academics',
            description: 'Awarded by the subject teacher when a student passes or excels in their face-to-face (F2F) classroom written quizzes and periodic assessments.',
            requirement: 'Passed or scored high marks in face-to-face (F2F) classroom quizzes as evaluated and awarded by the subject teacher.',
            points: 120,
            bg: '#deeaf6',
            color: '#2f5597'
        },
        early_bird: {
            title: 'Early Bird',
            icon: '🌅',
            category: 'Attendance',
            description: 'Awarded automatically by the system to students who consistently logged attendance QR codes before 7:15 AM for 15 consecutive school days.',
            requirement: 'Scan QR attendance before 7:15 AM on 15 consecutive school days (Verified and awarded automatically by the system).',
            points: 80,
            bg: '#fce4d6',
            color: '#c65911'
        },
        top_scorer: {
            title: 'Top Scorer',
            icon: '🅰️',
            category: 'Academics',
            description: 'Achieved the highest score on quizzes, periodic exams, or major performance tasks in class.',
            requirement: 'Obtain the top score in a unit examination or major performance task evaluation.',
            points: 15,
            bg: '#e2f0d9',
            color: '#385723'
        },
        most_active: {
            title: 'Most Active',
            icon: '👍',
            category: 'Participation',
            description: 'Consistently participates in classroom discussions, raises insightful inquiries, and completes daily interactive modules.',
            requirement: 'Awarded by subject teacher for vibrant classroom recitation and active engagement.',
            points: 10,
            bg: '#d5ebd5',
            color: '#1f6e1f'
        },
        innovative_thinker: {
            title: 'Innovative Thinker',
            icon: '💡',
            category: 'Creativity',
            description: 'Demonstrated creative problem-solving, novel project prototypes, or unique approaches to STEM inquiries.',
            requirement: 'Proposed a unique solution or innovative project design in laboratory or class tasks.',
            points: 15,
            bg: '#fef2cb',
            color: '#b27a00'
        },
        team_captain: {
            title: 'Team Captain',
            icon: '⭐',
            category: 'Leadership',
            description: 'Demonstrated exemplary leadership, communication, and peer coordination in group laboratory projects.',
            requirement: 'Elected group leader who successfully guided a collaborative project to high completion.',
            points: 20,
            bg: '#ebdcf5',
            color: '#6f30a0'
        },
        resilient_thinker: {
            title: 'Resilient Thinker',
            icon: '💎',
            category: 'Character',
            description: 'Persevered through challenging subject concepts, embraced feedback, and showed outstanding grit.',
            requirement: 'Demonstrated remarkable turnaround and persistent effort in overcoming complex lessons.',
            points: 15,
            bg: '#d9f1f2',
            color: '#008080'
        },
        completed_grades: {
            title: 'Completed Grades',
            icon: '📅',
            category: 'Academics',
            description: 'Awarded automatically by the system when a student has submitted 100% of all required homework, laboratory reports, and performance tasks on time.',
            requirement: 'Zero missing deliverables or late submissions across all grading terms (Verified and awarded automatically by the system).',
            points: 10,
            bg: '#e4dff2',
            color: '#5230a0'
        },
        recitation_master: {
            title: 'Recitation Master',
            icon: '💬',
            category: 'Participation',
            description: 'Consistently articulate, clear, and confident in oral recitations and classroom presentations.',
            requirement: 'Active contributor in subject recitations with articulate, evidence-backed answers.',
            points: 10,
            bg: '#fce4d6',
            color: '#c65911'
        },
        critical_thinker: {
            title: 'Critical Thinker',
            icon: '🔍',
            category: 'Academics',
            description: 'Formulates deep analytical questions, challenges hypotheses with evidence, and applies scientific logic.',
            requirement: 'Demonstrated exceptional logical deduction in laboratory analysis and problem sets.',
            points: 15,
            bg: '#e2f0d9',
            color: '#228b22'
        },
        coacher: {
            title: 'Coacher / Peer Tutor',
            icon: '🤝',
            category: 'Leadership',
            description: 'Acts as a dedicated peer tutor, patiently assisting fellow students during group study sessions.',
            requirement: 'Recognized for helping classmates review and master difficult subject topics.',
            points: 20,
            bg: '#deeaf6',
            color: '#2f5597'
        },
        top_performer: {
            title: 'Top Performer',
            icon: '🎖️',
            category: 'Academics',
            description: 'All-around outstanding performance in academic standing, classroom conduct, and school activities.',
            requirement: 'Consistently in top tier academic standing and stellar discipline record.',
            points: 25,
            bg: '#fce4d6',
            color: '#833c0c'
        },
        most_improved: {
            title: 'Most Improved',
            icon: '📈',
            category: 'Academics',
            description: 'Achieved the most significant upward progression in quarterly evaluation grades and performance scores.',
            requirement: 'Boosted General Weighted Average by 5+ points across quarterly evaluation cycles.',
            points: 130,
            bg: '#ebdcf5',
            color: '#6f30a0'
        },
        deped_values: {
            title: 'Core Values Award',
            icon: '🌟',
            category: 'Character',
            description: 'Exemplifies the DepEd Core Values: Maka-Diyos, Makatao, Makakalikasan, and Makabansa.',
            requirement: 'Exemplary demonstration of moral integrity, environmental stewardship, and respect for all.',
            points: 100,
            bg: '#fef2cb',
            color: '#b27a00'
        },
        punctuality_champ: {
            title: 'Punctuality Champ',
            icon: '⏰',
            category: 'Attendance',
            description: 'Never late to morning school entry and class period transitions throughout the term.',
            requirement: 'Zero tardiness records across all periods for consecutive 40 school days.',
            points: 90,
            bg: '#deeaf6',
            color: '#2f5597'
        },
        helping_hand: {
            title: 'Helping Hand',
            icon: '❤️',
            category: 'Character',
            description: 'Voluntary service in assisting teachers, organizing laboratory equipment, and supporting campus initiatives.',
            requirement: 'Demonstrated selfless service and volunteerism in campus learning activities.',
            points: 80,
            bg: '#fce4d6',
            color: '#833c0c'
        }
    };

    // 3. Challenge / Goals Database
    const CHALLENGES_DATABASE = {
        quiz: {
            title: 'Perfect in Quiz',
            reward: '+70 Points',
            iconClass: 'bi-stars text-success',
            bgClass: 'bg-success-subtle',
            desc: 'Achieve a high or perfect score in subject quizzes and evaluation modules.',
            actionText: 'Review subject study resources and practice quizzes.',
            btnText: 'Open Learning Resources',
            btnHref: 'resources_student.html'
        },
        attendance: {
            title: 'Perfect Attendance Week',
            reward: '+20 Points',
            iconClass: 'bi-bullseye text-primary',
            bgClass: 'bg-primary-subtle',
            desc: 'Attend all scheduled class sessions on time from Monday through Friday.',
            actionText: 'Check your current attendance log and QR scan history.',
            btnText: 'View Attendance Logs',
            btnHref: 'attendance_student.html'
        },
        grades: {
            title: 'Grade Improvement',
            reward: '+15 Points',
            iconClass: 'bi-graph-up-arrow text-purple',
            bgClass: 'bg-purple-subtle',
            desc: 'Monitor your subject grades, quarterly evaluations, and academic standing.',
            actionText: 'Review your enrolled subjects, SF9 grades, and adviser remarks.',
            btnText: 'View Grades & Standing',
            btnHref: 'grade_performance_student.html'
        }
    };

    // 4. Modal Initializations
    const badgeModalEl = document.getElementById('badgeModal');
    const challengeModalEl = document.getElementById('challengeModal');
    const allBadgesModalEl = document.getElementById('allBadgesModal');
    const customizeModalEl = document.getElementById('customizeFeaturedBadgesModal');

    const badgeModalInstance = badgeModalEl ? new bootstrap.Modal(badgeModalEl) : null;
    const challengeModalInstance = challengeModalEl ? new bootstrap.Modal(challengeModalEl) : null;
    const allBadgesModalInstance = allBadgesModalEl ? new bootstrap.Modal(allBadgesModalEl) : null;
    const customizeModalInstance = customizeModalEl ? new bootstrap.Modal(customizeModalEl) : null;

    // 5. Showcase & Preferences Helpers
    function getStoredFeaturedBadges() {
        let stored = null;
        try {
            stored = JSON.parse(localStorage.getItem(STORAGE_KEY_FEATURED_BADGES));
        } catch (e) {
            stored = null;
        }

        if (Array.isArray(stored) && stored.length > 0) {
            return stored.slice(0, 3);
        }

        // Fallback default: up to first 3 unlocked badges of current student
        return earnedBadges.slice(0, 3).map(b => b.id);
    }

    function getStoredAuraTheme() {
        return localStorage.getItem(STORAGE_KEY_AURA_THEME) || 'aura-emerald';
    }

    function getStoredSortMode() {
        return localStorage.getItem(STORAGE_KEY_BADGE_SORT) || 'recent';
    }

    function getStoredCategoryFilter() {
        return localStorage.getItem(STORAGE_KEY_BADGE_CATEGORY) || 'all';
    }

    function getStoredViewMode() {
        return localStorage.getItem(STORAGE_KEY_BADGE_VIEW) || 'carousel';
    }

    function formatRelativeTime(dateStr) {
        if (!dateStr) return 'Recently';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return String(dateStr);
        const now = new Date();
        const diffSec = Math.floor((now - date) / 1000);
        if (diffSec < 60) return 'Just now';
        if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
        if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
        if (diffSec < 172800) return 'Yesterday';
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // 6. Navigation Controls & View Mode
    const badgesScrollTrack = document.getElementById('badgesScrollTrack');
    const badgesGridContainer = document.getElementById('badgesGridContainer');
    const btnScrollBadgesLeft = document.getElementById('btnScrollBadgesLeft');
    const btnScrollBadgesRight = document.getElementById('btnScrollBadgesRight');
    const btnViewAllBadges = document.getElementById('btnViewAllBadges');

    const badgeCategoryFilter = document.getElementById('badgeCategoryFilter');
    const badgeSortSelect = document.getElementById('badgeSortSelect');
    const btnViewModeCarousel = document.getElementById('btnViewModeCarousel');
    const btnViewModeGrid = document.getElementById('btnViewModeGrid');
    const carouselNavControls = document.getElementById('carouselNavControls');

    if (badgeCategoryFilter) badgeCategoryFilter.value = getStoredCategoryFilter();
    if (badgeSortSelect) badgeSortSelect.value = getStoredSortMode();

    if (btnScrollBadgesLeft && badgesScrollTrack) {
        btnScrollBadgesLeft.addEventListener('click', () => {
            badgesScrollTrack.scrollBy({ left: -220, behavior: 'smooth' });
        });
    }

    if (btnScrollBadgesRight && badgesScrollTrack) {
        btnScrollBadgesRight.addEventListener('click', () => {
            badgesScrollTrack.scrollBy({ left: 220, behavior: 'smooth' });
        });
    }

    if (btnViewAllBadges && allBadgesModalInstance) {
        btnViewAllBadges.addEventListener('click', () => {
            renderModalBadges();
            allBadgesModalInstance.show();
        });
    }

    if (badgeCategoryFilter) {
        badgeCategoryFilter.addEventListener('change', (e) => {
            localStorage.setItem(STORAGE_KEY_BADGE_CATEGORY, e.target.value);
            renderAchievements();
        });
    }

    if (badgeSortSelect) {
        badgeSortSelect.addEventListener('change', (e) => {
            localStorage.setItem(STORAGE_KEY_BADGE_SORT, e.target.value);
            renderAchievements();
        });
    }

    function setViewMode(mode) {
        localStorage.setItem(STORAGE_KEY_BADGE_VIEW, mode);
        if (mode === 'grid') {
            if (badgesScrollTrack) badgesScrollTrack.classList.add('d-none');
            if (badgesGridContainer) badgesGridContainer.classList.remove('d-none');
            if (carouselNavControls) carouselNavControls.classList.add('d-none');

            if (btnViewModeGrid) {
                btnViewModeGrid.classList.add('btn-success');
                btnViewModeGrid.classList.remove('btn-light', 'text-muted');
            }
            if (btnViewModeCarousel) {
                btnViewModeCarousel.classList.remove('btn-success');
                btnViewModeCarousel.classList.add('btn-light', 'text-muted');
            }
        } else {
            if (badgesScrollTrack) badgesScrollTrack.classList.remove('d-none');
            if (badgesGridContainer) badgesGridContainer.classList.add('d-none');
            if (carouselNavControls) carouselNavControls.classList.remove('d-none');

            if (btnViewModeCarousel) {
                btnViewModeCarousel.classList.add('btn-success');
                btnViewModeCarousel.classList.remove('btn-light', 'text-muted');
            }
            if (btnViewModeGrid) {
                btnViewModeGrid.classList.remove('btn-success');
                btnViewModeGrid.classList.add('btn-light', 'text-muted');
            }
        }
        renderAchievements();
    }

    if (btnViewModeCarousel) {
        btnViewModeCarousel.addEventListener('click', () => setViewMode('carousel'));
    }
    if (btnViewModeGrid) {
        btnViewModeGrid.addEventListener('click', () => setViewMode('grid'));
    }

    // 7. Load Data from Backend API
    async function loadData() {
        try {
            // A. Fetch Catalog
            const catRes = await authedFetch('/api/badges/catalog', token);
            if (catRes.success && Array.isArray(catRes.badges)) {
                allCatalogBadges = catRes.badges.map(b => {
                    const meta = BADGE_METADATA[b.id] || {};
                    return {
                        id: b.id,
                        title: b.name || meta.title || b.id,
                        points: Number(b.points) || meta.points || 10,
                        icon: meta.icon || (b.icon ? `<i class="bi ${b.icon}"></i>` : (b.symbol || '⭐')),
                        biIcon: b.icon || meta.biIcon,
                        symbol: b.symbol,
                        bg: b.bg || meta.bg || '#f1f1f1',
                        color: b.color || meta.color || '#333',
                        category: meta.category || 'General',
                        description: meta.description || 'Awarded for classroom achievement and effort.',
                        requirement: meta.requirement || 'Awarded by subject teacher upon performance evaluation.'
                    };
                });
            }

            // B. Fetch Student Badges & Recent Activities
            const studentRes = await authedFetch(`/api/badges/student/${STUDENT_ID}`, token);
            if (studentRes.success) {
                earnedBadges = (studentRes.badges || []).map(b => {
                    const catItem = allCatalogBadges.find(c => c.id === b.badge_id) || {};
                    return {
                        id: b.badge_id,
                        name: b.name || catItem.title || b.badge_id,
                        title: b.name || catItem.title || b.badge_id,
                        points: Number(b.points) || catItem.points || 10,
                        icon: catItem.icon || (b.icon ? `<i class="bi ${b.icon}"></i>` : (b.symbol || '⭐')),
                        earnedAt: b.earned_at,
                        date: formatRelativeTime(b.earned_at),
                        awardedBy: b.awarded_by_name || (['completed_grades', 'honor_student', 'early_bird', 'perfect_attendance'].includes(b.badge_id) ? 'Automated System' : 'Subject Teacher'),
                        category: catItem.category || 'General',
                        description: catItem.description || '',
                        requirement: catItem.requirement || ''
                    };
                });
                studentActivities = studentRes.activity || [];
            }

            // C. Fetch Leaderboard
            await loadLeaderboard(currentScope);

            // D. Render UI
            renderAchievements();
        } catch (err) {
            console.error('Error loading data in achievements_student.js:', err);
        }
    }

    // 8. Leaderboard Loader (Scoped exclusively to My Section)
    async function loadLeaderboard() {
        currentScope = 'section';
        localStorage.setItem(STORAGE_KEY_LEADERBOARD_SCOPE, 'section');

        const container = document.getElementById('classLeaderboardContainer');
        if (container) {
            container.innerHTML = '<div class="p-4 text-center text-muted"><i class="bi bi-arrow-repeat me-2"></i>Loading leaderboard standings...</div>';
        }

        const lbRes = await authedFetch('/api/badges/leaderboard?scope=section', token);
        if (lbRes.success && Array.isArray(lbRes.leaderboard)) {
            leaderboardList = lbRes.leaderboard;
        } else {
            leaderboardList = [];
        }

        renderLeaderboardUI(lbRes.sectionId);
    }

    // 9. Render Leaderboard UI
    function renderLeaderboardUI(sectionId) {
        const container = document.getElementById('classLeaderboardContainer');
        const userLiveRankBadge = document.getElementById('userLiveRankBadge');
        const classRankDisplay = document.getElementById('classRankDisplay');
        const classRankSubText = document.getElementById('classRankSubText');
        const totalPointsDisplay = document.getElementById('totalPointsDisplay');
        const totalPointsSubText = document.getElementById('totalPointsSubText');
        const leaderboardSubTitle = document.getElementById('leaderboardSubTitle');

        if (!container) return;

        // Find current student in leaderboard
        const me = leaderboardList.find(s => s.id === STUDENT_ID || s.idNumber === user.id_number);
        const myRank = me ? me.rank : (leaderboardList.length ? '—' : 1);
        const myPoints = me ? me.points : earnedBadges.reduce((sum, b) => sum + (b.points || 10), 0);

        if (totalPointsDisplay) totalPointsDisplay.textContent = myPoints;
        if (totalPointsSubText) totalPointsSubText.textContent = `Based on ${earnedBadges.length} earned badge${earnedBadges.length === 1 ? '' : 's'}`;

        if (classRankDisplay) classRankDisplay.textContent = `#${myRank}`;
        if (userLiveRankBadge) userLiveRankBadge.textContent = `Your Rank: #${myRank}`;
        if (classRankSubText) {
            classRankSubText.textContent = `Out of ${leaderboardList.length} student${leaderboardList.length === 1 ? '' : 's'}`;
        }

        // Subtitle
        if (leaderboardSubTitle) {
            const secName = me && me.section ? me.section : 'My Section';
            leaderboardSubTitle.textContent = `${secName} • Live Academic Standings`;
        }

        if (!leaderboardList.length) {
            container.innerHTML = `
                <div class="p-5 text-center text-muted">
                    <i class="bi bi-trophy display-4 d-block mb-3 opacity-50"></i>
                    <h6 class="fw-bold">No Leaderboard Standings Yet</h6>
                    <p class="small m-0">Student badge points will display here once teachers award badges to the class.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        const auraTheme = getStoredAuraTheme();
        const featuredBadgeIds = getStoredFeaturedBadges();

        leaderboardList.forEach(student => {
            const isCurrentUser = student.id === STUDENT_ID || student.idNumber === user.id_number;
            const rank = student.rank;

            const row = document.createElement('div');
            const rowAuraClass = isCurrentUser ? `highlighted-user-row ${auraTheme}` : '';
            row.className = `leaderboard-row d-flex align-items-center justify-content-between gap-3 ${rowAuraClass}`;

            // Rank visual
            let rankElementHtml = '';
            if (rank === 1) {
                rankElementHtml = `<div class="rank-badge-ribbon rank-ribbon-1 shadow-sm" title="Rank 1 - Gold Champion">1</div>`;
            } else if (rank === 2) {
                rankElementHtml = `<div class="rank-badge-ribbon rank-ribbon-2 shadow-sm" title="Rank 2 - Silver Leader">2</div>`;
            } else if (rank === 3) {
                rankElementHtml = `<div class="rank-badge-ribbon rank-ribbon-3 shadow-sm" title="Rank 3 - Bronze Achiever">3</div>`;
            } else {
                rankElementHtml = `<div class="rank-number-plain ${isCurrentUser ? 'text-success fs-5' : ''}">#${rank}</div>`;
            }

            // Trophy icon
            let trophyIconHtml = '';
            if (rank === 1) {
                trophyIconHtml = `<i class="bi bi-trophy-fill trophy-badge-icon fs-3" style="color: #f59e0b;" title="Gold Champion"></i>`;
            } else if (rank === 2) {
                trophyIconHtml = `<i class="bi bi-trophy-fill trophy-badge-icon fs-4" style="color: #8b5cf6;" title="Silver Leader"></i>`;
            } else if (rank === 3) {
                trophyIconHtml = `<i class="bi bi-trophy-fill trophy-badge-icon fs-4" style="color: #3b82f6;" title="Bronze Achiever"></i>`;
            } else {
                trophyIconHtml = `<i class="bi bi-award-fill text-muted opacity-75 fs-5"></i>`;
            }

            // Badges showcase dots
            let badgeDotsHtml = '';
            if (isCurrentUser) {
                // Render the 3 custom featured badges
                featuredBadgeIds.forEach(fid => {
                    const catMatch = allCatalogBadges.find(b => b.id === fid);
                    if (catMatch) {
                        badgeDotsHtml += `
                            <span class="badge-slot-dot bg-white border shadow-xs position-relative user-badge-clickable" title="${catMatch.title} (Click to customize showcase badges)">
                                ${catMatch.icon}
                            </span>
                        `;
                    }
                });

                // Missing slots show "+" button
                const missingSlots = 3 - featuredBadgeIds.length;
                for (let s = 0; s < missingSlots; s++) {
                    badgeDotsHtml += `
                        <span class="badge-slot-dot user-add" title="Add / Customize Featured Badges">
                            <i class="bi bi-plus"></i>
                        </span>
                    `;
                }

                badgeDotsHtml = `
                    <div class="user-badges-showcase-group d-flex align-items-center" role="button" data-bs-toggle="modal" data-bs-target="#customizeFeaturedBadgesModal" title="Click to customize showcase">
                        ${badgeDotsHtml}
                    </div>
                `;
            } else {
                // Classmate top badges
                const stBadges = (student.badges || []).slice(0, 3);
                stBadges.forEach(b => {
                    const catMatch = allCatalogBadges.find(c => c.id === b.id) || {};
                    badgeDotsHtml += `
                        <span class="badge-slot-dot bg-white border shadow-xs position-relative" title="${b.name || 'Badge'}">
                            ${catMatch.icon || (b.icon ? `<i class="bi ${b.icon}"></i>` : (b.symbol || '⭐'))}
                        </span>
                    `;
                });
                badgeDotsHtml = `<div class="d-flex align-items-center">${badgeDotsHtml}</div>`;
            }

            row.innerHTML = `
                <div class="d-flex align-items-center gap-3">
                    ${rankElementHtml}
                    ${student.profilePictureUrl
                        ? `<img src="${student.profilePictureUrl}" class="rank-avatar" alt="">`
                        : `<div class="rank-avatar-icon"><i class="bi bi-person-fill"></i></div>`}
                    <div>
                        <div class="fw-bold text-dark fs-6">
                            ${student.name}
                            ${isCurrentUser ? '<span class="badge bg-success text-white micro-text fw-bold ms-1.5 px-2 py-0.5 rounded-pill shadow-xs">You</span>' : ''}
                        </div>
                        ${student.section ? `<div class="micro-text text-muted">${student.section}</div>` : ''}
                    </div>
                </div>
                <div class="d-flex align-items-center gap-3">
                    <div class="d-none d-sm-flex align-items-center">
                        ${badgeDotsHtml}
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        ${trophyIconHtml}
                        <div class="text-end">
                            <span class="fw-bold ${isCurrentUser ? 'text-success fs-5' : 'text-dark fs-6'} text-nowrap">${student.points} pts</span>
                            <div class="text-muted" style="font-size: 0.7rem;">${student.badgeCount || 0} badge${student.badgeCount === 1 ? '' : 's'}</div>
                        </div>
                    </div>
                </div>
            `;

            container.appendChild(row);
        });
    }

    // 10. Scope is permanently locked to Section Leaderboard

    // 11. Render Badges (Track or Grid)
    function renderCustomizableBadges(earnedMap) {
        const categoryFilter = getStoredCategoryFilter();
        const sortMode = getStoredSortMode();
        const viewMode = getStoredViewMode();
        const isGridView = viewMode === 'grid';

        const targetContainer = isGridView ? badgesGridContainer : badgesScrollTrack;
        if (!targetContainer) return;
        targetContainer.innerHTML = '';

        // Filter by category
        let list = [...allCatalogBadges];
        if (categoryFilter !== 'all') {
            list = list.filter(b => b.category && (
                b.category.toLowerCase().includes(categoryFilter.toLowerCase()) || 
                categoryFilter.toLowerCase().includes(b.category.toLowerCase())
            ));
        }

        // Sort list
        const featuredIds = getStoredFeaturedBadges();

        if (sortMode === 'points') {
            list.sort((a, b) => b.points - a.points);
        } else if (sortMode === 'alphabetical') {
            list.sort((a, b) => a.title.localeCompare(b.title));
        } else {
            // 'recent' (Earned first)
            list.sort((a, b) => {
                const aEarned = earnedMap.has(a.id);
                const bEarned = earnedMap.has(b.id);
                if (aEarned && !bEarned) return -1;
                if (!aEarned && bEarned) return 1;
                return 0;
            });
        }

        if (list.length === 0) {
            targetContainer.innerHTML = `
                <div class="col-12 p-4 text-center text-muted w-100">
                    <i class="bi bi-funnel fs-4 d-block mb-1 text-secondary"></i>
                    No badges found in the "${categoryFilter}" category.
                </div>
            `;
            return;
        }

        list.forEach(badge => {
            const isEarned = earnedMap.has(badge.id);
            const earnedData = isEarned ? earnedMap.get(badge.id) : null;
            const isFeatured = featuredIds.includes(badge.id);
            const earnedDate = earnedData ? earnedData.date : 'Locked';

            const card = document.createElement('div');
            card.className = `badge-card ${isGridView ? '' : 'badge-card-horizontal'} ${isEarned ? '' : 'locked'} ${isFeatured ? 'featured-badge-glow' : ''} position-relative`;
            card.setAttribute('data-badge-id', badge.id);
            card.setAttribute('tabindex', '0');
            card.setAttribute('role', 'button');

            card.innerHTML = `
                ${isFeatured ? `<span class="position-absolute top-0 start-0 translate-middle-y badge rounded-pill bg-warning text-dark border border-white fw-bold shadow-xs ms-2 mt-2" style="font-size:0.6rem; z-index:3;"><i class="bi bi-pin-angle-fill me-0.5"></i>Pinned</span>` : ''}
                <div class="badge-icon-wrap" style="${isEarned ? `background:${badge.bg}; color:${badge.color};` : ''}">
                    ${badge.icon}
                </div>
                <div class="badge-name text-truncate" title="${badge.title}">${badge.title}</div>
                <div class="badge-meta">${earnedDate}</div>
            `;

            card.addEventListener('click', () => {
                openBadgeModal(badge, isEarned, earnedData);
            });

            targetContainer.appendChild(card);
        });
    }

    // 12. Render Main UI
    function renderAchievements() {
        const earnedMap = new Map(earnedBadges.map(b => [b.id, b]));

        // Counters
        const badgesEarnedDisplay = document.getElementById('badgesEarnedDisplay');
        const badgeCountPill = document.getElementById('badgeCountPill');
        const badgesEarnedSubText = document.getElementById('badgesEarnedSubText');

        const filterCountAll = document.getElementById('filterCountAll');
        const filterCountEarned = document.getElementById('filterCountEarned');
        const filterCountLocked = document.getElementById('filterCountLocked');

        if (badgesEarnedDisplay) badgesEarnedDisplay.textContent = earnedBadges.length;
        if (badgeCountPill) badgeCountPill.textContent = `${earnedBadges.length} Unlocked`;
        if (badgesEarnedSubText) {
            const lockedCount = Math.max(0, allCatalogBadges.length - earnedBadges.length);
            badgesEarnedSubText.textContent = `${lockedCount} more to unlock`;
        }

        if (filterCountAll) filterCountAll.textContent = allCatalogBadges.length;
        if (filterCountEarned) filterCountEarned.textContent = earnedBadges.length;
        if (filterCountLocked) filterCountLocked.textContent = Math.max(0, allCatalogBadges.length - earnedBadges.length);

        // Render Customizable Badges
        renderCustomizableBadges(earnedMap);

        // Render Recent Activities from Backend
        const recentActivitiesList = document.getElementById('recentActivitiesList');
        if (recentActivitiesList) {
            recentActivitiesList.innerHTML = '';

            if (!studentActivities.length) {
                recentActivitiesList.innerHTML = `
                    <div class="p-4 text-center text-muted">
                        <i class="bi bi-clock-history fs-3 d-block mb-2 opacity-50"></i>
                        <div class="small fw-semibold">No recent activity yet</div>
                        <div class="micro-text">Complete quizzes and attend classes to earn badges and points!</div>
                    </div>
                `;
            } else {
                studentActivities.slice(0, 5).forEach(act => {
                    const actEl = document.createElement('div');
                    actEl.className = 'activity-item-pill d-flex align-items-center justify-content-between gap-3';
                    actEl.innerHTML = `
                        <div class="d-flex align-items-center gap-3">
                            <div class="icon-box-lg bg-success-subtle text-success rounded-circle" style="width: 36px; height: 36px;">
                                <i class="bi bi-patch-check-fill fs-5"></i>
                            </div>
                            <div>
                                <div class="fw-bold text-dark small">${act.description}</div>
                                <div class="micro-text text-muted">Achievement Activity</div>
                            </div>
                        </div>
                        <span class="micro-text text-muted text-nowrap">${formatRelativeTime(act.created_at)}</span>
                    `;
                    recentActivitiesList.appendChild(actEl);
                });
            }
        }
    }

    // 13. Render All Badges Modal Grid (Directory)
    function renderModalBadges() {
        const allBadgesModalGrid = document.getElementById('allBadgesModalGrid');
        if (!allBadgesModalGrid) return;

        const earnedMap = new Map(earnedBadges.map(b => [b.id, b]));

        let filteredList = allCatalogBadges;
        if (currentModalFilter === 'earned') {
            filteredList = allCatalogBadges.filter(b => earnedMap.has(b.id));
        } else if (currentModalFilter === 'locked') {
            filteredList = allCatalogBadges.filter(b => !earnedMap.has(b.id));
        }

        allBadgesModalGrid.innerHTML = '';

        if (filteredList.length === 0) {
            allBadgesModalGrid.innerHTML = `<div class="col-12 text-center text-muted py-4"><i class="bi bi-award fs-2 d-block mb-2 text-secondary"></i>No badges match the selected filter.</div>`;
            return;
        }

        filteredList.forEach(badge => {
            const isEarned = earnedMap.has(badge.id);
            const earnedData = isEarned ? earnedMap.get(badge.id) : null;
            const earnedDate = earnedData ? earnedData.date : 'Locked';

            const col = document.createElement('div');
            col.className = 'col';

            col.innerHTML = `
                <div class="badge-card h-100 ${isEarned ? '' : 'locked'} position-relative" data-badge-id="${badge.id}" tabindex="0" role="button">
                    <div class="badge-icon-wrap" style="${isEarned ? `background:${badge.bg}; color:${badge.color};` : ''}">
                        ${badge.icon}
                    </div>
                    <div class="badge-name text-truncate" title="${badge.title}">${badge.title}</div>
                    <div class="badge-meta">${earnedDate}</div>
                </div>
            `;

            col.querySelector('.badge-card').addEventListener('click', () => {
                openBadgeModal(badge, isEarned, earnedData);
            });

            allBadgesModalGrid.appendChild(col);
        });
    }

    // Filter Buttons in All Badges Modal
    const badgeFilterBtns = document.querySelectorAll('.badge-filter-btn');
    badgeFilterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            badgeFilterBtns.forEach(b => {
                b.classList.remove('active', 'btn-success');
                b.classList.add('btn-light', 'text-muted');
            });
            btn.classList.add('active', 'btn-success');
            btn.classList.remove('btn-light', 'text-muted');

            currentModalFilter = btn.getAttribute('data-filter');
            renderModalBadges();
        });
    });

    // 14. Badge Info Modal
    function openBadgeModal(badge, isEarned, earnedData) {
        const modalBadgeIcon = document.getElementById('modalBadgeIcon');
        const modalBadgeTitle = document.getElementById('modalBadgeTitle');
        const modalBadgeStatus = document.getElementById('modalBadgeStatus');
        const modalBadgeDesc = document.getElementById('modalBadgeDesc');
        const modalBadgeReq = document.getElementById('modalBadgeReq');

        if (modalBadgeIcon) {
            modalBadgeIcon.innerHTML = badge.icon;
            if (isEarned) {
                modalBadgeIcon.style.background = badge.bg || '#eef7ee';
                modalBadgeIcon.style.color = badge.color || '#0a5c2c';
            } else {
                modalBadgeIcon.style.background = '#f1f1f1';
                modalBadgeIcon.style.color = '#888';
            }
        }
        if (modalBadgeTitle) modalBadgeTitle.textContent = badge.title;
        if (modalBadgeDesc) modalBadgeDesc.textContent = badge.description;
        if (modalBadgeReq) modalBadgeReq.textContent = badge.requirement;

        if (modalBadgeStatus) {
            if (isEarned) {
                const dateStr = earnedData ? earnedData.date : 'Recently';
                const byStr = earnedData && earnedData.awardedBy ? ` (${earnedData.awardedBy})` : '';

                modalBadgeStatus.innerHTML = `
                    <div class="d-flex align-items-center gap-2 flex-wrap justify-content-center">
                        <span class="badge bg-success-subtle text-success rounded-pill px-3 py-1 fw-bold">
                            <i class="bi bi-check-circle-fill me-1"></i> Earned ${dateStr}${byStr} (+${badge.points} pts)
                        </span>
                    </div>
                `;
            } else {
                modalBadgeStatus.innerHTML = `<span class="badge bg-secondary-subtle text-secondary rounded-pill px-3 py-1 fw-bold"><i class="bi bi-lock-fill me-1"></i> Locked Badge (+${badge.points} pts upon unlock)</span>`;
            }
        }

        if (badgeModalInstance) badgeModalInstance.show();
    }

    // 15. Showcase Customizer Modal Logic
    if (customizeModalEl) {
        customizeModalEl.addEventListener('show.bs.modal', () => {
            openCustomizerModal();
        });
    }

    function openCustomizerModal() {
        tempFeaturedBadgeIds = [...getStoredFeaturedBadges()];
        tempAuraTheme = getStoredAuraTheme();
        currentActiveSlotIndex = 0;

        renderCustomizerSlots();
        renderCustomizerUnlockedList();
        renderCustomizerThemeSelector();
        renderCustomizerPreview();
    }

    function renderCustomizerSlots() {
        for (let i = 0; i < 3; i++) {
            const slotCard = document.getElementById(`customSlot${i}`);
            if (!slotCard) continue;

            slotCard.classList.remove('active-slot', 'equipped');
            if (i === currentActiveSlotIndex) slotCard.classList.add('active-slot');

            const badgeId = tempFeaturedBadgeIds[i];
            const iconEl = slotCard.querySelector('.slot-icon');
            const nameEl = slotCard.querySelector('.slot-name');
            const pointsEl = slotCard.querySelector('.slot-points');

            if (badgeId) {
                const catBadge = allCatalogBadges.find(b => b.id === badgeId);
                slotCard.classList.add('equipped');
                if (iconEl) iconEl.innerHTML = catBadge ? catBadge.icon : '⭐';
                if (nameEl) nameEl.textContent = catBadge ? catBadge.title : badgeId;
                if (pointsEl) pointsEl.textContent = catBadge ? `+${catBadge.points} pts` : '+10 pts';
            } else {
                if (iconEl) iconEl.textContent = '⭐';
                if (nameEl) nameEl.textContent = 'Empty Slot';
                if (pointsEl) pointsEl.textContent = 'Click to assign';
            }
        }
    }

    function renderCustomizerUnlockedList() {
        const listContainer = document.getElementById('customizerUnlockedBadgesList');
        if (!listContainer) return;

        listContainer.innerHTML = '';

        if (!earnedBadges || earnedBadges.length === 0) {
            listContainer.innerHTML = `<div class="text-muted small py-2"><i class="bi bi-info-circle me-1"></i>You haven't unlocked any badges yet. Earn badges from your teacher to feature them here!</div>`;
            return;
        }

        earnedBadges.forEach(badge => {
            const isEquipped = tempFeaturedBadgeIds.includes(badge.id);

            const pill = document.createElement('div');
            pill.className = `equip-badge-pill d-flex align-items-center gap-2 ${isEquipped ? 'is-equipped' : ''}`;
            pill.setAttribute('data-badge-id', badge.id);
            pill.setAttribute('role', 'button');

            pill.innerHTML = `
                <span class="fs-5">${badge.icon}</span>
                <div>
                    <div class="fw-bold text-dark text-sm">${badge.title || badge.id}</div>
                    <div class="micro-text text-muted">+${badge.points} pts</div>
                </div>
                ${isEquipped ? '<span class="badge bg-success-subtle text-success micro-text fw-bold rounded-pill ms-1">Featured</span>' : ''}
            `;

            pill.addEventListener('click', () => {
                equipBadgeToActiveSlot(badge.id);
            });

            listContainer.appendChild(pill);
        });
    }

    function equipBadgeToActiveSlot(badgeId) {
        tempFeaturedBadgeIds = tempFeaturedBadgeIds.map(id => id === badgeId ? null : id);
        tempFeaturedBadgeIds[currentActiveSlotIndex] = badgeId;
        currentActiveSlotIndex = (currentActiveSlotIndex + 1) % 3;

        renderCustomizerSlots();
        renderCustomizerUnlockedList();
        renderCustomizerPreview();
    }

    function clearShowcaseSlot(slotIndex) {
        tempFeaturedBadgeIds[slotIndex] = null;
        currentActiveSlotIndex = slotIndex;

        renderCustomizerSlots();
        renderCustomizerUnlockedList();
        renderCustomizerPreview();
    }

    for (let i = 0; i < 3; i++) {
        const slotCard = document.getElementById(`customSlot${i}`);
        if (slotCard) {
            slotCard.addEventListener('click', (e) => {
                if (e.target.closest('.btn-slot-clear')) return;
                currentActiveSlotIndex = i;
                renderCustomizerSlots();
            });

            const clearBtn = slotCard.querySelector('.btn-slot-clear');
            if (clearBtn) {
                clearBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    clearShowcaseSlot(i);
                });
            }
        }
    }

    function renderCustomizerThemeSelector() {
        const themePills = document.querySelectorAll('.theme-pill-option');
        themePills.forEach(pill => {
            const theme = pill.getAttribute('data-theme');
            if (theme === tempAuraTheme) {
                pill.classList.add('active');
            } else {
                pill.classList.remove('active');
            }

            pill.onclick = () => {
                tempAuraTheme = theme;
                renderCustomizerThemeSelector();
                renderCustomizerPreview();
            };
        });
    }

    function renderCustomizerPreview() {
        const previewContainer = document.getElementById('customizerLeaderboardPreview');
        if (!previewContainer) return;

        const me = leaderboardList.find(s => s.id === STUDENT_ID || s.idNumber === user.id_number);
        const userRank = me ? me.rank : 1;
        const userPoints = me ? me.points : earnedBadges.reduce((sum, b) => sum + (b.points || 10), 0);

        let previewBadgeDots = '';
        tempFeaturedBadgeIds.filter(Boolean).forEach(fid => {
            const badge = allCatalogBadges.find(b => b.id === fid);
            if (badge) {
                previewBadgeDots += `
                    <span class="badge-slot-dot bg-white border shadow-xs" title="${badge.title}">
                        ${badge.icon}
                    </span>
                `;
            }
        });

        let rankBadgeHtml = `<div class="rank-number-plain text-success fw-bold" style="width:28px; font-size:0.9rem;">#${userRank}</div>`;
        let trophyHtml = `<i class="bi bi-award-fill text-muted opacity-75 fs-5"></i>`;

        if (userRank === 1) {
            rankBadgeHtml = `<div class="rank-badge-ribbon rank-ribbon-1 shadow-sm" style="width:28px; height:28px; font-size:0.75rem;" title="Rank 1">1</div>`;
            trophyHtml = `<i class="bi bi-trophy-fill trophy-badge-icon fs-5" style="color: #f59e0b;"></i>`;
        } else if (userRank === 2) {
            rankBadgeHtml = `<div class="rank-badge-ribbon rank-ribbon-2 shadow-sm" style="width:28px; height:28px; font-size:0.75rem;" title="Rank 2">2</div>`;
            trophyHtml = `<i class="bi bi-trophy-fill trophy-badge-icon fs-5" style="color: #8b5cf6;"></i>`;
        } else if (userRank === 3) {
            rankBadgeHtml = `<div class="rank-badge-ribbon rank-ribbon-3 shadow-sm" style="width:28px; height:28px; font-size:0.75rem;" title="Rank 3">3</div>`;
            trophyHtml = `<i class="bi bi-trophy-fill trophy-badge-icon fs-5" style="color: #3b82f6;"></i>`;
        }

        previewContainer.innerHTML = `
            <div class="leaderboard-row d-flex align-items-center justify-content-between gap-3 highlighted-user-row ${tempAuraTheme} p-2.5 rounded-3">
                <div class="d-flex align-items-center gap-3">
                    ${rankBadgeHtml}
                    <div class="fw-bold text-dark text-sm">${STUDENT_NAME} <span class="badge bg-success text-white micro-text ms-1">You</span></div>
                </div>
                <div class="d-flex align-items-center gap-3">
                    <div class="d-flex align-items-center">
                        ${previewBadgeDots || '<span class="text-muted micro-text fst-italic">No featured badges</span>'}
                    </div>
                    <div class="d-flex align-items-center gap-1.5">
                        ${trophyHtml}
                        <span class="fw-bold text-success text-sm text-nowrap">${userPoints} pts (Rank #${userRank})</span>
                    </div>
                </div>
            </div>
        `;
    }

    const btnResetShowcaseDefaults = document.getElementById('btnResetShowcaseDefaults');
    if (btnResetShowcaseDefaults) {
        btnResetShowcaseDefaults.addEventListener('click', () => {
            tempFeaturedBadgeIds = earnedBadges.slice(0, 3).map(b => b.id);
            tempAuraTheme = 'aura-emerald';
            currentActiveSlotIndex = 0;

            renderCustomizerSlots();
            renderCustomizerUnlockedList();
            renderCustomizerThemeSelector();
            renderCustomizerPreview();
        });
    }

    const btnSaveCustomDisplay = document.getElementById('btnSaveCustomDisplay');
    if (btnSaveCustomDisplay) {
        btnSaveCustomDisplay.addEventListener('click', () => {
            const cleanedIds = tempFeaturedBadgeIds.filter(Boolean);
            localStorage.setItem(STORAGE_KEY_FEATURED_BADGES, JSON.stringify(cleanedIds));
            localStorage.setItem(STORAGE_KEY_AURA_THEME, tempAuraTheme);

            if (customizeModalInstance) customizeModalInstance.hide();
            renderAchievements();
            renderLeaderboardUI();
        });
    }

    // 16. Challenges / Goals Click Handlers
    const challengeItems = document.querySelectorAll('.challenge-item-pill');
    challengeItems.forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.star-favorite-btn')) return;

            const challengeKey = item.getAttribute('data-challenge');
            const challenge = CHALLENGES_DATABASE[challengeKey];
            if (!challenge) return;

            const challengeTitle = document.getElementById('challengeTitle');
            const challengeReward = document.getElementById('challengeReward');
            const challengeDesc = document.getElementById('challengeDesc');
            const challengeActionText = document.getElementById('challengeActionText');
            const challengeActionBtn = document.getElementById('challengeActionBtn');
            const challengeIconBox = document.getElementById('challengeIconBox');

            if (challengeTitle) challengeTitle.textContent = challenge.title;
            if (challengeReward) challengeReward.textContent = challenge.reward;
            if (challengeDesc) challengeDesc.textContent = challenge.desc;
            if (challengeActionText) challengeActionText.textContent = challenge.actionText;

            if (challengeIconBox) {
                challengeIconBox.className = `icon-box-lg ${challenge.bgClass} rounded-circle`;
                challengeIconBox.innerHTML = `<i class="bi ${challenge.iconClass} fs-4"></i>`;
            }

            if (challengeActionBtn) {
                challengeActionBtn.textContent = challenge.btnText;
                challengeActionBtn.href = challenge.btnHref;
            }

            if (challengeModalInstance) challengeModalInstance.show();
        });
    });

    // 17. Favorite Star Toggle
    const starBtns = document.querySelectorAll('.star-favorite-btn');
    starBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const icon = btn.querySelector('i');
            if (!icon) return;

            if (icon.classList.contains('bi-star')) {
                icon.classList.remove('bi-star');
                icon.classList.add('bi-star-fill');
                btn.classList.add('active');
            } else {
                icon.classList.remove('bi-star-fill');
                icon.classList.add('bi-star');
                btn.classList.remove('active');
            }
        });
    });

    // 18. Initial View Mode Setup & Data Load
    setViewMode(getStoredViewMode());
    await loadData();

    // 19. Smooth scroll if navigating directly to leaderboard anchor
    if (window.location.hash === '#classLeaderboardContainer') {
        setTimeout(() => {
            const el = document.getElementById('classLeaderboardContainer');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 300);
    }
});
