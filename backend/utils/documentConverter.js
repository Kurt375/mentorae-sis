const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const CONVERTED_DIR = path.join(__dirname, '../uploads/converted');
if (!fs.existsSync(CONVERTED_DIR)) {
  fs.mkdirSync(CONVERTED_DIR, { recursive: true });
}

/**
 * Converts Office documents (.pptx, .ppt, .docx, .doc) to PDF.
 * @param {Buffer|string} inputBufferOrBase64 - File buffer or dataUrl string
 * @param {string} originalFilename - e.g. "Lecture1.pptx"
 * @returns {Promise<{ success: boolean, pdfDataUrl?: string, pdfBuffer?: Buffer, error?: string, cached?: boolean }>}
 */
async function convertOfficeToPdf(inputBufferOrBase64, originalFilename = 'document.pptx') {
  try {
    let fileBuffer;
    if (Buffer.isBuffer(inputBufferOrBase64)) {
      fileBuffer = inputBufferOrBase64;
    } else if (typeof inputBufferOrBase64 === 'string') {
      const b64 = inputBufferOrBase64.includes(',') 
        ? inputBufferOrBase64.split(',')[1] 
        : inputBufferOrBase64;
      fileBuffer = Buffer.from(b64, 'base64');
    } else {
      throw new Error('Invalid input: expected Buffer or Base64 string');
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error('Input file buffer is empty');
    }

    const ext = path.extname(originalFilename || '').toLowerCase();
    const isPpt = ext === '.pptx' || ext === '.ppt';
    const isWord = ext === '.docx' || ext === '.doc';

    if (!isPpt && !isWord) {
      // If it's already a PDF, return it directly
      if (ext === '.pdf') {
        const dataUrl = `data:application/pdf;base64,${fileBuffer.toString('base64')}`;
        return { success: true, pdfDataUrl: dataUrl, pdfBuffer: fileBuffer, cached: true };
      }
      throw new Error(`Unsupported document extension for conversion: ${ext}`);
    }

    // Hash the buffer for caching
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const cachedPdfPath = path.join(CONVERTED_DIR, `${hash}.pdf`);

    if (fs.existsSync(cachedPdfPath)) {
      const cachedBuf = fs.readFileSync(cachedPdfPath);
      if (cachedBuf.length > 0) {
        const dataUrl = `data:application/pdf;base64,${cachedBuf.toString('base64')}`;
        return { success: true, pdfDataUrl: dataUrl, pdfBuffer: cachedBuf, cached: true };
      }
    }

    // Write temp input file
    const tempInputPath = path.join(CONVERTED_DIR, `temp_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    const tempOutputPath = path.join(CONVERTED_DIR, `temp_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
    fs.writeFileSync(tempInputPath, fileBuffer);

    try {
      if (process.platform === 'win32') {
        // Windows Office COM Automation
        let psContent = '';
        if (isPpt) {
          psContent = `
$ErrorActionPreference = 'Stop'
$in = "${tempInputPath.replace(/\\/g, '\\\\')}"
$out = "${tempOutputPath.replace(/\\/g, '\\\\')}"
$ppt = New-Object -ComObject PowerPoint.Application
try {
    $pres = $ppt.Presentations.Open($in, [Microsoft.Office.Core.MsoTriState]::msoTrue, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse)
    $pres.SaveAs($out, 32)
    $pres.Close()
    Write-Host "OK"
} finally {
    $ppt.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($ppt) | Out-Null
}
`;
        } else {
          psContent = `
$ErrorActionPreference = 'Stop'
$in = "${tempInputPath.replace(/\\/g, '\\\\')}"
$out = "${tempOutputPath.replace(/\\/g, '\\\\')}"
$word = New-Object -ComObject Word.Application
try {
    $doc = $word.Documents.Open($in, $false, $true)
    $doc.SaveAs([ref]$out, [ref]17)
    $doc.Close()
    Write-Host "OK"
} finally {
    $word.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
}
`;
        }

        const psFile = path.join(CONVERTED_DIR, `convert_${Date.now()}.ps1`);
        fs.writeFileSync(psFile, psContent);
        try {
          execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`, {
            timeout: 45000,
            stdio: ['ignore', 'pipe', 'pipe']
          });
        } finally {
          if (fs.existsSync(psFile)) fs.unlinkSync(psFile);
        }
      } else {
        // Linux / LibreOffice Headless fallback
        execSync(`soffice --headless --convert-to pdf "${tempInputPath}" --outdir "${CONVERTED_DIR}"`, {
          timeout: 45000,
          stdio: ['ignore', 'pipe', 'pipe']
        });
        const libreOutName = path.basename(tempInputPath, ext) + '.pdf';
        const libreOutPath = path.join(CONVERTED_DIR, libreOutName);
        if (fs.existsSync(libreOutPath)) {
          fs.renameSync(libreOutPath, tempOutputPath);
        }
      }

      if (!fs.existsSync(tempOutputPath) || fs.statSync(tempOutputPath).size === 0) {
        throw new Error('Converted PDF file was not created or is empty');
      }

      // Read output buffer and write to permanent cache
      const pdfBuf = fs.readFileSync(tempOutputPath);
      fs.writeFileSync(cachedPdfPath, pdfBuf);

      const pdfDataUrl = `data:application/pdf;base64,${pdfBuf.toString('base64')}`;
      return { success: true, pdfDataUrl, pdfBuffer: pdfBuf, cached: false };

    } finally {
      // Clean up temp files
      if (fs.existsSync(tempInputPath)) try { fs.unlinkSync(tempInputPath); } catch (e) {}
      if (fs.existsSync(tempOutputPath)) try { fs.unlinkSync(tempOutputPath); } catch (e) {}
    }
  } catch (err) {
    console.error(`Document conversion error for "${originalFilename}":`, err.message || err);
    return { success: false, error: err.message || 'Conversion failed' };
  }
}

module.exports = {
  convertOfficeToPdf
};
