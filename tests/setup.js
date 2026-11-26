/**
 * Shared test helpers: small PDF fixtures built with pdf-lib.
 *
 * Everything runs in Node; the browser-only paths (canvas, pdf.js rendering, iframes)
 * are exercised by hand and are covered indirectly through the pure helpers.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Build a PDF with one text line per page.
 * @param {{ pages?: number, text?: string, size?: [number, number] }} [options]
 * @returns {Promise<Uint8Array>}
 */
export async function makePdf({ pages = 3, text = 'Sample document', size = [400, 500] } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pages; index += 1) {
    const page = doc.addPage(size);
    page.drawText(`${text} page ${index + 1}`, { x: 24, y: size[1] - 80, size: 14, font, color: rgb(0, 0, 0) });
  }
  return new Uint8Array(await doc.save());
}

/**
 * Wrap bytes in a File the way the browser hands them to the engine.
 * @param {Uint8Array|ArrayBuffer|BlobPart} bytes
 * @param {string} name
 * @param {string} [type]
 * @returns {File}
 */
export function makeFile(bytes, name, type = 'application/pdf') {
  return new File([bytes], name, { type });
}

/**
 * Turn a tool result's `data` into a pdf-lib document.
 * @param {{ data: Uint8Array|ArrayBuffer|Blob|string }} result
 */
export async function loadResult(result) {
  const { PDFDocument } = await import('pdf-lib');
  const { data } = result;
  if (data instanceof Blob) return PDFDocument.load(new Uint8Array(await data.arrayBuffer()));
  if (typeof data === 'string') return PDFDocument.load(new Uint8Array(Buffer.from(data)));
  return PDFDocument.load(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
}
