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
  const pdfjsLib = await loadPdfJs();
  const data = new Uint8Array(await readFileAsArrayBuffer(file));
  const document = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    if (onProgress) {
      onProgress(15 + Math.round(pageNumber / document.numPages * 65), `Extracting text from page ${pageNumber} of ${document.numPages}...`);
    }
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items
      .filter((item) => typeof item.str === 'string' && item.str.trim())
      .map((item) => ({ text: item.str, x: item.transform[4], y: item.transform[5] }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];

    for (const item of items) {
      let line = lines[lines.length - 1];
      if (!line || Math.abs(line.y - item.y) > 3) {
        line = { y: item.y, items: [] };
        lines.push(line);
      }
      line.items.push(item);
    }

    pages.push(lines.map((line) => line.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(' ').trim()).filter(Boolean));
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
    const source = await file.text();
    let text = source;
    if (!file.name.toLowerCase().endsWith('.txt')) {
      const parsed = new DOMParser().parseFromString(source, 'text/html');
      parsed.querySelectorAll('script,style,template,noscript').forEach((element) => element.remove());
      text = parsed.body.innerText || parsed.body.textContent || '';
    }
    if (!text.trim()) throw new Error('No readable text was found in the selected file.');
    if (onProgress) onProgress(55, 'Formatting readable document text...');
    const result = await textToPdfDocument(text, file.name.replace(/\.[^/.]+$/, ''), onProgress);
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

  export async function processOfficeToPDF(file, onProgress) {
    if (onProgress) onProgress(15, 'Reading Office document content...');
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
    const pages = await extractPdfPageTexts(file, onProgress);
    const lines = pages.flat();
    if (!lines.length) throw new Error('No selectable text was found. Scanned documents require the OCR PDF tool first.');
    const base = file.name.replace(/\.[^/.]+$/, '');

    if (format === 'xlsx') {
      if (onProgress) onProgress(85, 'Building spreadsheet...');
      const rows = lines.map((line) => line.split(/\t+|\s{2,}/).filter(Boolean));
      return {
        data: await makeSpreadsheetBlob(rows),
        filename: `${base}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pageCount: pages.length
      };
    }

    if (format === 'pptx') {
      if (onProgress) onProgress(80, 'Building presentation slides...');
      const PptxGenJS = (await import('pptxgenjs')).default;
      const presentation = new PptxGenJS();
      presentation.layout = 'LAYOUT_WIDE';
      pages.forEach((pageLines, index) => {
        const slide = presentation.addSlide();
        slide.addText(pageLines.join('\n') || `Page ${index + 1}`, {
          x: 0.6,
          y: 0.5,
          w: 12.1,
          h: 6.4,
          fontFace: 'Arial',
          fontSize: 16,
          breakLine: false,
          valign: 'top',
          margin: 0.15,
          fit: 'shrink'
        });
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
 * Extract selectable text from a PDF and package it as an editable Word document.
 */
export async function processPDFToWord(file, onProgress) {
  if (!file) {
    throw new Error('Please choose a PDF file to convert.');
  }

  const pageParagraphs = await extractPdfPageTexts(file, onProgress);
  if (!pageParagraphs.some((page) => page.length)) {
    throw new Error('No selectable text was found. Use the OCR PDF tool for scanned documents.');
  }

  if (onProgress) onProgress(82, 'Building editable Word document...');
  const documentParagraphs = [];
  for (let index = 0; index < pageParagraphs.length; index++) {
    for (const paragraph of pageParagraphs[index]) {
      const safeText = paragraph
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      documentParagraphs.push(`<w:p><w:r><w:t xml:space="preserve">${safeText}</w:t></w:r></w:p>`);
    }
    if (index < pageParagraphs.length - 1) {
      documentParagraphs.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    }
  }

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
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
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
    pageCount: pageParagraphs.length
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
