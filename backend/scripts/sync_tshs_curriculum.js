const pool = require('../config/db');

const TSHS_CURRICULUM = [
  // ===================== GRADE 11 =====================
  // All Terms Core
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

async function runSync() {
  console.log('--- Starting TSHS Curriculum SY 2026-2027 Sync ---');

  // 1. Update system settings
  await pool.query(`
    INSERT INTO system_settings (setting_key, setting_value) VALUES
      ('school_year', '2026 - 2027'),
      ('current_semester', '1st Term'),
      ('current_quarter', '1st Term')
    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
  `);
  console.log('✓ Updated system settings to SY 2026 - 2027 and 1st Term.');

  // 1b. Update existing legacy grade terms
  try {
    const [gradeUpdate] = await pool.query("UPDATE grades SET term = '1st Term' WHERE term = '1st Semester'");
    if (gradeUpdate.affectedRows > 0) {
      console.log(`✓ Updated ${gradeUpdate.affectedRows} grade records to '1st Term'.`);
    }
  } catch (err) {
    console.log('Notice on grades table:', err.message);
  }

  // 2. Modify schedules.quarter column if needed
  try {
    await pool.query(`ALTER TABLE schedules MODIFY COLUMN quarter VARCHAR(50) NOT NULL DEFAULT '1st Term'`);
    console.log('✓ schedules.quarter modified to VARCHAR(50).');
  } catch (err) {
    console.log('Notice on schedules table:', err.message);
  }

  // 3. Ensure strands exist
  const strands = [
    { code: 'BAE', title: 'Business, Accountancy & Entrepreneurship', dept: 'Academic Track' },
    { code: 'ASSH', title: 'Arts and Social Sciences / Humanities', dept: 'Academic Track' },
    { code: 'STEM', title: 'Science, Technology, Engineering, and Mathematics', dept: 'Academic Track' },
    { code: 'HUMSS', title: 'Humanities and Social Sciences', dept: 'Academic Track' },
    { code: 'HE', title: 'Home Economics', dept: 'TVL Track' },
    { code: 'H&T', title: 'Hospitality and Tourism', dept: 'TVL Track' },
    { code: 'ABM', title: 'Accountancy, Business, and Management', dept: 'Academic Track' },
  ];
  for (const st of strands) {
    await pool.query(
      `INSERT INTO strands (code, title, department) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE title = VALUES(title), department = VALUES(department)`,
      [st.code, st.title, st.dept]
    );
  }
  console.log('✓ Strands synchronized.');

  // 4. Ensure Official TSHS sections exist
  const OFFICIAL_SECTIONS = [
    // Grade 11
    { strand: 'BAE', grade: 11, name: 'Accountancy' },
    { strand: 'BAE', grade: 11, name: 'Entrepreneurship' },
    { strand: 'ASSH', grade: 11, name: 'Arts & Social Sciences 1' },
    { strand: 'ASSH', grade: 11, name: 'Arts & Social Sciences 2' },
    { strand: 'ASSH', grade: 11, name: 'Humanities 1' },
    { strand: 'ASSH', grade: 11, name: 'Humanities 2' },
    { strand: 'STEM', grade: 11, name: 'Medical Sciences' },
    { strand: 'STEM', grade: 11, name: 'Engineering' },

    // Grade 12
    { strand: 'HUMSS', grade: 12, name: 'Criminology 1' },
    { strand: 'HUMSS', grade: 12, name: 'Criminology 2' },
    { strand: 'HUMSS', grade: 12, name: 'Criminology 3' },
    { strand: 'HE', grade: 12, name: 'Cookery' },
    { strand: 'H&T', grade: 12, name: 'Culinary Arts' },
    { strand: 'HUMSS', grade: 12, name: 'Education 1' },
    { strand: 'HUMSS', grade: 12, name: 'Education 2' },
    { strand: 'ABM', grade: 12, name: 'Business Administration' },
    { strand: 'STEM', grade: 12, name: 'Biomedical Engineering' },
    { strand: 'STEM', grade: 12, name: 'Sigma Technocrats' }
  ];

  const [allStrands] = await pool.query('SELECT id, code FROM strands');
  const strandIdMap = {};
  allStrands.forEach(s => { strandIdMap[s.code] = s.id; });

  for (const s of OFFICIAL_SECTIONS) {
    const strandId = strandIdMap[s.strand];
    if (strandId) {
      const [existingSec] = await pool.query(
        'SELECT id FROM sections WHERE strand_id = ? AND grade_level = ? AND name = ? LIMIT 1',
        [strandId, s.grade, s.name]
      );
      if (existingSec.length === 0) {
        await pool.query(
          'INSERT INTO sections (strand_id, grade_level, name) VALUES (?, ?, ?)',
          [strandId, s.grade, s.name]
        );
      }
    }
  }
  console.log('✓ Official TSHS sections synchronized.');

  // 5. Sync Subjects
  let inserted = 0;
  let updated = 0;

  for (const s of TSHS_CURRICULUM) {
    const [existing] = await pool.query(
      'SELECT id FROM subjects WHERE code = ? OR name = ? LIMIT 1',
      [s.code, s.name]
    );

    if (existing.length === 0) {
      await pool.query(
        `INSERT INTO subjects (code, name, description, classification, grade_level, quarter, strand, strand_section, color)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.code, s.name, s.description, s.category, s.gradeLevel, s.quarter, s.strand, s.strandSection, s.color]
      );
      inserted++;
    } else {
      const subjectId = existing[0].id;
      await pool.query(
        `UPDATE subjects 
         SET code = ?, name = ?, description = ?, classification = ?, grade_level = ?, quarter = ?, strand = ?, strand_section = ?, color = ?
         WHERE id = ?`,
        [s.code, s.name, s.description, s.category, s.gradeLevel, s.quarter, s.strand, s.strandSection, s.color, subjectId]
      );
      updated++;
    }
  }

  console.log(`✓ Synchronized subjects: ${inserted} newly created, ${updated} updated.`);

  const [totalRows] = await pool.query('SELECT COUNT(*) AS cnt FROM subjects');
  console.log(`Total subjects in database: ${totalRows[0].cnt}`);

  process.exit(0);
}

runSync().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
