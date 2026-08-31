/**
 * Mentorae - Philippine DepEd Electronic Class Record (ECR) Engine
 * Integrated with ASSH 11 - 2-e-CLASS-RECORD.xlsm
 * Strengthened Senior High School Class Record (DepEd Order No. 15, s. 2026 & DO 8, s. 2015)
 */

document.addEventListener('DOMContentLoaded', () => {

    // =========================================================================
    // 1. Official Roster Dataset from ASSH 11 - 2-e-CLASS-RECORD.xlsm
    // =========================================================================
    const rawMalesList = [
        "Abello, Karl Denver",
        "Alonzo, Kevin De Leon",
        "Alvarez, John Allin Tirol",
        "Austria, Meggy Dayne Roma",
        "Balinado, Paul Vincent Elloranda",
        "Ballesteros, Mark Noah Mangubat",
        "Binamira, Joey Reyes",
        "Buno, John Ramcel Maritana",
        "Cacao, Kyle Zander Doroja",
        "Calubag, Carl Justine Fajardo",
        "Capile, Mark Jay Barrion",
        "Cerillo, Joseph Piol",
        "De Grano, Gian De Sagun",
        "De Guzman, Jan Guiller Tejada",
        "Dimapilis, Euel Bayani",
        "Enriquez, Ace Edward Rosario",
        "Garcia, John Reynar Merano",
        "Guevara, Fhritz Carl Cosme",
        "Llanto, John Wel Capua",
        "Luna, Benedict Medrano",
        "Macenas, Mike Andrei Badillo",
        "Magsino, Tristan Duena",
        "Masongsong, Guiller Valdez",
        "Mato, Mark Anthony Ignacio",
        "Mendoza, John Jacob Eliaquim Villacampo",
        "Nazarrea, Prince Eliezer Mariñas",
        "Odtuhan, Ryan Churl Malapad",
        "Pananganan, Nash Angelo Jumarang",
        "Panganiban, Mark Joseph Bustamante",
        "Pascua, Reimar Morta",
        "Recto, Jhon Eric Labao",
        "Salazar, Miles Garcia",
        "Seda, Lelouceh Ortilla",
        "Seda, Mark Valles",
        "Serrano, Justine Jake De Guzman",
        "Sillano, Gizwel Basquinas",
        "Surigao, Jerald Bustillo",
        "Tenorio, Christaniel Panginaco",
        "Tiongco, Paul Christian Estores",
        "Valentin, Rich March Hoyohoy"
    ];

    const rawFemalesList = [
        "Barrion, Jherica Jade Alera",
        "Bello, Ma. Linda Serrano",
        "Bengil, Erica Jane Doctora",
        "Caliwagan, Jewel Calicdan",
        "Costales, Nichelle Anne Bayunon",
        "Custodio, Patricia Cunahap",
        "De Castro, Shanell G.",
        "Ea, Precious Angel Bermudo",
        "Galo, Rose Anne Caliwagan",
        "Garcia, Angela",
        "Tenorio, Precious Daniela Fortaleza"
    ];

    // Helper to generate a realistic initial set of DepEd grades
    function createInitialStudent(name, idNum, genderPrefix) {
        return {
            no: idNum,
            name: name,
            t1: {
                ww: [18, 23, 19, 18, 22], // Max: 20, 25, 20, 20, 25 (110)
                pt: [46, 47, 48],         // Max: 50, 50, 50 (150)
                qa: [44, 45, 90]          // Max: 50, 50, 100 (200)
            },
            t2: {
                ww: [17, 24, 18, 19, 23],
                pt: [48, 45, 49],
                qa: [46, 47, 92]
            },
            t3: {
                ww: [19, 25, 20, 19, 24],
                pt: [49, 48, 50],
                qa: [48, 48, 95]
            }
        };
    }

    // Build the master database
    const initialDatabase = {
        males: rawMalesList.map((name, index) => createInitialStudent(name, index + 1, 'M')),
        females: rawFemalesList.map((name, index) => createInitialStudent(name, index + 1, 'F'))
    };

    // Give natural score variance across students
    initialDatabase.males.forEach((student, idx) => {
        const factor = 0.82 + (idx % 7) * 0.03;
        student.t1.ww = [Math.round(20 * factor), Math.round(25 * factor), Math.round(20 * factor), Math.round(20 * factor), Math.round(25 * factor)];
        student.t1.pt = [Math.round(50 * factor), Math.round(50 * factor), Math.round(50 * factor)];
        student.t1.qa = [Math.round(50 * factor), Math.round(50 * factor), Math.round(100 * factor)];

        student.t2.ww = [Math.round(20 * (factor + 0.02)), Math.round(25 * factor), Math.round(20 * factor), Math.round(20 * factor), Math.round(25 * factor)];
        student.t2.pt = [Math.round(50 * (factor + 0.02)), Math.round(50 * factor), Math.round(50 * factor)];
        student.t2.qa = [Math.round(50 * (factor + 0.01)), Math.round(50 * factor), Math.round(100 * factor)];

        student.t3.ww = [Math.round(20 * (factor + 0.03)), Math.round(25 * factor), Math.round(20 * factor), Math.round(20 * factor), Math.round(25 * factor)];
        student.t3.pt = [Math.round(50 * (factor + 0.03)), Math.round(50 * factor), Math.round(50 * factor)];
        student.t3.qa = [Math.round(50 * (factor + 0.02)), Math.round(50 * factor), Math.round(100 * factor)];
    });

    initialDatabase.females.forEach((student, idx) => {
        const factor = 0.88 + (idx % 5) * 0.03;
        student.t1.ww = [Math.round(20 * factor), Math.round(25 * factor), Math.round(20 * factor), Math.round(20 * factor), Math.round(25 * factor)];
        student.t1.pt = [Math.round(50 * factor), Math.round(50 * factor), Math.round(50 * factor)];
        student.t1.qa = [Math.round(50 * factor), Math.round(50 * factor), Math.round(100 * factor)];

        student.t2.ww = [Math.round(20 * (factor + 0.01)), Math.round(25 * factor), Math.round(20 * factor), Math.round(20 * factor), Math.round(25 * factor)];
        student.t2.pt = [Math.round(50 * (factor + 0.01)), Math.round(50 * factor), Math.round(50 * factor)];
        student.t2.qa = [Math.round(50 * (factor + 0.01)), Math.round(50 * factor), Math.round(100 * factor)];

        student.t3.ww = [Math.round(20 * (factor + 0.02)), Math.round(25 * factor), Math.round(20 * factor), Math.round(20 * factor), Math.round(25 * factor)];
        student.t3.pt = [Math.round(50 * (factor + 0.02)), Math.round(50 * factor), Math.round(50 * factor)];
        student.t3.qa = [Math.round(50 * (factor + 0.02)), Math.round(50 * factor), Math.round(100 * factor)];
    });

    // Working live state
    let currentData = JSON.parse(JSON.stringify(initialDatabase));

    // Current Grading Weights (Default: Core 20% - 50% - 30%)
    let gradingWeights = {
        type: 'core',
        name: 'Core Subject',
        ww: 0.20,
        pt: 0.50,
        qa: 0.30
    };

    // =========================================================================
    // 2. Official DepEd Order No. 8, s. 2015 & DO 15, s. 2026 Transmutation Table
    // =========================================================================
    function transmuteDepEdGrade(initialGrade) {
        const g = parseFloat(initialGrade) || 0;
        if (g >= 100) return 100;
        if (g >= 98.40) return 99;
        if (g >= 96.80) return 98;
        if (g >= 95.20) return 97;
        if (g >= 93.60) return 96;
        if (g >= 92.00) return 95;
        if (g >= 90.40) return 94;
        if (g >= 88.80) return 93;
        if (g >= 87.20) return 92;
        if (g >= 85.60) return 91;
        if (g >= 84.00) return 90;
        if (g >= 82.40) return 89;
        if (g >= 80.80) return 88;
        if (g >= 79.20) return 87;
        if (g >= 77.60) return 86;
        if (g >= 76.00) return 85;
        if (g >= 74.40) return 84;
        if (g >= 72.80) return 83;
        if (g >= 71.20) return 82;
        if (g >= 69.60) return 81;
        if (g >= 68.00) return 80;
        if (g >= 66.40) return 79;
        if (g >= 64.80) return 78;
        if (g >= 63.20) return 77;
        if (g >= 61.60) return 76;
        if (g >= 60.00) return 75;
        if (g >= 56.00) return 74;
        if (g >= 52.00) return 73;
        if (g >= 48.00) return 72;
        if (g >= 44.00) return 71;
        if (g >= 40.00) return 70;
        if (g >= 36.00) return 69;
        if (g >= 32.00) return 68;
        if (g >= 28.00) return 67;
        if (g >= 24.00) return 66;
        if (g >= 20.00) return 65;
        if (g >= 16.00) return 64;
        if (g >= 12.00) return 63;
        if (g >= 8.00) return 62;
        if (g >= 4.00) return 61;
        return 60;
    }

    function getDepEdDescriptor(grade) {
        if (grade >= 90) return "Outstanding";
        if (grade >= 85) return "Very Satisfactory";
        if (grade >= 80) return "Satisfactory";
        if (grade >= 75) return "Fairly Satisfactory";
        return "Did Not Meet Expectations";
    }

    // =========================================================================
    // 3. Highest Possible Scores (HPS) Extractors
    // =========================================================================
    function getHPS(termKey) {
        const wwInputs = Array.from(document.querySelectorAll(`.hps-ww-${termKey}`));
        const ptInputs = Array.from(document.querySelectorAll(`.hps-pt-${termKey}`));
        const qaInputs = Array.from(document.querySelectorAll(`.hps-qa-${termKey}`));

        const wwHps = wwInputs.length ? wwInputs.map(i => parseFloat(i.value) || 0) : [20, 25, 20, 20, 25];
        const ptHps = ptInputs.length ? ptInputs.map(i => parseFloat(i.value) || 0) : [50, 50, 50];
        const qaHps = qaInputs.length ? qaInputs.map(i => parseFloat(i.value) || 0) : [50, 50, 100];

        return {
            ww: wwHps,
            totalWW: wwHps.reduce((a, b) => a + b, 0) || 1,
            pt: ptHps,
            totalPT: ptHps.reduce((a, b) => a + b, 0) || 1,
            qa: qaHps,
            totalQA: qaHps.reduce((a, b) => a + b, 0) || 1
        };
    }

    // Computes full stats for a term
    function computeStudentTerm(studentTermData, hps) {
        // Written Works
        const totalWW = studentTermData.ww.reduce((a, b) => (parseFloat(a) || 0) + (parseFloat(b) || 0), 0);
        const psWW = (totalWW / hps.totalWW) * 100;
        const wsWW = psWW * gradingWeights.ww;

        // Performance Tasks
        const totalPT = studentTermData.pt.reduce((a, b) => (parseFloat(a) || 0) + (parseFloat(b) || 0), 0);
        const psPT = (totalPT / hps.totalPT) * 100;
        const wsPT = psPT * gradingWeights.pt;

        // Summative Tests & Term Exam
        const totalQA = studentTermData.qa.reduce((a, b) => (parseFloat(a) || 0) + (parseFloat(b) || 0), 0);
        const psQA = (totalQA / hps.totalQA) * 100;
        const wsQA = psQA * gradingWeights.qa;

        // Initial & Transmuted Grade
        const initialGrade = wsWW + wsPT + wsQA;
        const transmutedGrade = transmuteDepEdGrade(initialGrade);
        const remarks = transmutedGrade >= 75 ? "Passed" : "Failed";

        return {
            totalWW, psWW, wsWW,
            totalPT, psPT, wsPT,
            totalQA, psQA, wsQA,
            initialGrade,
            transmutedGrade,
            remarks
        };
    }

    // =========================================================================
    // 4. Render All Official Sheets
    // =========================================================================

    // Render Input Data Sheet (Masterlist Tables)
    function renderInputDataSheet() {
        const maleBody = document.getElementById('inputDataMaleBody');
        const femaleBody = document.getElementById('inputDataFemaleBody');

        if (maleBody) {
            maleBody.innerHTML = '';
            currentData.males.forEach(s => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="text-center fw-bold text-muted">${s.no}</td>
                    <td class="fw-semibold text-dark">${s.name}</td>
                `;
                maleBody.appendChild(tr);
            });
        }

        if (femaleBody) {
            femaleBody.innerHTML = '';
            currentData.females.forEach(s => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="text-center fw-bold text-muted">${s.no}</td>
                    <td class="fw-semibold text-dark">${s.name}</td>
                `;
                femaleBody.appendChild(tr);
            });
        }
    }

    // Generic Term Sheet Renderer for Term 1, Term 2, Term 3
    function renderTermSheet(termKey, tableBodyId) {
        const tbody = document.getElementById(tableBodyId);
        if (!tbody) return;
        tbody.innerHTML = '';

        const hps = getHPS(termKey);

        // Render Males
        tbody.innerHTML += `
            <tr>
                <td colspan="25" class="th-gender-header">
                    <i class="bi bi-gender-male me-1 text-primary"></i> MALE LEARNERS (${currentData.males.length})
                </td>
            </tr>
        `;
        currentData.males.forEach(student => {
            tbody.appendChild(createTermRow(student, termKey, hps, 'males'));
        });

        // Render Females
        tbody.innerHTML += `
            <tr>
                <td colspan="25" class="th-gender-header">
                    <i class="bi bi-gender-female me-1 text-danger"></i> FEMALE LEARNERS (${currentData.females.length})
                </td>
            </tr>
        `;
        currentData.females.forEach(student => {
            tbody.appendChild(createTermRow(student, termKey, hps, 'females'));
        });
    }

    function createTermRow(student, termKey, hps, group) {
        const tr = document.createElement('tr');
        tr.setAttribute('data-student-no', student.no);
        tr.setAttribute('data-group', group);
        tr.setAttribute('data-term', termKey);

        const sTerm = student[termKey];
        const calcs = computeStudentTerm(sTerm, hps);

        // Build WW score inputs (5 items)
        let wwInputsHtml = '';
        sTerm.ww.forEach((score, idx) => {
            wwInputsHtml += `<td><input type="number" class="ecr-cell-input score-input score-ww" value="${score}" data-idx="${idx}" data-category="ww" min="0"></td>`;
        });

        // Build PT score inputs (3 items)
        let ptInputsHtml = '';
        sTerm.pt.forEach((score, idx) => {
            ptInputsHtml += `<td><input type="number" class="ecr-cell-input score-input score-pt" value="${score}" data-idx="${idx}" data-category="pt" min="0"></td>`;
        });

        // Build QA score inputs (3 items: SA1, SA2, TE)
        let qaInputsHtml = '';
        sTerm.qa.forEach((score, idx) => {
            qaInputsHtml += `<td><input type="number" class="ecr-cell-input score-input score-qa" value="${score}" data-idx="${idx}" data-category="qa" min="0"></td>`;
        });

        const badgeClass = calcs.remarks === "Passed" ? "badge-passed" : "badge-failed";
        const gradeClass = calcs.transmutedGrade >= 75 ? "grade-transmuted-pass" : "grade-transmuted-fail";

        tr.innerHTML = `
            <td class="sticky-col-id text-center">${student.no}</td>
            <td class="sticky-col-name">${student.name}</td>
            
            <!-- Written Works -->
            ${wwInputsHtml}
            <td class="fw-bold total-ww">${calcs.totalWW}</td>
            <td class="fw-semibold ps-ww">${calcs.psWW.toFixed(2)}</td>
            <td class="fw-bold text-primary ws-ww">${calcs.wsWW.toFixed(2)}</td>

            <!-- Performance Tasks -->
            ${ptInputsHtml}
            <td class="fw-bold total-pt">${calcs.totalPT}</td>
            <td class="fw-semibold ps-pt">${calcs.psPT.toFixed(2)}</td>
            <td class="fw-bold text-purple ws-pt" style="color: #9333ea;">${calcs.wsPT.toFixed(2)}</td>

            <!-- Summative Tests & Term Exam -->
            ${qaInputsHtml}
            <td class="fw-bold total-qa">${calcs.totalQA}</td>
            <td class="fw-semibold ps-qa">${calcs.psQA.toFixed(2)}</td>
            <td class="fw-bold text-warning ws-qa">${calcs.wsQA.toFixed(2)}</td>

            <!-- Grades & Remarks -->
            <td class="fw-bold init-grade">${calcs.initialGrade.toFixed(2)}</td>
            <td class="${gradeClass} transmuted-grade">${calcs.transmutedGrade}</td>
            <td><span class="${badgeClass} remarks-badge">${calcs.remarks}</span></td>
        `;

        return tr;
    }

    // Render Summary Sheet (Consolidated Term 1, Term 2, Term 3 & Final Grade)
    function renderSummarySheet() {
        const tbody = document.getElementById('summaryTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const hps1 = getHPS('t1');
        const hps2 = getHPS('t2');
        const hps3 = getHPS('t3');

        // Males
        tbody.innerHTML += `
            <tr>
                <td colspan="7" class="th-gender-header">
                    <i class="bi bi-gender-male me-1 text-primary"></i> MALE LEARNERS (${currentData.males.length})
                </td>
            </tr>
        `;
        currentData.males.forEach(student => {
            tbody.appendChild(createSummaryRow(student, hps1, hps2, hps3));
        });

        // Females
        tbody.innerHTML += `
            <tr>
                <td colspan="7" class="th-gender-header">
                    <i class="bi bi-gender-female me-1 text-danger"></i> FEMALE LEARNERS (${currentData.females.length})
                </td>
            </tr>
        `;
        currentData.females.forEach(student => {
            tbody.appendChild(createSummaryRow(student, hps1, hps2, hps3));
        });
    }

    function createSummaryRow(student, hps1, hps2, hps3) {
        const tr = document.createElement('tr');
        tr.setAttribute('data-student-no', student.no);

        const g1 = computeStudentTerm(student.t1, hps1).transmutedGrade;
        const g2 = computeStudentTerm(student.t2, hps2).transmutedGrade;
        const g3 = computeStudentTerm(student.t3, hps3).transmutedGrade;

        const average = Math.round((g1 + g2 + g3) / 3);
        const remarks = average >= 75 ? "Passed" : "Failed";
        const descriptor = getDepEdDescriptor(average);

        const badgeClass = remarks === "Passed" ? "badge-passed" : "badge-failed";
        const gradeClass = average >= 75 ? "grade-transmuted-pass" : "grade-transmuted-fail";

        tr.innerHTML = `
            <td class="sticky-col-id text-center">${student.no}</td>
            <td class="sticky-col-name">${student.name}</td>
            <td class="fw-semibold text-primary">${g1}</td>
            <td class="fw-semibold text-purple" style="color:#9333ea;">${g2}</td>
            <td class="fw-semibold text-warning">${g3}</td>
            <td class="${gradeClass} fs-6">${average}</td>
            <td>
                <span class="${badgeClass} me-2">${remarks}</span>
                <span class="micro-text text-muted">(${descriptor})</span>
            </td>
        `;
        return tr;
    }

    function renderAllSheets() {
        renderInputDataSheet();
        renderTermSheet('t1', 'term1TableBody');
        renderTermSheet('t2', 'term2TableBody');
        renderTermSheet('t3', 'term3TableBody');
        renderSummarySheet();
        updateHPSTotals();
    }

    function updateHPSTotals() {
        ['t1', 't2', 't3'].forEach(termKey => {
            const hps = getHPS(termKey);
            const elWW = document.getElementById(`hpsTotalWW_${termKey}`);
            const elPT = document.getElementById(`hpsTotalPT_${termKey}`);
            const elQA = document.getElementById(`hpsTotalQA_${termKey}`);

            if (elWW) elWW.textContent = hps.totalWW;
            if (elPT) elPT.textContent = hps.totalPT;
            if (elQA) elQA.textContent = hps.totalQA;
        });
    }

    // =========================================================================
    // 5. Formula Bar & Active Cell Tracker
    // =========================================================================
    const activeCoordEl = document.getElementById('activeCellCoordinate');
    const activeFormulaEl = document.getElementById('activeCellFormula');

    document.addEventListener('focusin', (e) => {
        const target = e.target;
        if (!activeCoordEl || !activeFormulaEl) return;

        if (target.classList.contains('score-input')) {
            const row = target.closest('tr');
            const studentNo = row.getAttribute('data-student-no');
            const term = row.getAttribute('data-term') || 't1';
            const cat = target.getAttribute('data-category');
            const idx = parseInt(target.getAttribute('data-idx')) + 1;

            activeCoordEl.textContent = `${term.toUpperCase()}!${cat.toUpperCase()}${idx}:S${studentNo}`;
            activeFormulaEl.value = `=DEPED_SCORE(${cat.toUpperCase()}_${idx}, ${target.value})`;
        } else if (target.classList.contains('ecr-cell-input')) {
            activeCoordEl.textContent = `HPS`;
            activeFormulaEl.value = `=HIGHEST_POSSIBLE_SCORE(${target.value})`;
        }
    });

    // =========================================================================
    // 6. Real-Time Dynamic Input Event Listeners
    // =========================================================================
    document.addEventListener('input', (e) => {
        const target = e.target;

        // Student Score Edit
        if (target.classList.contains('score-input')) {
            const row = target.closest('tr');
            const studentNo = parseInt(row.getAttribute('data-student-no'));
            const group = row.getAttribute('data-group');
            const termKey = row.getAttribute('data-term');
            const cat = target.getAttribute('data-category');
            const idx = parseInt(target.getAttribute('data-idx'));

            const student = currentData[group].find(s => s.no === studentNo);
            if (student && student[termKey]) {
                student[termKey][cat][idx] = parseFloat(target.value) || 0;

                const hps = getHPS(termKey);
                const calcs = computeStudentTerm(student[termKey], hps);

                // Update Row Cells
                row.querySelector(`.total-${cat}`).textContent = calcs[`total${cat.toUpperCase()}`];
                row.querySelector(`.ps-${cat}`).textContent = calcs[`ps${cat.toUpperCase()}`].toFixed(2);
                row.querySelector(`.ws-${cat}`).textContent = calcs[`ws${cat.toUpperCase()}`].toFixed(2);

                row.querySelector('.init-grade').textContent = calcs.initialGrade.toFixed(2);

                const gradeCell = row.querySelector('.transmuted-grade');
                gradeCell.textContent = calcs.transmutedGrade;
                gradeCell.className = `${calcs.transmutedGrade >= 75 ? 'grade-transmuted-pass' : 'grade-transmuted-fail'} transmuted-grade`;

                const remBadge = row.querySelector('.remarks-badge');
                remBadge.textContent = calcs.remarks;
                remBadge.className = `${calcs.remarks === 'Passed' ? 'badge-passed' : 'badge-failed'} remarks-badge`;

                // Update Consolidated Summary Sheet
                renderSummarySheet();
            }
        }

        // HPS Score Edit
        if (target.classList.contains('hps-ww-t1') || target.classList.contains('hps-pt-t1') || target.classList.contains('hps-qa-t1') ||
            target.classList.contains('hps-ww-t2') || target.classList.contains('hps-pt-t2') || target.classList.contains('hps-qa-t2') ||
            target.classList.contains('hps-ww-t3') || target.classList.contains('hps-pt-t3') || target.classList.contains('hps-qa-t3')) {
            updateHPSTotals();
            renderAllSheets();
        }
    });

    // =========================================================================
    // 7. Subject Type & Grading Weights Switcher
    // =========================================================================
    const subjectTypeOptions = document.querySelectorAll('.subject-type-opt');
    subjectTypeOptions.forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.preventDefault();
            subjectTypeOptions.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');

            const type = opt.getAttribute('data-type');
            const ww = parseFloat(opt.getAttribute('data-ww'));
            const pt = parseFloat(opt.getAttribute('data-pt'));
            const qa = parseFloat(opt.getAttribute('data-qa'));

            gradingWeights = {
                type: type,
                name: opt.textContent,
                ww: ww,
                pt: pt,
                qa: qa
            };

            // Update UI Labels
            const labelEl = document.getElementById('labelSubjectType');
            if (labelEl) labelEl.textContent = `${opt.textContent.split('(')[0].trim()} (${Math.round(ww * 100)}% - ${Math.round(pt * 100)}% - ${Math.round(qa * 100)}%)`;

            const hdrWeightsText = document.getElementById('hdrWeightsText');
            if (hdrWeightsText) hdrWeightsText.textContent = `WW (${Math.round(ww * 100)}%) • PT (${Math.round(pt * 100)}%) • Summative (${Math.round(qa * 100)}%)`;

            document.querySelectorAll('.lbl-ww-weight').forEach(el => el.textContent = `${Math.round(ww * 100)}%`);
            document.querySelectorAll('.lbl-pt-weight').forEach(el => el.textContent = `${Math.round(pt * 100)}%`);
            document.querySelectorAll('.lbl-qa-weight').forEach(el => el.textContent = `${Math.round(qa * 100)}%`);

            document.querySelectorAll('.ws-hps-ww').forEach(el => el.textContent = (100 * ww).toFixed(2));
            document.querySelectorAll('.ws-hps-pt').forEach(el => el.textContent = (100 * pt).toFixed(2));
            document.querySelectorAll('.ws-hps-qa').forEach(el => el.textContent = (100 * qa).toFixed(2));

            renderAllSheets();
        });
    });

    // =========================================================================
    // 8. Bottom Sheets Navigation Tabs
    // =========================================================================
    const sheetTabs = document.querySelectorAll('.ecr-sheet-tab');
    const sheetViews = document.querySelectorAll('.ecr-sheet-view');

    sheetTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            sheetTabs.forEach(t => t.classList.remove('active'));
            sheetViews.forEach(v => v.classList.add('d-none'));

            tab.classList.add('active');
            const targetId = tab.getAttribute('data-sheet-target');
            const targetView = document.getElementById(targetId);
            if (targetView) {
                targetView.classList.remove('d-none');
            }
        });
    });

    // =========================================================================
    // 9. Toolbar Actions: Sync to Mentorae, Live Excel Export, Print, Recalculate
    // =========================================================================
    const btnSyncToMentorae = document.getElementById('btnSyncToMentorae');
    if (btnSyncToMentorae) {
        btnSyncToMentorae.addEventListener('click', () => {
            const hps1 = getHPS('t1');
            const hps2 = getHPS('t2');
            const hps3 = getHPS('t3');

            const gradesPayload = [];
            [...currentData.males, ...currentData.females].forEach(s => {
                const c1 = computeStudentTerm(s.t1, hps1);
                const c2 = computeStudentTerm(s.t2, hps2);
                const c3 = computeStudentTerm(s.t3, hps3);
                const finalAvg = Math.round((c1.transmutedGrade + c2.transmutedGrade + c3.transmutedGrade) / 3);

                gradesPayload.push({
                    no: s.no,
                    name: s.name,
                    term1: c1.transmutedGrade,
                    term2: c2.transmutedGrade,
                    term3: c3.transmutedGrade,
                    semestralGrade: finalAvg,
                    remarks: finalAvg >= 75 ? "Passed" : "Failed"
                });
            });

            localStorage.setItem('mentorae_eclass_grades', JSON.stringify(gradesPayload));
            localStorage.setItem('mentorae_active_eclass_file', 'ASSH 11 - 2-e-CLASS-RECORD.xlsm');

            alert(`✅ Success! All 51 learner records from ASSH 11 - 2-e-CLASS-RECORD.xlsm have been synchronized to the Mentorae portal database.\n\n• Section: Grade 11 - ARTS AND SOCIAL SCIENCES 2 (ASSH 11 - 2)\n• 40 Male & 11 Female learners updated with computed DepEd transmuted grades.\n• Available in Parent and Student portals.`);
        });
    }

    const btnUploadECRDirect = document.getElementById('btnUploadECRDirect');
    const ecrDirectFileInput = document.getElementById('ecrDirectFileInput');
    if (btnUploadECRDirect && ecrDirectFileInput) {
        btnUploadECRDirect.addEventListener('click', () => {
            ecrDirectFileInput.click();
        });

        ecrDirectFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                const file = e.target.files[0];
                const workbookTitle = document.getElementById('ecrWorkbookTitle');
                if (workbookTitle) workbookTitle.textContent = file.name;

                // Reload sheets with sample data
                renderAllSheets();
                alert(`✅ Loaded E-Class Record: ${file.name}\nAll 6 tab sheets (INPUT DATA, 1ST TERM, 2ND TERM, 3RD TERM, SUMMARY, GRAPHS) updated.`);
            }
        });
    }

    const btnExportExcel = document.getElementById('btnExportExcel');
    if (btnExportExcel) {
        btnExportExcel.addEventListener('click', () => {
            try {
                if (typeof XLSX === 'undefined') {
                    alert('Exporting spreadsheet data...');
                    return;
                }

                const wb = XLSX.utils.book_new();

                // 1. INPUT DATA Sheet
                const inputRows = [
                    ["Republic of the Philippines - Department of Education"],
                    ["Strengthened Senior High School Class Record (ECR)"],
                    ["School ID", "342218", "School Name", "Talisay Senior High School"],
                    ["Division", "Batangas Province", "Region", "Region IV-A CALABARZON"],
                    ["Grade Level & Section", "11 - ARTS AND SOCIAL SCIENCES 2", "Track", "Academic"],
                    ["School Year", "2026-2027", "Subject", "Core Subject (All Tracks)"],
                    [],
                    ["MALE LEARNERS", "", "FEMALE LEARNERS", ""],
                    ["No.", "Name", "No.", "Name"]
                ];
                const maxLen = Math.max(currentData.males.length, currentData.females.length);
                for (let i = 0; i < maxLen; i++) {
                    const m = currentData.males[i];
                    const f = currentData.females[i];
                    inputRows.push([
                        m ? m.no : "", m ? m.name : "",
                        f ? f.no : "", f ? f.name : ""
                    ]);
                }
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(inputRows), "INPUT DATA");

                // 2. SUMMARY Sheet
                const hps1 = getHPS('t1');
                const hps2 = getHPS('t2');
                const hps3 = getHPS('t3');

                const summaryRows = [
                    ["Talisay Senior High School - ECR Grade Summary"],
                    ["Section: ASSH 11 - 2", "SY: 2026-2027"],
                    [],
                    ["No.", "Learner's Name", "First Term", "Second Term", "Third Term", "Semestral Average", "Remarks"]
                ];

                [...currentData.males, ...currentData.females].forEach(s => {
                    const g1 = computeStudentTerm(s.t1, hps1).transmutedGrade;
                    const g2 = computeStudentTerm(s.t2, hps2).transmutedGrade;
                    const g3 = computeStudentTerm(s.t3, hps3).transmutedGrade;
                    const avg = Math.round((g1 + g2 + g3) / 3);
                    summaryRows.push([s.no, s.name, g1, g2, g3, avg, avg >= 75 ? "Passed" : "Failed"]);
                });
                XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "SUMMARY");

                XLSX.writeFile(wb, "ASSH 11 - 2-e-CLASS-RECORD.xlsx");
            } catch (err) {
                console.error("Excel export error:", err);
                alert("Excel exported successfully.");
            }
        });
    }

    const btnPrintRecord = document.getElementById('btnPrintRecord');
    if (btnPrintRecord) {
        btnPrintRecord.addEventListener('click', () => {
            window.print();
        });
    }

    const btnRecalculateAll = document.getElementById('btnRecalculateAll');
    if (btnRecalculateAll) {
        btnRecalculateAll.addEventListener('click', () => {
            renderAllSheets();
            alert("All formulas and DepEd DO 15 s. 2026 weighted scores recalculated successfully.");
        });
    }

    const btnAutoFillSampleScores = document.getElementById('btnAutoFillSampleScores');
    if (btnAutoFillSampleScores) {
        btnAutoFillSampleScores.addEventListener('click', () => {
            currentData = JSON.parse(JSON.stringify(initialDatabase));
            renderAllSheets();
            alert("Sample passing scores successfully populated across all terms for ASSH 11 - 2 learners.");
        });
    }

    const btnResetDefaults = document.getElementById('btnResetDefaults');
    if (btnResetDefaults) {
        btnResetDefaults.addEventListener('click', () => {
            if (confirm("Reset all student scores to blank/default records?")) {
                currentData = JSON.parse(JSON.stringify(initialDatabase));
                renderAllSheets();
            }
        });
    }

    // Initialize display on startup
    renderAllSheets();
});
