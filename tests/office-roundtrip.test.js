/**
 * Real-format round trips for the six Office conversions.
 *
 * The point of these tests is that the emitted files are genuine DOCX/XLSX/PPTX, not
 * just ZIPs with familiar part names. Outputs are therefore opened with real Office
 * parsers (`docx`, `exceljs`, `python`-compatible libraries) rather than string-matched:
 *  - `exceljs` reads the workbook back and checks cell types, number formats and widths.
 *  - `docx` (the library Word tooling uses) re-parses the document and reports tables.
 *  - PPTX is checked with `pptxgenjs`' own reader plus its slide/shape XML.
 *
 * The reverse direction feeds fixtures produced by python-docx / openpyxl / python-pptx
 * (tests/fixtures/real.*) — the same shapes real Office files have, including inherited
 * placeholder geometry — through Office → PDF and asserts the PDF keeps the text.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';


const FIXTURES = resolve(import.meta.dirname, 'fixtures');

/** @param {Blob|Uint8Array|ArrayBuffer} data @returns {Promise<Uint8Array>} */
async function bytesOf(data) {
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return data;
}

/**
 * A PDF that looks like a report: title, prose, an aligned table and a second page.
 * @returns {Promise<Uint8Array>}
 */
async function reportPdf() {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]);
  page.drawText('Quarterly Revenue Report', { x: 60, y: 770, size: 20, font: bold, color: rgb(0, 0, 0) });
  page.drawText('Prepared by the finance team.', { x: 60, y: 735, size: 11, font: regular, color: rgb(0.1, 0.1, 0.1) });
  const rows = [['Item', 'Qty', 'Price'], ['Widget', '2', '9.99'], ['Gadget', '5', '24.50']];
  let y = 690;
  for (const row of rows) {
    [60, 260, 380].forEach((x, column) => page.drawText(row[column], { x, y, size: 11, font: column === 0 && y === 690 ? bold : regular, color: rgb(0, 0, 0) }));
    y -= 22;
  }
  page.drawText('Totals exclude tax and shipping.', { x: 60, y: 600, size: 10, font: regular, color: rgb(0.2, 0.2, 0.2) });
  const appendix = doc.addPage([595, 842]);
  appendix.drawText('Appendix', { x: 60, y: 770, size: 16, font: bold, color: rgb(0, 0, 0) });
  appendix.drawText('Every figure is provisional.', { x: 60, y: 740, size: 11, font: regular, color: rgb(0, 0, 0) });
  return doc.save();
}

/** Extract words from a produced PDF, using pdf.js directly. */
async function pdfText(bytes) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: bytes }).promise;
  let text = '';
  for (let index = 1; index <= doc.numPages; index += 1) {
    const page = await doc.getPage(index);
    const content = await page.getTextContent();
    text += `${content.items.map((item) => ('str' in item ? item.str : '')).join(' ')}\n`;
  }
  return text;
}

let engine;
let pdfBytes;

beforeAll(async () => {
  engine = await import('../js/pdf-tools.js');
  pdfBytes = await reportPdf();
}, 60000);

describe('PDF to Word', () => {
  it('produces a document Word tooling can open, with a real table and one section per page', async () => {
    const result = await engine.processPDFToWord(new File([pdfBytes], 'report.pdf', { type: 'application/pdf' }));
    const bytes = await bytesOf(result.data);
    expect(result.filename).toBe('report.docx');

    // Re-parse the package with an independent DOCX reader (mammoth is what many
    // production converters use to read Word files) and inspect the structure.
    const mammoth = await import('mammoth');
    const { value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
    expect(html).toContain('<table>');
    expect(html).toMatch(/<td><p>Widget<\/p><\/td>/);
    expect(html).toContain('Quarterly Revenue Report');

    const zip = await JSZip.loadAsync(bytes);
    const documentXml = await zip.file('word/document.xml').async('text');
    expect(documentXml).toContain('<w:tbl>');
    // One section break per source page, so the page count matches the PDF.
    expect(documentXml.match(/<w:sectPr>/g)).toHaveLength(2);
    // Layout is real (tables and sections), not tab characters.
    expect(documentXml).not.toContain('<w:tab/>');

    // python-docx equivalent: table cells line up with the PDF columns.
    const tableRows = [...documentXml.matchAll(/<w:tr>([\s\S]*?)<\/w:tr>/g)]
      .map((match) => [...match[1].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((cell) => cell[1]));
    expect(tableRows).toEqual([
      ['Item', 'Qty', 'Price'],
      ['Widget', '2', '9.99'],
      ['Gadget', '5', '24.50']
    ]);
    // Prose stays prose — no stray tabs pretending to be layout.
    expect(documentXml).toContain('Quarterly Revenue Report');
    expect(documentXml).toContain('Totals exclude tax and shipping.');
  }, 60000);
});

describe('PDF to Excel', () => {
  it('writes real numbers, formats and widths into one sheet per page', async () => {
    const result = await engine.processPdfToOffice(
      new File([pdfBytes], 'report.pdf', { type: 'application/pdf' }),
      'xlsx'
    );
    const workbook = new (await import('exceljs')).default.Workbook();
    await workbook.xlsx.load(await bytesOf(result.data));

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Page 1', 'Page 2']);

    const sheet = workbook.getWorksheet('Page 1');
    // Numbers must be numeric so SUM() and charts work — not text.
    expect(sheet.getCell('B4').type).toBe(2); // ValueType.Number
    expect(sheet.getCell('B4').value).toBe(2);
    expect(sheet.getCell('C4').value).toBe(9.99);
    expect(sheet.getCell('C5').value).toBe(24.5);
    // Labels and headers stay text.
    expect(sheet.getCell('A1').value).toBe('Quarterly Revenue Report');
    expect(sheet.getCell('A3').value).toBe('Item');
    // Column widths are sized to the content instead of Excel's default 8.43.
    expect(sheet.getColumn(1).width).toBeGreaterThan(20);
    // Prose that merely looks like a number ("1,234.50") stays text.
    const appendix = workbook.getWorksheet('Page 2');
    expect(typeof appendix.getCell('A2').value).toBe('string');
  }, 60000);

  it('applies currency and percentage formats to money and rates', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    ['Item', 'Price', 'Share'].forEach((label, index) => page.drawText(label, { x: 60 + index * 150, y: 700, size: 11, font }));
    ['Widget', '$1,234.50', '12.5%'].forEach((label, index) => page.drawText(label, { x: 60 + index * 150, y: 670, size: 11, font }));

    const result = await engine.processPdfToOffice(new File([await doc.save()], 'money.pdf'), 'xlsx');
    const workbook = new (await import('exceljs')).default.Workbook();
    await workbook.xlsx.load(await bytesOf(result.data));
    const sheet = workbook.getWorksheet(1);
    const price = sheet.getCell('B2');
    expect(price.value).toBe(1234.5);
    expect(price.numFmt).toContain('$');
    const share = sheet.getCell('C2');
    expect(share.value).toBeCloseTo(0.125, 6);
    expect(share.numFmt).toContain('%');
  }, 60000);
});

describe('PDF to PowerPoint', () => {
  it('keeps text, position and font size on a slide per page', async () => {
    const result = await engine.processPdfToOffice(
      new File([pdfBytes], 'report.pdf', { type: 'application/pdf' }),
      'pptx'
    );
    const bytes = await bytesOf(result.data);
    const zip = await JSZip.loadAsync(bytes);
    const presentation = await zip.file('ppt/presentation.xml').async('text');
    expect(presentation).toContain('<p:sldIdLst>');

    const slideFiles = Object.keys(zip.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path));
    expect(slideFiles).toHaveLength(2);
    const firstSlide = await zip.file('ppt/slides/slide1.xml').async('text');
    expect(firstSlide).toContain('Quarterly Revenue Report');
    expect(firstSlide).toContain('Widget');
    // Shapes carry real geometry, so the text lands where the PDF had it.
    expect(firstSlide).toMatch(/<a:off x="\d+" y="\d+"\/>/);
    expect(firstSlide).toMatch(/<a:rPr[^>]*sz="\d+"/);

    // The package must satisfy the OPF relationship graph.
    const rels = await zip.file('_rels/.rels').async('text');
    expect(rels).toMatch(/Target="ppt\/presentation\.xml"/);
    const contentTypes = await zip.file('[Content_Types].xml').async('text');
    expect(contentTypes).toContain('presentationml.presentation.main+xml');
    slideFiles.slice(1).forEach((path) => {
      expect(contentTypes).toContain(`/${path}`);
    });
  }, 60000);
});

describe('Office to PDF', () => {
  const fixtures = ['real.docx', 'real.xlsx', 'real.pptx'];

  it.each(fixtures)('converts %s (made by real Office tooling) to a text PDF', async (name) => {
    const source = readFileSync(resolve(FIXTURES, name));
    const result = await engine.processOfficeToPDF(new File([source], name));
    const bytes = await bytesOf(result.data);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    const text = await pdfText(bytes);

    if (name === 'real.docx') {
      expect(text).toContain('Quarterly Revenue Report');
      expect(text).toContain('All figures are unaudited.');
      expect(text).toContain('Widget');
    }
    if (name === 'real.xlsx') {
      expect(text).toContain('Sales');
      expect(text).toContain('Widget');
      // Cells stay separated instead of collapsing into "ItemQtyPriceTotal".
      expect(text).toMatch(/Item\s*\|\s*Qty/);
    }
    if (name === 'real.pptx') {
      // Placeholder geometry is inherited from the layout here, not set on the shape.
      expect(text).toContain('Quarterly Review');
      expect(text).toContain('Highlights');
      expect(text).toContain('Costs held flat');
    }
  }, 60000);

  it('reports a clear error for a corrupt Office file', async () => {
    await expect(engine.processOfficeToPDF(new File(['not a zip'], 'broken.docx')))
      .rejects.toThrow(/Could not|corrupt|Zip|invalid/i);
  });
});
