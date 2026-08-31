/**
 * Achievements & Rewards Student Portal Script
 * Mentorae Platform AY 2025-2026
 * Real-time synchronization with Teacher Class Management Badge Awarding Workflow
 * Duplicate Badge Multiplier / Count Badge Support
 */
document.addEventListener('DOMContentLoaded', async () => {
    // 0. Session Guard & Logout
    const { token, user } = requireSession('../login.html', ['student', 'admin']);
    wireLogout('logoutBtn', '../login.html');

    const CURRENT_STUDENT_NAME = user.full_name || "Juan Dela Cruz";
    const STORAGE_KEY_STUDENT_BADGES = 'mentorae_student_badges';
    const STORAGE_KEY_ACTIVITIES = 'mentorae_student_activities';
    const STORAGE_KEY_FEATURED_BADGES = 'mentorae_featured_badges';
    const STORAGE_KEY_AURA_THEME = 'mentorae_aura_theme';
    const STORAGE_KEY_BADGE_SORT = 'mentorae_badge_sort';
    const STORAGE_KEY_BADGE_CATEGORY = 'mentorae_badge_category';
    const STORAGE_KEY_BADGE_VIEW = 'mentorae_badge_view';

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

    // 2. Comprehensive Master Badges Catalog
    const ALL_BADGES_CATALOG = [
        {
            id: 'perfect_attendance',
            title: 'Perfect Attendance',
            icon: '🎯',
            category: 'Attendance',
            description: 'Awarded to students who maintained a 100% on-time attendance record for the entire month without unexcused absences or tardiness.',
            requirement: 'Achieve 100% attendance rate with zero tardiness across all enrolled subject periods.',
            points: 100
        },
        {
            id: 'honor_student',
            title: 'Honor Student',
            icon: '🏆',
            category: 'Academics',
            description: 'Awarded by subject teachers and class advisers to recognize outstanding academic performance, mastery, and general weighted excellence (GWA 90+).',
            requirement: 'Awarded directly by the teacher upon quarterly honors verification and academic excellence evaluation.',
            points: 150
        },
        {
            id: 'quiz_master',
            title: 'Quiz Master',
            icon: '🧠',
            category: 'Academics',
            description: 'Awarded by the subject teacher when a student passes or excels in their face-to-face (F2F) classroom written quizzes and periodic assessments.',
            requirement: 'Passed or scored high marks in face-to-face (F2F) classroom quizzes as evaluated and awarded by the subject teacher.',
            points: 120
        },
        {
            id: 'early_bird',
            title: 'Early Bird',
            icon: '🌅',
            category: 'Attendance',
            description: 'Consistently logged attendance QR codes before 7:15 AM for 15 consecutive school days.',
            requirement: 'Scan QR attendance before 7:15 AM on 15 consecutive school days.',
            points: 80
        },
        {
            id: 'top_scorer',
            title: 'Top Scorer',
            icon: '🅰️',
            category: 'Academics',
            description: 'Achieved the highest score on quizzes, periodic exams, or major performance tasks in class.',
            requirement: 'Obtain the top score in a unit examination or major performance task evaluation.',
            points: 150
        },
        {
            id: 'most_active',
            title: 'Most Active',
            icon: '👍',
            category: 'Participation',
            description: 'Consistently participates in classroom discussions, raises insightful inquiries, and completes daily interactive modules.',
            requirement: 'Awarded by subject teacher for vibrant classroom recitation and active engagement.',
            points: 100
        },
        {
            id: 'innovative_thinker',
            title: 'Innovative Thinker',
            icon: '💡',
            category: 'Creativity',
            description: 'Demonstrated creative problem-solving, novel project prototypes, or unique approaches to STEM inquiries.',
            requirement: 'Proposed a unique solution or innovative project design in laboratory or class tasks.',
            points: 120
        },
        {
            id: 'team_captain',
            title: 'Team Captain',
            icon: '⭐',
            category: 'Leadership',
            description: 'Demonstrated exemplary leadership, communication, and peer coordination in group laboratory projects.',
            requirement: 'Elected group leader who successfully guided a collaborative project to high completion.',
            points: 100
        },
        {
            id: 'resilient_thinker',
            title: 'Resilient Thinker',
            icon: '💎',
            category: 'Growth Mindset',
            description: 'Persevered through challenging subject concepts, embraced feedback, and showed outstanding grit.',
            requirement: 'Demonstrated remarkable turnaround and persistent effort in overcoming complex lessons.',
            points: 100
        },
        {
            id: 'completed_grades',
            title: 'Completed Grades',
            icon: '📅',
            category: 'Compliance',
            description: 'Submitted 100% of all required homework, laboratory reports, and performance tasks on time.',
            requirement: 'Zero missing deliverables or late submissions across all grading terms.',
            points: 80
        },
        {
            id: 'recitation_master',
            title: 'Recitation Master',
            icon: '💬',
            category: 'Communication',
            description: 'Consistently articulate, clear, and confident in oral recitations and classroom presentations.',
            requirement: 'Active contributor in subject recitations with articulate, evidence-backed answers.',
            points: 90
        },
        {
            id: 'critical_thinker',
            title: 'Critical Thinker',
            icon: '🔍',
            category: 'Analysis',
            description: 'Formulates deep analytical questions, challenges hypotheses with evidence, and applies scientific logic.',
            requirement: 'Demonstrated exceptional logical deduction in laboratory analysis and problem sets.',
            points: 110
        },
        {
            id: 'coacher',
            title: 'Coacher / Peer Tutor',
            icon: '🤝',
            category: 'Collaboration',
            description: 'Acts as a dedicated peer tutor, patiently assisting fellow students during group study sessions.',
            requirement: 'Recognized for helping classmates review and master difficult subject topics.',
            points: 120
        },
        {
            id: 'top_performer',
            title: 'Top Performer',
            icon: '🎖️',
            category: 'Excellence',
            description: 'All-around outstanding performance in academic standing, classroom conduct, and school activities.',
            requirement: 'Consistently in top tier academic standing and stellar discipline record.',
            points: 150
        },
        {
            id: 'most_improved',
            title: 'Most Improved',
            icon: '📈',
            category: 'Growth',
            description: 'Achieved the most significant upward progression in quarterly evaluation grades and performance scores.',
            requirement: 'Boosted General Weighted Average by 5+ points across quarterly evaluation cycles.',
            points: 130
        },
        {
            id: 'deped_values',
            title: 'Core Values Award',
            icon: '🌟',
            category: 'Character',
            description: 'Exemplifies the DepEd Core Values: Maka-Diyos, Makatao, Makakalikasan, and Makabansa.',
            requirement: 'Exemplary demonstration of moral integrity, environmental stewardship, and respect for all.',
            points: 100
        },
        {
            id: 'punctuality_champ',
            title: 'Punctuality Champ',
            icon: '⏰',
            category: 'Discipline',
            description: 'Never late to morning school entry and class period transitions throughout the semester.',
            requirement: 'Zero tardiness records across all periods for consecutive 40 school days.',
            points: 90
        },
        {
            id: 'helping_hand',
            title: 'Helping Hand',
            icon: '❤️',
            category: 'Service',
            description: 'Voluntary service in assisting teachers, organizing laboratory equipment, and supporting campus initiatives.',
            requirement: 'Demonstrated selfless service and volunteerism in campus learning activities.',
            points: 80
        }
    ];

    // 3. Initial Default Badges for Juan Dela Cruz
    const DEFAULT_INITIAL_BADGES = [
        { id: "perfect_attendance", name: "Perfect Attendance", count: 2, date: "4/15/2026", points: 100, awardedBy: "Teacher (Mr. Santos)" },
        { id: "honor_student", name: "Honor Student", count: 1, date: "3/20/2026", points: 150, awardedBy: "Teacher (Mr. Santos)" },
        { id: "quiz_master", name: "Quiz Master", count: 3, date: "4/10/2026", points: 120, awardedBy: "Teacher (Mr. Santos)" },
        { id: "early_bird", name: "Early Bird", count: 1, date: "4/1/2026", points: 80, awardedBy: "Teacher (Mr. Santos)" }
    ];

    const DEFAULT_INITIAL_ACTIVITIES = [
        { title: "Quiz Completed", subtitle: "Earned 50 points", time: "2h ago", icon: "bi-patch-check-fill", color: "text-success" },
        { title: "Badge Unlocked", subtitle: "Perfect Attendance (x2) (+100 pts)", time: "1d ago", icon: "bi-award-fill", color: "text-warning" },
        { title: "Milestone Reached", subtitle: "800 total points", time: "2d ago", icon: "bi-star-fill", color: "text-purple" }
    ];

    // 4. Retrieve Badges and Activities from Storage
    function getStoredBadges() {
        let allBadges = {};
        try {
            allBadges = JSON.parse(localStorage.getItem(STORAGE_KEY_STUDENT_BADGES)) || {};
        } catch (e) {
            allBadges = {};
        }

        let updated = false;

        if (allBadges[CURRENT_STUDENT_NAME] === undefined) {
            allBadges[CURRENT_STUDENT_NAME] = [...DEFAULT_INITIAL_BADGES];
            updated = true;
        }

        SECTION_STUDENTS_ROSTER.forEach(st => {
            if (!st.isCurrentUser && allBadges[st.name] === undefined) {
                allBadges[st.name] = JSON.parse(JSON.stringify(st.defaultBadges || []));
                updated = true;
            }
        });

        if (updated) {
            localStorage.setItem(STORAGE_KEY_STUDENT_BADGES, JSON.stringify(allBadges));
        }

        return allBadges[CURRENT_STUDENT_NAME] || [];
    }

    function getStoredActivities() {
        let allActivities = {};
        try {
            allActivities = JSON.parse(localStorage.getItem(STORAGE_KEY_ACTIVITIES)) || {};
        } catch (e) {
            allActivities = {};
        }

        if (allActivities[CURRENT_STUDENT_NAME] === undefined) {
            allActivities[CURRENT_STUDENT_NAME] = [...DEFAULT_INITIAL_ACTIVITIES];
            localStorage.setItem(STORAGE_KEY_ACTIVITIES, JSON.stringify(allActivities));
        }

        return allActivities[CURRENT_STUDENT_NAME] || [];
    }

    // 5. Challenges / Point Goals Database
    const CHALLENGES_DATABASE = {
        quiz: {
            title: 'Perfect in Quiz',
            reward: '+70 Points',
            iconClass: 'bi-stars text-success',
            bgClass: 'bg-success-subtle',
            desc: 'Achieve a perfect 100% score in any subject practice quiz or evaluation module.',
            actionText: 'Go to Learning Resources, select your subject, and take any practice quiz.',
            btnText: 'Open Learning Resources',
            btnHref: 'learning_resources_student.html'
        },
        attendance: {
            title: 'Perfect Attendance Week',
            reward: '+20 Points',
            iconClass: 'bi-bullseye text-primary',
            bgClass: 'bg-primary-subtle',
            desc: 'Attend all classes on time from Monday through Friday without any tardiness or absences.',
            actionText: 'Scan your QR code daily at the classroom gate or during period attendance.',
            btnText: 'View Attendance Logs',
            btnHref: 'attendance_student.html'
        },
        grades: {
            title: 'Grade Improvement',
            reward: '+15 Points',
            iconClass: 'bi-graph-up-arrow text-purple',
            bgClass: 'bg-purple-subtle',
            desc: 'Increase your quarterly subject evaluation score compared to the previous quarter.',
            actionText: 'Review your current subject grades, GWA breakdown, and SF9 progress.',
            btnText: 'View Grade & Performance',
            btnHref: 'grade_performance_student.html'
        }
    };

    // 6. Modal Initializations
    const badgeModalEl = document.getElementById('badgeModal');
    const challengeModalEl = document.getElementById('challengeModal');
    const allBadgesModalEl = document.getElementById('allBadgesModal');
    const customizeModalEl = document.getElementById('customizeFeaturedBadgesModal');

    let badgeModalInstance = null;
    let challengeModalInstance = null;
    let allBadgesModalInstance = null;
    let customizeModalInstance = null;

    if (badgeModalEl && typeof bootstrap !== 'undefined') {
        badgeModalInstance = new bootstrap.Modal(badgeModalEl);
    }
    if (challengeModalEl && typeof bootstrap !== 'undefined') {
        challengeModalInstance = new bootstrap.Modal(challengeModalEl);
    }
    if (allBadgesModalEl && typeof bootstrap !== 'undefined') {
        allBadgesModalInstance = new bootstrap.Modal(allBadgesModalEl);
    }
    if (customizeModalEl && typeof bootstrap !== 'undefined') {
        customizeModalInstance = new bootstrap.Modal(customizeModalEl);
    }

    // 7. Showcase & Display Preference Helper Functions
    function getStoredFeaturedBadges(earnedBadges) {
        let stored = null;
        try {
            stored = JSON.parse(localStorage.getItem(STORAGE_KEY_FEATURED_BADGES));
        } catch (e) {
            stored = null;
        }

        if (Array.isArray(stored) && stored.length > 0) {
            // Keep up to 3 valid slots
            return stored.slice(0, 3);
        }

        // Fallback default: first 3 unlocked badges of current student
        const defaultFeatured = (earnedBadges || []).slice(0, 3).map(b => b.id);
        return defaultFeatured;
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

    // 8. Horizontal Scroll & Toolbar Navigation Controls
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

    // Restore toolbar select states
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

    // Category Filter Change
    if (badgeCategoryFilter) {
        badgeCategoryFilter.addEventListener('change', (e) => {
            localStorage.setItem(STORAGE_KEY_BADGE_CATEGORY, e.target.value);
            renderAchievements();
        });
    }

    // Sort Select Change
    if (badgeSortSelect) {
        badgeSortSelect.addEventListener('change', (e) => {
            localStorage.setItem(STORAGE_KEY_BADGE_SORT, e.target.value);
            renderAchievements();
        });
    }

    // View Mode Toggle (Carousel vs Grid)
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

    // 9. Render All Badges Modal Grid with Filters
    function renderModalBadges() {
        const allBadgesModalGrid = document.getElementById('allBadgesModalGrid');
        if (!allBadgesModalGrid) return;

        const earnedBadges = getStoredBadges();
        const earnedMap = new Map(earnedBadges.map(b => [b.id, b]));

        // Filter catalog
        let filteredList = ALL_BADGES_CATALOG;
        if (currentModalFilter === 'earned') {
            filteredList = ALL_BADGES_CATALOG.filter(b => earnedMap.has(b.id));
        } else if (currentModalFilter === 'locked') {
            filteredList = ALL_BADGES_CATALOG.filter(b => !earnedMap.has(b.id));
        }

        allBadgesModalGrid.innerHTML = '';

        if (filteredList.length === 0) {
            allBadgesModalGrid.innerHTML = `<div class="col-12 text-center text-muted py-4"><i class="bi bi-award fs-2 d-block mb-2 text-secondary"></i>No badges match the selected filter.</div>`;
            return;
        }

        filteredList.forEach(badge => {
            const isEarned = earnedMap.has(badge.id);
            const earnedData = isEarned ? earnedMap.get(badge.id) : null;
            const badgeCount = earnedData ? (parseInt(earnedData.count, 10) || 1) : 0;
            const earnedDate = earnedData ? (earnedData.date || 'Earned') : 'Locked';

            const col = document.createElement('div');
            col.className = 'col';

            col.innerHTML = `
                <div class="badge-card h-100 ${isEarned ? '' : 'locked'} position-relative" data-badge-id="${badge.id}" tabindex="0" role="button">
                    ${isEarned && badgeCount > 1 ? `<span class="badge-count-pill" title="Awarded ${badgeCount} times">×${badgeCount}</span>` : ''}
                    <div class="badge-icon-wrap">
                        ${isEarned ? badge.icon : '⭐'}
                    </div>
                    <div class="badge-name text-truncate" title="${badge.title}">${badge.title}</div>
                    <div class="badge-meta">${isEarned && badgeCount > 1 ? `${badgeCount}x Awarded` : earnedDate}</div>
                </div>
            `;

            col.querySelector('.badge-card').addEventListener('click', () => {
                openBadgeModal(badge, isEarned, earnedData);
            });

            allBadgesModalGrid.appendChild(col);
        });
    }

    // Filter Button Click Handlers in All Badges Modal
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

    // 10. Render Customizable Badges (Track or Grid)
    function renderCustomizableBadges(earnedBadges, earnedMap) {
        const categoryFilter = getStoredCategoryFilter();
        const sortMode = getStoredSortMode();
        const viewMode = getStoredViewMode();
        const isGridView = viewMode === 'grid';

        const targetContainer = isGridView ? badgesGridContainer : badgesScrollTrack;
        if (!targetContainer) return;
        targetContainer.innerHTML = '';

        // 1. Filter by category
        let list = [...ALL_BADGES_CATALOG];
        if (categoryFilter !== 'all') {
            list = list.filter(b => b.category && (
                b.category.toLowerCase().includes(categoryFilter.toLowerCase()) || 
                categoryFilter.toLowerCase().includes(b.category.toLowerCase())
            ));
        }

        // 2. Sort list
        const featuredIds = getStoredFeaturedBadges(earnedBadges);

        if (sortMode === 'points') {
            list.sort((a, b) => b.points - a.points);
        } else if (sortMode === 'multipliers') {
            list.sort((a, b) => {
                const countA = earnedMap.has(a.id) ? (parseInt(earnedMap.get(a.id).count, 10) || 1) : 0;
                const countB = earnedMap.has(b.id) ? (parseInt(earnedMap.get(b.id).count, 10) || 1) : 0;
                return countB - countA;
            });
        } else if (sortMode === 'alphabetical') {
            list.sort((a, b) => a.title.localeCompare(b.title));
        } else {
            // Default: 'recent' (Earned first, then locked)
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
            const badgeCount = earnedData ? (parseInt(earnedData.count, 10) || 1) : 0;
            const earnedDate = earnedData ? (earnedData.date || 'Earned') : 'Locked';
            const isFeatured = featuredIds.includes(badge.id);

            const card = document.createElement('div');
            card.className = `badge-card ${isGridView ? '' : 'badge-card-horizontal'} ${isEarned ? '' : 'locked'} ${isFeatured ? 'featured-badge-glow' : ''} position-relative`;
            card.setAttribute('data-badge-id', badge.id);
            card.setAttribute('tabindex', '0');
            card.setAttribute('role', 'button');

            card.innerHTML = `
                ${isFeatured ? `<span class="position-absolute top-0 start-0 translate-middle-y badge rounded-pill bg-warning text-dark border border-white fw-bold shadow-xs ms-2 mt-2" style="font-size:0.6rem; z-index:3;"><i class="bi bi-pin-angle-fill me-0.5"></i>Pinned</span>` : ''}
                ${isEarned && badgeCount > 1 ? `<span class="badge-count-pill" title="Awarded ${badgeCount} times">×${badgeCount}</span>` : ''}
                <div class="badge-icon-wrap">
                    ${isEarned ? badge.icon : '⭐'}
                </div>
                <div class="badge-name text-truncate" title="${badge.title}">${badge.title}</div>
                <div class="badge-meta">${isEarned && badgeCount > 1 ? `${badgeCount}x Awarded` : earnedDate}</div>
            `;

            card.addEventListener('click', () => {
                openBadgeModal(badge, isEarned, earnedData);
            });

            targetContainer.appendChild(card);
        });
    }

    // 11. Render Main UI Based on Storage Data
    function renderAchievements() {
        const earnedBadges = getStoredBadges();
        const earnedMap = new Map(earnedBadges.map(b => [b.id, b]));

        // Base points: 400 + sum of all earned badge points * their count
        const badgePointsSum = earnedBadges.reduce((sum, b) => {
            const cnt = parseInt(b.count, 10) || 1;
            const pts = parseInt(b.points, 10) || 100;
            return sum + (pts * cnt);
        }, 0);

        const totalPoints = 400 + badgePointsSum;

        // Total count of badges including multiples
        const totalBadgesEarnedCount = earnedBadges.reduce((sum, b) => sum + (parseInt(b.count, 10) || 1), 0);

        // Dynamic Class Section Leaderboard System
        renderClassLeaderboard(totalPoints, earnedBadges);

        // Update Overview Cards
        const totalPointsDisplay = document.getElementById('totalPointsDisplay');
        const badgesEarnedDisplay = document.getElementById('badgesEarnedDisplay');
        const userLeaderboardPointsDisplay = document.getElementById('userLeaderboardPointsDisplay');
        const badgeCountPill = document.getElementById('badgeCountPill');

        const filterCountAll = document.getElementById('filterCountAll');
        const filterCountEarned = document.getElementById('filterCountEarned');
        const filterCountLocked = document.getElementById('filterCountLocked');

        if (totalPointsDisplay) totalPointsDisplay.textContent = totalPoints;
        if (badgesEarnedDisplay) badgesEarnedDisplay.textContent = totalBadgesEarnedCount;
        if (userLeaderboardPointsDisplay) userLeaderboardPointsDisplay.textContent = `${totalPoints} pts`;
        if (badgeCountPill) badgeCountPill.textContent = `${totalBadgesEarnedCount} Unlocked`;

        if (filterCountAll) filterCountAll.textContent = ALL_BADGES_CATALOG.length;
        if (filterCountEarned) filterCountEarned.textContent = earnedBadges.length;
        if (filterCountLocked) filterCountLocked.textContent = Math.max(0, ALL_BADGES_CATALOG.length - earnedBadges.length);

        // Render Customizable Badges Track/Grid
        renderCustomizableBadges(earnedBadges, earnedMap);

        // Render Recent Activities
        const recentActivitiesList = document.getElementById('recentActivitiesList');
        if (recentActivitiesList) {
            const activities = getStoredActivities().slice(0, 5); // Take top 5
            recentActivitiesList.innerHTML = '';

            activities.forEach(act => {
                const actEl = document.createElement('div');
                actEl.className = 'activity-item-pill d-flex align-items-center justify-content-between gap-3';
                actEl.innerHTML = `
                    <div class="d-flex align-items-center gap-3">
                        <div class="icon-box-lg bg-success-subtle ${act.color || 'text-success'} rounded-circle" style="width: 36px; height: 36px;">
                            <i class="bi ${act.icon || 'bi-patch-check-fill'} fs-5"></i>
                        </div>
                        <div>
                            <div class="fw-bold text-dark small">${act.title}</div>
                            <div class="micro-text text-muted">${act.subtitle}</div>
                        </div>
                    </div>
                    <span class="micro-text text-muted text-nowrap">${act.time}</span>
                `;
                recentActivitiesList.appendChild(actEl);
            });
        }
    }

    // 12. Dynamic Class Leaderboard Engine with Custom Showcase Slots & Aura Theme
    const SECTION_STUDENTS_ROSTER = [
        { 
            id: "2024-12346", 
            name: "Maria Santos", 
            basePoints: 1320, 
            defaultBadges: [
                { id: "honor_student", name: "Honor Student", icon: "🏆", count: 2, points: 150 },
                { id: "top_scorer", name: "Top Scorer", icon: "🅰️", count: 2, points: 150 },
                { id: "perfect_attendance", name: "Perfect Attendance", icon: "🎯", count: 2, points: 100 },
                { id: "quiz_master", name: "Quiz Master", icon: "🧠", count: 1, points: 120 }
            ] 
        },
        { 
            id: "2024-12349", 
            name: "Carlos Reyes", 
            basePoints: 1230, 
            defaultBadges: [
                { id: "quiz_master", name: "Quiz Master", icon: "🧠", count: 2, points: 120 },
                { id: "innovative_thinker", name: "Innovative Thinker", icon: "💡", count: 2, points: 120 },
                { id: "team_captain", name: "Team Captain", icon: "⭐", count: 2, points: 100 },
                { id: "top_performer", name: "Top Performer", icon: "🎖️", count: 1, points: 150 }
            ] 
        },
        { 
            id: "2024-12348", 
            name: "Ana Reyes", 
            basePoints: 1040, 
            defaultBadges: [
                { id: "coacher", name: "Coacher", icon: "🤝", count: 2, points: 120 },
                { id: "most_active", name: "Most Active", icon: "👍", count: 2, points: 100 },
                { id: "resilient_thinker", name: "Resilient Thinker", icon: "💎", count: 2, points: 100 }
            ] 
        },
        { 
            id: "2024-12347", 
            name: "Pedro Garcia", 
            basePoints: 880, 
            defaultBadges: [
                { id: "quiz_master", name: "Quiz Master", icon: "🧠", count: 1, points: 120 },
                { id: "deped_values", name: "Core Values Award", icon: "🌟", count: 2, points: 100 },
                { id: "early_bird", name: "Early Bird", icon: "🌅", count: 2, points: 80 }
            ] 
        },
        { 
            id: "2024-12345", 
            name: "Juan Dela Cruz", 
            isCurrentUser: true, 
            basePoints: 400, 
            defaultBadges: [] 
        },
        { 
            id: "2024-12350", 
            name: "Patricia Gomez", 
            basePoints: 720, 
            defaultBadges: [
                { id: "helping_hand", name: "Helping Hand", icon: "❤️", count: 2, points: 80 },
                { id: "completed_grades", name: "Completed Grades", icon: "📅", count: 2, points: 80 }
            ] 
        },
        { 
            id: "2024-12351", 
            name: "Miguel Lim", 
            basePoints: 580, 
            defaultBadges: [
                { id: "punctuality_champ", name: "Punctuality Champ", icon: "⏰", count: 2, points: 90 }
            ] 
        },
        { 
            id: "2024-12352", 
            name: "Bea De Leon", 
            basePoints: 480, 
            defaultBadges: [
                { id: "early_bird", name: "Early Bird", icon: "🌅", count: 1, points: 80 }
            ] 
        }
    ];

    function renderClassLeaderboard(currentUserTotalPoints, currentUserEarnedBadges) {
        const leaderboardContainer = document.getElementById('classLeaderboardContainer');
        const classRankDisplay = document.getElementById('classRankDisplay');
        const userLiveRankBadge = document.getElementById('userLiveRankBadge');
        if (!leaderboardContainer) return;

        let allStudentBadges = {};
        try {
            allStudentBadges = JSON.parse(localStorage.getItem(STORAGE_KEY_STUDENT_BADGES)) || {};
        } catch (e) {
            allStudentBadges = {};
        }

        // Build student list with synchronized points & badge awards
        const studentList = SECTION_STUDENTS_ROSTER.map(student => {
            if (student.isCurrentUser) {
                return {
                    name: student.name,
                    isCurrentUser: true,
                    points: currentUserTotalPoints,
                    badges: currentUserEarnedBadges
                };
            }

            const stored = allStudentBadges[student.name];
            const badgesList = Array.isArray(stored) ? stored : (student.defaultBadges || []);

            // Points = 400 (base) + sum of all badges (points * count)
            const pts = badgesList.reduce((sum, b) => {
                const p = parseInt(b.points, 10) || 100;
                const c = parseInt(b.count, 10) || 1;
                return sum + (p * c);
            }, 0);

            return {
                name: student.name,
                isCurrentUser: false,
                points: 400 + pts,
                badges: badgesList
            };
        });

        // Sort descending by points
        studentList.sort((a, b) => b.points - a.points);

        // Find current user's live rank
        const userRankIndex = studentList.findIndex(s => s.isCurrentUser);
        const userRank = userRankIndex !== -1 ? (userRankIndex + 1) : 5;
        const rankStr = `#${userRank}`;

        if (classRankDisplay) classRankDisplay.textContent = rankStr;
        if (userLiveRankBadge) userLiveRankBadge.textContent = `Your Rank: ${rankStr}`;

        // Get student's custom featured badges & chosen aura theme
        const featuredBadgeIds = getStoredFeaturedBadges(currentUserEarnedBadges);
        const auraTheme = getStoredAuraTheme();

        // Clear and render live rows
        leaderboardContainer.innerHTML = '';

        studentList.forEach((student, index) => {
            const rank = index + 1;
            const row = document.createElement('div');
            const rowAuraClass = student.isCurrentUser ? `highlighted-user-row ${auraTheme}` : '';
            row.className = `leaderboard-row d-flex align-items-center justify-content-between gap-3 ${rowAuraClass}`;

            // Rank Ribbon or Plain Number
            let rankElementHtml = '';
            if (rank === 1) {
                rankElementHtml = `<div class="rank-badge-ribbon rank-ribbon-1 shadow-sm" title="Rank 1 - Gold Champion">1</div>`;
            } else if (rank === 2) {
                rankElementHtml = `<div class="rank-badge-ribbon rank-ribbon-2 shadow-sm" title="Rank 2 - Silver Leader">2</div>`;
            } else if (rank === 3) {
                rankElementHtml = `<div class="rank-badge-ribbon rank-ribbon-3 shadow-sm" title="Rank 3 - Bronze Achiever">3</div>`;
            } else {
                rankElementHtml = `<div class="rank-number-plain ${student.isCurrentUser ? 'text-success fs-5' : ''}">#${rank}</div>`;
            }

            // Trophy Icon
            let trophyIconHtml = '';
            if (rank === 1) {
                trophyIconHtml = `<i class="bi bi-trophy-fill trophy-badge-icon fs-3" style="color: #f59e0b;" title="Gold Champion Trophy"></i>`;
            } else if (rank === 2) {
                trophyIconHtml = `<i class="bi bi-trophy-fill trophy-badge-icon fs-4" style="color: #8b5cf6;" title="Silver Leader Trophy"></i>`;
            } else if (rank === 3) {
                trophyIconHtml = `<i class="bi bi-trophy-fill trophy-badge-icon fs-4" style="color: #3b82f6;" title="Bronze Achiever Trophy"></i>`;
            } else {
                trophyIconHtml = `<i class="bi bi-award-fill text-muted opacity-75 fs-5"></i>`;
            }

            // Badges showcase dots preview
            let badgeDotsHtml = '';

            if (student.isCurrentUser) {
                // Render the 3 custom featured badges
                featuredBadgeIds.forEach(fid => {
                    const earnedMatch = currentUserEarnedBadges.find(b => b.id === fid);
                    const catalogMatch = ALL_BADGES_CATALOG.find(b => b.id === fid);
                    if (earnedMatch || catalogMatch) {
                        const icon = earnedMatch ? earnedMatch.icon : (catalogMatch ? catalogMatch.icon : '⭐');
                        const name = earnedMatch ? earnedMatch.name : (catalogMatch ? catalogMatch.title : 'Badge');
                        const count = earnedMatch ? (parseInt(earnedMatch.count, 10) || 1) : 1;
                        const countBadge = count > 1 ? `<span class="micro-text fw-bold text-dark position-absolute top-0 end-0 translate-middle badge rounded-pill bg-warning-subtle border border-warning" style="font-size:0.55rem; padding: 1px 3px;">×${count}</span>` : '';

                        badgeDotsHtml += `
                            <span class="badge-slot-dot bg-white border shadow-xs position-relative user-badge-clickable" title="${name} (Click to customize showcase badges)">
                                ${icon}
                                ${countBadge}
                            </span>
                        `;
                    }
                });

                // If fewer than 3 badges chosen, show "+" button to customize
                const missingSlots = 3 - featuredBadgeIds.length;
                for (let s = 0; s < missingSlots; s++) {
                    badgeDotsHtml += `
                        <span class="badge-slot-dot user-add" title="Add / Customize Featured Badges">
                            <i class="bi bi-plus"></i>
                        </span>
                    `;
                }

                badgeDotsHtml = `
                    <div class="user-badges-showcase-group d-flex align-items-center" role="button" data-bs-toggle="modal" data-bs-target="#customizeFeaturedBadgesModal" title="Click your badges to customize showcase">
                        ${badgeDotsHtml}
                    </div>
                `;
            } else {
                // Classmates top 3 badges
                const topBadges = (student.badges || []).slice(0, 3);
                topBadges.forEach(b => {
                    const countBadge = b.count > 1 ? `<span class="micro-text fw-bold text-dark position-absolute top-0 end-0 translate-middle badge rounded-pill bg-warning-subtle border border-warning" style="font-size:0.55rem; padding: 1px 3px;">×${b.count}</span>` : '';
                    badgeDotsHtml += `
                        <span class="badge-slot-dot bg-white border shadow-xs position-relative" title="${b.name || 'Badge'}">
                            ${b.icon || '⭐'}
                            ${countBadge}
                        </span>
                    `;
                });
                badgeDotsHtml = `<div class="d-flex align-items-center">${badgeDotsHtml}</div>`;
            }

            row.innerHTML = `
                <div class="d-flex align-items-center gap-3">
                    ${rankElementHtml}
                    <div>
                        <div class="fw-bold text-dark fs-6">
                            ${student.name}
                            ${student.isCurrentUser ? '<span class="badge bg-success text-white micro-text fw-bold ms-1.5 px-2 py-0.5 rounded-pill shadow-xs">You</span>' : ''}
                        </div>
                    </div>
                </div>
                <div class="d-flex align-items-center gap-3">
                    <div class="d-none d-sm-flex align-items-center">
                        ${badgeDotsHtml}
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        ${trophyIconHtml}
                        <span class="fw-bold ${student.isCurrentUser ? 'text-success fs-5' : 'text-dark fs-6'} text-nowrap">${student.points} pts</span>
                    </div>
                </div>
            `;

            leaderboardContainer.appendChild(row);
        });
    }

    // 13. Interactive Customizer Modal Logic (Showcase Slots & Theme)
    if (customizeModalEl) {
        customizeModalEl.addEventListener('show.bs.modal', () => {
            openCustomizerModal();
        });
    }

    function openCustomizerModal() {
        const earnedBadges = getStoredBadges();
        tempFeaturedBadgeIds = [...getStoredFeaturedBadges(earnedBadges)];
        tempAuraTheme = getStoredAuraTheme();
        currentActiveSlotIndex = 0;

        renderCustomizerSlots();
        renderCustomizerUnlockedList(earnedBadges);
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
                const catBadge = ALL_BADGES_CATALOG.find(b => b.id === badgeId);
                slotCard.classList.add('equipped');
                if (iconEl) iconEl.textContent = catBadge ? catBadge.icon : '⭐';
                if (nameEl) nameEl.textContent = catBadge ? catBadge.title : badgeId;
                if (pointsEl) pointsEl.textContent = catBadge ? `+${catBadge.points} pts` : '+100 pts';
            } else {
                if (iconEl) iconEl.textContent = '⭐';
                if (nameEl) nameEl.textContent = 'Empty Slot';
                if (pointsEl) pointsEl.textContent = 'Click to assign';
            }
        }
    }

    function renderCustomizerUnlockedList(earnedBadges) {
        const listContainer = document.getElementById('customizerUnlockedBadgesList');
        if (!listContainer) return;

        listContainer.innerHTML = '';

        if (!earnedBadges || earnedBadges.length === 0) {
            listContainer.innerHTML = `<div class="text-muted small py-2"><i class="bi bi-info-circle me-1"></i>You haven't unlocked any badges yet. Earn badges to feature them here!</div>`;
            return;
        }

        earnedBadges.forEach(badge => {
            const isEquipped = tempFeaturedBadgeIds.includes(badge.id);
            const badgeCount = parseInt(badge.count, 10) || 1;

            const pill = document.createElement('div');
            pill.className = `equip-badge-pill d-flex align-items-center gap-2 ${isEquipped ? 'is-equipped' : ''}`;
            pill.setAttribute('data-badge-id', badge.id);
            pill.setAttribute('role', 'button');

            pill.innerHTML = `
                <span class="fs-5">${badge.icon || '⭐'}</span>
                <div>
                    <div class="fw-bold text-dark text-sm">${badge.name || badge.id}</div>
                    <div class="micro-text text-muted">+${badge.points || 100} pts ${badgeCount > 1 ? `&bull; ×${badgeCount}` : ''}</div>
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
        // Remove badge from any other slot first to avoid duplicates
        tempFeaturedBadgeIds = tempFeaturedBadgeIds.map(id => id === badgeId ? null : id);

        // Assign to current active slot
        tempFeaturedBadgeIds[currentActiveSlotIndex] = badgeId;

        // Auto-advance active slot to next empty slot or wrap
        currentActiveSlotIndex = (currentActiveSlotIndex + 1) % 3;

        renderCustomizerSlots();
        renderCustomizerUnlockedList(getStoredBadges());
        renderCustomizerPreview();
    }

    function clearShowcaseSlot(slotIndex) {
        tempFeaturedBadgeIds[slotIndex] = null;
        currentActiveSlotIndex = slotIndex;

        renderCustomizerSlots();
        renderCustomizerUnlockedList(getStoredBadges());
        renderCustomizerPreview();
    }

    // Wire Slot Click & Clear Buttons
    for (let i = 0; i < 3; i++) {
        const slotCard = document.getElementById(`customSlot${i}`);
        if (slotCard) {
            slotCard.addEventListener('click', (e) => {
                if (e.target.closest('.btn-slot-clear')) return; // Ignore if clear button clicked
                currentActiveSlotIndex = i;
                renderCustomizerSlots();
            });
        }

        const clearBtn = slotCard ? slotCard.querySelector('.btn-slot-clear') : null;
        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                clearShowcaseSlot(i);
            });
        }
    }

    // Theme Selector Handlers
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

    // Live Leaderboard Standings Calculator Helper
    function getLiveLeaderboardStandings() {
        const earnedBadges = getStoredBadges();
        const badgePointsSum = earnedBadges.reduce((sum, b) => {
            const cnt = parseInt(b.count, 10) || 1;
            const pts = parseInt(b.points, 10) || 100;
            return sum + (pts * cnt);
        }, 0);
        const currentUserTotalPoints = 400 + badgePointsSum;

        let allStudentBadges = {};
        try {
            allStudentBadges = JSON.parse(localStorage.getItem(STORAGE_KEY_STUDENT_BADGES)) || {};
        } catch (e) {
            allStudentBadges = {};
        }

        const studentList = SECTION_STUDENTS_ROSTER.map(student => {
            if (student.isCurrentUser) {
                return {
                    name: student.name,
                    isCurrentUser: true,
                    points: currentUserTotalPoints,
                    badges: earnedBadges
                };
            }

            const stored = allStudentBadges[student.name];
            const badgesList = Array.isArray(stored) ? stored : (student.defaultBadges || []);

            const pts = badgesList.reduce((sum, b) => {
                const p = parseInt(b.points, 10) || 100;
                const c = parseInt(b.count, 10) || 1;
                return sum + (p * c);
            }, 0);

            return {
                name: student.name,
                isCurrentUser: false,
                points: 400 + pts,
                badges: badgesList
            };
        });

        studentList.sort((a, b) => b.points - a.points);
        const userRankIndex = studentList.findIndex(s => s.isCurrentUser);
        const userRank = userRankIndex !== -1 ? (userRankIndex + 1) : 3;

        return {
            studentList,
            userRank,
            userPoints: currentUserTotalPoints
        };
    }

    // Customizer Live Preview
    function renderCustomizerPreview() {
        const previewContainer = document.getElementById('customizerLeaderboardPreview');
        if (!previewContainer) return;

        const { userRank, userPoints } = getLiveLeaderboardStandings();

        let previewBadgeDots = '';
        tempFeaturedBadgeIds.filter(Boolean).forEach(fid => {
            const badge = ALL_BADGES_CATALOG.find(b => b.id === fid);
            if (badge) {
                previewBadgeDots += `
                    <span class="badge-slot-dot bg-white border shadow-xs" title="${badge.title}">
                        ${badge.icon}
                    </span>
                `;
            }
        });

        // Rank ribbon or plain number based on actual rank
        let rankBadgeHtml = '';
        let trophyHtml = '';
        if (userRank === 1) {
            rankBadgeHtml = `<div class="rank-badge-ribbon rank-ribbon-1 shadow-sm" style="width:28px; height:28px; font-size:0.75rem;" title="Rank 1 - Gold Champion">1</div>`;
            trophyHtml = `<i class="bi bi-trophy-fill trophy-badge-icon fs-5" style="color: #f59e0b;"></i>`;
        } else if (userRank === 2) {
            rankBadgeHtml = `<div class="rank-badge-ribbon rank-ribbon-2 shadow-sm" style="width:28px; height:28px; font-size:0.75rem;" title="Rank 2 - Silver Leader">2</div>`;
            trophyHtml = `<i class="bi bi-trophy-fill trophy-badge-icon fs-5" style="color: #8b5cf6;"></i>`;
        } else if (userRank === 3) {
            rankBadgeHtml = `<div class="rank-badge-ribbon rank-ribbon-3 shadow-sm" style="width:28px; height:28px; font-size:0.75rem;" title="Rank 3 - Bronze Achiever">3</div>`;
            trophyHtml = `<i class="bi bi-trophy-fill trophy-badge-icon fs-5" style="color: #3b82f6;"></i>`;
        } else {
            rankBadgeHtml = `<div class="rank-number-plain text-success fw-bold" style="width:28px; font-size:0.9rem;">#${userRank}</div>`;
            trophyHtml = `<i class="bi bi-award-fill text-muted opacity-75 fs-5"></i>`;
        }

        previewContainer.innerHTML = `
            <div class="leaderboard-row d-flex align-items-center justify-content-between gap-3 highlighted-user-row ${tempAuraTheme} p-2.5 rounded-3">
                <div class="d-flex align-items-center gap-3">
                    ${rankBadgeHtml}
                    <div class="fw-bold text-dark text-sm">Juan Dela Cruz <span class="badge bg-success text-white micro-text ms-1">You</span></div>
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

    // Reset Defaults in Customizer
    const btnResetShowcaseDefaults = document.getElementById('btnResetShowcaseDefaults');
    if (btnResetShowcaseDefaults) {
        btnResetShowcaseDefaults.addEventListener('click', () => {
            const earnedBadges = getStoredBadges();
            tempFeaturedBadgeIds = earnedBadges.slice(0, 3).map(b => b.id);
            tempAuraTheme = 'aura-emerald';
            currentActiveSlotIndex = 0;

            renderCustomizerSlots();
            renderCustomizerUnlockedList(earnedBadges);
            renderCustomizerThemeSelector();
            renderCustomizerPreview();
        });
    }

    // Save Custom Display Preferences
    const btnSaveCustomDisplay = document.getElementById('btnSaveCustomDisplay');
    if (btnSaveCustomDisplay) {
        btnSaveCustomDisplay.addEventListener('click', () => {
            const cleanedIds = tempFeaturedBadgeIds.filter(Boolean);
            localStorage.setItem(STORAGE_KEY_FEATURED_BADGES, JSON.stringify(cleanedIds));
            localStorage.setItem(STORAGE_KEY_AURA_THEME, tempAuraTheme);

            if (customizeModalInstance) customizeModalInstance.hide();

            // Re-render UI with new featured badges & theme
            renderAchievements();
        });
    }

    // 14. Open Badge Modal Function
    function openBadgeModal(badge, isEarned, earnedData) {
        const modalBadgeIcon = document.getElementById('modalBadgeIcon');
        const modalBadgeTitle = document.getElementById('modalBadgeTitle');
        const modalBadgeStatus = document.getElementById('modalBadgeStatus');
        const modalBadgeDesc = document.getElementById('modalBadgeDesc');
        const modalBadgeReq = document.getElementById('modalBadgeReq');

        const badgeCount = earnedData ? (parseInt(earnedData.count, 10) || 1) : 0;

        if (modalBadgeIcon) modalBadgeIcon.textContent = isEarned ? badge.icon : '⭐';
        if (modalBadgeTitle) modalBadgeTitle.textContent = badge.title;
        if (modalBadgeDesc) modalBadgeDesc.textContent = badge.description;
        if (modalBadgeReq) modalBadgeReq.textContent = badge.requirement;

        if (modalBadgeStatus) {
            if (isEarned) {
                const dateStr = earnedData ? earnedData.date : 'Recent';
                const byStr = earnedData && earnedData.awardedBy ? ` (${earnedData.awardedBy})` : '';
                const countBadgeText = badgeCount > 1 
                    ? `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle rounded-pill px-2.5 py-1 fw-bold me-1">Awarded ${badgeCount} times</span>`
                    : '';

                modalBadgeStatus.innerHTML = `
                    <div class="d-flex align-items-center gap-2 flex-wrap justify-content-center">
                        ${countBadgeText}
                        <span class="badge bg-success-subtle text-success rounded-pill px-3 py-1 fw-bold">
                            <i class="bi bi-check-circle-fill me-1"></i> Latest: ${dateStr}${byStr} (+${badge.points * badgeCount} pts total)
                        </span>
                    </div>
                `;
            } else {
                modalBadgeStatus.innerHTML = `<span class="badge bg-secondary-subtle text-secondary rounded-pill px-3 py-1 fw-bold"><i class="bi bi-lock-fill me-1"></i> Locked Badge (+${badge.points} pts upon unlock)</span>`;
            }
        }

        if (badgeModalInstance) badgeModalInstance.show();
    }

    // 15. Wire Challenge Clicks
    const challengeItems = document.querySelectorAll('.challenge-item-pill');
    challengeItems.forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.star-favorite-btn')) return; // Ignore if clicking favorite star

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

    // 16. Favorite Star Toggle
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

    // 17. Real-Time Storage Listener (Sync with Teacher Awarding & Other Tabs)
    window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY_STUDENT_BADGES || 
            e.key === STORAGE_KEY_ACTIVITIES || 
            e.key === STORAGE_KEY_FEATURED_BADGES || 
            e.key === STORAGE_KEY_AURA_THEME) {
            renderAchievements();
        }
    });

    // Initial View Mode Setup & Render
    setViewMode(getStoredViewMode());
    renderAchievements();
});
