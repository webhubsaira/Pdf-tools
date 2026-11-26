/**
 * UI wiring audit for every tool.
 *
 * For each tool in the registry this opens the studio the way a visitor does and
 * checks that the modal is actually usable: a labelled upload area (or the
 * no-file variant for Create PDF), the right accept filter, the right
 * multiple/single choice, a settings panel where one is offered, and an enabled
 * action button whose label is tool specific.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOOLS } from '../js/tools.js';
import { loadResult, makePdf, makeFile } from './setup.js';

const markup = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8');
const bodyHtml = markup.slice(markup.indexOf('<body>') + 6, markup.lastIndexOf('</body>'));

/** Document-level listeners registered by the app, tracked so tests stay isolated. */
const listeners = [];

async function boot() {
  for (const [type, handler, options] of listeners.splice(0)) {
    document.removeEventListener(type, handler, options);
  }
  document.body.innerHTML = bodyHtml;
  vi.resetModules();
  const originalAdd = document.addEventListener.bind(document);
  document.addEventListener = /** @type {any} */ ((type, handler, options) => {
    listeners.push([type, handler, options]);
    originalAdd(type, handler, options);
  });
  const main = await import('../js/main.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  document.addEventListener = originalAdd;
  return main;
}

/**
 * A fixture the tool will accept. Image and Office tools get bytes with the right
 * extension; the engine is not run here, only the UI wiring is checked.
 * @param {import('../js/tools.js').Tool} tool
 */
async function fixtureFor(tool) {
  if (tool.accept === '.pdf') return makeFile(await makePdf({ pages: 3 }), 'sample.pdf');
  if (tool.accept.includes('.jpg')) return makeFile(new Uint8Array([0xff, 0xd8, 0xff]), 'sample.jpg', 'image/jpeg');
  if (tool.accept.includes('.png')) return makeFile(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'sample.png', 'image/png');
  if (tool.accept.includes('.html')) return makeFile(new TextEncoder().encode('<p>hi</p>'), 'sample.html', 'text/html');
  if (tool.accept.includes('.docx')) return makeFile(new Uint8Array([0x50, 0x4b]), 'sample.docx');
  if (tool.accept.includes('.xlsx')) return makeFile(new Uint8Array([0x50, 0x4b]), 'sample.xlsx');
  if (tool.accept.includes('.pptx')) return makeFile(new Uint8Array([0x50, 0x4b]), 'sample.pptx');
  return makeFile(new Uint8Array([0x50, 0x4b]), 'sample.bin');
}

/** How many files this tool needs before it will run. */
function requiredCount(tool) {
  if (tool.workflow === 'merge') return 2;
  if (tool.workflow === 'compare') return 2;
  return 1;
}

/** Settings panels that are explicitly not needed for a tool. */
const NO_SETTINGS = [
  'merge', 'compare', 'flatten', 'repair', 'ocr', 'pdf-to-zip',
  'pdf-to-text', 'pdf-to-word', 'pdf-to-images', 'pdf-to-office',
  'html-to-pdf', 'office-to-pdf'
];
/** Settings built from preset cards rather than form controls. */
const PRESET_SETTINGS = ['rotate', 'compress'];

beforeEach(() => {
  document.documentElement.className = '';
  window.history.replaceState({}, '', '/');
});

describe.each(TOOLS.map((tool) => [tool.id, tool]))('%s', (id, tool) => {
  it('opens a usable studio', async () => {
    await boot();
    if (tool.workflow === 'create-pdf') {
      window.DocuFlowApp.openToolStudio(/** @type {string} */ (id));
    } else {
      const files = await Promise.all(
        Array.from({ length: requiredCount(tool) }, () => fixtureFor(tool))
      );
      window.DocuFlowApp.openToolStudio(/** @type {string} */ (id), files);
    }

    const overlay = document.getElementById('tool-modal-overlay');
    expect(overlay?.classList.contains('open')).toBe(true);
    expect(document.documentElement.classList.contains('modal-open')).toBe(true);

    // Header shows this tool, not a generic title.
    const title = document.getElementById('tool-modal-title')?.textContent || '';
    expect(title.length).toBeGreaterThan(3);

    const execute = /** @type {HTMLButtonElement|null} */ (document.getElementById('modal-execute-btn'));
    expect(execute, 'action button').toBeTruthy();
    expect(execute?.disabled).toBe(false);
    expect((execute?.textContent || '').trim().length).toBeGreaterThan(3);

    if (tool.workflow === 'create-pdf') {
      // No file upload at all; the settings are visible up front.
      expect(document.getElementById('modal-file-input')).toBeNull();
      const settings = document.getElementById('modal-tool-settings');
      expect(settings?.style.display).not.toBe('none');
      expect(document.getElementById('setting-blank-count')).toBeTruthy();
      expect(document.getElementById('setting-blank-size')).toBeTruthy();
      return;
    }

    // Upload area with the tool's accept filter and multiple flag.
    const input = /** @type {HTMLInputElement|null} */ (document.getElementById('modal-file-input'));
    expect(input, 'file input').toBeTruthy();
    expect(input?.getAttribute('accept')).toBe(tool.accept);
    expect(input?.hasAttribute('multiple')).toBe(Boolean(tool.multiple));

    // Upload zone is keyboard reachable.
    const zone = document.getElementById('modal-upload-zone');
    expect(zone?.getAttribute('tabindex')).toBe('0');
    expect(zone?.getAttribute('role')).toBe('region');

    // With files loaded the queue, action bar and (where relevant) settings show.
    expect(document.getElementById('modal-file-queue')?.style.display).not.toBe('none');
    expect(document.getElementById('modal-action-bar')?.style.display).not.toBe('none');
    const settings = document.getElementById('modal-tool-settings');
    if (NO_SETTINGS.includes(tool.workflow)) {
      expect(settings?.style.display).toBe('none');
    } else {
      expect(settings?.style.display).not.toBe('none');
      if (PRESET_SETTINGS.includes(tool.workflow)) {
        expect(settings?.querySelectorAll('.preset-card').length).toBeGreaterThan(0);
      } else {
        expect(settings?.querySelectorAll('input, select').length).toBeGreaterThan(0);
      }
    }
  });

  it('warns instead of running with no file selected', async () => {
    if (tool.workflow === 'create-pdf') return;
    await boot();
    window.DocuFlowApp.openToolStudio(/** @type {string} */ (id));
    const execute = /** @type {HTMLButtonElement} */ (document.getElementById('modal-execute-btn'));
    execute.click();

    const alertEl = document.getElementById('modal-alert');
    expect(alertEl?.classList.contains('visible')).toBe(true);
    expect((alertEl?.textContent || '').length).toBeGreaterThan(10);
  });
});

describe('studio behaviour shared by all tools', () => {
  it('every tool opens, and closing returns to the page', async () => {
    await boot();
    for (const tool of TOOLS) {
      window.DocuFlowApp.openToolStudio(tool.id);
      expect(document.getElementById('tool-modal-overlay')?.classList.contains('open')).toBe(true);
      window.DocuFlowApp.closeToolStudio();
      expect(document.getElementById('tool-modal-overlay')?.classList.contains('open')).toBe(false);
    }
  });

  it('labels every action button uniquely enough to be useful', async () => {
    await boot();
    const labels = new Map();
    for (const tool of TOOLS) {
      window.DocuFlowApp.openToolStudio(tool.id);
      const label = (document.getElementById('modal-execute-btn')?.textContent || '').trim().replace(/\s+/g, ' ');
      labels.set(tool.id, label);
      window.DocuFlowApp.closeToolStudio();
    }
    for (const [id, label] of labels) {
      expect(label, `${id} has no action label`).not.toBe('');
      expect(label.toLowerCase(), `${id} is a generic label`).not.toBe('process');
    }
    // Distinct workflows must not all collapse onto one button label.
    expect(new Set(labels.values()).size).toBeGreaterThanOrEqual(20);
  });

  it('exposes the documented settings for the tools that need them', async () => {
    await boot();
    const expectations = /** @type {Record<string, string[]>} */ ({
      'split-pdf': ['setting-page-range'],
      'extract-pages': ['setting-page-range'],
      'remove-pages': ['setting-page-range'],
      'organize-pdf': ['setting-page-order'],
      'rotate-pdf': ['.preset-card[data-angle]'],
      'compress-pdf': ['.preset-card[data-compress]'],
      'watermark-pdf': ['setting-watermark-text', 'setting-watermark-size', 'setting-watermark-opacity', 'setting-watermark-angle', 'setting-watermark-color'],
      'page-numbers': ['setting-page-pos', 'setting-page-fmt', 'setting-page-start'],
      'jpg-to-pdf': ['setting-img-orient', 'setting-img-size', 'setting-img-margin'],
      'png-to-pdf': ['setting-img-orient', 'setting-img-size', 'setting-img-margin'],
      'sign-pdf': ['setting-signature-name'],
      'crop-pdf': ['setting-crop-margin'],
      'unlock-pdf': ['setting-pdf-password'],
      'protect-pdf': ['setting-pdf-password'],
      'pdf-metadata': ['setting-meta-title', 'setting-meta-author', 'setting-meta-subj', 'setting-meta-keywords'],
      'create-pdf': ['setting-blank-size', 'setting-blank-count']
    });
    for (const [id, selectors] of Object.entries(expectations)) {
      const tool = TOOLS.find((entry) => entry.id === id);
      const files = tool && tool.workflow !== 'create-pdf' ? [await fixtureFor(tool)] : [];
      window.DocuFlowApp.openToolStudio(id, files);
      for (const selector of selectors) {
        const found = selector.startsWith('.')
          ? document.querySelectorAll(selector).length
          : document.getElementById(selector);
        expect(Boolean(found), `${id} is missing ${selector}`).toBe(true);
      }
      window.DocuFlowApp.closeToolStudio();
    }
  });
});

describe('end-to-end: click, process, download', () => {
  /** Capture downloads instead of navigating. */
  function interceptDownloads() {
    const downloads = [];
    URL.createObjectURL = /** @type {any} */ (() => 'blob:mock');
    URL.revokeObjectURL = /** @type {any} */ (() => {});
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = /** @type {any} */ (function click() {
      if (this.download) downloads.push({ name: this.download, href: this.href });
    });
    return { downloads, restore: () => { HTMLAnchorElement.prototype.click = originalClick; } };
  }

  /** Tools whose engine path runs fully in jsdom (no canvas/iframe needed). */
  const RUNNABLE = [
    ['merge-pdf', 2],
    ['split-pdf', 1],
    ['remove-pages', 1],
    ['rotate-pdf', 1],
    ['watermark-pdf', 1],
    ['page-numbers', 1],
    ['sign-pdf', 1],
    ['crop-pdf', 1],
    ['flatten-pdf', 1],
    ['pdf-metadata', 1],
    ['pdf-to-zip', 2]
  ];

  it.each(RUNNABLE)('%s processes and offers a download', async (id, fileCount) => {
    await boot();
    const { downloads, restore } = interceptDownloads();
    try {
      const PDFDocument = (await import('pdf-lib')).PDFDocument;
      const doc = await PDFDocument.create();
      for (let index = 0; index < 3; index += 1) doc.addPage([400, 500]);
      const bytes = new Uint8Array(await doc.save());
      const files = Array.from({ length: fileCount }, (_, index) =>
        new File([bytes], `doc-${index + 1}.pdf`, { type: 'application/pdf' })
      );

      window.DocuFlowApp.openToolStudio(id, files);
      // Sign needs a typed name before it will run.
      const signatureField = /** @type {HTMLInputElement|null} */ (document.getElementById('setting-signature-name'));
      if (signatureField) signatureField.value = 'Ada Lovelace';
      const execute = /** @type {HTMLButtonElement} */ (document.getElementById('modal-execute-btn'));
      execute.click();

      // Wait for the async pipeline to settle into the success view.
      await vi.waitFor(() => {
        const success = document.getElementById('modal-success-box');
        if (!success?.classList.contains('visible')) throw new Error('not done yet');
      }, { timeout: 5000 });

      expect(document.getElementById('modal-processing-box')?.classList.contains('visible')).toBe(false);
      const stats = document.getElementById('modal-result-stats')?.textContent || '';
      expect(stats.length).toBeGreaterThan(5);
      expect(execute.disabled).toBe(false);

      const downloadBtn = /** @type {HTMLButtonElement} */ (document.getElementById('modal-download-btn'));
      downloadBtn.click();
      expect(downloads).toHaveLength(1);
      expect(downloads[0].name).toMatch(/\.(pdf|zip|txt|docx)$/);
    } finally {
      restore();
    }
  }, 15000);

  it('refuses to sign without a typed name and explains why', async () => {
    await boot();
    const PDFDocument = (await import('pdf-lib')).PDFDocument;
    const doc = await PDFDocument.create();
    doc.addPage();
    const bytes = new Uint8Array(await doc.save());
    window.DocuFlowApp.openToolStudio('sign-pdf', [new File([bytes], 'doc.pdf', { type: 'application/pdf' })]);

    /** @type {HTMLButtonElement} */ (document.getElementById('modal-execute-btn')).click();
    await vi.waitFor(() => {
      const alertEl = document.getElementById('modal-alert');
      if (!alertEl?.classList.contains('visible')) throw new Error('no alert yet');
    }, { timeout: 5000 });
    expect(document.getElementById('modal-alert')?.textContent).toMatch(/signature/i);
  }, 15000);

  it('reports a friendly error when a corrupt file is chosen for a tool', async () => {
    await boot();
    window.DocuFlowApp.openToolStudio('rotate-pdf', [
      new File([new Uint8Array([1, 2, 3, 4])], 'broken.pdf', { type: 'application/pdf' })
    ]);
    /** @type {HTMLButtonElement} */ (document.getElementById('modal-execute-btn')).click();

    await vi.waitFor(() => {
      const alertEl = document.getElementById('modal-alert');
      if (!alertEl?.classList.contains('visible')) throw new Error('no alert yet');
    }, { timeout: 5000 });

    const message = document.getElementById('modal-alert')?.textContent || '';
    expect(message.length).toBeGreaterThan(10);
    // The studio must return to a retryable state, not a dead spinner.
    expect(document.getElementById('modal-processing-box')?.classList.contains('visible')).toBe(false);
    expect(document.getElementById('modal-execute-btn')?.hasAttribute('disabled')).toBe(false);
  }, 15000);
});
