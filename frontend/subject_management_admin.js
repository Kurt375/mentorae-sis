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
    function renderTopicsList(topics) {
        if (!topicsListContainer) return;
        topicsListContainer.innerHTML = ''; // Clear existing topics
        if (!topics || topics.length === 0) {
            topicsListContainer.innerHTML = '<p class="text-center text-muted p-3">No topics have been added to this subject yet.</p>';
            return;
        }

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
                <div class="me-3">
                    <h6 class="mb-1">${topic.title}</h6>
                    <small class="text-muted">${topic.description}</small>
                </div>
                <div class="d-inline-flex gap-2 mt-2 mt-sm-0">
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
        isSaving = true; // Set the flag to indicate a save is in progress
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
                isSaving = false;
                return; // Stop saving to prevent losing the topic
            }
        }

        const wwWeight = parseFloat(document.getElementById('subjectWwWeight')?.value) || 20;
        const ptWeight = parseFloat(document.getElementById('subjectPtWeight')?.value) || 50;
        const qaWeight = parseFloat(document.getElementById('subjectQaWeight')?.value) || 30;

        if (Math.round(wwWeight + ptWeight + qaWeight) !== 100) {
            alert(`Grading component weights must sum to exactly 100%!\nCurrent total: ${Math.round(wwWeight + ptWeight + qaWeight)}% (WW: ${wwWeight}%, PT: ${ptWeight}%, QA: ${qaWeight}%)`);
            isSaving = false;
            return;
        }

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
                        isSaving = false;
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
                    isSaving = false;
                    return; // Stop submission
                }
                if (topic.resources.includes('Flashcards') && (!topic.flashcards || topic.flashcards.length === 0)) {
                    alert(`The topic "${topic.title}" is marked as having 'Flashcards' but no cards have been added. Please edit the topic's flashcard content before saving the subject.`);
                    isSaving = false;
                    return; // Stop submission
                }
                // This validation is also needed because a user could check the box but not upload a file.
                if (topic.resources.includes('File') && (!topic.files || topic.files.length === 0)) {
                    alert(`The topic "${topic.title}" is marked as having a 'File' but no file was uploaded. Please remove and re-add the topic with a file.`);
                    isSaving = false;
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
                        isSaving = false;
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
                                    editingSubjectCopy.topics = topicRes.topics.map(t => ({
                                        id: t.id,
                                        title: t.title,
                                        description: t.description || '',
                                        resources: t.resources || [],
                                        quiz: t.quiz || [],
                                        flashcards: t.flashcards || [],
                                        files: t.files || [],
                                        color: t.color || 'bg-card-blue'
                                    }));
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

    function renderTopicEditorCurrentFiles() {
        const container = document.getElementById('topicEditorCurrentFilesContainer');
        if (!container) return;
        const files = (inlineTopicContent && Array.isArray(inlineTopicContent.files)) ? inlineTopicContent.files : [];
        if (files.length === 0) {
            container.innerHTML = '';
            return;
        }
        container.innerHTML = `
            <label class="form-label text-sm fw-medium mb-1">Current Attached Files</label>
            <div class="list-group mb-2">
                ${files.map((f, i) => `
                    <div class="list-group-item d-flex justify-content-between align-items-center py-1 px-2 small">
                        <span class="text-truncate me-2"><i class="bi bi-file-earmark-text text-primary me-1"></i>${f.name}</span>
                        <button type="button" class="btn btn-sm btn-outline-danger p-0 px-2 remove-topic-editor-file-btn" data-index="${i}" title="Remove file">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                `).join('')}
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

        const topicData = {
            title: document.getElementById('topicTitle').value,
            description: document.getElementById('topicDescription').value,
            resources: selectedResources
        };

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
                const file = fileInput.files[0];
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
                const file = fileInput.files[0];
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

            if (!subject.topics) subject.topics = [];
            subject.topics.push(topicData);
        }

        // saveSubjects(subjects); // REMOVED: Defer saving until the main "Save Subject" button is clicked.
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
            const file = fileInput.files[0];
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
        const topic = isEditingStagedContent ? stagedTopics[currentStagedTopicIndex] : inlineTopicContent;
        // Add a guard clause to prevent errors if the index is not set
        if (!topic) {
            if (container) container.innerHTML = '<p class="text-center text-muted">Error: Topic context not found.</p>';
            return;
        }
        const questions = topic.quiz;
        container.innerHTML = '';

        if (!questions || questions.length === 0) {
            container.innerHTML = '<p class="text-center text-muted">No questions added yet.</p>';
            return;
        }

        const list = document.createElement('div');
        list.className = 'list-group';
        questions.forEach((q, index) => {
            const item = document.createElement('div');
            item.className = 'list-group-item d-flex justify-content-between align-items-center';
            // The data is now in the new format {text, options:{A,B,C,D}, answer}
            const questionText = q.text;
            const correctAnswerText = q.options[q.answer];

            item.innerHTML = `
                <div class="flex-grow-1 me-3">
                    <p class="mb-1 fw-medium">${index + 1}. ${questionText || '(No question text)'}</p>
                    <small class="text-success">Correct: ${correctAnswerText || '(No answer text)'}</small>
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
            text: document.getElementById('stagedQuizQuestionText').value, // Aligned with teacher page 'text'
            options: {
                A: document.getElementById('stagedQuizOption1').value,
                B: document.getElementById('stagedQuizOption2').value,
                C: document.getElementById('stagedQuizOption3').value,
                D: document.getElementById('stagedQuizOption4').value,
            },
            answer: answerMap[correctAnwerValue] // Aligned with teacher page 'answer'
        };

        const topic = isEditingStagedContent ? stagedTopics[currentStagedTopicIndex] : inlineTopicContent;
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
        const topic = isEditingStagedContent ? stagedTopics[currentStagedTopicIndex] : inlineTopicContent;
        // Add a guard clause to prevent errors if the index is not set
        if (!topic) {
            if (container) container.innerHTML = '<p class="text-center text-muted">Error: Topic context not found.</p>';
            return;
        }
        const cards = topic.flashcards;
        container.innerHTML = '';

        if (!cards || cards.length === 0) {
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
                    <p class="mb-1 fw-medium">${card.term}</p>
                    <small class="text-muted">${card.definition}</small>
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
            term: document.getElementById('stagedFlashcardTerm').value,
            definition: document.getElementById('stagedFlashcardDefinition').value,
        };

        const topic = isEditingStagedContent ? stagedTopics[currentStagedTopicIndex] : inlineTopicContent;
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
        const subject = editingSubjectCopy; // Work on the temporary copy
        const questions = subject?.topics[currentTopicIndexForEditing]?.quiz || [];
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
                    <p class="mb-1 fw-medium">${index + 1}. ${q.text || q.question || '(No question text)'}</p>
                    <small class="text-success">Correct: Option ${ansKey} - ${correctAnswerText}</small>
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
        const subject = editingSubjectCopy; // Work on the temporary copy
        const cards = subject?.topics[currentTopicIndexForEditing]?.flashcards || [];
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
                    <p class="mb-1 fw-medium">${card.term}</p>
                    <small class="text-muted">${card.definition}</small>
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
            term: document.getElementById('existingFlashcardTerm').value,
            definition: document.getElementById('existingFlashcardDefinition').value,
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
            container.innerHTML = '<p class="text-center text-muted">No files uploaded yet.</p>';
            return;
        }

        const list = document.createElement('div');
        list.className = 'list-group';
        files.forEach((file, index) => {
            let fileUrl = '#';
            if (file.dataUrl) {
                if (file.dataUrl.startsWith('data:')) {
                    try {
                        const blob = dataURItoBlob(file.dataUrl);
                        fileUrl = URL.createObjectURL(blob);
                    } catch (e) {
                        fileUrl = file.dataUrl;
                    }
                } else {
                    fileUrl = file.dataUrl;
                }
            }

            const item = document.createElement('div');
            item.className = 'list-group-item d-flex justify-content-between align-items-center';
            const fileSizeText = file.size ? `(${(file.size / 1024).toFixed(2)} KB)` : '';
            item.innerHTML = `
                <a href="${fileUrl}" target="_blank" rel="noopener noreferrer" class="text-decoration-none text-dark flex-grow-1 me-3" title="Click to open file">
                    <i class="bi bi-file-earmark-text me-2 text-primary"></i>
                    <span class="fw-medium">${file.name || 'Attached File'}</span>
                    <small class="text-muted ms-2">${fileSizeText}</small>
                </a>
                <div>
                    <button type="button" class="btn btn-sm btn-outline-danger delete-existing-file-btn" data-index="${index}" title="Delete File"><i class="bi bi-trash"></i></button>
                </div>
            `;
            list.appendChild(item);
        });
        container.appendChild(list);
    }

    async function handleExistingFileUploadFormSubmit(event) {
        event.preventDefault();
        const fileInput = document.getElementById('existingFileInput');
        const subject = editingSubjectCopy; // Work on the temporary copy
        const topic = subject?.topics?.[currentTopicIndexForEditing];
        if (!topic || !fileInput.files || fileInput.files.length === 0) return;

        const file = fileInput.files[0];
        if (file.size > 25 * 1024 * 1024) { // Max 25MB
            alert(`File "${file.name}" is too large (max 25MB).`);
            return;
        }

        try {
            const fileDataUrl = await readFileAsDataURL(file);
            if (!Array.isArray(topic.files)) topic.files = [];
            topic.files.push({
                name: file.name,
                size: file.size,
                dataUrl: fileDataUrl
            });
            if (!Array.isArray(topic.resources)) topic.resources = [];
            if (!topic.resources.includes('File')) topic.resources.push('File');
            renderExistingFiles();
            fileInput.value = ''; // Clear input
        } catch (error) {
            console.error("Error reading file:", error);
            alert("There was an error reading the file. Please try again.");
        }
    }

    function handleExistingFilesContainerClick(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        const target = event.target.closest('.delete-existing-file-btn');
        if (!target) return;

        const subject = editingSubjectCopy; // Work on the temporary copy
        const topic = subject?.topics?.[currentTopicIndexForEditing];
        if (!topic || !topic.files) return;

        const index = parseInt(target.dataset.index, 10);
        if (confirm('Are you sure you want to delete this file?')) {
            topic.files.splice(index, 1);
            renderExistingFiles();
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
        if (cancelExistingQuizEditBtn) cancelExistingQuizEditBtn.addEventListener('click', resetExistingQuizForm);
        const existingQuizQuestionsContainer = document.getElementById('existingQuizQuestionsContainer');
        if (existingQuizQuestionsContainer) existingQuizQuestionsContainer.addEventListener('click', handleExistingQuizContainerClick);

        // Delegate topicEditorFileContainer clicks for removing attached files in topic editor modal
        const topicEditorFileContainer = document.getElementById('topicEditorFileContainer');
        if (topicEditorFileContainer) {
            topicEditorFileContainer.addEventListener('click', (e) => {
                const target = e.target.closest('.remove-topic-editor-file-btn');
                if (!target) return;
                const index = parseInt(target.dataset.index, 10);
                if (inlineTopicContent && Array.isArray(inlineTopicContent.files)) {
                    inlineTopicContent.files.splice(index, 1);
                    renderTopicEditorCurrentFiles();
                }
            });
        }

        // Return to subjectModal when any submodal closes
        if (existingFileEditorModalEl) {
            existingFileEditorModalEl.addEventListener('hidden.bs.modal', () => {
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