/**
 * UI behaviour tests: hero file routing, filter ARIA state, and the tool dialog's
 * focus handling. These run against the real markup from index.html in jsdom.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const markup = readFileSync(resolve(import.meta.dirname, '../index.html'), 'utf8');
const bodyHtml = markup.slice(markup.indexOf('<body>') + 6, markup.lastIndexOf('</body>'));

/** @param {File[]} files @param {string} [name] */
function fileList(files, name = 'files') {
  const list = /** @type {any} */ (files);
  Object.defineProperty(list, 'item', { value: (index) => files[index] });
  void name;
  return list;
}

/** Document-level listeners registered by the app, tracked so tests stay isolated. */
const listeners = [];

/**
 * Boot the app against a fresh DOM.
 * @returns {Promise<typeof import('../js/main.js')>}
 */
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

function pdfFile(name) {
  return new File([new Uint8Array(4)], name, { type: 'application/pdf' });
}

function imageFile(name, type) {
  return new File([new Uint8Array(4)], name, { type });
}

beforeEach(() => {
  document.documentElement.className = '';
  window.history.replaceState({}, '', '/');
});

describe('tool directory', () => {
  it('renders every tool card', async () => {
    await boot();
    const cards = document.querySelectorAll('#tools-grid .tool-card');
    expect(cards.length).toBeGreaterThan(20);
  });

  it('filters by search query', async () => {
    await boot();
    const input = /** @type {HTMLInputElement} */ (document.getElementById('tools-search'));
    input.value = 'watermark';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const cards = Array.from(document.querySelectorAll('#tools-grid .tool-card'));
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((card) => /watermark/i.test(card.textContent || ''))).toBe(true);
  });

  it('keeps aria-selected in sync with the active category filter', async () => {
    await boot();
    const organizeBtn = /** @type {HTMLElement} */ (document.querySelector('.filter-btn[data-category="organize"]'));
    organizeBtn.click();

    expect(organizeBtn.getAttribute('aria-selected')).toBe('true');
    expect(organizeBtn.classList.contains('active')).toBe(true);
    for (const other of document.querySelectorAll('.filter-btn')) {
      if (other !== organizeBtn) expect(other.getAttribute('aria-selected')).toBe('false');
    }
  });
});

describe('hero uploader', () => {
  /** @param {File[]} files */
  function chooseInHero(files) {
    const input = /** @type {HTMLInputElement} */ (document.getElementById('hero-file-input'));
    Object.defineProperty(input, 'files', { value: fileList(files), writable: true, configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function openToolTitle() {
    return document.getElementById('tool-modal-title')?.textContent;
  }

  function modalOpen() {
    return document.getElementById('tool-modal-overlay')?.classList.contains('open');
  }

  it('routes a single PDF to a non-destructive tool', async () => {
    await boot();
    chooseInHero([pdfFile('report.pdf')]);
    expect(modalOpen()).toBe(true);
    expect(openToolTitle()).toBe('Page Numbers');
  });

  it('routes several PDFs to Merge', async () => {
    await boot();
    chooseInHero([pdfFile('a.pdf'), pdfFile('b.pdf')]);
    expect(openToolTitle()).toBe('Merge PDF');
  });

  it('routes JPEGs to JPG to PDF instead of a PDF tool', async () => {
    await boot();
    chooseInHero([imageFile('a.jpg', 'image/jpeg')]);
    expect(openToolTitle()).toBe('JPG to PDF');
  });

  it('routes PNGs to PNG to PDF', async () => {
    await boot();
    chooseInHero([imageFile('a.png', 'image/png')]);
    expect(openToolTitle()).toBe('PNG to PDF');
  });

  it('warns instead of opening a tool that cannot read the file', async () => {
    await boot();
    chooseInHero([imageFile('scan.png', 'image/png'), pdfFile('report.pdf')]);
    const alert = document.getElementById('modal-alert');
    expect(alert?.textContent).toMatch(/Only the PDF files were kept/i);
    expect(openToolTitle()).toBe('Merge PDF');
  });

  it('resets the input so the same file can be chosen twice', async () => {
    await boot();
    const input = /** @type {HTMLInputElement} */ (document.getElementById('hero-file-input'));
    Object.defineProperty(input, 'files', { value: fileList([pdfFile('report.pdf')]), configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(input.value).toBe('');
  });
});

describe('tool dialog', () => {
  it('moves focus into the dialog and restores it on close', async () => {
    await boot();
    const trigger = /** @type {HTMLElement} */ (document.querySelector('.tool-card'));
    trigger.focus();
    trigger.click();

    const overlay = /** @type {HTMLElement} */ (document.getElementById('tool-modal-overlay'));
    expect(overlay.classList.contains('open')).toBe(true);
    expect(document.documentElement.classList.contains('modal-open')).toBe(true);
    expect(overlay.contains(document.activeElement)).toBe(true);

    (/** @type {HTMLElement} */ (document.getElementById('modal-close-btn'))).click();
    expect(overlay.classList.contains('open')).toBe(false);
    expect(document.documentElement.classList.contains('modal-open')).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('wraps Tab from the last control back to the first', async () => {
    await boot();
    /** @type {HTMLElement} */ (document.querySelector('.tool-card')).click();
    const dialog = /** @type {HTMLElement} */ (document.querySelector('.tool-modal-dialog'));
    // With a file selected the action bar is visible, so its last button is focusable.
    const actionBar = /** @type {HTMLElement} */ (document.getElementById('modal-action-bar'));
    actionBar.style.display = 'flex';
    const last = /** @type {HTMLElement} */ (document.getElementById('modal-execute-btn'));
    last.focus();
    expect(document.activeElement).toBe(last);

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('modal-close-btn'));
  });

  it('wraps Shift+Tab from the first control to the last', async () => {
    await boot();
    /** @type {HTMLElement} */ (document.querySelector('.tool-card')).click();
    /** @type {HTMLElement} */ (document.getElementById('modal-action-bar')).style.display = 'flex';
    const first = /** @type {HTMLElement} */ (document.getElementById('modal-close-btn'));
    first.focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('modal-execute-btn'));
  });

  it('does not intercept Tab in the middle of the dialog', async () => {
    await boot();
    /** @type {HTMLElement} */ (document.querySelector('.tool-card')).click();
    /** @type {HTMLElement} */ (document.getElementById('modal-close-btn')).focus();

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('closes on Escape and round-trips the ?tool= URL parameter', async () => {
    await boot();
    /** @type {HTMLElement} */ (document.querySelector('.tool-card')).click();
    expect(new URL(window.location.href).searchParams.get('tool')).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('tool-modal-overlay')?.classList.contains('open')).toBe(false);
    expect(new URL(window.location.href).searchParams.get('tool')).toBeNull();
  });

  it('opens the tool named in the ?tool= query string', async () => {
    document.body.innerHTML = bodyHtml;
    vi.resetModules();
    window.history.replaceState({}, '', '/?tool=merge-pdf');
    await import('../js/main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(document.getElementById('tool-modal-title')?.textContent).toBe('Merge PDF');
    window.history.replaceState({}, '', '/');
  });
});

describe('tool settings', () => {
  async function openTool(id) {
    const main = await boot();
    main.openToolStudio(id);
    return main;
  }

  it('shows a dedicated subject and keywords field for metadata', async () => {
    await openTool('pdf-metadata');
    expect(document.getElementById('setting-meta-subj')).not.toBeNull();
    expect(document.getElementById('setting-meta-keywords')).not.toBeNull();
  });

  it('exposes watermark angle and colour controls', async () => {
    await openTool('watermark-pdf');
    expect(document.getElementById('setting-watermark-angle')).not.toBeNull();
    expect(document.getElementById('setting-watermark-color')).not.toBeNull();
  });

  it('exposes a page-number start value', async () => {
    await openTool('page-numbers');
    const start = /** @type {HTMLInputElement} */ (document.getElementById('setting-page-start'));
    expect(start.value).toBe('1');
  });

  it('labels Split PDF and Extract Pages differently', async () => {
    await openTool('split-pdf');
    expect(document.getElementById('modal-execute-btn')?.textContent).toMatch(/Split Into Separate PDFs/i);
    await openTool('extract-pages');
    expect(document.getElementById('modal-execute-btn')?.textContent).toMatch(/Extract Pages/i);
  });

  it('asks for two files before comparing', async () => {
    await openTool('compare-pdf');
    /** @type {HTMLElement} */ (document.getElementById('modal-execute-btn')).click();
    await Promise.resolve();
    expect(document.getElementById('modal-alert')?.textContent).toMatch(/at least one file/i);
  });
});
