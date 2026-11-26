import { describe, expect, it } from 'vitest';
import { encryptPDF } from '@pdfsmaller/pdf-encrypt';
import {
  processComparePDF,
  processCreateBlankPDF,
  processCropPDF,
  processFlattenPDF,
  processMergePDF,
  processMetadata,
  processOrganizePDF,
  processPageNumbers,
  processPDFMetadata,
  processPDFToZIP,
  processRemovePages,
  processRotatePDF,
  processSignPDF,
  processSplitPDF,
  processSplitToFilesPDF,
  processUnlockPDF,
  processWatermarkPDF,
  processImagesToPDF
} from '../js/pdf-tools.js';
import { loadResult, makePdf, makeFile } from './setup.js';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';

const PASSWORD = 'correct-horse-battery';

describe('encrypted input', () => {
  it('refuses password-protected PDFs instead of writing a corrupt file', async () => {
    const encrypted = await encryptPDF(await makePdf({ pages: 2 }), PASSWORD, { algorithm: 'AES-256' });
    const file = makeFile(encrypted, 'locked.pdf');
    const openFile = makeFile(await makePdf(), 'open.pdf');

    for (const run of [
      () => processRotatePDF(file, 90),
      () => processRemovePages(file, '1'),
      () => processMergePDF([file, openFile]),
      () => processPageNumbers(file, {}),
      () => processSignPDF(file, 'Ada Lovelace')
    ]) {
      await expect(run()).rejects.toThrow(/password-protected/i);
    }
  });

  it('unlock produces a decrypted document with intact text', async () => {
    const encrypted = await encryptPDF(await makePdf({ pages: 1, text: 'Balance due' }), PASSWORD, { algorithm: 'AES-256' });
    const result = await processUnlockPDF(makeFile(encrypted, 'locked.pdf'), PASSWORD);
    const text = await readText(result.data);
    expect(text).toContain('Balance due');
  });
});

describe('merge / split', () => {
  it('merges files in the order given', async () => {
    const first = makeFile(await makePdf({ pages: 2, text: 'First' }), 'first.pdf');
    const second = makeFile(await makePdf({ pages: 3, text: 'Second' }), 'second.pdf');

    const result = await processMergePDF([first, second]);
    const doc = await loadResult(result);
    expect(doc.getPageCount()).toBe(5);
    expect(result.pageCount).toBe(5);
    expect(await readText(result.data, 5)).toMatch(/First page 1[\s\S]*Second page 1/);
  });

  it('needs at least two files to merge', async () => {
    await expect(processMergePDF([makeFile(await makePdf(), 'only.pdf')])).rejects.toThrow(/at least 2 PDF files/i);
  });

  it('extracts the selected pages into one document', async () => {
    const file = makeFile(await makePdf({ pages: 4 }), 'doc.pdf');
    const doc = await loadResult(await processSplitPDF(file, '1-2, 4'));
    expect(doc.getPageCount()).toBe(3);
  });

  it('splits every selected page into its own PDF inside a ZIP', async () => {
    const file = makeFile(await makePdf({ pages: 4 }), 'doc.pdf');
    const result = await processSplitToFilesPDF(file, '1,3');
    const zip = await JSZip.loadAsync(await result.data.arrayBuffer());
    const names = Object.keys(zip.files).sort();

    expect(names).toEqual(['doc-page-1.pdf', 'doc-page-3.pdf']);
    expect(result.mimeType).toBe('application/zip');
    for (const name of names) {
      const doc = await PDFDocument.load(new Uint8Array(await zip.file(name).async('arraybuffer')));
      expect(doc.getPageCount()).toBe(1);
    }
  });
});

describe('page edits', () => {
  it('removes the requested pages', async () => {
    const file = makeFile(await makePdf({ pages: 4 }), 'doc.pdf');
    expect((await loadResult(await processRemovePages(file, '2, 4'))).getPageCount()).toBe(2);
  });

  it('refuses to remove every page', async () => {
    const file = makeFile(await makePdf({ pages: 2 }), 'doc.pdf');
    await expect(processRemovePages(file, '1-2')).rejects.toThrow(/at least one page must remain/i);
  });

  it('reorders pages', async () => {
    const file = makeFile(await makePdf({ pages: 3 }), 'doc.pdf');
    const result = await processOrganizePDF(file, '3,1,2');
    expect((await loadResult(result)).getPageCount()).toBe(3);
    expect(await readText(result.data)).toMatch(/page 3[\s\S]*page 1[\s\S]*page 2/);
  });

  it('requires every page exactly once when reordering', async () => {
    const file = makeFile(await makePdf({ pages: 3 }), 'doc.pdf');
    await expect(processOrganizePDF(file, '1,2')).rejects.toThrow(/every page number from 1 to 3/i);
    await expect(processOrganizePDF(file, '1,2,2')).rejects.toThrow(/every page number from 1 to 3/i);
  });

  it('rotates by the requested angle', async () => {
    const file = makeFile(await makePdf({ pages: 2 }), 'doc.pdf');
    const doc = await loadResult(await processRotatePDF(file, 180));
    expect(doc.getPages()[0].getRotation().angle).toBe(180);
  });

  it('crops equally from every edge', async () => {
    const file = makeFile(await makePdf({ pages: 1, size: [400, 500] }), 'doc.pdf');
    const doc = await loadResult(await processCropPDF(file, 10));
    const box = doc.getPage(0).getCropBox();
    expect(Math.round(box.width)).toBe(320);
    expect(Math.round(box.height)).toBe(400);
  });

  it('rejects an out-of-range crop margin', async () => {
    const file = makeFile(await makePdf(), 'doc.pdf');
    await expect(processCropPDF(file, 60)).rejects.toThrow(/between 0 and 49/i);
  });

  it('flattens form fields without losing pages', async () => {
    const file = makeFile(await makePdf({ pages: 2 }), 'doc.pdf');
    expect((await loadResult(await processFlattenPDF(file))).getPageCount()).toBe(2);
  });
});

describe('text stamping', () => {
  it('draws a watermark with the chosen colour and angle', async () => {
    const file = makeFile(await makePdf({ pages: 2 }), 'doc.pdf');
    const doc = await loadResult(await processWatermarkPDF(file, { text: 'DRAFT', color: '#2f6fed', angle: -45 }));
    expect(doc.getPageCount()).toBe(2);
  });

  it('reports non-Latin watermark text with an actionable message', async () => {
    const file = makeFile(await makePdf(), 'doc.pdf');
    await expect(processWatermarkPDF(file, { text: 'محرمانہ' })).rejects.toThrow(/Latin characters/i);
    await expect(processWatermarkPDF(file, { text: 'नमस्ते' })).rejects.toThrow(/Latin characters/i);
  });

  it('reports non-Latin signature names with an actionable message', async () => {
    const file = makeFile(await makePdf(), 'doc.pdf');
    await expect(processSignPDF(file, 'علی')).rejects.toThrow(/Latin characters/i);
  });

  it('rejects an empty watermark', async () => {
    const file = makeFile(await makePdf(), 'doc.pdf');
    await expect(processWatermarkPDF(file, { text: '   ' })).rejects.toThrow(/provide watermark text/i);
  });

  it('numbers pages using startFrom', async () => {
    const file = makeFile(await makePdf({ pages: 2 }), 'doc.pdf');
    const result = await processPageNumbers(file, { position: 'bottom-left', format: '{n} / {total}', startFrom: 7 });
    expect(await readText(result.data)).toMatch(/7 \/ 2/);
  });

  it('signs the last page', async () => {
    const file = makeFile(await makePdf({ pages: 2 }), 'doc.pdf');
    const result = await processSignPDF(file, 'Ada Lovelace');
    expect(await readText(result.data)).toContain('Signed electronically by Ada Lovelace');
  });
});

describe('metadata', () => {
  it('writes title, author, subject and keywords', async () => {
    const file = makeFile(await makePdf(), 'doc.pdf');
    const doc = await loadResult(await processPDFMetadata(file, {
      title: 'Quarterly report',
      author: 'Finance',
      subject: 'Q3 numbers',
      keywords: 'q3, finance'
    }));

    expect(doc.getTitle()).toBe('Quarterly report');
    expect(doc.getAuthor()).toBe('Finance');
    expect(doc.getSubject()).toBe('Q3 numbers');
    expect(doc.getKeywords()).toBe('q3 finance');
  });

  it('leaves untouched fields alone', async () => {
    const file = makeFile(await makePdf(), 'doc.pdf');
    const doc = await loadResult(await processPDFMetadata(file, { title: 'Only a title' }));
    expect(doc.getTitle()).toBe('Only a title');
    expect(doc.getSubject()).toBeUndefined();
  });
});

describe('blank documents and archives', () => {
  it('creates A4 and US Letter pages', async () => {
    const a4 = await loadResult(await processCreateBlankPDF(2, 'a4'));
    const letter = await loadResult(await processCreateBlankPDF(1, 'letter'));
    expect(Math.round(a4.getPage(0).getSize().width)).toBe(595);
    expect(Math.round(letter.getPage(0).getSize().width)).toBe(612);
    expect(a4.getPageCount()).toBe(2);
  });

  it('rejects invalid page counts', async () => {
    await expect(processCreateBlankPDF(0)).rejects.toThrow(/between 1 and 20/i);
    await expect(processCreateBlankPDF(21)).rejects.toThrow(/between 1 and 20/i);
    await expect(processCreateBlankPDF(1.5)).rejects.toThrow(/between 1 and 20/i);
  });

  it('archives several PDFs into one ZIP', async () => {
    const files = [
      makeFile(await makePdf({ pages: 1 }), 'a.pdf'),
      makeFile(await makePdf({ pages: 1 }), 'b.pdf')
    ];
    const result = await processPDFToZIP(files);
    const zip = await JSZip.loadAsync(await result.data.arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(['001-a.pdf', '002-b.pdf']);
  });
});

describe('images to PDF', () => {
  it('honours US Letter page size', async () => {
    // 1x1 PNG
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    const file = new File([png], 'dot.png', { type: 'image/png' });
    const doc = await loadResult(await processImagesToPDF([file], { pageSize: 'letter', orientation: 'landscape', margin: 0 }));
    const size = doc.getPage(0).getSize();
    expect(Math.round(size.width)).toBe(792);
    expect(Math.round(size.height)).toBe(612);
  });
});

describe('compare', () => {
  it('reports pages that differ', async () => {
    const left = makeFile(await makePdf({ pages: 2, text: 'Same' }), 'left.pdf');
    const right = makeFile(await makePdf({ pages: 2, text: 'Changed' }), 'right.pdf');
    const report = String(await (await processComparePDF([left, right])).data.text());
    expect(report).toContain('Page 1');
    expect(report).toContain('Changed');
  });

  it('needs exactly two files', async () => {
    await expect(processComparePDF([makeFile(await makePdf(), 'a.pdf')])).rejects.toThrow(/exactly two/i);
  });
});

/** @param {Uint8Array|ArrayBuffer|Blob|string} data @param {number} [pages] */
async function readText(data, pages = Infinity) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const bytes = data instanceof Blob
    ? new Uint8Array(await data.arrayBuffer())
    : typeof data === 'string' ? new Uint8Array(Buffer.from(data)) : new Uint8Array(data);
  const doc = await getDocument({ data: bytes }).promise;
  const parts = [];
  for (let pageNumber = 1; pageNumber <= Math.min(pages, doc.numPages); pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    parts.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
  }
  return parts.join('\n');
}
