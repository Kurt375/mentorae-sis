document.addEventListener('DOMContentLoaded', async () => {
    const { token, user } = requireSession('../login.html');

    // Function to update live date and time
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

    const SUBJECTS_STORAGE_KEY = 'mentorae-subjects-data';
    let allSubjects = [];
    let myEnrolledSubjects = [];
    let activeTerm = '1st Term';
    let activeTermNum = 1;

    let studentProfile = {
        gradeLevel: 11,
        strandCode: 'STEM',
        sectionName: ''
    };

    // DOM Elements - My Subjects
    const classroomsGrid = document.getElementById('classroomsGrid');
    const classSearch = document.getElementById('classSearch');
    const classFilterQuarter = document.getElementById('classFilterQuarter');
    const classFilterCategory = document.getElementById('classFilterCategory');
    const studentSectionPill = document.getElementById('studentSectionPill');
    const studentEnrollmentSubtext = document.getElementById('studentEnrollmentSubtext');
    const myEnrolledHeading = document.getElementById('myEnrolledHeading');
    const activeTermBadge = document.getElementById('activeTermBadge');

    // DOM Elements - Library
    const subjectLibraryList = document.getElementById('subjectLibraryList');
    const librarySearch = document.getElementById('librarySearch');
    const libraryFilterQuarter = document.getElementById('libraryFilterQuarter');
    const libraryFilterGrade = document.getElementById('libraryFilterGrade');
    const libraryFilterStrand = document.getElementById('libraryFilterStrand');
    const libraryFilterCategory = document.getElementById('libraryFilterCategory');
    const libraryCountBadge = document.getElementById('libraryCountBadge');

    function escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Load student profile to determine grade level and strand
    async function loadStudentProfile() {
        try {
            const storedUser = JSON.parse(localStorage.getItem('mentorae_user') || '{}');
            if (storedUser.grade_level) studentProfile.gradeLevel = Number(storedUser.grade_level);
            if (storedUser.strand) studentProfile.strandCode = storedUser.strand;
            if (storedUser.section_name) studentProfile.sectionName = storedUser.section_name;

            const res = await authedFetch('/api/auth/profile', token);
            if (res && res.success && res.profile) {
                const p = res.profile;
                if (p.grade_level != null) studentProfile.gradeLevel = Number(p.grade_level);
                if (p.strandCode) studentProfile.strandCode = p.strandCode;
                if (p.sectionName) studentProfile.sectionName = p.sectionName;
            }

            updateProfileHeader();
        } catch (e) {
            console.warn('Could not load student profile:', e);
            if (studentSectionPill) studentSectionPill.textContent = 'Grade 11 • Senior High School';
        }
    }

    function updateProfileHeader() {
        if (studentSectionPill) {
            const sectionText = studentProfile.sectionName 
                ? `Grade ${studentProfile.gradeLevel} - ${studentProfile.strandCode} (${studentProfile.sectionName})`
                : `Grade ${studentProfile.gradeLevel} • ${studentProfile.strandCode || 'General'}`;
            studentSectionPill.textContent = sectionText;
        }
        if (activeTermBadge) {
            activeTermBadge.textContent = activeTerm;
        }
        if (myEnrolledHeading) {
            myEnrolledHeading.textContent = `My Enrolled Subjects (${activeTerm})`;
        }
        if (studentEnrollmentSubtext) {
            studentEnrollmentSubtext.textContent = `Showing subjects you are currently taking this term (${activeTerm}) for Grade ${studentProfile.gradeLevel} - ${studentProfile.strandCode}.`;
        }
    }

    // Helper: checks if a subject matches the student's curriculum (strand and grade)
    function isSubjectForStudentCurriculum(sub) {
        const subGrade = sub.gradeLevel != null ? sub.gradeLevel : (sub.grade_level != null ? sub.grade_level : 11);
        const subStrand = (sub.strand || '').toUpperCase();
        const studentStrand = (studentProfile.strandCode || '').toUpperCase();

        // Grade level match (or 0 / general)
        const gradeMatches = subGrade == 0 || subGrade == studentProfile.gradeLevel;
        if (!gradeMatches) return false;

        // Strand match
        const isCommon = subStrand === 'COMMON' || subStrand === 'ALL' || subStrand === '' || (sub.strandSection || sub.strand_section || '').includes('All Sections');
        const strandMatches = isCommon || (studentStrand && subStrand === studentStrand) || (studentStrand && (sub.strandSection || sub.strand_section || '').toUpperCase().includes(studentStrand));

        return strandMatches;
    }

    function renderMySubjects(subjectsToRender) {
        if (!classroomsGrid) return;
        classroomsGrid.innerHTML = '';

        if (subjectsToRender.length === 0) {
            classroomsGrid.innerHTML = `
                <div class="col-12 text-center py-5">
                    <div class="text-muted">
                        <i class="bi bi-journal-x fs-2 d-block mb-2 text-secondary"></i>
                        <p class="m-0 fw-semibold">No enrolled subjects found matching your selection.</p>
                        <small class="text-secondary">Try switching the term filter or clearing your search.</small>
                    </div>
                </div>`;
            return;
        }

        subjectsToRender.forEach(sub => {
            const bannerColor = sub.color || 'bg-card-blue';
            const subCode = escapeHtml(sub.code || '');
            const subName = escapeHtml(sub.name || '');
            const topicCount = Array.isArray(sub.topics) ? sub.topics.length : 0;
            const recCount = Array.isArray(sub.recommendations) ? sub.recommendations.length : 0;
            const totalMaterials = topicCount + recCount;
            const strandLabel = sub.strand && sub.strand !== 'Common' ? sub.strand : 'Core';
            const termLabel = (sub.quarter === 0) ? 'All Terms' : (sub.termLabel || (sub.quarter ? `${sub.quarter} Term` : '1st Term'));

            const cardCol = document.createElement('div');
            cardCol.className = 'col';
            cardCol.innerHTML = `
                <div class="card classroom-card border-0 shadow-sm overflow-hidden h-100 d-flex flex-column">
                    <div class="classroom-banner ${bannerColor} p-3 text-white d-flex justify-content-between align-items-start position-relative">
                        <div class="banner-dots">
                            <span class="dot bg-white opacity-75"></span>
                            <span class="dot bg-white opacity-50"></span>
                            <span class="dot bg-white opacity-75"></span>
                        </div>
                        <div class="d-flex gap-1">
                            <span class="badge bg-white text-dark border micro-text">${strandLabel}</span>
                            <span class="badge bg-dark bg-opacity-25 text-white micro-text">${termLabel}</span>
                        </div>
                    </div>
                    <div class="card-body p-3 bg-white d-flex flex-column flex-grow-1">
                        <div class="d-flex justify-content-between align-items-start flex-grow-1">
                            <div>
                                <h3 class="fw-bold m-0 fs-6 text-dark">${subName}</h3>
                                <span class="micro-text text-muted fw-semibold">${subCode} • Grade ${sub.gradeLevel || sub.grade_level || 11}</span>
                            </div>
                            <span class="badge bg-light text-dark border micro-text" title="${totalMaterials} lessons & topics available">
                                <i class="bi bi-journal-text text-success me-1"></i>${totalMaterials} Topics
                            </span>
                        </div>
                        <a href="subject_detail_student.html?subject=${encodeURIComponent(sub.name)}" class="btn btn-sm btn-study-action w-100 fw-bold text-white rounded-pill mt-3 text-decoration-none">Study</a>
                    </div>
                </div>
            `;
            classroomsGrid.appendChild(cardCol);
        });
    }

    function renderLibrary(subjectsToRender) {
        if (!subjectLibraryList) return;
        subjectLibraryList.innerHTML = '';

        if (libraryCountBadge) {
            libraryCountBadge.textContent = `${subjectsToRender.length} of ${allSubjects.length} subjects`;
        }

        if (subjectsToRender.length === 0) {
            subjectLibraryList.innerHTML = `
                <div class="col-12 text-center py-5">
                    <div class="text-muted">
                        <i class="bi bi-search fs-2 d-block mb-2 text-secondary"></i>
                        <p class="m-0 fw-semibold">No subjects found in the library matching your filters.</p>
                        <small class="text-secondary">Try selecting "All Terms", "All Grades", or "All Strands".</small>
                    </div>
                </div>`;
            return;
        }

        subjectsToRender.forEach(sub => {
            const bannerColor = sub.color || 'bg-card-blue';
            const subCode = escapeHtml(sub.code || '');
            const subName = escapeHtml(sub.name || '');
            const subDesc = escapeHtml(sub.description || 'Access topics, quizzes, flashcards and learning handouts.');
            const topicCount = Array.isArray(sub.topics) ? sub.topics.length : 0;
            const recCount = Array.isArray(sub.recommendations) ? sub.recommendations.length : 0;
            const totalMaterials = topicCount + recCount;
            const gradeNum = sub.gradeLevel != null ? sub.gradeLevel : (sub.grade_level != null ? sub.grade_level : 11);
            const strandVal = sub.strand || 'Common';
            const termLabel = (sub.quarter === 0) ? 'All Terms' : (sub.termLabel || `${sub.quarter || 1} Term`);

            const cardCol = document.createElement('div');
            cardCol.className = 'col';
            cardCol.innerHTML = `
                <div class="card classroom-card subject-item-card border-0 shadow-sm overflow-hidden h-100 d-flex flex-column">
                    <div class="classroom-banner ${bannerColor} p-3 text-white d-flex justify-content-between align-items-start">
                        <div>
                            <h3 class="fw-bold m-0 fs-6 text-white">${subCode}</h3>
                            <p class="micro-text text-white-50 m-0">${subName}</p>
                            <span class="micro-text badge bg-white bg-opacity-25 mt-1 text-white">G${gradeNum} • ${strandVal} • ${termLabel}</span>
                        </div>
                        <span class="badge bg-white text-dark border micro-text">
                            <i class="bi bi-journal-check text-success me-1"></i>${totalMaterials}
                        </span>
                    </div>
                    <div class="card-body p-3 bg-white d-flex flex-column flex-grow-1">
                        <p class="small text-secondary m-0 card-desc-text flex-grow-1">${subDesc}</p>
                        <a href="subject_detail_student.html?subject=${encodeURIComponent(sub.name)}" class="btn btn-sm btn-study-action w-100 fw-bold text-white rounded-pill mt-3 text-decoration-none">Study</a>
                    </div>
                </div>
            `;
            subjectLibraryList.appendChild(cardCol);
        });
    }

    function applyMySubjectsFilter() {
        const query = (classSearch ? classSearch.value : '').toLowerCase().trim();
        const termFilterVal = classFilterQuarter ? classFilterQuarter.value : 'current';
        const categoryVal = classFilterCategory ? classFilterCategory.value : 'All Categories';

        let list = [];

        if (termFilterVal === 'current') {
            // Strictly show the subjects the student is taking this term!
            list = [...myEnrolledSubjects];
        } else if (termFilterVal === 'All') {
            // Show all subjects for this student's grade & strand across all terms
            list = allSubjects.filter(isSubjectForStudentCurriculum);
        } else {
            // Filter by specific term number (1, 2, or 3)
            const targetTerm = Number(termFilterVal);
            list = allSubjects.filter(isSubjectForStudentCurriculum).filter(s => {
                const q = s.quarter != null ? Number(s.quarter) : 1;
                return q === 0 || q === targetTerm;
            });
        }

        if (query) {
            list = list.filter(s => 
                (s.name || '').toLowerCase().includes(query) || 
                (s.code || '').toLowerCase().includes(query) ||
                (s.description || '').toLowerCase().includes(query)
            );
        }

        if (categoryVal !== 'All Categories') {
            list = list.filter(s => {
                const cat = s.category || s.classification || 'Core Subject';
                return cat === categoryVal;
            });
        }

        renderMySubjects(list);
    }

    function applyLibraryFilter() {
        const query = (librarySearch ? librarySearch.value : '').toLowerCase().trim();
        const termVal = libraryFilterQuarter ? libraryFilterQuarter.value : 'All';
        const gradeVal = libraryFilterGrade ? libraryFilterGrade.value : 'All';
        const strandVal = libraryFilterStrand ? libraryFilterStrand.value : 'All';
        const categoryVal = libraryFilterCategory ? libraryFilterCategory.value : 'All Categories';

        // Start with ALL subjects created by admin in the library!
        let list = [...allSubjects];

        if (query) {
            list = list.filter(s => 
                (s.name || '').toLowerCase().includes(query) || 
                (s.code || '').toLowerCase().includes(query) ||
                (s.description || '').toLowerCase().includes(query)
            );
        }

        if (termVal !== 'All') {
            const targetTerm = Number(termVal);
            list = list.filter(s => {
                const q = s.quarter != null ? Number(s.quarter) : 1;
                if (targetTerm === 0) return q === 0;
                return q === 0 || q === targetTerm;
            });
        }

        if (gradeVal !== 'All') {
            const targetGrade = Number(gradeVal);
            list = list.filter(s => {
                const g = s.gradeLevel != null ? Number(s.gradeLevel) : (s.grade_level != null ? Number(s.grade_level) : 11);
                return g === 0 || g === targetGrade;
            });
        }

        if (strandVal !== 'All') {
            list = list.filter(s => {
                const str = s.strand || 'Common';
                return str === strandVal || str === 'Common' || str === 'All';
            });
        }

        if (categoryVal !== 'All Categories') {
            list = list.filter(s => {
                const cat = s.category || s.classification || 'Core Subject';
                return cat === categoryVal;
            });
        }

        renderLibrary(list);
    }

    const STRANDS_BY_GRADE = {
        '11': ['Common', 'BAE', 'ASSH', 'STEM'],
        '12': ['Common', 'HUMSS', 'HE', 'H&T', 'ABM', 'STEM']
    };
    const STRAND_GRADE_MAP = {
        'BAE': '11',
        'ASSH': '11',
        'HUMSS': '12',
        'HE': '12',
        'H&T': '12',
        'ABM': '12'
    };

    function populateStrandFilter() {
        if (!libraryFilterStrand) return;
        const currentVal = libraryFilterStrand.value;
        const selectedGrade = libraryFilterGrade ? libraryFilterGrade.value : 'All';

        let strands = [...new Set(allSubjects.map(s => s.strand).filter(Boolean))].filter(s => s !== 'Common' && s !== 'All');
        if (selectedGrade !== 'All') {
            const allowed = STRANDS_BY_GRADE[selectedGrade] || [];
            strands = strands.filter(s => allowed.includes(s));
        }
        strands.sort();

        libraryFilterStrand.innerHTML = `
            <option value="All">All Strands</option>
            <option value="Common">Common (All Strands)</option>
            ${strands.map(str => `<option value="${escapeHtml(str)}">${escapeHtml(str)}</option>`).join('')}
        `;
        if (strands.includes(currentVal) || currentVal === 'Common') {
            libraryFilterStrand.value = currentVal;
        } else {
            libraryFilterStrand.value = 'All';
        }
    }

    async function loadData() {
        try {
            await loadStudentProfile();

            // 1. Authoritative: Fetch ALL subjects created by the Admin from API
            try {
                const data = await authedFetch('/api/reference/subjects', token);
                if (data && data.success && Array.isArray(data.subjects) && data.subjects.length > 0) {
                    allSubjects = data.subjects;
                } else {
                    const cached = localStorage.getItem(SUBJECTS_STORAGE_KEY);
                    allSubjects = cached ? JSON.parse(cached) : [];
                }
            } catch (e) {
                console.warn('Failed to fetch subjects from API, checking local storage:', e);
                const cached = localStorage.getItem(SUBJECTS_STORAGE_KEY);
                allSubjects = cached ? JSON.parse(cached) : [];
            }

            // 2. Authoritative: Fetch student's ENROLLED subjects this term
            try {
                const enrolledRes = await authedFetch('/api/reference/my-enrolled-subjects', token);
                if (enrolledRes && enrolledRes.success && Array.isArray(enrolledRes.subjects)) {
                    myEnrolledSubjects = enrolledRes.subjects;
                    if (enrolledRes.activeTerm) activeTerm = enrolledRes.activeTerm;
                    if (enrolledRes.activeTermNum) activeTermNum = enrolledRes.activeTermNum;
                    if (enrolledRes.studentProfile) {
                        studentProfile = { ...studentProfile, ...enrolledRes.studentProfile };
                    }
                } else {
                    // Fallback: calculate enrolled subjects for this term locally
                    myEnrolledSubjects = allSubjects.filter(sub => {
                        const matchesCurriculum = isSubjectForStudentCurriculum(sub);
                        const q = sub.quarter != null ? Number(sub.quarter) : 1;
                        return matchesCurriculum && (q === 0 || q === activeTermNum);
                    });
                }
            } catch (e) {
                console.warn('Failed to fetch enrolled subjects from dedicated endpoint, computing locally:', e);
                myEnrolledSubjects = allSubjects.filter(sub => {
                    const matchesCurriculum = isSubjectForStudentCurriculum(sub);
                    const q = sub.quarter != null ? Number(sub.quarter) : 1;
                    return matchesCurriculum && (q === 0 || q === activeTermNum);
                });
            }

            // Render both views immediately as soon as subjects are loaded!
            updateProfileHeader();
            populateStrandFilter();
            applyMySubjectsFilter();
            applyLibraryFilter();

            // Safe cache in localStorage (safely caught to prevent QuotaExceededError crashes)
            try {
                const safeSubjects = allSubjects.map(s => ({
                    id: s.id,
                    name: s.name,
                    code: s.code,
                    description: s.description,
                    color: s.color,
                    strand: s.strand,
                    strandSection: s.strandSection,
                    gradeLevel: s.gradeLevel || s.grade_level,
                    quarter: s.quarter,
                    category: s.category || s.classification,
                    topics: (s.topics || []).map(t => ({
                        id: t.id,
                        title: t.title,
                        description: t.description,
                        color: t.color,
                        comment: t.comment,
                        quiz: t.quiz || [],
                        flashcards: t.flashcards || [],
                        resources: t.resources || [],
                        files: (t.files || []).map(f => ({ name: f.name, type: f.type, size: f.size }))
                    })),
                    recommendations: (s.recommendations || []).map(r => ({
                        id: r.id,
                        title: r.title,
                        description: r.description,
                        color: r.color,
                        comment: r.comment,
                        quiz: r.quiz || [],
                        flashcards: r.flashcards || [],
                        resources: r.resources || [],
                        files: (r.files || []).map(f => ({ name: f.name, type: f.type, size: f.size }))
                    }))
                }));
                localStorage.setItem(SUBJECTS_STORAGE_KEY, JSON.stringify(safeSubjects));
            } catch (storageErr) {
                console.warn('Could not cache subjects to localStorage:', storageErr);
            }
        } catch (globalErr) {
            console.error('Error in student learning resources loadData:', globalErr);
        } finally {
            // Guarantee filters and grids are rendered, clearing any spinners
            updateProfileHeader();
            populateStrandFilter();
            applyMySubjectsFilter();
            applyLibraryFilter();
        }
    }

    // Attach search and filter event listeners
    if (classSearch) classSearch.addEventListener('input', applyMySubjectsFilter);
    if (classFilterQuarter) classFilterQuarter.addEventListener('change', applyMySubjectsFilter);
    if (classFilterCategory) classFilterCategory.addEventListener('change', applyMySubjectsFilter);

    if (librarySearch) librarySearch.addEventListener('input', applyLibraryFilter);
    if (libraryFilterQuarter) libraryFilterQuarter.addEventListener('change', applyLibraryFilter);
    if (libraryFilterGrade) {
        libraryFilterGrade.addEventListener('change', () => {
            populateStrandFilter();
            applyLibraryFilter();
        });
    }
    if (libraryFilterStrand) {
        libraryFilterStrand.addEventListener('change', () => {
            if (libraryFilterStrand.value !== 'All' && libraryFilterStrand.value !== 'Common') {
                const autoGrade = STRAND_GRADE_MAP[libraryFilterStrand.value];
                if (autoGrade && libraryFilterGrade && libraryFilterGrade.value !== autoGrade) {
                    const chosen = libraryFilterStrand.value;
                    libraryFilterGrade.value = autoGrade;
                    populateStrandFilter();
                    libraryFilterStrand.value = chosen;
                }
            }
            applyLibraryFilter();
        });
    }
    if (libraryFilterCategory) libraryFilterCategory.addEventListener('change', applyLibraryFilter);

    await loadData();
});
