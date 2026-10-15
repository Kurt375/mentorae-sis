document.addEventListener('DOMContentLoaded', () => {
    const SUBJECTS_STORAGE_KEY = 'mentorae-subjects-data';

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

    const subjectsTableBody = document.getElementById('subjectsTableBody');
    const subjectForm = document.getElementById('subjectForm');
    const subjectModalEl = document.getElementById('subjectModal');
    const subjectModal = subjectModalEl ? new bootstrap.Modal(subjectModalEl) : null;
    const subjectModalLabel = document.getElementById('subjectModalLabel');
    const addSubjectBtn = document.getElementById('addSubjectBtn');

    // New Modals for Topic Management
    const topicEditorModalEl = document.getElementById('topicEditorModal');
    const topicEditorModal = topicEditorModalEl ? new bootstrap.Modal(topicEditorModalEl) : null;
    const topicEditorForm = document.getElementById('topicEditorForm');
    const topicsListContainer = document.getElementById('topicsListContainer');
    const stagedTopicsContainer = document.getElementById('stagedTopicsContainer');

    // New Modals for Staged Content
    const stagedQuizEditorModalEl = document.getElementById('stagedQuizEditorModal');
    const stagedQuizEditorModal = stagedQuizEditorModalEl ? new bootstrap.Modal(stagedQuizEditorModalEl) : null;
    const stagedFlashcardEditorModalEl = document.getElementById('stagedFlashcardEditorModal');
    const stagedFlashcardEditorModal = stagedFlashcardEditorModalEl ? new bootstrap.Modal(stagedFlashcardEditorModalEl) : null;

    // New modals for editing existing topic content
    const existingFileEditorModalEl = document.getElementById('existingFileEditorModal');
    const existingFileEditorModal = existingFileEditorModalEl ? new bootstrap.Modal(existingFileEditorModalEl) : null;
    const existingFlashcardEditorModalEl = document.getElementById('existingFlashcardEditorModal');
    const existingFlashcardEditorModal = existingFlashcardEditorModalEl ? new bootstrap.Modal(existingFlashcardEditorModalEl) : null;
    const existingQuizEditorModalEl = document.getElementById('existingQuizEditorModal');
    const existingQuizEditorModal = existingQuizEditorModalEl ? new bootstrap.Modal(existingQuizEditorModalEl) : null;

    // Full-Screen Google Classroom Style File Viewer
    const classroomFileViewerEl = document.getElementById('classroomFileViewer');
    let filePreviewReturnModal = 'existingFileEditorModal';
    let currentPreviewBlobUrl = null;

    // New DOM elements for filters
    const tableSearch = document.getElementById('tableSearch');
    const gradeFilter = document.getElementById('gradeFilter');
    const categoryFilter = document.getElementById('categoryFilter');
    const strandFilter = document.getElementById('strandFilter');
    const quarterFilter = document.getElementById('quarterFilter');

    let allSectionsList = [
        { grade_level: 11, strandCode: 'ASSH', name: 'Arts & Social Sciences 1' },
        { grade_level: 11, strandCode: 'ASSH', name: 'Arts & Social Sciences 2' },
        { grade_level: 11, strandCode: 'ASSH', name: 'Humanities 1' },
        { grade_level: 11, strandCode: 'ASSH', name: 'Humanities 2' },
        { grade_level: 11, strandCode: 'BAE', name: 'Accountancy' },
        { grade_level: 11, strandCode: 'BAE', name: 'Entrepreneurship' },
        { grade_level: 11, strandCode: 'STEM', name: 'Engineering' },
        { grade_level: 11, strandCode: 'STEM', name: 'Medical Sciences' },
        { grade_level: 12, strandCode: 'ABM', name: 'Business Administration' },
        { grade_level: 12, strandCode: 'H&T', name: 'Culinary Arts' },
        { grade_level: 12, strandCode: 'HE', name: 'Cookery' },
        { grade_level: 12, strandCode: 'HUMSS', name: 'Criminology 1' },
        { grade_level: 12, strandCode: 'HUMSS', name: 'Criminology 2' },
        { grade_level: 12, strandCode: 'HUMSS', name: 'Criminology 3' },
        { grade_level: 12, strandCode: 'HUMSS', name: 'Education 1' },
        { grade_level: 12, strandCode: 'HUMSS', name: 'Education 2' },
        { grade_level: 12, strandCode: 'STEM', name: 'Biomedical Engineering' },
        { grade_level: 12, strandCode: 'STEM', name: 'Sigma Technocrats' }
    ];

    let subjects = [];
    let isSaving = false; // To prevent unsaved changes prompt during save.
    let isSavingTopic = false; // To prevent unsaved changes prompt during topic save.
    let editingSubjectCopy = null; // To hold a deep copy of the subject being edited.
    let currentEditingSubjectId = null; // To track which subject's topics are being edited
    let stagedTopics = []; // To hold topics when creating a new subject
    let currentStagedTopicIndex = null; // To track which staged topic's content is being edited
    let currentTopicIndexForEditing = null; // To track which existing topic is being edited
    let inlineTopicContent = { quiz: [], flashcards: [] }; // Content for the inline topic form
    let isEditingStagedContent = false; // Flag to differentiate content editing context
    let contentEditorReturnContext = 'subjectModal'; // To track which modal to return to
    let isTransitioningToSubmodal = false; // Prevents clearing editingSubjectCopy during modal transitions

    // --- Institutional Grading Category Weights Policy (Admin Controlled) ---
    let categoryWeightsPolicy = {
        'Core Subject': { ww: 20, pt: 50, qa: 30 },
        'Applied Subject': { ww: 25, pt: 45, qa: 30 },
        'Specialized Subject': { ww: 20, pt: 60, qa: 20 },
        'Institutional / Non-Academic': { ww: 20, pt: 60, qa: 20 }
    };

    function getCategoryDefaultWeights(category) {
        if (!category) return { ww: 20, pt: 50, qa: 30 };
        if (categoryWeightsPolicy[category]) return categoryWeightsPolicy[category];
        for (const [k, v] of Object.entries(categoryWeightsPolicy)) {
            if (k.toLowerCase().includes(category.toLowerCase()) || category.toLowerCase().includes(k.toLowerCase())) {
                return v;
            }
        }
        return { ww: 20, pt: 50, qa: 30 };
    }

    function updateSubjectWeightsBadge() {
        const ww = parseFloat(document.getElementById('subjectWwWeight')?.value) || 0;
        const pt = parseFloat(document.getElementById('subjectPtWeight')?.value) || 0;
        const qa = parseFloat(document.getElementById('subjectQaWeight')?.value) || 0;
        const total = Math.round(ww + pt + qa);
        const badge = document.getElementById('subjectWeightsSumBadge');
        if (!badge) return;
        if (total === 100) {
            badge.className = 'badge bg-success';
            badge.textContent = 'Sum: 100% (Valid)';
        } else {
            badge.className = 'badge bg-danger';
            badge.textContent = `Sum: ${total}% (Must equal 100%)`;
        }
    }

    function syncCategoryDropdowns() {
        const catSelect = document.getElementById('subjectCategory');
        const catFilter = document.getElementById('categoryFilter');

        const categories = new Set(Object.keys(categoryWeightsPolicy));
        if (Array.isArray(subjects)) {
            subjects.forEach(s => {
                const c = s.category || s.classification;
                if (c) categories.add(c);
            });
        }

        if (catSelect) {
            const prevVal = catSelect.value;
            catSelect.innerHTML = '';
            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                catSelect.appendChild(opt);
            });
            if (categories.has(prevVal)) {
                catSelect.value = prevVal;
            } else if (categories.size > 0) {
                catSelect.selectedIndex = 0;
            }
        }

        if (catFilter) {
            const prevFilter = catFilter.value;
            catFilter.innerHTML = '<option value="All">All Categories</option>';
            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                catFilter.appendChild(opt);
            });
            if (prevFilter === 'All' || categories.has(prevFilter)) {
                catFilter.value = prevFilter;
            } else {
                catFilter.value = 'All';
            }
        }
    }

    async function loadCategoryWeightsPolicy() {
        const token = localStorage.getItem('mentorae_token');
        if (!token) {
            renderCategoryWeightsPolicyModal();
            syncCategoryDropdowns();
            return;
        }
        try {
            const res = await authedFetch('/api/reference/grading-weights', token);
            if (res && res.success && res.weights) {
                categoryWeightsPolicy = res.weights;
            }
        } catch (e) {
            console.warn('Could not load grading weights policy from backend:', e);
        }
        renderCategoryWeightsPolicyModal();
        syncCategoryDropdowns();
    }

    function renderCategoryWeightsPolicyModal() {
        const container = document.getElementById('categoryWeightsContainer');
        if (!container) return;
        container.innerHTML = '';

        const entries = Object.entries(categoryWeightsPolicy);
        if (entries.length === 0) {
            container.innerHTML = `
                <div class="alert alert-warning py-3 text-center small rounded-3 border-0 shadow-xs mb-0">
                    <i class="bi bi-info-circle me-1"></i> No subject categories configured. You can add one below.
                </div>
            `;
            return;
        }

        for (const [category, w] of entries) {
            const card = document.createElement('div');
            card.className = 'card border bg-white p-3 rounded-3 shadow-xs';
            card.setAttribute('data-category', category);
            const sum = Math.round((Number(w.ww) || 0) + (Number(w.pt) || 0) + (Number(w.qa) || 0));
            const isValid = sum === 100;

            card.innerHTML = `
                <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                    <div class="d-flex align-items-center gap-2">
                        <span class="fw-bold text-dark fs-6 category-title-text">${category}</span>
                        <button type="button" class="btn btn-sm btn-outline-secondary border-0 p-1 py-0 btn-edit-category-name" title="Rename category '${category}'" data-category="${category}">
                            <i class="bi bi-pencil-square"></i>
                        </button>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <span class="badge ${isValid ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-danger-subtle text-danger border border-danger-subtle'} cat-sum-badge">
                            Total: ${sum}% ${isValid ? '✓' : '(Must be 100%)'}
                        </span>
                        <button type="button" class="btn btn-sm btn-outline-danger border-0 p-1 py-0 d-inline-flex align-items-center gap-1 btn-remove-category" title="Delete category '${category}'" data-category="${category}">
                            <i class="bi bi-trash3-fill"></i>
                            <span class="d-none d-sm-inline micro-text fw-bold">Remove</span>
                        </button>
                    </div>
                </div>
                <div class="row g-2">
                    <div class="col-4">
                        <label class="form-label micro-text fw-semibold text-secondary mb-1">Written Works (WW)</label>
                        <div class="input-group input-group-sm">
                            <input type="number" class="form-control fw-bold cat-ww-input" value="${w.ww}" min="0" max="100" step="1">
                            <span class="input-group-text">%</span>
                        </div>
                    </div>
                    <div class="col-4">
                        <label class="form-label micro-text fw-semibold text-secondary mb-1">Performance Tasks (PT)</label>
                        <div class="input-group input-group-sm">
                            <input type="number" class="form-control fw-bold cat-pt-input" value="${w.pt}" min="0" max="100" step="1">
                            <span class="input-group-text">%</span>
                        </div>
                    </div>
                    <div class="col-4">
                        <label class="form-label micro-text fw-semibold text-secondary mb-1">Quarterly Assessment (QA)</label>
                        <div class="input-group input-group-sm">
                            <input type="number" class="form-control fw-bold cat-qa-input" value="${w.qa}" min="0" max="100" step="1">
                            <span class="input-group-text">%</span>
                        </div>
                    </div>
                </div>
            `;

            const wwIn = card.querySelector('.cat-ww-input');
            const ptIn = card.querySelector('.cat-pt-input');
            const qaIn = card.querySelector('.cat-qa-input');
            const badge = card.querySelector('.cat-sum-badge');
            const btnRemove = card.querySelector('.btn-remove-category');
            const btnEditName = card.querySelector('.btn-edit-category-name');

            const updateSum = () => {
                const ww = parseFloat(wwIn.value) || 0;
                const pt = parseFloat(ptIn.value) || 0;
                const qa = parseFloat(qaIn.value) || 0;
                const total = Math.round(ww + pt + qa);
                const valid = total === 100;
                badge.className = `badge ${valid ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-danger-subtle text-danger border border-danger-subtle'} cat-sum-badge`;
                badge.textContent = `Total: ${total}% ${valid ? '✓' : '(Must be 100%)'}`;
                categoryWeightsPolicy[category] = { ww, pt, qa };
            };

            wwIn.addEventListener('input', updateSum);
            ptIn.addEventListener('input', updateSum);
            qaIn.addEventListener('input', updateSum);

            // Remove/Delete category
            btnRemove.addEventListener('click', () => {
                const count = Array.isArray(subjects) 
                    ? subjects.filter(s => (s.category || s.classification) === category).length 
                    : 0;
                let msg = `Are you sure you want to remove the "${category}" category?`;
                if (count > 0) {
                    msg = `⚠️ Note: ${count} subject(s) are currently categorized as "${category}".\n\nRemoving it will delete this category and its default weights from the policy.\n\nAre you sure you want to remove it?`;
                }
                if (!confirm(msg)) return;

                delete categoryWeightsPolicy[category];
                renderCategoryWeightsPolicyModal();
                syncCategoryDropdowns();
            });

            // Rename category
            btnEditName.addEventListener('click', () => {
                const currentName = category;
                const newName = prompt(`Enter new name for category "${currentName}":`, currentName);
                if (!newName || !newName.trim() || newName.trim() === currentName) return;
                const trimmed = newName.trim();
                if (categoryWeightsPolicy[trimmed]) {
                    alert(`A category named "${trimmed}" already exists.`);
                    return;
                }
                const oldW = categoryWeightsPolicy[currentName];
                delete categoryWeightsPolicy[currentName];
                categoryWeightsPolicy[trimmed] = oldW;

                // Update existing subjects in memory
                if (Array.isArray(subjects)) {
                    subjects.forEach(s => {
                        if (s.category === currentName) s.category = trimmed;
                        if (s.classification === currentName) s.classification = trimmed;
                    });
                }

                renderCategoryWeightsPolicyModal();
                syncCategoryDropdowns();
            });

            container.appendChild(card);
        }
    }

    // --- Data Initialization ---
    function getInitialData() {
        // This combines the mock data from the teacher pages into a single source of truth.
        // In a real app, this would be a single API call.
        const initialSubjects = [
            // ===================== GRADE 11 =====================
            // All Terms Core / Applied
            { name: "Effective Communication", code: "EFFCOMM", category: "Core Subject", strandSection: "All Sections", gradeLevel: 11, strand: "Common", quarter: 0, color: "bg-card-blue", description: "Develops foundational English oral and written communication competencies." },
            { name: "Mabisang Komunikasyon", code: "MABKOM", category: "Core Subject", strandSection: "All Sections", gradeLevel: 11, strand: "Common", quarter: 0, color: "bg-card-green", description: "Paglinang ng kasanayan sa mabisang pakikipagtalastasan sa wikang Filipino." },
            { name: "General Mathematics", code: "GENMATH", category: "Core Subject", strandSection: "All Sections", gradeLevel: 11, strand: "Common", quarter: 0, color: "bg-card-orange", description: "Covers fundamental functions, business mathematics, and mathematical logic." },
            { name: "General Science", code: "GENSCI", category: "Core Subject", strandSection: "All Sections", gradeLevel: 11, strand: "Common", quarter: 0, color: "bg-card-purple", description: "Integrated scientific principles, physical phenomena, and earth systems." },
            { name: "Pag-aaral ng Kasaysayan at Lipunang Pilipino", code: "PKLP", category: "Core Subject", strandSection: "All Sections", gradeLevel: 11, strand: "Common", quarter: 0, color: "bg-card-blue", description: "Pagsusuri sa kasaysayan, kultura, at transpormasyon ng lipunang Pilipino." },
            { name: "Life and Career Skills", code: "LCS", category: "Applied Subject", strandSection: "All Sections", gradeLevel: 11, strand: "Common", quarter: 0, color: "bg-card-green", description: "Equips students with modern workforce readiness and career planning skills." },

            // BAE Specialized
            { name: "Introduction to Organization and Management", code: "IOM", category: "Specialized Subject", strandSection: "BAE 11", gradeLevel: 11, strand: "BAE", quarter: 1, color: "bg-card-orange", description: "Principles, theories, and practices of modern business management." },
            { name: "Contemporary Marketing", code: "CONTEMP_MKTG", category: "Specialized Subject", strandSection: "BAE 11", gradeLevel: 11, strand: "BAE", quarter: 2, color: "bg-card-blue", description: "Market analysis, product development, pricing, and promotional strategies." },
            { name: "Business 1 - Basic Accounting", code: "BUS1_ACTG", category: "Specialized Subject", strandSection: "BAE 11", gradeLevel: 11, strand: "BAE", quarter: 3, color: "bg-card-green", description: "Introductory accounting principles, journal entries, and financial ledger balance." },

            // ASSH Specialized (Creative / Language)
            { name: "Creative Composition 1", code: "CREAT_COMP1", category: "Specialized Subject", strandSection: "ASSH 11", gradeLevel: 11, strand: "ASSH", quarter: 1, color: "bg-card-purple", description: "Foundational creative writing techniques, poetry, and narrative craft." },
            { name: "Creative Composition 2", code: "CREAT_COMP2", category: "Specialized Subject", strandSection: "ASSH 11", gradeLevel: 11, strand: "ASSH", quarter: 2, color: "bg-card-blue", description: "Advanced narrative, dramatic, and poetic composition workshop." },
            { name: "Filipino 1", code: "FIL1", category: "Specialized Subject", strandSection: "ASSH 11", gradeLevel: 11, strand: "ASSH", quarter: 3, color: "bg-card-green", description: "Pagsulat at kritikal na pagsusuri ng mga akademikong sulatin sa Filipino." },

            // ASSH Specialized (Governance / Social Sciences)
            { name: "Philippine Governance", code: "PHILGOV", category: "Specialized Subject", strandSection: "ASSH 11", gradeLevel: 11, strand: "ASSH", quarter: 1, color: "bg-card-orange", description: "Structure, politics, and civic institutions of Philippine government." },
            { name: "Citizenship and Civic Engagement", code: "CITIZEN_ENG", category: "Specialized Subject", strandSection: "ASSH 11", gradeLevel: 11, strand: "ASSH", quarter: 2, color: "bg-card-purple", description: "Community participation, civic responsibility, and democratic engagement." },
            { name: "Social Sciences", code: "SOCSCI", category: "Specialized Subject", strandSection: "ASSH 11", gradeLevel: 11, strand: "ASSH", quarter: 3, color: "bg-card-blue", description: "Theories and methodologies across psychology, sociology, and political science." },

            // STEM Specialized (Life Sciences)
            { name: "Biology 1", code: "BIO1", category: "Specialized Subject", strandSection: "STEM 11", gradeLevel: 11, strand: "STEM", quarter: 1, color: "bg-card-green", description: "Cellular biology, biochemistry, organelles, and bioenergetic pathways." },
            { name: "Biology 2", code: "BIO2", category: "Specialized Subject", strandSection: "STEM 11", gradeLevel: 11, strand: "STEM", quarter: 2, color: "bg-card-blue", description: "Plant and animal anatomy, physiology, and organ transport systems." },
            { name: "Biology 3", code: "BIO3", category: "Specialized Subject", strandSection: "STEM 11", gradeLevel: 11, strand: "STEM", quarter: 3, color: "bg-card-orange", description: "Genetics, evolution, ecological balance, and biological diversity." },

            // STEM Specialized (Mathematics)
            { name: "Finite Mathematics 1", code: "FINMATH1", category: "Specialized Subject", strandSection: "STEM 11", gradeLevel: 11, strand: "STEM", quarter: 1, color: "bg-card-purple", description: "Set theory, matrix algebra, linear systems, and financial mathematics." },
            { name: "Finite Mathematics 2", code: "FINMATH2", category: "Specialized Subject", strandSection: "STEM 11", gradeLevel: 11, strand: "STEM", quarter: 2, color: "bg-card-blue", description: "Combinatorics, probability distributions, Markov models, and game theory." },
            { name: "Pre-Calculus", code: "PRECALC", category: "Specialized Subject", strandSection: "STEM 11", gradeLevel: 11, strand: "STEM", quarter: 3, color: "bg-card-green", description: "Analytic geometry, conic sections, sequences, and trigonometry." },

            // H&T Specialized
            { name: "Bakery Operation NC II", code: "BAKERY_NC2", category: "Specialized Subject", strandSection: "H&T 11", gradeLevel: 11, strand: "H&T", quarter: 0, color: "bg-card-orange", description: "Commercial bread and pastry production, baking science, and kitchen hygiene." },

            // ===================== GRADE 12 =====================
            // 1st Term Core / Applied
            { name: "Introduction to the Philosophy of the Human Person", code: "PHILO", category: "Core Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", quarter: 1, color: "bg-card-purple", description: "Philosophical methods, human freedom, and ethical personhood in society." },
            { name: "Understanding Culture, Society and Politics", code: "UCSP", category: "Core Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", quarter: 1, color: "bg-card-blue", description: "Anthropological and sociological analysis of human cultural evolution." },
            { name: "Physical Education and Health", code: "PEH12_1", category: "Core Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", quarter: 1, color: "bg-card-green", description: "Physical fitness assessment, recreational health, and active movement." },
            { name: "English for Academic and Professional Purposes", code: "EAPP", category: "Applied Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", quarter: 1, color: "bg-card-orange", description: "Academic research critique, proposal defense, and professional papers." },

            // 1st Term Specialized
            { name: "Fundamentals of Accountancy, Business and Management 2", code: "FABM2", category: "Specialized Subject", strandSection: "ABM 12", gradeLevel: 12, strand: "ABM", quarter: 1, color: "bg-card-blue", description: "Preparation of financial statements, cash flow, and accounting worksheets." },
            { name: "Business Finance", code: "BUSFIN", category: "Specialized Subject", strandSection: "ABM 12", gradeLevel: 12, strand: "ABM", quarter: 1, color: "bg-card-green", description: "Capital budgeting, working capital, investment risks, and financial planning." },
            { name: "Community Engagement, Solidarity, and Citizenship", code: "CESC", category: "Specialized Subject", strandSection: "HUMSS 12", gradeLevel: 12, strand: "HUMSS", quarter: 1, color: "bg-card-orange", description: "Community development models, civic engagement, and human rights advocacy." },
            { name: "Creative Writing/Malikhaing Pagsulat", code: "CREAT_WRIT", category: "Specialized Subject", strandSection: "HUMSS 12", gradeLevel: 12, strand: "HUMSS", quarter: 1, color: "bg-card-purple", description: "Writing poetry, drama, fiction, and creative literary techniques." },
            { name: "General Physics 1", code: "GENPHYS1", category: "Specialized Subject", strandSection: "STEM 12", gradeLevel: 12, strand: "STEM", quarter: 1, color: "bg-card-blue", description: "Classical mechanics, vectors, rotational equilibrium, and fluid statics." },
            { name: "General Chemistry 1", code: "GENCHEM1", category: "Specialized Subject", strandSection: "STEM 12", gradeLevel: 12, strand: "STEM", quarter: 1, color: "bg-card-green", description: "Atomic structure, chemical equations, stoichiometric calculations, and gas laws." },
            { name: "Cookery", code: "COOKERY", category: "Specialized Subject", strandSection: "HE 12", gradeLevel: 12, strand: "HE", quarter: 0, color: "bg-card-orange", description: "Hot and cold meal preparation, kitchen safety, and culinary sanitation standards." },

            // 2nd Term Core / Applied
            { name: "Contemporary Philippine Arts from the Regions", code: "CPAR", category: "Core Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", quarter: 2, color: "bg-card-purple", description: "Contemporary visual, literary, and performing arts across Philippine regions." },
            { name: "Personal Development", code: "PERDEV", category: "Core Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", quarter: 2, color: "bg-card-blue", description: "Adolescent developmental psychology, self-concept, and interpersonal growth." },
            { name: "Physical Education and Health 2", code: "PEH12_2", category: "Core Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", quarter: 2, color: "bg-card-green", description: "Community fitness, team sports, and sustainable healthy habits." },
            { name: "Practical Research 2", code: "PRACRES2", category: "Applied Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", quarter: 2, color: "bg-card-orange", description: "Quantitative research methodology, statistical instrumentation, and analysis." },

            // 2nd Term Specialized
            { name: "Applied Economics", code: "APPLIED_ECON", category: "Specialized Subject", strandSection: "ABM 12", gradeLevel: 12, strand: "ABM", quarter: 2, color: "bg-card-blue", description: "Economic laws of supply, demand, market structures, and contemporary industries." },
            { name: "Business Ethics and Social Responsibility", code: "BUS_ETHICS", category: "Specialized Subject", strandSection: "ABM 12", gradeLevel: 12, strand: "ABM", quarter: 2, color: "bg-card-green", description: "Philosophical principles of business conduct and corporate social impact." },
            { name: "Trends, Networks and Critical Thinking in the 21st Century Culture", code: "TRENDS", category: "Specialized Subject", strandSection: "HUMSS 12", gradeLevel: 12, strand: "HUMSS", quarter: 2, color: "bg-card-purple", description: "Global trends, planetary networks, critical analytical thinking, and tech ethics." },
            { name: "Creative Non-Fiction", code: "CREAT_NONFIC", category: "Specialized Subject", strandSection: "HUMSS 12", gradeLevel: 12, strand: "HUMSS", quarter: 2, color: "bg-card-orange", description: "Memoir, profile writing, journalistic essays, and literary nonfiction." },
            { name: "General Physics 2", code: "GENPHYS2", category: "Specialized Subject", strandSection: "STEM 12", gradeLevel: 12, strand: "STEM", quarter: 2, color: "bg-card-blue", description: "Electricity, circuits, magnetism, wave optics, and modern quantum physics." },
            { name: "General Chemistry 2", code: "GENCHEM2", category: "Specialized Subject", strandSection: "STEM 12", gradeLevel: 12, strand: "STEM", quarter: 2, color: "bg-card-green", description: "Chemical kinetics, equilibrium, acid-base chemistry, and thermodynamics." },

            // 3rd Term Core / Applied
            { name: "Media and Information Literacy", code: "MIL", category: "Core Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", quarter: 3, color: "bg-card-purple", description: "Digital media analysis, copyright literacy, and ethical media production." },
            { name: "Entrepreneurship", code: "ENTREP", category: "Applied Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", quarter: 3, color: "bg-card-orange", description: "Business enterprise planning, market feasibility, and startup management." },
            { name: "Inquiries, Investigations and Immersion", code: "III", category: "Applied Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", quarter: 3, color: "bg-card-blue", description: "Capstone interdisciplinary research defense and scholarly publication." },

            // 3rd Term Specialized / Work Immersion
            { name: "Business Enterprise Simulation, or Work Immersion", code: "BES_IMMERSION", category: "Specialized Subject", strandSection: "ABM 12", gradeLevel: 12, strand: "ABM", quarter: 3, color: "bg-card-green", description: "On-site business enterprise simulation or field work immersion for ABM." },
            { name: "Culminating Activity or Work Immersion", code: "CULM_IMMERSION", category: "Specialized Subject", strandSection: "HUMSS 12", gradeLevel: 12, strand: "HUMSS", quarter: 3, color: "bg-card-purple", description: "Culminating exhibition, creative portfolio, or field internship for HUMSS." },
            { name: "Work Immersion or Research or Career Advocacy", code: "WRCA_IMMERSION", category: "Specialized Subject", strandSection: "STEM 12", gradeLevel: 12, strand: "STEM", quarter: 3, color: "bg-card-blue", description: "Scientific laboratory immersion, tech development, or career research for STEM." },
            { name: "Work Immersion", code: "WORK_IMMERSION", category: "Specialized Subject", strandSection: "HE 12", gradeLevel: 12, strand: "HE", quarter: 3, color: "bg-card-orange", description: "Direct industry apprenticeship and practical workplace immersion." }
        ];

        const topicsAndRecs = {
            "Physics 1": {
                topics: [ { title: "Units and Measurement", description: "Focuses on the conversion of units, significant figures, and the application of experimental errors and uncertainties in physical measurements.", color: "bg-card-blue" }, { title: "Vectors", description: "Explains the addition of vectors using the graphical and component methods to describe physical quantities with magnitude and direction.", color: "bg-card-orange" }, { title: "Kinematics (Motion in a Straight Line)", description: "Describes the motion of objects using position, time, velocity, and constant acceleration, including the behavior of freely falling bodies.", color: "bg-card-green" } ],
                recommendations: [ { title: "Gravity", description: "Explains Newton's Law of Universal Gravitation and its application to planetary motion and satellite orbits.", comment: "This is for our quiz tomorrow. Happy Learning and God bless!", color: "bg-card-purple", resources: ["File", "Practice Quiz"] } ]
            },
            "Calculus": {
                topics: [ { title: "Limits and Continuity", description: "Introduces the foundational concepts of limits and how they define continuity in functions.", color: "bg-card-green" }, { title: "Derivatives", description: "Explores the concept of the derivative as a rate of change and the rules for differentiation.", color: "bg-card-blue" } ],
                recommendations: []
            },
            "General Mathematics": {
                topics: [ { title: "Functions and Their Graphs", description: "Covers the fundamental concepts of functions, their properties, and graphical representations.", color: "bg-card-green" } ],
                recommendations: [ { title: "Logarithmic Functions", description: "An introduction to logarithmic functions and their relationship to exponential functions.", comment: "Please review this for the upcoming long test.", color: "bg-card-purple", resources: ["File"] } ]
            }
        };

        // Merge the data
        return initialSubjects.map((sub, index) => {
            const details = topicsAndRecs[sub.name];
            return {
                id: Date.now() + index, // Create a unique ID
                ...sub,
                topics: details ? details.topics : [],
                recommendations: details ? details.recommendations : []
            };
        });
    }

    function readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    async function optimizePresentationIfEligible(file) {
        if (!file) return file;
        if (window.MentoraePresentationOptimizer && window.MentoraePresentationOptimizer.isOptimizable(file)) {
            try {
                const optResult = await window.MentoraePresentationOptimizer.optimizeOfficeFile(file);
                if (optResult && optResult.wasOptimized && optResult.file) {
                    return optResult.file;
                }
            } catch (err) {
                console.warn('[Optimizer] Optimization skipped due to error:', err);
            }
        }
        return file;
    }

    function dataURItoBlob(dataURI) {
        // convert base64 to raw binary data held in a string
        var byteString = atob(dataURI.split(',')[1]);

        // separate out the mime component
        var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];

        // write the bytes of the string to an ArrayBuffer
        var ab = new ArrayBuffer(byteString.length);
        var ia = new Uint8Array(ab);
        for (var i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }

        return new Blob([ab], {type: mimeString});
    }

    function loadSubjects() {
        const storedSubjects = localStorage.getItem(SUBJECTS_STORAGE_KEY);
        if (storedSubjects) {
            const subjectsData = JSON.parse(storedSubjects);
            // Data migration: Check if subjects have the quarter property.
            // This ensures that older data in localStorage is compatible.
            const needsMigration = subjectsData.some(s => typeof s.quarter === 'undefined');
            if (needsMigration) {
                subjectsData.forEach(subject => {
                    if (typeof subject.quarter === 'undefined') {
                        // If the old 'semester' property exists, use its value, otherwise default to 1.
                        subject.quarter = typeof subject.semester === 'number' ? subject.semester : 1;
                        delete subject.semester; // Clean up old property
                    }
                });
                saveSubjects(subjectsData); // Save the corrected data back to localStorage
            }
            return subjectsData;
        }
        return [];
    }

    function saveSubjects(subjectsToSave) {
        try {
            localStorage.setItem(SUBJECTS_STORAGE_KEY, JSON.stringify(subjectsToSave));
        } catch (e) {
            console.warn('localStorage full or unavailable (storing files in database backend):', e);
        }
    }

    // --- Topic Management UI ---
    function sortTopicsAscending(topicList) {
        if (!Array.isArray(topicList)) return [];
        return topicList.sort((a, b) => {
            const titleA = String(a && a.title ? a.title : '').trim();
            const titleB = String(b && b.title ? b.title : '').trim();
            return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' });
        });
    }

    function renderTopicsList(topics) {
        if (!topicsListContainer) return;
        topicsListContainer.innerHTML = ''; // Clear existing topics
        if (!topics || topics.length === 0) {
            topicsListContainer.innerHTML = '<p class="text-center text-muted p-3">No topics have been added to this subject yet.</p>';
            return;
        }

        sortTopicsAscending(topics);

        const topicList = document.createElement('div');
        topicList.className = 'list-group';

        topics.forEach((topic, index) => {
            const topicItem = document.createElement('div');
            topicItem.className = 'list-group-item d-flex justify-content-between align-items-center flex-wrap';

            const resourceButtons = [];
            if ((topic.resources || []).includes('Practice Quiz')) {
                resourceButtons.push(`<button type="button" class="btn btn-sm btn-outline-success manage-existing-quiz-btn" data-index="${index}"><i class="bi bi-pencil-square"></i> Quiz</button>`);
            }
            if ((topic.resources || []).includes('Flashcards')) {
                resourceButtons.push(`<button type="button" class="btn btn-sm btn-outline-info manage-existing-flashcard-btn" data-index="${index}"><i class="bi bi-stack"></i> Cards</button>`);
            }
            if ((topic.resources || []).includes('File')) {
                resourceButtons.push(`<button type="button" class="btn btn-sm btn-outline-secondary manage-existing-file-btn" data-index="${index}"><i class="bi bi-file-earmark"></i> Files</button>`);
            }

            topicItem.innerHTML = `
                <div class="me-3 flex-grow-1" style="min-width: 0;">
                    <h6 class="mb-1 text-break">${topic.title}</h6>
                    <small class="text-muted text-break">${topic.description}</small>
                </div>
                <div class="d-inline-flex gap-2 mt-2 mt-sm-0 flex-shrink-0">
                    ${resourceButtons.join('')}
                    <button type="button" class="btn btn-sm btn-outline-primary edit-topic-btn" data-index="${index}" title="Edit Topic"><i class="bi bi-pencil"></i></button>
                    <button type="button" class="btn btn-sm btn-outline-danger delete-topic-btn" data-index="${index}" title="Delete Topic"><i class="bi bi-trash"></i></button>
                </div>
            `;
            topicList.appendChild(topicItem);
        });
        topicsListContainer.appendChild(topicList);
    }

    function renderStagedTopics() {
        stagedTopicsContainer.innerHTML = '';
        if (stagedTopics.length === 0) {
            stagedTopicsContainer.innerHTML = '<p class="text-muted small fst-italic">No topics added yet.</p>';
            return;
        }

        sortTopicsAscending(stagedTopics);

        const list = document.createElement('ul');
        list.className = 'list-group list-group-flush';
        stagedTopics.forEach((topic, index) => {
            const listItem = document.createElement('li');
            listItem.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center small py-2 px-1';
            
            const resourceButtons = [];
            const quizCount = topic.quiz ? topic.quiz.length : 0;
            const flashcardCount = topic.flashcards ? topic.flashcards.length : 0;

            if (topic.resources.includes('Practice Quiz')) {
                const badge = quizCount > 0 ? `<span class="badge rounded-pill bg-success text-white ms-1">${quizCount}</span>` : '';
                resourceButtons.push(`<button type="button" class="btn btn-sm btn-outline-success edit-staged-quiz-btn" data-index="${index}"><i class="bi bi-pencil-square me-1"></i> Quiz${badge}</button>`);
            }
            if (topic.resources.includes('Flashcards')) {
                const badge = flashcardCount > 0 ? `<span class="badge rounded-pill bg-info text-white ms-1">${flashcardCount}</span>` : '';
                resourceButtons.push(`<button type="button" class="btn btn-sm btn-outline-info edit-staged-flashcard-btn" data-index="${index}"><i class="bi bi-stack me-1"></i> Cards${badge}</button>`);
            }

            listItem.innerHTML = `
                <div class="flex-grow-1">
                    <i class="bi bi-file-earmark-text me-2"></i>
                    ${topic.title}
                </div>
                <div class="d-flex gap-2 align-items-center">
                    ${resourceButtons.join('')}
                    <button type="button" class="btn btn-sm btn-outline-danger remove-staged-topic-btn" data-index="${index}">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>
            `;
            list.appendChild(listItem);
        });
        stagedTopicsContainer.appendChild(list);
    }
    // --- UI Rendering ---
    function renderSubjectTable(subjectsToRender) {
        subjectsTableBody.innerHTML = '';
        if (subjectsToRender.length === 0) {
            subjectsTableBody.innerHTML = `<tr><td colspan="8" class="text-center text-muted p-4">No subjects match your criteria.</td></tr>`;
            return;
        }

        const colorMap = {
            'bg-card-green': { label: 'Green', color: '#22c55e' },
            'bg-card-orange': { label: 'Orange', color: '#eab308' },
            'bg-card-blue': { label: 'Blue', color: '#3b82f6' },
            'bg-card-purple': { label: 'Purple', color: '#8b5cf6' },
            'bg-card-red': { label: 'Red', color: '#ef4444' },
        };

        subjectsToRender.forEach(subject => {
            const name = subject.name || '';
            const code = subject.code || '';
            const category = subject.category || subject.classification || 'Core Subject';
            const gradeLevel = subject.gradeLevel != null ? subject.gradeLevel : (subject.grade_level != null ? subject.grade_level : 11);
            const quarter = subject.quarter != null ? subject.quarter : 1;
            let termDisplay = '1st Term';
            if (quarter === 0) {
                termDisplay = '<span class="badge bg-secondary-subtle text-secondary border fw-medium px-2 py-0.5 rounded-pill">All Terms</span>';
            } else if (quarter === 2) {
                termDisplay = '2nd Term';
            } else if (quarter === 3) {
                termDisplay = '3rd Term';
            }

            const strandSection = subject.strandSection || subject.strand_section || 'All Sections';
            const strand = subject.strand || 'Common';
            const colorClass = subject.color || 'bg-card-blue';
            const colorInfo = colorMap[colorClass] || colorMap['bg-card-blue'];

            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="p-3 align-middle">
                    <div class="d-flex align-items-center gap-2">
                        <span class="rounded-circle d-inline-block flex-shrink-0 shadow-sm border" style="width: 13px; height: 13px; background-color: ${colorInfo.color};" title="Card Color: ${colorInfo.label}"></span>
                        <span class="fw-semibold text-dark">${name}</span>
                    </div>
                </td>
                <td class="p-3 align-middle">${code}</td>
                <td class="p-3 align-middle">
                    <div class="fw-semibold text-dark">${category}</div>
                    <span class="badge bg-success-subtle text-success border micro-text mt-1 d-inline-block" title="Grading Component Weights">
                        WW: ${subject.ww_weight || subject.wwWeight || 20}% | PT: ${subject.pt_weight || subject.ptWeight || 50}% | QA: ${subject.qa_weight || subject.qaWeight || 30}%
                    </span>
                </td>
                <td class="p-3 align-middle">${gradeLevel}</td>
                <td class="p-3 align-middle">${termDisplay}</td>
                <td class="p-3 align-middle">${strandSection}</td>
                <td class="p-3 align-middle">${strand}</td>
                <td class="p-3 align-middle text-end">
                    <div class="d-inline-flex gap-2">
                        <button class="btn btn-sm btn-outline-primary edit-btn" data-id="${subject.id}">Edit</button>
                        <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${subject.id}">Delete</button>
                    </div>
                </td>
            `;
            subjectsTableBody.appendChild(row);
        });
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
        const selectedGrade = gradeFilter ? gradeFilter.value : 'All';
        const currentStrand = strandFilter ? strandFilter.value : 'All';

        let availableStrands = [...new Set(subjects.map(s => s.strand))].filter(Boolean);
        if (selectedGrade !== 'All') {
            const allowed = STRANDS_BY_GRADE[selectedGrade] || [];
            availableStrands = availableStrands.filter(s => allowed.includes(s));
        }
        availableStrands.sort();

        strandFilter.innerHTML = '<option value="All">All Strands</option>'; // Reset
        availableStrands.forEach(strand => {
            const option = document.createElement('option');
            option.value = strand;
            option.textContent = strand;
            strandFilter.appendChild(option);
        });

        if (currentStrand && (currentStrand === 'All' || availableStrands.includes(currentStrand))) {
            strandFilter.value = currentStrand;
        } else {
            strandFilter.value = 'All';
        }
    }

    function updateModalStrandOptions() {
        const modalGrade = document.getElementById('subjectGrade');
        const modalStrand = document.getElementById('subjectStrand');
        if (!modalGrade || !modalStrand) return;

        const gradeVal = modalGrade.value;
        const currentStrand = modalStrand.value;
        const allowed = STRANDS_BY_GRADE[gradeVal] || ['Common', 'BAE', 'ASSH', 'STEM', 'HUMSS', 'HE', 'H&T', 'ABM'];

        modalStrand.innerHTML = allowed.map(s => `<option value="${s}">${s}</option>`).join('');
        if (allowed.includes(currentStrand)) {
            modalStrand.value = currentStrand;
        } else {
            modalStrand.value = allowed[0];
        }
    }

    function updateModalSectionOptions(preferredVal) {
        const modalGrade = document.getElementById('subjectGrade');
        const modalStrand = document.getElementById('subjectStrand');
        const sectionSelect = document.getElementById('subjectStrandSection');
        if (!modalGrade || !modalStrand || !sectionSelect) return;

        const gradeVal = parseInt(modalGrade.value, 10) || 11;
        const strandVal = modalStrand.value || 'Common';
        const currentVal = preferredVal !== undefined ? preferredVal : sectionSelect.value;

        // Filter sections matching current grade and strand
        const matchingSections = allSectionsList.filter(s => {
            const secGrade = s.grade_level != null ? Number(s.grade_level) : null;
            const secStrand = (s.strandCode || s.strand || '').toUpperCase();
            const gradeMatches = !secGrade || secGrade === gradeVal;
            const strandMatches = strandVal === 'Common' ? true : (secStrand === strandVal.toUpperCase());
            return gradeMatches && strandMatches;
        });

        const options = [];
        options.push({ value: 'All Sections', label: 'All Sections' });

        if (strandVal !== 'Common') {
            options.push({ value: `${strandVal} ${gradeVal}`, label: `All ${strandVal} ${gradeVal} Sections` });
        }

        matchingSections.forEach(s => {
            const secName = s.name || '';
            const val = `${s.strandCode || s.strand || strandVal} ${gradeVal} - ${secName}`;
            options.push({ value: val, label: val });
        });

        // Ensure previously saved or custom section remains selected
        if (currentVal && !options.some(o => o.value === currentVal)) {
            options.push({ value: currentVal, label: currentVal });
        }

        sectionSelect.innerHTML = '';
        options.forEach(opt => {
            const optEl = document.createElement('option');
            optEl.value = opt.value;
            optEl.textContent = opt.label;
            sectionSelect.appendChild(optEl);
        });

        if (currentVal && options.some(o => o.value === currentVal)) {
            sectionSelect.value = currentVal;
        } else if (strandVal === 'Common') {
            sectionSelect.value = 'All Sections';
        } else if (options.length > 1) {
            sectionSelect.value = options[1].value;
        } else {
            sectionSelect.value = 'All Sections';
        }
    }

    function applyFiltersAndSearch() {
        const searchQuery = tableSearch.value.toLowerCase();
        const selectedGrade = gradeFilter.value;
        const selectedCategory = categoryFilter.value;
        const selectedStrand = strandFilter.value;
        const selectedQuarter = quarterFilter.value;

        const filteredSubjects = subjects.filter(subject => {
            const subjGrade = subject.gradeLevel != null ? subject.gradeLevel : (subject.grade_level != null ? subject.grade_level : 11);
            const subjCategory = subject.category || subject.classification || 'Core Subject';
            const subjStrand = subject.strand || 'Common';
            const subjQuarter = subject.quarter != null ? subject.quarter : 1;
            const subjSection = subject.strandSection || subject.strand_section || 'All Sections';

            const gradeMatch = selectedGrade === 'All' || subjGrade === parseInt(selectedGrade, 10);
            const categoryMatch = selectedCategory === 'All' || subjCategory === selectedCategory;
            const strandMatch = selectedStrand === 'All' || subjStrand === selectedStrand;
            
            let quarterMatch = false;
            if (selectedQuarter === 'All') {
                quarterMatch = true;
            } else {
                const targetQ = parseInt(selectedQuarter, 10);
                quarterMatch = (subjQuarter === targetQ || subjQuarter === 0);
            }
            
            const searchMatch = !searchQuery ||
                (subject.name && subject.name.toLowerCase().includes(searchQuery)) ||
                (subject.code && subject.code.toLowerCase().includes(searchQuery)) ||
                (subjStrand && subjStrand.toLowerCase().includes(searchQuery)) ||
                (subjSection && subjSection.toLowerCase().includes(searchQuery));

            return gradeMatch && categoryMatch && strandMatch && quarterMatch && searchMatch;
        });

        renderSubjectTable(filteredSubjects);
    }

    // --- Event Handlers ---
    async function handleFormSubmit(event) {
        event.preventDefault();
        if (isSaving) return;
        const submitBtn = event.target.querySelector('button[type="submit"]');
        if (submitBtn && submitBtn.disabled) return;
        const subjectId = document.getElementById('subjectId').value;

        // Warn if user filled out topic details in 'Add New Subject' mode but forgot to click "+ Add This Topic"
        const addTopicsSection = document.getElementById('addTopicsSection');
        const isAddTopicsSectionVisible = addTopicsSection && !addTopicsSection.classList.contains('d-none');
        if (isAddTopicsSectionVisible) {
            const inlineTitle = (document.getElementById('inlineTopicTitle')?.value || '').trim();
            const inlineDesc = (document.getElementById('inlineTopicDescription')?.value || '').trim();
            const hasCheckedResources = (
                document.getElementById('inlineResourceFile')?.checked ||
                document.getElementById('inlineResourceQuiz')?.checked ||
                document.getElementById('inlineResourceFlashcards')?.checked ||
                (inlineTopicContent && inlineTopicContent.quiz && inlineTopicContent.quiz.length > 0) ||
                (inlineTopicContent && inlineTopicContent.flashcards && inlineTopicContent.flashcards.length > 0)
            );

            if (inlineTitle || inlineDesc || hasCheckedResources) {
                alert(`You entered topic details ("${inlineTitle || 'Untitled Topic'}") but forgot to click "+ Add This Topic".\n\nPlease click "+ Add This Topic" first to save this topic, or clear the topic fields before saving the subject.`);
                const addTopicBtn = document.getElementById('addStagedTopicBtn');
                if (addTopicBtn) {
                    addTopicBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    addTopicBtn.focus();
                }
                return; // Stop saving to prevent losing the topic
            }
        }

        const wwWeight = parseFloat(document.getElementById('subjectWwWeight')?.value) || 20;
        const ptWeight = parseFloat(document.getElementById('subjectPtWeight')?.value) || 50;
        const qaWeight = parseFloat(document.getElementById('subjectQaWeight')?.value) || 30;

        if (Math.round(wwWeight + ptWeight + qaWeight) !== 100) {
            alert(`Grading component weights must sum to exactly 100%!\nCurrent total: ${Math.round(wwWeight + ptWeight + qaWeight)}% (WW: ${wwWeight}%, PT: ${ptWeight}%, QA: ${qaWeight}%)`);
            return;
        }

        const origSubmitHtml = submitBtn ? submitBtn.innerHTML : 'Save Subject';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Saving...';
        }
        isSaving = true;

        try {
            const subjectData = {
                name: document.getElementById('subjectName').value,
                code: document.getElementById('subjectCode').value,
                description: document.getElementById('subjectDescription').value,
                category: document.getElementById('subjectCategory').value,
                gradeLevel: parseInt(document.getElementById('subjectGrade').value, 10),
                quarter: parseInt(document.getElementById('subjectQuarter').value, 10),
                strand: document.getElementById('subjectStrand').value,
                strandSection: document.getElementById('subjectStrandSection').value,
                color: document.getElementById('subjectColor').value,
                ww_weight: wwWeight,
                pt_weight: ptWeight,
                qa_weight: qaWeight,
                wwWeight: wwWeight,
                ptWeight: ptWeight,
                qaWeight: qaWeight
            };

            const token = localStorage.getItem('mentorae_token');

            if (subjectId) { // Editing existing subject
                let updatedSubjectId = subjectId;
                const payloadTopics = (editingSubjectCopy && editingSubjectCopy.topics) ? editingSubjectCopy.topics : [];
                if (token) {
                    try {
                        let res = await authedFetch(`/api/reference/subjects/${subjectId}`, token, {
                            method: 'PUT',
                            body: JSON.stringify({ id: subjectId, ...subjectData, topics: payloadTopics })
                        });
                        // Fallback to POST if server returns Not found or method not allowed
                        if (!res || (!res.success && (res.message === 'Not found.' || res.message === 'Subject not found.'))) {
                            res = await authedFetch('/api/reference/subjects', token, {
                                method: 'POST',
                                body: JSON.stringify({ id: subjectId, ...subjectData, topics: payloadTopics })
                            });
                        }
                        if (res && !res.success) {
                            alert(res.message || 'Failed to update subject in database.');
                            return;
                        }
                        if (res && res.subjectId) {
                            updatedSubjectId = res.subjectId;
                        }
                    } catch (err) {
                        console.error('Error updating subject in database:', err);
                    }
                }

                const index = subjects.findIndex(s => s.id == subjectId);
                if (index !== -1) {
                    // The editingSubjectCopy already has the updated topics.
                    // Now, update its main properties from the form fields.
                    editingSubjectCopy.id = updatedSubjectId;
                    editingSubjectCopy.name = subjectData.name;
                    editingSubjectCopy.code = subjectData.code;
                    editingSubjectCopy.description = subjectData.description;
                    editingSubjectCopy.category = subjectData.category;
                    editingSubjectCopy.gradeLevel = subjectData.gradeLevel;
                    editingSubjectCopy.quarter = subjectData.quarter;
                    editingSubjectCopy.strand = subjectData.strand;
                    editingSubjectCopy.strandSection = subjectData.strandSection;
                    editingSubjectCopy.color = subjectData.color;
                    editingSubjectCopy.ww_weight = subjectData.ww_weight;
                    editingSubjectCopy.pt_weight = subjectData.pt_weight;
                    editingSubjectCopy.qa_weight = subjectData.qa_weight;
                    editingSubjectCopy.wwWeight = subjectData.ww_weight;
                    editingSubjectCopy.ptWeight = subjectData.pt_weight;
                    editingSubjectCopy.qaWeight = subjectData.qa_weight;

                    subjects[index] = editingSubjectCopy; // Replace original with the edited copy
                }
            } else { // Adding new subject
                // Validate that staged topics with resources actually have content.
                for (const topic of stagedTopics) {
                    if (topic.resources.includes('Practice Quiz') && (!topic.quiz || topic.quiz.length === 0)) {
                        alert(`The topic "${topic.title}" is marked as having a 'Practice Quiz' but no questions have been added. Please edit the topic's quiz content before saving the subject.`);
                        return; // Stop submission
                    }
                    if (topic.resources.includes('Flashcards') && (!topic.flashcards || topic.flashcards.length === 0)) {
                        alert(`The topic "${topic.title}" is marked as having 'Flashcards' but no cards have been added. Please edit the topic's flashcard content before saving the subject.`);
                        return; // Stop submission
                    }
                    // This validation is also needed because a user could check the box but not upload a file.
                    if (topic.resources.includes('File') && (!topic.files || topic.files.length === 0)) {
                        alert(`The topic "${topic.title}" is marked as having a 'File' but no file was uploaded. Please remove and re-add the topic with a file.`);
                        return; // Stop submission
                    }
                }

                let newId = Date.now();
                if (token) {
                    try {
                        const res = await authedFetch('/api/reference/subjects', token, {
                            method: 'POST',
                            body: JSON.stringify({
                                ...subjectData,
                                topics: stagedTopics
                            })
                        });
                        if (res && res.success && res.subjectId) {
                            newId = res.subjectId;
                        } else if (res && !res.success) {
                            alert(res.message || 'Failed to save subject in database.');
                            return;
                        }
                    } catch (err) {
                        console.error('Error saving subject to backend:', err);
                    }
                }

                subjects.unshift({
                    id: newId,
                    ...subjectData,
                    topics: stagedTopics, // Add the staged topics
                    recommendations: []
                });
            }

            try {
                saveSubjects(subjects);
                populateStrandFilter(); // Repopulate in case a new strand was added
                applyFiltersAndSearch(); // Re-render table with filters
                if (subjectModal) subjectModal.hide();
            } catch (e) {
                // This error typically happens when localStorage is full.
                if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                    alert('Error: Could not save subject. The browser\'s local storage is full, likely because the uploaded file is too large. Please use a smaller file or remove other subjects with large attachments.');
                    // Revert the in-memory change by reloading the last valid state from storage.
                    subjects = loadSubjects();
                } else {
                    alert('An unexpected error occurred while saving the subject.');
                    console.error(e);
                }
            }
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = origSubmitHtml;
            }
            isSaving = false;
        }
    }



    async function handleTableClick(event) {
        const target = event.target;
        const subjectId = target.dataset.id;

        if (target.classList.contains('edit-btn')) {
            const subjectToEdit = subjects.find(s => s.id == subjectId);
            if (subjectToEdit) {
                // Create a deep copy for editing to prevent premature saves.
                editingSubjectCopy = JSON.parse(JSON.stringify(subjectToEdit));
                currentEditingSubjectId = subjectId; // Keep track of the original ID.

                subjectModalLabel.textContent = 'Edit Subject';
                // Populate form from the copy
                document.getElementById('subjectId').value = editingSubjectCopy.id || '';
                document.getElementById('subjectName').value = editingSubjectCopy.name || '';
                document.getElementById('subjectCode').value = editingSubjectCopy.code || '';
                document.getElementById('subjectDescription').value = editingSubjectCopy.description || '';
                document.getElementById('subjectCategory').value = editingSubjectCopy.category || editingSubjectCopy.classification || 'Core Subject';
                document.getElementById('subjectGrade').value = editingSubjectCopy.gradeLevel != null ? editingSubjectCopy.gradeLevel : (editingSubjectCopy.grade_level != null ? editingSubjectCopy.grade_level : 11);
                updateModalStrandOptions();
                document.getElementById('subjectQuarter').value = editingSubjectCopy.quarter != null ? editingSubjectCopy.quarter : 1;
                document.getElementById('subjectStrand').value = editingSubjectCopy.strand || 'Common';
                const existingSection = editingSubjectCopy.strandSection || editingSubjectCopy.strand_section || 'All Sections';
                updateModalSectionOptions(existingSection);
                document.getElementById('subjectStrandSection').value = existingSection;
                document.getElementById('subjectColor').value = editingSubjectCopy.color || 'bg-card-blue';

                const editCat = editingSubjectCopy.category || editingSubjectCopy.classification || 'Core Subject';
                const defWeights = getCategoryDefaultWeights(editCat);
                const wwVal = editingSubjectCopy.ww_weight != null ? editingSubjectCopy.ww_weight : (editingSubjectCopy.wwWeight != null ? editingSubjectCopy.wwWeight : defWeights.ww);
                const ptVal = editingSubjectCopy.pt_weight != null ? editingSubjectCopy.pt_weight : (editingSubjectCopy.ptWeight != null ? editingSubjectCopy.ptWeight : defWeights.pt);
                const qaVal = editingSubjectCopy.qa_weight != null ? editingSubjectCopy.qa_weight : (editingSubjectCopy.qaWeight != null ? editingSubjectCopy.qaWeight : defWeights.qa);

                if (document.getElementById('subjectWwWeight')) document.getElementById('subjectWwWeight').value = wwVal;
                if (document.getElementById('subjectPtWeight')) document.getElementById('subjectPtWeight').value = ptVal;
                if (document.getElementById('subjectQaWeight')) document.getElementById('subjectQaWeight').value = qaVal;
                updateSubjectWeightsBadge();

                if (subjectModal) subjectModal.show();

                // Show and populate the topic management section for editing
                const manageTopicsSection = document.getElementById('manageTopicsSection');
                if (manageTopicsSection) {
                    manageTopicsSection.classList.remove('d-none');
                    renderTopicsList(editingSubjectCopy.topics || []);
                }
                document.getElementById('addTopicsSection').classList.add('d-none'); // Hide topic section when editing

                // Fetch authoritative live topics with full content (quizzes, flashcards, files)
                const token = localStorage.getItem('mentorae_token');
                if (token) {
                    authedFetch(`/api/content/topics?subjectId=${encodeURIComponent(subjectId)}`, token)
                        .then(topicRes => {
                            if (topicRes && topicRes.success && Array.isArray(topicRes.topics)) {
                                if (currentEditingSubjectId == subjectId && editingSubjectCopy) {
                                    editingSubjectCopy.topics = sortTopicsAscending(topicRes.topics.map(t => ({
                                        id: t.id,
                                        title: t.title,
                                        description: t.description || '',
                                        resources: t.resources || [],
                                        quiz: t.quiz || [],
                                        flashcards: t.flashcards || [],
                                        files: t.files || [],
                                        color: t.color || 'bg-card-blue'
                                    })));
                                    if (subjectToEdit) {
                                        subjectToEdit.topics = JSON.parse(JSON.stringify(editingSubjectCopy.topics));
                                    }
                                    renderTopicsList(editingSubjectCopy.topics || []);
                                }
                            }
                        })
                        .catch(err => console.warn('Could not fetch live topics for subject:', err));
                }
            }
        }

        if (target.classList.contains('delete-btn')) {
            if (confirm('Are you sure you want to delete this subject? This action cannot be undone.')) {
                const token = localStorage.getItem('mentorae_token');
                if (token) {
                    try {
                        const res = await authedFetch(`/api/reference/subjects/${subjectId}`, token, {
                            method: 'DELETE'
                        });
                        if (res && !res.success) {
                            alert(res.message || 'Failed to delete subject from database.');
                            return;
                        }
                    } catch (err) {
                        console.error('Error deleting subject from backend:', err);
                    }
                }
                subjects = subjects.filter(s => s.id != subjectId);
                saveSubjects(subjects);
                populateStrandFilter(); // Repopulate in case a strand was removed
                applyFiltersAndSearch(); // Re-render table with filters
            }
        }
    }

    async function handleTopicsContainerClick(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        const target = event.target.closest('button');
        if (!target) return;

        const subject = editingSubjectCopy; // Work on the temporary copy
        if (!subject) return;

        if (target.classList.contains('edit-topic-btn')) {
            const topicIndex = target.dataset.index;
            currentTopicIndexForEditing = topicIndex;
            const topic = subject.topics[topicIndex];
            
            if (topicEditorForm) topicEditorForm.reset();
            if (document.getElementById('topicEditorModalLabel')) document.getElementById('topicEditorModalLabel').textContent = 'Edit Topic';
            document.getElementById('topicId').value = topicIndex;
            document.getElementById('topicTitle').value = topic.title;
            document.getElementById('topicDescription').value = topic.description;

            // Set checkboxes
            document.getElementById('resourceFile').checked = (topic.resources || []).includes('File');
            document.getElementById('resourceQuiz').checked = (topic.resources || []).includes('Practice Quiz');
            document.getElementById('resourceFlashcards').checked = (topic.resources || []).includes('Flashcards');
            
            // Populate inlineTopicContent with existing topic content
            inlineTopicContent = {
                files: [...(topic.files || [])],
                quiz: [...(topic.quiz || [])],
                flashcards: [...(topic.flashcards || [])]
            };

            renderTopicEditorCurrentFiles();

            document.querySelectorAll('.topic-editor-resource-cb').forEach(cb => {
                const container = document.getElementById(cb.dataset.targetContainer);
                if (container) {
                    container.classList.toggle('d-none', !cb.checked);
                }
            });

            isTransitioningToSubmodal = true;
            const onModalHidden = () => {
                isTransitioningToSubmodal = false;
                if (topicEditorModal) topicEditorModal.show();
                if (subjectModalEl) subjectModalEl.removeEventListener('hidden.bs.modal', onModalHidden);
            };
            if (subjectModalEl) subjectModalEl.addEventListener('hidden.bs.modal', onModalHidden);
            if (subjectModal) subjectModal.hide();
        }

        if (target.classList.contains('delete-topic-btn')) {
            const topicIndex = parseInt(target.dataset.index, 10);
            const topicToDelete = subject.topics[topicIndex];
            if (confirm(`Are you sure you want to delete the topic "${topicToDelete ? topicToDelete.title : 'this topic'}"?`)) {
                const token = localStorage.getItem('mentorae_token');
                if (topicToDelete && topicToDelete.id && token) {
                    try {
                        await authedFetch(`/api/content/topics/${topicToDelete.id}`, token, { method: 'DELETE' });
                    } catch (e) {
                        console.error('Error deleting topic from backend:', e);
                    }
                }
                subject.topics.splice(topicIndex, 1);
                renderTopicsList(subject.topics);
            }
        }

        if (target.classList.contains('manage-existing-quiz-btn')) {
            const topicIndex = target.dataset.index;
            openExistingQuizEditor(topicIndex);
        }

        if (target.classList.contains('manage-existing-flashcard-btn')) {
            const topicIndex = target.dataset.index;
            openExistingFlashcardEditor(topicIndex);
        }

        if (target.classList.contains('manage-existing-file-btn')) {
            const topicIndex = target.dataset.index;
            openExistingFileEditor(topicIndex);
        }
    }

    function escapeHtml(str) {
        if (!str && str !== 0) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function getFileDisplayMeta(fileName) {
        const ext = (fileName || '').split('.').pop().toLowerCase();
        switch (ext) {
            case 'pdf':
                return { icon: 'bi-file-earmark-pdf-fill text-danger', label: 'PDF Document', type: 'pdf' };
            case 'pptx':
            case 'ppt':
                return { icon: 'bi-file-earmark-ppt-fill text-danger', label: 'PowerPoint Presentation', type: 'presentation' };
            case 'docx':
            case 'doc':
                return { icon: 'bi-file-earmark-word-fill text-primary', label: 'Word Document', type: 'word' };
            case 'xlsx':
            case 'xls':
                return { icon: 'bi-file-earmark-excel-fill text-success', label: 'Excel Spreadsheet', type: 'spreadsheet' };
            case 'png':
            case 'jpg':
            case 'jpeg':
            case 'gif':
            case 'webp':
            case 'svg':
                return { icon: 'bi-file-earmark-image-fill text-info', label: 'Image File', type: 'image' };
            case 'mp4':
            case 'webm':
                return { icon: 'bi-file-earmark-play-fill text-danger', label: 'Video File', type: 'video' };
            case 'mp3':
            case 'wav':
            case 'ogg':
                return { icon: 'bi-file-earmark-music-fill text-warning', label: 'Audio File', type: 'audio' };
            case 'txt':
            case 'md':
            case 'json':
            case 'csv':
                return { icon: 'bi-file-earmark-code-fill text-secondary', label: 'Text / Data File', type: 'text' };
            default:
                return { icon: 'bi-file-earmark-text-fill text-primary', label: 'Attached Material', type: 'other' };
        }
    }

    function renderTopicEditorCurrentFiles() {
        const container = document.getElementById('topicEditorCurrentFilesContainer');
        if (!container) return;
        const files = (inlineTopicContent && Array.isArray(inlineTopicContent.files)) ? inlineTopicContent.files : [];
        if (files.length === 0) {
            container.innerHTML = '';
            return;
        }
        container.innerHTML = `
            <label class="form-label text-sm fw-medium mb-1">Current Attached Files (Click to inspect)</label>
            <div class="list-group mb-2 shadow-xs rounded-3 overflow-hidden">
                ${files.map((f, i) => {
                    const meta = getFileDisplayMeta(f.name);
                    const isReady = !!(f.pdfDataUrl || f.convertedToPdf);
                    const fileSizeText = f.size ? `${(f.size / 1024).toFixed(2)} KB` : '';
                    return `
                    <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-2 px-3 small">
                        <div class="d-flex align-items-center flex-grow-1 text-truncate me-2 preview-topic-editor-file-trigger" data-index="${i}" role="button" style="cursor: pointer;" title="Click to view and check file contents">
                            <i class="bi ${meta.icon} fs-5 me-2 flex-shrink-0"></i>
                            <div class="text-truncate">
                                <span class="fw-semibold text-dark text-truncate d-block">${escapeHtml(f.name)}</span>
                                <div class="d-flex align-items-center gap-1.5 mt-0.5">
                                    <span class="text-muted micro-text">${fileSizeText}</span>
                                    <span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle rounded-pill micro-text">${meta.label}</span>
                                    ${isReady ? '<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill micro-text"><i class="bi bi-check-circle me-1"></i>HD Ready</span>' : ''}
                                </div>
                            </div>
                        </div>
                        <div class="d-flex align-items-center gap-1 flex-shrink-0">
                            <button type="button" class="btn btn-sm btn-outline-primary preview-topic-editor-file-btn rounded-pill px-2.5 py-0.5 fw-semibold" data-index="${i}" title="View and check this file">
                                <i class="bi bi-eye me-1"></i>View
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-danger remove-topic-editor-file-btn rounded-circle p-1" style="width: 28px; height: 28px;" data-index="${i}" title="Remove file">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        `;
    }

    function handleModalOpen() {
        subjectForm.reset();
        document.getElementById('subjectId').value = '';
        stagedTopics = []; // Clear any previously staged topics
        inlineTopicContent = { files: [], quiz: [], flashcards: [] }; // Reset inline content
        renderStagedTopics(); // Update the UI to show it's empty
        subjectModalLabel.textContent = 'Add New Subject';
        document.getElementById('addTopicsSection').classList.remove('d-none'); // Show topic section for adding

        // Hide the topic management section when adding a new subject
        const manageTopicsSection = document.getElementById('manageTopicsSection');
        if (manageTopicsSection) manageTopicsSection.classList.add('d-none');
        updateModalStrandOptions();
        updateModalSectionOptions('All Sections');

        // Also reset the inline file upload
        document.querySelectorAll('.inline-resource-checkbox').forEach(cb => {
            const container = document.getElementById(cb.dataset.targetContainer);
            if (container) container.classList.add('d-none');
        });
        const fileInput = document.getElementById('inlineFileInput');
        if (fileInput) fileInput.value = '';

        const cat = document.getElementById('subjectCategory')?.value || 'Core Subject';
        const defW = getCategoryDefaultWeights(cat);
        if (document.getElementById('subjectWwWeight')) document.getElementById('subjectWwWeight').value = defW.ww;
        if (document.getElementById('subjectPtWeight')) document.getElementById('subjectPtWeight').value = defW.pt;
        if (document.getElementById('subjectQaWeight')) document.getElementById('subjectQaWeight').value = defW.qa;
        updateSubjectWeightsBadge();
    }

    function handleAddNewTopicClick() {
        if (topicEditorForm) topicEditorForm.reset();
        if (document.getElementById('topicEditorModalLabel')) document.getElementById('topicEditorModalLabel').textContent = 'Add New Topic';
        document.getElementById('topicId').value = '';
        
        inlineTopicContent = { files: [], quiz: [], flashcards: [] };
        renderTopicEditorCurrentFiles();
        document.querySelectorAll('.topic-editor-resource-cb').forEach(cb => {
            const container = document.getElementById(cb.dataset.targetContainer);
            if (container) container.classList.add('d-none');
        });
        const fileInput = document.getElementById('topicEditorFileInput');
        if (fileInput) fileInput.value = '';

        isTransitioningToSubmodal = true;
        const onModalHidden = () => {
            isTransitioningToSubmodal = false;
            if (topicEditorModal) topicEditorModal.show();
            if (subjectModalEl) subjectModalEl.removeEventListener('hidden.bs.modal', onModalHidden);
        };
        if (subjectModalEl) subjectModalEl.addEventListener('hidden.bs.modal', onModalHidden);
        if (subjectModal) subjectModal.hide();
    }

    async function handleTopicFormSubmit(event) {
        if (event) event.preventDefault();
        const titleInput = document.getElementById('topicTitle');
        const descriptionInput = document.getElementById('topicDescription');
        const title = titleInput.value.trim();

        if (!title) {
            alert('Please provide a title for the topic.');
            titleInput.focus();
            return;
        }

        const subject = editingSubjectCopy; // Work on the temporary copy
        if (!subject) return;

        const topicIndex = document.getElementById('topicId').value;
        const selectedResources = [];
        if (document.getElementById('resourceFile').checked) selectedResources.push('File');
        if (document.getElementById('resourceQuiz').checked) selectedResources.push('Practice Quiz');
        if (document.getElementById('resourceFlashcards').checked) selectedResources.push('Flashcards');

        const cleanTitle = document.getElementById('topicTitle').value.trim();
        const cleanDesc = document.getElementById('topicDescription').value.trim();

        const topicData = {
            title: cleanTitle,
            description: cleanDesc,
            resources: selectedResources
        };

        const token = localStorage.getItem('mentorae_token');

        if (topicIndex !== '') { // Editing existing topic
            const fileInput = document.getElementById('topicEditorFileInput');
            const oldTopic = subject.topics[topicIndex];
            const existingFiles = (inlineTopicContent.files || oldTopic.files || []);

            // Validation for editing
            if (selectedResources.includes('File') && existingFiles.length === 0 && (!fileInput.files || fileInput.files.length === 0)) {
                return alert('You have selected "File" as a resource but have not chosen a file.');
            }
            if (selectedResources.includes('Practice Quiz') && inlineTopicContent.quiz.length === 0) {
                return alert('You have selected "Practice Quiz" but no questions have been added. Please use the "Manage Quiz Content" button.');
            }
            if (selectedResources.includes('Flashcards') && inlineTopicContent.flashcards.length === 0) {
                return alert('You have selected "Flashcards" but no cards have been added. Please use the "Manage Flashcards Content" button.');
            }

            const updatedTopic = { ...oldTopic, ...topicData };
            updatedTopic.quiz = [...inlineTopicContent.quiz];
            updatedTopic.flashcards = [...inlineTopicContent.flashcards];
            updatedTopic.files = [...(inlineTopicContent.files || oldTopic.files || [])];

            // Handle file upload for editing (only if a new file is selected)
            if (selectedResources.includes('File') && fileInput.files && fileInput.files.length > 0) {
                let file = fileInput.files[0];
                file = await optimizePresentationIfEligible(file);
                if (file.size > 25 * 1024 * 1024) {
                    return alert(`File "${file.name}" is too large (max 25MB).`);
                }
                try {
                    const fileDataUrl = await readFileAsDataURL(file);
                    updatedTopic.files.push({ name: file.name, size: file.size, dataUrl: fileDataUrl });
                } catch (error) {
                    console.error("Error reading file:", error);
                    return alert("There was an error reading the file.");
                }
            } else if (!selectedResources.includes('File')) {
                updatedTopic.files = [];
            }

            subject.topics[topicIndex] = updatedTopic;

            // Immediately persist changes to backend database if this subject already exists in database
            if (token && currentEditingSubjectId && updatedTopic.id) {
                try {
                    await authedFetch(`/api/content/topics/${updatedTopic.id}`, token, {
                        method: 'PUT',
                        body: JSON.stringify({
                            title: cleanTitle,
                            description: updatedTopic.description,
                            contentPayload: {
                                resources: updatedTopic.resources || [],
                                files: updatedTopic.files || [],
                                quiz: updatedTopic.quiz || [],
                                flashcards: updatedTopic.flashcards || []
                            }
                        })
                    });
                } catch (err) {
                    console.warn('Direct topic update notice:', err);
                }
            }
        } else { // Adding new topic
            // NEW: Validate and add content
            const fileInput = document.getElementById('topicEditorFileInput');
            if (selectedResources.includes('File') && fileInput.files.length === 0) {
                return alert('You have selected "File" as a resource but have not chosen a file.');
            }
            if (selectedResources.includes('Practice Quiz') && inlineTopicContent.quiz.length === 0) {
                return alert('You have selected "Practice Quiz" but no questions have been added. Please use the "Manage Quiz Content" button.');
            }
            if (selectedResources.includes('Flashcards') && inlineTopicContent.flashcards.length === 0) {
                return alert('You have selected "Flashcards" but no cards have been added. Please use the "Manage Flashcards Content" button.');
            }

            topicData.files = [];
            topicData.quiz = [...inlineTopicContent.quiz];
            topicData.flashcards = [...inlineTopicContent.flashcards];
            topicData.createdAt = new Date().toISOString();
            topicData.createdBy = 'admin';

            if (selectedResources.includes('File') && fileInput.files.length > 0) {
                let file = fileInput.files[0];
                file = await optimizePresentationIfEligible(file);
                if (file.size > 25 * 1024 * 1024) {
                    return alert(`File "${file.name}" is too large (max 25MB).`);
                }
                try {
                    const fileDataUrl = await readFileAsDataURL(file);
                    topicData.files.push({ name: file.name, size: file.size, dataUrl: fileDataUrl });
                } catch (error) {
                    console.error("Error reading file:", error);
                    return alert("There was an error reading the file.");
                }
            }

            // Immediately persist to backend if subject already exists
            if (token && currentEditingSubjectId) {
                try {
                    const res = await authedFetch('/api/content/topics', token, {
                        method: 'POST',
                        body: JSON.stringify({
                            subjectId: currentEditingSubjectId,
                            title: cleanTitle,
                            description: topicData.description,
                            contentPayload: {
                                resources: topicData.resources || [],
                                files: topicData.files || [],
                                quiz: topicData.quiz || [],
                                flashcards: topicData.flashcards || []
                            }
                        })
                    });
                    if (res && res.topicId) {
                        topicData.id = res.topicId;
                    }
                } catch (err) {
                    console.warn('Direct topic create notice:', err);
                }
            }

            if (!subject.topics) subject.topics = [];
            subject.topics.push(topicData);
        }

        sortTopicsAscending(subject.topics);
        const subjectToEdit = subjects.find(s => s.id == currentEditingSubjectId);
        if (subjectToEdit) {
            subjectToEdit.topics = JSON.parse(JSON.stringify(subject.topics));
        }
        renderTopicsList(subject.topics);
        isSavingTopic = true;
        if (topicEditorModal) topicEditorModal.hide();
    }

    async function handleAddStagedTopic() {
        const titleInput = document.getElementById('inlineTopicTitle');
        const descriptionInput = document.getElementById('inlineTopicDescription');
        const title = titleInput.value.trim();

        if (!title) {
            alert('Please provide a title for the topic.');
            titleInput.focus();
            return;
        }

        const addStagedTopicBtn = document.getElementById('addStagedTopicBtn');
        addStagedTopicBtn.disabled = true;
        addStagedTopicBtn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Adding...`;

        const selectedResources = [];
        if (document.getElementById('inlineResourceFile').checked) selectedResources.push('File');
        if (document.getElementById('inlineResourceQuiz').checked) selectedResources.push('Practice Quiz');
        if (document.getElementById('inlineResourceFlashcards').checked) selectedResources.push('Flashcards');

        const fileInput = document.getElementById('inlineFileInput');

        // Immediate validation for file resource.
        if (selectedResources.includes('File') && fileInput.files.length === 0) {
            alert('You have selected "File" as a resource but have not chosen a file. Please select a file to upload before adding the topic.');
            // Re-enable the button
            addStagedTopicBtn.disabled = false;
            addStagedTopicBtn.innerHTML = `<i class="bi bi-plus-lg me-1"></i> Add This Topic`;
            return;
        }

        // NEW: Immediate validation for Quiz and Flashcards content.
        if (selectedResources.includes('Practice Quiz') && inlineTopicContent.quiz.length === 0) {
            alert('You have selected "Practice Quiz" but no questions have been added. Please use the "Manage Quiz Content" button to add questions before adding the topic.');
            addStagedTopicBtn.disabled = false;
            addStagedTopicBtn.innerHTML = `<i class="bi bi-plus-lg me-1"></i> Add This Topic`;
            return;
        }
        if (selectedResources.includes('Flashcards') && inlineTopicContent.flashcards.length === 0) {
            alert('You have selected "Flashcards" but no cards have been added. Please use the "Manage Flashcards Content" button to add cards before adding the topic.');
            addStagedTopicBtn.disabled = false;
            addStagedTopicBtn.innerHTML = `<i class="bi bi-plus-lg me-1"></i> Add This Topic`;
            return;
        }

        const topicData = {
            title: title,
            description: descriptionInput.value.trim(),
            resources: selectedResources,
            files: [], 
            quiz: [...inlineTopicContent.quiz], // NEW: Copy content from inline editor state
            flashcards: [...inlineTopicContent.flashcards], // NEW: Copy content from inline editor state
            createdAt: new Date().toISOString(),
            createdBy: 'admin' // Mark as admin-created
        };

        const hasFile = selectedResources.includes('File') && fileInput.files.length > 0;

        if (hasFile) {
            let file = fileInput.files[0];
            file = await optimizePresentationIfEligible(file);
            if (file.size > 25 * 1024 * 1024) {
                alert(`File "${file.name}" is too large (max 25MB).`);
                addStagedTopicBtn.disabled = false;
                addStagedTopicBtn.innerHTML = `<i class="bi bi-plus-lg me-1"></i> Add This Topic`;
                return;
            }

            try {
                const fileDataUrl = await readFileAsDataURL(file);
                topicData.files.push({
                    name: file.name,
                    size: file.size,
                    dataUrl: fileDataUrl
                });
            } catch (error) {
                console.error("Error reading file:", error);
                alert("There was an error reading the file. Please try again.");
                addStagedTopicBtn.disabled = false;
                addStagedTopicBtn.innerHTML = `<i class="bi bi-plus-lg me-1"></i> Add This Topic`;
                return;
            }
        }

        stagedTopics.push(topicData);
        sortTopicsAscending(stagedTopics);
        renderStagedTopics();

        // Reset the inline form
        titleInput.value = '';
        descriptionInput.value = '';
        document.getElementById('inlineResourceFile').checked = false;
        document.getElementById('inlineResourceQuiz').checked = false;
        document.getElementById('inlineResourceFlashcards').checked = false;
        
        // NEW: Reset inline content state and hide manager buttons
        inlineTopicContent = { quiz: [], flashcards: [] };
        document.querySelectorAll('.inline-resource-checkbox').forEach(cb => {
            const container = document.getElementById(cb.dataset.targetContainer);
            if (container) container.classList.add('d-none');
        });

        addStagedTopicBtn.disabled = false;
        addStagedTopicBtn.innerHTML = `<i class="bi bi-plus-lg me-1"></i> Add This Topic`;
    }

    // --- Staged Content Editors ---
    function openInlineQuizEditor() {
        contentEditorReturnContext = 'subjectModal'; // NEW
        isEditingStagedContent = false; // Set flag for inline editing
        isTransitioningToSubmodal = true;
        const onModalHidden = () => {
            isTransitioningToSubmodal = false;
            document.getElementById('stagedQuizEditorModalLabel').textContent = `Edit Quiz for: New Topic`;
            renderStagedQuizQuestions();
            if (stagedQuizEditorModal) stagedQuizEditorModal.show();
            subjectModalEl.removeEventListener('hidden.bs.modal', onModalHidden);
        };
        if (subjectModalEl) subjectModalEl.addEventListener('hidden.bs.modal', onModalHidden);
        if (subjectModal) subjectModal.hide();
    }

    function openInlineFlashcardEditor() {
        contentEditorReturnContext = 'subjectModal'; // NEW
        isEditingStagedContent = false; // Set flag for inline editing
        isTransitioningToSubmodal = true;
        const onModalHidden = () => {
            isTransitioningToSubmodal = false;
            document.getElementById('stagedFlashcardEditorModalLabel').textContent = `Edit Flashcards for: New Topic`;
            renderStagedFlashcards();
            if (stagedFlashcardEditorModal) stagedFlashcardEditorModal.show();
            subjectModalEl.removeEventListener('hidden.bs.modal', onModalHidden);
        };
        if (subjectModalEl) subjectModalEl.addEventListener('hidden.bs.modal', onModalHidden);
        if (subjectModal) subjectModal.hide();
    }

    // NEW functions
    function openTopicEditorQuizModal() {
        contentEditorReturnContext = 'topicEditorModal';
        isEditingStagedContent = false; // Use inlineTopicContent
        isTransitioningToSubmodal = true;
        const currentTitle = (document.getElementById('topicTitle')?.value || '').trim() || 'Topic';
        const onModalHidden = () => {
            isTransitioningToSubmodal = false;
            const labelEl = document.getElementById('stagedQuizEditorModalLabel');
            if (labelEl) labelEl.textContent = `Edit Quiz for: ${currentTitle}`;
            renderStagedQuizQuestions();
            if (stagedQuizEditorModal) stagedQuizEditorModal.show();
            if (topicEditorModalEl) topicEditorModalEl.removeEventListener('hidden.bs.modal', onModalHidden);
        };
        if (topicEditorModalEl) topicEditorModalEl.addEventListener('hidden.bs.modal', onModalHidden);
        if (topicEditorModal) topicEditorModal.hide();
    }

    function openTopicEditorFlashcardModal() {
        contentEditorReturnContext = 'topicEditorModal';
        isEditingStagedContent = false; // Use inlineTopicContent
        isTransitioningToSubmodal = true;
        const currentTitle = (document.getElementById('topicTitle')?.value || '').trim() || 'Topic';
        const onModalHidden = () => {
            isTransitioningToSubmodal = false;
            const labelEl = document.getElementById('stagedFlashcardEditorModalLabel');
            if (labelEl) labelEl.textContent = `Edit Flashcards for: ${currentTitle}`;
            renderStagedFlashcards();
            if (stagedFlashcardEditorModal) stagedFlashcardEditorModal.show();
            if (topicEditorModalEl) topicEditorModalEl.removeEventListener('hidden.bs.modal', onModalHidden);
        };
        if (topicEditorModalEl) topicEditorModalEl.addEventListener('hidden.bs.modal', onModalHidden);
        if (topicEditorModal) topicEditorModal.hide();
    }

    function openStagedQuizEditor(topicIndex) {
        contentEditorReturnContext = 'subjectModal'; // NEW
        isEditingStagedContent = true; // Set flag for staged editing
        currentStagedTopicIndex = topicIndex;
        const topic = stagedTopics[topicIndex];
        if (!topic || !stagedQuizEditorModal) return;

        isTransitioningToSubmodal = true;
        const onModalHidden = () => {
            isTransitioningToSubmodal = false;
            document.getElementById('stagedQuizEditorModalLabel').textContent = `Edit Quiz for: ${topic.title}`;
            renderStagedQuizQuestions();
            if (stagedQuizEditorModal) stagedQuizEditorModal.show();
            subjectModalEl.removeEventListener('hidden.bs.modal', onModalHidden);
        };

        if (subjectModalEl) subjectModalEl.addEventListener('hidden.bs.modal', onModalHidden);
        if (subjectModal) subjectModal.hide();
    }

    function renderStagedQuizQuestions() {
        const container = document.getElementById('stagedQuizQuestionsContainer');
        const badge = document.getElementById('stagedQuizBadge');
        const topic = isEditingStagedContent ? stagedTopics[currentStagedTopicIndex] : inlineTopicContent;
        // Add a guard clause to prevent errors if the index is not set
        if (!topic) {
            if (container) container.innerHTML = '<p class="text-center text-muted">Error: Topic context not found.</p>';
            if (badge) badge.textContent = '0 questions';
            return;
        }
        const questions = topic.quiz || [];
        if (badge) badge.textContent = `${questions.length} question${questions.length === 1 ? '' : 's'}`;
        container.innerHTML = '';

        if (questions.length === 0) {
            container.innerHTML = '<p class="text-center text-muted">No questions added yet.</p>';
            return;
        }

        const list = document.createElement('div');
        list.className = 'list-group';
        questions.forEach((q, index) => {
            const item = document.createElement('div');
            item.className = 'list-group-item d-flex justify-content-between align-items-center';
            // The data is now in the format {text, options:{A,B,C,D}, answer}
            const questionText = q.text || q.question;
            const ansKey = q.answer || 'A';
            const correctAnswerText = q.options ? (q.options[ansKey] || '') : '';

            item.innerHTML = `
                <div class="flex-grow-1 me-3">
                    <p class="mb-1 fw-medium">${index + 1}. ${escapeHtml(questionText) || '(No question text)'}</p>
                    <small class="text-success">Correct: Option ${ansKey} - ${escapeHtml(correctAnswerText) || '(No answer text)'}</small>
                </div>
                <div>
                    <button type="button" class="btn btn-sm btn-outline-primary edit-staged-question-btn" data-index="${index}"><i class="bi bi-pencil"></i></button>
                    <button type="button" class="btn btn-sm btn-outline-danger delete-staged-question-btn" data-index="${index}"><i class="bi bi-trash"></i></button>
                </div>
            `;
            list.appendChild(item);
        });
        container.appendChild(list);
    }

    function handleStagedQuizFormSubmit(event) {
        event.preventDefault();
        const form = document.getElementById('stagedQuizQuestionForm');
        const questionId = document.getElementById('stagedQuizQuestionId').value;

        const correctAnwerValue = document.getElementById('stagedQuizCorrectAnswer').value; // "1", "2", "3", or "4"
        const answerMap = { "1": "A", "2": "B", "3": "C", "4": "D" };

        const questionData = {
            text: document.getElementById('stagedQuizQuestionText').value.trim(),
            options: {
                A: document.getElementById('stagedQuizOption1').value.trim(),
                B: document.getElementById('stagedQuizOption2').value.trim(),
                C: document.getElementById('stagedQuizOption3').value.trim(),
                D: document.getElementById('stagedQuizOption4').value.trim(),
            },
            answer: answerMap[correctAnwerValue] || 'A'
        };

        const topic = isEditingStagedContent ? stagedTopics[currentStagedTopicIndex] : inlineTopicContent;
        if (!topic.quiz) topic.quiz = [];
        if (questionId !== '') { // Editing
            topic.quiz[questionId] = questionData;
        } else { // Adding
            topic.quiz.push(questionData);
        }

        renderStagedQuizQuestions();
        form.reset();
        document.getElementById('stagedQuizQuestionId').value = '';
        document.getElementById('stagedQuizQuestionFormLabel').textContent = 'Add New Question';
        document.getElementById('cancelQuizQuestionEditBtn').classList.add('d-none');
    }

    function openStagedFlashcardEditor(topicIndex) {
        contentEditorReturnContext = 'subjectModal'; // NEW
        isEditingStagedContent = true; // Set flag for staged editing
        currentStagedTopicIndex = topicIndex;
        const topic = stagedTopics[topicIndex];
        if (!topic || !stagedFlashcardEditorModal) return;

        isTransitioningToSubmodal = true;
        const onModalHidden = () => {
            isTransitioningToSubmodal = false;
            document.getElementById('stagedFlashcardEditorModalLabel').textContent = `Edit Flashcards for: ${topic.title}`;
            renderStagedFlashcards();
            if (stagedFlashcardEditorModal) stagedFlashcardEditorModal.show();
            subjectModalEl.removeEventListener('hidden.bs.modal', onModalHidden);
        };

        if (subjectModalEl) subjectModalEl.addEventListener('hidden.bs.modal', onModalHidden);
        if (subjectModal) subjectModal.hide();
    }

    function renderStagedFlashcards() {
        const container = document.getElementById('stagedFlashcardsContainer');
        const badge = document.getElementById('stagedDeckBadge');
        const topic = isEditingStagedContent ? stagedTopics[currentStagedTopicIndex] : inlineTopicContent;
        // Add a guard clause to prevent errors if the index is not set
        if (!topic) {
            if (container) container.innerHTML = '<p class="text-center text-muted">Error: Topic context not found.</p>';
            if (badge) badge.textContent = '0 cards';
            return;
        }
        const cards = topic.flashcards || [];
        if (badge) badge.textContent = `${cards.length} card${cards.length === 1 ? '' : 's'}`;
        container.innerHTML = '';

        if (cards.length === 0) {
            container.innerHTML = '<p class="text-center text-muted">No cards added yet.</p>';
            return;
        }

        const list = document.createElement('div');
        list.className = 'list-group';
        cards.forEach((card, index) => {
            const item = document.createElement('div');
            item.className = 'list-group-item d-flex justify-content-between align-items-center';
            item.innerHTML = `
                <div class="flex-grow-1 me-3">
                    <p class="mb-1 fw-medium">${escapeHtml(card.term)}</p>
                    <small class="text-muted">${escapeHtml(card.definition)}</small>
                </div>
                <div>
                    <button type="button" class="btn btn-sm btn-outline-primary edit-staged-card-btn" data-index="${index}"><i class="bi bi-pencil"></i></button>
                    <button type="button" class="btn btn-sm btn-outline-danger delete-staged-card-btn" data-index="${index}"><i class="bi bi-trash"></i></button>
                </div>
            `;
            list.appendChild(item);
        });
        container.appendChild(list);
    }

    function handleStagedFlashcardFormSubmit(event) {
        event.preventDefault();
        const form = document.getElementById('stagedFlashcardForm');
        const cardId = document.getElementById('stagedFlashcardId').value;

        const cardData = {
            term: document.getElementById('stagedFlashcardTerm').value.trim(),
            definition: document.getElementById('stagedFlashcardDefinition').value.trim(),
        };

        const topic = isEditingStagedContent ? stagedTopics[currentStagedTopicIndex] : inlineTopicContent;
        if (!topic.flashcards) topic.flashcards = [];
        if (cardId !== '') { // Editing
            topic.flashcards[cardId] = cardData;
        } else { // Adding
            topic.flashcards.push(cardData);
        }

        renderStagedFlashcards();
        form.reset();
        document.getElementById('stagedFlashcardId').value = '';
        document.getElementById('stagedFlashcardFormLabel').textContent = 'Add New Card';
        document.getElementById('cancelFlashcardEditBtn').classList.add('d-none');
    }

    function resetQuizEditorForm() {
        const form = document.getElementById('stagedQuizQuestionForm');
        if (!form) return;
        form.reset();
        document.getElementById('stagedQuizQuestionId').value = '';
        document.getElementById('stagedQuizQuestionFormLabel').textContent = 'Add New Question';
        document.getElementById('cancelQuizQuestionEditBtn').classList.add('d-none');
    }

    function resetFlashcardEditorForm() {
        const form = document.getElementById('stagedFlashcardForm');
        if (!form) return;
        form.reset();
        document.getElementById('stagedFlashcardId').value = '';
        document.getElementById('stagedFlashcardFormLabel').textContent = 'Add New Card';
        document.getElementById('cancelFlashcardEditBtn').classList.add('d-none');
    }

    // --- Modal Interaction Handlers ---
    function handleStagedQuizEditorDone() {
        currentStagedTopicIndex = null; // Clear context immediately

        isTransitioningToSubmodal = true;
        const onQuizModalHidden = () => {
            isTransitioningToSubmodal = false;
            if (contentEditorReturnContext === 'subjectModal') {
                if (subjectModal) subjectModal.show();
            } else {
                if (topicEditorModal) topicEditorModal.show();
            }
            // Clean up the one-time event listener
            if (stagedQuizEditorModalEl) stagedQuizEditorModalEl.removeEventListener('hidden.bs.modal', onQuizModalHidden);
        };

        if (stagedQuizEditorModalEl) stagedQuizEditorModalEl.addEventListener('hidden.bs.modal', onQuizModalHidden);
        if (stagedQuizEditorModal) stagedQuizEditorModal.hide();
    }

    function handleStagedFlashcardEditorDone() {
        currentStagedTopicIndex = null; // Clear context immediately

        isTransitioningToSubmodal = true;
        const onFlashcardModalHidden = () => {
            isTransitioningToSubmodal = false;
            if (contentEditorReturnContext === 'subjectModal') {
                if (subjectModal) subjectModal.show();
            } else {
                if (topicEditorModal) topicEditorModal.show();
            }
            // Clean up the one-time event listener
            if (stagedFlashcardEditorModalEl) stagedFlashcardEditorModalEl.removeEventListener('hidden.bs.modal', onFlashcardModalHidden);
        };

        if (stagedFlashcardEditorModalEl) stagedFlashcardEditorModalEl.addEventListener('hidden.bs.modal', onFlashcardModalHidden);
        if (stagedFlashcardEditorModal) stagedFlashcardEditorModal.hide();
    }

    function openExistingQuizEditor(topicIndex) {
        currentTopicIndexForEditing = topicIndex;
        const subject = editingSubjectCopy; // Work on the temporary copy
        const topic = subject?.topics[topicIndex];

        if (!topic || !existingQuizEditorModal) return;

        // Ensure topic.quiz is an array and normalize question structure
        if (!topic.quiz) topic.quiz = [];
        topic.quiz = topic.quiz.map(q => {
            let opts = q.options;
            if (Array.isArray(opts)) {
                opts = {
                    A: opts[0] || '',
                    B: opts[1] || '',
                    C: opts[2] || '',
                    D: opts[3] || ''
                };
            } else if (!opts || typeof opts !== 'object') {
                opts = { A: '', B: '', C: '', D: '' };
            }
            let ans = q.answer;
            if (ans && !['A', 'B', 'C', 'D'].includes(ans) && typeof ans === 'string') {
                const foundKey = Object.keys(opts).find(k => (opts[k] || '').trim().toLowerCase() === ans.trim().toLowerCase());
                if (foundKey) ans = foundKey;
            }
            return {
                text: q.text || q.question || '',
                options: {
                    A: opts.A || '',
                    B: opts.B || '',
                    C: opts.C || '',
                    D: opts.D || ''
                },
                answer: (ans && ['A', 'B', 'C', 'D'].includes(ans)) ? ans : 'A'
            };
        });

        isTransitioningToSubmodal = true;
        const onModalHidden = () => {
            isTransitioningToSubmodal = false;
            document.getElementById('existingQuizEditorModalLabel').textContent = `Edit Quiz for: ${topic.title}`;
            renderExistingQuizQuestions();
            if (existingQuizEditorModal) existingQuizEditorModal.show();
            if (subjectModalEl) subjectModalEl.removeEventListener('hidden.bs.modal', onModalHidden);
        };

        if (subjectModalEl) subjectModalEl.addEventListener('hidden.bs.modal', onModalHidden);
        if (subjectModal) subjectModal.hide();
    }

    function renderExistingQuizQuestions() {
        const container = document.getElementById('existingQuizQuestionsContainer');
        const badge = document.getElementById('existingQuizBadge');
        const subject = editingSubjectCopy; // Work on the temporary copy
        const questions = subject?.topics[currentTopicIndexForEditing]?.quiz || [];
        if (badge) badge.textContent = `${questions.length} question${questions.length === 1 ? '' : 's'}`;
        container.innerHTML = '';

        if (questions.length === 0) {
            container.innerHTML = '<p class="text-center text-muted">No questions added yet.</p>';
            return;
        }

        const list = document.createElement('div');
        list.className = 'list-group';
        questions.forEach((q, index) => {
            const item = document.createElement('div');
            item.className = 'list-group-item d-flex justify-content-between align-items-center';
            const opts = q.options || {};
            const ansKey = q.answer || 'A';
            const correctAnswerText = opts[ansKey] || (Array.isArray(opts) ? opts[0] : '') || '';
            item.innerHTML = `
                <div class="flex-grow-1 me-3">
                    <p class="mb-1 fw-medium">${index + 1}. ${escapeHtml(q.text || q.question) || '(No question text)'}</p>
                    <small class="text-success">Correct: Option ${ansKey} - ${escapeHtml(correctAnswerText)}</small>
                </div>
                <div>
                    <button type="button" class="btn btn-sm btn-outline-primary edit-existing-question-btn me-1" data-index="${index}" title="Edit Question"><i class="bi bi-pencil"></i></button>
                    <button type="button" class="btn btn-sm btn-outline-danger delete-existing-question-btn" data-index="${index}" title="Delete Question"><i class="bi bi-trash"></i></button>
                </div>
            `;
            list.appendChild(item);
        });
        container.appendChild(list);
    }

    function handleExistingQuizFormSubmit(event) {
        event.preventDefault();
        const form = document.getElementById('existingQuizQuestionForm');
        const questionId = document.getElementById('existingQuizQuestionId').value;
        const subject = editingSubjectCopy; // Work on the temporary copy
        const topic = subject?.topics[currentTopicIndexForEditing];
        if (!topic) return;

        const questionData = {
            text: document.getElementById('existingQuizQuestionText').value.trim(),
            options: {
                A: document.getElementById('existingQuizOption1').value.trim(),
                B: document.getElementById('existingQuizOption2').value.trim(),
                C: document.getElementById('existingQuizOption3').value.trim(),
                D: document.getElementById('existingQuizOption4').value.trim(),
            },
            answer: document.getElementById('existingQuizCorrectAnswer').value
        };

        if (questionId !== '') { // Editing
            const idx = parseInt(questionId, 10);
            topic.quiz[idx] = questionData;
        } else { // Adding
            if (!topic.quiz) topic.quiz = [];
            topic.quiz.push(questionData);
        }

        renderExistingQuizQuestions();
        resetExistingQuizForm();
    }

    function resetExistingQuizForm() {
        const form = document.getElementById('existingQuizQuestionForm');
        if (!form) return;
        form.reset();
        document.getElementById('existingQuizQuestionId').value = '';
        document.getElementById('existingQuizQuestionFormLabel').textContent = 'Add New Question';
        const cancelBtn = document.getElementById('cancelExistingQuizEditBtn');
        if (cancelBtn) cancelBtn.classList.add('d-none');
    }

    function handleExistingQuizContainerClick(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        const target = event.target.closest('button');
        if (!target) return;

        const subject = editingSubjectCopy;
        const topic = subject?.topics[currentTopicIndexForEditing];
        if (!topic || !topic.quiz) return;

        const index = parseInt(target.dataset.index, 10);

        if (target.classList.contains('delete-existing-question-btn')) {
            if (confirm('Are you sure you want to delete this question?')) {
                topic.quiz.splice(index, 1);
                renderExistingQuizQuestions();
                resetExistingQuizForm();
            }
        } else if (target.classList.contains('edit-existing-question-btn')) {
            const q = topic.quiz[index];
            if (!q) return;
            let opts = q.options;
            if (Array.isArray(opts)) {
                opts = { A: opts[0] || '', B: opts[1] || '', C: opts[2] || '', D: opts[3] || '' };
            } else if (!opts || typeof opts !== 'object') {
                opts = { A: '', B: '', C: '', D: '' };
            }
            let ans = q.answer;
            if (ans && !['A', 'B', 'C', 'D'].includes(ans) && typeof ans === 'string') {
                const foundKey = Object.keys(opts).find(k => (opts[k] || '').trim().toLowerCase() === ans.trim().toLowerCase());
                if (foundKey) ans = foundKey;
            }
            document.getElementById('existingQuizQuestionId').value = index;
            document.getElementById('existingQuizQuestionText').value = q.text || q.question || '';
            document.getElementById('existingQuizOption1').value = opts?.A || '';
            document.getElementById('existingQuizOption2').value = opts?.B || '';
            document.getElementById('existingQuizOption3').value = opts?.C || '';
            document.getElementById('existingQuizOption4').value = opts?.D || '';
            document.getElementById('existingQuizCorrectAnswer').value = (ans && ['A', 'B', 'C', 'D'].includes(ans)) ? ans : 'A';
            document.getElementById('existingQuizQuestionFormLabel').textContent = `Edit Question #${index + 1}`;
            const cancelBtn = document.getElementById('cancelExistingQuizEditBtn');
            if (cancelBtn) cancelBtn.classList.remove('d-none');
        }
    }

    // --- Existing Flashcard Editor ---

    function openExistingFlashcardEditor(topicIndex) {
        currentTopicIndexForEditing = topicIndex;
        const subject = editingSubjectCopy; // Work on the temporary copy
        const topic = subject?.topics[topicIndex];

        if (!topic || !existingFlashcardEditorModal) return;

        if (!topic.flashcards) topic.flashcards = [];

        isTransitioningToSubmodal = true;
        const onModalHidden = () => {
            isTransitioningToSubmodal = false;
            document.getElementById('existingFlashcardEditorModalLabel').textContent = `Edit Flashcards for: ${topic.title}`;
            renderExistingFlashcards();
            if (existingFlashcardEditorModal) existingFlashcardEditorModal.show();
            if (subjectModalEl) subjectModalEl.removeEventListener('hidden.bs.modal', onModalHidden);
        };

        if (subjectModalEl) subjectModalEl.addEventListener('hidden.bs.modal', onModalHidden);
        if (subjectModal) subjectModal.hide();
    }

    function renderExistingFlashcards() {
        const container = document.getElementById('existingFlashcardsContainer');
        const badge = document.getElementById('existingDeckBadge');
        const subject = editingSubjectCopy; // Work on the temporary copy
        const cards = subject?.topics[currentTopicIndexForEditing]?.flashcards || [];
        if (badge) badge.textContent = `${cards.length} card${cards.length === 1 ? '' : 's'}`;
        container.innerHTML = '';

        if (cards.length === 0) {
            container.innerHTML = '<p class="text-center text-muted">No flashcards added yet.</p>';
            return;
        }

        const list = document.createElement('div');
        list.className = 'list-group';
        cards.forEach((card, index) => {
            const item = document.createElement('div');
            item.className = 'list-group-item d-flex justify-content-between align-items-center';
            item.innerHTML = `
                <div class="flex-grow-1 me-3">
                    <p class="mb-1 fw-medium">${escapeHtml(card.term)}</p>
                    <small class="text-muted">${escapeHtml(card.definition)}</small>
                </div>
                <div>
                    <button type="button" class="btn btn-sm btn-outline-primary edit-existing-card-btn" data-index="${index}"><i class="bi bi-pencil"></i></button>
                    <button type="button" class="btn btn-sm btn-outline-danger delete-existing-card-btn" data-index="${index}"><i class="bi bi-trash"></i></button>
                </div>
            `;
            list.appendChild(item);
        });
        container.appendChild(list);
    }

    function handleExistingFlashcardFormSubmit(event) {
        event.preventDefault();
        const form = document.getElementById('existingFlashcardForm');
        const cardId = document.getElementById('existingFlashcardId').value;
        const subject = editingSubjectCopy; // Work on the temporary copy
        const topic = subject?.topics[currentTopicIndexForEditing];
        if (!topic) return;

        const cardData = {
            term: document.getElementById('existingFlashcardTerm').value.trim(),
            definition: document.getElementById('existingFlashcardDefinition').value.trim(),
        };

        if (cardId !== '') { // Editing
            topic.flashcards[cardId] = cardData;
        } else { // Adding
            if (!topic.flashcards) topic.flashcards = [];
            topic.flashcards.push(cardData);
        }

        renderExistingFlashcards();
        form.reset();
        document.getElementById('existingFlashcardId').value = '';
        document.getElementById('existingFlashcardFormLabel').textContent = 'Add New Card';
        document.getElementById('cancelExistingFlashcardEditBtn').classList.add('d-none');
    }

    function handleExistingFlashcardContainerClick(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        const target = event.target.closest('button');
        if (!target) return;

        const subject = editingSubjectCopy; // Work on the temporary copy
        const topic = subject?.topics[currentTopicIndexForEditing];
        if (!topic) return;

        const index = target.dataset.index;

        if (target.classList.contains('edit-existing-card-btn')) {
            // Populate form for editing
            const card = topic.flashcards[index];
            document.getElementById('existingFlashcardId').value = index;
            document.getElementById('existingFlashcardTerm').value = card.term;
            document.getElementById('existingFlashcardDefinition').value = card.definition;
            document.getElementById('existingFlashcardFormLabel').textContent = 'Edit Card';
            document.getElementById('cancelExistingFlashcardEditBtn').classList.remove('d-none');
        } else if (target.classList.contains('delete-existing-card-btn')) {
            if (confirm('Are you sure you want to delete this flashcard?')) {
                topic.flashcards.splice(index, 1);
                renderExistingFlashcards();
            }
        }
    }

    // =========================================================================
    // BULK CREATION & SPREADSHEET PARSING UTILITIES
    // =========================================================================
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function parseBulkFlashcards(rawText, delimiterMode = 'auto') {
        if (!rawText || !rawText.trim()) return [];
        const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        const cards = [];

        lines.forEach(line => {
            let term = '';
            let definition = '';

            if (delimiterMode === 'tab' || (delimiterMode === 'auto' && line.includes('\t'))) {
                const parts = line.split('\t');
                term = (parts[0] || '').trim();
                definition = parts.slice(1).join('\t').trim();
            } else if (delimiterMode === 'dash' || (delimiterMode === 'auto' && line.includes(' - '))) {
                const parts = line.split(' - ');
                term = (parts[0] || '').trim();
                definition = parts.slice(1).join(' - ').trim();
            } else if (delimiterMode === 'pipe' || (delimiterMode === 'auto' && line.includes('|'))) {
                const parts = line.split('|');
                term = (parts[0] || '').trim();
                definition = parts.slice(1).join('|').trim();
            } else if (delimiterMode === 'colon' || (delimiterMode === 'auto' && line.includes(':'))) {
                const idx = line.indexOf(':');
                term = line.substring(0, idx).trim();
                definition = line.substring(idx + 1).trim();
            } else if (line.includes('-')) {
                const idx = line.indexOf('-');
                term = line.substring(0, idx).trim();
                definition = line.substring(idx + 1).trim();
            } else {
                term = line.trim();
                definition = '';
            }

            if (term || definition) {
                cards.push({
                    term: term || 'Untitled Term',
                    definition: definition || 'No definition provided.'
                });
            }
        });

        return cards;
    }

    function parseBulkQuiz(rawText) {
        if (!rawText || !rawText.trim()) return [];
        const questions = [];

        // Check if input is tabular
        const lines = rawText.split(/\r?\n/).filter(l => l.trim().length > 0);
        const tabLines = lines.filter(l => l.includes('\t') || (l.split('|').length >= 5));

        if (tabLines.length > 0 && tabLines.length >= lines.length * 0.5) {
            lines.forEach(line => {
                const delimiter = line.includes('\t') ? '\t' : '|';
                const parts = line.split(delimiter).map(p => p.trim());
                if (parts.length >= 3) {
                    const text = parts[0].replace(/^\d+[\.\)]\s*/, '').trim();
                    const optA = parts[1] || '';
                    const optB = parts[2] || '';
                    const optC = parts[3] || '';
                    const optD = parts[4] || '';
                    let ans = (parts[5] || parts[parts.length - 1] || 'A').toUpperCase().replace(/[^A-D]/g, '');
                    if (!['A', 'B', 'C', 'D'].includes(ans)) ans = 'A';

                    if (text) {
                        questions.push({
                            text,
                            options: { A: optA, B: optB, C: optC, D: optD },
                            answer: ans
                        });
                    }
                }
            });
            return questions;
        }

        // Block-based format:
        // 1. Question text
        // A. Option A
        // B. Option B
        // C. Option C
        // D. Option D
        // Answer: B
        const blockRegex = /(?:^|\n\s*\n|\n(?=(?:\d+[\.\)]|Question\s*\d+[:\.])))/i;
        const rawBlocks = rawText.split(blockRegex).map(b => b.trim()).filter(b => b.length > 0);

        rawBlocks.forEach(block => {
            const blockLines = block.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            if (blockLines.length === 0) return;

            let questionLines = [];
            let optA = '', optB = '', optC = '', optD = '';
            let answer = 'A';
            let collectingQuestion = true;

            blockLines.forEach(line => {
                const optMatch = line.match(/^([A-Da-d])[\.\)\:\-]\s*(.*)$/);
                const ansMatch = line.match(/^(?:Answer|Correct|Key|Ans)[\s:=-]+([A-Da-d])/i);

                if (ansMatch) {
                    answer = ansMatch[1].toUpperCase();
                    collectingQuestion = false;
                } else if (optMatch) {
                    collectingQuestion = false;
                    const letter = optMatch[1].toUpperCase();
                    const val = optMatch[2].trim();
                    if (letter === 'A') optA = val;
                    else if (letter === 'B') optB = val;
                    else if (letter === 'C') optC = val;
                    else if (letter === 'D') optD = val;
                } else if (collectingQuestion) {
                    questionLines.push(line);
                }
            });

            let fullQuestion = questionLines.join(' ').replace(/^\d+[\.\)]\s*/, '').trim();
            if (fullQuestion && (optA || optB)) {
                questions.push({
                    text: fullQuestion,
                    options: { A: optA, B: optB, C: optC, D: optD },
                    answer: ['A', 'B', 'C', 'D'].includes(answer) ? answer : 'A'
                });
            }
        });

        return questions;
    }

    function readSpreadsheetRows(file) {
        return new Promise((resolve, reject) => {
            if (!file) return reject(new Error('No file selected.'));
            if (typeof XLSX === 'undefined') {
                return reject(new Error('Spreadsheet parser (SheetJS) is not loaded.'));
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
                    resolve(rows);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = (err) => reject(err);
            reader.readAsArrayBuffer(file);
        });
    }

    function parseFlashcardsFromSheetRows(rows) {
        if (!rows || rows.length === 0) return [];
        let startIndex = 0;
        const firstRow = rows[0].map(c => String(c).toLowerCase().trim());
        if (firstRow.some(cell => cell.includes('term') || cell.includes('word') || cell.includes('concept') || cell.includes('front'))) {
            startIndex = 1;
        }

        const cards = [];
        for (let i = startIndex; i < rows.length; i++) {
            const row = rows[i];
            const term = String(row[0] || '').trim();
            const def = String(row[1] || '').trim();
            if (term || def) {
                cards.push({
                    term: term || 'Untitled Term',
                    definition: def || 'No definition provided.'
                });
            }
        }
        return cards;
    }

    function parseQuizFromSheetRows(rows) {
        if (!rows || rows.length === 0) return [];
        let startIndex = 0;
        const firstRow = rows[0].map(c => String(c).toLowerCase().trim());
        if (firstRow.some(cell => cell.includes('question') || cell.includes('prompt'))) {
            startIndex = 1;
        }

        const questions = [];
        for (let i = startIndex; i < rows.length; i++) {
            const row = rows[i];
            const text = String(row[0] || '').trim();
            const optA = String(row[1] || '').trim();
            const optB = String(row[2] || '').trim();
            const optC = String(row[3] || '').trim();
            const optD = String(row[4] || '').trim();
            let ans = String(row[5] || 'A').toUpperCase().replace(/[^A-D]/g, '');
            if (!['A', 'B', 'C', 'D'].includes(ans)) ans = 'A';

            if (text && (optA || optB)) {
                questions.push({
                    text,
                    options: { A: optA, B: optB, C: optC, D: optD },
                    answer: ans
                });
            }
        }
        return questions;
    }

    function generateClientSideTemplate(type, defaultFilename) {
        if (typeof XLSX === 'undefined') {
            alert('Spreadsheet generator is not ready. Please check your internet connection.');
            return;
        }

        const wb = XLSX.utils.book_new();

        if (type === 'flashcards') {
            const fcData = [
                {
                    "Term": "Photosynthesis",
                    "Definition": "The biological process by which green plants transform light energy into chemical energy.",
                    "Category / Tag (Optional)": "Biology"
                },
                {
                    "Term": "Mitochondria",
                    "Definition": "Membrane-bound cell organelles that generate most of the chemical energy needed to power the cell (ATP).",
                    "Category / Tag (Optional)": "Cell Biology"
                },
                {
                    "Term": "Newton's First Law",
                    "Definition": "An object at rest stays at rest, and an object in motion continues in motion with the same speed and direction unless acted upon by an external force.",
                    "Category / Tag (Optional)": "Physics"
                },
                {
                    "Term": "Osmosis",
                    "Definition": "The spontaneous net movement of solvent molecules through a selectively permeable membrane into a region of higher solute concentration.",
                    "Category / Tag (Optional)": "Chemistry"
                }
            ];
            const ws = XLSX.utils.json_to_sheet(fcData);
            ws['!cols'] = [{ wch: 25 }, { wch: 60 }, { wch: 25 }];
            XLSX.utils.book_append_sheet(wb, ws, 'Flashcards');
        } else {
            const quizData = [
                {
                    "Question": "What is the SI unit of force?",
                    "Option A": "Joule",
                    "Option B": "Newton",
                    "Option C": "Watt",
                    "Option D": "Pascal",
                    "Correct Answer (A/B/C/D)": "B",
                    "Explanation / Note (Optional)": "Newton (N) is defined as 1 kg·m/s²"
                },
                {
                    "Question": "What is the acceleration due to gravity on Earth?",
                    "Option A": "9.8 m/s²",
                    "Option B": "8.9 m/s²",
                    "Option C": "10.5 m/s²",
                    "Option D": "12.0 m/s²",
                    "Correct Answer (A/B/C/D)": "A",
                    "Explanation / Note (Optional)": "Standard Earth gravity is approx 9.80665 m/s²"
                },
                {
                    "Question": "Which law states that for every action there is an equal and opposite reaction?",
                    "Option A": "Newton's 1st Law",
                    "Option B": "Newton's 2nd Law",
                    "Option C": "Newton's 3rd Law",
                    "Option D": "Law of Conservation of Energy",
                    "Correct Answer (A/B/C/D)": "C",
                    "Explanation / Note (Optional)": "Third Law of Motion"
                },
                {
                    "Question": "Which organelle is considered the powerhouse of the cell?",
                    "Option A": "Nucleus",
                    "Option B": "Mitochondria",
                    "Option C": "Ribosome",
                    "Option D": "Endoplasmic Reticulum",
                    "Correct Answer (A/B/C/D)": "B",
                    "Explanation / Note (Optional)": "Produces ATP through cellular respiration"
                }
            ];
            const ws = XLSX.utils.json_to_sheet(quizData);
            ws['!cols'] = [{ wch: 45 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 26 }, { wch: 35 }];
            XLSX.utils.book_append_sheet(wb, ws, 'Practice Quiz');
        }

        XLSX.writeFile(wb, defaultFilename);
    }

    async function downloadStarterTemplate(type) {
        const apiBase = (window.MENTORAE_CONFIG && window.MENTORAE_CONFIG.API_BASE_URL)
            ? window.MENTORAE_CONFIG.API_BASE_URL
            : (window.API_BASE || 'http://localhost:5000');
        const endpoint = `${apiBase}/api/content/templates/${type === 'flashcards' ? 'flashcards' : 'quiz'}`;
        const defaultFilename = type === 'flashcards' ? 'Mentorae_Flashcards_Template.xlsx' : 'Mentorae_Practice_Quiz_Template.xlsx';

        try {
            const res = await fetch(endpoint);
            if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const downloadLink = document.createElement('a');
            downloadLink.href = blobUrl;
            downloadLink.download = defaultFilename;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            setTimeout(() => {
                downloadLink.remove();
                window.URL.revokeObjectURL(blobUrl);
            }, 1000);
        } catch (err) {
            console.warn('Backend download failed or unavailable, using in-browser template generator:', err);
            generateClientSideTemplate(type, defaultFilename);
        }
    }

    function setupDropZone(dropZone, fileInput, onFileSelected) {
        if (!dropZone || !fileInput) return;

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.add('border-primary', 'bg-white');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.remove('border-primary', 'bg-white');
            }, false);
        });

        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files.length > 0) {
                fileInput.files = files;
                onFileSelected(files[0]);
            }
        }, false);

        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                onFileSelected(e.target.files[0]);
            }
        });
    }

    // =========================================================================
    // MODAL BULK & FILE WIRING
    // =========================================================================
    let bulkStagedQuizParsedCache = [];
    let fileStagedQuizParsedCache = [];

    function updateBulkStagedQuizPreview() {
        const textarea = document.getElementById('bulkStagedQuizTextarea');
        const badge = document.getElementById('bulkStagedQuizCountBadge');
        const preview = document.getElementById('bulkStagedQuizPreviewContainer');
        const addBtn = document.getElementById('addBulkStagedQuizBtn');

        const raw = textarea ? textarea.value : '';
        bulkStagedQuizParsedCache = parseBulkQuiz(raw);

        if (badge) {
            badge.textContent = `${bulkStagedQuizParsedCache.length} question${bulkStagedQuizParsedCache.length === 1 ? '' : 's'} detected`;
            badge.className = bulkStagedQuizParsedCache.length > 0
                ? 'badge bg-success-subtle text-success border border-success-subtle rounded-pill'
                : 'badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill';
        }

        if (addBtn) {
            addBtn.disabled = bulkStagedQuizParsedCache.length === 0;
            addBtn.innerHTML = `<i class="bi bi-plus-circle me-1"></i> Add ${bulkStagedQuizParsedCache.length > 0 ? bulkStagedQuizParsedCache.length : 'All'} Questions to Quiz`;
        }

        if (preview) {
            if (bulkStagedQuizParsedCache.length === 0) {
                preview.innerHTML = '<span class="text-muted fst-italic">Paste or type questions above to see them parsed live...</span>';
            } else {
                preview.innerHTML = `<ol class="mb-0 ps-3">${bulkStagedQuizParsedCache.map(q => `
                    <li class="py-1">
                        <strong class="text-dark">${escapeHtml(q.text)}</strong>
                        <div class="micro-text text-muted mt-0.5">
                            <span class="me-2 ${q.answer === 'A' ? 'fw-bold text-success' : ''}">A: ${escapeHtml(q.options.A)}</span>
                            <span class="me-2 ${q.answer === 'B' ? 'fw-bold text-success' : ''}">B: ${escapeHtml(q.options.B)}</span>
                            ${q.options.C ? `<span class="me-2 ${q.answer === 'C' ? 'fw-bold text-success' : ''}">C: ${escapeHtml(q.options.C)}</span>` : ''}
                            ${q.options.D ? `<span class="me-2 ${q.answer === 'D' ? 'fw-bold text-success' : ''}">D: ${escapeHtml(q.options.D)}</span>` : ''}
                            <span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill ms-1">Ans: ${q.answer}</span>
                        </div>
                    </li>
                `).join('')}</ol>`;
            }
        }
    }

    function setupStagedQuizBulkAndFileHandlers() {
        const textarea = document.getElementById('bulkStagedQuizTextarea');
        const insertSampleBtn = document.getElementById('insertSampleStagedQuizBtn');
        const clearBulkBtn = document.getElementById('clearBulkStagedQuizBtn');
        const addBulkBtn = document.getElementById('addBulkStagedQuizBtn');
        const downloadTemplateBtn = document.getElementById('downloadStagedQuizTemplateBtn');
        const fileInput = document.getElementById('stagedQuizFileInput');
        const dropZone = document.getElementById('stagedQuizDropZone');
        const filePreviewSection = document.getElementById('stagedQuizFilePreviewSection');
        const fileTbody = document.getElementById('stagedQuizFilePreviewTbody');
        const fileCountBadge = document.getElementById('fileStagedQuizCountBadge');
        const clearFileBtn = document.getElementById('clearFileStagedQuizBtn');
        const importFileBtn = document.getElementById('importFileStagedQuizBtn');

        if (textarea) textarea.addEventListener('input', updateBulkStagedQuizPreview);

        if (insertSampleBtn) {
            insertSampleBtn.addEventListener('click', () => {
                if (textarea) {
                    textarea.value = `1. What is the SI unit of force?\nA. Joule\nB. Newton\nC. Watt\nD. Pascal\nAnswer: B\n\n2. What is the acceleration due to gravity on Earth?\nA. 9.8 m/s^2\nB. 8.9 m/s^2\nC. 10.5 m/s^2\nD. 12.0 m/s^2\nAnswer: A\n\n3. Which law states that for every action there is an equal and opposite reaction?\nA. Newton's 1st Law\nB. Newton's 2nd Law\nC. Newton's 3rd Law\nD. Law of Conservation of Energy\nAnswer: C`;
                    updateBulkStagedQuizPreview();
                }
            });
        }

        if (clearBulkBtn) {
            clearBulkBtn.addEventListener('click', () => {
                if (textarea) textarea.value = '';
                updateBulkStagedQuizPreview();
            });
        }

        if (addBulkBtn) {
            addBulkBtn.addEventListener('click', () => {
                if (bulkStagedQuizParsedCache.length === 0) return;
                const topic = isEditingStagedContent ? stagedTopics[currentStagedTopicIndex] : inlineTopicContent;
                if (!topic) return;
                if (!topic.quiz) topic.quiz = [];
                topic.quiz.push(...bulkStagedQuizParsedCache);
                renderStagedQuizQuestions();
                const count = bulkStagedQuizParsedCache.length;
                if (textarea) textarea.value = '';
                updateBulkStagedQuizPreview();

                const manualTab = document.getElementById('staged-quiz-manual-tab');
                if (manualTab) bootstrap.Tab.getOrCreateInstance(manualTab).show();
                alert(`Added ${count} question(s) to quiz.`);
            });
        }

        if (downloadTemplateBtn) {
            downloadTemplateBtn.addEventListener('click', () => downloadStarterTemplate('quiz'));
        }

        const onFileSelected = async (file) => {
            if (!file) return;
            try {
                const rows = await readSpreadsheetRows(file);
                fileStagedQuizParsedCache = parseQuizFromSheetRows(rows);

                if (fileCountBadge) fileCountBadge.textContent = `${fileStagedQuizParsedCache.length} questions loaded`;
                if (fileTbody) {
                    fileTbody.innerHTML = fileStagedQuizParsedCache.slice(0, 50).map((q, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td class="text-truncate" style="max-width: 160px;">${escapeHtml(q.text)}</td>
                            <td class="text-truncate" style="max-width: 90px;">${escapeHtml(q.options.A)}</td>
                            <td class="text-truncate" style="max-width: 90px;">${escapeHtml(q.options.B)}</td>
                            <td class="text-truncate" style="max-width: 90px;">${escapeHtml(q.options.C)}</td>
                            <td class="text-truncate" style="max-width: 90px;">${escapeHtml(q.options.D)}</td>
                            <td><span class="badge bg-success-subtle text-success">${escapeHtml(q.answer)}</span></td>
                        </tr>
                    `).join('');
                }
                if (filePreviewSection) filePreviewSection.classList.remove('d-none');
                if (importFileBtn) {
                    importFileBtn.disabled = fileStagedQuizParsedCache.length === 0;
                    importFileBtn.innerHTML = `<i class="bi bi-file-earmark-arrow-down me-1"></i> Import ${fileStagedQuizParsedCache.length} Questions to Quiz`;
                }
            } catch (err) {
                console.error('Error parsing quiz file:', err);
                alert('Could not read the spreadsheet file. Please ensure it is a valid .xlsx or .csv file.');
            }
        };

        setupDropZone(dropZone, fileInput, onFileSelected);

        if (clearFileBtn) {
            clearFileBtn.addEventListener('click', () => {
                if (fileInput) fileInput.value = '';
                fileStagedQuizParsedCache = [];
                if (filePreviewSection) filePreviewSection.classList.add('d-none');
                if (importFileBtn) {
                    importFileBtn.disabled = true;
                    importFileBtn.innerHTML = '<i class="bi bi-file-earmark-arrow-down me-1"></i> Import Questions to Quiz';
                }
            });
        }

        if (importFileBtn) {
            importFileBtn.addEventListener('click', () => {
                if (fileStagedQuizParsedCache.length === 0) return;
                const topic = isEditingStagedContent ? stagedTopics[currentStagedTopicIndex] : inlineTopicContent;
                if (!topic) return;
                if (!topic.quiz) topic.quiz = [];
                topic.quiz.push(...fileStagedQuizParsedCache);
                renderStagedQuizQuestions();
                const count = fileStagedQuizParsedCache.length;
                if (clearFileBtn) clearFileBtn.click();
                const manualTab = document.getElementById('staged-quiz-manual-tab');
                if (manualTab) bootstrap.Tab.getOrCreateInstance(manualTab).show();
                alert(`Successfully imported ${count} question(s) from spreadsheet.`);
            });
        }
    }

    let bulkStagedFcParsedCache = [];
    let fileStagedFcParsedCache = [];

    function updateBulkStagedFcPreview() {
        const textarea = document.getElementById('bulkStagedFcTextarea');
        const delimSelect = document.getElementById('bulkStagedFcDelimiter');
        const badge = document.getElementById('bulkStagedFcCountBadge');
        const preview = document.getElementById('bulkStagedFcPreviewContainer');
        const addBtn = document.getElementById('addBulkStagedFcBtn');

        const raw = textarea ? textarea.value : '';
        const delim = delimSelect ? delimSelect.value : 'auto';
        bulkStagedFcParsedCache = parseBulkFlashcards(raw, delim);

        if (badge) {
            badge.textContent = `${bulkStagedFcParsedCache.length} card${bulkStagedFcParsedCache.length === 1 ? '' : 's'} detected`;
            badge.className = bulkStagedFcParsedCache.length > 0
                ? 'badge bg-success-subtle text-success border border-success-subtle rounded-pill'
                : 'badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill';
        }

        if (addBtn) {
            addBtn.disabled = bulkStagedFcParsedCache.length === 0;
            addBtn.innerHTML = `<i class="bi bi-plus-circle me-1"></i> Add ${bulkStagedFcParsedCache.length > 0 ? bulkStagedFcParsedCache.length : 'All'} Cards to Deck`;
        }

        if (preview) {
            if (bulkStagedFcParsedCache.length === 0) {
                preview.innerHTML = '<span class="text-muted fst-italic">Paste or type above to see cards here...</span>';
            } else {
                preview.innerHTML = `<ol class="mb-0 ps-3">${bulkStagedFcParsedCache.map(c => `
                    <li class="py-0.5">
                        <strong class="text-dark">${escapeHtml(c.term)}</strong> &mdash; <span class="text-muted">${escapeHtml(c.definition)}</span>
                    </li>
                `).join('')}</ol>`;
            }
        }
    }

    function setupStagedFcBulkAndFileHandlers() {
        const textarea = document.getElementById('bulkStagedFcTextarea');
        const delimSelect = document.getElementById('bulkStagedFcDelimiter');
        const clearBulkBtn = document.getElementById('clearBulkStagedFcBtn');
        const addBulkBtn = document.getElementById('addBulkStagedFcBtn');
        const downloadTemplateBtn = document.getElementById('downloadStagedFcTemplateBtn');
        const fileInput = document.getElementById('stagedFcFileInput');
        const dropZone = document.getElementById('stagedFcDropZone');
        const filePreviewSection = document.getElementById('stagedFcFilePreviewSection');
        const fileTbody = document.getElementById('stagedFcFilePreviewTbody');
        const fileCountBadge = document.getElementById('fileStagedFcCountBadge');
        const clearFileBtn = document.getElementById('clearFileStagedFcBtn');
        const importFileBtn = document.getElementById('importFileStagedFcBtn');

        if (textarea) textarea.addEventListener('input', updateBulkStagedFcPreview);
        if (delimSelect) delimSelect.addEventListener('change', updateBulkStagedFcPreview);

        if (clearBulkBtn) {
            clearBulkBtn.addEventListener('click', () => {
                if (textarea) textarea.value = '';
                updateBulkStagedFcPreview();
            });
        }

        if (addBulkBtn) {
            addBulkBtn.addEventListener('click', () => {
                if (bulkStagedFcParsedCache.length === 0) return;
                const topic = isEditingStagedContent ? stagedTopics[currentStagedTopicIndex] : inlineTopicContent;
                if (!topic) return;
                if (!topic.flashcards) topic.flashcards = [];
                topic.flashcards.push(...bulkStagedFcParsedCache);
                renderStagedFlashcards();
                const count = bulkStagedFcParsedCache.length;
                if (textarea) textarea.value = '';
                updateBulkStagedFcPreview();

                const manualTab = document.getElementById('staged-fc-manual-tab');
                if (manualTab) bootstrap.Tab.getOrCreateInstance(manualTab).show();
                alert(`Added ${count} flashcard(s) to deck.`);
            });
        }

        if (downloadTemplateBtn) {
            downloadTemplateBtn.addEventListener('click', () => downloadStarterTemplate('flashcards'));
        }

        const onFileSelected = async (file) => {
            if (!file) return;
            try {
                const rows = await readSpreadsheetRows(file);
                fileStagedFcParsedCache = parseFlashcardsFromSheetRows(rows);

                if (fileCountBadge) fileCountBadge.textContent = `${fileStagedFcParsedCache.length} cards loaded`;
                if (fileTbody) {
                    fileTbody.innerHTML = fileStagedFcParsedCache.slice(0, 50).map((c, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td class="fw-semibold text-truncate" style="max-width: 150px;">${escapeHtml(c.term)}</td>
                            <td class="text-truncate" style="max-width: 300px;">${escapeHtml(c.definition)}</td>
                        </tr>
                    `).join('');
                }
                if (filePreviewSection) filePreviewSection.classList.remove('d-none');
                if (importFileBtn) {
                    importFileBtn.disabled = fileStagedFcParsedCache.length === 0;
                    importFileBtn.innerHTML = `<i class="bi bi-file-earmark-arrow-down me-1"></i> Import ${fileStagedFcParsedCache.length} Cards to Deck`;
                }
            } catch (err) {
                console.error('Error parsing flashcards file:', err);
                alert('Could not read the spreadsheet file. Please ensure it is a valid .xlsx or .csv file.');
            }
        };

        setupDropZone(dropZone, fileInput, onFileSelected);

        if (clearFileBtn) {
            clearFileBtn.addEventListener('click', () => {
                if (fileInput) fileInput.value = '';
                fileStagedFcParsedCache = [];
                if (filePreviewSection) filePreviewSection.classList.add('d-none');
                if (importFileBtn) {
                    importFileBtn.disabled = true;
                    importFileBtn.innerHTML = '<i class="bi bi-file-earmark-arrow-down me-1"></i> Import Cards to Deck';
                }
            });
        }

        if (importFileBtn) {
            importFileBtn.addEventListener('click', () => {
                if (fileStagedFcParsedCache.length === 0) return;
                const topic = isEditingStagedContent ? stagedTopics[currentStagedTopicIndex] : inlineTopicContent;
                if (!topic) return;
                if (!topic.flashcards) topic.flashcards = [];
                topic.flashcards.push(...fileStagedFcParsedCache);
                renderStagedFlashcards();
                const count = fileStagedFcParsedCache.length;
                if (clearFileBtn) clearFileBtn.click();
                const manualTab = document.getElementById('staged-fc-manual-tab');
                if (manualTab) bootstrap.Tab.getOrCreateInstance(manualTab).show();
                alert(`Successfully imported ${count} card(s) from spreadsheet.`);
            });
        }
    }

    let bulkExistingQuizParsedCache = [];
    let fileExistingQuizParsedCache = [];

    function updateBulkExistingQuizPreview() {
        const textarea = document.getElementById('bulkExistingQuizTextarea');
        const badge = document.getElementById('bulkExistingQuizCountBadge');
        const preview = document.getElementById('bulkExistingQuizPreviewContainer');
        const addBtn = document.getElementById('addBulkExistingQuizBtn');

        const raw = textarea ? textarea.value : '';
        bulkExistingQuizParsedCache = parseBulkQuiz(raw);

        if (badge) {
            badge.textContent = `${bulkExistingQuizParsedCache.length} question${bulkExistingQuizParsedCache.length === 1 ? '' : 's'} detected`;
            badge.className = bulkExistingQuizParsedCache.length > 0
                ? 'badge bg-success-subtle text-success border border-success-subtle rounded-pill'
                : 'badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill';
        }

        if (addBtn) {
            addBtn.disabled = bulkExistingQuizParsedCache.length === 0;
            addBtn.innerHTML = `<i class="bi bi-plus-circle me-1"></i> Add ${bulkExistingQuizParsedCache.length > 0 ? bulkExistingQuizParsedCache.length : 'All'} Questions to Quiz`;
        }

        if (preview) {
            if (bulkExistingQuizParsedCache.length === 0) {
                preview.innerHTML = '<span class="text-muted fst-italic">Paste or type questions above to see them parsed live...</span>';
            } else {
                preview.innerHTML = `<ol class="mb-0 ps-3">${bulkExistingQuizParsedCache.map(q => `
                    <li class="py-1">
                        <strong class="text-dark">${escapeHtml(q.text)}</strong>
                        <div class="micro-text text-muted mt-0.5">
                            <span class="me-2 ${q.answer === 'A' ? 'fw-bold text-success' : ''}">A: ${escapeHtml(q.options.A)}</span>
                            <span class="me-2 ${q.answer === 'B' ? 'fw-bold text-success' : ''}">B: ${escapeHtml(q.options.B)}</span>
                            ${q.options.C ? `<span class="me-2 ${q.answer === 'C' ? 'fw-bold text-success' : ''}">C: ${escapeHtml(q.options.C)}</span>` : ''}
                            ${q.options.D ? `<span class="me-2 ${q.answer === 'D' ? 'fw-bold text-success' : ''}">D: ${escapeHtml(q.options.D)}</span>` : ''}
                            <span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill ms-1">Ans: ${q.answer}</span>
                        </div>
                    </li>
                `).join('')}</ol>`;
            }
        }
    }

    function setupExistingQuizBulkAndFileHandlers() {
        const textarea = document.getElementById('bulkExistingQuizTextarea');
        const insertSampleBtn = document.getElementById('insertSampleExistingQuizBtn');
        const clearBulkBtn = document.getElementById('clearBulkExistingQuizBtn');
        const addBulkBtn = document.getElementById('addBulkExistingQuizBtn');
        const downloadTemplateBtn = document.getElementById('downloadExistingQuizTemplateBtn');
        const fileInput = document.getElementById('existingQuizFileInput');
        const dropZone = document.getElementById('existingQuizDropZone');
        const filePreviewSection = document.getElementById('existingQuizFilePreviewSection');
        const fileTbody = document.getElementById('existingQuizFilePreviewTbody');
        const fileCountBadge = document.getElementById('fileExistingQuizCountBadge');
        const clearFileBtn = document.getElementById('clearFileExistingQuizBtn');
        const importFileBtn = document.getElementById('importFileExistingQuizBtn');

        if (textarea) textarea.addEventListener('input', updateBulkExistingQuizPreview);

        if (insertSampleBtn) {
            insertSampleBtn.addEventListener('click', () => {
                if (textarea) {
                    textarea.value = `1. What is the SI unit of force?\nA. Joule\nB. Newton\nC. Watt\nD. Pascal\nAnswer: B\n\n2. What is the acceleration due to gravity on Earth?\nA. 9.8 m/s^2\nB. 8.9 m/s^2\nC. 10.5 m/s^2\nD. 12.0 m/s^2\nAnswer: A\n\n3. Which law states that for every action there is an equal and opposite reaction?\nA. Newton's 1st Law\nB. Newton's 2nd Law\nC. Newton's 3rd Law\nD. Law of Conservation of Energy\nAnswer: C`;
                    updateBulkExistingQuizPreview();
                }
            });
        }

        if (clearBulkBtn) {
            clearBulkBtn.addEventListener('click', () => {
                if (textarea) textarea.value = '';
                updateBulkExistingQuizPreview();
            });
        }

        if (addBulkBtn) {
            addBulkBtn.addEventListener('click', () => {
                if (bulkExistingQuizParsedCache.length === 0) return;
                const subject = editingSubjectCopy;
                const topic = subject?.topics[currentTopicIndexForEditing];
                if (!topic) return;
                if (!topic.quiz) topic.quiz = [];
                topic.quiz.push(...bulkExistingQuizParsedCache);
                renderExistingQuizQuestions();
                const count = bulkExistingQuizParsedCache.length;
                if (textarea) textarea.value = '';
                updateBulkExistingQuizPreview();

                const manualTab = document.getElementById('existing-quiz-manual-tab');
                if (manualTab) bootstrap.Tab.getOrCreateInstance(manualTab).show();
                alert(`Added ${count} question(s) to quiz.`);
            });
        }

        if (downloadTemplateBtn) {
            downloadTemplateBtn.addEventListener('click', () => downloadStarterTemplate('quiz'));
        }

        const onFileSelected = async (file) => {
            if (!file) return;
            try {
                const rows = await readSpreadsheetRows(file);
                fileExistingQuizParsedCache = parseQuizFromSheetRows(rows);

                if (fileCountBadge) fileCountBadge.textContent = `${fileExistingQuizParsedCache.length} questions loaded`;
                if (fileTbody) {
                    fileTbody.innerHTML = fileExistingQuizParsedCache.slice(0, 50).map((q, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td class="text-truncate" style="max-width: 160px;">${escapeHtml(q.text)}</td>
                            <td class="text-truncate" style="max-width: 90px;">${escapeHtml(q.options.A)}</td>
                            <td class="text-truncate" style="max-width: 90px;">${escapeHtml(q.options.B)}</td>
                            <td class="text-truncate" style="max-width: 90px;">${escapeHtml(q.options.C)}</td>
                            <td class="text-truncate" style="max-width: 90px;">${escapeHtml(q.options.D)}</td>
                            <td><span class="badge bg-success-subtle text-success">${escapeHtml(q.answer)}</span></td>
                        </tr>
                    `).join('');
                }
                if (filePreviewSection) filePreviewSection.classList.remove('d-none');
                if (importFileBtn) {
                    importFileBtn.disabled = fileExistingQuizParsedCache.length === 0;
                    importFileBtn.innerHTML = `<i class="bi bi-file-earmark-arrow-down me-1"></i> Import ${fileExistingQuizParsedCache.length} Questions to Quiz`;
                }
            } catch (err) {
                console.error('Error parsing quiz file:', err);
                alert('Could not read the spreadsheet file. Please ensure it is a valid .xlsx or .csv file.');
            }
        };

        setupDropZone(dropZone, fileInput, onFileSelected);

        if (clearFileBtn) {
            clearFileBtn.addEventListener('click', () => {
                if (fileInput) fileInput.value = '';
                fileExistingQuizParsedCache = [];
                if (filePreviewSection) filePreviewSection.classList.add('d-none');
                if (importFileBtn) {
                    importFileBtn.disabled = true;
                    importFileBtn.innerHTML = '<i class="bi bi-file-earmark-arrow-down me-1"></i> Import Questions to Quiz';
                }
            });
        }

        if (importFileBtn) {
            importFileBtn.addEventListener('click', () => {
                if (fileExistingQuizParsedCache.length === 0) return;
                const subject = editingSubjectCopy;
                const topic = subject?.topics[currentTopicIndexForEditing];
                if (!topic) return;
                if (!topic.quiz) topic.quiz = [];
                topic.quiz.push(...fileExistingQuizParsedCache);
                renderExistingQuizQuestions();
                const count = fileExistingQuizParsedCache.length;
                if (clearFileBtn) clearFileBtn.click();
                const manualTab = document.getElementById('existing-quiz-manual-tab');
                if (manualTab) bootstrap.Tab.getOrCreateInstance(manualTab).show();
                alert(`Successfully imported ${count} question(s) from spreadsheet.`);
            });
        }
    }

    let bulkExistingFcParsedCache = [];
    let fileExistingFcParsedCache = [];

    function updateBulkExistingFcPreview() {
        const textarea = document.getElementById('bulkExistingFcTextarea');
        const delimSelect = document.getElementById('bulkExistingFcDelimiter');
        const badge = document.getElementById('bulkExistingFcCountBadge');
        const preview = document.getElementById('bulkExistingFcPreviewContainer');
        const addBtn = document.getElementById('addBulkExistingFcBtn');

        const raw = textarea ? textarea.value : '';
        const delim = delimSelect ? delimSelect.value : 'auto';
        bulkExistingFcParsedCache = parseBulkFlashcards(raw, delim);

        if (badge) {
            badge.textContent = `${bulkExistingFcParsedCache.length} card${bulkExistingFcParsedCache.length === 1 ? '' : 's'} detected`;
            badge.className = bulkExistingFcParsedCache.length > 0
                ? 'badge bg-success-subtle text-success border border-success-subtle rounded-pill'
                : 'badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill';
        }

        if (addBtn) {
            addBtn.disabled = bulkExistingFcParsedCache.length === 0;
            addBtn.innerHTML = `<i class="bi bi-plus-circle me-1"></i> Add ${bulkExistingFcParsedCache.length > 0 ? bulkExistingFcParsedCache.length : 'All'} Cards to Deck`;
        }

        if (preview) {
            if (bulkExistingFcParsedCache.length === 0) {
                preview.innerHTML = '<span class="text-muted fst-italic">Paste or type above to see cards here...</span>';
            } else {
                preview.innerHTML = `<ol class="mb-0 ps-3">${bulkExistingFcParsedCache.map(c => `
                    <li class="py-0.5">
                        <strong class="text-dark">${escapeHtml(c.term)}</strong> &mdash; <span class="text-muted">${escapeHtml(c.definition)}</span>
                    </li>
                `).join('')}</ol>`;
            }
        }
    }

    function setupExistingFcBulkAndFileHandlers() {
        const textarea = document.getElementById('bulkExistingFcTextarea');
        const delimSelect = document.getElementById('bulkExistingFcDelimiter');
        const clearBulkBtn = document.getElementById('clearBulkExistingFcBtn');
        const addBulkBtn = document.getElementById('addBulkExistingFcBtn');
        const downloadTemplateBtn = document.getElementById('downloadExistingFcTemplateBtn');
        const fileInput = document.getElementById('existingFcFileInput');
        const dropZone = document.getElementById('existingFcDropZone');
        const filePreviewSection = document.getElementById('existingFcFilePreviewSection');
        const fileTbody = document.getElementById('existingFcFilePreviewTbody');
        const fileCountBadge = document.getElementById('fileExistingFcCountBadge');
        const clearFileBtn = document.getElementById('clearFileExistingFcBtn');
        const importFileBtn = document.getElementById('importFileExistingFcBtn');

        if (textarea) textarea.addEventListener('input', updateBulkExistingFcPreview);
        if (delimSelect) delimSelect.addEventListener('change', updateBulkExistingFcPreview);

        if (clearBulkBtn) {
            clearBulkBtn.addEventListener('click', () => {
                if (textarea) textarea.value = '';
                updateBulkExistingFcPreview();
            });
        }

        if (addBulkBtn) {
            addBulkBtn.addEventListener('click', () => {
                if (bulkExistingFcParsedCache.length === 0) return;
                const subject = editingSubjectCopy;
                const topic = subject?.topics[currentTopicIndexForEditing];
                if (!topic) return;
                if (!topic.flashcards) topic.flashcards = [];
                topic.flashcards.push(...bulkExistingFcParsedCache);
                renderExistingFlashcards();
                const count = bulkExistingFcParsedCache.length;
                if (textarea) textarea.value = '';
                updateBulkExistingFcPreview();

                const manualTab = document.getElementById('existing-fc-manual-tab');
                if (manualTab) bootstrap.Tab.getOrCreateInstance(manualTab).show();
                alert(`Added ${count} flashcard(s) to deck.`);
            });
        }

        if (downloadTemplateBtn) {
            downloadTemplateBtn.addEventListener('click', () => downloadStarterTemplate('flashcards'));
        }

        const onFileSelected = async (file) => {
            if (!file) return;
            try {
                const rows = await readSpreadsheetRows(file);
                fileExistingFcParsedCache = parseFlashcardsFromSheetRows(rows);

                if (fileCountBadge) fileCountBadge.textContent = `${fileExistingFcParsedCache.length} cards loaded`;
                if (fileTbody) {
                    fileTbody.innerHTML = fileExistingFcParsedCache.slice(0, 50).map((c, i) => `
                        <tr>
                            <td>${i + 1}</td>
                            <td class="fw-semibold text-truncate" style="max-width: 150px;">${escapeHtml(c.term)}</td>
                            <td class="text-truncate" style="max-width: 300px;">${escapeHtml(c.definition)}</td>
                        </tr>
                    `).join('');
                }
                if (filePreviewSection) filePreviewSection.classList.remove('d-none');
                if (importFileBtn) {
                    importFileBtn.disabled = fileExistingFcParsedCache.length === 0;
                    importFileBtn.innerHTML = `<i class="bi bi-file-earmark-arrow-down me-1"></i> Import ${fileExistingFcParsedCache.length} Cards to Deck`;
                }
            } catch (err) {
                console.error('Error parsing flashcards file:', err);
                alert('Could not read the spreadsheet file. Please ensure it is a valid .xlsx or .csv file.');
            }
        };

        setupDropZone(dropZone, fileInput, onFileSelected);

        if (clearFileBtn) {
            clearFileBtn.addEventListener('click', () => {
                if (fileInput) fileInput.value = '';
                fileExistingFcParsedCache = [];
                if (filePreviewSection) filePreviewSection.classList.add('d-none');
                if (importFileBtn) {
                    importFileBtn.disabled = true;
                    importFileBtn.innerHTML = '<i class="bi bi-file-earmark-arrow-down me-1"></i> Import Cards to Deck';
                }
            });
        }

        if (importFileBtn) {
            importFileBtn.addEventListener('click', () => {
                if (fileExistingFcParsedCache.length === 0) return;
                const subject = editingSubjectCopy;
                const topic = subject?.topics[currentTopicIndexForEditing];
                if (!topic) return;
                if (!topic.flashcards) topic.flashcards = [];
                topic.flashcards.push(...fileExistingFcParsedCache);
                renderExistingFlashcards();
                const count = fileExistingFcParsedCache.length;
                if (clearFileBtn) clearFileBtn.click();
                const manualTab = document.getElementById('existing-fc-manual-tab');
                if (manualTab) bootstrap.Tab.getOrCreateInstance(manualTab).show();
                alert(`Successfully imported ${count} card(s) from spreadsheet.`);
            });
        }
    }

    // --- Existing File Editor ---

    function openExistingFileEditor(topicIndex) {
        currentTopicIndexForEditing = topicIndex;
        const subject = editingSubjectCopy; // Work on the temporary copy
        const topic = subject?.topics[topicIndex];

        if (!topic || !existingFileEditorModal) return;

        if (!topic.files) topic.files = [];

        isTransitioningToSubmodal = true;
        const onModalHidden = () => {
            isTransitioningToSubmodal = false;
            document.getElementById('existingFileEditorModalLabel').textContent = `Manage Files for: ${topic.title}`;
            renderExistingFiles();
            if (existingFileEditorModal) existingFileEditorModal.show();
            if (subjectModalEl) subjectModalEl.removeEventListener('hidden.bs.modal', onModalHidden);
        };

        if (subjectModalEl) subjectModalEl.addEventListener('hidden.bs.modal', onModalHidden);
        if (subjectModal) subjectModal.hide();
    }

    function getMimeTypeFromFilename(filename, fallbackMime) {
        if (!filename) return fallbackMime || 'application/octet-stream';
        const ext = filename.split('.').pop().toLowerCase();
        const mimeMap = {
            'pdf': 'application/pdf',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'svg': 'image/svg+xml',
            'txt': 'text/plain',
            'md': 'text/plain',
            'html': 'text/html',
            'htm': 'text/html',
            'json': 'application/json',
            'csv': 'text/plain',
            'mp4': 'video/mp4',
            'webm': 'video/webm',
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'doc': 'application/msword',
            'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'ppt': 'application/vnd.ms-powerpoint',
            'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'xls': 'application/vnd.ms-excel'
        };
        return mimeMap[ext] || fallbackMime || 'application/octet-stream';
    }

    function dataURItoBlob(dataURI, filename = '') {
        if (!dataURI || !dataURI.includes(',')) return null;
        try {
            const parts = dataURI.split(',');
            const byteString = atob(parts[1]);
            let mimeString = parts[0].split(':')[1]?.split(';')[0];
            if (!mimeString || mimeString === 'application/octet-stream') {
                mimeString = getMimeTypeFromFilename(filename, mimeString);
            }
            const ab = new ArrayBuffer(byteString.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            return new Blob([ab], { type: mimeString });
        } catch (e) {
            console.error('Error converting data URI to blob:', e);
            return null;
        }
    }

    function renderExistingFiles() {
        const container = document.getElementById('existingFilesContainer');
        const subject = editingSubjectCopy; // Work on the temporary copy
        const topic = subject?.topics?.[currentTopicIndexForEditing];
        const files = (topic && Array.isArray(topic.files)) ? topic.files : [];
        container.innerHTML = '';

        if (files.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4 border rounded-3 bg-light">
                    <i class="bi bi-cloud-arrow-up fs-2 text-muted d-block mb-1"></i>
                    <p class="text-muted mb-0 small">No files uploaded yet for this topic.</p>
                </div>
            `;
            return;
        }

        const list = document.createElement('div');
        list.className = 'list-group shadow-xs rounded-3 border';
        files.forEach((file, index) => {
            const meta = getFileDisplayMeta(file.name);
            const fileSizeText = file.size ? `${(file.size / 1024).toFixed(2)} KB` : '';
            const isReady = !!(file.pdfDataUrl || file.convertedToPdf);

            const item = document.createElement('div');
            item.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center py-2.5 px-3 border-bottom transition-all';
            item.innerHTML = `
                <div class="d-flex align-items-center flex-grow-1 text-truncate me-3 preview-file-trigger" data-index="${index}" role="button" title="Click to view and check file contents" style="cursor: pointer;">
                    <div class="rounded-3 p-2 bg-light d-flex align-items-center justify-content-center me-3 flex-shrink-0" style="width: 42px; height: 42px;">
                        <i class="bi ${meta.icon} fs-4"></i>
                    </div>
                    <div class="text-truncate">
                        <span class="fw-semibold text-dark text-truncate d-block">${escapeHtml(file.name || 'Attached File')}</span>
                        <div class="d-flex align-items-center gap-2 mt-0.5">
                            <small class="text-muted">${fileSizeText}</small>
                            <span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle rounded-pill micro-text">${meta.label}</span>
                            ${isReady ? '<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill micro-text"><i class="bi bi-check-circle me-1"></i>HD Ready</span>' : ''}
                        </div>
                    </div>
                </div>
                <div class="d-flex align-items-center gap-1.5 flex-shrink-0">
                    <button type="button" class="btn btn-sm btn-outline-primary preview-existing-file-btn rounded-pill px-3 py-1 fw-semibold shadow-xs" data-index="${index}" title="View and check this file">
                        <i class="bi bi-eye me-1"></i>View
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger delete-existing-file-btn rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px;" data-index="${index}" title="Delete File">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            `;
            list.appendChild(item);
        });
        container.appendChild(list);
    }

    function renderOfficeCard(stageEl, file, blobUrl, meta, customMessage = '') {
        const fileSizeText = file.size ? `${(file.size / 1024).toFixed(2)} KB` : '';
        stageEl.innerHTML = `
            <div class="text-center p-5 bg-white rounded-4 shadow-sm mx-auto my-auto" style="max-width: 580px;">
                <i class="bi ${meta.icon} mb-3 d-block" style="font-size: 4.5rem;"></i>
                <h5 class="fw-bold text-dark mb-1">${escapeHtml(file.name)}</h5>
                <p class="text-muted small mb-3">${meta.label} (${fileSizeText})</p>
                <div class="alert alert-info py-2 px-3 small text-start mb-4">
                    <i class="bi bi-info-circle me-1"></i> ${customMessage || 'You can inspect or download this document directly to verify its contents before saving.'}
                </div>
                <div class="d-flex justify-content-center gap-2">
                    <a href="${blobUrl}" download="${escapeHtml(file.name || 'document')}" class="btn btn-primary rounded-pill px-4 py-2 fw-semibold shadow-xs">
                        <i class="bi bi-download me-1"></i> Download File
                    </a>
                    <a href="${blobUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline-secondary rounded-pill px-3 py-2 fw-semibold">
                        <i class="bi bi-box-arrow-up-right me-1"></i> Open Tab
                    </a>
                </div>
            </div>
        `;
    }

    function getResolvedFileUrl(fileObj, fallbackUrl = '', topicTitle = '') {
        let raw = '';
        const token = localStorage.getItem('mentorae_token') || '';
        const apiBase = (window.MENTORAE_CONFIG?.API_BASE_URL || window.API_BASE || '').replace(/\/+$/, '');
        const subjectName = editingSubjectCopy?.name || '';

        if (fileObj) {
            if (typeof fileObj === 'string') {
                raw = fileObj;
            } else {
                raw = fileObj.dataUrl || fileObj.url || fileObj.file_path || fileObj.filePath || fileObj.path || fileObj.pdfDataUrl || fileObj.pdfUrl || '';
                if (!raw && fileObj.topicId !== undefined && fileObj.fileIndex !== undefined) {
                    raw = `/api/content/topics/${fileObj.topicId}/files/${fileObj.fileIndex}/download`;
                } else if (!raw && fileObj.id) {
                    raw = `/api/resources/files/${fileObj.id}/download`;
                } else if (!raw && fileObj.name && subjectName) {
                    raw = `/api/content/topics/file-by-name?subjectName=${encodeURIComponent(subjectName)}&topicTitle=${encodeURIComponent(topicTitle || '')}&fileName=${encodeURIComponent(fileObj.name)}`;
                }
            }
        }
        if (!raw) raw = fallbackUrl || '';
        if (!raw) return '';

        if (raw.startsWith('data:') || raw.startsWith('blob:')) {
            return raw;
        }

        let fullUrl = raw;
        if (!/^https?:\/\//i.test(fullUrl)) {
            const cleanPath = fullUrl.startsWith('/') ? fullUrl : `/${fullUrl}`;
            fullUrl = `${apiBase}${cleanPath}`;
        }

        if (token && fullUrl.includes('/api/') && !fullUrl.includes('token=')) {
            const separator = fullUrl.includes('?') ? '&' : '?';
            fullUrl = `${fullUrl}${separator}token=${encodeURIComponent(token)}`;
        }

        if (fileObj && typeof fileObj === 'object' && fileObj.name && fullUrl.includes('/api/content/topics/') && !fullUrl.includes('name=')) {
            const separator = fullUrl.includes('?') ? '&' : '?';
            fullUrl = `${fullUrl}${separator}name=${encodeURIComponent(fileObj.name)}`;
        }

        return fullUrl;
    }

    function previewExistingFile(index) {
        const subject = editingSubjectCopy;
        const topic = subject?.topics?.[currentTopicIndexForEditing];
        if (!topic || !Array.isArray(topic.files) || !topic.files[index]) return;
        const file = topic.files[index];
        if (topic.id && file.topicId === undefined) file.topicId = topic.id;
        if (file.fileIndex === undefined) file.fileIndex = index;
        openClassroomViewer(file, 'existingFileEditorModal', topic.title);
    }

    function closeClassroomViewer() {
        const viewerEl = document.getElementById('classroomFileViewer');
        const stageEl = document.getElementById('classroomViewerStage');
        const modeSwitcherEl = document.getElementById('classroomViewerModeSwitcher');

        if (viewerEl) viewerEl.classList.add('d-none');
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
        if (stageEl) stageEl.innerHTML = '';
        if (modeSwitcherEl) modeSwitcherEl.innerHTML = '';

        if (currentPreviewBlobUrl && currentPreviewBlobUrl.startsWith('blob:')) {
            try { URL.revokeObjectURL(currentPreviewBlobUrl); } catch (e) {}
            currentPreviewBlobUrl = null;
        }

        isTransitioningToSubmodal = false;
        const targetModal = (filePreviewReturnModal === 'topicEditorModal') ? topicEditorModal : existingFileEditorModal;
        if (targetModal) targetModal.show();
    }

    function closeFilePreviewCheckModal() {
        closeClassroomViewer();
    }

    function openFilePreviewCheckModal(file, returnContext = 'existingFileEditorModal', contextTitle = '') {
        return openClassroomViewer(file, returnContext, contextTitle);
    }

    async function loadViewerFileData(url, fileName = '') {
        if (!url) throw new Error('No valid file URL provided.');
        const ext = (fileName || '').split('.').pop().toLowerCase();
        const isMedia = ['mp4', 'webm', 'ogg', 'mp3', 'wav', 'm4a'].includes(ext);

        let finalUrl = url;
        if (!finalUrl.startsWith('data:') && !finalUrl.startsWith('blob:') && !/^https?:\/\//i.test(finalUrl)) {
            finalUrl = getResolvedFileUrl(finalUrl, '', '');
        }

        if (finalUrl.startsWith('data:')) {
            try {
                const res = await fetch(finalUrl);
                const blob = await res.blob();
                const arrayBuffer = await blob.arrayBuffer();
                const blobUrl = URL.createObjectURL(blob);
                return { blob, arrayBuffer, blobUrl, mimeType: blob.type || getMimeTypeFromFilename(fileName) };
            } catch (fetchErr) {
                const b = dataURItoBlob(finalUrl, fileName);
                if (!b) throw new Error('Could not parse data URI.');
                const arrayBuffer = await b.arrayBuffer();
                const blobUrl = URL.createObjectURL(b);
                return { blob: b, arrayBuffer, blobUrl, mimeType: b.type || getMimeTypeFromFilename(fileName) };
            }
        }

        if (finalUrl.startsWith('blob:')) {
            try {
                const res = await fetch(finalUrl);
                const blob = await res.blob();
                const arrayBuffer = await blob.arrayBuffer();
                return { blob, arrayBuffer, blobUrl: finalUrl, mimeType: blob.type || getMimeTypeFromFilename(fileName) };
            } catch (e) {
                return { blob: null, arrayBuffer: null, blobUrl: finalUrl, mimeType: getMimeTypeFromFilename(fileName) };
            }
        }

        if (isMedia && /^https?:\/\//i.test(finalUrl)) {
            return {
                blob: null,
                arrayBuffer: null,
                blobUrl: finalUrl,
                mimeType: getMimeTypeFromFilename(fileName)
            };
        }

        const token = localStorage.getItem('mentorae_token');
        const headers = {};
        if (token && finalUrl.includes('/api/')) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        try {
            const res = await fetch(finalUrl, { headers, signal: controller.signal });
            if (!res.ok) {
                let errMsg = `Failed to load file (${res.status} ${res.statusText})`;
                try {
                    const errJson = await res.json();
                    if (errJson && errJson.message) errMsg = errJson.message;
                } catch (e) {}
                throw new Error(errMsg);
            }
            const blob = await res.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const blobUrl = URL.createObjectURL(blob);
            return { blob, arrayBuffer, blobUrl, mimeType: blob.type || getMimeTypeFromFilename(fileName) };
        } catch (fetchErr) {
            if (fetchErr.name === 'AbortError') {
                throw new Error('Server connection timed out. The file may be unavailable.');
            }
            throw fetchErr;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async function openClassroomViewer(fileOrName, returnContext = 'existingFileEditorModal', contextTitle = '') {
        const viewerEl = document.getElementById('classroomFileViewer');
        const nameEl = document.getElementById('classroomViewerFileName');
        const subEl = document.getElementById('classroomViewerSubtitle');
        const iconEl = document.getElementById('classroomViewerIcon');
        const stageEl = document.getElementById('classroomViewerStage');
        const downloadBtn = document.getElementById('classroomViewerDownloadBtn');
        const popoutBtn = document.getElementById('classroomViewerPopoutBtn');
        const printBtn = document.getElementById('classroomViewerPrintBtn');
        const modeSwitcherEl = document.getElementById('classroomViewerModeSwitcher');

        if (!viewerEl || !stageEl) return;

        let file = null;
        let fileName = '';
        let initialDataUrl = '';
        if (typeof fileOrName === 'object' && fileOrName !== null) {
            file = fileOrName;
            fileName = file.name || 'Document';
            initialDataUrl = file.dataUrl || file.url || '';
        } else {
            fileName = String(fileOrName || 'Document');
            initialDataUrl = String(returnContext || '');
            file = { name: fileName, dataUrl: initialDataUrl };
        }

        const resolvedUrl = getResolvedFileUrl(file, initialDataUrl, contextTitle);

        filePreviewReturnModal = (typeof returnContext === 'string' && returnContext.includes('Modal')) ? returnContext : 'existingFileEditorModal';

        // Revoke prior active blob URL
        if (currentPreviewBlobUrl && currentPreviewBlobUrl.startsWith('blob:')) {
            try { URL.revokeObjectURL(currentPreviewBlobUrl); } catch (e) {}
            currentPreviewBlobUrl = null;
        }

        // Hide caller modal safely without losing draft content
        const sourceModal = (filePreviewReturnModal === 'topicEditorModal') ? topicEditorModal : existingFileEditorModal;
        isTransitioningToSubmodal = true;
        if (sourceModal) sourceModal.hide();

        viewerEl.classList.remove('d-none');
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        const closeBtn = document.getElementById('classroomViewerCloseBtn');
        const backBtn = document.getElementById('classroomViewerBackBtn');
        if (closeBtn) closeBtn.onclick = closeClassroomViewer;
        if (backBtn) backBtn.onclick = closeClassroomViewer;

        const subjectName = editingSubjectCopy?.name || 'Subject';
        const displaySubtitle = contextTitle ? `${subjectName} • ${contextTitle}` : `${subjectName} • Learning Materials`;

        if (nameEl) nameEl.textContent = fileName || 'Document';
        if (subEl) subEl.textContent = displaySubtitle;

        const ext = (fileName || '').split('.').pop().toLowerCase();
        let mime = (file && file.type) ? file.type : getMimeTypeFromFilename(fileName, '');

        if (iconEl) {
            if (ext === 'pdf') {
                iconEl.className = 'bi bi-file-earmark-pdf fs-4 text-danger';
            } else if (ext === 'pptx' || ext === 'ppt') {
                iconEl.className = 'bi bi-file-earmark-slides fs-4 text-warning';
            } else if (ext === 'docx' || ext === 'doc') {
                iconEl.className = 'bi bi-file-earmark-word fs-4 text-primary';
            } else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
                iconEl.className = 'bi bi-file-earmark-excel fs-4 text-success';
            } else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
                iconEl.className = 'bi bi-file-earmark-image fs-4 text-info';
            } else if (['mp4', 'webm', 'ogg'].includes(ext)) {
                iconEl.className = 'bi bi-file-earmark-play fs-4 text-danger';
            } else if (['mp3', 'wav', 'm4a'].includes(ext)) {
                iconEl.className = 'bi bi-file-earmark-music fs-4 text-primary';
            } else {
                iconEl.className = 'bi bi-file-earmark-text fs-4 text-light';
            }
        }

        stageEl.innerHTML = `
            <div class="d-flex flex-column align-items-center justify-content-center w-100 h-100 text-white">
                <div class="spinner-border text-primary mb-3" style="width: 3.2rem; height: 3.2rem;" role="status"></div>
                <p class="fs-5 fw-semibold mb-1">Loading Document Preview...</p>
                <p class="text-white-50 small">${escapeHtml(fileName || 'Please wait')}</p>
            </div>
        `;
        if (modeSwitcherEl) modeSwitcherEl.innerHTML = '';

        let fileData = null;
        try {
            fileData = await loadViewerFileData(resolvedUrl, fileName);
            if (fileData.blobUrl && fileData.blobUrl.startsWith('blob:')) {
                currentPreviewBlobUrl = fileData.blobUrl;
            }
        } catch (err) {
            const canTryPdf = ['pptx', 'ppt', 'docx', 'doc', 'pdf'].includes(ext);
            const hasAlternativeData = (file && (file.dataUrl || file.pdfDataUrl || file.pdfUrl)) || (initialDataUrl && initialDataUrl.startsWith('data:'));
            if (!canTryPdf || (!hasAlternativeData && !file?.topicId)) {
                console.error('Error loading file data:', err);
                stageEl.innerHTML = `
                    <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 520px;">
                        <i class="bi bi-file-earmark-x text-warning display-4 mb-3 d-block"></i>
                        <h4 class="fw-bold text-white mb-2">Preview Unavailable</h4>
                        <p class="text-white-50 mb-3">${escapeHtml(fileName || 'File')}</p>
                        <p class="text-secondary small mb-4">${escapeHtml(err.message || 'File content is not available in the database. Please re-upload this file.')}</p>
                        <button type="button" class="btn btn-outline-light rounded-pill px-4 fw-semibold" id="closeMissingAdminFileBtn">
                            <i class="bi bi-arrow-left me-2"></i> Close Viewer
                        </button>
                    </div>
                `;
                document.getElementById('closeMissingAdminFileBtn')?.addEventListener('click', closeClassroomViewer);
                return;
            }
        }

        const activeUrl = fileData?.blobUrl || resolvedUrl;

        // Configure Top Action Buttons
        if (downloadBtn) {
            downloadBtn.href = activeUrl;
            downloadBtn.setAttribute('download', fileName || 'lesson_file');
        }
        if (popoutBtn) {
            popoutBtn.href = activeUrl;
            popoutBtn.target = '_blank';
        }
        if (printBtn) {
            printBtn.onclick = () => {
                const ifr = stageEl.querySelector('iframe');
                if (ifr && ifr.contentWindow) {
                    try {
                        ifr.contentWindow.print();
                        return;
                    } catch (e) { }
                }
                const printWindow = window.open(activeUrl);
                if (printWindow) {
                    printWindow.addEventListener('load', () => printWindow.print(), { once: true });
                } else {
                    window.print();
                }
            };
        }

        // ==========================================
        // 1. PDF RENDERING (Native Frame with Blob URL)
        // ==========================================
        if (ext === 'pdf' || mime.includes('pdf')) {
            stageEl.innerHTML = `
                <object data="${activeUrl}" type="application/pdf" class="w-100 h-100 border-0" style="background: #525659;">
                    <iframe src="${activeUrl}" class="w-100 h-100 border-0" title="${escapeHtml(fileName)}" style="background: #525659;">
                        <div class="p-5 text-center text-white">
                            <p class="mb-3">Unable to display PDF inline.</p>
                            <a href="${activeUrl}" target="_blank" class="btn btn-danger rounded-pill px-4">Open PDF</a>
                        </div>
                    </iframe>
                </object>
            `;
            return;
        }

        // ==========================================
        // 2. PPT / PPTX PRESENTATIONS (Google Classroom Style PDF Auto-View + Interactive Slides)
        // ==========================================
        if (ext === 'pptx' || ext === 'ppt') {
            if (modeSwitcherEl) modeSwitcherEl.innerHTML = '';

            stageEl.innerHTML = `
                <div class="d-flex flex-column align-items-center justify-content-center w-100 h-100 text-white p-4">
                    <div class="spinner-border text-primary mb-3" style="width: 3.5rem; height: 3.5rem;" role="status"></div>
                    <p class="fs-5 fw-bold mb-1">Converting Presentation to PDF...</p>
                    <p class="text-white-50 small mb-3" id="pptxConvertStatus">Preparing classroom PDF document for viewing</p>
                    <div class="progress w-50" style="height: 6px; background: rgba(255,255,255,0.15);">
                        <div class="progress-bar progress-bar-striped progress-bar-animated bg-primary" id="pptxConvertProgressBar" style="width: 25%;"></div>
                    </div>
                </div>
            `;

            const token = localStorage.getItem('mentorae_token');
            const apiBase = (window.MENTORAE_CONFIG?.API_BASE_URL || window.API_BASE || '').replace(/\/+$/, '');
            const topic = editingSubjectCopy?.topics?.[currentTopicIndexForEditing];
            const targetTopicId = file?.topicId || topic?.id;

            let finalPdfBlobUrl = null;

            // Step 1: Check if already converted and available in memory
            if (file?.pdfBlobUrl && typeof file.pdfBlobUrl === 'string') {
                finalPdfBlobUrl = file.pdfBlobUrl;
            } else if (file?.pdfDataUrl && typeof file.pdfDataUrl === 'string' && file.pdfDataUrl.startsWith('data:application/pdf')) {
                try {
                    const blob = dataURItoBlob(file.pdfDataUrl, `${fileName}.pdf`);
                    if (blob) {
                        finalPdfBlobUrl = URL.createObjectURL(blob);
                        file.pdfBlobUrl = finalPdfBlobUrl;
                    }
                } catch (e) {}
            }

            // Step 2: Check if pre-converted PDF is available on the server
            if (!finalPdfBlobUrl && targetTopicId !== undefined && file?.fileIndex !== undefined) {
                try {
                    const srvPdfUrl = `${apiBase}/api/content/topics/${targetTopicId}/files/${file.fileIndex}/download?asPdf=true`;
                    const srvController = new AbortController();
                    const srvTimeout = setTimeout(() => srvController.abort(), 4000);
                    const srvRes = await fetch(srvPdfUrl, {
                        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                        signal: srvController.signal
                    });
                    clearTimeout(srvTimeout);

                    if (srvRes.ok) {
                        const srvBuf = await srvRes.arrayBuffer();
                        if (srvBuf && srvBuf.byteLength >= 4) {
                            const header = String.fromCharCode(...new Uint8Array(srvBuf.slice(0, 4)));
                            if (header.startsWith('%PDF')) {
                                const blob = new Blob([srvBuf], { type: 'application/pdf' });
                                finalPdfBlobUrl = URL.createObjectURL(blob);
                                if (file) file.pdfBlobUrl = finalPdfBlobUrl;
                            }
                        }
                    }
                } catch (srvErr) {
                    console.log('Server pre-converted PDF not immediately available, converting client-side:', srvErr);
                }
            }

            // Step 3: Convert client-side via MentoraePptxToPdf if not yet converted
            if (!finalPdfBlobUrl && window.MentoraePptxToPdf) {
                try {
                    let pptxBuffer = fileData?.arrayBuffer;
                    if (!pptxBuffer && fileData?.blob) {
                        pptxBuffer = await fileData.blob.arrayBuffer();
                    }
                    if (!pptxBuffer && file?.dataUrl && typeof file.dataUrl === 'string' && file.dataUrl.includes(',')) {
                        const b = dataURItoBlob(file.dataUrl, fileName);
                        if (b) pptxBuffer = await b.arrayBuffer();
                    }
                    if (!pptxBuffer && resolvedUrl) {
                        const fetchRes = await fetch(resolvedUrl, {
                            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                        });
                        if (fetchRes.ok) {
                            pptxBuffer = await fetchRes.arrayBuffer();
                        }
                    }

                    if (pptxBuffer) {
                        const convertedDataUrl = await window.MentoraePptxToPdf.convert(pptxBuffer, (prog) => {
                            const pBar = document.getElementById('pptxConvertProgressBar');
                            const pStatus = document.getElementById('pptxConvertStatus');
                            if (pBar) pBar.style.width = `${prog.percent || 50}%`;
                            if (pStatus) pStatus.textContent = prog.message || 'Converting slides into PDF...';
                        });

                        if (convertedDataUrl && convertedDataUrl.startsWith('data:application/pdf')) {
                            const pdfBlob = dataURItoBlob(convertedDataUrl, `${fileName}.pdf`);
                            if (pdfBlob) {
                                finalPdfBlobUrl = URL.createObjectURL(pdfBlob);
                                if (file) {
                                    file.pdfDataUrl = convertedDataUrl;
                                    file.pdfBlobUrl = finalPdfBlobUrl;
                                    file.convertedToPdf = true;
                                    renderExistingFiles();
                                }

                                // Background-cache to server database for subsequent instant loads
                                if (targetTopicId && token) {
                                    fetch(`${apiBase}/api/content/topics/${targetTopicId}/cache-file-pdf`, {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'Authorization': `Bearer ${token}`
                                        },
                                        body: JSON.stringify({ fileName, pdfDataUrl: convertedDataUrl })
                                    }).catch(() => {});
                                }
                            }
                        }
                    }
                } catch (convErr) {
                    console.error('Client PPTX to PDF conversion error:', convErr);
                }
            }

            // Step 4: Render genuine PDF in embedded frame
            if (finalPdfBlobUrl) {
                if (popoutBtn) popoutBtn.href = finalPdfBlobUrl;
                stageEl.innerHTML = `
                    <object data="${finalPdfBlobUrl}" type="application/pdf" class="w-100 h-100 border-0" style="background: #525659;">
                        <iframe src="${finalPdfBlobUrl}" class="w-100 h-100 border-0" title="${escapeHtml(fileName)}" style="background: #525659;">
                            <div class="p-5 text-center text-white">
                                <p class="mb-3">Unable to display PDF inline.</p>
                                <a href="${finalPdfBlobUrl}" target="_blank" class="btn btn-primary rounded-pill px-4">Open Converted PDF</a>
                            </div>
                        </iframe>
                    </object>
                `;
                return;
            }

            // Fallback only if presentation binary was corrupt and could not be rendered
            stageEl.innerHTML = `
                <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 520px;">
                    <i class="bi bi-file-earmark-slides text-warning display-4 mb-3 d-block"></i>
                    <h4 class="fw-bold text-white mb-2">Presentation Preview</h4>
                    <p class="text-white-50 mb-3">${escapeHtml(fileName)}</p>
                    <p class="text-secondary small mb-4">This presentation could not be converted into a PDF preview. You can download the file or open it in external viewers.</p>
                    <div class="d-flex justify-content-center gap-2">
                        <a href="${activeUrl}" download="${escapeHtml(fileName)}" class="btn btn-primary rounded-pill px-4 fw-semibold">
                            <i class="bi bi-download me-1"></i> Download Presentation
                        </a>
                        <button type="button" class="btn btn-outline-light rounded-pill px-4 fw-semibold" id="closeFailedPptBtn">
                            Close
                        </button>
                    </div>
                </div>
            `;
            document.getElementById('closeFailedPptBtn')?.addEventListener('click', closeClassroomViewer);
            return;
        }

        async function openOnlineEmbed(viewerType) {
            const isDoc = ext === 'docx' || ext === 'doc';
            const officeTitle = isDoc ? 'Microsoft Word Online' : 'Microsoft Office Online';
            const googleTitle = isDoc ? 'Google Docs Viewer' : 'Google Slides Viewer';
            const backBtnLabel = isDoc ? 'Document View' : 'PDF View';

            if (modeSwitcherEl) {
                modeSwitcherEl.innerHTML = `
                    <button type="button" class="btn btn-sm btn-primary rounded-pill px-2.5 py-0.5 border-0 fw-semibold fs-8" id="modeBackSlidesTopBtn" title="Switch back to built-in viewer">
                        <i class="bi bi-${isDoc ? 'file-earmark-word' : 'file-earmark-pdf'} me-1"></i> Back to ${backBtnLabel}
                    </button>
                `;
                document.getElementById('modeBackSlidesTopBtn')?.addEventListener('click', () => {
                    openClassroomViewer(file, filePreviewReturnModal, contextTitle);
                });
            }

            stageEl.innerHTML = `
                <div class="d-flex flex-column align-items-center justify-content-center w-100 h-100 text-white p-4">
                    <div class="spinner-border ${viewerType === 'office' ? 'text-info' : 'text-warning'} mb-3" style="width: 3rem; height: 3rem;" role="status"></div>
                    <p class="fs-5 fw-semibold mb-1">Connecting to ${viewerType === 'office' ? officeTitle : googleTitle}...</p>
                    <p class="text-white-50 small mb-3">Loading genuine ${isDoc ? 'document layout, shapes, and diagrams' : 'presentation layout and animations'}</p>
                    <button type="button" class="btn btn-sm btn-outline-light rounded-pill px-3" id="cancelOnlineEmbedBtn">
                        <i class="bi bi-arrow-left me-1"></i> Back to ${backBtnLabel}
                    </button>
                </div>
            `;
            document.getElementById('cancelOnlineEmbedBtn')?.addEventListener('click', () => {
                openClassroomViewer(file, filePreviewReturnModal, contextTitle);
            });

            try {
                const token = localStorage.getItem('mentorae_token') || '';
                const apiBase = (window.MENTORAE_CONFIG?.API_BASE_URL || '').replace(/\/+$/, '');

                let payloadDataUrl = dataUrl;
                if (!payloadDataUrl || typeof payloadDataUrl !== 'string' || payloadDataUrl.startsWith('blob:') || !payloadDataUrl.includes('base64')) {
                    if (fileData && fileData.blob) {
                        payloadDataUrl = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.onerror = reject;
                            reader.readAsDataURL(fileData.blob);
                        });
                    } else if (fileData && fileData.arrayBuffer) {
                        const bytes = new Uint8Array(fileData.arrayBuffer);
                        let binary = '';
                        const len = bytes.byteLength;
                        for (let i = 0; i < len; i += 8192) {
                            binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 8192, len)));
                        }
                        const mimeTypeForPayload = isDoc
                            ? (ext === 'doc' ? 'application/msword' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
                            : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
                        payloadDataUrl = `data:${mimeTypeForPayload};base64,${btoa(binary)}`;
                    }
                }

                const res = await fetch(`${apiBase}/api/content/public-preview-token`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({ fileName, dataUrl: payloadDataUrl })
                });
                const data = await res.json();
                if (data && data.success) {
                    const embedUrl = viewerType === 'office' ? data.officeViewerUrl : data.googleViewerUrl;
                    stageEl.innerHTML = `
                        <div class="w-100 h-100 position-relative d-flex flex-column">
                            <div class="d-flex align-items-center justify-content-between px-3 py-1.5 bg-dark border-bottom border-secondary" style="font-size: 0.8rem;">
                                <span class="text-white-50"><i class="bi bi-${viewerType === 'office' ? 'microsoft text-info' : 'google text-warning'} me-1.5"></i> Powered by ${viewerType === 'office' ? officeTitle : googleTitle}</span>
                                <div class="d-flex align-items-center gap-2">
                                    <a href="${embedUrl}" target="_blank" class="btn btn-xs btn-outline-info rounded-pill px-2.5 py-0.5" style="font-size: 0.75rem;">
                                        <i class="bi bi-box-arrow-up-right me-1"></i> Full Window
                                    </a>
                                    <button type="button" class="btn btn-xs btn-outline-light rounded-pill px-2.5 py-0.5" id="btnBackToBuiltinSlides" style="font-size: 0.75rem;">
                                        <i class="bi bi-${isDoc ? 'file-earmark-word' : 'file-earmark-pdf'} me-1"></i> Back to ${backBtnLabel}
                                    </button>
                                </div>
                            </div>
                            <iframe src="${embedUrl}" class="w-100 flex-grow-1 border-0" allowfullscreen title="${escapeHtml(fileName)}"></iframe>
                        </div>
                    `;
                    document.getElementById('btnBackToBuiltinSlides')?.addEventListener('click', () => {
                        openClassroomViewer(file, filePreviewReturnModal, contextTitle);
                    });
                    return;
                }
                throw new Error(data?.message || 'Could not connect to online viewer.');
            } catch (err) {
                console.warn('Online embed error, falling back to built-in viewer:', err);
                stageEl.innerHTML = `
                    <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 520px;">
                        <i class="bi bi-exclamation-circle text-warning fs-1 mb-3 d-block"></i>
                        <h5 class="fw-bold text-white mb-2">Could not connect to ${viewerType === 'office' ? 'Microsoft Office' : 'Google'} Viewer</h5>
                        <p class="text-white-50 small mb-4">${escapeHtml(err.message || 'Service is temporarily unreachable.')}</p>
                        <div class="d-flex justify-content-center gap-2">
                            <button type="button" class="btn btn-primary rounded-pill px-4" id="btnFallbackBuiltin">
                                <i class="bi bi-file-earmark-pdf me-1"></i> Open PDF View
                            </button>
                            <a href="${activeUrl}" download="${escapeHtml(fileName)}" class="btn btn-outline-light rounded-pill px-4">
                                <i class="bi bi-download me-1"></i> Download Original .pptx
                            </a>
                        </div>
                    </div>
                `;
                document.getElementById('btnFallbackBuiltin')?.addEventListener('click', () => {
                    openClassroomViewer(file, filePreviewReturnModal, contextTitle);
                });
            }
        }

        function renderPptxPresentation(pptxBuffer, presFileName, presUrl) {
            stageEl.innerHTML = `
                <div class="d-flex align-items-center justify-content-center w-100 h-100 text-white">
                    <div class="text-center">
                        <div class="spinner-border text-warning mb-3" style="width: 3rem; height: 3rem;" role="status"></div>
                        <p class="fs-5 fw-semibold mb-1">Opening PowerPoint Presentation...</p>
                        <p class="text-white-50 small">Rendering visual layouts, graphics, and themes</p>
                    </div>
                </div>
            `;
            setTimeout(async () => {
                try {
                    const arrayBuffer = pptxBuffer || (fileData ? fileData.arrayBuffer : null);
                    if (!arrayBuffer) {
                        stageEl.innerHTML = `
                            <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 520px;">
                                <i class="bi bi-file-earmark-slides text-warning display-4 mb-3 d-block"></i>
                                <h4 class="fw-bold text-white mb-2">Presentation Preview Unavailable</h4>
                                <p class="text-white-50 mb-3">${escapeHtml(presFileName || fileName || 'Presentation')}</p>
                                <p class="text-secondary small mb-4">The presentation file data is not available on the server. Please re-upload the file to enable online viewing.</p>
                                <button type="button" class="btn btn-outline-light rounded-pill px-4 fw-semibold" id="closePptxNoBufferAdminBtn">
                                    <i class="bi bi-arrow-left me-2"></i> Close Viewer
                                </button>
                            </div>
                        `;
                        document.getElementById('closePptxNoBufferAdminBtn')?.addEventListener('click', closeClassroomViewer);
                        return;
                    }

                    const zip = await JSZip.loadAsync(arrayBuffer);

                    let slideWidth = 9144000;
                    let slideHeight = 5142857;
                    try {
                        const presFile = zip.files['ppt/presentation.xml'];
                        if (presFile) {
                            const presXml = await presFile.async('string');
                            const cxMatch = presXml.match(/cx="(\d+)"/i);
                            const cyMatch = presXml.match(/cy="(\d+)"/i);
                            if (cxMatch && cyMatch) {
                                const parsedW = parseInt(cxMatch[1], 10);
                                const parsedH = parseInt(cyMatch[1], 10);
                                if (parsedW > 0 && parsedH > 0) {
                                    slideWidth = parsedW;
                                    slideHeight = parsedH;
                                }
                            }
                        }
                    } catch (e) { }

                    function isHexDark(hex) {
                        if (!hex || typeof hex !== 'string') return false;
                        const clean = hex.replace('#', '');
                        if (clean.length !== 6) return false;
                        const r = parseInt(clean.substr(0, 2), 16);
                        const g = parseInt(clean.substr(2, 2), 16);
                        const b = parseInt(clean.substr(4, 2), 16);
                        return (r * 299 + g * 587 + b * 114) / 1000 < 128;
                    }

                    const mediaBlobs = {};
                    for (const path of Object.keys(zip.files)) {
                        if (path.startsWith('ppt/media/')) {
                            try {
                                let mType = 'image/png';
                                const lower = path.toLowerCase();
                                if (lower.endsWith('.svg')) mType = 'image/svg+xml';
                                else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mType = 'image/jpeg';
                                else if (lower.endsWith('.gif')) mType = 'image/gif';
                                else if (lower.endsWith('.webp')) mType = 'image/webp';

                                const u8 = await zip.files[path].async('uint8array');
                                const mBlob = new Blob([u8], { type: mType });
                                const url = URL.createObjectURL(mBlob);
                                const cleanKey = path.replace(/^ppt\//, '');
                                mediaBlobs[cleanKey] = url;
                                mediaBlobs[path] = url;
                                mediaBlobs[cleanKey.replace(/^media\//, '')] = url;
                            } catch (e) { }
                        }
                    }

                    const slideKeys = Object.keys(zip.files)
                        .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
                        .sort((a, b) => {
                            const numA = parseInt(a.match(/\d+/)[0], 10);
                            const numB = parseInt(b.match(/\d+/)[0], 10);
                            return numA - numB;
                        });

                    if (slideKeys.length === 0) {
                        stageEl.innerHTML = `<div class="p-5 text-center text-white-50">No slides found in presentation.</div>`;
                        return;
                    }

                    const slides = [];

                    for (let i = 0; i < slideKeys.length; i++) {
                        const slideKey = slideKeys[i];
                        const slideNum = i + 1;
                        const xmlText = await zip.files[slideKey].async('string');

                        const relsPath = slideKey.replace('ppt/slides/', 'ppt/slides/_rels/').concat('.rels');
                        const relsMap = {};
                        if (zip.files[relsPath]) {
                            try {
                                const relsText = await zip.files[relsPath].async('string');
                                const relRegex = /<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"/g;
                                let rMatch;
                                while ((rMatch = relRegex.exec(relsText)) !== null) {
                                    const cleanTarget = rMatch[2].replace(/^\.\.\//, '');
                                    relsMap[rMatch[1]] = mediaBlobs[cleanTarget] || mediaBlobs[cleanTarget.replace(/^media\//, '')];
                                }
                            } catch (e) { }
                        }

                        let bgColor = '#FFFFFF';
                        let bgImage = null;
                        const bgMatch = xmlText.match(/<p:bg>[\s\S]*?<a:srgbClr\s+val="([A-Fa-f0-9]{6})"/);
                        if (bgMatch) {
                            bgColor = '#' + bgMatch[1];
                        }
                        const bgBlipMatch = xmlText.match(/<p:bg>[\s\S]*?r:embed="([^"]+)"/);
                        if (bgBlipMatch && relsMap[bgBlipMatch[1]]) {
                            bgImage = relsMap[bgBlipMatch[1]];
                        }

                        const slideIsDark = isHexDark(bgColor);
                        const defaultTextColor = slideIsDark ? '#FFFFFF' : '#1E293B';

                        const elements = [];
                        let slideTitle = `Slide ${slideNum}`;
                        let titleFound = false;

                        function parseShapesFromXml(xmlStr) {
                            const results = [];
                            const grpMatches = xmlStr.match(/<p:grpSp[\s\S]*?<\/p:grpSp>/g) || [];
                            grpMatches.forEach(grpNode => {
                                const grpOffMatch = grpNode.match(/<p:grpSpPr>[\s\S]*?<a:xfrm[\s\S]*?<a:off[^>]+x="([^"]+)"[^>]+y="([^"]+)"/);
                                const grpExtMatch = grpNode.match(/<p:grpSpPr>[\s\S]*?<a:xfrm[\s\S]*?<a:ext[^>]+cx="([^"]+)"[^>]+cy="([^"]+)"/);
                                const grpChOffMatch = grpNode.match(/<p:grpSpPr>[\s\S]*?<a:xfrm[\s\S]*?<a:chOff[^>]+x="([^"]+)"[^>]+y="([^"]+)"/);
                                const grpChExtMatch = grpNode.match(/<p:grpSpPr>[\s\S]*?<a:xfrm[\s\S]*?<a:chExt[^>]+cx="([^"]+)"[^>]+cy="([^"]+)"/);

                                let grpInfo = null;
                                if (grpOffMatch && grpExtMatch) {
                                    const gx = parseInt(grpOffMatch[1], 10);
                                    const gy = parseInt(grpOffMatch[2], 10);
                                    const gw = parseInt(grpExtMatch[1], 10);
                                    const gh = parseInt(grpExtMatch[2], 10);
                                    const chX = grpChOffMatch ? parseInt(grpChOffMatch[1], 10) : 0;
                                    const chY = grpChOffMatch ? parseInt(grpChOffMatch[2], 10) : 0;
                                    const chW = (grpChExtMatch && parseInt(grpChExtMatch[1], 10) > 0) ? parseInt(grpChExtMatch[1], 10) : gw;
                                    const chH = (grpChExtMatch && parseInt(grpChExtMatch[2], 10) > 0) ? parseInt(grpChExtMatch[2], 10) : gh;

                                    if (gw > 0 && gh > 0) {
                                        grpInfo = { gx, gy, gw, gh, chX, chY, chW, chH };
                                    }
                                }

                                const innerSp = grpNode.match(/<p:sp[\s\S]*?<\/p:sp>/g) || [];
                                const innerPic = grpNode.match(/<p:pic[\s\S]*?<\/p:pic>/g) || [];
                                [...innerSp, ...innerPic].forEach(childNode => {
                                    results.push({ node: childNode, group: grpInfo });
                                });
                            });

                            const strippedXml = xmlStr.replace(/<p:grpSp[\s\S]*?<\/p:grpSp>/g, '');
                            const rootSp = strippedXml.match(/<p:sp[\s\S]*?<\/p:sp>/g) || [];
                            const rootPic = strippedXml.match(/<p:pic[\s\S]*?<\/p:pic>/g) || [];
                            [...rootSp, ...rootPic].forEach(rootNode => {
                                results.push({ node: rootNode, group: null });
                            });

                            return results;
                        }

                        const allItems = parseShapesFromXml(xmlText);

                        allItems.forEach(({ node, group }) => {
                            const xMatch = node.match(/<a:off[^>]+x="([^"]+)"[^>]+y="([^"]+)"/);
                            const extMatch = node.match(/<a:ext[^>]+cx="([^"]+)"[^>]+cy="([^"]+)"/);
                            if (!xMatch || !extMatch) return;

                            let childX = parseInt(xMatch[1], 10);
                            let childY = parseInt(xMatch[2], 10);
                            let childW = parseInt(extMatch[1], 10);
                            let childH = parseInt(extMatch[2], 10);

                            if (childW <= 0 || childH <= 0) return;

                            let finalX = childX;
                            let finalY = childY;
                            let finalW = childW;
                            let finalH = childH;

                            if (group) {
                                finalX = group.gx + ((childX - group.chX) * group.gw / group.chW);
                                finalY = group.gy + ((childY - group.chY) * group.gh / group.chH);
                                finalW = childW * group.gw / group.chW;
                                finalH = childH * group.gh / group.chH;
                            }

                            const left = Math.max(-10, Math.min(110, (finalX / slideWidth) * 100));
                            const top = Math.max(-10, Math.min(110, (finalY / slideHeight) * 100));
                            const width = Math.max(0.2, Math.min(110, (finalW / slideWidth) * 100));
                            const height = Math.max(0.2, Math.min(110, (finalH / slideHeight) * 100));

                            const blipMatch = node.match(/r:embed="([^"]+)"/);
                            const imgUrl = blipMatch ? relsMap[blipMatch[1]] : null;

                            if (imgUrl) {
                                elements.push({
                                    type: 'image',
                                    url: imgUrl,
                                    left, top, width, height
                                });
                            }

                            let shapeBg = null;
                            const spPrMatch = node.match(/<p:spPr[\s\S]*?<\/p:spPr>/);
                            if (spPrMatch) {
                                const spPr = spPrMatch[0];
                                if (!spPr.includes('<a:noFill')) {
                                    const solidMatch = spPr.match(/<a:solidFill>[\s\S]*?<a:srgbClr\s+val="([A-Fa-f0-9]{6})"/);
                                    if (solidMatch) {
                                        shapeBg = '#' + solidMatch[1];
                                    }
                                }
                            }

                            const pMatches = node.match(/<a:p[\s\S]*?<\/a:p>/g) || [];
                            const paragraphs = [];

                            pMatches.forEach(pNode => {
                                let align = 'left';
                                if (pNode.includes('algn="ctr"')) align = 'center';
                                else if (pNode.includes('algn="r"')) align = 'right';
                                else if (pNode.includes('algn="just"')) align = 'justify';

                                const rMatches = pNode.match(/<a:r[\s\S]*?<\/a:r>|<a:br\/>/g) || [];
                                const runs = [];

                                rMatches.forEach(rNode => {
                                    if (rNode === '<a:br/>') {
                                        runs.push({ text: '\n', isBr: true });
                                    } else {
                                        const tMatch = rNode.match(/<a:t>([\s\S]*?)<\/a:t>/);
                                        if (tMatch) {
                                            const rawText = tMatch[1];
                                            const isBold = rNode.includes('b="1"') || rNode.includes('typeface="Roboto Bold"');
                                            const isItalic = rNode.includes('i="1"');
                                            const isUnderline = rNode.includes('u="sng"');
                                            const szMatch = rNode.match(/sz="(\d+)"/);
                                            const szPt = szMatch ? parseInt(szMatch[1], 10) / 100 : 16;

                                            const fontMatch = rNode.match(/typeface="([^"]+)"/);
                                            let fontFamily = "'Roboto', -apple-system, BlinkMacSystemFont, sans-serif";
                                            let textTransform = '';
                                            let letterSpacing = 'normal';

                                            if (fontMatch) {
                                                const fn = fontMatch[1];
                                                if (fn === 'Anton') {
                                                    fontFamily = "'Anton', 'Impact', sans-serif";
                                                    textTransform = 'text-transform: uppercase;';
                                                    letterSpacing = 'letter-spacing: 0.5px;';
                                                } else if (fn === 'Courier New') {
                                                    fontFamily = "'Courier New', Courier, monospace";
                                                } else if (fn === 'Arial') {
                                                    fontFamily = "Arial, Helvetica, sans-serif";
                                                } else if (fn.includes('Montserrat')) {
                                                    fontFamily = "'Montserrat', sans-serif";
                                                }
                                            }

                                            const clrMatch = rNode.match(/<a:srgbClr\s+val="([A-Fa-f0-9]{6})"/);
                                            let color = defaultTextColor;
                                            if (clrMatch) {
                                                color = '#' + clrMatch[1];
                                            } else if (rNode.includes('val="tx1"') || rNode.includes('val="dk1"')) {
                                                color = slideIsDark ? '#FFFFFF' : '#0F172A';
                                            } else if (rNode.includes('val="bg1"') || rNode.includes('val="lt1"')) {
                                                color = slideIsDark ? '#CBD5E1' : '#FFFFFF';
                                            }

                                            const effectiveBg = shapeBg || (slideIsDark ? '#000000' : '#FFFFFF');
                                            const bgIsDark = isHexDark(effectiveBg);
                                            if (bgIsDark && isHexDark(color)) {
                                                color = '#CBD5E1';
                                            } else if (!bgIsDark && !isHexDark(color)) {
                                                color = '#0F172A';
                                            }

                                            const slideWidthPt = (slideWidth && slideWidth > 100000) ? (slideWidth / 12700) : 720;
                                            const fontSizeCqw = ((szPt / slideWidthPt) * 100).toFixed(3);

                                            runs.push({
                                                text: rawText,
                                                isBold,
                                                isItalic,
                                                isUnderline,
                                                color,
                                                fontSizeCqw,
                                                fontFamily,
                                                textTransform,
                                                letterSpacing
                                            });
                                        }
                                    }
                                });

                                if (runs.length > 0) {
                                    const fullPText = runs.map(r => r.text).join('').trim();
                                    if (!titleFound && fullPText.length > 0) {
                                        slideTitle = fullPText;
                                        titleFound = true;
                                    }
                                    paragraphs.push({ align, runs });
                                }
                            });

                            if (paragraphs.length > 0) {
                                elements.push({
                                    type: 'textbox',
                                    paragraphs,
                                    left, top, width, height
                                });
                            } else if (shapeBg) {
                                elements.push({
                                    type: 'shape',
                                    shapeBg,
                                    left, top, width, height
                                });
                            }
                        });

                        slides.push({
                            slideNumber: slideNum,
                            title: slideTitle,
                            bgColor,
                            bgImage,
                            aspectRatio: (slideWidth / slideHeight) || (16 / 9),
                            elements
                        });
                    }

                    let activeSlide = 0;
                    let viewMode = 'visual';

                    function buildSlideCanvasHtml(sl) {
                        const bgStyle = sl.bgImage
                            ? `background: url('${sl.bgImage}') center/cover no-repeat;`
                            : `background-color: ${sl.bgColor};`;

                        let elementsHtml = '';
                        sl.elements.forEach(el => {
                            if (el.type === 'image') {
                                elementsHtml += `
                                    <div style="position: absolute; left: ${el.left.toFixed(2)}%; top: ${el.top.toFixed(2)}%; width: ${el.width.toFixed(2)}%; height: ${el.height.toFixed(2)}%; z-index: 2; pointer-events: none;">
                                        <img src="${el.url}" alt="graphic" style="width: 100%; height: 100%; object-fit: contain;">
                                    </div>
                                `;
                            } else if (el.type === 'shape') {
                                elementsHtml += `
                                    <div style="position: absolute; left: ${el.left.toFixed(2)}%; top: ${el.top.toFixed(2)}%; width: ${el.width.toFixed(2)}%; height: ${el.height.toFixed(2)}%; background-color: ${el.shapeBg}; border-radius: 6px; z-index: 1;"></div>
                                `;
                            } else if (el.type === 'textbox') {
                                elementsHtml += `<div style="position: absolute; left: ${el.left.toFixed(2)}%; top: ${el.top.toFixed(2)}%; width: ${el.width.toFixed(2)}%; min-height: ${el.height.toFixed(2)}%; z-index: 3; box-sizing: border-box; padding: 2px 4px; overflow: hidden; word-break: break-word;">`;
                                el.paragraphs.forEach(p => {
                                    elementsHtml += `<div style="text-align: ${p.align}; margin-bottom: 2px; line-height: 1.15;">`;
                                    p.runs.forEach(r => {
                                        if (r.isBr) {
                                            elementsHtml += '<br>';
                                        } else {
                                            const styles = [
                                                `color: ${r.color};`,
                                                `font-family: ${r.fontFamily};`,
                                                `font-size: clamp(8px, ${r.fontSizeCqw}cqw, 54px);`,
                                                r.isBold ? 'font-weight: 700;' : 'font-weight: 400;',
                                                r.isItalic ? 'font-style: italic;' : '',
                                                r.isUnderline ? 'text-decoration: underline;' : '',
                                                r.textTransform || '',
                                                r.letterSpacing ? `letter-spacing: ${r.letterSpacing};` : ''
                                            ].filter(Boolean).join(' ');

                                            elementsHtml += `<span style="${styles}">${escapeHtml(r.text)}</span>`;
                                        }
                                    });
                                    elementsHtml += `</div>`;
                                });
                                elementsHtml += `</div>`;
                            }
                        });

                        return `
                            <div class="pptx-slide-canvas-box" style="container-type: inline-size; aspect-ratio: ${sl.aspectRatio}; ${bgStyle}">
                                ${elementsHtml}
                            </div>
                        `;
                    }

                    function buildOutlineHtml() {
                        return `
                            <div class="w-100 p-4 bg-dark bg-opacity-75 rounded-3 border border-secondary text-white overflow-y-auto" style="max-width: 960px; max-height: 80vh;">
                                <div class="d-flex justify-content-between align-items-center mb-4 pb-3 border-bottom border-secondary">
                                    <h4 class="fw-bold text-white mb-0"><i class="bi bi-list-columns-reverse text-warning me-2"></i> Presentation Content Outline</h4>
                                    <span class="badge bg-primary fs-7">${slides.length} Slides</span>
                                </div>
                                <div class="d-flex flex-column gap-4">
                                    ${slides.map(sl => {
                                        const textBlocks = [];
                                        sl.elements.forEach(el => {
                                            if (el.paragraphs) {
                                                el.paragraphs.forEach(p => {
                                                    const txt = p.runs.map(r => r.text).join('').trim();
                                                    if (txt) textBlocks.push(txt);
                                                });
                                            }
                                        });
                                        return `
                                            <div class="p-3 bg-black bg-opacity-40 rounded-3 border border-secondary">
                                                <div class="d-flex align-items-center gap-2 mb-2">
                                                    <span class="badge bg-warning text-dark fw-bold">Slide ${sl.slideNumber}</span>
                                                    <span class="fw-bold text-light">${escapeHtml(sl.title)}</span>
                                                </div>
                                                <div class="ps-3 border-start border-warning border-2 ms-1 mt-2 d-flex flex-column gap-1">
                                                    ${textBlocks.map(tb => `<div class="text-white-75 small lh-base">${escapeHtml(tb)}</div>`).join('')}
                                                </div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        `;
                    }

                    function renderPresentation() {
                        const s = slides[activeSlide];
                        stageEl.innerHTML = `
                            <div class="pptx-viewer-container">
                                <!-- Left Sidebar Slide Thumbnails -->
                                <div class="pptx-sidebar">
                                    <div class="small fw-bold text-white-50 px-2 py-1 text-uppercase tracking-wider">
                                        Slides (${slides.length})
                                    </div>
                                    ${slides.map((sl, sIdx) => `
                                        <div class="pptx-thumbnail ${sIdx === activeSlide && viewMode === 'visual' ? 'active' : ''}" data-sidx="${sIdx}">
                                            <div class="d-flex justify-content-between align-items-center mb-1">
                                                <span class="badge bg-secondary bg-opacity-50 text-white">${sl.slideNumber}</span>
                                            </div>
                                            <div class="small fw-bold text-truncate text-white">${escapeHtml(sl.title)}</div>
                                            <div class="micro-text text-white-50 text-truncate mt-1">${sl.elements.length} visual asset(s)</div>
                                        </div>
                                    `).join('')}
                                </div>

                                <!-- Main Slide Stage -->
                                <div class="pptx-main-slide-stage">
                                    <div class="w-100 d-flex justify-content-center align-items-center flex-grow-1">
                                        ${viewMode === 'visual' ? buildSlideCanvasHtml(s) : buildOutlineHtml()}
                                    </div>

                                    <!-- Bottom Navigation Bar -->
                                    <div class="pptx-bottom-toolbar flex-wrap gap-1.5 py-1.5">
                                        <button type="button" class="btn btn-sm btn-dark rounded-circle p-2 d-flex align-items-center justify-content-center text-white" id="pptxPrevBtn" ${activeSlide === 0 ? 'disabled' : ''} title="Previous Slide">
                                            <i class="bi bi-chevron-left"></i>
                                        </button>
                                        <span class="fw-bold text-white small px-2">
                                            Slide ${activeSlide + 1} of ${slides.length}
                                        </span>
                                        <button type="button" class="btn btn-sm btn-dark rounded-circle p-2 d-flex align-items-center justify-content-center text-white" id="pptxNextBtn" ${activeSlide === slides.length - 1 ? 'disabled' : ''} title="Next Slide">
                                            <i class="bi bi-chevron-right"></i>
                                        </button>
                                        <div class="vr bg-secondary my-1 d-none d-sm-block"></div>
                                        <button type="button" class="btn btn-sm ${viewMode === 'visual' ? 'btn-primary' : 'btn-outline-light'} rounded-pill px-3 py-1 fs-8 fw-semibold" id="pptxToggleVisualBtn">
                                            <i class="bi bi-file-slides me-1"></i> Slide Design
                                        </button>
                                        <button type="button" class="btn btn-sm ${viewMode === 'outline' ? 'btn-primary' : 'btn-outline-light'} rounded-pill px-3 py-1 fs-8 fw-semibold" id="pptxToggleOutlineBtn">
                                            <i class="bi bi-list-columns-reverse me-1"></i> Content Outline
                                        </button>
                                        <div class="vr bg-secondary my-1 d-none d-sm-block"></div>
                                        <button type="button" class="btn btn-sm btn-outline-info rounded-pill px-3 py-1 fs-8 fw-semibold" id="pptxOfficeOnlineBtn" title="View with official Microsoft Office PowerPoint engine">
                                            <i class="bi bi-microsoft me-1"></i> Office 365 View
                                        </button>
                                        <button type="button" class="btn btn-sm btn-outline-warning rounded-pill px-3 py-1 fs-8 fw-semibold" id="pptxGoogleSlidesBtn" title="View with Google Docs / Slides">
                                            <i class="bi bi-google me-1"></i> Google Slides
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;

                        if (modeSwitcherEl) {
                            modeSwitcherEl.innerHTML = `
                                <button type="button" class="btn btn-sm btn-outline-info rounded-pill px-2.5 py-0.5 border-0 fw-semibold fs-8" id="modeOfficeTopBtn" title="View with Microsoft Office Online">
                                    <i class="bi bi-microsoft me-1"></i> Office 365
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-warning rounded-pill px-2.5 py-0.5 border-0 fw-semibold fs-8" id="modeGoogleTopBtn" title="View with Google Docs">
                                    <i class="bi bi-google me-1"></i> Google Slides
                                </button>
                            `;
                            document.getElementById('modeOfficeTopBtn')?.addEventListener('click', () => openOnlineEmbed('office'));
                            document.getElementById('modeGoogleTopBtn')?.addEventListener('click', () => openOnlineEmbed('google'));
                        }

                        stageEl.querySelectorAll('.pptx-thumbnail').forEach(th => {
                            th.addEventListener('click', () => {
                                activeSlide = parseInt(th.dataset.sidx, 10);
                                viewMode = 'visual';
                                renderPresentation();
                            });
                        });

                        document.getElementById('pptxPrevBtn')?.addEventListener('click', () => {
                            if (activeSlide > 0) {
                                activeSlide--;
                                renderPresentation();
                            }
                        });
                        document.getElementById('pptxNextBtn')?.addEventListener('click', () => {
                            if (activeSlide < slides.length - 1) {
                                activeSlide++;
                                renderPresentation();
                            }
                        });
                        document.getElementById('pptxToggleVisualBtn')?.addEventListener('click', () => {
                            viewMode = 'visual';
                            renderPresentation();
                        });
                        document.getElementById('pptxToggleOutlineBtn')?.addEventListener('click', () => {
                            viewMode = 'outline';
                            renderPresentation();
                        });
                        document.getElementById('pptxOfficeOnlineBtn')?.addEventListener('click', () => {
                            openOnlineEmbed('office');
                        });
                        document.getElementById('pptxGoogleSlidesBtn')?.addEventListener('click', () => {
                            openOnlineEmbed('google');
                        });
                    }

                    renderPresentation();

                } catch (err) {
                    console.error('Error rendering PPTX presentation:', err);
                    stageEl.innerHTML = `
                        <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 500px;">
                            <i class="bi bi-file-earmark-slides text-warning" style="font-size: 5rem;"></i>
                            <h4 class="fw-bold text-white mt-3">${escapeHtml(fileName)}</h4>
                            <p class="text-white-50 mb-4">Click download below to view this presentation in Microsoft Office or Google Slides.</p>
                            <a href="${presUrl || activeUrl}" download="${escapeHtml(presFileName || fileName)}" class="btn btn-primary btn-lg rounded-pill px-5 fw-bold">
                                <i class="bi bi-download me-2"></i> Download Presentation
                            </a>
                        </div>
                    `;
                }
            }, 30);
        }

        // ==========================================
        // 3. WORD DOCUMENTS (.docx, .doc)
        // ==========================================
        if (ext === 'docx' || ext === 'doc') {
            stageEl.innerHTML = `
                <div class="docx-viewer-wrapper">
                    <div id="docxPreviewHost" class="docx-preview-host"></div>
                </div>
            `;
            const host = document.getElementById('docxPreviewHost');

            function paginateDocxContainer(hostEl) {
                if (!hostEl) return;
                const sections = Array.from(hostEl.querySelectorAll('section.docx, .docx-wrapper > section, .docx-paper-sheet'));
                if (!sections.length) return;

                const TARGET_PAGE_HEIGHT = 1056; // Standard 8.5" x 11" Letter page height at 96 DPI
                const PAGE_PADDING_V = 136; // Top (64px) + bottom (64px) padding + margin allowance
                const USABLE_HEIGHT = TARGET_PAGE_HEIGHT - PAGE_PADDING_V; // ~920px

                sections.forEach(sec => {
                    if (sec.classList.contains('docx-paginated-done')) return;

                    // If section is already within 1 page height, attach page badge
                    if (sec.offsetHeight <= TARGET_PAGE_HEIGHT + 60) {
                        if (!sec.querySelector('.docx-page-footer-badge')) {
                            const footer = document.createElement('div');
                            footer.className = 'docx-page-footer-badge';
                            footer.innerHTML = '<span class="docx-page-num-badge">Page 1 of 1</span>';
                            sec.appendChild(footer);
                        }
                        sec.classList.add('docx-paginated-done');
                        return;
                    }

                    const rawChildren = Array.from(sec.children).filter(c => 
                        c.tagName !== 'HEADER' && 
                        c.tagName !== 'FOOTER' && 
                        !c.classList.contains('docx-page-footer-badge')
                    );
                    if (rawChildren.length <= 1) return;

                    const pages = [];
                    let curPageChildren = [];
                    let accumulatedH = 0;

                    rawChildren.forEach(child => {
                        const h = child.offsetHeight || 30;
                        if (accumulatedH + h > USABLE_HEIGHT && curPageChildren.length > 0) {
                            pages.push(curPageChildren);
                            curPageChildren = [child];
                            accumulatedH = h;
                        } else {
                            curPageChildren.push(child);
                            accumulatedH += h;
                        }
                    });
                    if (curPageChildren.length > 0) {
                        pages.push(curPageChildren);
                    }

                    if (pages.length <= 1) return;

                    const parent = sec.parentNode;
                    const totalPages = pages.length;

                    pages.forEach((pageChildren, pageIdx) => {
                        const pageSec = document.createElement('section');
                        pageSec.className = `${sec.className} docx-paginated-done`;
                        if (sec.style.cssText) pageSec.style.cssText = sec.style.cssText;
                        pageSec.style.minHeight = `${TARGET_PAGE_HEIGHT}px`;
                        pageSec.style.marginBottom = '32px';
                        pageSec.style.position = 'relative';

                        pageChildren.forEach(c => pageSec.appendChild(c));

                        const pageFooter = document.createElement('div');
                        pageFooter.className = 'docx-page-footer-badge';
                        pageFooter.innerHTML = `<span class="docx-page-num-badge">Page ${pageIdx + 1} of ${totalPages}</span>`;
                        pageSec.appendChild(pageFooter);

                        parent.insertBefore(pageSec, sec);
                    });

                    parent.removeChild(sec);
                });
            }

            async function postProcessDocxMediaAndShapes(arrayBuf, hostEl) {
                if (!arrayBuf || !hostEl || !window.JSZip) return;
                try {
                    const zip = await window.JSZip.loadAsync(arrayBuf);
                    const allFiles = Object.keys(zip.files);
                    const allMediaFiles = allFiles.filter(f => /^word\/media\/.+\.(png|jpe?g|gif|webp|svg)$/i.test(f));
                    const renderedImgs = Array.from(hostEl.querySelectorAll('img'));

                    // Detect native Word vector shapes/SmartArt
                    let hasShapesOrSmartArt = false;
                    if (allFiles.some(f => /^word\/diagrams\//i.test(f))) {
                        hasShapesOrSmartArt = true;
                    }
                    const docXml = await zip.file('word/document.xml')?.async('string');
                    if (docXml && (docXml.includes('wps:wsp') || docXml.includes('wpg:wgp') || docXml.includes('v:shape') || docXml.includes('wpc:wpc') || docXml.includes('dgm:'))) {
                        hasShapesOrSmartArt = true;
                    }

                    // Only restore media if docx-preview missed embedded images (e.g. inside shapes/SmartArt)
                    const needsMediaRestoration = allMediaFiles.length > 0 && renderedImgs.length < allMediaFiles.length;

                    if (needsMediaRestoration) {
                        const renderedSrcs = renderedImgs.map(img => img.src || '');
                        const restoredMediaFiles = new Set();

                        const isFileAlreadyRendered = async (fileObj) => {
                            if (!fileObj) return true;
                            if (renderedImgs.length === 0) return false;
                            try {
                                const b64 = await fileObj.async('base64');
                                const sig = b64.slice(0, 48);
                                return renderedSrcs.some(src => src.includes(sig));
                            } catch (e) {
                                return false;
                            }
                        };

                        // 1. Parse document relationships to map rId -> target media
                        const relsStr = await zip.file('word/_rels/document.xml.rels')?.async('string');
                        const relMap = {};
                        if (relsStr) {
                            const relRegex = /<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"/gi;
                            let rm;
                            while ((rm = relRegex.exec(relsStr)) !== null) {
                                relMap[rm[1]] = rm[2].replace(/^\/?word\//i, '').replace(/^media\//i, 'media/');
                            }
                        }

                        // 2. Parse document.xml to find exact placement and preceding text for each image
                        const imagePlacements = [];
                        if (docXml) {
                            const pRegex = /<w:p(?: [^>]*)?>([\s\S]*?)<\/w:p>/gi;
                            let pm;
                            let pIdx = 0;
                            let lastText = '';

                            while ((pm = pRegex.exec(docXml)) !== null) {
                                const pContent = pm[1];
                                const tMatches = [...pContent.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/gi)];
                                const text = tMatches.map(m => m[1]).join('').trim();
                                if (text) {
                                    lastText = text;
                                }

                                const idMatches = [...pContent.matchAll(/(?:embed|id)="([^"]+)"/gi)];
                                for (const im of idMatches) {
                                    const rId = im[1];
                                    const target = relMap[rId];
                                    if (target && /^media\//i.test(target)) {
                                        imagePlacements.push({
                                            rId,
                                            mediaPath: 'word/' + target,
                                            fileName: target.split('/').pop(),
                                            pIndex: pIdx,
                                            precedingText: lastText
                                        });
                                    }
                                }
                                pIdx++;
                            }
                        }

                        // 3. Extract and place missing images in the EXACT DOM location
                        const section = hostEl.querySelector('section.docx, .docx-paper-sheet') || hostEl;
                        const emptyDrawingContainers = Array.from(
                            hostEl.querySelectorAll('div[style*="inline-block"], div[style*="position: relative"], div[style*="width: 0px"], div[style*="height: 0px"]')
                        ).filter(el => !el.querySelector('img') && !el.querySelector('svg') && !el.querySelector('table') && !el.innerText.trim());

                        const domParas = Array.from(section.querySelectorAll('p, h1, h2, h3, h4, h5, h6'));

                        for (let i = 0; i < imagePlacements.length; i++) {
                            const placement = imagePlacements[i];
                            if (restoredMediaFiles.has(placement.fileName)) continue;

                            const file = zip.file(placement.mediaPath) || zip.file(new RegExp(placement.fileName + '$', 'i'))[0];
                            if (!file) continue;

                            // Skip if already rendered natively by docx-preview
                            if (await isFileAlreadyRendered(file)) {
                                restoredMediaFiles.add(placement.fileName);
                                continue;
                            }

                            const blob = await file.async('blob');
                            const blobUrl = URL.createObjectURL(blob);

                            const imgEl = document.createElement('img');
                            imgEl.src = blobUrl;
                            imgEl.alt = placement.fileName || 'Document Diagram';
                            imgEl.className = 'docx-restored-img img-fluid';
                            imgEl.style.maxWidth = '100%';
                            imgEl.style.height = 'auto';
                            imgEl.style.display = 'block';
                            imgEl.style.margin = '16px auto';
                            imgEl.style.objectFit = 'contain';

                            let placed = false;

                            // Strategy A: If docx-preview created an empty drawing container at this spot
                            if (emptyDrawingContainers.length > 0) {
                                const emptyBox = emptyDrawingContainers.shift();
                                emptyBox.style.width = 'auto';
                                emptyBox.style.height = 'auto';
                                emptyBox.style.minHeight = '60px';
                                emptyBox.style.display = 'block';
                                emptyBox.style.position = 'relative';
                                emptyBox.style.textAlign = 'center';
                                emptyBox.style.margin = '16px auto';
                                emptyBox.appendChild(imgEl);
                                placed = true;
                            }

                            // Strategy B: Match by preceding paragraph text (e.g. "Diagram")
                            if (!placed && placement.precedingText) {
                                const matchedEl = domParas.find(el => {
                                    const txt = el.innerText.trim();
                                    return txt && (txt === placement.precedingText || txt.includes(placement.precedingText) || placement.precedingText.includes(txt));
                                });
                                if (matchedEl && matchedEl.parentNode) {
                                    const pWrapper = document.createElement('div');
                                    pWrapper.className = 'docx-img-placement text-center my-3';
                                    pWrapper.appendChild(imgEl);
                                    matchedEl.parentNode.insertBefore(pWrapper, matchedEl.nextSibling);
                                    placed = true;
                                }
                            }

                            // Strategy C: Match by paragraph index
                            if (!placed && domParas[placement.pIndex]) {
                                const targetPara = domParas[placement.pIndex];
                                if (targetPara && targetPara.parentNode) {
                                    const pWrapper = document.createElement('div');
                                    pWrapper.className = 'docx-img-placement text-center my-3';
                                    pWrapper.appendChild(imgEl);
                                    targetPara.parentNode.insertBefore(pWrapper, targetPara);
                                    placed = true;
                                }
                            }

                            // Strategy D: Fallback to section
                            if (!placed) {
                                const pWrapper = document.createElement('div');
                                pWrapper.className = 'docx-img-placement text-center my-3';
                                pWrapper.appendChild(imgEl);
                                section.appendChild(pWrapper);
                            }

                            restoredMediaFiles.add(placement.fileName);
                            renderedSrcs.push(blobUrl);
                        }

                        // Also check any unmapped media in word/media/
                        for (const mf of allMediaFiles) {
                            const fileName = mf.split('/').pop();
                            if (restoredMediaFiles.has(fileName)) continue;

                            const file = zip.file(mf);
                            if (!file) continue;
                            if (await isFileAlreadyRendered(file)) {
                                restoredMediaFiles.add(fileName);
                                continue;
                            }

                            try {
                                const b = await file.async('blob');
                                const u = URL.createObjectURL(b);
                                const fallbackImg = document.createElement('img');
                                fallbackImg.src = u;
                                fallbackImg.alt = fileName;
                                fallbackImg.className = 'docx-restored-img img-fluid d-block mx-auto my-3';
                                fallbackImg.style.maxWidth = '100%';
                                fallbackImg.style.height = 'auto';
                                fallbackImg.style.objectFit = 'contain';

                                if (emptyDrawingContainers.length > 0) {
                                    const box = emptyDrawingContainers.shift();
                                    box.style.width = 'auto';
                                    box.style.height = 'auto';
                                    box.appendChild(fallbackImg);
                                } else {
                                    section.appendChild(fallbackImg);
                                }
                                restoredMediaFiles.add(fileName);
                                renderedSrcs.push(u);
                            } catch (e) {}
                        }
                    }

                    // Wait for all images to decode so paginateDocxContainer knows true pixel heights
                    const allImgs = Array.from(hostEl.querySelectorAll('img'));
                    await Promise.all(allImgs.map(img => img.decode ? img.decode().catch(() => {}) : Promise.resolve()));

                    // Native Word vector shapes banner if applicable
                    if (hasShapesOrSmartArt) {
                        const firstSec = hostEl.querySelector('section.docx, .docx-paper-sheet') || hostEl;
                        if (!firstSec.querySelector('.docx-shape-notice')) {
                            const notice = document.createElement('div');
                            notice.className = 'docx-shape-notice alert alert-info py-2 px-3 mb-3 border-0 rounded-3 d-flex align-items-center justify-content-between gap-2 shadow-sm';
                            notice.style.fontSize = '0.8rem';
                            notice.innerHTML = `
                                <div class="d-flex align-items-center gap-2">
                                    <i class="bi bi-info-circle-fill text-info fs-6"></i>
                                    <span>This document contains native Word vector shapes/diagrams. Click <strong>Office 365</strong> above to view full shapes and animations.</span>
                                </div>
                                <button type="button" class="btn btn-xs btn-info text-white rounded-pill px-2.5 py-0.5 fw-semibold" id="noticeOpenOfficeBtn" style="font-size: 0.75rem; white-space: nowrap;">
                                    <i class="bi bi-microsoft me-1"></i> Open Office 365
                                </button>
                            `;
                            firstSec.insertBefore(notice, firstSec.firstChild);
                            notice.querySelector('#noticeOpenOfficeBtn')?.addEventListener('click', () => openOnlineEmbed('office'));
                        }
                    }
                } catch (zipErr) {
                    console.warn('Exact docx media placement notice:', zipErr);
                }
            }

            if (modeSwitcherEl) {
                modeSwitcherEl.innerHTML = `
                    <button type="button" class="btn btn-sm btn-dark text-white rounded-pill px-2.5 py-0.5 border-0" id="docxZoomOutBtn" title="Zoom out">
                        <i class="bi bi-zoom-out"></i>
                    </button>
                    <span class="micro-text text-white-50 px-1 fw-semibold" id="docxZoomVal">100%</span>
                    <button type="button" class="btn btn-sm btn-dark text-white rounded-pill px-2.5 py-0.5 border-0" id="docxZoomInBtn" title="Zoom in">
                        <i class="bi bi-zoom-in"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-light rounded-pill px-2.5 py-0.5 ms-1 border-opacity-50" id="docxFitBtn" title="Reset zoom">
                        Fit
                    </button>
                    <div class="vr bg-secondary my-1 d-none d-sm-block"></div>
                    <button type="button" class="btn btn-sm btn-outline-info rounded-pill px-2.5 py-0.5 border-0 fw-semibold fs-8" id="docxOfficeOnlineBtn" title="View with Microsoft Word Online">
                        <i class="bi bi-microsoft me-1"></i> Office 365
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-warning rounded-pill px-2.5 py-0.5 border-0 fw-semibold fs-8" id="docxGoogleDocsBtn" title="View with Google Docs">
                        <i class="bi bi-google me-1"></i> Google Docs
                    </button>
                `;
                let currentZoom = 1.0;
                const updateZoom = (z) => {
                    currentZoom = Math.min(Math.max(0.5, Math.round(z * 100) / 100), 2.0);
                    const zoomValEl = document.getElementById('docxZoomVal');
                    if (zoomValEl) zoomValEl.textContent = `${Math.round(currentZoom * 100)}%`;
                    if (host) {
                        host.style.transform = `scale(${currentZoom})`;
                        host.style.transformOrigin = 'top center';
                    }
                };
                document.getElementById('docxZoomOutBtn')?.addEventListener('click', () => updateZoom(currentZoom - 0.15));
                document.getElementById('docxZoomInBtn')?.addEventListener('click', () => updateZoom(currentZoom + 0.15));
                document.getElementById('docxFitBtn')?.addEventListener('click', () => updateZoom(1.0));
                document.getElementById('docxOfficeOnlineBtn')?.addEventListener('click', () => openOnlineEmbed('office'));
                document.getElementById('docxGoogleDocsBtn')?.addEventListener('click', () => openOnlineEmbed('google'));
            }

            if (ext === 'docx' && window.docx && typeof window.docx.renderAsync === 'function' && fileData.arrayBuffer) {
                try {
                    await window.docx.renderAsync(fileData.arrayBuffer, host, null, {
                        className: 'docx',
                        inWrapper: true,
                        ignoreWidth: false,
                        ignoreHeight: false,
                        ignoreFonts: false,
                        breakPages: true,
                        ignoreLastRenderedPageBreak: false,
                        useBase64URL: true,
                        renderHeaders: true,
                        renderFooters: true,
                        renderFootnotes: true,
                        renderEndnotes: true
                    });
                    await postProcessDocxMediaAndShapes(fileData.arrayBuffer, host);
                    paginateDocxContainer(host);
                    setTimeout(() => paginateDocxContainer(host), 60);
                    return;
                } catch (docxErr) {
                    console.warn('docx-preview notice, trying mammoth fallback:', docxErr);
                }
            }

            if (window.mammoth && fileData.arrayBuffer) {
                try {
                    const result = await window.mammoth.convertToHtml({ arrayBuffer: fileData.arrayBuffer });
                    host.innerHTML = `
                        <div class="docx-paper-sheet">
                            ${result.value || '<p class="text-muted fst-italic">Empty Document.</p>'}
                        </div>
                    `;
                    await postProcessDocxMediaAndShapes(fileData.arrayBuffer, host);
                    paginateDocxContainer(host);
                    setTimeout(() => paginateDocxContainer(host), 60);
                    return;
                } catch (mErr) {
                    console.warn('mammoth error:', mErr);
                }
            }

            stageEl.innerHTML = `
                <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 500px;">
                    <i class="bi bi-file-earmark-word text-primary" style="font-size: 5rem;"></i>
                    <h4 class="fw-bold text-white mt-3">${escapeHtml(fileName)}</h4>
                    <p class="text-white-50 mb-4">Click download below to view this document in Microsoft Word.</p>
                    <a href="${activeUrl}" download="${escapeHtml(fileName)}" class="btn btn-primary btn-lg rounded-pill px-5 fw-bold">
                        <i class="bi bi-download me-2"></i> Download Document
                    </a>
                </div>
            `;
            return;
        }

        // ==========================================
        // 4. SPREADSHEETS (.xlsx, .xls, .csv)
        // ==========================================
        if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
            if (window.XLSX && fileData.arrayBuffer) {
                try {
                    const wb = window.XLSX.read(fileData.arrayBuffer, { type: 'array' });
                    const sheetNames = wb.SheetNames || [];
                    if (sheetNames.length === 0) throw new Error('No sheets found in workbook.');

                    function renderSheetView(sIdx) {
                        const sName = sheetNames[sIdx];
                        const ws = wb.Sheets[sName];
                        const htmlTable = window.XLSX.utils.sheet_to_html(ws, { editable: false });

                        stageEl.innerHTML = `
                            <div class="spreadsheet-viewer-wrapper">
                                <div class="spreadsheet-tabs-bar">
                                    <span class="fw-bold text-dark small me-2"><i class="bi bi-file-earmark-spreadsheet text-success me-1"></i>Sheets:</span>
                                    ${sheetNames.map((name, i) => `
                                        <button type="button" class="btn btn-sm ${i === sIdx ? 'btn-success text-white fw-bold' : 'btn-outline-secondary'} rounded-pill px-3 py-1 small sheet-tab-btn" data-sidx="${i}">
                                            <i class="bi bi-table me-1"></i>${escapeHtml(name)}
                                        </button>
                                    `).join('')}
                                </div>
                                <div class="spreadsheet-content-stage">
                                    ${htmlTable}
                                </div>
                            </div>
                        `;

                        stageEl.querySelectorAll('.sheet-tab-btn').forEach(btn => {
                            btn.addEventListener('click', () => {
                                const idx = parseInt(btn.dataset.sidx, 10);
                                renderSheetView(idx);
                            });
                        });
                    }

                    renderSheetView(0);
                    return;
                } catch (xlsxErr) {
                    console.error('SheetJS parse error:', xlsxErr);
                }
            }

            stageEl.innerHTML = `
                <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 500px;">
                    <i class="bi bi-file-earmark-excel text-success" style="font-size: 5rem;"></i>
                    <h4 class="fw-bold text-white mt-3">${escapeHtml(fileName)}</h4>
                    <p class="text-white-50 mb-4">Click download below to access and open this spreadsheet.</p>
                    <a href="${activeUrl}" download="${escapeHtml(fileName)}" class="btn btn-primary btn-lg rounded-pill px-5 fw-bold">
                        <i class="bi bi-download me-2"></i> Download File
                    </a>
                </div>
            `;
            return;
        }

        // ==========================================
        // 5. IMAGES (PNG, JPG, SVG, WEBP, GIF)
        // ==========================================
        if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext) || mime.startsWith('image/')) {
            stageEl.innerHTML = `
                <div class="d-flex align-items-center justify-content-center w-100 h-100 p-4" style="background-color: #0b0c0e;">
                    <img src="${activeUrl}" alt="${escapeHtml(fileName)}" class="img-fluid rounded shadow-lg" style="max-height: 90vh; max-width: 95vw; object-fit: contain;">
                </div>
            `;
            return;
        }

        // ==========================================
        // 6. VIDEO (MP4, WEBM, OGG)
        // ==========================================
        if (['mp4', 'webm', 'ogg'].includes(ext) || mime.startsWith('video/')) {
            stageEl.innerHTML = `
                <div class="media-viewer-stage">
                    <video controls autoplay playsinline class="rounded shadow-lg" src="${activeUrl}">
                        <source src="${activeUrl}" type="${mime || 'video/mp4'}">
                        Your browser does not support video playback.
                    </video>
                </div>
            `;
            const vid = stageEl.querySelector('video');
            if (vid) {
                vid.play().catch(e => console.log('Autoplay requires user interaction:', e));
            }
            return;
        }

        // ==========================================
        // 7. AUDIO (MP3, WAV, OGG, M4A)
        // ==========================================
        if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext) || mime.startsWith('audio/')) {
            stageEl.innerHTML = `
                <div class="d-flex align-items-center justify-content-center w-100 h-100 text-white p-4">
                    <div class="audio-viewer-card">
                        <i class="bi bi-music-note-beamed text-primary fs-1 mb-3 d-block"></i>
                        <h5 class="fw-bold text-white mb-2 text-truncate">${escapeHtml(fileName)}</h5>
                        <p class="text-white-50 small mb-4">${escapeHtml(displaySubtitle || 'Audio Playback')}</p>
                        <audio controls autoplay class="w-100" src="${activeUrl}">
                            <source src="${activeUrl}" type="${mime || 'audio/mpeg'}">
                            Your browser does not support audio playback.
                        </audio>
                    </div>
                </div>
            `;
            const aud = stageEl.querySelector('audio');
            if (aud) {
                aud.play().catch(e => console.log('Autoplay deferred:', e));
            }
            return;
        }

        // ==========================================
        // 8. TEXT & CODE (TXT, JSON, LOG, MD, HTML, JS, CSS, XML)
        // ==========================================
        if (['txt', 'json', 'log', 'md', 'html', 'js', 'css', 'xml'].includes(ext) || mime.startsWith('text/')) {
            let textContent = '';
            try {
                if (fileData.blob) {
                    textContent = await fileData.blob.text();
                } else if (fileData.arrayBuffer) {
                    textContent = new TextDecoder().decode(fileData.arrayBuffer);
                }
            } catch (e) { }

            stageEl.innerHTML = `
                <div class="docx-paper-container">
                    <div class="docx-page-card font-monospace" style="white-space: pre-wrap; font-size: 0.95rem; color: #1e293b;">
                        ${escapeHtml(textContent || 'Empty file.')}
                    </div>
                </div>
            `;
            return;
        }

        // ==========================================
        // 9. GENERIC DOWNLOAD FALLBACK
        // ==========================================
        stageEl.innerHTML = `
            <div class="p-5 text-center text-white mx-auto my-auto" style="max-width: 500px;">
                <i class="bi bi-file-earmark-arrow-down text-info" style="font-size: 5rem;"></i>
                <h4 class="fw-bold text-white mt-3">${escapeHtml(fileName)}</h4>
                <p class="text-white-50 mb-4">Click download below to save and open this file on your device.</p>
                <a href="${activeUrl}" download="${escapeHtml(fileName)}" class="btn btn-primary btn-lg rounded-pill px-5 fw-bold">
                    <i class="bi bi-download me-2"></i> Download File
                </a>
            </div>
        `;
    }

    async function handleExistingFileUploadFormSubmit(event) {
        event.preventDefault();
        const fileInput = document.getElementById('existingFileInput');
        const subject = editingSubjectCopy; // Work on the temporary copy
        const topic = subject?.topics?.[currentTopicIndexForEditing];
        if (!topic || !fileInput.files || fileInput.files.length === 0) return;

        let file = fileInput.files[0];
        file = await optimizePresentationIfEligible(file);
        if (file.size > 25 * 1024 * 1024) { // Max 25MB
            alert(`File "${file.name}" is too large (max 25MB).`);
            return;
        }

        const submitBtn = event.target.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Uploading...';
        }

        try {
            const fileDataUrl = await readFileAsDataURL(file);
            if (!Array.isArray(topic.files)) topic.files = [];
            const fileItem = {
                name: file.name,
                size: file.size,
                dataUrl: fileDataUrl
            };
            topic.files.push(fileItem);
            if (!Array.isArray(topic.resources)) topic.resources = [];
            if (!topic.resources.includes('File')) topic.resources.push('File');
            renderExistingFiles();
            fileInput.value = ''; // Clear input

            // Pre-convert Office documents in background for instant classroom & pre-check viewing
            const ext = (file.name || '').split('.').pop().toLowerCase();
            if (['pptx', 'ppt', 'docx', 'doc'].includes(ext)) {
                const token = localStorage.getItem('mentorae_token');
                if (token) {
                    authedFetch('/api/content/convert-document', token, {
                        method: 'POST',
                        body: JSON.stringify({ fileName: file.name, dataUrl: fileDataUrl })
                    }).then(res => {
                        if (res && res.success && res.pdfDataUrl) {
                            fileItem.pdfDataUrl = res.pdfDataUrl;
                            fileItem.convertedToPdf = true;
                            renderExistingFiles();
                        } else if ((ext === 'pptx' || ext === 'ppt') && window.MentoraePptxToPdf) {
                            window.MentoraePptxToPdf.convert(fileDataUrl).then(pdfUrl => {
                                if (pdfUrl && !fileItem.pdfDataUrl) {
                                    fileItem.pdfDataUrl = pdfUrl;
                                    fileItem.convertedToPdf = true;
                                    renderExistingFiles();
                                }
                            }).catch(err => console.warn('PPTX fallback notice:', err));
                        }
                    }).catch(err => {
                        if ((ext === 'pptx' || ext === 'ppt') && window.MentoraePptxToPdf) {
                            window.MentoraePptxToPdf.convert(fileDataUrl).then(pdfUrl => {
                                if (pdfUrl && !fileItem.pdfDataUrl) {
                                    fileItem.pdfDataUrl = pdfUrl;
                                    fileItem.convertedToPdf = true;
                                    renderExistingFiles();
                                }
                            }).catch(e => console.warn('PPTX fallback notice:', e));
                        }
                    });
                } else if ((ext === 'pptx' || ext === 'ppt') && window.MentoraePptxToPdf) {
                    window.MentoraePptxToPdf.convert(fileDataUrl).then(pdfUrl => {
                        if (pdfUrl && !fileItem.pdfDataUrl) {
                            fileItem.pdfDataUrl = pdfUrl;
                            fileItem.convertedToPdf = true;
                            renderExistingFiles();
                        }
                    }).catch(e => console.warn('PPTX fallback notice:', e));
                }
            }
        } catch (error) {
            console.error("Error reading file:", error);
            alert("There was an error reading the file. Please try again.");
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Upload File';
            }
        }
    }

    function handleExistingFilesContainerClick(event) {
        const deleteBtn = event.target.closest('.delete-existing-file-btn');
        if (deleteBtn) {
            event.preventDefault();
            event.stopPropagation();
            const subject = editingSubjectCopy; // Work on the temporary copy
            const topic = subject?.topics?.[currentTopicIndexForEditing];
            if (!topic || !topic.files) return;

            const index = parseInt(deleteBtn.dataset.index, 10);
            if (confirm(`Are you sure you want to delete "${topic.files[index]?.name || 'this file'}"?`)) {
                topic.files.splice(index, 1);
                renderExistingFiles();
            }
            return;
        }

        const previewTrigger = event.target.closest('.preview-file-trigger, .preview-existing-file-btn');
        if (previewTrigger) {
            event.preventDefault();
            event.stopPropagation();
            const index = parseInt(previewTrigger.dataset.index, 10);
            previewExistingFile(index);
            return;
        }
    }

    // --- Initial Setup ---
    async function init() {
        // Initial load from local storage cache for instant UI rendering
        const storedSubjects = localStorage.getItem(SUBJECTS_STORAGE_KEY);
        if (!storedSubjects) {
            subjects = getInitialData();
            localStorage.setItem(SUBJECTS_STORAGE_KEY, JSON.stringify(subjects));
        } else {
            subjects = loadSubjects();
        }

        const urlParams = new URLSearchParams(window.location.search);

        // Handle back button destination based on URL parameter
        const fromPage = urlParams.get('from');
        const backBtn = document.getElementById('backToDashboardBtn');
        if (backBtn && fromPage === 'analytics') {
            backBtn.href = 'analytics_admin.html';
        }

        // Handle URL parameter for pre-filtering from the analytics page.
        const subjectFromUrl = urlParams.get('subject');
        if (subjectFromUrl && tableSearch) {
            tableSearch.value = subjectFromUrl;
        }

        populateStrandFilter();
        applyFiltersAndSearch(); // Initial render

        // Authoritative load from backend database
        const token = localStorage.getItem('mentorae_token');
        if (token) {
            try {
                const res = await authedFetch('/api/reference/subjects', token);
                if (res && res.success && Array.isArray(res.subjects) && res.subjects.length > 0) {
                    res.subjects.forEach(s => {
                        if (s.topics) sortTopicsAscending(s.topics);
                    });
                    subjects = res.subjects;
                    localStorage.setItem(SUBJECTS_STORAGE_KEY, JSON.stringify(subjects));
                    populateStrandFilter();
                    applyFiltersAndSearch();
                }
            } catch (err) {
                console.warn('Could not fetch subjects from backend:', err);
            }

            // Load institutional grading weights policy from backend
            loadCategoryWeightsPolicy();

            try {
                const secRes = await authedFetch('/api/reference/sections', token);
                if (secRes && secRes.success && Array.isArray(secRes.sections) && secRes.sections.length > 0) {
                    allSectionsList = secRes.sections;
                    updateModalSectionOptions();
                }
            } catch (err) {
                console.warn('Could not fetch sections from backend:', err);
            }
        }

        if (subjectForm) {
            subjectForm.addEventListener('submit', handleFormSubmit);
        }
        function hasUnsavedChanges() {
            const subjectId = document.getElementById('subjectId') ? document.getElementById('subjectId').value : '';
            const currentName = (document.getElementById('subjectName')?.value || '').trim();
            const currentCode = (document.getElementById('subjectCode')?.value || '').trim();
            const currentDesc = (document.getElementById('subjectDescription')?.value || '').trim();
            const currentCategory = document.getElementById('subjectCategory')?.value || '';
            const currentGrade = document.getElementById('subjectGrade')?.value || '';
            const currentQuarter = document.getElementById('subjectQuarter')?.value || '';
            const currentStrand = document.getElementById('subjectStrand')?.value || '';
            const currentSection = document.getElementById('subjectStrandSection')?.value || '';
            const currentColor = document.getElementById('subjectColor')?.value || '';

            if (!subjectId) {
                // When adding a new subject:
                const hasTyped = currentName !== '' || currentCode !== '' || currentDesc !== '';
                const hasStaged = (stagedTopics && stagedTopics.length > 0);
                const inlineTitle = (document.getElementById('inlineTopicTitle')?.value || '').trim();
                const inlineDesc = (document.getElementById('inlineTopicDescription')?.value || '').trim();
                const hasInline = inlineTitle !== '' || inlineDesc !== '';
                const hasNonDefaultSection = currentSection !== 'All Sections' && currentSection !== '';
                const hasNonDefaultStrand = currentStrand !== 'Common' && currentStrand !== '';
                return hasTyped || hasStaged || hasInline || hasNonDefaultSection || hasNonDefaultStrand;
            } else {
                // When editing an existing subject:
                const orig = subjects.find(s => s.id == subjectId);
                if (!orig) return false;

                const origName = (orig.name || '').trim();
                const origCode = (orig.code || '').trim();
                const origDesc = (orig.description || '').trim();
                const origCategory = orig.category || orig.classification || 'Core Subject';
                const origGrade = String(orig.gradeLevel != null ? orig.gradeLevel : (orig.grade_level != null ? orig.grade_level : 11));
                const origQuarter = String(orig.quarter != null ? orig.quarter : 1);
                const origStrand = orig.strand || 'Common';
                const origSection = orig.strandSection || orig.strand_section || 'All Sections';
                const origColor = orig.color || 'bg-card-blue';

                if (currentName !== origName || currentCode !== origCode || currentDesc !== origDesc ||
                    currentCategory !== origCategory || currentGrade !== origGrade || currentQuarter !== origQuarter ||
                    currentStrand !== origStrand || currentSection !== origSection || currentColor !== origColor) {
                    return true;
                }

                const currentTopics = (editingSubjectCopy && editingSubjectCopy.topics) ? editingSubjectCopy.topics : (orig.topics || []);
                if (JSON.stringify(currentTopics) !== JSON.stringify(orig.topics || [])) {
                    return true;
                }

                return false;
            }
        }

        if (subjectModalEl) {
            subjectModalEl.addEventListener('hide.bs.modal', (event) => {
                if (isSaving || isTransitioningToSubmodal) return; // Don't show prompt if saving or opening sub-modal

                if (hasUnsavedChanges()) {
                    const confirmDiscard = confirm('You have unsaved changes on this subject. Are you sure you want to discard them and close?');
                    if (!confirmDiscard) {
                        event.preventDefault(); // Prevent modal from closing if user clicks "Cancel"
                    }
                }
            });

            subjectModalEl.addEventListener('hidden.bs.modal', () => {
                if (isTransitioningToSubmodal) {
                    return; // Retain editing state while sub-modal is active!
                }
                // When the main subject modal is truly closed, clear the temporary editing copy.
                editingSubjectCopy = null;
                currentEditingSubjectId = null;
                isSaving = false;
            });
        }
        subjectsTableBody.addEventListener('click', handleTableClick);
        if (addSubjectBtn) addSubjectBtn.addEventListener('click', handleModalOpen);

        // Add new event listeners for filters
        tableSearch.addEventListener('input', applyFiltersAndSearch);
        gradeFilter.addEventListener('change', () => {
            populateStrandFilter();
            applyFiltersAndSearch();
        });
        categoryFilter.addEventListener('change', applyFiltersAndSearch);
        strandFilter.addEventListener('change', () => {
            if (strandFilter.value !== 'All') {
                const autoGrade = STRAND_GRADE_MAP[strandFilter.value];
                if (autoGrade && gradeFilter.value !== autoGrade) {
                    const chosen = strandFilter.value;
                    gradeFilter.value = autoGrade;
                    populateStrandFilter();
                    strandFilter.value = chosen;
                }
            }
            applyFiltersAndSearch();
        });
        quarterFilter.addEventListener('change', applyFiltersAndSearch);

        // Subject Category and Grading Weights Event Listeners (Admin Control)
        const subjectCategorySelect = document.getElementById('subjectCategory');
        if (subjectCategorySelect) {
            subjectCategorySelect.addEventListener('change', () => {
                const cat = subjectCategorySelect.value;
                const defW = getCategoryDefaultWeights(cat);
                const wwIn = document.getElementById('subjectWwWeight');
                const ptIn = document.getElementById('subjectPtWeight');
                const qaIn = document.getElementById('subjectQaWeight');
                if (wwIn) wwIn.value = defW.ww;
                if (ptIn) ptIn.value = defW.pt;
                if (qaIn) qaIn.value = defW.qa;
                updateSubjectWeightsBadge();
            });
        }

        ['subjectWwWeight', 'subjectPtWeight', 'subjectQaWeight'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', updateSubjectWeightsBadge);
        });

        const btnManageGradingWeights = document.getElementById('btnManageGradingWeights');
        if (btnManageGradingWeights) {
            btnManageGradingWeights.addEventListener('click', () => {
                renderCategoryWeightsPolicyModal();
            });
        }

        const btnSaveCategoryWeightsPolicy = document.getElementById('btnSaveCategoryWeightsPolicy');
        if (btnSaveCategoryWeightsPolicy) {
            btnSaveCategoryWeightsPolicy.addEventListener('click', async () => {
                for (const [cat, w] of Object.entries(categoryWeightsPolicy)) {
                    const sum = Math.round((Number(w.ww) || 0) + (Number(w.pt) || 0) + (Number(w.qa) || 0));
                    if (sum !== 100) {
                        alert(`Category "${cat}" has weights totaling ${sum}%. Each category must equal exactly 100%!`);
                        return;
                    }
                }

                const applyToSubjects = document.getElementById('chkApplyToAllExistingSubjects')?.checked ?? true;
                const token = localStorage.getItem('mentorae_token');

                btnSaveCategoryWeightsPolicy.disabled = true;
                btnSaveCategoryWeightsPolicy.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Saving...';

                try {
                    if (token) {
                        const res = await authedFetch('/api/reference/grading-weights', token, {
                            method: 'PUT',
                            body: JSON.stringify({
                                weights: categoryWeightsPolicy,
                                applyToSubjects
                            })
                        });

                        if (res && res.success) {
                            alert('✅ Institutional grading weights policy updated successfully!\n\nAll teacher grade encoding matrices and DepEd Excel syncs will now follow these weights.');
                            const modalEl = document.getElementById('gradingWeightsModal');
                            if (modalEl && typeof bootstrap !== 'undefined') {
                                const modalInst = bootstrap.Modal.getInstance(modalEl);
                                if (modalInst) modalInst.hide();
                            }
                            syncCategoryDropdowns();
                            // Re-fetch authoritative subjects
                            const subRes = await authedFetch('/api/reference/subjects', token);
                            if (subRes && subRes.success && Array.isArray(subRes.subjects)) {
                                subjects = subRes.subjects;
                                localStorage.setItem(SUBJECTS_STORAGE_KEY, JSON.stringify(subjects));
                                applyFiltersAndSearch();
                            }
                        } else {
                            alert(res?.message || 'Could not update policy.');
                        }
                    } else {
                        alert('✅ Policy updated locally.');
                        syncCategoryDropdowns();
                    }
                } catch (e) {
                    console.error('Save policy error:', e);
                    alert('An error occurred while saving the policy.');
                } finally {
                    btnSaveCategoryWeightsPolicy.disabled = false;
                    btnSaveCategoryWeightsPolicy.innerHTML = '<i class="bi bi-floppy-fill me-1.5"></i> Save & Apply Policy';
                }
            });
        }

        const btnAddCustomCategory = document.getElementById('btnAddCustomCategory');
        if (btnAddCustomCategory) {
            btnAddCustomCategory.addEventListener('click', () => {
                const nameInput = document.getElementById('newCategoryName');
                const wwInput = document.getElementById('newCategoryWw');
                const ptInput = document.getElementById('newCategoryPt');
                const qaInput = document.getElementById('newCategoryQa');
                const name = (nameInput?.value || '').trim();
                const ww = parseFloat(wwInput?.value) || 20;
                const pt = parseFloat(ptInput?.value) || 60;
                const qa = parseFloat(qaInput?.value) || 20;

                if (!name) {
                    alert('Please enter a category name.');
                    return;
                }
                if (categoryWeightsPolicy[name]) {
                    alert(`Category "${name}" already exists.`);
                    return;
                }
                if (Math.round(ww + pt + qa) !== 100) {
                    alert(`Weights must equal 100% (currently ${ww + pt + qa}%).`);
                    return;
                }

                categoryWeightsPolicy[name] = { ww, pt, qa };
                nameInput.value = '';
                syncCategoryDropdowns();
                renderCategoryWeightsPolicyModal();
            });
        }

        // Modal Grade, Strand & Section synchronization
        const modalGrade = document.getElementById('subjectGrade');
        const modalStrand = document.getElementById('subjectStrand');
        const modalSection = document.getElementById('subjectStrandSection');

        if (modalGrade && modalStrand) {
            modalGrade.addEventListener('change', () => {
                updateModalStrandOptions();
                updateModalSectionOptions();
            });
            modalStrand.addEventListener('change', () => {
                const autoGrade = STRAND_GRADE_MAP[modalStrand.value];
                if (autoGrade && modalGrade.value !== autoGrade) {
                    const chosen = modalStrand.value;
                    modalGrade.value = autoGrade;
                    updateModalStrandOptions();
                    modalStrand.value = chosen;
                }
                updateModalSectionOptions();
            });
        }

        if (modalSection) {
            modalSection.addEventListener('change', () => {
                const secVal = modalSection.value;
                if (!secVal || secVal === 'All Sections') return;

                // 1. Try finding in allSectionsList
                const matchedSec = allSectionsList.find(s => {
                    const secName = s.name || '';
                    const strCode = (s.strandCode || s.strand || '').toUpperCase();
                    const valPattern = `${strCode} ${s.grade_level} - ${secName}`;
                    return secVal.toUpperCase() === valPattern.toUpperCase() || secVal.toUpperCase() === secName.toUpperCase();
                });

                let detectedStrand = matchedSec ? (matchedSec.strandCode || matchedSec.strand) : null;
                let detectedGrade = matchedSec ? matchedSec.grade_level : null;

                // 2. If not found via direct object, parse from string prefix (e.g. "STEM 12 - ..." or "STEM 12")
                if (!detectedStrand) {
                    const tokens = secVal.trim().split(/\s+/);
                    if (tokens.length >= 2) {
                        const possibleStrand = tokens[0].toUpperCase();
                        const possibleGrade = parseInt(tokens[1], 10);
                        const allKnownStrands = ['STEM', 'HUMSS', 'ABM', 'BAE', 'ASSH', 'HE', 'H&T', 'COMMON'];
                        if (allKnownStrands.includes(possibleStrand)) {
                            detectedStrand = possibleStrand;
                        }
                        if (possibleGrade === 11 || possibleGrade === 12) {
                            detectedGrade = possibleGrade;
                        }
                    }
                }

                if (detectedGrade && modalGrade && modalGrade.value != detectedGrade) {
                    modalGrade.value = String(detectedGrade);
                    updateModalStrandOptions();
                }

                if (detectedStrand && modalStrand) {
                    const matchingOpt = Array.from(modalStrand.options).find(o => o.value.toUpperCase() === detectedStrand.toUpperCase());
                    if (matchingOpt && modalStrand.value !== matchingOpt.value) {
                        modalStrand.value = matchingOpt.value;
                    }
                    // Re-filter the section dropdown for this strand while preserving the chosen section
                    updateModalSectionOptions(secVal);
                }
            });
        }

        // Topic Management Listeners
        const addNewTopicBtn = document.getElementById('addNewTopicBtn');
        if (addNewTopicBtn) addNewTopicBtn.addEventListener('click', handleAddNewTopicClick);
        
        if (topicsListContainer) topicsListContainer.addEventListener('click', handleTopicsContainerClick);
        if (topicEditorForm) topicEditorForm.addEventListener('submit', handleTopicFormSubmit);

        // Listener for the new inline topic adder
        const addStagedTopicBtn = document.getElementById('addStagedTopicBtn');
        if (addStagedTopicBtn) addStagedTopicBtn.addEventListener('click', handleAddStagedTopic);

        // NEW: Listeners for inline content management buttons
        const manageInlineQuizBtn = document.getElementById('manageInlineQuizBtn');
        if (manageInlineQuizBtn) manageInlineQuizBtn.addEventListener('click', openInlineQuizEditor);
        const manageInlineFlashcardsBtn = document.getElementById('manageInlineFlashcardsBtn');
        if (manageInlineFlashcardsBtn) manageInlineFlashcardsBtn.addEventListener('click', openInlineFlashcardEditor);

        // NEW: Listeners for topic editor content management buttons
        const manageTopicEditorQuizBtn = document.getElementById('manageTopicEditorQuizBtn');
        if (manageTopicEditorQuizBtn) manageTopicEditorQuizBtn.addEventListener('click', openTopicEditorQuizModal);
        const manageTopicEditorFlashcardsBtn = document.getElementById('manageTopicEditorFlashcardsBtn');
        if (manageTopicEditorFlashcardsBtn) manageTopicEditorFlashcardsBtn.addEventListener('click', openTopicEditorFlashcardModal);

        // Delegated listener for staged topics container (remove, edit quiz, edit cards)
        if (stagedTopicsContainer) {
            stagedTopicsContainer.addEventListener('click', (e) => {
                const target = e.target.closest('button');
                if (!target) return;

                const index = target.dataset.index;

                if (target.classList.contains('remove-staged-topic-btn')) {
                    stagedTopics.splice(index, 1);
                    renderStagedTopics();
                } else if (target.classList.contains('edit-staged-quiz-btn')) {
                    openStagedQuizEditor(index);
                } else if (target.classList.contains('edit-staged-flashcard-btn')) {
                    openStagedFlashcardEditor(index);
                }
            });
        }

        // Listeners for Staged Quiz Editor
        const stagedQuizQuestionForm = document.getElementById('stagedQuizQuestionForm');
        if (stagedQuizQuestionForm) stagedQuizQuestionForm.addEventListener('submit', handleStagedQuizFormSubmit);
        const cancelQuizEditBtn = document.getElementById('cancelQuizQuestionEditBtn');
        if (cancelQuizEditBtn) cancelQuizEditBtn.addEventListener('click', resetQuizEditorForm);
        const stagedQuizQuestionsContainer = document.getElementById('stagedQuizQuestionsContainer');
        if (stagedQuizQuestionsContainer) {
            stagedQuizQuestionsContainer.addEventListener('click', e => {
                const target = e.target.closest('button');
                if (!target) return;
                const index = target.dataset.index;
                const topic = isEditingStagedContent ? stagedTopics[currentStagedTopicIndex] : inlineTopicContent;
                if (!topic || !topic.quiz) return;

                if (target.classList.contains('delete-staged-question-btn')) {
                    if (confirm('Delete this question?')) {
                        topic.quiz.splice(index, 1);
                        renderStagedQuizQuestions();
                        resetQuizEditorForm();
                    }
                } else if (target.classList.contains('edit-staged-question-btn')) {
                    const q = topic.quiz[index];
                    if (!q) return;
                    const ansMap = { 'A': '1', 'B': '2', 'C': '3', 'D': '4' };
                    document.getElementById('stagedQuizQuestionId').value = index;
                    document.getElementById('stagedQuizQuestionText').value = q.text || '';
                    document.getElementById('stagedQuizOption1').value = q.options?.A || '';
                    document.getElementById('stagedQuizOption2').value = q.options?.B || '';
                    document.getElementById('stagedQuizOption3').value = q.options?.C || '';
                    document.getElementById('stagedQuizOption4').value = q.options?.D || '';
                    document.getElementById('stagedQuizCorrectAnswer').value = ansMap[q.answer] || '1';
                    document.getElementById('stagedQuizQuestionFormLabel').textContent = `Edit Question #${parseInt(index, 10) + 1}`;
                    document.getElementById('cancelQuizQuestionEditBtn').classList.remove('d-none');
                }
            });
        }

        // Listeners for Staged Flashcard Editor
        const stagedFlashcardForm = document.getElementById('stagedFlashcardForm');
        if (stagedFlashcardForm) stagedFlashcardForm.addEventListener('submit', handleStagedFlashcardFormSubmit);
        const cancelFlashcardEditBtn = document.getElementById('cancelFlashcardEditBtn');
        if (cancelFlashcardEditBtn) cancelFlashcardEditBtn.addEventListener('click', resetFlashcardEditorForm);
        const stagedFlashcardsContainer = document.getElementById('stagedFlashcardsContainer');
        if (stagedFlashcardsContainer) {
            stagedFlashcardsContainer.addEventListener('click', e => {
                const target = e.target.closest('button');
                if (!target) return;
                const index = target.dataset.index;
                const topic = isEditingStagedContent ? stagedTopics[currentStagedTopicIndex] : inlineTopicContent;
                if (!topic || !topic.flashcards) return;

                if (target.classList.contains('delete-staged-card-btn')) {
                    if (confirm('Delete this flashcard?')) {
                        topic.flashcards.splice(index, 1);
                        renderStagedFlashcards();
                        resetFlashcardEditorForm();
                    }
                } else if (target.classList.contains('edit-staged-card-btn')) {
                    const card = topic.flashcards[index];
                    if (!card) return;
                    document.getElementById('stagedFlashcardId').value = index;
                    document.getElementById('stagedFlashcardTerm').value = card.term || '';
                    document.getElementById('stagedFlashcardDefinition').value = card.definition || '';
                    document.getElementById('stagedFlashcardFormLabel').textContent = `Edit Card #${parseInt(index, 10) + 1}`;
                    document.getElementById('cancelFlashcardEditBtn').classList.remove('d-none');
                }
            });
        }
        const stagedFlashcardEditorDoneBtn = document.getElementById('stagedFlashcardEditorDoneBtn');
        if (stagedFlashcardEditorDoneBtn) stagedFlashcardEditorDoneBtn.addEventListener('click', handleStagedFlashcardEditorDone);
        const stagedQuizEditorDoneBtn = document.getElementById('stagedQuizEditorDoneBtn');
        if (stagedQuizEditorDoneBtn) stagedQuizEditorDoneBtn.addEventListener('click', handleStagedQuizEditorDone);

        // Listeners for Existing Flashcard Editor
        const existingFlashcardForm = document.getElementById('existingFlashcardForm');
        if (existingFlashcardForm) existingFlashcardForm.addEventListener('submit', handleExistingFlashcardFormSubmit);
        const cancelExistingFlashcardEditBtn = document.getElementById('cancelExistingFlashcardEditBtn');
        if (cancelExistingFlashcardEditBtn) cancelExistingFlashcardEditBtn.addEventListener('click', resetFlashcardEditorForm);
        const existingFlashcardsContainer = document.getElementById('existingFlashcardsContainer');
        if (existingFlashcardsContainer) existingFlashcardsContainer.addEventListener('click', handleExistingFlashcardContainerClick);

        // Listeners for Existing File Editor
        const existingFileUploadForm = document.getElementById('existingFileUploadForm');
        if (existingFileUploadForm) existingFileUploadForm.addEventListener('submit', handleExistingFileUploadFormSubmit);
        const existingFilesContainer = document.getElementById('existingFilesContainer');
        if (existingFilesContainer) existingFilesContainer.addEventListener('click', handleExistingFilesContainerClick);

        // Listeners for Existing Quiz Editor
        const existingQuizQuestionForm = document.getElementById('existingQuizQuestionForm');
        if (existingQuizQuestionForm) existingQuizQuestionForm.addEventListener('submit', handleExistingQuizFormSubmit);
        const cancelExistingQuizEditBtn = document.getElementById('cancelExistingQuizEditBtn');
        const existingQuizQuestionsContainer = document.getElementById('existingQuizQuestionsContainer');
        if (existingQuizQuestionsContainer) existingQuizQuestionsContainer.addEventListener('click', handleExistingQuizContainerClick);

        // Delegate topicEditorFileContainer clicks for previewing and removing attached files in topic editor modal
        const topicEditorFileContainer = document.getElementById('topicEditorFileContainer');
        if (topicEditorFileContainer) {
            topicEditorFileContainer.addEventListener('click', (e) => {
                const removeTarget = e.target.closest('.remove-topic-editor-file-btn');
                if (removeTarget) {
                    const index = parseInt(removeTarget.dataset.index, 10);
                    if (inlineTopicContent && Array.isArray(inlineTopicContent.files)) {
                        inlineTopicContent.files.splice(index, 1);
                        renderTopicEditorCurrentFiles();
                    }
                    return;
                }

                const previewTarget = e.target.closest('.preview-topic-editor-file-btn, .preview-topic-editor-file-trigger');
                if (previewTarget) {
                    const index = parseInt(previewTarget.dataset.index, 10);
                    if (inlineTopicContent && Array.isArray(inlineTopicContent.files) && inlineTopicContent.files[index]) {
                        const file = inlineTopicContent.files[index];
                        const topic = editingSubjectCopy?.topics?.[currentTopicIndexForEditing];
                        if (topic?.id && file.topicId === undefined) file.topicId = topic.id;
                        if (file.fileIndex === undefined) file.fileIndex = index;
                        const topicTitle = document.getElementById('topicTitle')?.value || topic?.title || '';
                        openFilePreviewCheckModal(file, 'topicEditorModal', topicTitle || 'Topic Editor Draft');
                    }
                    return;
                }
            });
        }

        // Listeners for Pre-Check File Preview Modal
        const filePreviewDoneBtn = document.getElementById('filePreviewDoneBtn');
        if (filePreviewDoneBtn) filePreviewDoneBtn.addEventListener('click', closeFilePreviewCheckModal);
        const filePreviewCheckModalCloseX = document.getElementById('filePreviewCheckModalCloseX');
        if (filePreviewCheckModalCloseX) filePreviewCheckModalCloseX.addEventListener('click', closeFilePreviewCheckModal);

        // Bulk Creation & Spreadsheet Import Handlers
        setupStagedQuizBulkAndFileHandlers();
        setupStagedFcBulkAndFileHandlers();
        setupExistingQuizBulkAndFileHandlers();
        setupExistingFcBulkAndFileHandlers();

        // Return to subjectModal when any submodal closes
        if (existingFileEditorModalEl) {
            existingFileEditorModalEl.addEventListener('hidden.bs.modal', () => {
                if (isTransitioningToSubmodal) return;
                if (currentEditingSubjectId && subjectModal) {
                    subjectModal.show();
                    if (editingSubjectCopy) renderTopicsList(editingSubjectCopy.topics || []);
                }
            });
        }
        if (existingQuizEditorModalEl) {
            existingQuizEditorModalEl.addEventListener('hidden.bs.modal', () => {
                if (currentEditingSubjectId && subjectModal) {
                    subjectModal.show();
                    if (editingSubjectCopy) renderTopicsList(editingSubjectCopy.topics || []);
                }
            });
        }
        if (existingFlashcardEditorModalEl) {
            existingFlashcardEditorModalEl.addEventListener('hidden.bs.modal', () => {
                if (currentEditingSubjectId && subjectModal) {
                    subjectModal.show();
                    if (editingSubjectCopy) renderTopicsList(editingSubjectCopy.topics || []);
                }
            });
        }
        function hasUnsavedTopicChanges() {
            const topicIndex = document.getElementById('topicId') ? document.getElementById('topicId').value : '';
            const currentTitle = (document.getElementById('topicTitle')?.value || '').trim();
            const currentDesc = (document.getElementById('topicDescription')?.value || '').trim();
            const isFileChecked = !!document.getElementById('resourceFile')?.checked;
            const isQuizChecked = !!document.getElementById('resourceQuiz')?.checked;
            const isFlashcardsChecked = !!document.getElementById('resourceFlashcards')?.checked;
            const fileInput = document.getElementById('topicEditorFileInput');
            const hasNewSelectedFile = !!(fileInput && fileInput.files && fileInput.files.length > 0);
            const currentInlineFiles = inlineTopicContent?.files || [];
            const currentInlineQuiz = inlineTopicContent?.quiz || [];
            const currentInlineFlashcards = inlineTopicContent?.flashcards || [];

            if (topicIndex === '' || topicIndex === undefined || topicIndex === null) {
                // Adding a new topic
                const hasTyped = currentTitle !== '' || currentDesc !== '';
                const hasResourceChecked = isFileChecked || isQuizChecked || isFlashcardsChecked;
                const hasAttachedContent = hasNewSelectedFile || currentInlineFiles.length > 0 || currentInlineQuiz.length > 0 || currentInlineFlashcards.length > 0;
                return hasTyped || hasResourceChecked || hasAttachedContent;
            } else {
                // Editing an existing topic
                const subject = editingSubjectCopy;
                const origTopic = subject?.topics?.[topicIndex];
                if (!origTopic) return false;

                const origTitle = (origTopic.title || '').trim();
                const origDesc = (origTopic.description || '').trim();
                if (currentTitle !== origTitle || currentDesc !== origDesc) {
                    return true;
                }

                const origResources = origTopic.resources || [];
                if (isFileChecked !== origResources.includes('File') ||
                    isQuizChecked !== origResources.includes('Practice Quiz') ||
                    isFlashcardsChecked !== origResources.includes('Flashcards')) {
                    return true;
                }

                if (hasNewSelectedFile) {
                    return true;
                }

                if (JSON.stringify(currentInlineFiles) !== JSON.stringify(origTopic.files || [])) {
                    return true;
                }

                if (JSON.stringify(currentInlineQuiz) !== JSON.stringify(origTopic.quiz || [])) {
                    return true;
                }

                if (JSON.stringify(currentInlineFlashcards) !== JSON.stringify(origTopic.flashcards || [])) {
                    return true;
                }

                return false;
            }
        }

        if (topicEditorModalEl) {
            topicEditorModalEl.addEventListener('hide.bs.modal', (event) => {
                if (isSavingTopic || isTransitioningToSubmodal) return;

                if (hasUnsavedTopicChanges()) {
                    const confirmDiscard = confirm('You have unsaved changes on this topic. Are you sure you want to discard them and close?');
                    if (!confirmDiscard) {
                        event.preventDefault();
                    }
                }
            });

            topicEditorModalEl.addEventListener('hidden.bs.modal', () => {
                if (isTransitioningToSubmodal) return;
                isSavingTopic = false;
                if (subjectModal) {
                    subjectModal.show();
                    if (editingSubjectCopy) renderTopicsList(editingSubjectCopy.topics || []);
                }
            });
        }

        // Return to subjectModal or topicEditorModal when staged quiz/flashcard editors are closed via X or done
        if (stagedQuizEditorModalEl) {
            stagedQuizEditorModalEl.addEventListener('hidden.bs.modal', () => {
                if (isTransitioningToSubmodal) return;
                if (contentEditorReturnContext === 'subjectModal') {
                    if (subjectModal) subjectModal.show();
                } else if (contentEditorReturnContext === 'topicEditorModal') {
                    if (topicEditorModal) topicEditorModal.show();
                }
            });
        }
        if (stagedFlashcardEditorModalEl) {
            stagedFlashcardEditorModalEl.addEventListener('hidden.bs.modal', () => {
                if (isTransitioningToSubmodal) return;
                if (contentEditorReturnContext === 'subjectModal') {
                    if (subjectModal) subjectModal.show();
                } else if (contentEditorReturnContext === 'topicEditorModal') {
                    if (topicEditorModal) topicEditorModal.show();
                }
            });
        }

        // Listener for all inline resource checkboxes to toggle their respective containers
        document.querySelectorAll('.inline-resource-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const container = document.getElementById(checkbox.dataset.targetContainer);
                if (container) container.classList.toggle('d-none', !checkbox.checked);
            });
        });

        // NEW: Listener for topic editor resource checkboxes
        document.querySelectorAll('.topic-editor-resource-cb').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const container = document.getElementById(checkbox.dataset.targetContainer);
                if (container) container.classList.toggle('d-none', !checkbox.checked);
            });
        });

        updateDateTime();
        setInterval(updateDateTime, 1000);
    }

    init();
});