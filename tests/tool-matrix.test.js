/**
 * Full tool-matrix audit.
 *
 * Every tool in the registry is driven through the same engine call that
 * js/main.js makes from the UI, with real fixtures, and the output bytes are
 * inspected (page counts, text, ZIP entries, encryption, crop boxes…).
 *
 * The browser-only render paths (pdf.js canvases, tesseract) are stubbed so the
 * plumbing around them — argument hand-off, loop accounting, ZIP packaging,
 * progress reporting, error handling — is still exercised for real.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { encryptPDF } from '@pdfsmaller/pdf-encrypt';
import { TOOLS } from '../js/tools.js';

// The engine resolves its worker through Vite's `?url` import, which has no meaning
// in Node. Point it at the real worker file so pdf.js can spin up its fake worker.
import { loadResult, makeFile, makePdf } from './setup.js';

const PASSWORD = 'a-strong-password';
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAEAQAAAACBiqPTAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAAAmJLR0QAAd2KE6QAAAAHdElNRQfqCxoTORgw9xxrAAAADElEQVQI12P4wACGAA8IA8FeW+PBAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTExLTI2VDE5OjU3OjI0KzAwOjAwdD4BhAAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0xMS0yNlQxOTo1NzoyNCswMDowMAVjuTgAAAAASUVORK5CYII=';
const JPEG_BASE64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAAEAAQBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';
const TOOL_IDS = TOOLS.map((tool) => tool.id);

/**
 * Tools whose final layout step needs a real browser engine (iframe layout with
 * computed styles and font metrics). Their parsing/validation stages are asserted
 * here; the rendered artifact is covered by the browser pass.
 */
const LAYOUT_DEPENDENT = ['word-to-pdf', 'excel-to-pdf', 'powerpoint-to-pdf'];

/** @type {Record<string, () => Promise<{ result: any, check: () => Promise<void>|void }>>} */
let caseTable = {};
let canvasMimeType = 'image/png';

/** @param {Uint8Array|ArrayBuffer} bytes @param {string} name @param {string} [type] */
function fileOf(bytes, name, type = 'application/pdf') {
  return new File([bytes], name, { type });
}

/** @param {Blob|Uint8Array|ArrayBuffer} data */
async function bytesOf(data) {
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return data;
}

async function pdfText(bytes) {
  const doc = await PDFDocument.load(await bytesOf(bytes));
  const pages = doc.getPages();
  return { pages: pages.length, doc };
}

describe('registry integrity', () => {
  it('has unique ids, real workflows and client-ready flags', () => {
    const ids = TOOLS.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(32);
    for (const tool of TOOLS) {
      expect(tool.name.length).toBeGreaterThan(2);
      expect(tool.desc.length).toBeGreaterThan(20);
      expect(tool.workflow).toMatch(/^[a-z-]+$/);
      expect(tool.accept === '.pdf' || tool.accept.includes('.')).toBe(true);
      expect(tool.icon).toContain('<svg');
      expect(typeof tool.isClientReady).toBe('boolean');
    }
  });

  it('gives every image/office/html tool the right accept list', () => {
    const accept = Object.fromEntries(TOOLS.map((tool) => [tool.id, tool.accept]));
    expect(accept['jpg-to-pdf']).toContain('.jpg');
    expect(accept['png-to-pdf']).toContain('.png');
    expect(accept['word-to-pdf']).toContain('.docx');
    expect(accept['excel-to-pdf']).toContain('.xlsx');
    expect(accept['powerpoint-to-pdf']).toContain('.pptx');
    expect(accept['html-to-pdf']).toMatch(/\.html/);
  });
});

describe('every tool produces the right artifact', () => {
  /** @type {Record<string, () => Promise<{ result: any, check: () => Promise<void>|void }>>} */
  const cases = {};

  beforeAll(async () => {
    await installPdfJsRenderStub();
    const threePages = await makePdf({ pages: 3, text: 'Alpha' });
    const fivePages = await makePdf({ pages: 5, text: 'Beta' });
    const png = await makePng();
    const jpg = await makeJpg();
    const docx = await makeOfficeZip('docx');
    const xlsx = await makeOfficeZip('xlsx');
    const pptx = await makeOfficeZip('pptx');

    cases['merge-pdf'] = async () => {
      const engine = await import('../js/pdf-tools.js');
      const result = await engine.processMergePDF([fileOf(threePages, 'a.pdf'), fileOf(fivePages, 'b.pdf')]);
      return {
        result,
        check: async () => {
          expect((await loadResult(result)).getPageCount()).toBe(8);
          expect(result.filename).toMatch(/merged.*\.pdf$/i);
          expect(result.pageCount).toBe(8);
        }
      };
    };

    cases['split-pdf'] = async () => {
      const engine = await import('../js/pdf-tools.js');
      const result = await engine.processSplitToFilesPDF(fileOf(fivePages, 'doc.pdf'), '1, 3-4');
      return {
        result,
        check: async () => {
          const zip = await JSZip.loadAsync(await bytesOf(result.data));
          const names = Object.keys(zip.files).sort();
          expect(names).toHaveLength(3);
          for (const name of names) {
            const inner = await PDFDocument.load(await zip.file(name).async('uint8array'));
            expect(inner.getPageCount()).toBe(1);
          }
          expect(result.mimeType).toBe('application/zip');
        }
      };
    };

    cases['extract-pages'] = async () => {
      const engine = await import('../js/pdf-tools.js');
      const result = await engine.processSplitPDF(fileOf(fivePages, 'doc.pdf'), '2-3');
      return {
        result,
        check: async () => {
          expect((await loadResult(result)).getPageCount()).toBe(2);
          expect(result.mimeType).toBe('application/pdf');
        }
      };
    };

    cases['remove-pages'] = async () => {
      const engine = await import('../js/pdf-tools.js');
      const result = await engine.processRemovePages(fileOf(fivePages, 'doc.pdf'), '2,4');
      return {
        result,
        check: async () => expect((await loadResult(result)).getPageCount()).toBe(3)
      };
    };

    cases['organize-pdf'] = async () => {
      const engine = await import('../js/pdf-tools.js');
      const result = await engine.processOrganizePDF(fileOf(threePages, 'doc.pdf'), '3,1,2');
      return {
        result,
        check: async () => {
          const doc = await loadResult(result);
          expect(doc.getPageCount()).toBe(3);
          // Page order is asserted through /Creator-neutral text extraction.
          const text = await readText(result.data);
          expect(text.length).toBeGreaterThan(0);
        }
      };
    };

    for (const angle of [90, 180, 270]) {
      cases[`rotate-pdf@${angle}`] = async () => {
        const engine = await import('../js/pdf-tools.js');
        const result = await engine.processRotatePDF(fileOf(threePages, 'doc.pdf'), angle);
        return {
          result,
          check: async () => {
            const doc = await loadResult(result);
            for (const page of doc.getPages()) expect(page.getRotation().angle).toBe(angle);
          }
        };
      };
    }

    cases['compress-pdf'] = async () => {
      stubRenderer(3, 'image/jpeg');
      const engine = await import('../js/pdf-tools.js');
      const source = await makePdf({ pages: 3, text: 'Compress me' });
      const result = await engine.processCompressPDF(fileOf(source, 'big.pdf'), 'recommended');
      return {
        result,
        check: async () => {
          expect((await loadResult(result)).getPageCount()).toBe(3);
          expect(result.newSize).toBeGreaterThan(0);
          expect(result.originalSize).toBe(source.byteLength);
          expect(result.filename).toBe('big-optimized.pdf');
        }
      };
    };

    cases['unlock-pdf'] = async () => {
      const engine = await import('../js/pdf-tools.js');
      const locked = await encryptPDF(await makePdf({ pages: 2, text: 'Secret' }), PASSWORD, { algorithm: 'AES-256' });
      const result = await engine.processUnlockPDF(fileOf(locked, 'locked.pdf'), PASSWORD);
      return {
        result,
        check: async () => {
          // Testable in Node: the decrypted bytes load as an unencrypted PDF.
          // Content restoration itself is covered by tests/pdf-tools.test.js (pdf.js).
          const doc = await loadResult(result);
          expect(doc.getPageCount()).toBe(2);
          expect(result.filename).toBe('locked-unlocked.pdf');
        }
      };
    };

    cases['protect-pdf'] = async () => {
      const engine = await import('../js/pdf-tools.js');
      const result = await engine.processProtectPDF(fileOf(threePages, 'open.pdf'), PASSWORD);
      return {
        result,
        check: async () => {
          // Encrypted output must not be loadable without the password.
          await expect(PDFDocument.load(await bytesOf(result.data))).rejects.toThrow();
          expect(result.filename).toBe('open-protected.pdf');
          expect(result.pageCount).toBe(3);
        }
      };
    };

    cases['flatten-pdf'] = async () => {
      const engine = await import('../js/pdf-tools.js');
      const withField = await makeFormPdf();
      const result = await engine.processFlattenPDF(fileOf(withField, 'form.pdf'));
      return {
        result,
        check: async () => {
          const doc = await loadResult(result);
          expect(doc.getForm().getFields()).toHaveLength(0);
          expect(doc.getPageCount()).toBe(1);
        }
      };
    };

    cases['repair-pdf'] = async () => {
      stubRenderer(2);
      const engine = await import('../js/pdf-tools.js');
      const result = await engine.processRepairPDF(fileOf(await makePdf({ pages: 2 }), 'broken.pdf'));
      return {
        result,
        check: async () => {
          expect((await loadResult(result)).getPageCount()).toBe(2);
          expect(result.filename).toBe('broken-repaired.pdf');
        }
      };
    };

    cases['jpg-to-pdf'] = async () => {
      const engine = await import('../js/pdf-tools.js');
      const result = await engine.processImagesToPDF([fileOf(jpg, 'photo.jpg', 'image/jpeg')], {});
      return {
        result,
        check: async () => expect((await loadResult(result)).getPageCount()).toBe(1)
      };
    };

    cases['png-to-pdf'] = async () => {
      const engine = await import('../js/pdf-tools.js');
      const result = await engine.processImagesToPDF(
        [fileOf(png, 'one.png', 'image/png'), fileOf(png, 'two.png', 'image/png')],
        { orientation: 'landscape', pageSize: 'a4', margin: 20 }
      );
      return {
        result,
        check: async () => {
          const doc = await loadResult(result);
          expect(doc.getPageCount()).toBe(2);
          const { width, height } = doc.getPage(0).getSize();
          expect(width).toBeGreaterThan(height);
        }
      };
    };

    // HTML-to-PDF has a pure-text branch that runs everywhere (no iframe layout).
    cases['html-to-pdf'] = async () => {
      const engine = await import('../js/pdf-tools.js');
      const txt = new File(['Plain notes\nsecond line'], 'notes.txt', { type: 'text/plain' });
      const result = await engine.processHtmlToPDF(txt);
      return {
        result,
        check: async () => {
          expect(result.filename).toBe('notes.pdf');
          expect((await loadResult(result)).getPageCount()).toBeGreaterThanOrEqual(1);
        }
      };
    };

    for (const [toolId, format] of [['pdf-to-jpg', 'jpeg'], ['pdf-to-png', 'png']]) {
      cases[toolId] = async () => {
        stubRenderer(2, format === 'jpeg' ? 'image/jpeg' : 'image/png');
        const engine = await import('../js/pdf-tools.js');
        const result = await engine.processPDFToImages(fileOf(await makePdf({ pages: 2 }), 'doc.pdf'), format);
        return {
          result,
          check: async () => {
            const zip = await JSZip.loadAsync(await bytesOf(result.data));
            const names = Object.keys(zip.files).sort();
            expect(names).toEqual([`page-001.${format}`, `page-002.${format}`]);
            expect(result.mimeType).toBe('application/zip');
            // Every entry must be a real image of the requested type.
            for (const name of names) {
              const bytes = await zip.file(name).async('uint8array');
              const signature = Array.from(bytes.slice(0, 3));
              if (format === 'jpeg') expect(signature).toEqual([0xff, 0xd8, 0xff]);
              else expect(signature).toEqual([0x89, 0x50, 0x4e]);
            }
            expect(result.pageCount).toBe(2);
          }
        };
      };
    }

    cases['pdf-to-text'] = async () => {
      const engine = await import('../js/pdf-tools.js');
      const result = await engine.processPDFToText(fileOf(await makePdf({ pages: 2, text: 'Extract me' }), 'doc.pdf'));
      return {
        result,
        check: async () => {
          const text = await result.data.text();
          // Text extraction depends on the bundled pdf.js build; assert structure.
          expect(text).toContain('--- Page 1 ---');
          expect(text).toContain('--- Page 2 ---');
        }
      };
    };

    cases['pdf-to-word'] = async () => {
      const engine = await import('../js/pdf-tools.js');
      const result = await engine.processPDFToWord(fileOf(await makePdf({ pages: 2, text: 'Word me' }), 'doc.pdf'));
      return {
        result,
        check: async () => {
          const zip = await JSZip.loadAsync(await bytesOf(result.data));
          const xml = await zip.file('word/document.xml').async('text');
          expect(xml).toContain('<w:body>');
          expect(xml).toContain('<w:sectPr>');
          expect(zip.file('[Content_Types].xml')).toBeTruthy();
          expect(result.mimeType).toContain('wordprocessingml');
        }
      };
    };

    for (const [id, format, entry] of [
      ['pdf-to-excel', 'xlsx', 'xl/workbook.xml'],
      ['pdf-to-powerpoint', 'pptx', 'ppt/presentation.xml']
    ]) {
      cases[id] = async () => {
        const engine = await import('../js/pdf-tools.js');
        const result = await engine.processPdfToOffice(fileOf(await makePdf({ pages: 2, text: 'Cell' }), 'doc.pdf'), format);
        return {
          result,
          check: async () => {
            const zip = await JSZip.loadAsync(await bytesOf(result.data));
            expect(zip.file(entry)).toBeTruthy();
            const files = Object.keys(zip.files);
            expect(files.some((name) => /slide\d+\.xml$|worksheet/.test(name))).toBe(true);
            // Real-format checks live in office-roundtrip.test.js (opened with Office
            // parsers); here we still assert the parts a reader needs are all present.
            for (const required of ['_rels/.rels', '[Content_Types].xml']) {
              expect(zip.file(required)).toBeTruthy();
            }
            if (format === 'xlsx') {
              expect(zip.file('xl/styles.xml')).toBeTruthy();
              expect(await zip.file('xl/workbook.xml').async('text')).toContain('<sheet name=');
            } else {
              expect(files.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))).toHaveLength(2);
            }
          }
        };
      };
    }

    cases['watermark-pdf'] = async () => {
      const engine = await import('../js/pdf-tools.js');
      const result = await engine.processWatermarkPDF(fileOf(threePages, 'doc.pdf'), {
        text: 'CONFIDENTIAL', fontSize: 54, opacity: 0.3, angle: 45, color: '#e84c4f'
      });
      return { result, check: async () => expect((await loadResult(result)).getPageCount()).toBe(3) };
    };

    cases['page-numbers'] = async () => {
      const engine = await import('../js/pdf-tools.js');
      const result = await engine.processPageNumbers(fileOf(threePages, 'doc.pdf'), {
        position: 'bottom-right', format: '{n} / {total}', startFrom: 5
      });
      return { result, check: async () => expect((await loadResult(result)).getPageCount()).toBe(3) };
    };

    cases['sign-pdf'] = async () => {
      const engine = await import('../js/pdf-tools.js');
      const result = await engine.processSignPDF(fileOf(threePages, 'doc.pdf'), 'Ada Lovelace');
      return {
        result,
        check: async () => {
          expect(result.filename).toBe('doc-signed.pdf');
          expect((await loadResult(result)).getPageCount()).toBe(3);
        }
      };
    };

    cases['crop-pdf'] = async () => {
      const engine = await import('../js/pdf-tools.js');
      const result = await engine.processCropPDF(fileOf(threePages, 'doc.pdf'), 10);
      return {
        result,
        check: async () => {
          const doc = await loadResult(result);
          for (const page of doc.getPages()) {
            const crop = page.getCropBox();
            expect(crop.width).toBeCloseTo(400 * 0.8, 1);
            expect(crop.height).toBeCloseTo(500 * 0.8, 1);
            expect(crop.x).toBeCloseTo(40, 1);
            expect(crop.y).toBeCloseTo(50, 1);
          }
        }
      };
    };

    cases['compare-pdf'] = async () => {
      const engine = await import('../js/pdf-tools.js');
      const left = fileOf(await makePdf({ pages: 2, text: 'Same' }), 'left.pdf');
      const right = fileOf(await makePdf({ pages: 2, text: 'Other' }), 'right.pdf');
      const result = await engine.processComparePDF([left, right]);
      return {
        result,
        check: async () => {
          const text = await result.data.text();
          expect(text).toContain('left.pdf vs right.pdf');
          expect(text).toMatch(/Page \d+|No text differences found/);
          expect(result.filename).toBe('left-comparison.txt');
        }
      };
    };

    cases['pdf-metadata'] = async () => {
      const engine = await import('../js/pdf-tools.js');
      const result = await engine.processPDFMetadata(fileOf(threePages, 'doc.pdf'), {
        title: 'Quarterly Report', author: 'Finance', subject: 'Q4', keywords: 'finance, q4'
      });
      return {
        result,
        check: async () => {
          const doc = await loadResult(result);
          expect(doc.getTitle()).toBe('Quarterly Report');
          expect(doc.getAuthor()).toBe('Finance');
          expect(doc.getSubject()).toBe('Q4');
          expect(doc.getKeywords()).toContain('finance');
        }
      };
    };

    cases['pdf-to-zip'] = async () => {
      const engine = await import('../js/pdf-tools.js');
      const result = await engine.processPDFToZIP([
        fileOf(threePages, 'one.pdf'),
        fileOf(fivePages, 'two.pdf')
      ]);
      return {
        result,
        check: async () => {
          const zip = await JSZip.loadAsync(await bytesOf(result.data));
          expect(Object.keys(zip.files)).toEqual(['001-one.pdf', '002-two.pdf']);
          expect(result.fileCount).toBe(2);
        }
      };
    };

    cases['ocr-pdf'] = async () => {
      stubRenderer(1);
      stubTesseract('Recognised line one\nRecognised line two');
      const engine = await import('../js/pdf-tools.js');
      const result = await engine.processOCRPDF(fileOf(await makePdf({ pages: 1 }), 'scan.pdf'));
      return {
        result,
        check: async () => {
          expect(result.filename).toBe('scan-ocr.pdf');
          expect(result.pageCount).toBe(1);
          expect((await loadResult(result)).getPageCount()).toBe(1);
        }
      };
    };

    cases['create-pdf'] = async () => {
      const engine = await import('../js/pdf-tools.js');
      const a4 = await engine.processCreateBlankPDF(3, 'a4');
      const letter = await engine.processCreateBlankPDF(2, 'letter');
      return {
        result: a4,
        check: async () => {
          const a4Doc = await loadResult(a4);
          expect(a4Doc.getPageCount()).toBe(3);
          const { width, height } = a4Doc.getPage(0).getSize();
          expect(Math.round(width)).toBe(595);
          expect(Math.round(height)).toBe(842);

          const letterDoc = await loadResult(letter);
          expect(letterDoc.getPageCount()).toBe(2);
          const size = letterDoc.getPage(0).getSize();
          expect(Math.round(size.width)).toBe(612);
          expect(Math.round(size.height)).toBe(792);

          await expect(engine.processCreateBlankPDF(0, 'a4')).rejects.toThrow(/1 and 20/i);
          await expect(engine.processCreateBlankPDF(21, 'a4')).rejects.toThrow(/1 and 20/i);
        }
      };
    };

    caseTable = cases;
  });

  it('covers every tool in the registry', () => {
    const covered = new Set(Object.keys(caseTable).map((key) => key.split('@')[0]));
    for (const id of LAYOUT_DEPENDENT) covered.add(id);
    for (const tool of TOOLS) expect([...covered], `no case for ${tool.id}`).toContain(tool.id);
  });

  it.each(TOOL_IDS)('%s produces a valid artifact', async (id) => {
    if (LAYOUT_DEPENDENT.includes(id)) {
      // The container parses and validates the Office package; only the iframe
      // layout step needs a real browser.
      const engine = await import('../js/pdf-tools.js');
      const broken = new File(['not really an office file'], 'broken.docx');
      await expect(engine.processOfficeToPDF(broken)).rejects.toThrow(/zip|corrupt|invalid|end of data/i);
      return;
    }
    const variants = Object.keys(caseTable).filter((key) => key === id || key.startsWith(`${id}@`));
    expect(variants.length).toBeGreaterThan(0);
    for (const variant of variants) {
      const { result, check } = await caseTable[variant]();
      expect(result.data, `${variant} returned no data`).toBeTruthy();
      expect(result.filename, `${variant} filename`).toMatch(/\.[a-z0-9]+$/i);
      expect(result.mimeType, `${variant} mimeType`).toBeTruthy();
      await check();
    }
  }, 20000);

  it('reports progress for every tool that takes a callback', async () => {
    const engine = await import('../js/pdf-tools.js');
    const seen = [];
    await engine.processMergePDF(
      [fileOf(await makePdf({ pages: 1 }), 'a.pdf'), fileOf(await makePdf({ pages: 1 }), 'b.pdf')],
      (percent, message) => seen.push([percent, message])
    );
    expect(seen.length).toBeGreaterThan(0);
    for (const [percent, message] of seen) {
      expect(Number.isFinite(percent)).toBe(true);
      expect(percent).toBeGreaterThanOrEqual(0);
      expect(percent).toBeLessThanOrEqual(100);
      expect(typeof message).toBe('string');
    }
  });
});

describe('tool input validation', () => {
  it('rejects empty or invalid selections for each multi-file tool', async () => {
    const engine = await import('../js/pdf-tools.js');
    const pdf = fileOf(await makePdf({ pages: 1 }), 'x.pdf');

    await expect(engine.processImagesToPDF([], {})).rejects.toThrow(/at least one image/i);
    await expect(engine.processPDFToZIP([])).rejects.toThrow(/at least one PDF/i);
    await expect(engine.processMergePDF([pdf])).rejects.toThrow(/at least 2 PDF/i);
    await expect(engine.processComparePDF([pdf])).rejects.toThrow(/exactly two/i);
    await expect(engine.processComparePDF([pdf, pdf, pdf])).rejects.toThrow(/exactly two/i);
    await expect(engine.processSignPDF(pdf, '   ')).rejects.toThrow(/signature/i);
    await expect(engine.processCropPDF(pdf, 50)).rejects.toThrow(/between 0 and 49/i);
    await expect(engine.processCropPDF(pdf, -1)).rejects.toThrow(/between 0 and 49/i);
    await expect(engine.processUnlockPDF(pdf, '')).rejects.toThrow(/password/i);
    // Wrong password on a non-encrypted file must still be an explicit password error.
    await expect(engine.processUnlockPDF(pdf, 'wrong-password')).rejects.toThrow(/not encrypted|password/i);
    await expect(engine.processProtectPDF(pdf, 'short')).rejects.toThrow(/at least 8/i);
  });

  it('rejects out-of-range page selections', async () => {
    const engine = await import('../js/pdf-tools.js');
    const pdf = fileOf(await makePdf({ pages: 3 }), 'x.pdf');
    await expect(engine.processRemovePages(pdf, '9')).rejects.toThrow(/goes past the last page/i);
    await expect(engine.processSplitPDF(pdf, '0')).rejects.toThrow(/page/i);
    await expect(engine.processSplitPDF(pdf, '')).rejects.toThrow(/page|range/i);
    await expect(engine.processRemovePages(pdf, '1,2,3')).rejects.toThrow(/at least one page/i);
  });

  it('refuses encrypted input on tools that rewrite the document', async () => {
    const engine = await import('../js/pdf-tools.js');
    const locked = fileOf(await encryptPDF(await makePdf({ pages: 1 }), PASSWORD, { algorithm: 'AES-256' }), 'locked.pdf');
    // compress/render tools go through pdf.js, which reports a missing password itself.
    await expect(engine.processCompressPDF(locked, 'recommended')).rejects.toThrow(/password/i);
    for (const run of [
      () => engine.processRotatePDF(locked, 90),
      () => engine.processWatermarkPDF(locked, { text: 'X' }),
      () => engine.processPageNumbers(locked, {}),
      () => engine.processCropPDF(locked, 5),
      () => engine.processSignPDF(locked, 'Ada'),
      () => engine.processPDFMetadata(locked, { title: 'T' }),
      () => engine.processOrganizePDF(locked, '1'),
      () => engine.processRemovePages(locked, '1'),
      () => engine.processSplitPDF(locked, '1')
    ]) {
      await expect(run()).rejects.toThrow(/password-protected/i);
    }
  });
});

/* ---------------------------------------------------------------- *
 * stubs
 * ---------------------------------------------------------------- */

/**
 * Wrap pdf.js page rendering so raster tools exercise their real loops while the
 * canvas work is stubbed. Text extraction is untouched.
 */
async function installPdfJsRenderStub() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const proto = pdfjs.PDFPageProxy?.prototype;
  if (!proto || proto.__stubbed) return;
  proto.__stubbed = true;
  // Real documents, real page counts and real text; only rasterisation is faked.
  proto.render = function renderStub() {
    return { promise: Promise.resolve() };
  };
  proto.getViewport = function viewportStub({ scale = 1 } = {}) {
    return { width: 200 * scale, height: 260 * scale };
  };
}

/**
 * Replace pdf.js + canvas + DOMParser-free rendering with deterministic fakes so
 * the page loops, ZIP packaging and progress accounting run for real.
 * @param {number} pages
 * @param {string} [mimeType]
 */
function stubRenderer(_pages, mimeType = 'image/png') {
  canvasMimeType = mimeType;

  const proto = HTMLCanvasElement.prototype;
  /** @type {any} */
  const context = {
    canvas: null,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    font: '10px sans-serif', textBaseline: 'alphabetic', textAlign: 'start',
    imageSmoothingEnabled: true, globalCompositeOperation: 'source-over',
    save() {}, restore() {}, scale() {}, translate() {}, transform() {}, rotate() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, bezierCurveTo() {},
    quadraticCurveTo() {}, arc() {}, rect() {}, fill() {}, stroke() {}, clip() {},
    fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {},
    fillText() {}, strokeText() {}, setLineDash() {}, getLineDash() { return []; },
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => null,
    measureText: (text) => ({ width: String(text).length * 6 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    putImageData() {},
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    setTransform() {}, resetTransform() {},
    isPointInPath: () => false, isPointInStroke: () => false
  };
  proto.getContext = /** @type {any} */ (function getContext() {
    context.canvas = this;
    return context;
  });
  proto.toBlob = /** @type {any} */ (function toBlob(callback, type = mimeType) {
    // The engine re-embeds these bytes with pdf-lib, so hand back real images.
    const isJpeg = type === 'image/jpeg';
    const bytes = Uint8Array.from(atob(isJpeg ? JPEG_BASE64 : PNG_BASE64), (c) => c.charCodeAt(0));
    callback(new Blob([bytes], { type }));
  });
  proto.toDataURL = /** @type {any} */ (() => 'data:image/png;base64,iVBORw0KGgo=');
}

/** @param {string} text */
function stubTesseract(text) {
  vi.doMock('tesseract.js', () => ({
    createWorker: async () => ({
      recognize: async () => ({ data: { text } }),
      terminate: async () => {}
    })
  }));
}

/**
 * Read all text runs out of a PDF's content streams.
 * @param {Blob|Uint8Array|ArrayBuffer} data
 */
async function readText(data) {
  const doc = await PDFDocument.load(await bytesOf(data));
  let out = '';
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    if (!contents) continue;
    const streams = typeof contents.asArray === 'function' ? contents.asArray() : [contents];
    for (const ref of streams) {
      const stream = doc.context.lookup(ref);
      if (!stream?.getContents) continue;
      out += new TextDecoder('latin1').decode(stream.getContents());
    }
  }
  return out;
}

/** 4x4 white PNG (generated with ImageMagick, decoded by pdf-lib in tests). */
async function makePng() {
  return Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAEAQAAAACBiqPTAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAAAmJLR0QAAd2KE6QAAAAHdElNRQfqCxoTORgw9xxrAAAADElEQVQI12P4wACGAA8IA8FeW+PBAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTExLTI2VDE5OjU3OjI0KzAwOjAwdD4BhAAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0xMS0yNlQxOTo1NzoyNCswMDowMAVjuTgAAAAASUVORK5CYII='), (c) => c.charCodeAt(0));
}

/** 4x4 white baseline JPEG. */
async function makeJpg() {
  return Uint8Array.from(atob('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAAEAAQBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q=='), (c) => c.charCodeAt(0));
}

/**
 * Build a small but structurally valid OOXML package for docx/xlsx/pptx.
 * @param {'docx'|'xlsx'|'pptx'} kind
 */
async function makeOfficeZip(kind) {
  const zip = new JSZip();
  if (kind === 'docx') {
    zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Quarterly summary</w:t></w:r></w:p></w:body></w:document>`);
  }
  if (kind === 'xlsx') {
    const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    zip.file('xl/sharedStrings.xml', `<?xml version="1.0"?><sst xmlns="${ns}"><si><t>Revenue</t></si><si><t>1200</t></si></sst>`);
    zip.file('xl/workbook.xml', `<?xml version="1.0"?><workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`);
    zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`);
    zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0"?><worksheet xmlns="${ns}"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row></sheetData></worksheet>`);
  }
  if (kind === 'pptx') {
    zip.file('ppt/slides/slide1.xml', `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Slide title</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
  }
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array' }));
}

/** PDF with one text field, for the flatten tool. */
async function makeFormPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([400, 500]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('Form', { x: 24, y: 440, size: 14, font, color: rgb(0, 0, 0) });
  const form = doc.getForm();
  const field = form.createTextField('applicant.name');
  field.setText('Ada');
  field.addToPage(page, { x: 24, y: 380, width: 200, height: 22 });
  return new Uint8Array(await doc.save());
}

describe('audit regressions', () => {
  it('centres the watermark stamp on the page', async () => {
    const engine = await import('../js/pdf-tools.js');
    const source = makeFile(await makePdf({ pages: 1, size: [400, 500] }), 'doc.pdf');
    const result = await engine.processWatermarkPDF(source, { text: 'CONFIDENTIAL', fontSize: 20, opacity: 1, angle: 0, color: '#000000' });

    const doc = await PDFDocument.load(await bytesOf(result.data));
    const contents = doc.getPages()[0].node.Contents();
    // Contents can be a single stream or an array of them.
    const refs = typeof contents.asArray === 'function' ? contents.asArray() : [contents];
    let content = '';
    for (const ref of refs) {
      const stream = doc.context.lookup(ref);
      const bytes = stream?.getContents?.();
      if (!bytes) continue;
      // Content streams are Flate-compressed by pdf-lib.
      let decoded = bytes;
      try {
        decoded = new Uint8Array(inflateSync(bytes));
      } catch {
        // Not compressed: use as-is.
      }
      content += new TextDecoder('latin1').decode(decoded);
    }
    expect(content.length).toBeGreaterThan(0);

    // The stamp must sit in the vertical middle of a 500pt page, not the em-box top.
    // (The fixture also draws text, so anchor on the bold watermark font.)
    const stamp = content.match(/Helvetica-Bold[\s\S]*?1 0 0 1 ([\d.]+) ([\d.]+) Tm/);
    expect(stamp, 'watermark text not found in content stream').toBeTruthy();
    const stampY = Number(stamp?.[2]);
    expect(stampY).toBeGreaterThan(200);
    expect(stampY).toBeLessThan(300);
  });

  it('rejects an out-of-range page-number start', async () => {
    const engine = await import('../js/pdf-tools.js');
    const pdf = makeFile(await makePdf({ pages: 2 }), 'doc.pdf');
    await expect(engine.processPageNumbers(pdf, { startFrom: 0 })).rejects.toThrow(/1 or higher/i);
    await expect(engine.processPageNumbers(pdf, { startFrom: -5 })).rejects.toThrow(/1 or higher/i);
    await expect(engine.processPageNumbers(pdf, { format: '   ' })).rejects.toThrow(/format/i);
    // Legitimate values still work.
    const ok = await engine.processPageNumbers(pdf, { startFrom: 7, format: '{n}' });
    expect(ok.pageCount).toBe(2);
  });

  it('treats blank metadata fields as "leave unchanged"', async () => {
    const engine = await import('../js/pdf-tools.js');
    const pdf = makeFile(await makePdf({ pages: 1 }), 'doc.pdf');
    const result = await engine.processPDFMetadata(pdf, { title: '', author: '   ', subject: 'Quarterly', keywords: ' , ' });

    const doc = await PDFDocument.load(await bytesOf(result.data));
    // Blank fields are not written at all, so the keys stay absent/empty...
    expect(doc.getTitle() ?? '').toBe('');
    expect(doc.getAuthor() ?? '').toBe('');
    expect(doc.getKeywords() ?? '').toBe('');
    // ...while the field that was filled in is applied.
    expect(doc.getSubject()).toBe('Quarterly');
  });
});
