document.addEventListener('DOMContentLoaded', () => {

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

    // --- Classroom Cards Data (Subject to Teach) ---    
    // This data is now dynamically generated based on the teacher's assignments and the main subject library.
    // In a real app, this assignment list would come from a user-specific API call.
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

    const teacherAssignedClasses = [
        { subjectName: "General Physics 1", section: "Sigma Technocrats", students: 38 },
        { subjectName: "Finite Mathematics 1", section: "Engineering", students: 42 },
        { subjectName: "Creative Writing/Malikhaing Pagsulat", section: "Criminology 1", students: 28 },
        { subjectName: "General Mathematics", section: "All Sections", students: 180 }
    ];

    let classroomCardsData = []; // This will be populated dynamically in init()

    // Generates classroom cards by merging teacher assignments with full subject details from the library.
    function generateClassroomCards(allSubjects, assignments) {
        const cards = assignments.map((assignment, index) => {
            const subjectDetails = allSubjects.find(s => s.name === assignment.subjectName);

            if (!subjectDetails) {
                console.warn(`Subject "${assignment.subjectName}" for an assigned class not found in the main subject library.`);
                return null; // Skip cards for subjects not found in the library
            }

            return {
                id: `class${index + 1}`,
                name: subjectDetails.name,
                strand: subjectDetails.strand || "Common",
                gradeLevel: subjectDetails.gradeLevel != null ? subjectDetails.gradeLevel : (subjectDetails.grade_level != null ? subjectDetails.grade_level : 11),
                section: assignment.section,
                students: assignment.students,
                color: subjectDetails.color || "bg-card-blue", // Fallback color
                category: subjectDetails.category || subjectDetails.classification || "Core Subject",
                quarter: subjectDetails.quarter != null ? subjectDetails.quarter : 1
            };
        }).filter(card => card !== null); // Remove any null entries

        return cards;
    }

    const DEFAULT_SUBJECTS = [
        // ===================== GRADE 11 =====================
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

        // ASSH Specialized
        { name: "Creative Composition 1", code: "CREAT_COMP1", category: "Specialized Subject", strandSection: "ASSH 11", gradeLevel: 11, strand: "ASSH", quarter: 1, color: "bg-card-purple", description: "Foundational creative writing techniques, poetry, and narrative craft." },
        { name: "Creative Composition 2", code: "CREAT_COMP2", category: "Specialized Subject", strandSection: "ASSH 11", gradeLevel: 11, strand: "ASSH", quarter: 2, color: "bg-card-blue", description: "Advanced narrative, dramatic, and poetic composition workshop." },
        { name: "Filipino 1", code: "FIL1", category: "Specialized Subject", strandSection: "ASSH 11", gradeLevel: 11, strand: "ASSH", quarter: 3, color: "bg-card-green", description: "Pagsulat at kritikal na pagsusuri ng mga akademikong sulatin sa Filipino." },
        { name: "Philippine Governance", code: "PHILGOV", category: "Specialized Subject", strandSection: "ASSH 11", gradeLevel: 11, strand: "ASSH", quarter: 1, color: "bg-card-orange", description: "Structure, politics, and civic institutions of Philippine government." },
        { name: "Citizenship and Civic Engagement", code: "CITIZEN_ENG", category: "Specialized Subject", strandSection: "ASSH 11", gradeLevel: 11, strand: "ASSH", quarter: 2, color: "bg-card-purple", description: "Community participation, civic responsibility, and democratic engagement." },
        { name: "Social Sciences", code: "SOCSCI", category: "Specialized Subject", strandSection: "ASSH 11", gradeLevel: 11, strand: "ASSH", quarter: 3, color: "bg-card-blue", description: "Theories and methodologies across psychology, sociology, and political science." },

        // STEM Specialized
        { name: "Biology 1", code: "BIO1", category: "Specialized Subject", strandSection: "STEM 11", gradeLevel: 11, strand: "STEM", quarter: 1, color: "bg-card-green", description: "Cellular biology, biochemistry, organelles, and bioenergetic pathways." },
        { name: "Biology 2", code: "BIO2", category: "Specialized Subject", strandSection: "STEM 11", gradeLevel: 11, strand: "STEM", quarter: 2, color: "bg-card-blue", description: "Plant and animal anatomy, physiology, and organ transport systems." },
        { name: "Biology 3", code: "BIO3", category: "Specialized Subject", strandSection: "STEM 11", gradeLevel: 11, strand: "STEM", quarter: 3, color: "bg-card-orange", description: "Genetics, evolution, ecological balance, and biological diversity." },
        { name: "Finite Mathematics 1", code: "FINMATH1", category: "Specialized Subject", strandSection: "STEM 11", gradeLevel: 11, strand: "STEM", quarter: 1, color: "bg-card-purple", description: "Set theory, matrix algebra, linear systems, and financial mathematics." },
        { name: "Finite Mathematics 2", code: "FINMATH2", category: "Specialized Subject", strandSection: "STEM 11", gradeLevel: 11, strand: "STEM", quarter: 2, color: "bg-card-blue", description: "Combinatorics, probability distributions, Markov models, and game theory." },
        { name: "Pre-Calculus", code: "PRECALC", category: "Specialized Subject", strandSection: "STEM 11", gradeLevel: 11, strand: "STEM", quarter: 3, color: "bg-card-green", description: "Analytic geometry, conic sections, sequences, and trigonometry." },

        // H&T Specialized
        { name: "Bakery Operation NC II", code: "BAKERY_NC2", category: "Specialized Subject", strandSection: "H&T 11", gradeLevel: 11, strand: "H&T", quarter: 0, color: "bg-card-orange", description: "Commercial bread and pastry production, baking science, and kitchen hygiene." },

        // ===================== GRADE 12 =====================
        { name: "Introduction to the Philosophy of the Human Person", code: "PHILO", category: "Core Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", quarter: 1, color: "bg-card-purple", description: "Philosophical methods, human freedom, and ethical personhood in society." },
        { name: "Understanding Culture, Society and Politics", code: "UCSP", category: "Core Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", quarter: 1, color: "bg-card-blue", description: "Anthropological and sociological analysis of human cultural evolution." },
        { name: "Physical Education and Health", code: "PEH12_1", category: "Core Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", quarter: 1, color: "bg-card-green", description: "Physical fitness assessment, recreational health, and active movement." },
        { name: "English for Academic and Professional Purposes", code: "EAPP", category: "Applied Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", quarter: 1, color: "bg-card-orange", description: "Academic research critique, proposal defense, and professional papers." },
        { name: "Fundamentals of Accountancy, Business and Management 2", code: "FABM2", category: "Specialized Subject", strandSection: "ABM 12", gradeLevel: 12, strand: "ABM", quarter: 1, color: "bg-card-blue", description: "Preparation of financial statements, cash flow, and accounting worksheets." },
        { name: "Business Finance", code: "BUSFIN", category: "Specialized Subject", strandSection: "ABM 12", gradeLevel: 12, strand: "ABM", quarter: 1, color: "bg-card-green", description: "Capital budgeting, working capital, investment risks, and financial planning." },
        { name: "Community Engagement, Solidarity, and Citizenship", code: "CESC", category: "Specialized Subject", strandSection: "HUMSS 12", gradeLevel: 12, strand: "HUMSS", quarter: 1, color: "bg-card-orange", description: "Community development models, civic engagement, and human rights advocacy." },
        { name: "Creative Writing/Malikhaing Pagsulat", code: "CREAT_WRIT", category: "Specialized Subject", strandSection: "HUMSS 12", gradeLevel: 12, strand: "HUMSS", quarter: 1, color: "bg-card-purple", description: "Writing poetry, drama, fiction, and creative literary techniques." },
        { name: "General Physics 1", code: "GENPHYS1", category: "Specialized Subject", strandSection: "STEM 12", gradeLevel: 12, strand: "STEM", quarter: 1, color: "bg-card-blue", description: "Classical mechanics, vectors, rotational equilibrium, and fluid statics." },
        { name: "General Chemistry 1", code: "GENCHEM1", category: "Specialized Subject", strandSection: "STEM 12", gradeLevel: 12, strand: "STEM", quarter: 1, color: "bg-card-green", description: "Atomic structure, chemical equations, stoichiometric calculations, and gas laws." },
        { name: "Cookery", code: "COOKERY", category: "Specialized Subject", strandSection: "HE 12", gradeLevel: 12, strand: "HE", quarter: 0, color: "bg-card-orange", description: "Hot and cold meal preparation, kitchen safety, and culinary sanitation standards." },

        // 2nd Term
        { name: "Contemporary Philippine Arts from the Regions", code: "CPAR", category: "Core Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", quarter: 2, color: "bg-card-purple", description: "Contemporary visual, literary, and performing arts across Philippine regions." },
        { name: "Personal Development", code: "PERDEV", category: "Core Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", quarter: 2, color: "bg-card-blue", description: "Adolescent developmental psychology, self-concept, and interpersonal growth." },
        { name: "Physical Education and Health 2", code: "PEH12_2", category: "Core Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", quarter: 2, color: "bg-card-green", description: "Community fitness, team sports, and sustainable healthy habits." },
        { name: "Practical Research 2", code: "PRACRES2", category: "Applied Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", quarter: 2, color: "bg-card-orange", description: "Quantitative research methodology, statistical instrumentation, and analysis." },
        { name: "Applied Economics", code: "APPLIED_ECON", category: "Specialized Subject", strandSection: "ABM 12", gradeLevel: 12, strand: "ABM", quarter: 2, color: "bg-card-blue", description: "Economic laws of supply, demand, market structures, and contemporary industries." },
        { name: "Business Ethics and Social Responsibility", code: "BUS_ETHICS", category: "Specialized Subject", strandSection: "ABM 12", gradeLevel: 12, strand: "ABM", quarter: 2, color: "bg-card-green", description: "Philosophical principles of business conduct and corporate social impact." },
        { name: "Trends, Networks and Critical Thinking in the 21st Century Culture", code: "TRENDS", category: "Specialized Subject", strandSection: "HUMSS 12", gradeLevel: 12, strand: "HUMSS", quarter: 2, color: "bg-card-purple", description: "Global trends, planetary networks, critical analytical thinking, and tech ethics." },
        { name: "Creative Non-Fiction", code: "CREAT_NONFIC", category: "Specialized Subject", strandSection: "HUMSS 12", gradeLevel: 12, strand: "HUMSS", quarter: 2, color: "bg-card-orange", description: "Memoir, profile writing, journalistic essays, and literary nonfiction." },
        { name: "General Physics 2", code: "GENPHYS2", category: "Specialized Subject", strandSection: "STEM 12", gradeLevel: 12, strand: "STEM", quarter: 2, color: "bg-card-blue", description: "Electricity, circuits, magnetism, wave optics, and modern quantum physics." },
        { name: "General Chemistry 2", code: "GENCHEM2", category: "Specialized Subject", strandSection: "STEM 12", gradeLevel: 12, strand: "STEM", quarter: 2, color: "bg-card-green", description: "Chemical kinetics, equilibrium, acid-base chemistry, and thermodynamics." },

        // 3rd Term
        { name: "Media and Information Literacy", code: "MIL", category: "Core Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", quarter: 3, color: "bg-card-purple", description: "Digital media analysis, copyright literacy, and ethical media production." },
        { name: "Entrepreneurship", code: "ENTREP", category: "Applied Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", quarter: 3, color: "bg-card-orange", description: "Business enterprise planning, market feasibility, and startup management." },
        { name: "Inquiries, Investigations and Immersion", code: "III", category: "Applied Subject", strandSection: "All Sections", gradeLevel: 12, strand: "Common", quarter: 3, color: "bg-card-blue", description: "Capstone interdisciplinary research defense and scholarly publication." },
        { name: "Business Enterprise Simulation, or Work Immersion", code: "BES_IMMERSION", category: "Specialized Subject", strandSection: "ABM 12", gradeLevel: 12, strand: "ABM", quarter: 3, color: "bg-card-green", description: "On-site business enterprise simulation or field work immersion for ABM." },
        { name: "Culminating Activity or Work Immersion", code: "CULM_IMMERSION", category: "Specialized Subject", strandSection: "HUMSS 12", gradeLevel: 12, strand: "HUMSS", quarter: 3, color: "bg-card-purple", description: "Culminating exhibition, creative portfolio, or field internship for HUMSS." },
        { name: "Work Immersion or Research or Career Advocacy", code: "WRCA_IMMERSION", category: "Specialized Subject", strandSection: "STEM 12", gradeLevel: 12, strand: "STEM", quarter: 3, color: "bg-card-blue", description: "Scientific laboratory immersion, tech development, or career research for STEM." },
        { name: "Work Immersion", code: "WORK_IMMERSION", category: "Specialized Subject", strandSection: "HE 12", gradeLevel: 12, strand: "HE", quarter: 3, color: "bg-card-orange", description: "Direct industry apprenticeship and practical workplace immersion." }
    ];

    function saveSubjects(subjectsToSave) {
        localStorage.setItem(SUBJECTS_STORAGE_KEY, JSON.stringify(subjectsToSave));
    }

    function loadSubjects() {
        const storedSubjects = localStorage.getItem(SUBJECTS_STORAGE_KEY);
        if (!storedSubjects) {
            saveSubjects(DEFAULT_SUBJECTS);
            return [...DEFAULT_SUBJECTS];
        }
        try {
            const subjectsData = JSON.parse(storedSubjects);
            if (!Array.isArray(subjectsData) || subjectsData.length === 0) {
                saveSubjects(DEFAULT_SUBJECTS);
                return [...DEFAULT_SUBJECTS];
            }
            // Data migration: Check if subjects have the quarter property to ensure compatibility.
            const needsMigration = subjectsData.some(s => typeof s.quarter === 'undefined');
            if (needsMigration) {
                subjectsData.forEach(subject => {
                    if (typeof subject.quarter === 'undefined') {
                        subject.quarter = typeof subject.semester === 'number' ? subject.semester : 1;
                        delete subject.semester;
                    }
                });
                saveSubjects(subjectsData);
            }
            return subjectsData;
        } catch (e) {
            saveSubjects(DEFAULT_SUBJECTS);
            return [...DEFAULT_SUBJECTS];
        }
    }

    // DOM Elements
    const classroomsGrid = document.getElementById('classroomsGrid');
    const classSearch = document.getElementById('classSearch');
    const classFilterQuarter = document.getElementById('classFilterQuarter');
    const classFilterGrade = document.getElementById('classFilterGrade');
    const classFilterStrand = document.getElementById('classFilterStrand');
    const classFilterSection = document.getElementById('classFilterSection');
    const classFilterCategory = document.getElementById('classFilterCategory');

    const subjectLibraryList = document.getElementById('subjectLibraryList');
    const librarySearch = document.getElementById('librarySearch');
    const libraryFilterQuarter = document.getElementById('libraryFilterQuarter');
    const libraryFilterGrade = document.getElementById('libraryFilterGrade');
    const libraryFilterStrand = document.getElementById('libraryFilterStrand');
    const libraryFilterCategory = document.getElementById('libraryFilterCategory');


    // Update the Strand filter dropdown based on the selected Grade Level
    function updateStrandFilter() {
        const selectedGrade = libraryFilterGrade.value;
        const currentStrandValue = libraryFilterStrand.value; // Save current selection

        let availableStrands = [...new Set(allSubjects.map(s => s.strand).filter(Boolean))];
        if (selectedGrade !== 'All') {
            const allowed = STRANDS_BY_GRADE[selectedGrade] || [];
            availableStrands = availableStrands.filter(s => allowed.includes(s));
        }

        libraryFilterStrand.innerHTML = ''; // Clear current options

        // Add the "All Strands" option first
        const allOption = document.createElement('option');
        allOption.value = 'All';
        allOption.textContent = 'All Strands';
        libraryFilterStrand.appendChild(allOption);

        // Add the other sorted, unique strands with Common first
        availableStrands.sort((a, b) => {
            if (a === 'Common') return -1;
            if (b === 'Common') return 1;
            return a.localeCompare(b);
        }).forEach(strand => {
            const option = document.createElement('option');
            option.value = strand;
            option.textContent = strand === 'Common' ? 'Common (All Strands)' : strand;
            libraryFilterStrand.appendChild(option);
        });

        // Restore the previous selection if it's still valid, otherwise default to "All"
        libraryFilterStrand.value = Array.from(libraryFilterStrand.options).some(opt => opt.value === currentStrandValue) ? currentStrandValue : 'All';
    }

    // Update the Strand filter dropdown for Classroom Cards based on the selected Grade Level
    function updateClassroomStrandFilter() {
        const selectedGrade = classFilterGrade.value;
        const currentStrandValue = classFilterStrand.value;

        let availableStrands = [...new Set(classroomCardsData.map(s => s.strand).filter(Boolean))];
        if (selectedGrade !== 'All') {
            const allowed = STRANDS_BY_GRADE[selectedGrade] || [];
            availableStrands = availableStrands.filter(s => allowed.includes(s));
        }

        classFilterStrand.innerHTML = '';
        const allOption = document.createElement('option');
        allOption.value = 'All';
        allOption.textContent = 'All Strands';
        classFilterStrand.appendChild(allOption);

        availableStrands.sort((a, b) => {
            if (a === 'Common') return -1;
            if (b === 'Common') return 1;
            return a.localeCompare(b);
        }).forEach(strand => {
            const option = document.createElement('option');
            option.value = strand;
            option.textContent = strand === 'Common' ? 'Common (All Strands)' : strand;
            classFilterStrand.appendChild(option);
        });
        classFilterStrand.value = Array.from(classFilterStrand.options).some(opt => opt.value === currentStrandValue) ? currentStrandValue : 'All';
    }

    // Update the Section filter dropdown for Classroom Cards based on the selected Grade and Strand
    function updateClassroomSectionFilter() {
        const selectedGrade = classFilterGrade.value;
        const selectedStrand = classFilterStrand.value;
        const currentSectionValue = classFilterSection.value;

        let availableSections;
        if (selectedGrade === 'All' && selectedStrand === 'All') {
            availableSections = [...new Set(classroomCardsData.map(s => s.section).filter(Boolean))];
        } else {
            availableSections = [...new Set(classroomCardsData.filter(s =>
                (selectedGrade === 'All' || s.gradeLevel == selectedGrade) &&
                (selectedStrand === 'All' || s.strand === selectedStrand || s.strand === 'Common')
            ).map(s => s.section).filter(Boolean))];
        }

        classFilterSection.innerHTML = '';
        const allOption = document.createElement('option');
        allOption.value = 'All';
        allOption.textContent = 'All Sections';
        classFilterSection.appendChild(allOption);

        availableSections.sort((a, b) => {
            if (a === 'All Sections') return -1;
            if (b === 'All Sections') return 1;
            return a.localeCompare(b);
        }).forEach(section => {
            const option = document.createElement('option');
            option.value = section;
            option.textContent = section;
            classFilterSection.appendChild(option);
        });
        classFilterSection.value = Array.from(classFilterSection.options).some(opt => opt.value === currentSectionValue) ? currentSectionValue : 'All';
    }

    // Render classroom cards
    function renderClassroomCards(cardsToRender) {
        classroomsGrid.innerHTML = ''; // Clear existing cards

        if (cardsToRender.length === 0) {
            classroomsGrid.innerHTML = '<div class="col-12"><p class="text-muted text-center">No classes found matching your criteria.</p></div>';
            return;
        }

        cardsToRender.forEach(card => {
            const classCard = document.createElement('div');
            classCard.className = 'col';
            classCard.innerHTML = `
                <div class="card classroom-card border-0 shadow-sm overflow-hidden h-100 d-flex flex-column">
                    <div class="classroom-banner ${card.color} p-3 text-white d-flex justify-content-between align-items-start position-relative">
                        <div class="banner-dots">
                            <span class="dot bg-white opacity-75"></span>
                            <span class="dot bg-white opacity-50"></span>
                            <span class="dot bg-white opacity-75"></span>
                        </div>
                        <button class="btn btn-link text-white p-0 fs-5"><i class="bi bi-three-dots"></i></button>
                    </div>
                    <div class="card-body p-3 bg-white d-flex flex-column flex-grow-1">
                        <div class="d-flex justify-content-between align-items-start flex-grow-1">
                            <div>
                                <h3 class="fw-bold m-0 fs-6 text-dark">${card.name}</h3>
                                <span class="micro-text text-muted fw-semibold">${card.strand}-${card.gradeLevel}: ${card.section}</span>
                            </div>
                            <span class="badge bg-light text-dark border micro-text"><i class="bi bi-people-fill text-success me-1"></i>${card.students}</span>
                        </div>
                        <a href="subject_detail_teacher.html?subject=${encodeURIComponent(card.name)}&section=${encodeURIComponent(card.section)}" class="btn btn-sm btn-study-action w-100 fw-bold text-white rounded-pill mt-3 text-decoration-none">Study</a>
                    </div>
                </div>
            `;
            classroomsGrid.appendChild(classCard);
        });
    }

    // Render subject cards
    function renderSubjects(subjectsToRender) {
        subjectLibraryList.innerHTML = ''; // Clear existing subjects

        if (subjectsToRender.length === 0) {
            subjectLibraryList.innerHTML = '<div class="col-12"><p class="text-muted text-center">No subjects found matching your criteria.</p></div>';
            return;
        }

        subjectsToRender.forEach(subject => {
            const bannerColor = subject.color || 'bg-card-blue';
            const subCode = subject.code || '';
            const subName = subject.name || '';
            const subDesc = subject.description || '';

            const subjectCard = document.createElement('div');
            subjectCard.className = 'col';
            subjectCard.innerHTML = `
                <div class="card classroom-card subject-item-card border-0 shadow-sm overflow-hidden h-100 d-flex flex-column">
                    <div class="classroom-banner ${bannerColor} p-3 text-white">
                        <h3 class="fw-bold m-0 fs-6 text-white">${subCode}</h3>
                        <p class="micro-text text-white-50 m-0">${subName}</p>
                    </div>
                    <div class="card-body p-3 bg-white d-flex flex-column flex-grow-1">
                        <p class="small text-secondary m-0 card-desc-text flex-grow-1">${subDesc}</p>
                        <a href="subject_detail_teacher.html?subject=${encodeURIComponent(subName)}" class="btn btn-sm btn-study-action w-100 fw-bold text-white rounded-pill mt-3 text-decoration-none">Study</a>
                    </div>
                </div>
            `;
            subjectLibraryList.appendChild(subjectCard);
        });
    }

    // Apply filters and re-render subjects for Subject Library
    function applyFilters() {
        const searchQuery = librarySearch.value.toLowerCase();
        const selectedGrade = libraryFilterGrade.value;
        const selectedStrand = libraryFilterStrand.value;
        const selectedCategory = libraryFilterCategory.value;
        const selectedQuarter = libraryFilterQuarter.value;

        let filteredSubjects = allSubjects.filter(subject => {
            const subjGrade = subject.gradeLevel != null ? subject.gradeLevel : subject.grade_level;
            const subjStrand = subject.strand || 'Common';
            const subjCategory = subject.category || subject.classification || 'Core Subject';
            const subjQuarter = subject.quarter != null ? subject.quarter : 1;

            const gradeMatch = selectedGrade === "All" || subjGrade == selectedGrade;
            const strandMatch = selectedStrand === "All" || subjStrand === selectedStrand || subjStrand === "Common";
            const categoryMatch = selectedCategory === "All Categories" || subjCategory === selectedCategory;
            
            let quarterMatch = false;
            if (selectedQuarter === "All") {
                quarterMatch = true;
            } else {
                quarterMatch = (subjQuarter == selectedQuarter || subjQuarter == 0);
            }

            const searchMatch = !searchQuery ||
                (subject.name && subject.name.toLowerCase().includes(searchQuery)) ||
                (subject.code && subject.code.toLowerCase().includes(searchQuery));

            return gradeMatch && strandMatch && categoryMatch && quarterMatch && searchMatch;
        });

        renderSubjects(filteredSubjects);
    }

    // Apply filters and re-render classroom cards for Subject to Teach
    function applyClassroomFilters() {
        const searchQuery = classSearch.value.toLowerCase();
        const selectedGrade = classFilterGrade.value;
        const selectedStrand = classFilterStrand.value;
        const selectedSection = classFilterSection.value;
        const selectedCategory = classFilterCategory.value;
        const selectedQuarter = classFilterQuarter.value;

        const filteredClassrooms = classroomCardsData.filter(card => {
            const gradeMatch = selectedGrade === "All" || card.gradeLevel == selectedGrade;
            const strandMatch = selectedStrand === "All" || card.strand === selectedStrand || card.strand === "Common";
            const sectionMatch = selectedSection === "All" || card.section === selectedSection || card.section === "All Sections";
            const categoryMatch = selectedCategory === "All Categories" || card.category === selectedCategory;
            
            let quarterMatch = false;
            if (selectedQuarter === "All") {
                quarterMatch = true;
            } else {
                quarterMatch = (card.quarter == selectedQuarter || card.quarter == 0);
            }

            const searchMatch = !searchQuery ||
                card.name.toLowerCase().includes(searchQuery);

            return gradeMatch && strandMatch && sectionMatch && categoryMatch && quarterMatch && searchMatch;
        });

        renderClassroomCards(filteredClassrooms);
    }

    // --- Initial Load ---
    async function init() {
        allSubjects = loadSubjects();

        // Generate the classroom cards dynamically based on teacher assignments and the subject library.
        classroomCardsData = generateClassroomCards(allSubjects, teacherAssignedClasses);

        // Sort the main subject list alphabetically by name right after loading.
        allSubjects.sort((a, b) => a.name.localeCompare(b.name));

        // Subject Library Filters
        librarySearch.addEventListener('input', applyFilters);
        libraryFilterQuarter.addEventListener('change', applyFilters);
        libraryFilterGrade.addEventListener('change', () => {
            updateStrandFilter();
            applyFilters();
        });
        libraryFilterStrand.addEventListener('change', () => {
            if (libraryFilterStrand.value !== 'All' && libraryFilterStrand.value !== 'Common') {
                const autoGrade = STRAND_GRADE_MAP[libraryFilterStrand.value];
                if (autoGrade && libraryFilterGrade.value !== autoGrade) {
                    const chosen = libraryFilterStrand.value;
                    libraryFilterGrade.value = autoGrade;
                    updateStrandFilter();
                    libraryFilterStrand.value = chosen;
                }
            }
            applyFilters();
        });
        libraryFilterCategory.addEventListener('change', applyFilters);

        // Classroom Cards Filters
        classSearch.addEventListener('input', applyClassroomFilters);
        classFilterQuarter.addEventListener('change', applyClassroomFilters);
        classFilterGrade.addEventListener('change', () => {
            updateClassroomStrandFilter();
            updateClassroomSectionFilter();
            applyClassroomFilters();
        });
        classFilterStrand.addEventListener('change', () => {
            if (classFilterStrand.value !== 'All' && classFilterStrand.value !== 'Common') {
                const autoGrade = STRAND_GRADE_MAP[classFilterStrand.value];
                if (autoGrade && classFilterGrade.value !== autoGrade) {
                    const chosen = classFilterStrand.value;
                    classFilterGrade.value = autoGrade;
                    updateClassroomStrandFilter();
                    classFilterStrand.value = chosen;
                }
            }
            updateClassroomSectionFilter();
            applyClassroomFilters();
        });
        classFilterSection.addEventListener('change', applyClassroomFilters);
        classFilterCategory.addEventListener('change', applyClassroomFilters);

        // Initial Render
        updateStrandFilter();
        applyFilters();
        updateClassroomStrandFilter();
        updateClassroomSectionFilter();
        applyClassroomFilters();

        await syncSubjectsFromDatabase();
        syncTopicsFromDatabase();
    }

    async function syncSubjectsFromDatabase() {
        const token = localStorage.getItem('mentorae_token');
        if (!token) return;
        try {
            const data = await authedFetch('/api/reference/subjects', token);
            if (data && data.success && Array.isArray(data.subjects) && data.subjects.length > 0) {
                allSubjects = data.subjects;
                allSubjects.sort((a, b) => a.name.localeCompare(b.name));
                saveSubjects(allSubjects);

                try {
                    const assignedData = await authedFetch('/api/classes/my-assigned-classes', token);
                    if (assignedData && assignedData.success && Array.isArray(assignedData.assignedClasses) && assignedData.assignedClasses.length > 0) {
                        const colorPalette = ['bg-card-green', 'bg-card-blue', 'bg-card-purple', 'bg-card-orange'];
                        classroomCardsData = assignedData.assignedClasses.map((ac, idx) => {
                            const subInfo = allSubjects.find(s => s.name === ac.subjectName) || {};
                            return {
                                id: `class${idx + 1}`,
                                name: ac.subjectName,
                                code: ac.subjectCode || subInfo.code || '',
                                strand: ac.strand || subInfo.strand || 'STEM',
                                gradeLevel: ac.gradeLevel != null ? ac.gradeLevel : (subInfo.gradeLevel || 11),
                                section: ac.sectionName,
                                students: ac.studentCount != null ? ac.studentCount : 0,
                                color: subInfo.color || colorPalette[idx % colorPalette.length],
                                category: ac.category || subInfo.category || 'Specialized Subject',
                                quarter: ac.quarter != null ? ac.quarter : (subInfo.quarter || 1),
                                isAdvisory: Boolean(ac.isAdvisory)
                            };
                        });
                    } else {
                        classroomCardsData = generateClassroomCards(allSubjects, teacherAssignedClasses);
                    }
                } catch (assignErr) {
                    console.warn('Could not fetch teacher assigned classes from backend:', assignErr);
                    classroomCardsData = generateClassroomCards(allSubjects, teacherAssignedClasses);
                }

                updateStrandFilter();
                applyFilters();
                updateClassroomStrandFilter();
                updateClassroomSectionFilter();
                applyClassroomFilters();
            }
        } catch (e) {
            console.error('Failed to sync subjects from database:', e);
        }
    }

    async function syncTopicsFromDatabase() {
        const token = localStorage.getItem('mentorae_token');
        if (!token) return;
        try {
            const data = await authedFetch('/api/content/topics', token);
            if (data && data.success && Array.isArray(data.topics)) {
                let updated = false;
                allSubjects.forEach(subject => {
                    const matchedTopics = data.topics.filter(t => t.subjectName === subject.name && !t.isRecommendation);
                    const matchedRecs = (data.recommendations || []).filter(t => t.subjectName === subject.name);
                    if (matchedTopics.length > 0 || matchedRecs.length > 0) {
                        subject.topics = matchedTopics;
                        subject.recommendations = matchedRecs;
                        updated = true;
                    }
                });
                if (updated) {
                    saveSubjects(allSubjects);
                    applyFilters();
                    applyClassroomFilters();
                }
            }
        } catch (e) {
            console.error('Failed to sync topics from database:', e);
        }
    }

    init();
});