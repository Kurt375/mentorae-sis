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

    let subjects = [];
    let isSaving = false; // To prevent unsaved changes prompt during save.
    let editingSubjectCopy = null; // To hold a deep copy of the subject being edited.
    let currentEditingSubjectId = null; // To track which subject's topics are being edited
    let stagedTopics = []; // To hold topics when creating a new subject
    let currentStagedTopicIndex = null; // To track which staged topic's content is being edited
    let currentTopicIndexForEditing = null; // To track which existing topic is being edited
    let inlineTopicContent = { quiz: [], flashcards: [] }; // Content for the inline topic form
    let isEditingStagedContent = false; // Flag to differentiate content editing context
    let contentEditorReturnContext = 'subjectModal'; // To track which modal to return to

    // --- Data Initialization ---
    function getInitialData() {
        // This combines the mock data from the teacher pages into a single source of truth.
        // In a real app, this would be a single API call.
        const initialSubjects = [
            // Grade 11 - Common / All Sections
            { name: "Life & Career Skills", code: "LCS", category: "Applied Subject", strandSection: "All Sections", gradeLevel: 11, strand: "Common", description: "Equips students with essential skills for life and career development.", color: "bg-card-blue", quarter: 1 },
            { name: "General Mathematics", code: "GenMath", category: "Core Subject", strandSection: "All Sections", gradeLevel: 11, strand: "Common", description: "Covers fundamental concepts of mathematics relevant to various fields.", color: "bg-card-green", quarter: 1 },
            { name: "General Science", code: "GenSci", category: "Core Subject", strandSection: "All Sections", gradeLevel: 11, strand: "Common", description: "Introduces basic scientific principles and concepts.", color: "bg-card-orange", quarter: 1 },
            { name: "Pag-aaral ng Kasaysayan at Lipunang Pilipino", code: "PKLP", category: "Core Subject", strandSection: "All Sections", gradeLevel: 11, strand: "Common", description: "Explores the history and society of the Philippines.", color: "bg-card-blue", quarter: 1 },
            { name: "Mabisang Komunikasyon", code: "MabisangKom", category: "Core Subject", strandSection: "All Sections", gradeLevel: 11, strand: "Common", description: "Focuses on effective communication skills in Filipino.", color: "bg-card-green", quarter: 1 },
            { name: "Effective Communication", code: "EffComm", category: "Core Subject", strandSection: "All Sections", gradeLevel: 11, strand: "Common", description: "Develops communication skills for various contexts.", color: "bg-card-orange", quarter: 1 },
            { name: "Homeroom Guidance", code: "HRG11", category: "Institutional / Non-Academic", strandSection: "All Sections", gradeLevel: 11, strand: "Common", description: "Provides guidance and support for personal and academic growth.", color: "bg-card-green", quarter: 1 },

            // Grade 11 - Specialized Subjects
            { name: "Introduction to Organization and Management", code: "IntroOrgMgt", category: "Specialized Subject", strandSection: "BAE 11 - ACCOUNTANCY & Entrep", gradeLevel: 11, strand: "BAE", description: "Covers basic concepts of organization and management.", color: "bg-card-orange", quarter: 1 },
            { name: "Philippine Governance", code: "PhilGov", category: "Specialized Subject", strandSection: "ASSH 11 - ARTS & SOCIAL SCIENCES 1&2", gradeLevel: 11, strand: "ASSH", description: "Studies the principles and practices of Philippine governance.", color: "bg-card-blue", quarter: 1 },
            { name: "Creative Composition", code: "CreativeComp", category: "Specialized Subject", strandSection: "ASSH 11 - HUMANITIES 1&2, ALS 11 - Humanities", gradeLevel: 11, strand: "ASSH", description: "Develops skills in creative writing and composition.", color: "bg-card-green", quarter: 1 },
            { name: "Finite Mathematics 1", code: "FiniteMath1", category: "Specialized Subject", strandSection: "STEM 11 - ENGINEERING", gradeLevel: 11, strand: "STEM", description: "Introduces concepts in finite mathematics relevant to engineering.", color: "bg-card-orange", quarter: 1 },
            { name: "Biology 1", code: "Bio1", category: "Specialized Subject", strandSection: "STEM 11 - MEDICAL SCIENCES", gradeLevel: 11, strand: "STEM", description: "Explores fundamental concepts in biology for medical sciences.", color: "bg-card-blue", quarter: 1 },
            { name: "Human Movement 1", code: "HumanMove1", category: "Specialized Subject", strandSection: "SHAW 11 - SPORTS MANAGEMENT", gradeLevel: 11, strand: "SHAW", description: "Studies the principles of human movement and sports.", color: "bg-card-green", quarter: 1 },
            { name: "Bakery Operations NC II", code: "BakeryOps", category: "Specialized Subject", strandSection: "H&T 11 - CULINARY ARTS & ALS 11 - Culinary", gradeLevel: 11, strand: "H&T", description: "Practical training in bakery operations.", color: "bg-card-orange", quarter: 1 },

            // Grade 12 - Common / All Sections
            { name: "Understanding Culture, Society and Politics", code: "UCSP", category: "Core Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", description: "Examines the dynamics of culture, society, and politics.", color: "bg-card-blue", quarter: 1 },
            { name: "Introduction to the Philosophy of the Human Person", code: "IPHP", category: "Core Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", description: "Explores philosophical concepts and critical thinking.", color: "bg-card-green", quarter: 1 },
            { name: "P.E. and Health", code: "PEH", category: "Core Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", description: "Focuses on physical education and health awareness.", color: "bg-card-orange", quarter: 1 },
            { name: "Homeroom Guidance", code: "HRG12", category: "Institutional / Non-Academic", strandSection: "All Sections", gradeLevel: 12, strand: "Common", description: "Provides guidance and support for personal and academic growth.", color: "bg-card-green", quarter: 1 },
            { name: "English for Academic and Professional Purposes", code: "EAPP", category: "Applied Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", description: "Enhances reading, writing, and communication skills for academic and professional contexts.", color: "bg-card-blue", quarter: 1 },

            // Grade 12 - Specialized Subjects
            { name: "Fundamentals of Accountancy, Business and Management 2", code: "FABM2", category: "Specialized Subject", strandSection: "ABM 12 - BUSINESS ADMINISTRATION", gradeLevel: 12, strand: "ABM", description: "Advanced concepts in accountancy, business, and management.", color: "bg-card-green", quarter: 1 },
            { name: "Business Finance", code: "BusFin", category: "Specialized Subject", strandSection: "ABM 12 - BUSINESS ADMINISTRATION", gradeLevel: 12, strand: "ABM", description: "Covers principles of business finance and investment.", color: "bg-card-orange", quarter: 1 },
            { name: "Creative Writing", code: "CreativeWrit", category: "Specialized Subject", strandSection: "HUMSS 12 - CRIMINOLOGY 1-3 & HUMSS 12 - EDUCATION 1-2", gradeLevel: 12, strand: "HUMSS", description: "Develops skills in various forms of creative writing.", color: "bg-card-blue", quarter: 1 },
            { name: "Community Engagement, Solidarity, and Citizenship", code: "CESC", category: "Specialized Subject", strandSection: "HUMSS 12 - CRIMINOLOGY 1-3 & HUMSS 12 - EDUCATION 1-2", gradeLevel: 12, strand: "HUMSS", description: "Focuses on community involvement and civic responsibility.", color: "bg-card-green", quarter: 1 },
            { name: "Physics 1", code: "Physics1", category: "Specialized Subject", strandSection: "STEM 12 - BIOMEDICAL ENGINEERING & STEM 12 - SIGMA TECHNOCRATS", gradeLevel: 12, strand: "STEM", description: "Introduces fundamental concepts of physics.", color: "bg-card-orange", quarter: 1 },
            { name: "Chemistry 1", code: "Chem1", category: "Specialized Subject", strandSection: "STEM 12 - BIOMEDICAL ENGINEERING & STEM 12 - SIGMA TECHNOCRATS", gradeLevel: 12, strand: "STEM", description: "Explores basic principles of chemistry.", color: "bg-card-blue", quarter: 1 },
            { name: "Cookery NC II", code: "CookeryNC2", category: "Specialized Subject", strandSection: "HE 12 - COOKERY", gradeLevel: 12, strand: "HE", description: "Practical training in cookery skills.", color: "bg-card-green", quarter: 1 },
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
        localStorage.setItem(SUBJECTS_STORAGE_KEY, JSON.stringify(subjectsToSave));
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
                resourceButtons.push(`<button class="btn btn-sm btn-outline-success manage-existing-quiz-btn" data-index="${index}"><i class="bi bi-pencil-square"></i> Quiz</button>`);
            }
            if ((topic.resources || []).includes('Flashcards')) {
                resourceButtons.push(`<button class="btn btn-sm btn-outline-info manage-existing-flashcard-btn" data-index="${index}"><i class="bi bi-stack"></i> Cards</button>`);
            }
            if ((topic.resources || []).includes('File')) {
                resourceButtons.push(`<button class="btn btn-sm btn-outline-secondary manage-existing-file-btn" data-index="${index}"><i class="bi bi-file-earmark"></i> Files</button>`);
            }

            topicItem.innerHTML = `
                <div class="me-3">
                    <h6 class="mb-1">${topic.title}</h6>
                    <small class="text-muted">${topic.description}</small>
                </div>
                <div class="d-inline-flex gap-2 mt-2 mt-sm-0">
                    ${resourceButtons.join('')}
                    <button class="btn btn-sm btn-outline-primary edit-topic-btn" data-index="${index}"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger delete-topic-btn" data-index="${index}"><i class="bi bi-trash"></i></button>
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
            subjectsTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted p-4">No subjects match your criteria.</td></tr>`;
            return;
        }

        subjectsToRender.forEach(subject => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="p-3 align-middle">${subject.name}</td>
                <td class="p-3 align-middle">${subject.code}</td>
                <td class="p-3 align-middle">${subject.category}</td>
                <td class="p-3 align-middle">${subject.gradeLevel}</td>
                <td class="p-3 align-middle">${subject.quarter}</td>
                <td class="p-3 align-middle">${subject.strandSection}</td>
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

    function populateStrandFilter() {
        const availableStrands = [...new Set(subjects.map(s => s.strand))].sort();
        strandFilter.innerHTML = '<option value="All">All Strands</option>'; // Reset
        availableStrands.forEach(strand => {
            if (strand) { // Ensure not to add empty/undefined strands
                const option = document.createElement('option');
                option.value = strand;
                option.textContent = strand;
                strandFilter.appendChild(option);
            }
        });
    }

    function applyFiltersAndSearch() {
        const searchQuery = tableSearch.value.toLowerCase();
        const selectedGrade = gradeFilter.value;
        const selectedCategory = categoryFilter.value;
        const selectedStrand = strandFilter.value;
        const selectedQuarter = quarterFilter.value;

        const filteredSubjects = subjects.filter(subject => {
            const gradeMatch = selectedGrade === 'All' || subject.gradeLevel === parseInt(selectedGrade, 10);
            const categoryMatch = selectedCategory === 'All' || subject.category === selectedCategory;
            const strandMatch = selectedStrand === 'All' || subject.strand === selectedStrand;
            const quarterMatch = selectedQuarter === 'All' || subject.quarter === parseInt(selectedQuarter, 10);
            
            const searchMatch = !searchQuery ||
                subject.name.toLowerCase().includes(searchQuery) ||
                subject.code.toLowerCase().includes(searchQuery) ||
                subject.strandSection.toLowerCase().includes(searchQuery);

            return gradeMatch && categoryMatch && strandMatch && quarterMatch && searchMatch;
        });

        renderSubjectTable(filteredSubjects);
    }

    // --- Event Handlers ---
    function handleFormSubmit(event) {
        event.preventDefault();
        isSaving = true; // Set the flag to indicate a save is in progress
        const subjectId = document.getElementById('subjectId').value;

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
        };

        if (subjectId) { // Editing existing subject
            const index = subjects.findIndex(s => s.id == subjectId);
            if (index !== -1) {
                // The editingSubjectCopy already has the updated topics.
                // Now, update its main properties from the form fields.
                editingSubjectCopy.name = subjectData.name;
                editingSubjectCopy.code = subjectData.code;
                editingSubjectCopy.description = subjectData.description;
                editingSubjectCopy.category = subjectData.category;
                editingSubjectCopy.gradeLevel = subjectData.gradeLevel;
                editingSubjectCopy.quarter = subjectData.quarter;
                editingSubjectCopy.strand = subjectData.strand;
                editingSubjectCopy.strandSection = subjectData.strandSection;
                editingSubjectCopy.color = subjectData.color;

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

            subjects.unshift({
                id: Date.now(),
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

    function handleTopicFormSubmit(event) {
        event.preventDefault();
        const subject = subjects.find(s => s.id == currentEditingSubjectId);
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

        if (topicIndex !== '') { // Editing
            const oldTopic = subject.topics[topicIndex];
            subject.topics[topicIndex] = { ...oldTopic, ...topicData };
        } else { // Adding
            if (!subject.topics) subject.topics = [];
            // Add content arrays for consistency with teacher view
            topicData.files = [];
            topicData.quiz = [];
            topicData.flashcards = [];
            topicData.createdAt = new Date().toISOString();
            topicData.createdBy = 'admin'; // Mark as admin-created
            subject.topics.push(topicData);
        }

        saveSubjects(subjects);
        renderTopicsList(subject.topics);
        if (topicEditorModal) topicEditorModal.hide();
    }

    function handleTableClick(event) {
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
                document.getElementById('subjectId').value = editingSubjectCopy.id;
                document.getElementById('subjectName').value = editingSubjectCopy.name;
                document.getElementById('subjectCode').value = editingSubjectCopy.code;
                document.getElementById('subjectDescription').value = editingSubjectCopy.description;
                document.getElementById('subjectCategory').value = editingSubjectCopy.category;
                document.getElementById('subjectGrade').value = editingSubjectCopy.gradeLevel;
                document.getElementById('subjectQuarter').value = editingSubjectCopy.quarter;
                document.getElementById('subjectStrand').value = editingSubjectCopy.strand;
                document.getElementById('subjectStrandSection').value = editingSubjectCopy.strandSection;
                document.getElementById('subjectColor').value = editingSubjectCopy.color;

                if (subjectModal) subjectModal.show();

                // Show and populate the topic management section for editing
                const manageTopicsSection = document.getElementById('manageTopicsSection');
                if (manageTopicsSection) {
                    manageTopicsSection.classList.remove('d-none');
                    renderTopicsList(editingSubjectCopy.topics || []);
                }
                document.getElementById('addTopicsSection').classList.add('d-none'); // Hide topic section when editing
            }
        }

        if (target.classList.contains('delete-btn')) {
            if (confirm('Are you sure you want to delete this subject? This action cannot be undone.')) {
                subjects = subjects.filter(s => s.id != subjectId);
                saveSubjects(subjects);
                populateStrandFilter(); // Repopulate in case a strand was removed
                applyFiltersAndSearch(); // Re-render table with filters
            }
        }
    }

    function handleTopicsContainerClick(event) {
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
            
            // NEW: Populate inlineTopicContent with the existing topic's content and show managers
            inlineTopicContent = {
                quiz: [...(topic.quiz || [])],
                flashcards: [...(topic.flashcards || [])]
            };

            document.querySelectorAll('.topic-editor-resource-cb').forEach(cb => {
                const container = document.getElementById(cb.dataset.targetContainer);
                if (container) {
                    container.classList.toggle('d-none', !cb.checked);
                }
            });

            if (topicEditorModal) topicEditorModal.show();
        }

        if (target.classList.contains('delete-topic-btn')) {
            const topicIndex = target.dataset.index;
            if (confirm('Are you sure you want to delete this topic?')) {
                subject.topics.splice(topicIndex, 1);
                // saveSubjects(subjects); // REMOVED: Defer saving.
                renderTopicsList(subject.topics); // Re-render from the copy.
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

    function handleModalOpen() {
        subjectForm.reset();
        document.getElementById('subjectId').value = '';
        document.getElementById('subjectStrandSection').value = '';
        stagedTopics = []; // Clear any previously staged topics
        inlineTopicContent = { quiz: [], flashcards: [] }; // NEW: Reset inline content
        renderStagedTopics(); // Update the UI to show it's empty
        subjectModalLabel.textContent = 'Add New Subject';
        document.getElementById('addTopicsSection').classList.remove('d-none'); // Show topic section for adding

        // Hide the topic management section when adding a new subject
        const manageTopicsSection = document.getElementById('manageTopicsSection');
        if (manageTopicsSection) manageTopicsSection.classList.add('d-none');

        // Also reset the inline file upload
        document.querySelectorAll('.inline-resource-checkbox').forEach(cb => {
            const container = document.getElementById(cb.dataset.targetContainer);
            if (container) container.classList.add('d-none');
        });
        const fileInput = document.getElementById('inlineFileInput');
        if (fileInput) fileInput.value = '';
    }

    function handleAddNewTopicClick() {
        if (topicEditorForm) topicEditorForm.reset();
        if (document.getElementById('topicEditorModalLabel')) document.getElementById('topicEditorModalLabel').textContent = 'Add New Topic';
        document.getElementById('topicId').value = '';
        
        // NEW: Reset content state for this modal
        inlineTopicContent = { quiz: [], flashcards: [] };
        document.querySelectorAll('.topic-editor-resource-cb').forEach(cb => {
            const container = document.getElementById(cb.dataset.targetContainer);
            if (container) container.classList.add('d-none');
        });
        const fileInput = document.getElementById('topicEditorFileInput');
        if (fileInput) fileInput.value = '';

        if (topicEditorModal) topicEditorModal.show();
    }

    async function handleTopicFormSubmit(event) { // Make async
        const titleInput = document.getElementById('topicTitle');
        const descriptionInput = document.getElementById('topicDescription');
        const title = titleInput.value.trim();

        if (!title) {
            alert('Please provide a title for the topic.');
            titleInput.focus();
            return;
        }

        event.preventDefault();
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

            // Validation for editing
            if (selectedResources.includes('File') && oldTopic.files.length === 0 && fileInput.files.length === 0) {
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

            // Handle file upload for editing (only if a new file is selected)
            if (selectedResources.includes('File') && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                if (file.size > 3 * 1024 * 1024) {
                    return alert(`File "${file.name}" is too large (max 3MB).`);
                }
                try {
                    const fileDataUrl = await readFileAsDataURL(file);
                    updatedTopic.files = [{ name: file.name, size: file.size, dataUrl: fileDataUrl }];
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
                if (file.size > 3 * 1024 * 1024) {
                    return alert(`File "${file.name}" is too large (max 3MB).`);
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
            if (file.size > 3 * 1024 * 1024) { // Reduced to 3MB for safety
                alert(`File "${file.name}" is too large (max 3MB). Please choose a smaller file to avoid filling up the browser's local storage.`);
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
        const onModalHidden = () => {
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
        const onModalHidden = () => {
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
        const onModalHidden = () => {
            document.getElementById('stagedQuizEditorModalLabel').textContent = `Edit Quiz for: New Topic`;
            renderStagedQuizQuestions();
            stagedQuizEditorModal.show();
            topicEditorModalEl.removeEventListener('hidden.bs.modal', onModalHidden);
        };
        topicEditorModalEl.addEventListener('hidden.bs.modal', onModalHidden);
        topicEditorModal.hide();
    }

    function openTopicEditorFlashcardModal() {
        contentEditorReturnContext = 'topicEditorModal';
        isEditingStagedContent = false; // Use inlineTopicContent
        const onModalHidden = () => {
            document.getElementById('stagedFlashcardEditorModalLabel').textContent = `Edit Flashcards for: New Topic`;
            renderStagedFlashcards();
            stagedFlashcardEditorModal.show();
            topicEditorModalEl.removeEventListener('hidden.bs.modal', onModalHidden);
        };
        topicEditorModalEl.addEventListener('hidden.bs.modal', onModalHidden);
        topicEditorModal.hide();
    }

    function openStagedQuizEditor(topicIndex) {
        contentEditorReturnContext = 'subjectModal'; // NEW
        isEditingStagedContent = true; // Set flag for staged editing
        currentStagedTopicIndex = topicIndex;
        const topic = stagedTopics[topicIndex];
        if (!topic || !stagedQuizEditorModal) return;

        // This is a more robust way to handle chained modals than setTimeout.
        // It waits for the first modal to be completely hidden before showing the next.
        const onModalHidden = () => {
            document.getElementById('stagedQuizEditorModalLabel').textContent = `Edit Quiz for: ${topic.title}`;
            renderStagedQuizQuestions();
            if (stagedQuizEditorModal) stagedQuizEditorModal.show();
            // Clean up the event listener to prevent it from firing multiple times
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
                    <button class="btn btn-sm btn-outline-primary edit-staged-question-btn" data-index="${index}"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger delete-staged-question-btn" data-index="${index}"><i class="bi bi-trash"></i></button>
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

        const onModalHidden = () => {
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
                    <button class="btn btn-sm btn-outline-primary edit-staged-card-btn" data-index="${index}"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger delete-staged-card-btn" data-index="${index}"><i class="bi bi-trash"></i></button>
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

        const onQuizModalHidden = () => {
            if (subjectModal) subjectModal.show();
            if (contentEditorReturnContext === 'subjectModal') { // MODIFIED
                if (subjectModal) subjectModal.show();
            } else {
                if (topicEditorModal) topicEditorModal.show();
            }
            // Clean up the one-time event listener
            stagedQuizEditorModalEl.removeEventListener('hidden.bs.modal', onQuizModalHidden);
        };

        if (stagedQuizEditorModalEl) stagedQuizEditorModalEl.addEventListener('hidden.bs.modal', onQuizModalHidden);
        if (stagedQuizEditorModal) stagedQuizEditorModal.hide();
    }

    function handleStagedFlashcardEditorDone() {
        currentStagedTopicIndex = null; // Clear context immediately

        const onFlashcardModalHidden = () => {
            if (subjectModal) subjectModal.show();
            if (contentEditorReturnContext === 'subjectModal') { // MODIFIED
                if (subjectModal) subjectModal.show();
            } else {
                if (topicEditorModal) topicEditorModal.show();
            }
            // Clean up the one-time event listener
            stagedFlashcardEditorModalEl.removeEventListener('hidden.bs.modal', onFlashcardModalHidden);
        };

        if (stagedFlashcardEditorModalEl) stagedFlashcardEditorModalEl.addEventListener('hidden.bs.modal', onFlashcardModalHidden);
        if (stagedFlashcardEditorModal) stagedFlashcardEditorModal.hide();
    }

    // --- Existing Content Editors ---

    function openExistingQuizEditor(topicIndex) {
        currentTopicIndexForEditing = topicIndex;
        const subject = editingSubjectCopy; // Work on the temporary copy
        const topic = subject?.topics[topicIndex];

        if (!topic || !existingQuizEditorModal) return;

        document.getElementById('existingQuizEditorModalLabel').textContent = `Edit Quiz for: ${topic.title}`;
        renderExistingQuizQuestions();
        existingQuizEditorModal.show();
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
            item.innerHTML = `
                <div class="flex-grow-1 me-3">
                    <p class="mb-1 fw-medium">${index + 1}. ${q.text}</p>
                    <small class="text-success">Correct: ${q.options[q.answer]}</small>
                </div>
                <div>
                    <button class="btn btn-sm btn-outline-danger delete-existing-question-btn" data-index="${index}"><i class="bi bi-trash"></i></button>
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
            text: document.getElementById('existingQuizQuestionText').value,
            options: {
                A: document.getElementById('existingQuizOption1').value,
                B: document.getElementById('existingQuizOption2').value,
                C: document.getElementById('existingQuizOption3').value,
                D: document.getElementById('existingQuizOption4').value,
            },
            answer: document.getElementById('existingQuizCorrectAnswer').value
        };

        if (questionId !== '') { // Editing
            topic.quiz[questionId] = questionData;
        } else { // Adding
            if (!topic.quiz) topic.quiz = [];
            topic.quiz.push(questionData);
        }

        // saveSubjects(subjects); // REMOVED: Defer saving.
        renderExistingQuizQuestions();
        form.reset();
        document.getElementById('existingQuizQuestionId').value = '';
    }

    function handleExistingQuizContainerClick(event) {
        const target = event.target.closest('.delete-existing-question-btn');
        if (!target) return;
        // Add delete and edit logic for existing quiz questions here
    }

    // --- Existing Flashcard Editor ---

    function openExistingFlashcardEditor(topicIndex) {
        currentTopicIndexForEditing = topicIndex;
        const subject = editingSubjectCopy; // Work on the temporary copy
        const topic = subject?.topics[topicIndex];

        if (!topic || !existingFlashcardEditorModal) return;

        document.getElementById('existingFlashcardEditorModalLabel').textContent = `Edit Flashcards for: ${topic.title}`;
        renderExistingFlashcards();
        existingFlashcardEditorModal.show();
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
                    <button class="btn btn-sm btn-outline-primary edit-existing-card-btn" data-index="${index}"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger delete-existing-card-btn" data-index="${index}"><i class="bi bi-trash"></i></button>
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

        // saveSubjects(subjects); // REMOVED: Defer saving.
        renderExistingFlashcards();
        form.reset();
        document.getElementById('existingFlashcardId').value = '';
        document.getElementById('existingFlashcardFormLabel').textContent = 'Add New Card';
        document.getElementById('cancelExistingFlashcardEditBtn').classList.add('d-none');
    }

    function handleExistingFlashcardContainerClick(event) {
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
                // saveSubjects(subjects); // REMOVED: Defer saving.
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

        document.getElementById('existingFileEditorModalLabel').textContent = `Manage Files for: ${topic.title}`;
        renderExistingFiles();
        existingFileEditorModal.show();
    }

    function renderExistingFiles() {
        const container = document.getElementById('existingFilesContainer');
        const subject = editingSubjectCopy; // Work on the temporary copy
        const files = subject?.topics[currentTopicIndexForEditing]?.files || [];
        container.innerHTML = '';

        if (files.length === 0) {
            container.innerHTML = '<p class="text-center text-muted">No files uploaded yet.</p>';
            return;
        }

        const list = document.createElement('div');
        list.className = 'list-group';
        files.forEach((file, index) => {
            let fileUrl = '#';
            try {
                // Create a Blob from the data URI for more reliable linking
                const blob = dataURItoBlob(file.dataUrl);
                fileUrl = URL.createObjectURL(blob);
            } catch (e) {
                console.error(`Failed to create Blob URL for ${file.name}:`, e);
            }

            const item = document.createElement('div');
            item.className = 'list-group-item d-flex justify-content-between align-items-center';
            item.innerHTML = `
                <a href="${fileUrl}" target="_blank" rel="noopener noreferrer" class="text-decoration-none text-dark flex-grow-1 me-3" title="Click to open file">
                    <i class="bi bi-file-earmark-text me-2"></i>
                    <span class="fw-medium">${file.name}</span>
                    <small class="text-muted ms-2">(${(file.size / 1024).toFixed(2)} KB)</small>
                </a>
                <div>
                    <button class="btn btn-sm btn-outline-danger delete-existing-file-btn" data-index="${index}" title="Delete File"><i class="bi bi-trash"></i></button>
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
        const topic = subject?.topics[currentTopicIndexForEditing];
        if (!topic || fileInput.files.length === 0) return;

        const file = fileInput.files[0];
        if (file.size > 3 * 1024 * 1024) { // Max 3MB
            alert(`File "${file.name}" is too large (max 3MB).`);
            return;
        }

        try {
            const fileDataUrl = await readFileAsDataURL(file);
            if (!topic.files) topic.files = [];
            topic.files.push({
                name: file.name,
                size: file.size,
                dataUrl: fileDataUrl
            });
            // saveSubjects(subjects); // REMOVED: Defer saving.
            renderExistingFiles();
            fileInput.value = ''; // Clear input
        } catch (error) {
            console.error("Error reading file:", error);
            alert("There was an error reading the file. Please try again.");
        }
    }

    function handleExistingFilesContainerClick(event) {
        const target = event.target.closest('.delete-existing-file-btn');
        if (!target) return;

        const subject = editingSubjectCopy; // Work on the temporary copy
        const topic = subject?.topics[currentTopicIndexForEditing];
        if (!topic) return;

        const index = target.dataset.index;
        if (confirm('Are you sure you want to delete this file?')) {
            topic.files.splice(index, 1);
            // saveSubjects(subjects); // REMOVED: Defer saving.
            renderExistingFiles();
        }
    }

    // --- Initial Setup ---
    function init() {
        // Check if the subjects key exists in localStorage.
        const storedSubjects = localStorage.getItem(SUBJECTS_STORAGE_KEY);
        if (!storedSubjects) {
            // Only initialize with default data if the key does not exist at all.
            // This prevents accidental data wipes if the user has zero subjects.
            console.log("No subjects key found in localStorage. Initializing with default data.");
            subjects = getInitialData();
            saveSubjects(subjects);
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

        if (subjectForm) {
            subjectForm.addEventListener('submit', handleFormSubmit);
        }
        if (subjectModalEl) {
            subjectModalEl.addEventListener('hide.bs.modal', (event) => {
                if (isSaving) return; // Don't show prompt if we are in the process of saving.

                if (editingSubjectCopy) {
                    const originalSubject = subjects.find(s => s.id === currentEditingSubjectId);
                    // Compare stringified versions to detect changes.
                    if (JSON.stringify(originalSubject) !== JSON.stringify(editingSubjectCopy)) {
                        if (!confirm('You have unsaved changes. Are you sure you want to discard them?')) {
                            event.preventDefault(); // Prevent modal from closing if user clicks "Cancel"
                        }
                    }
                }
            });

            subjectModalEl.addEventListener('hidden.bs.modal', () => {
                // When the main subject modal is closed, clear the temporary editing copy.
                editingSubjectCopy = null;
                currentEditingSubjectId = null;
                isSaving = false; // Always reset the saving flag when the modal is fully hidden.
            });
        }
        subjectsTableBody.addEventListener('click', handleTableClick);
        if (addSubjectBtn) addSubjectBtn.addEventListener('click', handleModalOpen);

        // Add new event listeners for filters
        tableSearch.addEventListener('input', applyFiltersAndSearch);
        gradeFilter.addEventListener('change', applyFiltersAndSearch);
        categoryFilter.addEventListener('change', applyFiltersAndSearch);
        strandFilter.addEventListener('change', applyFiltersAndSearch);
        quarterFilter.addEventListener('change', applyFiltersAndSearch);

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
                const topic = stagedTopics[currentStagedTopicIndex];
                if (target.classList.contains('delete-staged-question-btn')) {
                    if (confirm('Delete this question?')) {
                        topic.quiz.splice(index, 1);
                        renderStagedQuizQuestions();
                    }
                }
                // Add edit logic here if needed
            });
        }

        // Listeners for Staged Flashcard Editor
        const stagedFlashcardForm = document.getElementById('stagedFlashcardForm');
        if (stagedFlashcardForm) stagedFlashcardForm.addEventListener('submit', handleStagedFlashcardFormSubmit);
        const cancelFlashcardEditBtn = document.getElementById('cancelFlashcardEditBtn');
        if (cancelFlashcardEditBtn) cancelFlashcardEditBtn.addEventListener('click', resetFlashcardEditorForm);
        // Add delegated listener for flashcard edit/delete here if needed
        const stagedFlashcardEditorDoneBtn = document.getElementById('stagedFlashcardEditorDoneBtn');
        if (stagedFlashcardEditorDoneBtn) stagedFlashcardEditorDoneBtn.addEventListener('click', handleStagedFlashcardEditorDone);
        const stagedQuizEditorDoneBtn = document.getElementById('stagedQuizEditorDoneBtn');
        if (stagedQuizEditorDoneBtn) stagedQuizEditorDoneBtn.addEventListener('click', handleStagedQuizEditorDone);

        // Listeners for Existing Flashcard Editor
        const existingFlashcardForm = document.getElementById('existingFlashcardForm');
        if (existingFlashcardForm) existingFlashcardForm.addEventListener('submit', handleExistingFlashcardFormSubmit);
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