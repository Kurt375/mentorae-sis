const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

async function createOfficialTemplate() {
  const dir = path.join(__dirname, '../templates');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const [subjects] = await pool.query('SELECT name, code, strand, grade_level FROM subjects ORDER BY strand, name');
  const [sections] = await pool.query(`
    SELECT sec.name, sec.grade_level, st.code AS strand_code, st.title AS strand_title
    FROM sections sec
    JOIN strands st ON st.id = sec.strand_id
    ORDER BY st.code, sec.grade_level, sec.name
  `);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Tanauan School of Fisheries - Mentorae SIS';
  wb.lastModifiedBy = 'Mentorae SIS System';
  wb.created = new Date();
  wb.modified = new Date();

  // -------------------------------------------------------------
  // Sheet 1: Instructions & Guide
  // -------------------------------------------------------------
  const wsInfo = wb.addWorksheet('Instructions');
  wsInfo.columns = [
    { header: '', key: 'colA', width: 5 },
    { header: '', key: 'colB', width: 30 },
    { header: '', key: 'colC', width: 70 }
  ];

  wsInfo.mergeCells('B2:C2');
  const titleCell = wsInfo.getCell('B2');
  titleCell.value = 'TANAUAN SCHOOL OF FISHERIES - BULK SCHEDULE TEMPLATE';
  titleCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FF0F5132' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };

  wsInfo.mergeCells('B3:C3');
  const subCell = wsInfo.getCell('B3');
  subCell.value = 'DepEd Senior High School Teacher Program & Schedule Import Guide';
  subCell.font = { name: 'Segoe UI', size: 11, italic: true, color: { argb: 'FF495057' } };

  const guideRows = [
    ['', 'Feature', 'Description / Instructions'],
    ['1', 'Official TSHS Layout', 'Each teacher has their own sheet (or a single teacher program sheet). The sheet name or Cell A14 contains the Teacher\'s Name.'],
    ['2', 'Time Column (Column A)', 'Time intervals are in Column A (e.g. 7:00 am - 8:00 am, 1:00 pm - 2:30 pm, 12:00 nn - 2:00 pm). Breaks (Flag Ceremony, Health Break, Lunch Break) are automatically ignored.'],
    ['3', 'Weekday Columns (B to F)', 'Column B = Monday, Column C = Tuesday, Column D = Wednesday, Column E = Thursday, Column F = Friday.'],
    ['4', 'Class Period Format', 'Standard slots use 2 rows: Top Row = Subject Name (e.g. General Mathematics), Bottom Row = Section (e.g. STEM 11 - Medical Sciences).'],
    ['5', 'Split / Short Periods', 'For 30-min split periods (e.g. Wednesday), put subject, time, and section in the cell, e.g.: "Effective Communication (8:00-8:30) (30 minutes) ASSH 11 - Humanities 2".'],
    ['6', 'Automatic Teacher Sync', 'Any teacher in the sheet who is not yet in the system will be automatically registered with their teacher account.'],
    ['7', 'Automatic Section Sync', 'Official TSHS sections (e.g. Engineering, Medical Sciences, Humanities 2) are automatically matched.'],
    ['8', 'Tabular Schedule Option', 'You can also upload a standard row-by-row table (Columns: Teacher, Subject, Strand, Section, Day, Start Time, End Time). Both formats are supported!']
  ];

  guideRows.forEach((r, idx) => {
    const row = wsInfo.addRow(['', r[1], r[2]]);
    row.height = idx === 0 ? 26 : 24;
    if (idx === 0) {
      row.eachCell((cell, colNum) => {
        if (colNum >= 2) {
          cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F5132' } };
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
      });
    } else {
      row.eachCell((cell, colNum) => {
        if (colNum >= 2) {
          cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF212529' } };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE9ECEF' } },
            bottom: { style: 'thin', color: { argb: 'FFE9ECEF' } },
            left: { style: 'thin', color: { argb: 'FFE9ECEF' } },
            right: { style: 'thin', color: { argb: 'FFE9ECEF' } }
          };
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        }
      });
    }
  });

  // -------------------------------------------------------------
  // Sheet 2: Blank Teacher Program Template
  // -------------------------------------------------------------
  function buildProgramSheet(ws, teacherName, scheduleData = []) {
    ws.columns = [
      { key: 'A', width: 22 },
      { key: 'B', width: 24 },
      { key: 'C', width: 24 },
      { key: 'D', width: 24 },
      { key: 'E', width: 24 },
      { key: 'F', width: 24 },
    ];

    ws.mergeCells('A12:F12');
    ws.getCell('A12').value = "TEACHER'S PROGRAM";
    ws.getCell('A12').font = { name: 'Calibri', size: 14, bold: true };
    ws.getCell('A12').alignment = { vertical: 'middle', horizontal: 'center' };

    ws.mergeCells('A13:F13');
    ws.getCell('A13').value = "1st TERM - SY 2026-2027";
    ws.getCell('A13').font = { name: 'Calibri', size: 12, bold: true };
    ws.getCell('A13').alignment = { vertical: 'middle', horizontal: 'center' };

    ws.mergeCells('A14:F14');
    ws.getCell('A14').value = teacherName;
    ws.getCell('A14').font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF0F5132' } };
    ws.getCell('A14').alignment = { vertical: 'middle', horizontal: 'center' };

    // Row 16: Headers
    const headers = ['Time', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const hRow = ws.getRow(16);
    hRow.height = 24;
    headers.forEach((h, idx) => {
      const cell = hRow.getCell(idx + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F5132' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    });

    const standardTimeSlots = [
      { r: 17, time: '6:30 am - 7:00 am', sub: '(30 mins.)', def: ['Flag Ceremony', 'Ground Improvement & Classroom Management', 'Ground Improvement & Classroom Management', 'Ground Improvement & Classroom Management', 'Ground Improvement & Classroom Management'] },
      { r: 19, time: '7:00 am - 8:00 am', sub: '(60 mins.)' },
      { r: 21, time: '8:00 am - 9:00 am', sub: '(60 mins.)' },
      { r: 23, time: '9:00 am - 9:20 am', sub: '(20 mins.)', def: ['HEALTH BREAK', 'HEALTH BREAK', 'HEALTH BREAK', 'HEALTH BREAK', 'HEALTH BREAK'] },
      { r: 25, time: '9:20 am - 10:20 am', sub: '(60 mins.)' },
      { r: 27, time: '10:20 am - 11:20 am', sub: '(60 mins.)' },
      { r: 29, time: '11:20 am - 12:00 pm', sub: '(40 mins.)', def: ['LUNCH BREAK', 'LUNCH BREAK', 'LUNCH BREAK', 'LUNCH BREAK', 'LUNCH BREAK'] },
      { r: 31, time: '12:00 pm - 1:00 pm', sub: '(60 mins.)' },
      { r: 33, time: '1:00 pm - 2:30 pm', sub: '(90 mins.)' },
      { r: 35, time: '2:30 pm - 3:30 pm', sub: '(60 mins.)' },
    ];

    standardTimeSlots.forEach(slot => {
      const row1 = ws.getRow(slot.r);
      const row2 = ws.getRow(slot.r + 1);
      row1.height = 22;
      row2.height = 20;

      row1.getCell(1).value = slot.time;
      row2.getCell(1).value = slot.sub;

      for (let c = 1; c <= 6; c++) {
        [row1.getCell(c), row2.getCell(c)].forEach(cell => {
          cell.font = { name: 'Calibri', size: 10 };
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
            bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
            left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
            right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
          };
        });
      }

      if (slot.def) {
        slot.def.forEach((txt, idx) => {
          row1.getCell(idx + 2).value = txt;
          row1.getCell(idx + 2).font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF6C757D' } };
          row1.getCell(idx + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } };
        });
      }
    });

    // Populate custom schedule if provided
    scheduleData.forEach(item => {
      const colNum = { 'Monday': 2, 'Tuesday': 3, 'Wednesday': 4, 'Thursday': 5, 'Friday': 6 }[item.day];
      if (!colNum) return;

      if (item.inline) {
        const cell = ws.getRow(item.row).getCell(colNum);
        cell.value = item.inline;
        cell.font = { name: 'Calibri', size: 9 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
      } else {
        const topCell = ws.getRow(item.row).getCell(colNum);
        const botCell = ws.getRow(item.row + 1).getCell(colNum);
        topCell.value = item.subject;
        topCell.font = { name: 'Calibri', size: 10, bold: true };
        topCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };

        botCell.value = item.section;
        botCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF2E7D32' } };
        botCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
      }
    });

    // Footer
    ws.mergeCells('A37:F37');
    ws.getCell('A37').value = 'Reference: DO #017, s. 2026';
    ws.getCell('A37').font = { name: 'Calibri', size: 9, italic: true };

    ws.mergeCells('A38:C38');
    ws.getCell('A38').value = 'Prepared by:';
    ws.getCell('A38').font = { name: 'Calibri', size: 10, bold: true };

    ws.mergeCells('E38:F38');
    ws.getCell('E38').value = 'Noted & Approved by:';
    ws.getCell('E38').font = { name: 'Calibri', size: 10, bold: true };

    ws.mergeCells('A41:C41');
    ws.getCell('A41').value = teacherName !== '[TEACHER FULL NAME]' ? teacherName : 'TEACHER NAME';
    ws.getCell('A41').font = { name: 'Calibri', size: 11, bold: true };

    ws.mergeCells('E41:F41');
    ws.getCell('E41').value = 'JAENA N. DELA CERNA';
    ws.getCell('E41').font = { name: 'Calibri', size: 11, bold: true };

    ws.mergeCells('A42:C42');
    ws.getCell('A42').value = 'Teacher / Faculty';
    ws.getCell('A42').font = { name: 'Calibri', size: 10, italic: true };

    ws.mergeCells('E42:F42');
    ws.getCell('E42').value = 'School Head';
    ws.getCell('E42').font = { name: 'Calibri', size: 10, italic: true };
  }

  // Blank Sheet
  const wsBlank = wb.addWorksheet('Blank Teacher Template');
  buildProgramSheet(wsBlank, '[TEACHER FULL NAME]');

  // Sample Sheet 1: Joshua R. Almazon
  const wsSample1 = wb.addWorksheet('Sample - Almazon, Joshua R.');
  buildProgramSheet(wsSample1, 'JOSHUA R. ALMAZON', [
    { day: 'Wednesday', row: 19, inline: 'Effective Communication (8:00-8:30) (30 minutes)\nASSH 11 - Humanities 2' },
    { day: 'Thursday', row: 19, subject: 'Effective Communication', section: 'ASSH 11 - Humanities 2' },
    { day: 'Friday', row: 19, subject: 'Effective Communication', section: 'ASSH 11 - Humanities 2' },

    { day: 'Wednesday', row: 21, inline: 'Effective Communication (8:30-9:00) (30 minutes)\nBAE 11 - Entrepreneurship' },
    { day: 'Thursday', row: 21, subject: 'Effective Communication', section: 'BAE 11 - Entrepreneurship' },
    { day: 'Friday', row: 21, subject: 'Effective Communication', section: 'BAE 11 - Entrepreneurship' },

    { day: 'Wednesday', row: 25, inline: 'Effective Communication (9:50-10:20) (30 minutes)\nASSH 11 - Humanities 3' },
    { day: 'Thursday', row: 25, subject: 'Effective Communication', section: 'ASSH 11 - Humanities 3' },
    { day: 'Friday', row: 25, subject: 'Effective Communication', section: 'ASSH 11 - Humanities 3' },

    { day: 'Wednesday', row: 31, inline: 'Effective Communication (12:00-12:30) (30 minutes)\nBAE 11 - Accountancy' },
    { day: 'Thursday', row: 31, subject: 'Effective Communication', section: 'BAE 11 - Accountancy' },
    { day: 'Friday', row: 31, subject: 'Effective Communication', section: 'BAE 11 - Accountancy' },

    { day: 'Monday', row: 33, subject: 'Creative Composition', section: 'ASSH 11 - Humanities 3' },
    { day: 'Tuesday', row: 33, subject: 'Creative Composition', section: 'ASSH 11 - Humanities 3' },
    { day: 'Wednesday', row: 33, subject: 'Creative Composition', section: 'ASSH 11 - Humanities 3' },
    { day: 'Thursday', row: 33, subject: 'Creative Composition', section: 'ASSH 11 - Humanities 3' },
    { day: 'Friday', row: 33, subject: 'Creative Composition', section: 'ASSH 11 - Humanities 3' },
  ]);

  // Sample Sheet 2: Ellaine E. Anago (General Science across STEM Medical Sciences, Engineering, Humanities 2)
  const wsSample2 = wb.addWorksheet('Sample - Anago, Ellaine E.');
  buildProgramSheet(wsSample2, 'ELLAINE E. ANAGO', [
    { day: 'Monday', row: 19, subject: 'General Science', section: 'STEM 11 - Medical Sciences' },
    { day: 'Tuesday', row: 19, subject: 'General Science', section: 'STEM 11 - Medical Sciences' },
    { day: 'Wednesday', row: 19, subject: 'General Science', section: 'STEM 11 - Medical Sciences' },
    { day: 'Thursday', row: 19, subject: 'General Science', section: 'STEM 11 - Medical Sciences' },
    { day: 'Friday', row: 19, subject: 'General Science', section: 'STEM 11 - Medical Sciences' },

    { day: 'Monday', row: 25, subject: 'General Science', section: 'STEM 11 - Engineering' },
    { day: 'Tuesday', row: 25, subject: 'General Science', section: 'STEM 11 - Engineering' },
    { day: 'Wednesday', row: 25, subject: 'General Science', section: 'STEM 11 - Engineering' },
    { day: 'Thursday', row: 25, subject: 'General Science', section: 'STEM 11 - Engineering' },
    { day: 'Friday', row: 25, subject: 'General Science', section: 'STEM 11 - Engineering' },

    { day: 'Monday', row: 27, subject: 'General Science', section: 'ASSH 11 - Humanities 2' },
    { day: 'Tuesday', row: 27, subject: 'General Science', section: 'ASSH 11 - Humanities 2' },
    { day: 'Wednesday', row: 27, subject: 'General Science', section: 'ASSH 11 - Humanities 2' },
    { day: 'Thursday', row: 27, subject: 'General Science', section: 'ASSH 11 - Humanities 2' },
    { day: 'Friday', row: 27, subject: 'General Science', section: 'ASSH 11 - Humanities 2' },
  ]);

  // -------------------------------------------------------------
  // Sheet 3: Reference Guide (Sections & Subjects)
  // -------------------------------------------------------------
  const wsRef = wb.addWorksheet('Sections & Subjects Guide');
  wsRef.columns = [
    { header: 'Strand Code', key: 'strand', width: 14 },
    { header: 'Grade Level', key: 'grade', width: 14 },
    { header: 'Section Name', key: 'section', width: 30 },
    { header: '', key: 'spacer', width: 5 },
    { header: 'Subject Code', key: 'subCode', width: 16 },
    { header: 'Official Subject Name', key: 'subName', width: 44 },
    { header: 'Track / Strand', key: 'subStrand', width: 18 }
  ];

  const refHeader = wsRef.getRow(1);
  refHeader.height = 26;
  refHeader.eachCell(cell => {
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F5132' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const maxRows = Math.max(sections.length, subjects.length);
  for (let i = 0; i < maxRows; i++) {
    const sec = sections[i] || {};
    const sub = subjects[i] || {};
    const r = wsRef.addRow([
      sec.strand_code || '',
      sec.grade_level ? `Grade ${sec.grade_level}` : '',
      sec.name || '',
      '',
      sub.code || '',
      sub.name || '',
      sub.strand || ''
    ]);
    r.height = 20;
    r.eachCell((cell, colNum) => {
      cell.font = { name: 'Segoe UI', size: 9 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE9ECEF' } },
        bottom: { style: 'thin', color: { argb: 'FFE9ECEF' } },
        left: { style: 'thin', color: { argb: 'FFE9ECEF' } },
        right: { style: 'thin', color: { argb: 'FFE9ECEF' } }
      };
      if ([1, 2, 5].includes(colNum)) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });
  }

  const outPath = path.join(dir, 'tshs_schedule_template.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`Generated official template at: ${outPath} (${fs.statSync(outPath).size} bytes)`);
}

createOfficialTemplate().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
