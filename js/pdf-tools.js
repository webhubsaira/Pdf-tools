/**
 * DocuFlow - PDF Operations Engine
 * Real browser-side processing powered by PDF-Lib, JSZip, and HTML5 Canvas
 */

import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import JSZip from 'jszip';
import { readFileAsArrayBuffer, readFileAsDataURL } from './file-handler.js';

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

/**
 * Convert multiple JPG / PNG images into a clean PDF document
 */
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
  if (onProgress) onProgress(30, 'Analyzing PDF document structures...');
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const originalSize = file.size;

  if (onProgress) onProgress(65, 'Applying stream compression and cleanup...');
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

  // Streamline document metadata
  pdfDoc.setTitle(pdfDoc.getTitle() || 'Optimized Document');
  pdfDoc.setProducer('iLovePDFs Engine');

  if (onProgress) onProgress(90, 'Re-encoding optimized PDF streams...');
  const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
  const newSize = pdfBytes.byteLength;

  const originalBase = file.name.replace(/\.[^/.]+$/, "");
  return {
    data: pdfBytes,
    filename: `${originalBase}-optimized.pdf`,
    mimeType: 'application/pdf',
    pageCount: pdfDoc.getPageCount(),
    originalSize,
    newSize,
    reductionRatio: Math.max(0, Math.round(((originalSize - newSize) / originalSize) * 100))
  };
}

/**
 * Flatten fillable form fields and annotations
 */
export async function processFlattenPDF(file, onProgress) {
  if (onProgress) onProgress(35, 'Reading interactive form elements...');
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

  try {
    const form = pdfDoc.getForm();
    form.flatten();
  } catch (e) {
    // Document does not have an interactive AcroForm; still re-save cleanly
  }

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
  if (onProgress) onProgress(35, 'Scanning PDF text content...');
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const uint8 = new Uint8Array(arrayBuffer);

  // Decode readable text strings from PDF stream
  let extractedText = '';
  const textDecoder = new TextDecoder('utf-8');
  const rawString = textDecoder.decode(uint8);

  // Parse text objects between BT (Begin Text) and ET (End Text) or Tj/TJ operators
  const matches = rawString.match(/\((.*?)\)\s*Tj|\[(.*?)\]\s*TJ/g);
  if (matches && matches.length > 0) {
    extractedText = matches.map(m => {
      return m.replace(/^[\(\[]/, '').replace(/[\)\]]\s*T[jJ]$/, '').replace(/\\([()\\])/g, '$1');
    }).join(' ');
  } else {
    // Generic fallback text extraction
    const readableBlocks = rawString.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\xFF]/g, ' ')
      .replace(/\s+/g, ' ')
      .match(/[A-Za-z0-9\s.,!?:;'"\-]{15,}/g);
    extractedText = (readableBlocks || []).join('\n\n') || 'No plain text streams could be automatically extracted from this document.';
  }

  if (onProgress) onProgress(90, 'Formatting extracted text...');
  const originalBase = file.name.replace(/\.[^/.]+$/, "");

  return {
    data: new Blob([extractedText], { type: 'text/plain;charset=utf-8' }),
    filename: `${originalBase}-extracted.txt`,
    mimeType: 'text/plain',
    textPreview: extractedText.slice(0, 500)
  };
}

/**
 * Extract selectable text from a PDF and package it as an editable Word document.
 */
export async function processPDFToWord(file, onProgress) {
  if (!file) {
    throw new Error('Please choose a PDF file to convert.');
  }

  const [pdfjsLib, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  ]);
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;

  if (onProgress) onProgress(10, 'Reading PDF file...');
  const buffer = await readFileAsArrayBuffer(file);
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false
  });

  let pdf;
  try {
    pdf = await loadingTask.promise;
  } catch (error) {
    if (error?.name === 'PasswordException') {
      throw new Error('This PDF is password-protected. Remove its password before converting it.');
    }
    throw error;
  }

  const pageParagraphs = [];
  let extractedCharacters = 0;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    if (onProgress) {
      const progress = 20 + Math.round((pageNumber / pdf.numPages) * 55);
      onProgress(progress, `Extracting text from page ${pageNumber} of ${pdf.numPages}...`);
    }

    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const textItems = textContent.items
      .filter((item) => typeof item.str === 'string' && item.str.trim())
      .map((item) => ({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        fontSize: Math.hypot(item.transform[0], item.transform[1]) || item.height || 12
      }))
      .sort((a, b) => b.y - a.y || a.x - b.x);

    const lines = [];
    for (const item of textItems) {
      const previousLine = lines[lines.length - 1];
      const tolerance = Math.max(1.5, Math.min(4, item.fontSize * 0.25));
      if (!previousLine || Math.abs(previousLine.y - item.y) > tolerance) {
        lines.push({ y: item.y, items: [item] });
      } else {
        previousLine.items.push(item);
      }
    }

    const paragraphs = lines.map((line) => {
      line.items.sort((a, b) => a.x - b.x);
      let text = '';
      let previousItem;
      for (const item of line.items) {
        if (previousItem) {
          const gap = item.x - (previousItem.x + previousItem.width);
          if (gap > Math.max(1, item.fontSize * 0.18) && !/\s$/.test(text) && !/^\s/.test(item.text)) {
            text += ' ';
          }
        }
        text += item.text;
        previousItem = item;
      }
      return text.trim();
    }).filter(Boolean);

    extractedCharacters += paragraphs.join('').length;
    pageParagraphs.push(paragraphs);
  }

  if (extractedCharacters === 0) {
    throw new Error('No selectable text was found. This may be a scanned PDF; OCR is not available in this browser-only converter.');
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
    pageCount: pdf.numPages
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
    zip.file(file.name, buffer);
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
  if (onProgress) onProgress(40, 'Generating blank PDF document...');
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.addPage([595.28, 841.89]);
    page.drawText(`iLovePDFs New Document - Page ${i + 1}`, {
      x: 50,
      y: 800,
      size: 14,
      font,
      color: rgb(0.5, 0.5, 0.5)
    });
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
