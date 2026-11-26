/**
 * pdf.js 6 uses a handful of very new JavaScript APIs. Older browsers (and Node) lack
 * them, and the failure mode was silent: text extraction returned nothing, so every
 * PDF → Word/Excel/PowerPoint conversion said "No selectable text was found".
 *
 * These tests simulate such an engine by deleting the APIs before the shim loads.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

// The engine resolves its worker through a Vite `?url` import; point it at the file.

const API = {
  promiseTry: () => Promise.try,
  toHex: () => Uint8Array.prototype.toHex,
  toBase64: () => Uint8Array.prototype.toBase64,
  fromBase64: () => Uint8Array.fromBase64,
  fromHex: () => Uint8Array.fromHex
};

/** @type {{ key: string, value: any }[]} */
let saved = [];

function removeModernApis() {
  saved = Object.entries(API).map(([key, get]) => ({ key, value: get() }));
  delete (/** @type {any} */ (Promise)).try;
  delete (/** @type {any} */ (Uint8Array)).fromBase64;
  delete (/** @type {any} */ (Uint8Array)).fromHex;
  delete (/** @type {any} */ (Uint8Array.prototype)).toHex;
  delete (/** @type {any} */ (Uint8Array.prototype)).toBase64;
}

function restoreModernApis() {
  saved.forEach(({ key, value }) => {
    if (value === undefined) return;
    if (key === 'promiseTry') Object.defineProperty(Promise, 'try', { configurable: true, writable: true, value });
    else if (key === 'fromBase64') Object.defineProperty(Uint8Array, 'fromBase64', { configurable: true, writable: true, value });
    else if (key === 'fromHex') Object.defineProperty(Uint8Array, 'fromHex', { configurable: true, writable: true, value });
    else if (key === 'toHex') Object.defineProperty(Uint8Array.prototype, 'toHex', { configurable: true, writable: true, value });
    else Object.defineProperty(Uint8Array.prototype, 'toBase64', { configurable: true, writable: true, value });
  });
}

afterEach(() => {
  restoreModernApis();
  vi.resetModules();
});

describe('runtime compatibility shims', () => {
  it('detects an engine that is missing the APIs pdf.js needs', async () => {
    removeModernApis();
    vi.resetModules();
    const { needsRuntimeCompat } = await import('../js/runtime-compat.js');
    // The shim installs the APIs before reporting, so nothing is missing afterwards.
    expect(typeof Promise.try).toBe('function');
    expect(typeof Uint8Array.fromBase64).toBe('function');
    expect(typeof Uint8Array.prototype.toHex).toBe('function');
    expect(needsRuntimeCompat).toBe(false);
  });

  it('implements Promise.try with promise semantics', async () => {
    removeModernApis();
    vi.resetModules();
    await import('../js/runtime-compat.js');
    await expect(Promise.try(() => 'value')).resolves.toBe('value');
    await expect(Promise.try(() => { throw new Error('nope'); })).rejects.toThrow('nope');
    // Arguments are forwarded, as the spec requires.
    await expect(Promise.try((a, b) => a + b, 2, 3)).resolves.toBe(5);
  });

  it('implements the base64 and hex helpers byte-for-byte', async () => {
    removeModernApis();
    vi.resetModules();
    await import('../js/runtime-compat.js');

    expect(Uint8Array.from([0xde, 0xad, 0xbe, 0xef]).toHex()).toBe('deadbeef');
    expect([...Uint8Array.fromHex('deadbeef')]).toEqual([0xde, 0xad, 0xbe, 0xef]);
    expect(Uint8Array.from([0]).toHex()).toBe('00');

    // Compare against a known-good implementation for awkward lengths (padding cases).
    for (const length of [0, 1, 2, 3, 4, 5, 257]) {
      const bytes = Uint8Array.from({ length }, (_, index) => (index * 37 + 11) % 256);
      const expected = Buffer.from(bytes).toString('base64');
      expect(bytes.toBase64()).toBe(expected);
      expect([...Uint8Array.fromBase64(expected)]).toEqual([...bytes]);
    }
    expect([...Uint8Array.fromBase64('')]).toEqual([]);
    expect([...Uint8Array.fromHex('')]).toEqual([]);
  });

  it('is a no-op on engines that already provide the APIs', async () => {
    vi.resetModules();
    const original = Uint8Array.prototype.toHex;
    const { needsRuntimeCompat } = await import('../js/runtime-compat.js');
    expect(needsRuntimeCompat).toBe(false);
    expect(Uint8Array.prototype.toHex).toBe(original);
  });
});

describe('pdf.js text extraction without the modern APIs', () => {
  it('still finds text, so PDF to Office keeps working', async () => {
    removeModernApis();
    vi.resetModules();
    // Fresh module graph: pdf-tools imports runtime-compat before pdfjs-dist.
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([400, 400]).drawText('Hello compat', { x: 40, y: 300, size: 18, font });
    const bytes = await doc.save();

    const engine = await import('../js/pdf-tools.js');
    const result = await engine.processPDFToText(new File([bytes], 'compat.pdf'));
    expect(await result.data.text()).toContain('Hello compat');
  }, 60000);
});
