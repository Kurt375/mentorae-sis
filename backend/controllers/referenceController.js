const pool = require('../config/db');

const CURRICULUM_SUBJECTS = [
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

const INITIAL_TOPICS = {
  "Physics 1": {
    topics: [
      { title: "Units and Measurement", description: "Focuses on the conversion of units, significant figures, and the application of experimental errors and uncertainties in physical measurements.", color: "bg-card-blue" },
      { title: "Vectors", description: "Explains the addition of vectors using the graphical and component methods to describe physical quantities with magnitude and direction.", color: "bg-card-orange" },
      { title: "Kinematics (Motion in a Straight Line)", description: "Describes the motion of objects using position, time, velocity, and constant acceleration, including the behavior of freely falling bodies.", color: "bg-card-green" }
    ],
    recommendations: [
      { title: "Gravity", description: "Explains Newton's Law of Universal Gravitation and its application to planetary motion and satellite orbits.", comment: "This is for our quiz tomorrow. Happy Learning and God bless!", color: "bg-card-purple", resources: ["File", "Practice Quiz"] }
    ]
  },
  "General Mathematics": {
    topics: [
      { title: "Functions and Their Graphs", description: "Covers the fundamental concepts of functions, their properties, and graphical representations.", color: "bg-card-green" }
    ],
    recommendations: [
      { title: "Logarithmic Functions", description: "An introduction to logarithmic functions and their relationship to exponential functions.", comment: "Please review this for the upcoming long test.", color: "bg-card-purple", resources: ["File"] }
    ]
  }
};

let columnsChecked = false;
async function ensureSubjectColumns() {
  if (columnsChecked) return;
  try {
    const [cols] = await pool.query('SHOW COLUMNS FROM subjects');
    const colNames = cols.map(c => c.Field.toLowerCase());

    if (!colNames.includes('description')) {
      await pool.query('ALTER TABLE subjects ADD COLUMN description TEXT NULL AFTER name');
    }
    if (!colNames.includes('grade_level')) {
      await pool.query('ALTER TABLE subjects ADD COLUMN grade_level INT DEFAULT 11 AFTER classification');
    }
    if (!colNames.includes('quarter')) {
      await pool.query('ALTER TABLE subjects ADD COLUMN quarter INT DEFAULT 1 AFTER grade_level');
    }
    if (!colNames.includes('strand')) {
      await pool.query('ALTER TABLE subjects ADD COLUMN strand VARCHAR(50) DEFAULT \'Common\' AFTER quarter');
    }
    if (!colNames.includes('strand_section')) {
      await pool.query('ALTER TABLE subjects ADD COLUMN strand_section VARCHAR(150) DEFAULT \'All Sections\' AFTER strand');
    }
    if (!colNames.includes('color')) {
      await pool.query('ALTER TABLE subjects ADD COLUMN color VARCHAR(50) DEFAULT \'bg-card-blue\' AFTER strand_section');
    }
    if (!colNames.includes('ww_weight')) {
      await pool.query('ALTER TABLE subjects ADD COLUMN ww_weight DECIMAL(5,2) NOT NULL DEFAULT 20.00 AFTER color');
    }
    if (!colNames.includes('pt_weight')) {
      await pool.query('ALTER TABLE subjects ADD COLUMN pt_weight DECIMAL(5,2) NOT NULL DEFAULT 50.00 AFTER ww_weight');
    }
    if (!colNames.includes('qa_weight')) {
      await pool.query('ALTER TABLE subjects ADD COLUMN qa_weight DECIMAL(5,2) NOT NULL DEFAULT 30.00 AFTER pt_weight');
    }

    try {
      await pool.query("ALTER TABLE subjects MODIFY COLUMN classification VARCHAR(64) DEFAULT 'Core Subject'");
    } catch (e) {}

    // Seed or update curriculum subjects into the database
    await seedCurriculumSubjects();

    columnsChecked = true;
  } catch (err) {
    console.error('ensureSubjectColumns notice:', err.message);
  }
}

async function seedCurriculumSubjects() {
  try {
    for (const sub of CURRICULUM_SUBJECTS) {
      // Check if subject exists by code or name
      const [existing] = await pool.query(
        'SELECT id, description, color, strand, strand_section FROM subjects WHERE code = ? OR name = ? LIMIT 1',
        [sub.code, sub.name]
      );

      let subjectId;
      if (existing.length === 0) {
        const [res] = await pool.query(
          `INSERT INTO subjects (code, name, description, classification, grade_level, quarter, strand, strand_section, color)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [sub.code, sub.name, sub.description, sub.category, sub.gradeLevel, sub.quarter, sub.strand, sub.strandSection, sub.color]
        );
        subjectId = res.insertId;
      } else {
        subjectId = existing[0].id;
        // Only fill missing metadata if currently NULL or empty, NEVER overwrite admin customizations
        await pool.query(
          `UPDATE subjects 
           SET description = CASE WHEN description IS NULL OR description = '' THEN ? ELSE description END,
               classification = CASE WHEN classification IS NULL OR classification = '' THEN ? ELSE classification END,
               strand = CASE WHEN strand IS NULL OR strand = '' THEN ? ELSE strand END,
               strand_section = CASE WHEN strand_section IS NULL OR strand_section = '' THEN ? ELSE strand_section END,
               color = CASE WHEN color IS NULL OR color = '' THEN ? ELSE color END
           WHERE id = ?`,
          [sub.description, sub.category, sub.strand, sub.strandSection, sub.color, subjectId]
        );
      }

      // Seed initial topics if present for this subject
      if (INITIAL_TOPICS[sub.name]) {
        const [anyUser] = await pool.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
        const defaultAuthorId = anyUser[0]?.id;
        if (!defaultAuthorId) continue;

        const { topics, recommendations } = INITIAL_TOPICS[sub.name];
        if (Array.isArray(topics)) {
          for (const t of topics) {
            const [topExists] = await pool.query(
              'SELECT id FROM topics WHERE subject_id = ? AND title = ? AND is_recommendation = 0 LIMIT 1',
              [subjectId, t.title]
            );
            if (topExists.length === 0) {
              await pool.query(
                `INSERT INTO topics (subject_id, title, description, created_by, status, content_payload, is_recommendation, color)
                 VALUES (?, ?, ?, ?, 'approved', ?, 0, ?)`,
                [subjectId, t.title, t.description, defaultAuthorId, JSON.stringify({ resources: t.resources || [] }), t.color || 'bg-card-blue']
              );
            }
          }
        }
        if (Array.isArray(recommendations)) {
          for (const r of recommendations) {
            const [recExists] = await pool.query(
              'SELECT id FROM topics WHERE subject_id = ? AND title = ? AND is_recommendation = 1 LIMIT 1',
              [subjectId, r.title]
            );
            if (recExists.length === 0) {
              await pool.query(
                `INSERT INTO topics (subject_id, title, description, created_by, status, content_payload, is_recommendation, comment, color)
                 VALUES (?, ?, ?, ?, 'approved', ?, 1, ?, ?)`,
                [subjectId, r.title, r.description, defaultAuthorId, JSON.stringify({ resources: r.resources || [] }), r.comment || '', r.color || 'bg-card-purple']
              );
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('seedCurriculumSubjects error:', err);
  }
}

/** GET /api/reference/strands */
async function listStrands(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM strands ORDER BY code');
    return res.json({ success: true, strands: rows });
  } catch (err) {
    console.error('listStrands error:', err);
    return res.status(500).json({ success: false, message: 'Could not load strands.' });
  }
}

/** GET /api/reference/sections?strandId=&gradeLevel= */
async function listSections(req, res) {
  try {
    const params = [];
    let sql = `
      SELECT s.id, s.name, s.grade_level, s.strand_id, st.code AS strandCode, st.title AS strandTitle,
             (SELECT COUNT(*) FROM users u WHERE u.section_id = s.id AND u.role = 'student') AS studentCount
      FROM sections s JOIN strands st ON st.id = s.strand_id
      WHERE 1=1`;
    if (req.query.strandId) {
      sql += ' AND s.strand_id = ?';
      params.push(req.query.strandId);
    }
    if (req.query.gradeLevel) {
      sql += ' AND s.grade_level = ?';
      params.push(req.query.gradeLevel);
    }
    sql += ' ORDER BY st.code, s.grade_level, s.name';

    const [rows] = await pool.query(sql, params);
    return res.json({ success: true, sections: rows });
  } catch (err) {
    console.error('listSections error:', err);
    return res.status(500).json({ success: false, message: 'Could not load sections.' });
  }
}

/** POST /api/reference/sections — admin creates a section { strandId, gradeLevel, name } */
async function createSection(req, res) {
  const { strandId, gradeLevel, name } = req.body;
  if (!strandId || !gradeLevel || !name) {
    return res.status(400).json({ success: false, message: 'Strand, grade level, and section name are required.' });
  }
  try {
    await pool.query('INSERT INTO sections (strand_id, grade_level, name) VALUES (?, ?, ?)', [
      strandId,
      gradeLevel,
      name,
    ]);
    return res.json({ success: true, message: 'Section created.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'That section already exists for this strand/grade.' });
    }
    console.error('createSection error:', err);
    return res.status(500).json({ success: false, message: 'Could not create section.' });
  }
}

/** GET /api/reference/subjects */
async function listSubjects(req, res) {
  await ensureSubjectColumns();
  try {
    const [rows] = await pool.query('SELECT * FROM subjects ORDER BY grade_level ASC, name ASC');

    // Fetch approved topics for all subjects
    let topicsBySubject = {};
    let recsBySubject = {};
    try {
      const [topicRows] = await pool.query(
        `SELECT t.id, t.subject_id, t.title, t.description, t.color, t.comment, t.is_recommendation, t.content_payload 
         FROM topics t 
         WHERE t.status = 'approved' 
         ORDER BY t.created_at ASC`
      );
      topicRows.forEach(t => {
        let payload = {};
        if (t.content_payload) {
          try {
            payload = typeof t.content_payload === 'string' ? JSON.parse(t.content_payload) : (t.content_payload || {});
          } catch (e) {
            payload = {};
          }
        }
        const item = {
          id: t.id,
          title: t.title,
          description: t.description || '',
          color: t.color || 'bg-card-purple',
          comment: t.comment || '',
          resources: payload.resources || [],
          quiz: payload.quiz || [],
          flashcards: payload.flashcards || [],
          files: (payload.files || []).map(f => ({ name: f.name, type: f.type, size: f.size }))
        };
        if (t.is_recommendation) {
          if (!recsBySubject[t.subject_id]) recsBySubject[t.subject_id] = [];
          recsBySubject[t.subject_id].push(item);
        } else {
          if (!topicsBySubject[t.subject_id]) topicsBySubject[t.subject_id] = [];
          topicsBySubject[t.subject_id].push(item);
        }
      });
    } catch (err) {
      console.error('Error loading subject topics:', err);
    }

    const formatted = rows.map(r => {
      // Normalize category / classification
      let cat = r.classification || 'Core Subject';
      if (cat === 'Core') cat = 'Core Subject';
      else if (cat === 'Applied') cat = 'Applied Subject';
      else if (cat === 'Specialized' || cat === 'Contextualized') cat = 'Specialized Subject';
      else if (cat === 'Institutional') cat = 'Institutional / Non-Academic';

      const qVal = r.quarter != null ? Number(r.quarter) : 1;
      let termStr = '1st Term';
      if (qVal === 0) termStr = 'All Terms';
      else if (qVal === 2) termStr = '2nd Term';
      else if (qVal === 3) termStr = '3rd Term';

      return {
        id: r.id,
        code: r.code || '',
        name: r.name || '',
        description: r.description || '',
        category: cat,
        classification: cat,
        gradeLevel: r.grade_level != null ? Number(r.grade_level) : 11,
        grade_level: r.grade_level != null ? Number(r.grade_level) : 11,
        quarter: qVal,
        term: termStr,
        termLabel: termStr,
        strand: r.strand || 'Common',
        strandSection: r.strand_section || 'All Sections',
        strand_section: r.strand_section || 'All Sections',
        color: r.color || 'bg-card-blue',
        ww_weight: r.ww_weight != null ? Number(r.ww_weight) : 20,
        pt_weight: r.pt_weight != null ? Number(r.pt_weight) : 50,
        qa_weight: r.qa_weight != null ? Number(r.qa_weight) : 30,
        wwWeight: r.ww_weight != null ? Number(r.ww_weight) : 20,
        ptWeight: r.pt_weight != null ? Number(r.pt_weight) : 50,
        qaWeight: r.qa_weight != null ? Number(r.qa_weight) : 30,
        topics: topicsBySubject[r.id] || [],
        recommendations: recsBySubject[r.id] || []
      };
    });

    return res.json({ success: true, subjects: formatted });
  } catch (err) {
    console.error('listSubjects error:', err);
    return res.status(500).json({ success: false, message: 'Could not load subjects.' });
  }
}

/** POST /api/reference/subjects — admin creates or updates a subject */
async function createSubject(req, res) {
  await ensureSubjectColumns();
  const { name, code, description, category, gradeLevel, quarter, strand, strandSection, color, topics, id, wwWeight, ptWeight, qaWeight, ww_weight, pt_weight, qa_weight } = req.body;
  if (!name || !code) {
    return res.status(400).json({ success: false, message: 'Subject name and code are required.' });
  }

  try {
    const classification = category || 'Core Subject';
    const grade_level = gradeLevel != null ? Number(gradeLevel) : 11;
    const qtr = quarter != null ? Number(quarter) : 1;
    const str = strand || 'Common';
    const sec = strandSection || 'All Sections';
    const clr = color || 'bg-card-blue';
    const ww = ww_weight != null ? Number(ww_weight) : (wwWeight != null ? Number(wwWeight) : 20);
    const pt = pt_weight != null ? Number(pt_weight) : (ptWeight != null ? Number(ptWeight) : 50);
    const qa = qa_weight != null ? Number(qa_weight) : (qaWeight != null ? Number(qaWeight) : 30);

    // If subject with given ID, code, or name already exists, update it
    let targetId = id;
    if (!targetId) {
      const [existing] = await pool.query('SELECT id FROM subjects WHERE code = ? OR name = ? LIMIT 1', [code.trim(), name.trim()]);
      if (existing.length > 0) targetId = existing[0].id;
    }

    let newSubjectId = targetId || null;
    if (targetId) {
      await pool.query(
        `UPDATE subjects 
         SET code = ?, name = ?, description = ?, classification = ?, grade_level = ?, quarter = ?, strand = ?, strand_section = ?, color = ?,
             ww_weight = ?, pt_weight = ?, qa_weight = ?
         WHERE id = ?`,
        [code.trim(), name.trim(), description || '', classification, grade_level, qtr, str, sec, clr, ww, pt, qa, targetId]
      );
    } else {
      const [result] = await pool.query(
        `INSERT INTO subjects (code, name, description, classification, grade_level, quarter, strand, strand_section, color, ww_weight, pt_weight, qa_weight)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [code.trim(), name.trim(), description || '', classification, grade_level, qtr, str, sec, clr, ww, pt, qa]
      );
      newSubjectId = result.insertId;
    }

    // If staged topics were provided, insert them into topics table
    if (newSubjectId && Array.isArray(topics) && topics.length > 0) {
      for (const t of topics) {
        if (!t.title) continue;
        const payload = {
          resources: t.resources || [],
          files: t.files || [],
          quiz: t.quiz || [],
          flashcards: t.flashcards || []
        };
        await pool.query(
          `INSERT INTO topics (subject_id, title, description, created_by, status, content_payload, is_recommendation, color)
           VALUES (?, ?, ?, ?, 'approved', ?, 0, ?)`,
          [newSubjectId, t.title.trim(), t.description || '', req.user?.id || 1, JSON.stringify(payload), t.color || 'bg-card-blue']
        );
      }
    }

    return res.status(201).json({ success: true, subjectId: newSubjectId, message: 'Subject created successfully.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'A subject with that code already exists.' });
    }
    console.error('createSubject error:', err);
    return res.status(500).json({ success: false, message: 'Could not create subject.' });
  }
}

/** PUT /api/reference/subjects/:id — admin updates a subject */
async function updateSubject(req, res) {
  const subjectId = req.params.id || req.body.id;
  const { code, name, description, category, gradeLevel, quarter, strand, strandSection, color, topics, wwWeight, ptWeight, qaWeight, ww_weight, pt_weight, qa_weight } = req.body;

  if (!code || !name) {
    return res.status(400).json({ success: false, message: 'Code and Name are required.' });
  }

  try {
    await ensureSubjectColumns();

    const classification = category || 'Core Subject';
    const grade_level = gradeLevel != null ? Number(gradeLevel) : 11;
    const qtr = quarter != null ? Number(quarter) : 1;
    const str = strand || 'Common';
    const sec = strandSection || 'All Sections';
    const clr = color || 'bg-card-blue';
    const ww = ww_weight != null ? Number(ww_weight) : (wwWeight != null ? Number(wwWeight) : 20);
    const pt = pt_weight != null ? Number(pt_weight) : (ptWeight != null ? Number(ptWeight) : 50);
    const qa = qa_weight != null ? Number(qa_weight) : (qaWeight != null ? Number(qaWeight) : 30);

    // 1. Try update by ID
    let updated = false;
    let actualId = null;

    if (subjectId) {
      const [existingById] = await pool.query('SELECT id FROM subjects WHERE id = ? LIMIT 1', [subjectId]);
      if (existingById.length > 0) {
        await pool.query(
          `UPDATE subjects 
           SET code = ?, name = ?, description = ?, classification = ?, grade_level = ?, quarter = ?, strand = ?, strand_section = ?, color = ?,
               ww_weight = ?, pt_weight = ?, qa_weight = ?
           WHERE id = ?`,
          [code.trim(), name.trim(), description || '', classification, grade_level, qtr, str, sec, clr, ww, pt, qa, subjectId]
        );
        actualId = subjectId;
        updated = true;
      }
    }

    // 2. If ID didn't match, try matching by code or name
    if (!updated) {
      const [found] = await pool.query('SELECT id FROM subjects WHERE code = ? OR name = ? LIMIT 1', [code.trim(), name.trim()]);
      if (found.length > 0) {
        actualId = found[0].id;
        await pool.query(
          `UPDATE subjects 
           SET code = ?, name = ?, description = ?, classification = ?, grade_level = ?, quarter = ?, strand = ?, strand_section = ?, color = ?,
               ww_weight = ?, pt_weight = ?, qa_weight = ?
           WHERE id = ?`,
          [code.trim(), name.trim(), description || '', classification, grade_level, qtr, str, sec, clr, ww, pt, qa, actualId]
        );
        updated = true;
      }
    }

    // 3. If still not updated, insert as new subject (upsert)
    if (!updated) {
      const [insertRes] = await pool.query(
        `INSERT INTO subjects (code, name, description, classification, grade_level, quarter, strand, strand_section, color, ww_weight, pt_weight, qa_weight)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [code.trim(), name.trim(), description || '', classification, grade_level, qtr, str, sec, clr, ww, pt, qa]
      );
      actualId = insertRes.insertId;
    }

    // 4. If topics array was supplied, synchronize the topics table for this subject
    if (actualId && Array.isArray(topics)) {
      let authorId = req.user?.id;
      if (!authorId) {
        const [anyUser] = await pool.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
        authorId = anyUser[0]?.id;
      }

      await pool.query('DELETE FROM topics WHERE subject_id = ? AND is_recommendation = 0', [actualId]);
      if (authorId) {
        for (const t of topics) {
          if (!t || !t.title) continue;
          const payload = {
            resources: t.resources || [],
            files: t.files || [],
            quiz: t.quiz || [],
            flashcards: t.flashcards || []
          };
          await pool.query(
            `INSERT INTO topics (subject_id, title, description, created_by, status, content_payload, is_recommendation, color)
             VALUES (?, ?, ?, ?, 'approved', ?, 0, ?)`,
            [actualId, t.title.trim(), t.description || '', authorId, JSON.stringify(payload), t.color || 'bg-card-blue']
          );
        }
      }
    }

    return res.json({ success: true, subjectId: actualId, message: 'Subject updated successfully.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Another subject already uses that code.' });
    }
    console.error('updateSubject error:', err);
    return res.status(500).json({ success: false, message: 'Could not update subject.' });
  }
}

/** DELETE /api/reference/subjects/:id — admin deletes a subject */
async function deleteSubject(req, res) {
  const subjectId = req.params.id;
  try {
    let [result] = await pool.query('DELETE FROM subjects WHERE id = ?', [subjectId]);
    if (result.affectedRows === 0 && (req.query.code || req.query.name)) {
      await pool.query('DELETE FROM subjects WHERE code = ? OR name = ?', [req.query.code || '', req.query.name || '']);
    }
    return res.json({ success: true, message: 'Subject deleted successfully.' });
  } catch (err) {
    console.error('deleteSubject error:', err);
    return res.status(500).json({ success: false, message: 'Could not delete subject.' });
  }
}

/** GET /api/reference/my-enrolled-subjects — returns subjects the logged in student is taking this term */
async function getMyEnrolledSubjects(req, res) {
  await ensureSubjectColumns();
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    // 1. Get student profile, section, and strand
    const [userRows] = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.role, u.section_id,
              s.name AS section_name, s.grade_level,
              st.code AS strand_code, st.title AS strand_title
       FROM users u
       LEFT JOIN sections s ON u.section_id = s.id
       LEFT JOIN strands st ON s.strand_id = st.id
       WHERE u.id = ?`,
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const student = userRows[0];
    const gradeLevel = student.grade_level != null ? Number(student.grade_level) : 11;
    const strandCode = (student.strand_code || '').toUpperCase();
    const sectionName = student.section_name || '';

    // 2. Get active term from system_settings
    const [sysRows] = await pool.query(
      "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('current_quarter', 'current_semester')"
    );
    let termSetting = '1st Term';
    sysRows.forEach(r => {
      if (r.setting_key === 'current_quarter' && r.setting_value) termSetting = r.setting_value;
      else if (r.setting_key === 'current_semester' && r.setting_value && !termSetting) termSetting = r.setting_value;
    });

    let activeTermNum = 1;
    if (termSetting.includes('2')) activeTermNum = 2;
    else if (termSetting.includes('3')) activeTermNum = 3;
    else if (termSetting.includes('4')) activeTermNum = 4;

    // 3. Find any scheduled subject IDs for this student's section
    let scheduledSubjectIds = [];
    if (student.section_id) {
      const [schedRows] = await pool.query(
        `SELECT DISTINCT subject_id, quarter FROM schedules WHERE section_id = ?`,
        [student.section_id]
      );
      scheduledSubjectIds = schedRows
        .filter(sc => {
          if (!sc.quarter) return true;
          const q = sc.quarter.toLowerCase();
          if (q.includes('all')) return true;
          if (activeTermNum === 1 && (q.includes('1st') || q === '1')) return true;
          if (activeTermNum === 2 && (q.includes('2nd') || q === '2')) return true;
          if (activeTermNum === 3 && (q.includes('3rd') || q === '3')) return true;
          if (activeTermNum === 4 && (q.includes('4th') || q === '4')) return true;
          return false;
        })
        .map(sc => sc.subject_id);
    }

    // 4. Fetch all subjects
    const [allSubjectRows] = await pool.query('SELECT * FROM subjects ORDER BY grade_level ASC, name ASC');

    // 5. Fetch approved topics and recommendations
    const [topicRows] = await pool.query(
      `SELECT t.id, t.subject_id, t.title, t.description, t.color, t.comment, t.is_recommendation 
       FROM topics t 
       WHERE t.status = 'approved' 
       ORDER BY t.created_at ASC`
    );

    let topicsBySubject = {};
    let recsBySubject = {};
    topicRows.forEach(t => {
      const item = {
        id: t.id,
        title: t.title,
        description: t.description || '',
        color: t.color || 'bg-card-purple',
        comment: t.comment || ''
      };
      if (t.is_recommendation) {
        if (!recsBySubject[t.subject_id]) recsBySubject[t.subject_id] = [];
        recsBySubject[t.subject_id].push(item);
      } else {
        if (!topicsBySubject[t.subject_id]) topicsBySubject[t.subject_id] = [];
        topicsBySubject[t.subject_id].push(item);
      }
    });

    // 6. Filter subjects enrolled for THIS TERM
    const enrolledSubjects = allSubjectRows.filter(r => {
      if (scheduledSubjectIds.includes(r.id)) return true;

      const subGrade = r.grade_level != null ? Number(r.grade_level) : 11;
      const subStrand = (r.strand || '').toUpperCase();
      const subSec = (r.strand_section || '').toUpperCase();
      const subQuarter = r.quarter != null ? Number(r.quarter) : 1;

      // Grade level match (or 0 for all grades)
      if (subGrade !== 0 && subGrade !== gradeLevel) return false;

      // Strand match (Common, All Sections, or matches student's strand / section)
      const isCommon = subStrand === 'COMMON' || subStrand === 'ALL' || subStrand === '' || subSec.includes('ALL SECTIONS');
      const strandMatches = isCommon || (strandCode && subStrand === strandCode) || (strandCode && subSec.includes(strandCode));
      if (!strandMatches) return false;

      // Term match: 0 means All Terms (year-round), activeTermNum means current term
      return subQuarter === 0 || subQuarter === activeTermNum;
    }).map(r => {
      let cat = r.classification || 'Core Subject';
      if (cat === 'Core') cat = 'Core Subject';
      else if (cat === 'Applied') cat = 'Applied Subject';
      else if (cat === 'Specialized' || cat === 'Contextualized') cat = 'Specialized Subject';
      else if (cat === 'Institutional') cat = 'Institutional / Non-Academic';

      const qVal = r.quarter != null ? Number(r.quarter) : 1;
      let termStr = '1st Term';
      if (qVal === 0) termStr = 'All Terms';
      else if (qVal === 2) termStr = '2nd Term';
      else if (qVal === 3) termStr = '3rd Term';

      return {
        id: r.id,
        code: r.code || '',
        name: r.name || '',
        description: r.description || '',
        category: cat,
        classification: cat,
        gradeLevel: r.grade_level != null ? Number(r.grade_level) : 11,
        grade_level: r.grade_level != null ? Number(r.grade_level) : 11,
        quarter: qVal,
        term: termStr,
        termLabel: termStr,
        strand: r.strand || 'Common',
        strandSection: r.strand_section || 'All Sections',
        strand_section: r.strand_section || 'All Sections',
        color: r.color || 'bg-card-blue',
        topics: topicsBySubject[r.id] || [],
        recommendations: recsBySubject[r.id] || []
      };
    });

    return res.json({
      success: true,
      subjects: enrolledSubjects,
      activeTerm: termSetting,
      activeTermNum,
      studentProfile: {
        id: student.id,
        name: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
        gradeLevel,
        strandCode,
        sectionName
      }
    });
  } catch (err) {
    console.error('getMyEnrolledSubjects error:', err);
    return res.status(500).json({ success: false, message: 'Could not load enrolled subjects.' });
  }
}

/** GET /api/reference/grading-weights — returns the current grading category weights policy */
async function getGradingWeights(req, res) {
  try {
    const [rows] = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = 'grading_category_weights'");
    let weights = {
      'Core Subject': { ww: 20, pt: 50, qa: 30 },
      'Applied Subject': { ww: 25, pt: 45, qa: 30 },
      'Specialized Subject': { ww: 20, pt: 60, qa: 20 },
      'Institutional / Non-Academic': { ww: 20, pt: 60, qa: 20 }
    };
    if (rows.length && rows[0].setting_value) {
      try {
        weights = typeof rows[0].setting_value === 'string' ? JSON.parse(rows[0].setting_value) : rows[0].setting_value;
      } catch (e) {}
    }
    return res.json({ success: true, weights });
  } catch (err) {
    console.error('getGradingWeights error:', err);
    return res.status(500).json({ success: false, message: 'Could not load grading weights.' });
  }
}

/** PUT /api/reference/grading-weights — admin updates the grading category weights policy */
async function updateGradingWeights(req, res) {
  const { weights, applyToSubjects } = req.body;
  if (!weights || typeof weights !== 'object') {
    return res.status(400).json({ success: false, message: 'Invalid weights configuration.' });
  }

  // Validate that for every category, ww + pt + qa === 100
  for (const [cat, w] of Object.entries(weights)) {
    const total = (Number(w.ww) || 0) + (Number(w.pt) || 0) + (Number(w.qa) || 0);
    if (Math.round(total) !== 100) {
      return res.status(400).json({ success: false, message: `Weights for "${cat}" must sum to exactly 100% (currently ${total}%).` });
    }
  }

  try {
    const jsonStr = JSON.stringify(weights);
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value, updated_at)
       VALUES ('grading_category_weights', ?, NOW())
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()`,
      [jsonStr]
    );

    // If requested, cascade to existing subjects in each category
    if (applyToSubjects) {
      for (const [cat, w] of Object.entries(weights)) {
        await pool.query(
          `UPDATE subjects 
           SET ww_weight = ?, pt_weight = ?, qa_weight = ? 
           WHERE classification = ? OR classification LIKE ?`,
          [Number(w.ww), Number(w.pt), Number(w.qa), cat, `%${cat.replace(' Subject', '')}%`]
        );
      }
    }

    return res.json({ success: true, message: 'Grading weights updated successfully.', weights });
  } catch (err) {
    console.error('updateGradingWeights error:', err);
    return res.status(500).json({ success: false, message: 'Could not update grading weights.' });
  }
}

module.exports = {
  listStrands,
  listSections,
  createSection,
  listSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
  getMyEnrolledSubjects,
  getGradingWeights,
  updateGradingWeights
};
