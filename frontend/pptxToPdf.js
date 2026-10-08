/**
 * Mentorae SIS - Client-Side PPTX to PDF Converter
 * Converts PowerPoint presentations (.pptx) into genuine, high-resolution multi-page PDF documents
 * directly in the browser using JSZip, HTML5 Canvas, and jsPDF.
 * Zero external API dependency, zero server load, instant Google Classroom-style presentation viewing.
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MentoraePptxToPdf = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    function isHexDark(hex) {
        if (!hex || typeof hex !== 'string') return false;
        const clean = hex.replace('#', '');
        if (clean.length !== 6) return false;
        const r = parseInt(clean.substr(0, 2), 16);
        const g = parseInt(clean.substr(2, 2), 16);
        const b = parseInt(clean.substr(4, 2), 16);
        return (r * 299 + g * 587 + b * 114) / 1000 < 128;
    }

    function loadImageAsync(src) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = src;
        });
    }

    /**
     * Converts a PPTX ArrayBuffer or Base64 Data URL to a PDF Data URL
     * @param {ArrayBuffer|string} input - PPTX arrayBuffer or data: URL
     * @param {Function} [onProgress] - Optional callback(progressObj)
     * @returns {Promise<string>} - Complete data:application/pdf;base64,... string
     */
    async function convert(input, onProgress = () => {}) {
        if (!window.JSZip) {
            throw new Error('JSZip library is required for presentation conversion.');
        }
        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error('jsPDF library is required for presentation conversion.');
        }

        let arrayBuffer = null;
        if (input instanceof ArrayBuffer) {
            arrayBuffer = input;
        } else if (typeof input === 'string') {
            const b64 = input.includes(',') ? input.split(',')[1] : input;
            const binary = atob(b64);
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            arrayBuffer = bytes.buffer;
        }

        if (!arrayBuffer) {
            throw new Error('Invalid presentation input data.');
        }

        onProgress({ stage: 'reading', message: 'Reading presentation archive...', percent: 10 });
        const zip = await window.JSZip.loadAsync(arrayBuffer);

        // 1. Determine slide dimensions
        let slideWidthEmu = 19050000;
        let slideHeightEmu = 10715625;
        try {
            const presFile = zip.files['ppt/presentation.xml'];
            if (presFile) {
                const presXml = await presFile.async('string');
                const cxMatch = presXml.match(/cx="(\d+)"/i);
                const cyMatch = presXml.match(/cy="(\d+)"/i);
                if (cxMatch && cyMatch) {
                    const pw = parseInt(cxMatch[1], 10);
                    const ph = parseInt(cyMatch[1], 10);
                    if (pw > 0 && ph > 0) {
                        slideWidthEmu = pw;
                        slideHeightEmu = ph;
                    }
                }
            }
        } catch (e) { }

        const ratio = slideWidthEmu / slideHeightEmu;
        const canvasW = 1600;
        const canvasH = Math.round(1600 / ratio);
        const pdfWidthPt = 960;
        const pdfHeightPt = Math.round(960 / ratio);

        // 2. Extract media images
        onProgress({ stage: 'media', message: 'Extracting presentation assets...', percent: 20 });
        const mediaImages = {};
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
                    const blob = new Blob([u8], { type: mType });
                    const url = URL.createObjectURL(blob);
                    const img = await loadImageAsync(url);
                    if (img) {
                        const cleanKey = path.replace(/^ppt\//, '');
                        mediaImages[cleanKey] = img;
                        mediaImages[path] = img;
                    }
                } catch (e) { }
            }
        }

        // 3. Find all slide files in order
        const slideKeys = Object.keys(zip.files).filter(k => /^ppt\/slides\/slide\d+\.xml$/i.test(k));
        slideKeys.sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)[0], 10);
            const numB = parseInt(b.match(/\d+/)[0], 10);
            return numA - numB;
        });

        if (slideKeys.length === 0) {
            throw new Error('No slides found in presentation.');
        }

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: ratio >= 1 ? 'landscape' : 'portrait',
            unit: 'pt',
            format: [pdfWidthPt, pdfHeightPt]
        });

        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d', { alpha: false });

        for (let i = 0; i < slideKeys.length; i++) {
            const slideKey = slideKeys[i];
            const slideNum = i + 1;
            const progressPct = 20 + Math.round(((i + 1) / slideKeys.length) * 75);
            onProgress({
                stage: 'rendering',
                current: slideNum,
                total: slideKeys.length,
                message: `Rendering slide ${slideNum} of ${slideKeys.length}...`,
                percent: progressPct
            });

            const xmlText = await zip.files[slideKey].async('string');

            // Slide relationships
            const relsPath = slideKey.replace('ppt/slides/', 'ppt/slides/_rels/').concat('.rels');
            const relsMap = {};
            if (zip.files[relsPath]) {
                try {
                    const relsText = await zip.files[relsPath].async('string');
                    const relRegex = /<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"/g;
                    let rMatch;
                    while ((rMatch = relRegex.exec(relsText)) !== null) {
                        const cleanTarget = rMatch[2].replace(/^\.\.\//, '');
                        relsMap[rMatch[1]] = mediaImages[cleanTarget] || mediaImages[cleanTarget.replace(/^media\//, '')];
                    }
                } catch (e) { }
            }

            // Determine Background
            let bgColor = '#FFFFFF';
            let bgImage = null;
            const bgClrMatch = xmlText.match(/<p:bg>[\s\S]*?<a:srgbClr\s+val="([A-Fa-f0-9]{6})"/);
            if (bgClrMatch) {
                bgColor = '#' + bgClrMatch[1];
            }
            const bgBlipMatch = xmlText.match(/<p:bg>[\s\S]*?r:embed="([^"]+)"/);
            if (bgBlipMatch && relsMap[bgBlipMatch[1]]) {
                bgImage = relsMap[bgBlipMatch[1]];
            }

            // Draw Background
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, canvasW, canvasH);
            if (bgImage) {
                ctx.drawImage(bgImage, 0, 0, canvasW, canvasH);
            }

            const slideIsDark = isHexDark(bgColor);
            const defaultTextColor = slideIsDark ? '#FFFFFF' : '#1E293B';

            // Parse shapes & pictures
            function parseItems(xmlStr) {
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
                        if (gw > 0 && gh > 0) grpInfo = { gx, gy, gw, gh, chX, chY, chW, chH };
                    }
                    const innerSp = grpNode.match(/<p:sp[\s\S]*?<\/p:sp>/g) || [];
                    const innerPic = grpNode.match(/<p:pic[\s\S]*?<\/p:pic>/g) || [];
                    [...innerSp, ...innerPic].forEach(childNode => results.push({ node: childNode, group: grpInfo }));
                });

                const strippedXml = xmlStr.replace(/<p:grpSp[\s\S]*?<\/p:grpSp>/g, '');
                const rootSp = strippedXml.match(/<p:sp[\s\S]*?<\/p:sp>/g) || [];
                const rootPic = strippedXml.match(/<p:pic[\s\S]*?<\/p:pic>/g) || [];
                [...rootSp, ...rootPic].forEach(rootNode => results.push({ node: rootNode, group: null }));
                return results;
            }

            const items = parseItems(xmlText);

            items.forEach(({ node, group }) => {
                const xMatch = node.match(/<a:off[^>]+x="([^"]+)"[^>]+y="([^"]+)"/);
                const extMatch = node.match(/<a:ext[^>]+cx="([^"]+)"[^>]+cy="([^"]+)"/);
                if (!xMatch || !extMatch) return;

                let cx = parseInt(xMatch[1], 10);
                let cy = parseInt(xMatch[2], 10);
                let cw = parseInt(extMatch[1], 10);
                let ch = parseInt(extMatch[2], 10);
                if (cw <= 0 || ch <= 0) return;

                let fx = cx, fy = cy, fw = cw, fh = ch;
                if (group) {
                    fx = group.gx + ((cx - group.chX) * group.gw / group.chW);
                    fy = group.gy + ((cy - group.chY) * group.gh / group.chH);
                    fw = cw * group.gw / group.chW;
                    fh = ch * group.gh / group.chH;
                }

                const px = (fx / slideWidthEmu) * canvasW;
                const py = (fy / slideHeightEmu) * canvasH;
                const pw = (fw / slideWidthEmu) * canvasW;
                const ph = (fh / slideHeightEmu) * canvasH;

                // Picture
                const blipMatch = node.match(/r:embed="([^"]+)"/);
                if (blipMatch && relsMap[blipMatch[1]]) {
                    const img = relsMap[blipMatch[1]];
                    ctx.drawImage(img, px, py, pw, ph);
                }

                // Shape fill
                let shapeBg = null;
                const spPrMatch = node.match(/<p:spPr[\s\S]*?<\/p:spPr>/);
                if (spPrMatch) {
                    const spPr = spPrMatch[0];
                    if (!spPr.includes('<a:noFill')) {
                        const solidMatch = spPr.match(/<a:solidFill>[\s\S]*?<a:srgbClr\s+val="([A-Fa-f0-9]{6})"/);
                        if (solidMatch) {
                            shapeBg = '#' + solidMatch[1];
                            ctx.fillStyle = shapeBg;
                            ctx.beginPath();
                            if (ctx.roundRect) {
                                ctx.roundRect(px, py, pw, ph, 8);
                            } else {
                                ctx.rect(px, py, pw, ph);
                            }
                            ctx.fill();
                        }
                    }
                }

                // Text
                const pMatches = node.match(/<a:p[\s\S]*?<\/a:p>/g) || [];
                if (pMatches.length > 0) {
                    let curY = py + 16;
                    pMatches.forEach(pNode => {
                        let align = 'left';
                        if (pNode.includes('algn="ctr"')) align = 'center';
                        else if (pNode.includes('algn="r"')) align = 'right';

                        const rMatches = pNode.match(/<a:r[\s\S]*?<\/a:r>|<a:br\/>/g) || [];
                        let pLine = '';
                        let pColor = defaultTextColor;
                        let pSizePt = 16;
                        let pBold = false;
                        let pFont = 'Roboto, Arial, sans-serif';

                        rMatches.forEach(rNode => {
                            if (rNode === '<a:br/>') {
                                pLine += '\n';
                            } else {
                                const tMatch = rNode.match(/<a:t>([\s\S]*?)<\/a:t>/);
                                if (tMatch) {
                                    pLine += tMatch[1];
                                    if (rNode.includes('b="1"') || rNode.includes('typeface="Roboto Bold"')) pBold = true;
                                    const szMatch = rNode.match(/sz="(\d+)"/);
                                    if (szMatch) pSizePt = parseInt(szMatch[1], 10) / 100;

                                    const clrMatch = rNode.match(/<a:srgbClr\s+val="([A-Fa-f0-9]{6})"/);
                                    if (clrMatch) {
                                        pColor = '#' + clrMatch[1];
                                    } else if (rNode.includes('val="tx1"') || rNode.includes('val="dk1"')) {
                                        pColor = slideIsDark ? '#FFFFFF' : '#0F172A';
                                    } else if (rNode.includes('val="bg1"') || rNode.includes('val="lt1"')) {
                                        pColor = slideIsDark ? '#CBD5E1' : '#FFFFFF';
                                    }

                                    const fontMatch = rNode.match(/typeface="([^"]+)"/);
                                    if (fontMatch) {
                                        const fn = fontMatch[1];
                                        if (fn === 'Anton') pFont = 'Anton, Impact, sans-serif';
                                        else if (fn.includes('Montserrat')) pFont = 'Montserrat, sans-serif';
                                        else if (fn === 'Courier New') pFont = 'Courier New, monospace';
                                    }
                                }
                            }
                        });

                        if (pLine.trim().length > 0) {
                            // Smart contrast correction against effective background
                            const effectiveBg = shapeBg || (slideIsDark ? '#000000' : '#FFFFFF');
                            const bgIsDark = isHexDark(effectiveBg);
                            if (bgIsDark && isHexDark(pColor)) {
                                pColor = '#CBD5E1';
                            } else if (!bgIsDark && !isHexDark(pColor)) {
                                pColor = '#0F172A';
                            }

                            const fontSizePx = Math.max(12, Math.min(68, Math.round((pSizePt / (slideWidthEmu / 12700)) * canvasW * 1.05)));
                            ctx.font = `${pBold ? 'bold ' : ''}${fontSizePx}px ${pFont}`;
                            ctx.fillStyle = pColor;
                            ctx.textAlign = align;

                            let drawX = px;
                            if (align === 'center') drawX = px + pw / 2;
                            else if (align === 'right') drawX = px + pw;

                            // Handle multiple lines / wrap
                            const lines = pLine.split('\n');
                            lines.forEach(lineText => {
                                if (lineText.length > 0) {
                                    // Word wrap if line exceeds bounding width
                                    const words = lineText.split(' ');
                                    let currentLine = '';
                                    words.forEach(w => {
                                        const testLine = currentLine ? `${currentLine} ${w}` : w;
                                        const testW = ctx.measureText(testLine).width;
                                        if (testW > pw && currentLine) {
                                            ctx.fillText(currentLine, drawX, curY);
                                            curY += fontSizePx * 1.18;
                                            currentLine = w;
                                        } else {
                                            currentLine = testLine;
                                        }
                                    });
                                    if (currentLine) {
                                        ctx.fillText(currentLine, drawX, curY);
                                        curY += fontSizePx * 1.18;
                                    }
                                }
                            });
                        }
                    });
                }
            });

            // Convert canvas to image and append to PDF
            const slideImgData = canvas.toDataURL('image/jpeg', 0.93);
            if (i > 0) {
                pdf.addPage([pdfWidthPt, pdfHeightPt], ratio >= 1 ? 'landscape' : 'portrait');
            }
            pdf.addImage(slideImgData, 'JPEG', 0, 0, pdfWidthPt, pdfHeightPt, undefined, 'FAST');
        }

        onProgress({ stage: 'finalizing', message: 'Generating classroom PDF document...', percent: 100 });
        const pdfDataUrl = pdf.output('datauristring');
        return pdfDataUrl;
    }

    return {
        convert,
        isHexDark
    };
}));
