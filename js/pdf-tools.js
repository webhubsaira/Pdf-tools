/**
 * DocuFlow - PDF Operations Engine
 * Real browser-side processing powered by PDF-Lib, JSZip, and HTML5 Canvas
 */

import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import JSZip from 'jszip';
import { readFileAsArrayBuffer, readFileAsDataURL } from './file-handler.js';

async function loadPdfJs() {
  const [pdfjsLib, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  ]);
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
  return pdfjsLib;
}

async function extractPdfPageTexts(file, onProgress) {
  const layouts = await extractPdfPageLayouts(file, onProgress);
  return layouts.map((page) => page.lines
    .map(layoutLineText)
    .filter(Boolean));
}

async function extractPdfPageLayouts(file, onProgress) {
  const pdfjsLib = await loadPdfJs();
  const data = new Uint8Array(await readFileAsArrayBuffer(file));
  const document = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    if (onProgress) {
      onProgress(15 + Math.round(pageNumber / document.numPages * 65), `Reading editable text positions from page ${pageNumber} of ${document.numPages}...`);
    }
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items
      .filter((item) => typeof item.str === 'string' && item.str.trim())
      .map((item) => {
        const fontSize = Math.hypot(item.transform[0], item.transform[1]) || Math.abs(item.height) || 10;
        const fontStyle = content.styles[item.fontName];
        const fontName = String(fontStyle?.fontFamily || '').toLowerCase();
        return {
          text: item.str,
          x: item.transform[4],
          y: item.transform[5],
          right: item.transform[4] + (item.width || 0),
          fontSize,
          fontFamily: fontStyle?.fontFamily || 'Arial',
          bold: /bold|black|heavy|demi/i.test(fontName),
          italic: /italic|oblique/i.test(fontName),
          hasEOL: item.hasEOL === true
        };
      })
      .sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];

    for (const item of items) {
      let line = lines[lines.length - 1];
      if (!line || Math.abs(line.y - item.y) > Math.max(2, Math.min(5, item.fontSize * 0.25))) {
        line = { y: item.y, items: [] };
        lines.push(line);
      }
      line.items.push(item);
    }

    for (const line of lines) {
      line.items.sort((a, b) => a.x - b.x);
      line.x = line.items[0]?.x || 0;
      line.fontSize = Math.max(...line.items.map((item) => item.fontSize), 10);
    }
    pages.push({
      width: viewport.width,
      height: viewport.height,
      lines
    });
  }

  return pages;
}

function xmlEscape(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;'
  })[character]);
}

function textToPdfDocument(text, title, onProgress) {
  const paragraphs = String(text).replace(/\r\n?/g, '\n').split('\n');
  const document = PDFDocument.create();
  return document.then(async (pdf) => {
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontSize = 10;
    const lineHeight = 14;
    const margin = 48;
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const maxChars = 96;
    let page = pdf.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;
    let pageCount = 1;
    const lines = paragraphs.flatMap((paragraph) => {
      if (!paragraph) return [''];
      const wrapped = [];
      let remaining = paragraph;
      while (remaining.length > maxChars) {
        let breakAt = remaining.lastIndexOf(' ', maxChars);
        if (breakAt < 1) breakAt = maxChars;
        wrapped.push(remaining.slice(0, breakAt));
        remaining = remaining.slice(breakAt).trimStart();
      }
      wrapped.push(remaining);
      return wrapped;
    });

    for (let index = 0; index < lines.length; index++) {
      if (y < margin) {
        page = pdf.addPage([pageWidth, pageHeight]);
        pageCount++;
        y = pageHeight - margin;
      }
      const safeLine = lines[index].replace(/[^\u0000-\u00FF]/g, '?');
      if (safeLine) page.drawText(safeLine, { x: margin, y, size: fontSize, font, color: rgb(0.12, 0.14, 0.18) });
      y -= lineHeight;
      if (index % 100 === 0 && onProgress) onProgress(75, `Formatting document (${index + 1} of ${lines.length} lines)...`);
    }

    pdf.setTitle(title);
    return { data: await pdf.save(), pageCount };
  });
}

function makeSpreadsheetBlob(rows) {
  const zip = new JSZip();
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, colIndex) => {
      let column = '';
      for (let n = colIndex + 1; n > 0; n = Math.floor((n - 1) / 26)) {
        column = String.fromCharCode(65 + (n - 1) % 26) + column;
      }
      const address = `${column}${rowIndex + 1}`;
      return `<c r="${address}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Extracted Data" sheetId="1" r:id="rId1"/></sheets>
</workbook>`);
  zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function layoutLineText(line) {
  return line.items.map((item, index) => {
    if (index === 0) return item.text;
    const gap = item.x - line.items[index - 1].right;
    return `${gap > Math.max(2, item.fontSize * 0.2) ? ' ' : ''}${item.text}`;
  }).join('').trim();
}

function layoutLineCells(line) {
  const cells = [];
  let text = '';
  let right = null;
  for (const item of line.items) {
    const gap = right === null ? 0 : item.x - right;
    if (right !== null && gap > Math.max(12, item.fontSize * 1.8)) {
      if (text.trim()) cells.push(text.trim());
      text = item.text;
    } else {
      text += `${right !== null && gap > Math.max(2, item.fontSize * 0.2) ? ' ' : ''}${item.text}`;
    }
    right = item.right;
  }
  if (text.trim()) cells.push(text.trim());
  return cells;
}

function wordTextRun(item) {
  const safeText = item.text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  if (!safeText) return '';
  const family = String(item.fontFamily || 'Arial').replace(/[^a-z0-9 ,_-]/gi, '').slice(0, 80) || 'Arial';
  const styles = `${item.bold ? '<w:b/><w:bCs/>' : ''}${item.italic ? '<w:i/><w:iCs/>' : ''}`;
  const fontSize = Math.max(2, Math.round(item.fontSize * 1.5));
  return `<w:r><w:rPr><w:rFonts w:ascii="${xmlEscape(family)}" w:hAnsi="${xmlEscape(family)}"/><w:sz w:val="${fontSize}"/><w:szCs w:val="${fontSize}"/>${styles}</w:rPr><w:t xml:space="preserve">${xmlEscape(safeText)}</w:t></w:r>`;
}

/**
 * Merge multiple PDF files into one
 */
export async function processMergePDF(files, onProgress) {
  if (!files || files.length < 2) {
    throw new Error('Please select at least 2 PDF files to merge.');
  }

  if (onProgress) onProgress(15, 'Initializing merge workspace...');
  const mergedPdf = await PDFDocument.create();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const percent = Math.round(15 + ((i + 1) / files.length) * 70);
    if (onProgress) onProgress(percent, `Merging file ${i + 1} of ${files.length}: ${file.name}...`);

    const arrayBuffer = await readFileAsArrayBuffer(file);
    const sourcePdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }

  if (onProgress) onProgress(95, 'Finalizing merged document...');
  const pdfBytes = await mergedPdf.save();
  return {
    data: pdfBytes,
    filename: `ilovepdfs-merged-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    pageCount: mergedPdf.getPageCount()
  };
}

/**
 * Parse page range string like "1-3, 5, 8-10"
 */
export function parsePageRanges(rangeStr, maxPages) {
  if (!rangeStr || !rangeStr.trim()) {
    throw new Error('Please enter at least one page or page range (e.g. 1-3, 5).');
  }

  const pages = new Set();
  const parts = rangeStr.split(',');

  for (const part of parts) {
    const clean = part.trim();
    if (!clean) continue;

    if (clean.includes('-')) {
      const [startStr, endStr] = clean.split('-');
      const start = parseInt(startStr.trim(), 10);
      const end = parseInt(endStr.trim(), 10);

      if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
        throw new Error(`Invalid range format: "${clean}". Use format like 1-3.`);
      }

      for (let p = start; p <= end; p++) {
        if (p <= maxPages) {
          pages.add(p - 1); // 0-indexed
        }
      }
    } else {
      const pageNum = parseInt(clean, 10);
      if (isNaN(pageNum) || pageNum < 1) {
        throw new Error(`Invalid page number: "${clean}".`);
      }
      if (pageNum <= maxPages) {
        pages.add(pageNum - 1);
      }
    }
  }

  if (pages.size === 0) {
    throw new Error(`Specified pages exceed total document pages (${maxPages}).`);
  }

  return Array.from(pages).sort((a, b) => a - b);
}

/**
 * Split PDF by page range
 */
export async function processSplitPDF(file, rangeStr, onProgress) {
  if (onProgress) onProgress(20, 'Loading PDF document...');
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const sourcePdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const totalPages = sourcePdf.getPageCount();

  if (onProgress) onProgress(50, 'Analyzing requested page ranges...');
  const pageIndices = parsePageRanges(rangeStr, totalPages);

  if (onProgress) onProgress(75, 'Extracting selected pages...');
  const newPdf = await PDFDocument.create();
  const copiedPages = await newPdf.copyPages(sourcePdf, pageIndices);
  copiedPages.forEach((page) => newPdf.addPage(page));

  if (onProgress) onProgress(95, 'Generating output document...');
  const pdfBytes = await newPdf.save();

  const originalBase = file.name.replace(/\.[^/.]+$/, "");
  return {
    data: pdfBytes,
    filename: `${originalBase}-extracted-${pageIndices.length}pages.pdf`,
    mimeType: 'application/pdf',
    pageCount: newPdf.getPageCount()
  };
}

/**
 * Remove selected pages from PDF
 */
export async function processRemovePages(file, pagesToRemoveStr, onProgress) {
  if (onProgress) onProgress(25, 'Loading PDF document...');
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const sourcePdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const totalPages = sourcePdf.getPageCount();

  const removeIndices = new Set(parsePageRanges(pagesToRemoveStr, totalPages));
  if (removeIndices.size >= totalPages) {
    throw new Error('Cannot remove all pages from the document. At least one page must remain.');
  }

  if (onProgress) onProgress(65, 'Removing specified pages...');
  const keepIndices = [];
  for (let i = 0; i < totalPages; i++) {
    if (!removeIndices.has(i)) {
      keepIndices.push(i);
    }
  }

  const newPdf = await PDFDocument.create();
  const copiedPages = await newPdf.copyPages(sourcePdf, keepIndices);
  copiedPages.forEach(p => newPdf.addPage(p));

  if (onProgress) onProgress(95, 'Saving updated PDF...');
  const pdfBytes = await newPdf.save();
  const originalBase = file.name.replace(/\.[^/.]+$/, "");

  return {
    data: pdfBytes,
    filename: `${originalBase}-cleaned.pdf`,
    mimeType: 'application/pdf',
    pageCount: newPdf.getPageCount()
  };
}

export async function processOrganizePDF(file, pageOrder, onProgress) {
  const source = await PDFDocument.load(await readFileAsArrayBuffer(file), { ignoreEncryption: true });
  const total = source.getPageCount();
  const requested = String(pageOrder || '').split(',').map((value) => Number(value.trim()));
  if (requested.length !== total || new Set(requested).size !== total ||
      requested.some((page) => !Number.isInteger(page) || page < 1 || page > total)) {
    throw new Error(`Enter every page number from 1 to ${total} exactly once, in the order you want (for example 3,1,2).`);
  }
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, requested.map((page) => page - 1));
  pages.forEach((page) => output.addPage(page));
  if (onProgress) onProgress(95, 'Saving reordered PDF...');
  return {
    data: await output.save(),
    filename: `${file.name.replace(/\.[^/.]+$/, '')}-organized.pdf`,
    mimeType: 'application/pdf',
    pageCount: output.getPageCount()
  };
}

/**
 * Rotate PDF pages by 90, 180, or 270 degrees
 */
export async function processRotatePDF(file, rotationAngle = 90, onProgress) {
  if (onProgress) onProgress(30, 'Reading PDF document...');
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  if (onProgress) onProgress(60, `Rotating ${pages.length} pages by ${rotationAngle}°...`);
  pages.forEach(page => {
    const currentRot = page.getRotation().angle;
    page.setRotation(degrees((currentRot + rotationAngle) % 360));
  });

  if (onProgress) onProgress(90, 'Saving rotated document...');
  const pdfBytes = await pdfDoc.save();
  const originalBase = file.name.replace(/\.[^/.]+$/, "");

  return {
    data: pdfBytes,
    filename: `${originalBase}-rotated-${rotationAngle}deg.pdf`,
    mimeType: 'application/pdf',
    pageCount: pages.length
  };
}

/**
 * Apply customizable text watermark across all pages
 */
export async function processWatermarkPDF(file, { text = 'CONFIDENTIAL', opacity = 0.3, fontSize = 54, angle = 45 }, onProgress) {
  if (!text || !text.trim()) {
    throw new Error('Please provide watermark text.');
  }

  if (onProgress) onProgress(25, 'Loading PDF and embedding typography...');
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  if (onProgress) onProgress(60, `Stamping watermark across ${pages.length} pages...`);
  pages.forEach(page => {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const textHeight = font.heightAtSize(fontSize);

    page.drawText(text, {
      x: (width - textWidth) / 2,
      y: (height - textHeight) / 2,
      size: fontSize,
      font,
      color: rgb(0.91, 0.3, 0.31), // Coral accent
      opacity: Math.max(0.05, Math.min(1.0, opacity)),
      rotate: degrees(angle),
    });
  });

  if (onProgress) onProgress(95, 'Finalizing watermarked PDF...');
  const pdfBytes = await pdfDoc.save();
  const originalBase = file.name.replace(/\.[^/.]+$/, "");

  return {
    data: pdfBytes,
    filename: `${originalBase}-watermarked.pdf`,
    mimeType: 'application/pdf',
    pageCount: pages.length
  };
}

/**
 * Add page numbers to header or footer
 */
export async function processPageNumbers(file, { position = 'bottom-center', format = 'Page {n} of {total}', startFrom = 1 }, onProgress) {
  if (onProgress) onProgress(25, 'Loading PDF document...');
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const total = pages.length;

  if (onProgress) onProgress(65, 'Numbering document pages...');
  pages.forEach((page, idx) => {
    const currentNum = idx + startFrom;
    const label = format.replace('{n}', currentNum).replace('{total}', total);
    const { width, height } = page.getSize();
    const fontSize = 10;
    const textWidth = font.widthOfTextAtSize(label, fontSize);

    let x = (width - textWidth) / 2;
    let y = 24;

    if (position === 'bottom-right') {
      x = width - textWidth - 36;
      y = 24;
    } else if (position === 'bottom-left') {
      x = 36;
      y = 24;
    } else if (position === 'top-center') {
      x = (width - textWidth) / 2;
      y = height - 30;
    } else if (position === 'top-right') {
      x = width - textWidth - 36;
      y = height - 30;
    }

    page.drawText(label, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0.35, 0.37, 0.42),
    });
  });

  if (onProgress) onProgress(95, 'Saving numbered document...');
  const pdfBytes = await pdfDoc.save();
  const originalBase = file.name.replace(/\.[^/.]+$/, "");

  return {
    data: pdfBytes,
    filename: `${originalBase}-numbered.pdf`,
    mimeType: 'application/pdf',
    pageCount: total
  };
}

  export async function processHtmlToPDF(file, onProgress) {
    if (onProgress) onProgress(20, 'Reading local HTML or text file...');
    const isTextFile = file.name.toLowerCase().endsWith('.txt');
    let result;
    if (isTextFile) {
      const text = await file.text();
      if (!text.trim()) throw new Error('No readable text was found in the selected file.');
      if (onProgress) onProgress(55, 'Formatting text into PDF pages...');
      result = await textToPdfDocument(text, file.name.replace(/\.[^/.]+$/, ''), onProgress);
    } else {
      const markup = await htmlDocumentMarkup(file);
      result = await officeHtmlToPdf(file, markup, onProgress);
    }
    return {
      ...result,
      filename: `${file.name.replace(/\.[^/.]+$/, '')}.pdf`,
      mimeType: 'application/pdf'
    };
  }

  async function extractOfficeText(file) {
    const zip = await JSZip.loadAsync(await readFileAsArrayBuffer(file));
    const name = file.name.toLowerCase();
    const parseXml = (xml) => new DOMParser().parseFromString(xml, 'application/xml');
    const readTextNodes = (document) => Array.from(document.getElementsByTagName('*'))
      .filter((element) => element.localName === 't')
      .map((element) => element.textContent || '');

    if (name.endsWith('.docx')) {
      const documentXml = zip.file('word/document.xml');
      if (!documentXml) throw new Error('This DOCX file is missing its document content.');
      const xml = parseXml(await documentXml.async('text'));
      const paragraphs = Array.from(xml.getElementsByTagName('*'))
        .filter((element) => element.localName === 'p')
        .map((paragraph) => Array.from(paragraph.getElementsByTagName('*'))
          .filter((element) => element.localName === 't')
          .map((element) => element.textContent || '')
          .join(''))
        .filter(Boolean);
      return paragraphs.join('\n');
    }

    if (name.endsWith('.pptx')) {
      const slideFiles = Object.keys(zip.files)
        .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
        .sort((a, b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]));
      const slides = [];
      for (const slideFile of slideFiles) {
        slides.push(readTextNodes(parseXml(await zip.file(slideFile).async('text'))).join(' '));
      }
      return slides.map((slide, index) => `Slide ${index + 1}\n${slide}`).join('\n\n');
    }

    if (name.endsWith('.xlsx')) {
      const sharedStringsFile = zip.file('xl/sharedStrings.xml');
      const sharedStrings = sharedStringsFile
        ? Array.from(parseXml(await sharedStringsFile.async('text')).getElementsByTagName('*'))
          .filter((element) => element.localName === 'si')
          .map((item) => readTextNodes(item).join(''))
        : [];
      const sheetFiles = Object.keys(zip.files)
        .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path))
        .sort((a, b) => Number(a.match(/sheet(\d+)/)[1]) - Number(b.match(/sheet(\d+)/)[1]));
      const output = [];
      for (const sheetFile of sheetFiles) {
        const sheet = parseXml(await zip.file(sheetFile).async('text'));
        for (const row of Array.from(sheet.getElementsByTagName('*')).filter((element) => element.localName === 'row')) {
          const values = Array.from(row.getElementsByTagName('*'))
            .filter((element) => element.localName === 'c')
            .map((cell) => {
              const valueNode = Array.from(cell.getElementsByTagName('*')).find((element) => element.localName === 'v');
              const inline = Array.from(cell.getElementsByTagName('*')).filter((element) => element.localName === 't').map((element) => element.textContent || '').join('');
              const value = valueNode?.textContent || inline;
              return cell.getAttribute('t') === 's' ? (sharedStrings[Number(value)] || '') : value;
            });
          output.push(values.join('\t'));
        }
        output.push('');
      }
      return output.join('\n');
    }

    throw new Error('This Office format is not supported. Use DOCX, XLSX, or PPTX files.');
  }

  async function resolveOfficePath(basePath, target) {
    const parts = `${target.startsWith('/') ? '' : `${basePath}/`}${target}`.split('/');
    const normalized = [];
    for (const part of parts) {
      if (!part || part === '.') continue;
      if (part === '..') normalized.pop();
      else normalized.push(part);
    }
    return normalized.join('/');
  }

  function officeElements(node, localName) {
    return Array.from(node.getElementsByTagName('*')).filter((element) => element.localName === localName);
  }

  function officeAttribute(node, localName) {
    return node.getAttribute(localName) ||
      Array.from(node.attributes || []).find((attribute) => attribute.localName === localName)?.value ||
      null;
  }

  function officeFontFamily(value) {
    const safeName = String(value || '').replace(/[^a-z0-9 ,_-]/gi, '').slice(0, 80);
    return safeName ? `font-family:${JSON.stringify(safeName)}` : '';
  }

  function officeChildren(node, localName) {
    return Array.from(node.children || []).filter((element) => element.localName === localName);
  }

  function wordRunStyle(run) {
    const runProperties = officeChildren(run, 'rPr')[0];
    const css = [];
    if (runProperties) {
      if (officeChildren(runProperties, 'b').length) css.push('font-weight:700');
      if (officeChildren(runProperties, 'i').length) css.push('font-style:italic');
      if (officeChildren(runProperties, 'u').length) css.push('text-decoration:underline');
      const color = officeChildren(runProperties, 'color')[0]?.getAttribute('val');
      if (color && /^[0-9a-f]{6}$/i.test(color)) css.push(`color:#${color}`);
      const size = Number(officeChildren(runProperties, 'sz')[0]?.getAttribute('val'));
      if (size > 0) css.push(`font-size:${size / 2}pt`);
      const font = officeChildren(runProperties, 'rFonts')[0]?.getAttribute('ascii');
      const fontStyle = officeFontFamily(font);
      if (fontStyle) css.push(fontStyle);
    }
    return `<span style="${css.join(';')}">${officeElements(run, 't').map((text) => xmlEscape(text.textContent || '')).join('')}${officeElements(run, 'tab').map(() => '&emsp;').join('')}${officeElements(run, 'br').map(() => '<br>').join('')}</span>`;
  }

  async function officeImageData(zip, path) {
    const image = zip.file(path);
    if (!image) throw new Error(`An embedded Office image is missing: ${path}`);
    const blob = await image.async('blob');
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error(`Could not read embedded Office image: ${path}`));
      reader.onerror = () => reject(new Error(`Could not read embedded Office image: ${path}`));
      reader.readAsDataURL(blob);
    });
  }

  async function wordDocumentHtml(file) {
    const zip = await JSZip.loadAsync(await readFileAsArrayBuffer(file));
    const documentFile = zip.file('word/document.xml');
    if (!documentFile) throw new Error('This DOCX file is missing its document content.');
    const parseXml = (xml) => new DOMParser().parseFromString(xml, 'application/xml');
    const documentXml = parseXml(await documentFile.async('text'));
    const relationshipsFile = zip.file('word/_rels/document.xml.rels');
    const relationships = relationshipsFile
      ? parseXml(await relationshipsFile.async('text'))
      : null;
    const imageData = new Map();
    if (relationships) {
      for (const relationship of officeElements(relationships, 'Relationship')) {
        if (!relationship.getAttribute('Type')?.endsWith('/image')) continue;
        const path = await resolveOfficePath('word', relationship.getAttribute('Target'));
        imageData.set(relationship.getAttribute('Id'), await officeImageData(zip, path));
      }
    }

    const renderNode = async (node) => {
      if (node.localName === 'tbl') {
        const rows = [];
        for (const row of officeElements(node, 'tr').filter((element) => element.parentElement?.localName === 'tbl')) {
          const cells = [];
          for (const cell of officeChildren(row, 'tc')) {
            const paragraphs = [];
            for (const child of officeChildren(cell, 'p')) paragraphs.push(await renderNode(child));
            cells.push(`<td>${paragraphs.join('') || '<p></p>'}</td>`);
          }
          rows.push(`<tr>${cells.join('')}</tr>`);
        }
        return `<table><tbody>${rows.join('')}</tbody></table>`;
      }
      if (node.localName === 'p') {
        const alignment = officeChildren(officeChildren(node, 'pPr')[0] || document.createElement('span'), 'jc')[0]?.getAttribute('val');
        const pStyle = alignment && ['left', 'center', 'right', 'both'].includes(alignment) ? ` style="text-align:${alignment === 'both' ? 'justify' : alignment}"` : '';
        const parts = [];
        for (const child of Array.from(node.children)) {
          if (child.localName === 'r') parts.push(wordRunStyle(child));
          if (child.localName === 'hyperlink') {
            for (const run of officeChildren(child, 'r')) parts.push(wordRunStyle(run));
          }
          if (child.localName === 'bookmarkStart') continue;
          if (child.localName === 'pPr') {
            const numbering = officeChildren(child, 'numPr').length;
            if (numbering) parts.unshift('<span>•&nbsp;</span>');
          }
          if (child.localName === 'r') {
            for (const blip of officeElements(child, 'blip')) {
              const relationshipId = officeAttribute(blip, 'embed');
              const src = imageData.get(relationshipId);
              if (!src) throw new Error(`A DOCX image relationship could not be resolved: ${relationshipId}`);
              parts.push(`<img src="${src}" alt="Embedded document image">`);
            }
          }
        }
        return `<p${pStyle}>${parts.join('') || '&nbsp;'}</p>`;
      }
      return '';
    };

    const body = officeElements(documentXml, 'body')[0];
    if (!body) throw new Error('This DOCX file has no document body.');
    const blocks = [];
    for (const node of Array.from(body.children)) {
      const html = await renderNode(node);
      if (html) blocks.push(html);
    }
    if (!blocks.length) throw new Error('No readable Word document content was found.');
    return blocks.join('');
  }

  async function excelDocumentHtml(file) {
    const zip = await JSZip.loadAsync(await readFileAsArrayBuffer(file));
    const parseXml = (xml) => new DOMParser().parseFromString(xml, 'application/xml');
    const workbookFile = zip.file('xl/workbook.xml');
    if (!workbookFile) throw new Error('This XLSX file is missing its workbook content.');
    const workbook = parseXml(await workbookFile.async('text'));
    const workbookRelsFile = zip.file('xl/_rels/workbook.xml.rels');
    const workbookRels = workbookRelsFile ? parseXml(await workbookRelsFile.async('text')) : null;
    const relationshipTargets = new Map(
      workbookRels ? officeElements(workbookRels, 'Relationship').map((relationship) => [
        relationship.getAttribute('Id'),
        relationship.getAttribute('Target')
      ]) : []
    );
    const sharedStringsFile = zip.file('xl/sharedStrings.xml');
    const sharedStrings = sharedStringsFile
      ? officeElements(parseXml(await sharedStringsFile.async('text')), 'si')
        .map((item) => officeElements(item, 't').map((text) => text.textContent || '').join(''))
      : [];
    const stylesFile = zip.file('xl/styles.xml');
    const styles = stylesFile ? parseXml(await stylesFile.async('text')) : null;
    const fonts = styles ? officeElements(officeElements(styles, 'fonts')[0] || styles, 'font') : [];
    const fills = styles ? officeElements(officeElements(styles, 'fills')[0] || styles, 'fill') : [];
    const cellFormats = styles ? officeElements(officeElements(styles, 'cellXfs')[0] || styles, 'xf') : [];
    const numberFormats = new Map(styles
      ? officeElements(styles, 'numFmt').map((format) => [Number(format.getAttribute('numFmtId')), format.getAttribute('formatCode') || ''])
      : []);
    const displayExcelNumber = (cell, value) => {
      const formatId = Number(cellFormats[Number(cell.getAttribute('s') || 0)]?.getAttribute('numFmtId') || 0);
      const formatCode = numberFormats.get(formatId) || '';
      const number = Number(value);
      if (!Number.isFinite(number)) return value;
      if (formatCode.includes('%') || formatId === 9 || formatId === 10) {
        const decimalCount = formatCode.match(/0\.([0]+)/)?.[1].length || (formatId === 10 ? 2 : 0);
        return `${(number * 100).toFixed(decimalCount)}%`;
      }
      if ([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47].includes(formatId) ||
          /[ymdhis]{2,}/i.test(formatCode.replace(/"[^"]*"/g, ''))) {
        const date = new Date(Date.UTC(1899, 11, 30) + number * 86400000);
        return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
      }
      const decimalCount = formatCode.match(/0\.([0]+)/)?.[1].length || 0;
      const currency = formatCode.match(/[$€£]/)?.[0];
      if (currency) {
        return `${currency}${number.toLocaleString(undefined, { minimumFractionDigits: decimalCount, maximumFractionDigits: decimalCount })}`;
      }
      if (formatCode.includes(',')) {
        return number.toLocaleString(undefined, { minimumFractionDigits: decimalCount, maximumFractionDigits: decimalCount });
      }
      return decimalCount ? number.toFixed(decimalCount) : value;
    };
    const styleFor = (cell) => {
      const format = cellFormats[Number(cell.getAttribute('s') || 0)];
      if (!format) return '';
      const css = [];
      const font = fonts[Number(format.getAttribute('fontId') || 0)];
      if (font) {
        const color = officeChildren(font, 'color')[0]?.getAttribute('rgb')?.slice(-6);
        if (color && /^[0-9a-f]{6}$/i.test(color)) css.push(`color:#${color}`);
        if (officeChildren(font, 'b').length) css.push('font-weight:700');
        if (officeChildren(font, 'i').length) css.push('font-style:italic');
        const size = Number(officeChildren(font, 'sz')[0]?.getAttribute('val'));
        if (size > 0) css.push(`font-size:${size}pt`);
        const name = officeChildren(font, 'name')[0]?.getAttribute('val');
        const fontStyle = officeFontFamily(name);
        if (fontStyle) css.push(fontStyle);
      }
      const fill = fills[Number(format.getAttribute('fillId') || 0)];
      const fillColor = fill && officeElements(fill, 'fgColor')[0]?.getAttribute('rgb')?.slice(-6);
      if (fillColor && /^[0-9a-f]{6}$/i.test(fillColor)) css.push(`background-color:#${fillColor}`);
      const alignment = officeChildren(format, 'alignment')[0];
      const horizontalAlignment = alignment?.getAttribute('horizontal');
      if (['left', 'center', 'right', 'justify'].includes(horizontalAlignment)) css.push(`text-align:${horizontalAlignment}`);
      if (alignment?.getAttribute('wrapText') === '1') css.push('white-space:pre-wrap');
      if (Number(format.getAttribute('borderId') || 0)) css.push('border:1px solid #aeb4bd');
      return css.join(';');
    };

    const sheets = [];
    for (const sheet of officeElements(workbook, 'sheet')) {
      const target = relationshipTargets.get(officeAttribute(sheet, 'id'));
      if (!target) throw new Error(`Could not locate worksheet "${sheet.getAttribute('name')}".`);
      const path = await resolveOfficePath('xl', target);
      const sheetFile = zip.file(path);
      if (!sheetFile) throw new Error(`Worksheet content is missing: ${path}`);
      const worksheet = parseXml(await sheetFile.async('text'));
      const worksheetImages = [];
      const drawingReference = officeElements(worksheet, 'drawing')[0];
      if (drawingReference) {
        const sheetDirectory = path.slice(0, path.lastIndexOf('/'));
        const sheetRelsPath = `${sheetDirectory}/_rels/${path.slice(path.lastIndexOf('/') + 1)}.rels`;
        const sheetRelsFile = zip.file(sheetRelsPath);
        const drawingId = officeAttribute(drawingReference, 'id');
        if (sheetRelsFile && drawingId) {
          const sheetRelationships = parseXml(await sheetRelsFile.async('text'));
          const drawingRelationship = officeElements(sheetRelationships, 'Relationship')
            .find((relationship) => relationship.getAttribute('Id') === drawingId);
          if (drawingRelationship) {
            const drawingPath = await resolveOfficePath(sheetDirectory, drawingRelationship.getAttribute('Target'));
            const drawingFile = zip.file(drawingPath);
            if (drawingFile) {
              const drawing = parseXml(await drawingFile.async('text'));
              const drawingDirectory = drawingPath.slice(0, drawingPath.lastIndexOf('/'));
              const drawingRelsPath = `${drawingDirectory}/_rels/${drawingPath.slice(drawingPath.lastIndexOf('/') + 1)}.rels`;
              const drawingRelsFile = zip.file(drawingRelsPath);
              const drawingRelationships = drawingRelsFile ? parseXml(await drawingRelsFile.async('text')) : null;
              for (const blip of officeElements(drawing, 'blip')) {
                const imageId = officeAttribute(blip, 'embed');
                const imageRelationship = drawingRelationships && officeElements(drawingRelationships, 'Relationship')
                  .find((relationship) => relationship.getAttribute('Id') === imageId);
                if (!imageRelationship) throw new Error('An XLSX image relationship could not be resolved.');
                const imagePath = await resolveOfficePath(drawingDirectory, imageRelationship.getAttribute('Target'));
                worksheetImages.push(`<figure><img src="${await officeImageData(zip, imagePath)}" alt="Embedded worksheet image"></figure>`);
              }
            }
          }
        }
      }
      const rows = [];
      for (const row of officeElements(worksheet, 'row')) {
        const cells = [];
        for (const cell of officeChildren(row, 'c')) {
          const value = officeChildren(cell, 'v')[0]?.textContent || '';
          const inline = officeElements(cell, 't').map((text) => text.textContent || '').join('');
          const cellValue = cell.getAttribute('t') === 's' ? (sharedStrings[Number(value)] || '') :
            cell.getAttribute('t') === 'inlineStr' ? inline : value;
          const reference = cell.getAttribute('r') || '';
          const column = reference.match(/[A-Z]+/i)?.[0] || '';
          const columnIndex = column ? Array.from(column.toUpperCase()).reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1 : cells.length;
          const renderedValue = cell.getAttribute('t') ? cellValue : displayExcelNumber(cell, cellValue);
          cells.push(`<td style="${styleFor(cell)}">${xmlEscape(renderedValue)}</td>`);
          cells[cells.length - 1] = { columnIndex, html: cells[cells.length - 1] };
        }
        if (cells.length) {
          let output = '';
          let cursor = 0;
          for (const cell of cells.sort((a, b) => a.columnIndex - b.columnIndex)) {
            while (cursor < cell.columnIndex) {
              output += '<td></td>';
              cursor++;
            }
            output += cell.html;
            cursor++;
          }
          rows.push(`<tr>${output}</tr>`);
        }
      }
      if (rows.length || worksheetImages.length) {
        const table = rows.length ? `<table><tbody>${rows.join('')}</tbody></table>` : '';
        sheets.push(`<section class="sheet"><h2>${xmlEscape(sheet.getAttribute('name') || 'Sheet')}</h2>${table}${worksheetImages.join('')}</section>`);
      }
    }
    if (!sheets.length) throw new Error('No readable worksheet data was found.');
    return sheets.join('');
  }

  async function powerpointDocumentHtml(file) {
    const zip = await JSZip.loadAsync(await readFileAsArrayBuffer(file));
    const parseXml = (xml) => new DOMParser().parseFromString(xml, 'application/xml');
    const presentationFile = zip.file('ppt/presentation.xml');
    if (!presentationFile) throw new Error('This PPTX file is missing its presentation content.');
    const presentation = parseXml(await presentationFile.async('text'));
    const slideSize = officeElements(presentation, 'sldSz')[0];
    const slideWidth = Number(slideSize?.getAttribute('cx'));
    const slideHeight = Number(slideSize?.getAttribute('cy'));
    if (!slideWidth || !slideHeight) throw new Error('Could not read the PowerPoint slide dimensions.');
    const presentationRelsFile = zip.file('ppt/_rels/presentation.xml.rels');
    const presentationRels = presentationRelsFile
      ? parseXml(await presentationRelsFile.async('text'))
      : null;
    const relationshipTargets = new Map(
      presentationRels ? officeElements(presentationRels, 'Relationship').map((relationship) => [
        relationship.getAttribute('Id'),
        relationship.getAttribute('Target')
      ]) : []
    );
    const slideSizePx = { width: 960, height: 720 };
    const scale = Math.min(slideSizePx.width / slideWidth, slideSizePx.height / slideHeight);
    const slides = [];

    for (const slideReference of officeElements(presentation, 'sldId')) {
      const target = relationshipTargets.get(officeAttribute(slideReference, 'id'));
      if (!target) throw new Error('Could not locate a PowerPoint slide.');
      const slidePath = await resolveOfficePath('ppt', target);
      const slideFile = zip.file(slidePath);
      if (!slideFile) throw new Error(`PowerPoint slide content is missing: ${slidePath}`);
      const slide = parseXml(await slideFile.async('text'));
      const slideDirectory = slidePath.slice(0, slidePath.lastIndexOf('/'));
      const relsPath = `${slideDirectory}/_rels/${slidePath.slice(slidePath.lastIndexOf('/') + 1)}.rels`;
      const relsFile = zip.file(relsPath);
      const slideRelationships = relsFile ? parseXml(await relsFile.async('text')) : null;
      const imageRelationships = new Map(
        slideRelationships ? officeElements(slideRelationships, 'Relationship').map((relationship) => [
          relationship.getAttribute('Id'),
          relationship.getAttribute('Target')
        ]) : []
      );
      const shapes = officeElements(slide, 'spTree')[0];
      if (!shapes) throw new Error('A PowerPoint slide has no shape tree.');
      const parts = [];
      const slideBackground = officeElements(slide, 'bg')[0];
      const backgroundColor = slideBackground && officeElements(slideBackground, 'srgbClr')[0]?.getAttribute('val');

      for (const shape of Array.from(shapes.children)) {
        const shapeProperties = officeChildren(shape, 'spPr')[0];
        const transform = officeChildren(shapeProperties || document.createElement('span'), 'xfrm')[0] || officeElements(shape, 'xfrm')[0];
        const offset = officeChildren(transform || document.createElement('span'), 'off')[0];
        const extent = officeChildren(transform || document.createElement('span'), 'ext')[0];
        if (!offset || !extent) continue;
        const x = Number(offset.getAttribute('x')) * scale;
        const y = Number(offset.getAttribute('y')) * scale;
        const width = Number(extent.getAttribute('cx')) * scale;
        const height = Number(extent.getAttribute('cy')) * scale;
        if (!(width > 0 && height > 0)) continue;
        const position = `position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;overflow:hidden`;

        if (shape.localName === 'pic') {
          const blip = officeElements(shape, 'blip')[0];
          const imageId = blip && officeAttribute(blip, 'embed');
          const imageTarget = imageId && imageRelationships.get(imageId);
          if (!imageTarget) continue;
          const imagePath = await resolveOfficePath(slideDirectory, imageTarget);
          parts.push(`<img style="${position};object-fit:contain" src="${await officeImageData(zip, imagePath)}" alt="PowerPoint slide image">`);
          continue;
        }

        if (shape.localName === 'graphicFrame') {
          const table = officeElements(shape, 'tbl')[0];
          if (!table) continue;
          const rows = officeChildren(table, 'tr').map((row) => {
            const cells = officeChildren(row, 'tc').map((cell) => {
              const textBody = officeChildren(cell, 'txBody')[0];
              const paragraphs = textBody ? officeChildren(textBody, 'p').map((paragraph) =>
                officeElements(paragraph, 't').map((text) => xmlEscape(text.textContent || '')).join('')
              ) : [];
              return `<td style="border:1px solid #9aa0a6;padding:4px">${paragraphs.join('<br>')}</td>`;
            });
            return `<tr>${cells.join('')}</tr>`;
          });
          parts.push(`<table style="${position};border-collapse:collapse"><tbody>${rows.join('')}</tbody></table>`);
          continue;
        }

        if (shape.localName !== 'sp') continue;
        const fill = shapeProperties && officeChildren(shapeProperties, 'solidFill')[0];
        const fillColor = fill && officeElements(fill, 'srgbClr')[0]?.getAttribute('val');
        const line = shapeProperties && officeChildren(shapeProperties, 'ln')[0];
        const lineColor = line && officeElements(line, 'srgbClr')[0]?.getAttribute('val');
        const shapeStyle = [
          fillColor && /^[0-9a-f]{6}$/i.test(fillColor) ? `background-color:#${fillColor}` : '',
          lineColor && /^[0-9a-f]{6}$/i.test(lineColor) ? `border:1px solid #${lineColor}` : ''
        ].filter(Boolean).join(';');
        const textBody = officeChildren(shape, 'txBody')[0];
        if (!textBody) {
          if (shapeStyle) {
            parts.push(`<div style="${position};${shapeStyle}"></div>`);
          }
          continue;
        }

        const paragraphs = [];
        for (const paragraph of officeChildren(textBody, 'p')) {
          const paragraphProperties = officeChildren(paragraph, 'pPr')[0];
          const alignment = paragraphProperties?.getAttribute('algn');
          const textParts = [];
          for (const child of Array.from(paragraph.children)) {
            if (!['r', 'fld'].includes(child.localName)) continue;
            const text = officeElements(child, 't').map((item) => item.textContent || '').join('');
            if (!text) continue;
            const properties = officeChildren(child, 'rPr')[0] || officeChildren(paragraph, 'defRPr')[0];
            const styles = [];
            const pointSize = Number(properties?.getAttribute('sz'));
            if (pointSize > 0) styles.push(`font-size:${pointSize / 100}pt`);
            if (properties?.getAttribute('b') === '1') styles.push('font-weight:700');
            if (properties?.getAttribute('i') === '1') styles.push('font-style:italic');
            const fontColor = properties && officeElements(properties, 'srgbClr')[0]?.getAttribute('val');
            if (fontColor && /^[0-9a-f]{6}$/i.test(fontColor)) styles.push(`color:#${fontColor}`);
            textParts.push(`<span style="${styles.join(';')}">${xmlEscape(text)}</span>`);
          }
          const alignmentCss = {
            ctr: 'center',
            r: 'right',
            just: 'justify',
            l: 'left'
          }[alignment] || 'left';
          paragraphs.push(`<div style="text-align:${alignmentCss};line-height:1.15">${textParts.join('') || '&nbsp;'}</div>`);
        }
        parts.push(`<div style="${position};padding:4px;${shapeStyle}">${paragraphs.join('')}</div>`);
      }

      const slideBackgroundStyle = backgroundColor && /^[0-9a-f]{6}$/i.test(backgroundColor)
        ? `;background-color:#${backgroundColor}`
        : '';
      slides.push(`<section class="slide" style="position:relative;width:${slideSizePx.width}px;height:${slideSizePx.height}px;overflow:hidden;margin-bottom:48px${slideBackgroundStyle}">${parts.join('')}</section>`);
    }

    if (!slides.length) throw new Error('No PowerPoint slides were found.');
    return slides.join('');
  }

  async function htmlDocumentMarkup(file) {
    const source = await file.text();
    const parsed = new DOMParser().parseFromString(source, 'text/html');
    const styles = Array.from(parsed.head.querySelectorAll('style'))
      .map((style) => style.textContent || '')
      .filter(Boolean)
      .join('\n')
      .replace(/@import[^;]+;?/gi, '')
      .replace(/url\([^)]*\)/gi, 'none')
      .replace(/</g, '\\3C ');
    parsed.querySelectorAll('script,template,noscript,iframe,object,embed,style,link,base').forEach((element) => element.remove());
    if (!parsed.body.textContent?.trim() && !parsed.body.querySelector('img,svg,table')) {
      throw new Error('No readable HTML document content was found.');
    }

    for (const element of parsed.body.querySelectorAll('*')) {
      for (const attribute of Array.from(element.attributes)) {
        if (/^on/i.test(attribute.name)) {
          element.removeAttribute(attribute.name);
          continue;
        }
        if (['src', 'href', 'xlink:href'].includes(attribute.name.toLowerCase()) &&
            !/^(data:image\/(?:png|jpeg|gif|webp);base64,|#)/i.test(attribute.value.trim())) {
          element.removeAttribute(attribute.name);
        }
      }
      const inlineStyle = element.getAttribute('style');
      if (inlineStyle) element.setAttribute('style', inlineStyle.replace(/url\([^)]*\)/gi, 'none').replace(/</g, '\\3C '));
    }

    return `${styles ? `<style>${styles}</style>` : ''}${parsed.body.innerHTML}`;
  }

  async function officeHtmlToPdf(file, html, onProgress) {
    if (onProgress) onProgress(55, 'Laying out document pages with tables and formatting...');
    const extension = file.name.toLowerCase();
    const isLandscape = extension.endsWith('.xlsx') || extension.endsWith('.pptx');
    const isPresentation = extension.endsWith('.pptx');
    const pageWidth = isLandscape ? 1056 : 816;
    const pageHeight = isLandscape ? 816 : 1056;
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('sandbox', 'allow-same-origin');
    iframe.style.cssText = `position:fixed;left:-12000px;top:0;width:${pageWidth}px;height:1200px;border:0;visibility:hidden`;
    const frameLoaded = new Promise((resolve, reject) => {
      iframe.onload = resolve;
      iframe.onerror = () => reject(new Error('Could not render the Office document in the browser.'));
    });
    const css = `*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#222;font-family:Arial,sans-serif;font-size:12pt}#office-page{width:${pageWidth}px;padding:48px;overflow-wrap:anywhere}p{margin:0 0 10pt;line-height:1.35;min-height:1em}table{border-collapse:collapse;table-layout:fixed;width:100%;max-width:100%;margin:8px 0 14px}td,th{border:1px solid #9aa0a6;padding:5px 7px;vertical-align:top;overflow-wrap:anywhere}img{max-width:100%;height:auto;object-fit:contain;vertical-align:middle}.sheet{margin-bottom:20px}.sheet h2{font-size:15pt;margin:0 0 10pt}`;
    iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><main id="office-page">${html}</main></body></html>`;
    document.body.appendChild(iframe);

    try {
      await frameLoaded;
      const frameDocument = iframe.contentDocument;
      if (!frameDocument) throw new Error('Could not access the rendered Office document.');
      await frameDocument.fonts.ready;
      await Promise.all(Array.from(frameDocument.images).map((image) => image.decode()));
      const content = frameDocument.getElementById('office-page');
      const contentRect = content.getBoundingClientRect();
      const slides = isPresentation ? Array.from(content.querySelectorAll('.slide')) : [];
      const lastSlide = slides[slides.length - 1];
      const contentHeight = isPresentation && lastSlide
        ? lastSlide.getBoundingClientRect().bottom - contentRect.top + 48
        : Math.max(content.scrollHeight, pageHeight - 96);
      const pageCount = Math.max(1, Math.ceil(contentHeight / pageHeight));
      const operations = [];
      const frameWindow = frameDocument.defaultView;
      if (!frameWindow) throw new Error('Could not access the Office document rendering context.');
      const walker = frameDocument.createTreeWalker(content, frameWindow.NodeFilter.SHOW_ELEMENT | frameWindow.NodeFilter.SHOW_TEXT);
      let node = content;
      while (node) {
        if (node.nodeType === frameWindow.Node.ELEMENT_NODE) {
          const element = node;
          const style = frameDocument.defaultView.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          const box = {
            x: rect.left - contentRect.left,
            y: rect.top - contentRect.top,
            width: rect.width,
            height: rect.height
          };
          if (element.tagName === 'IMG' && rect.width && rect.height) {
            operations.push({ type: 'image', image: element, ...box });
          } else if (rect.width && rect.height) {
            if (style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') {
              operations.push({ type: 'fill', color: style.backgroundColor, ...box });
            }
            const borders = [
              ['borderTopWidth', 'borderTopStyle', 'borderTopColor', box.x, box.y, box.width, 0],
              ['borderRightWidth', 'borderRightStyle', 'borderRightColor', box.x + box.width, box.y, 0, box.height],
              ['borderBottomWidth', 'borderBottomStyle', 'borderBottomColor', box.x, box.y + box.height, box.width, 0],
              ['borderLeftWidth', 'borderLeftStyle', 'borderLeftColor', box.x, box.y, 0, box.height]
            ];
            for (const [widthProperty, styleProperty, colorProperty, x, y, width, height] of borders) {
              const borderWidth = parseFloat(style[widthProperty]);
              if (borderWidth > 0 && style[styleProperty] !== 'none') {
                operations.push({
                  type: 'border',
                  color: style[colorProperty],
                  lineWidth: borderWidth,
                  x,
                  y,
                  width,
                  height
                });
              }
            }
          }
        } else if (node.nodeType === frameWindow.Node.TEXT_NODE && node.textContent) {
          const parent = node.parentElement;
          const style = parent && frameWindow.getComputedStyle(parent);
          if (style && style.display !== 'none' && style.visibility !== 'hidden') {
            const range = frameDocument.createRange();
            const textRuns = [];
            for (let offset = 0; offset < node.textContent.length;) {
              const character = String.fromCodePoint(node.textContent.codePointAt(offset));
              const nextOffset = offset + character.length;
              range.setStart(node, offset);
              range.setEnd(node, nextOffset);
              const rect = range.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                const fontSize = parseFloat(style.fontSize) || 12;
                const x = rect.left - contentRect.left;
                const y = rect.top - contentRect.top;
                const previousRun = textRuns[textRuns.length - 1];
                if (previousRun && Math.abs(previousRun.y - y) < 1 && x <= previousRun.right + 1) {
                  previousRun.value += character;
                  previousRun.right = rect.right - contentRect.left;
                } else {
                  textRuns.push({
                    type: 'text',
                    value: character,
                    color: style.color,
                    font: style.font,
                    decoration: style.textDecorationLine,
                    textBaseline: rect.bottom - contentRect.top - Math.max(0, (rect.height - fontSize) / 2),
                    x,
                    y,
                    right: rect.right - contentRect.left,
                    fontSize
                  });
                }
              }
              offset = nextOffset;
            }
            range.detach();
            operations.push(...textRuns);
          }
        }
        node = walker.nextNode();
      }

      const pdf = await PDFDocument.create();
      for (let index = 0; index < pageCount; index++) {
        if (onProgress) onProgress(60 + Math.round((index + 1) / pageCount * 32), `Rendering document page ${index + 1} of ${pageCount}...`);
        const offset = index * pageHeight;
        const canvas = document.createElement('canvas');
        const scale = 1.5;
        canvas.width = pageWidth * scale;
        canvas.height = pageHeight * scale;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Your browser could not create a PDF page image.');
        context.scale(scale, scale);
        context.fillStyle = '#fff';
        context.fillRect(0, 0, pageWidth, pageHeight);
        for (const operation of operations) {
          const localY = operation.y - offset;
          if (localY + (operation.height || operation.fontSize || 0) < 0 || localY > pageHeight) continue;
          if (operation.type === 'fill') {
            context.fillStyle = operation.color;
            context.fillRect(operation.x, localY, operation.width, operation.height);
          } else if (operation.type === 'border') {
            context.strokeStyle = operation.color;
            context.lineWidth = operation.lineWidth;
            context.beginPath();
            context.moveTo(operation.x, localY);
            context.lineTo(operation.x + operation.width, localY + operation.height);
            context.stroke();
          } else if (operation.type === 'image') {
            context.drawImage(operation.image, operation.x, localY, operation.width, operation.height);
          } else if (operation.type === 'text') {
            context.fillStyle = operation.color;
            context.font = operation.font;
            context.textBaseline = 'alphabetic';
            context.fillText(operation.value, operation.x, operation.textBaseline - offset);
            if (operation.decoration?.includes('underline') || operation.decoration?.includes('line-through')) {
              const baseline = operation.textBaseline - offset;
              const lineY = operation.decoration.includes('underline')
                ? baseline + Math.max(1, operation.fontSize / 12)
                : baseline - operation.fontSize * 0.35;
              context.strokeStyle = operation.color;
              context.lineWidth = Math.max(1, operation.fontSize / 16);
              context.beginPath();
              context.moveTo(operation.x, lineY);
              context.lineTo(operation.x + context.measureText(operation.value).width, lineY);
              context.stroke();
            }
          }
        }
        const png = await new Promise((resolve, reject) => {
          canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error(`Could not encode document page ${index + 1}.`)), 'image/png');
        });
        const embedded = await pdf.embedPng(await png.arrayBuffer());
        const page = pdf.addPage([pageWidth * 0.75, pageHeight * 0.75]);
        page.drawImage(embedded, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
        canvas.width = 0;
        canvas.height = 0;
      }
      pdf.setTitle(file.name.replace(/\.[^/.]+$/, ''));
      return {
        data: await pdf.save(),
        filename: `${file.name.replace(/\.[^/.]+$/, '')}.pdf`,
        mimeType: 'application/pdf',
        pageCount
      };
    } finally {
      iframe.remove();
    }
  }

  export async function processOfficeToPDF(file, onProgress) {
    if (onProgress) onProgress(15, 'Reading Office document content...');
    const extension = file.name.toLowerCase();
    if (extension.endsWith('.docx')) {
      return officeHtmlToPdf(file, await wordDocumentHtml(file), onProgress);
    }
    if (extension.endsWith('.xlsx')) {
      return officeHtmlToPdf(file, await excelDocumentHtml(file), onProgress);
    }
    if (extension.endsWith('.pptx')) {
      return officeHtmlToPdf(file, await powerpointDocumentHtml(file), onProgress);
    }
    const text = await extractOfficeText(file);
    if (!text.trim()) throw new Error('No text was found in this Office document.');
    if (onProgress) onProgress(55, 'Converting extracted content to PDF...');
    const result = await textToPdfDocument(text, file.name.replace(/\.[^/.]+$/, ''), onProgress);
    return {
      ...result,
      filename: `${file.name.replace(/\.[^/.]+$/, '')}.pdf`,
      mimeType: 'application/pdf'
    };
  }

  export async function processPDFToImages(file, format = 'png', onProgress) {
    const pdfjsLib = await loadPdfJs();
    const data = new Uint8Array(await readFileAsArrayBuffer(file));
    const pdfDocument = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
    const zip = new JSZip();

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
      if (onProgress) onProgress(10 + Math.round(pageNumber / pdfDocument.numPages * 80), `Rendering page ${pageNumber} of ${pdfDocument.numPages}...`);
      const page = await pdfDocument.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser could not create an image canvas.');
      await page.render({ canvasContext: context, viewport }).promise;
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Failed to encode a rendered PDF page.')), `image/${format}`);
      });
      zip.file(`page-${String(pageNumber).padStart(3, '0')}.${format}`, blob);
      canvas.width = 0;
      canvas.height = 0;
    }

    return {
      data: await zip.generateAsync({ type: 'blob' }),
      filename: `${file.name.replace(/\.[^/.]+$/, '')}-${format}-pages.zip`,
      mimeType: 'application/zip',
      pageCount: pdfDocument.numPages
    };
  }

  export async function processPdfToOffice(file, format, onProgress) {
    const pages = await extractPdfPageLayouts(file, onProgress);
    const base = file.name.replace(/\.[^/.]+$/, '');
    const hasText = pages.some((page) => page.lines.length);

    if (format === 'xlsx') {
      if (!hasText) throw new Error('No selectable text was found in the PDF. Scanned pages require OCR before they can be converted to editable spreadsheet cells.');
      if (onProgress) onProgress(88, 'Building editable spreadsheet cells from positioned PDF text...');
      const rows = [];
      for (const [pageIndex, page] of pages.entries()) {
        if (pageIndex > 0) rows.push([]);
        for (const line of page.lines) rows.push(layoutLineCells(line));
      }
      return {
        data: await makeSpreadsheetBlob(rows),
        filename: `${base}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pageCount: pages.length
      };
    }

    if (format === 'pptx') {
      if (!hasText) throw new Error('No selectable text was found in the PDF. Scanned pages require OCR before they can be converted to editable PowerPoint text.');
      if (onProgress) onProgress(85, 'Building editable slides from positioned PDF text...');
      const PptxGenJS = (await import('pptxgenjs')).default;
      const presentation = new PptxGenJS();
      const firstPage = pages[0];
      const slideWidth = firstPage.width * 0.75 / 72;
      const slideHeight = firstPage.height * 0.75 / 72;
      presentation.defineLayout({ name: 'PDF_PAGE', width: slideWidth, height: slideHeight });
      presentation.layout = 'PDF_PAGE';
      pages.forEach((page, index) => {
        const slide = presentation.addSlide();
        const scale = Math.min(slideWidth / (page.width * 0.75 / 72), slideHeight / (page.height * 0.75 / 72));
        for (const line of page.lines) {
          for (const item of line.items) {
            const fontSize = Math.max(4, item.fontSize * 0.75 * scale);
            const width = Math.max(0.08, (item.right - item.x) * 0.75 / 72 * scale);
            const height = Math.max(0.12, item.fontSize * 0.75 / 72 * 1.5 * scale);
            const x = Math.max(0, item.x * 0.75 / 72 * scale);
            const y = Math.max(0, (page.height - item.y - item.fontSize) * 0.75 / 72 * scale);
            slide.addText(item.text, {
              x,
              y,
              w: Math.min(width, Math.max(0.08, slideWidth - x)),
              h: Math.min(height, Math.max(0.12, slideHeight - y)),
              fontFace: item.fontFamily || 'Arial',
              fontSize,
              bold: item.bold,
              italic: item.italic,
              breakLine: false,
              margin: 0,
              fit: 'shrink',
              valign: 'mid'
            });
          }
        }
      });
      const data = await presentation.write({ outputType: 'blob' });
      return {
        data,
        filename: `${base}.pptx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        pageCount: pages.length
      };
    }

    throw new Error(`Unsupported Office output format: ${format}`);
  }

  export async function processOCRPDF(file, onProgress) {
    const [pdfjsLib, tesseract] = await Promise.all([
      loadPdfJs(),
      import('tesseract.js')
    ]);
    const source = await pdfjsLib.getDocument({
      data: new Uint8Array(await readFileAsArrayBuffer(file)),
      isEvalSupported: false
    }).promise;
    const worker = await tesseract.createWorker('eng', 1, {
      logger: (message) => {
        if (message.status === 'recognizing text' && onProgress) {
          const percent = 15 + Math.round((message.progress || 0) * 70);
          onProgress(percent, 'Recognizing text locally in your browser...');
        }
      }
    });
    const output = await PDFDocument.create();
    const font = await output.embedFont(StandardFonts.Helvetica);
    let recognizedLineCount = 0;

    try {
      for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber++) {
        if (onProgress) onProgress(15 + Math.round((pageNumber - 1) / source.numPages * 70), `Rendering scanned page ${pageNumber} of ${source.numPages}...`);
        const page = await source.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Your browser could not create an OCR canvas.');
        await page.render({ canvasContext: context, viewport }).promise;
        const result = await worker.recognize(canvas);
        const imageBlob = await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not preserve a scanned page image.')), 'image/png'));
        const image = await output.embedPng(await imageBlob.arrayBuffer());
        const outputPage = output.addPage([viewport.width / 2, viewport.height / 2]);
        outputPage.drawImage(image, { x: 0, y: 0, width: viewport.width / 2, height: viewport.height / 2 });
        const lines = result.data.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        for (const [index, line] of lines.entries()) {
          const recognizedLine = line.replace(/[^\u0000-\u00FF]/g, '').trim();
          if (!recognizedLine) continue;
          recognizedLineCount++;
          outputPage.drawText(recognizedLine, {
            x: 2,
            y: Math.max(2, outputPage.getHeight() - 10 - index * 8),
            size: 6,
            font,
            opacity: 0.01
          });
        }
        canvas.width = 0;
        canvas.height = 0;
      }
    } finally {
      await worker.terminate();
    }

    if (!recognizedLineCount) throw new Error('OCR did not detect any text in this document.');
    if (onProgress) onProgress(95, 'Saving searchable PDF...');
    return {
      data: await output.save(),
      filename: `${file.name.replace(/\.[^/.]+$/, '')}-ocr.pdf`,
      mimeType: 'application/pdf',
      pageCount: source.numPages
    };
  }

  export async function processSignPDF(file, signer, onProgress) {
    if (!signer?.trim()) throw new Error('Enter the name to use as your electronic signature.');
    const pdf = await PDFDocument.load(await readFileAsArrayBuffer(file), { ignoreEncryption: true });
    const font = await pdf.embedFont(StandardFonts.HelveticaOblique);
    const pages = pdf.getPages();
    if (onProgress) onProgress(60, 'Adding typed signature to document...');
    const date = new Date().toLocaleDateString();
    pages[pages.length - 1].drawText(`Signed electronically by ${signer.trim()} on ${date}`, {
      x: 48, y: 36, size: 12, font, color: rgb(0.1, 0.2, 0.45)
    });
    return {
      data: await pdf.save(),
      filename: `${file.name.replace(/\.[^/.]+$/, '')}-signed.pdf`,
      mimeType: 'application/pdf',
      pageCount: pages.length
    };
  }

  export async function processCropPDF(file, marginPercent = 5, onProgress) {
    const margin = Number(marginPercent);
    if (!Number.isFinite(margin) || margin < 0 || margin >= 50) throw new Error('Crop margin must be between 0 and 49 percent.');
    const pdf = await PDFDocument.load(await readFileAsArrayBuffer(file), { ignoreEncryption: true });
    const pages = pdf.getPages();
    if (onProgress) onProgress(60, 'Applying crop box to document pages...');
    for (const page of pages) {
      const { x, y, width, height } = page.getMediaBox();
      const insetX = width * margin / 100;
      const insetY = height * margin / 100;
      page.setCropBox(x + insetX, y + insetY, width - insetX * 2, height - insetY * 2);
    }
    return {
      data: await pdf.save(),
      filename: `${file.name.replace(/\.[^/.]+$/, '')}-cropped.pdf`,
      mimeType: 'application/pdf',
      pageCount: pages.length
    };
  }

  export async function processComparePDF(files, onProgress) {
    if (!files || files.length !== 2) throw new Error('Select exactly two PDF files to compare.');
    const [leftPages, rightPages] = await Promise.all(files.map((file) => extractPdfPageTexts(file, onProgress)));
    const maxPages = Math.max(leftPages.length, rightPages.length);
    const report = [`Comparison: ${files[0].name} vs ${files[1].name}`, 'Text comparison only; visual formatting and image differences are not included.', ''];
    let differences = 0;

    for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
      const left = (leftPages[pageIndex] || []).join('\n');
      const right = (rightPages[pageIndex] || []).join('\n');
      if (left !== right) {
        differences++;
        report.push(`Page ${pageIndex + 1}`, `File 1: ${left || '[no page/text]'}`, `File 2: ${right || '[no page/text]'}`, '');
      }
    }
    if (!differences) report.push('No text differences found.');
    return {
      data: new Blob([report.join('\n')], { type: 'text/plain;charset=utf-8' }),
      filename: `${files[0].name.replace(/\.[^/.]+$/, '')}-comparison.txt`,
      mimeType: 'text/plain',
      pageCount: maxPages
    };
  }

  async function rasterizePDF(file, password, onProgress) {
    const pdfjsLib = await loadPdfJs();
    const source = await pdfjsLib.getDocument({
      data: new Uint8Array(await readFileAsArrayBuffer(file)),
      password,
      isEvalSupported: false
    }).promise;
    const repaired = await PDFDocument.create();
    for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber++) {
      if (onProgress) onProgress(15 + Math.round(pageNumber / source.numPages * 70), `Rebuilding page ${pageNumber} of ${source.numPages}...`);
      const sourcePage = await source.getPage(pageNumber);
      const viewport = sourcePage.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser could not create a repair canvas.');
      await sourcePage.render({ canvasContext: context, viewport }).promise;
      const imageBytes = await new Promise((resolve, reject) => canvas.toBlob(async (blob) => {
        if (!blob) return reject(new Error('Could not rebuild a PDF page image.'));
        resolve(await blob.arrayBuffer());
      }, 'image/png'));
      const embedded = await repaired.embedPng(imageBytes);
      const page = repaired.addPage([viewport.width, viewport.height]);
      page.drawImage(embedded, { x: 0, y: 0, width: viewport.width, height: viewport.height });
      canvas.width = 0;
      canvas.height = 0;
    }
    return repaired;
  }

  export async function processRepairPDF(file, onProgress) {
    const repaired = await rasterizePDF(file, undefined, onProgress);
    return {
      data: await repaired.save(),
      filename: `${file.name.replace(/\.[^/.]+$/, '')}-repaired.pdf`,
      mimeType: 'application/pdf',
      pageCount: repaired.getPageCount()
    };
  }

  export async function processUnlockPDF(file, password, onProgress) {
    if (!password) throw new Error('Enter the PDF open password.');
    if (onProgress) onProgress(35, 'Decrypting PDF locally...');
    const { decryptPDF } = await import('@pdfsmaller/pdf-decrypt');
    const bytes = new Uint8Array(await readFileAsArrayBuffer(file));
    const decrypted = await decryptPDF(bytes, password);
    return {
      data: decrypted,
      filename: `${file.name.replace(/\.[^/.]+$/, '')}-unlocked.pdf`,
      mimeType: 'application/pdf',
      pageCount: (await PDFDocument.load(decrypted)).getPageCount()
    };
  }

  export async function processProtectPDF(file, password, onProgress) {
    if (!password || password.length < 8) throw new Error('Choose a password with at least 8 characters.');
    if (!globalThis.crypto?.subtle) throw new Error('PDF password protection requires HTTPS or localhost so your browser can use secure encryption.');
    if (onProgress) onProgress(35, 'Encrypting PDF with AES-256 locally...');
    const { encryptPDF } = await import('@pdfsmaller/pdf-encrypt');
    const bytes = new Uint8Array(await readFileAsArrayBuffer(file));
    const encrypted = await encryptPDF(bytes, password, { algorithm: 'AES-256' });
    return {
      data: encrypted,
      filename: `${file.name.replace(/\.[^/.]+$/, '')}-protected.pdf`,
      mimeType: 'application/pdf',
      pageCount: (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount()
    };
  }

export async function processImagesToPDF(files, { orientation = 'portrait', pageSize = 'a4', margin = 20 }, onProgress) {
  if (!files || files.length === 0) {
    throw new Error('Please select at least one image file.');
  }

  if (onProgress) onProgress(20, 'Creating PDF canvas...');
  const pdfDoc = await PDFDocument.create();

  // A4 standard points: 595.28 x 841.89
  const standardWidth = orientation === 'landscape' ? 841.89 : 595.28;
  const standardHeight = orientation === 'landscape' ? 595.28 : 841.89;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const percent = Math.round(20 + ((i + 1) / files.length) * 70);
    if (onProgress) onProgress(percent, `Processing image ${i + 1} of ${files.length}...`);

    const arrayBuffer = await readFileAsArrayBuffer(file);
    const isPng = file.type.includes('png') || file.name.toLowerCase().endsWith('.png');
    
    let embeddedImg;
    try {
      embeddedImg = isPng ? await pdfDoc.embedPng(arrayBuffer) : await pdfDoc.embedJpg(arrayBuffer);
    } catch (e) {
      // Fallback: If image embedding fails directly (e.g. progressive jpeg or non-standard format), convert via canvas
      const dataUrl = await readFileAsDataURL(file);
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = dataUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95);
      const base64Data = jpegDataUrl.split(',')[1];
      const binaryStr = atob(base64Data);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let j = 0; j < len; j++) bytes[j] = binaryStr.charCodeAt(j);
      embeddedImg = await pdfDoc.embedJpg(bytes.buffer);
    }

    let page;
    let imgWidth, imgHeight, imgX, imgY;

    if (pageSize === 'fit') {
      // Fit page exactly to image dimensions
      page = pdfDoc.addPage([embeddedImg.width, embeddedImg.height]);
      imgWidth = embeddedImg.width;
      imgHeight = embeddedImg.height;
      imgX = 0;
      imgY = 0;
    } else {
      page = pdfDoc.addPage([standardWidth, standardHeight]);
      const availableWidth = standardWidth - margin * 2;
      const availableHeight = standardHeight - margin * 2;

      const scale = Math.min(availableWidth / embeddedImg.width, availableHeight / embeddedImg.height, 1);
      imgWidth = embeddedImg.width * scale;
      imgHeight = embeddedImg.height * scale;
      imgX = margin + (availableWidth - imgWidth) / 2;
      imgY = margin + (availableHeight - imgHeight) / 2;
    }

    page.drawImage(embeddedImg, {
      x: imgX,
      y: imgY,
      width: imgWidth,
      height: imgHeight,
    });
  }

  if (onProgress) onProgress(95, 'Building PDF document...');
  const pdfBytes = await pdfDoc.save();

  return {
    data: pdfBytes,
    filename: `ilovepdfs-images-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    pageCount: files.length
  };
}

/**
 * Compress PDF: Re-encodes objects, strips unreferenced structures, flattens metadata
 */
export async function processCompressPDF(file, level = 'recommended', onProgress) {
  if (onProgress) onProgress(10, 'Rendering pages for image compression...');
  const pdfjsLib = await loadPdfJs();
  const sourceBytes = new Uint8Array(await readFileAsArrayBuffer(file));
  const source = await pdfjsLib.getDocument({ data: sourceBytes, isEvalSupported: false }).promise;
  const output = await PDFDocument.create();
  const scale = level === 'extreme' ? 1 : 1.5;
  const quality = level === 'extreme' ? 0.45 : 0.72;

  for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber++) {
    if (onProgress) onProgress(10 + Math.round(pageNumber / source.numPages * 65), `Compressing page ${pageNumber} of ${source.numPages}...`);
    const sourcePage = await source.getPage(pageNumber);
    const viewport = sourcePage.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not create a compression canvas.');
    await sourcePage.render({ canvasContext: context, viewport }).promise;
    const imageBlob = await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode a compressed PDF page.')), 'image/jpeg', quality));
    const image = await output.embedJpg(await imageBlob.arrayBuffer());
    const page = output.addPage([viewport.width / scale, viewport.height / scale]);
    page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
    canvas.width = 0;
    canvas.height = 0;
  }

  if (onProgress) onProgress(85, 'Comparing compressed and lossless file sizes...');
  const rasterBytes = await output.save({ useObjectStreams: true });
  const losslessDoc = await PDFDocument.load(await readFileAsArrayBuffer(file), { ignoreEncryption: true });
  const losslessBytes = await losslessDoc.save({ useObjectStreams: true });
  const pdfBytes = rasterBytes.byteLength < losslessBytes.byteLength ? rasterBytes : losslessBytes;
  const newSize = pdfBytes.byteLength;

  const originalBase = file.name.replace(/\.[^/.]+$/, "");
  return {
    data: pdfBytes,
    filename: `${originalBase}-optimized.pdf`,
    mimeType: 'application/pdf',
    pageCount: source.numPages,
    originalSize: file.size,
    newSize,
    reductionRatio: Math.round(((file.size - newSize) / file.size) * 100)
  };
}

/**
 * Flatten fillable form fields and annotations
 */
export async function processFlattenPDF(file, onProgress) {
  if (onProgress) onProgress(35, 'Reading interactive form elements...');
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  if (form.getFields().length > 0) form.flatten();

  if (onProgress) onProgress(85, 'Flattening annotations into page content...');
  const pdfBytes = await pdfDoc.save();
  const originalBase = file.name.replace(/\.[^/.]+$/, "");

  return {
    data: pdfBytes,
    filename: `${originalBase}-flattened.pdf`,
    mimeType: 'application/pdf',
    pageCount: pdfDoc.getPageCount()
  };
}

/**
 * Extract raw readable text from PDF
 */
export async function processPDFToText(file, onProgress) {
  const pages = await extractPdfPageTexts(file, onProgress);
  const extractedText = pages.map((page, index) => `--- Page ${index + 1} ---\n${page.join('\n')}`).join('\n\n');
  if (!pages.some((page) => page.length)) {
    throw new Error('No selectable text was found. For scanned PDFs, use the OCR PDF tool.');
  }
  return {
    data: new Blob([extractedText], { type: 'text/plain;charset=utf-8' }),
    filename: `${file.name.replace(/\.[^/.]+$/, '')}-extracted.txt`,
    mimeType: 'text/plain',
    pageCount: pages.length
  };
}

/**
 * Rebuild PDF text as editable Word text with approximate source positioning.
 */
export async function processPDFToWord(file, onProgress) {
  if (!file) {
    throw new Error('Please choose a PDF file to convert.');
  }

  const pages = await extractPdfPageLayouts(file, onProgress);
  if (!pages.some((page) => page.lines.length)) {
    throw new Error('No selectable text was found in the PDF. Scanned pages require OCR before they can be converted to editable Word text.');
  }

  if (onProgress) onProgress(82, 'Building positioned, editable Word text...');
  const documentParagraphs = [];
  pages.forEach((page, pageIndex) => {
    let previousTop = 0;
    for (const line of page.lines) {
      const top = Math.max(0, page.height - line.y);
      const leading = Math.max(0, top - previousTop - line.fontSize);
      const stops = line.items
        .filter((item) => item.x > 2)
        .map((item) => Math.max(1, Math.round(item.x * 15)))
        .filter((position, index, positions) => positions.indexOf(position) === index)
        .map((position) => `<w:tab w:val="left" w:pos="${position}"/>`)
        .join('');
      const runs = [];
      let previousItem;
      for (const item of line.items) {
        const gap = previousItem ? item.x - previousItem.right : item.x;
        if (previousItem && gap > Math.max(2, item.fontSize * 0.5)) {
          runs.push('<w:r><w:tab/></w:r>');
        } else if (previousItem && gap > Math.max(1, item.fontSize * 0.15)) {
          runs.push('<w:r><w:t xml:space="preserve"> </w:t></w:r>');
        } else if (!previousItem && item.x > 2) {
          runs.push('<w:r><w:tab/></w:r>');
        }
        runs.push(wordTextRun(item));
        previousItem = item;
      }
      if (runs.length) {
        const lineHeight = Math.max(1, Math.round(line.fontSize * 15 * 1.2));
        documentParagraphs.push(`<w:p><w:pPr><w:spacing w:before="${Math.round(leading * 15)}" w:after="0" w:line="${lineHeight}" w:lineRule="exact"/>${stops ? `<w:tabs>${stops}</w:tabs>` : ''}</w:pPr>${runs.join('')}</w:p>`);
        previousTop = top;
      }
    }
    if (pageIndex < pages.length - 1) {
      documentParagraphs.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    }
  });

  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/></w:rPr>
    <w:pPr><w:spacing w:after="120"/></w:pPr>
  </w:style>
</w:styles>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${documentParagraphs.join('')}
    <w:sectPr><w:pgSz w:w="${Math.round(pages[0].width * 15)}" w:h="${Math.round(pages[0].height * 15)}"${pages[0].width > pages[0].height ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>`);

  if (onProgress) onProgress(95, 'Preparing Word document for download...');
  const data = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
  const originalBase = file.name.replace(/\.[^/.]+$/, '');

  return {
    data,
    filename: `${originalBase}.docx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pageCount: pages.length
  };
}

/**
 * Bundle multiple PDF files into a single ZIP archive
 */
export async function processPDFToZIP(files, onProgress) {
  if (!files || files.length === 0) {
    throw new Error('Please select at least one PDF file to archive.');
  }

  if (onProgress) onProgress(20, 'Initializing ZIP archive...');
  const zip = new JSZip();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const percent = Math.round(20 + ((i + 1) / files.length) * 70);
    if (onProgress) onProgress(percent, `Adding ${file.name} to archive...`);
    const buffer = await readFileAsArrayBuffer(file);
    zip.file(`${String(i + 1).padStart(3, '0')}-${file.name}`, buffer);
  }

  if (onProgress) onProgress(95, 'Compressing ZIP package...');
  const zipBlob = await zip.generateAsync({ type: 'blob' });

  return {
    data: zipBlob,
    filename: `ilovepdfs-archive-${Date.now()}.zip`,
    mimeType: 'application/zip',
    fileCount: files.length
  };
}

/**
 * Inspect and update PDF metadata
 */
export async function processPDFMetadata(file, { title, author, subject, keywords }, onProgress) {
  if (onProgress) onProgress(30, 'Reading PDF metadata attributes...');
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

  if (onProgress) onProgress(70, 'Updating metadata headers...');
  if (title !== undefined) pdfDoc.setTitle(title);
  if (author !== undefined) pdfDoc.setAuthor(author);
  if (subject !== undefined) pdfDoc.setSubject(subject);
  if (keywords !== undefined) {
    const list = keywords.split(',').map(s => s.trim()).filter(Boolean);
    pdfDoc.setKeywords(list);
  }

  if (onProgress) onProgress(95, 'Saving updated PDF...');
  const pdfBytes = await pdfDoc.save();
  const originalBase = file.name.replace(/\.[^/.]+$/, "");

  return {
    data: pdfBytes,
    filename: `${originalBase}-updated-meta.pdf`,
    mimeType: 'application/pdf',
    pageCount: pdfDoc.getPageCount()
  };
}

/**
 * Create a new blank PDF
 */
export async function processCreateBlankPDF(pageCount = 1, size = 'a4', onProgress) {
  const dimensions = size === 'letter' ? [612, 792] : [595.28, 841.89];
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 20) {
    throw new Error('Choose between 1 and 20 blank pages.');
  }
  if (onProgress) onProgress(40, 'Generating blank PDF document...');
  const pdfDoc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    pdfDoc.addPage(dimensions);
  }

  if (onProgress) onProgress(90, 'Finalizing new document...');
  const pdfBytes = await pdfDoc.save();

  return {
    data: pdfBytes,
    filename: `ilovepdfs-document-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    pageCount
  };
}
