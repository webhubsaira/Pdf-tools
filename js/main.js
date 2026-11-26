/**
 * pdfilove - Main Application Controller
 * Dynamic tool cards rendering, search & category filtering, and interactive Tool Studio modal
 */

import { initNavigation } from './navigation.js';
import { initScrollReveal } from './scroll-reveal.js';
import { TOOLS, CATEGORIES, filterTools, getToolById } from './tools.js';
import { formatBytes, validateFile, triggerDownload, cleanupObjectURLs } from './file-handler.js';
/**
 * The PDF engine (pdf-lib, JSZip, pdf.js…) is by far the heaviest part of the bundle.
 * Loading it on first use keeps the legal/marketing pages light.
 *
 * @returns {Promise<typeof import('./pdf-tools.js')>}
 */
/** @type {Promise<typeof import('./pdf-tools.js')>|null} */
let enginePromise = null;

/**
 * @returns {Promise<typeof import('./pdf-tools.js')>}
 */
function loadPdfEngine() {
  if (!enginePromise) enginePromise = import('./pdf-tools.js');
  return enginePromise;
}

/** @typedef {Awaited<ReturnType<typeof loadPdfEngine>>} PdfEngine */

/**
 * Inline handlers in index.html call these through the global object.
 * @typedef {Window & { DocuFlowApp: { openToolStudio: (toolId: string, files?: File[]) => void, closeToolStudio: () => void } }} AppWindow
 */

/** @type {AppWindow} */
const appWindow = /** @type {AppWindow} */ (/** @type {unknown} */ (window));

/**
 * @typedef {Object} ToolResult
 * @property {Blob|Uint8Array|ArrayBuffer|string} data
 * @property {string} filename
 * @property {string} mimeType
 * @property {number} [pageCount]
 * @property {number} [originalSize]
 * @property {number} [newSize]
 * @property {number} [reductionRatio]
 * @property {number} [fileCount]
 */

/**
 * @typedef {Object} AppState
 * @property {string} activeCategory
 * @property {string} searchQuery
 * @property {import('./tools.js').Tool|null} selectedTool
 * @property {File[]} selectedFiles
 * @property {ToolResult|null} processingResult
 * @property {HTMLElement|null} lastFocusedElement
 */

/** @type {AppState} */
const state = {
  activeCategory: 'all',
  searchQuery: '',
  selectedTool: null,
  selectedFiles: [],
  processingResult: null,
  lastFocusedElement: null
};

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initScrollReveal();
  initToolsGrid();
  initSearchAndFilters();
  initToolModal();
  initHeroActions();
  checkUrlParams();
});

/**
 * Render tool cards into the grid
 */
function initToolsGrid() {
  const gridContainer = document.getElementById('tools-grid');
  if (!gridContainer) return;

  renderTools();
}

function renderTools() {
  const gridContainer = document.getElementById('tools-grid');
  const emptyState = document.getElementById('empty-results');
  if (!gridContainer) return;

  const filtered = filterTools(state.searchQuery, state.activeCategory);
  const isHomeDirectory = Boolean(gridContainer.closest('.home-tools-directory'));
  const useHomeMarquee = isHomeDirectory && filtered.length > 4;
  gridContainer.classList.toggle('is-marquee', useHomeMarquee);

  if (filtered.length === 0) {
    gridContainer.innerHTML = '';
    if (emptyState) emptyState.classList.add('visible');
    return;
  }

  if (emptyState) emptyState.classList.remove('visible');

  const renderToolCard = (tool, isDuplicate = false) => `
      <article class="tool-card" data-reveal="scale" data-id="${tool.id}" data-cat="${tool.category}" role="button" tabindex="${isDuplicate ? '-1' : '0'}" aria-label="Open ${tool.name}"${isDuplicate ? ' aria-hidden="true"' : ''}>
        ${tool.badge ? `<span class="tool-badge badge-${tool.badge.toLowerCase()}">${tool.badge}</span>` : ''}
        <div class="tool-icon-wrap" aria-hidden="true">
          ${tool.icon}
        </div>
        <h3 class="tool-title">${tool.name}</h3>
        <p class="tool-desc">${tool.desc}</p>
        <div class="tool-card-footer">
          <span class="tool-tag">${tool.categoryName.replace(' PDF', '')}</span>
          <span class="tool-action-label">
            Open Tool
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
          </span>
        </div>
      </article>
  `;

  if (useHomeMarquee) {
    const toolsPerRow = 10;
    const toolRows = [];
    for (let index = 0; index < filtered.length; index += toolsPerRow) {
      const row = filtered.slice(index, index + toolsPerRow);
      if (filtered.length >= 4 && row.length < 4) {
        for (let position = row.length; position < 4; position += 1) {
          row.push(filtered[(index + position) % filtered.length]);
        }
      }
      toolRows.push(row);
    }

    gridContainer.innerHTML = toolRows.map((row, rowIndex) => `
      <div class="tools-marquee-row${rowIndex % 2 === 1 ? ' is-reversed' : ''}">
        <div class="tools-marquee-track">
          <div class="tools-marquee-group">${row.map(tool => renderToolCard(tool)).join('')}</div>
          <div class="tools-marquee-group" aria-hidden="true">${row.map(tool => renderToolCard(tool, true)).join('')}</div>
        </div>
      </div>
    `).join('');
  } else {
    gridContainer.innerHTML = filtered.map(tool => renderToolCard(tool)).join('');
  }

  // Cards are injected after boot, so ask the reveal observer to pick them up.
  // On the home page the marquee tracks are transformed, which would make
  // getBoundingClientRect unreliable, so those cards are shown immediately instead.
  if (useHomeMarquee) {
    gridContainer.querySelectorAll('[data-reveal]').forEach(card => card.classList.add('is-visible'));
  } else {
    gridContainer.querySelectorAll('[data-reveal]').forEach((card, index) => {
      /** @type {HTMLElement} */ (card).style.setProperty('--reveal-delay', `${Math.min(index, 8) * 40}ms`);
    });
    document.dispatchEvent(new CustomEvent('pdfilove:reveal'));
  }

  // Attach click & enter key handlers to cards
  gridContainer.querySelectorAll('.tool-card').forEach(card => {
    const toolId = card.getAttribute('data-id');
    const openHandler = () => openToolStudio(toolId);

    card.addEventListener('click', openHandler);
    card.addEventListener('keydown', (e) => {
      const key = /** @type {KeyboardEvent} */ (e).key;
      if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        openHandler();
      }
    });
  });
}

/**
 * Live search and category filters
 */
function initSearchAndFilters() {
  const searchInput = /** @type {HTMLInputElement|null} */ (document.getElementById('tools-search'));
  const clearBtn = document.getElementById('search-clear');
  const filterButtons = document.querySelectorAll('.filter-btn');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = /** @type {HTMLInputElement} */ (e.target).value;
      if (clearBtn) {
        clearBtn.classList.toggle('visible', state.searchQuery.length > 0);
      }
      renderTools();
    });
  }

  if (clearBtn && searchInput) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      state.searchQuery = '';
      clearBtn.classList.remove('visible');
      searchInput.focus();
      renderTools();
    });
  }

  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      state.activeCategory = btn.getAttribute('data-category') || 'all';
      renderTools();
    });
  });
}

/**
 * Hero section actions
 */
function initHeroActions() {
  const exploreBtn = document.getElementById('hero-explore-btn');
  const chooseFileBtn = document.getElementById('hero-choose-file-btn');
  const heroFileInput = document.getElementById('hero-file-input');

  if (exploreBtn) {
    exploreBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById('tools-directory');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.location.href = 'tools.html';
      }
    });
  }

  if (chooseFileBtn && heroFileInput) {
    chooseFileBtn.addEventListener('click', () => {
      heroFileInput.click();
    });

    heroFileInput.addEventListener('change', (e) => {
      const input = /** @type {HTMLInputElement} */ (e.target);
      const files = Array.from(input.files || []);
      // Allow re-picking the same file later.
      input.value = '';
      if (files.length > 0) {
        const target = pickToolForFiles(files);
        openToolStudio(target.toolId, target.validFiles);
        if (target.notice) showModalAlert(target.notice, false);
      }
    });
  }
}

/**
 * Choose the tool that matches the files picked from the hero uploader.
 *
 * Images go straight to the image converters, PDFs to a non-destructive tool, and
 * unsupported files are reported instead of opening a tool that will reject them.
 *
 * @param {File[]} files
 * @returns {{ toolId: string, validFiles: File[], notice?: string }}
 */
function pickToolForFiles(files) {
  const images = files.filter((file) => file.type === 'image/png' || file.type === 'image/jpeg');
  const pdfs = files.filter((file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
  const unsupported = files.filter((file) => !images.includes(file) && !pdfs.includes(file));

  if (images.length && !pdfs.length && !unsupported.length) {
    const allPng = images.every((file) => file.type === 'image/png' || /\.png$/i.test(file.name));
    return { toolId: allPng ? 'png-to-pdf' : 'jpg-to-pdf', validFiles: images };
  }
  if (pdfs.length && !images.length && !unsupported.length) {
    return pdfs.length > 1
      ? { toolId: 'merge-pdf', validFiles: pdfs }
      : { toolId: 'page-numbers', validFiles: pdfs };
  }
  if (pdfs.length && !unsupported.length) {
    return {
      toolId: 'merge-pdf',
      validFiles: pdfs,
      notice: 'Only the PDF files were kept. Convert the images separately with JPG to PDF or PNG to PDF.'
    };
  }
  if (images.length && !unsupported.length) {
    return {
      toolId: 'jpg-to-pdf',
      validFiles: images,
      notice: 'Only the images were kept. Add PDFs with a PDF tool instead.'
    };
  }
  return {
    toolId: 'compress-pdf',
    validFiles: files.slice(0, 1),
    notice: 'That file type is not supported yet. Choose a PDF, JPG or PNG file.'
  };
}

/**
 * Check URL query param e.g. ?tool=merge-pdf
 */
function checkUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const toolParam = urlParams.get('tool');
  if (toolParam && getToolById(toolParam)) {
    openToolStudio(toolParam);
  }
}

/**
 * Interactive Tool Studio Modal & Controller
 */
function initToolModal() {
  const modalOverlay = document.getElementById('tool-modal-overlay');
  const modalClose = document.getElementById('modal-close-btn');

  if (modalClose && modalOverlay) {
    modalClose.addEventListener('click', closeToolStudio);
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeToolStudio();
    });
    document.addEventListener('keydown', (e) => {
      if (!modalOverlay.classList.contains('open')) return;
      const dialog = /** @type {HTMLElement|null} */ (modalOverlay.querySelector('.tool-modal-dialog'));
      if (!dialog) return;

      if (e.key === 'Escape') {
        closeToolStudio();
        return;
      }
      if (e.key !== 'Tab') return;

      // Focus trap: keep keyboard navigation inside the dialog.
      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const index = focusable.indexOf(/** @type {HTMLElement} */ (document.activeElement));
      const outsideDialog = index === -1 && document.activeElement !== dialog;

      if (e.shiftKey && (index <= 0 || outsideDialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (index === focusable.length - 1 || outsideDialog)) {
        e.preventDefault();
        first.focus();
      }
    });
  }
}

/**
 * Focusable elements inside the tool dialog, used for the focus trap.
 * @param {HTMLElement} container
 * @returns {HTMLElement[]}
 */
function getFocusableElements(container) {
  const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return /** @type {HTMLElement[]} */ (Array.from(container.querySelectorAll(selector)))
    .filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');
}

/**
 * Show a message in the tool dialog's alert banner.
 * @param {string} message
 * @param {boolean} [isError]
 */
function showModalAlert(message, isError = true) {
  const alertEl = document.getElementById('modal-alert');
  if (!alertEl) return;
  alertEl.className = `alert-banner ${isError ? 'alert-error' : 'alert-info'} visible`;
  alertEl.textContent = message;
}

export function openToolStudio(toolId, preloadedFiles = []) {
  const tool = getToolById(toolId);
  if (!tool) return;

  state.selectedTool = tool;
  state.selectedFiles = [...preloadedFiles];
  state.processingResult = null;
  state.lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const modalOverlay = document.getElementById('tool-modal-overlay');
  if (!modalOverlay) return;

  // Render header
  const titleEl = document.getElementById('tool-modal-title');
  const iconEl = document.getElementById('tool-modal-icon');
  const badgeEl = document.getElementById('tool-modal-badge');

  if (titleEl) titleEl.textContent = tool.name;
  if (iconEl) iconEl.innerHTML = tool.icon;
  if (badgeEl) badgeEl.textContent = tool.categoryName;

  renderToolBody(tool);
  modalOverlay.classList.add('open');
  modalOverlay.setAttribute('aria-hidden', 'false');
  document.documentElement.classList.add('modal-open');

  const dialog = /** @type {HTMLElement|null} */ (modalOverlay.querySelector('.tool-modal-dialog'));
  const initialFocus = (dialog && getFocusableElements(dialog)[0]) || dialog;
  if (initialFocus) initialFocus.focus({ preventScroll: true });

  // Keep page URLs shareable/deep-linkable for the open tool.
  const url = new URL(window.location.href);
  if (url.searchParams.get('tool') !== tool.id) {
    url.searchParams.set('tool', tool.id);
    window.history.replaceState({}, '', url);
  }
}

export function closeToolStudio() {
  const modalOverlay = document.getElementById('tool-modal-overlay');
  if (!modalOverlay) return;

  modalOverlay.classList.remove('open');
  modalOverlay.setAttribute('aria-hidden', 'true');
  document.documentElement.classList.remove('modal-open');
  state.selectedFiles = [];
  state.processingResult = null;
  cleanupObjectURLs();

  const url = new URL(window.location.href);
  if (url.searchParams.has('tool')) {
    url.searchParams.delete('tool');
    window.history.replaceState({}, '', url);
  }

  const returnTo = state.lastFocusedElement;
  state.lastFocusedElement = null;
  if (returnTo && document.contains(returnTo)) returnTo.focus({ preventScroll: true });
}

/**
 * Render tool configuration and upload UI
 */
function renderToolBody(tool) {
  const bodyEl = document.getElementById('tool-modal-body');
  if (!bodyEl) return;

  // Handle server-pipeline tools transparently
  if (!tool.isClientReady) {
    bodyEl.innerHTML = `
      <div style="text-align:center; padding: 32px 16px;">
        <div style="width: 56px; height: 56px; background-color: #FEFCBF; color: #B7791F; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 8px;">Cloud Pipeline Required</h3>
        <p style="color: var(--color-text-secondary); max-width: 540px; margin: 0 auto 20px; line-height: 1.6;">
          ${tool.serverRequiredNote || 'This conversion engine requires a dedicated server-side Office or OCR processing service.'}
        </p>
        <div style="background-color: var(--color-bg-secondary); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 18px; text-align: left; max-width: 560px; margin: 0 auto 24px; font-size: 0.875rem;">
          <strong>Deployment Architecture Note:</strong>
          <p style="margin-top: 6px; color: var(--color-text-secondary);">
            To preserve user privacy and maintain 100% serverless browser processing, pdfilove runs all PDF organizing, splitting, merging, watermarking, rotating, compression, and image conversion entirely on client-side WebAssembly and JS. For proprietary Office conversion, connect your Hostinger Node.js backend or LibreOffice microservice endpoint.
          </p>
        </div>
        <button class="btn btn-primary" onclick="window.DocuFlowApp.openToolStudio('merge-pdf')">Explore Client-Side Tools</button>
      </div>
    `;
    return;
  }

  bodyEl.innerHTML = `
    <div id="modal-alert" class="alert-banner"></div>

    <!-- Upload Zone -->
    ${tool.workflow === 'create-pdf' ? '<p class="form-hint">Creates a blank A4 PDF directly in your browser.</p>' : `<div class="upload-zone" id="modal-upload-zone" tabindex="0" role="region" aria-label="Upload files area">
      <input type="file" class="upload-file-input" id="modal-file-input" ${tool.multiple ? 'multiple' : ''} accept="${tool.accept}">
      <div class="upload-icon-circle" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      </div>
      <div class="upload-main-text">Click or drag & drop ${tool.multiple ? 'files' : 'your file'} here</div>
      <div class="upload-sub-text">Supported format: ${tool.accept} (Max 100 MB per file)</div>
      <button type="button" class="btn btn-secondary btn-sm" style="pointer-events: none;">Select from Computer</button>
    </div>`}

    <!-- Selected Files Queue -->
    <div class="file-queue" id="modal-file-queue" style="display: none;"></div>

    <!-- Tool Specific Settings Panel -->
    <div class="tool-settings-card" id="modal-tool-settings" style="display: ${tool.workflow === 'create-pdf' ? 'block' : 'none'};">
      ${getToolSpecificSettingsHTML(tool)}
    </div>

    <!-- Processing Progress State -->
    <div class="processing-box" id="modal-processing-box">
      <div class="processing-spinner"></div>
      <div class="processing-title" id="modal-progress-title">Processing your document...</div>
      <div class="processing-desc" id="modal-progress-desc">Applying browser-side transformations with zero server uploads...</div>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" id="modal-progress-fill"></div>
      </div>
    </div>

    <!-- Result / Download State -->
    <div class="success-box" id="modal-success-box">
      <div class="success-icon-wrap">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div class="success-title">Your document is ready!</div>
      <div class="success-desc">Completed securely right inside your browser. No files were uploaded to any server.</div>
      <div id="modal-result-stats"></div>
      <div class="success-actions">
        <button class="btn btn-primary btn-lg" id="modal-download-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download Document
        </button>
        <button class="btn btn-secondary" id="modal-restart-btn">Process Another File</button>
      </div>
    </div>

    <!-- Action Bar -->
    <div id="modal-action-bar" style="margin-top: 24px; display: ${tool.workflow === 'create-pdf' ? 'flex' : 'none'}; justify-content: flex-end; gap: 12px;">
      <button class="btn btn-secondary" id="modal-clear-btn">Clear</button>
      <button class="btn btn-primary" id="modal-execute-btn">
        ${getToolActionBtnLabel(tool)}
      </button>
    </div>
  `;

  bindModalEvents(tool);

  // If preloaded files exist, display them immediately
  if (state.selectedFiles.length > 0) {
    updateFilesQueue(tool);
  }
}

/**
 * @param {import('./tools.js').Tool} tool
 * @returns {string}
 */
function getToolActionBtnLabel(tool) {
  if (tool.workflow === 'split') {
    return tool.id === 'split-pdf' ? 'Split Into Separate PDFs' : 'Extract Pages';
  }
  switch (tool.workflow) {
    case 'merge': return 'Merge PDF Files';
    case 'split': return 'Split & Extract Pages';
    case 'remove-pages': return 'Remove Pages';
    case 'rotate': return 'Rotate PDF Document';
    case 'watermark': return 'Apply Watermark';
    case 'page-numbers': return 'Add Page Numbers';
    case 'images-to-pdf': return 'Convert Images to PDF';
    case 'compress': return 'Compress PDF Now';
    case 'flatten': return 'Flatten Document';
    case 'pdf-to-text': return 'Extract Text';
    case 'pdf-to-word': return 'Convert to Word';
    case 'pdf-to-images': return 'Export Page Images';
    case 'pdf-to-office': return 'Convert PDF';
    case 'office-to-pdf': return 'Convert to PDF';
    case 'html-to-pdf': return 'Convert to PDF';
    case 'organize': return 'Organize Pages';
    case 'unlock': return 'Remove Password';
    case 'protect': return 'Protect PDF';
    case 'repair': return 'Repair PDF';
    case 'sign': return 'Add Signature';
    case 'crop': return 'Crop PDF';
    case 'compare': return 'Compare PDFs';
    case 'ocr': return 'Recognize Text';
    case 'pdf-to-zip': return 'Create ZIP Archive';
    case 'metadata': return 'Update Document Metadata';
    case 'create-pdf': return 'Generate Blank PDF';
    default: return 'Process Document';
  }
}

function getToolSpecificSettingsHTML(tool) {
  switch (tool.workflow) {
    case 'split':
    case 'remove-pages':
      return `
        <div class="tool-settings-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" x2="8.12" y1="4" y2="9.88"/></svg>
          ${tool.workflow === 'split' ? (tool.id === 'split-pdf' ? 'Select Pages to Split Out' : 'Select Pages to Extract') : 'Select Pages to Delete'}
        </div>
        <div class="form-group">
          <label class="form-label" for="setting-page-range">Page Numbers or Ranges</label>
          <input type="text" class="form-control" id="setting-page-range" placeholder="e.g. 1-3, 5, 8-10" value="1">
          <div class="form-hint">${tool.id === 'split-pdf'
            ? 'Every selected page becomes its own PDF file, delivered together in a ZIP archive.'
            : 'Separate individual pages with commas or specify spans with hyphens.'}</div>
        </div>
      `;

    case 'rotate':
      return `
        <div class="tool-settings-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
          Choose Rotation Angle
        </div>
        <div class="preset-grid">
          <div class="preset-card active" data-angle="90">
            <span class="preset-title">90° Clockwise</span>
            <span class="preset-desc">Turn Right</span>
          </div>
          <div class="preset-card" data-angle="180">
            <span class="preset-title">180° Flip</span>
            <span class="preset-desc">Upside Down</span>
          </div>
          <div class="preset-card" data-angle="270">
            <span class="preset-title">90° Counter-Clockwise</span>
            <span class="preset-desc">Turn Left</span>
          </div>
        </div>
      `;

    case 'watermark':
      return `
        <div class="tool-settings-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
          Watermark Parameters
        </div>
        <div class="form-group">
          <label class="form-label" for="setting-watermark-text">Watermark Text</label>
          <input type="text" class="form-control" id="setting-watermark-text" value="CONFIDENTIAL" placeholder="e.g. DRAFT, CONFIDENTIAL, COPY">
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
          <div class="form-group">
            <label class="form-label" for="setting-watermark-size">Font Size</label>
            <select class="form-control" id="setting-watermark-size">
              <option value="36">Small (36pt)</option>
              <option value="54" selected>Medium (54pt)</option>
              <option value="72">Large (72pt)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="setting-watermark-opacity">Opacity</label>
            <select class="form-control" id="setting-watermark-opacity">
              <option value="0.15">Light (15%)</option>
              <option value="0.3" selected>Standard (30%)</option>
              <option value="0.6">Prominent (60%)</option>
            </select>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
          <div class="form-group">
            <label class="form-label" for="setting-watermark-angle">Angle</label>
            <select class="form-control" id="setting-watermark-angle">
              <option value="45" selected>Diagonal (45°)</option>
              <option value="0">Horizontal (0°)</option>
              <option value="90">Vertical (90°)</option>
              <option value="-45">Reverse diagonal (-45°)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="setting-watermark-color">Colour</label>
            <select class="form-control" id="setting-watermark-color">
              <option value="#e84c4f" selected>Coral</option>
              <option value="#9aa0a6">Grey</option>
              <option value="#1b1d22">Black</option>
              <option value="#2f6fed">Blue</option>
            </select>
          </div>
        </div>
      `;

    case 'page-numbers':
      return `
        <div class="tool-settings-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="16" cy="16" r="2"/></svg>
          Page Numbering Layout
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
          <div class="form-group">
            <label class="form-label" for="setting-page-pos">Position</label>
            <select class="form-control" id="setting-page-pos">
              <option value="bottom-center" selected>Bottom Center</option>
              <option value="bottom-left">Bottom Left</option>
              <option value="bottom-right">Bottom Right</option>
              <option value="top-center">Top Center</option>
              <option value="top-right">Top Right</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="setting-page-fmt">Format</label>
            <select class="form-control" id="setting-page-fmt">
              <option value="Page {n} of {total}" selected>Page {n} of {total}</option>
              <option value="{n} / {total}">{n} / {total}</option>
              <option value="{n}">{n}</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="setting-page-start">Start numbering at</label>
          <input type="number" class="form-control" id="setting-page-start" value="1" min="1" step="1" inputmode="numeric">
          <div class="form-hint">Use a value above 1 when this document continues from another file.</div>
        </div>
      `;

    case 'images-to-pdf':
      return `
        <div class="tool-settings-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>
          PDF Page Setup
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
          <div class="form-group">
            <label class="form-label" for="setting-img-orient">Orientation</label>
            <select class="form-control" id="setting-img-orient">
              <option value="portrait" selected>Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="setting-img-size">Page Size</label>
            <select class="form-control" id="setting-img-size">
              <option value="a4" selected>A4 Standard</option>
              <option value="fit">Fit to Image</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="setting-img-margin">Margin</label>
            <select class="form-control" id="setting-img-margin">
              <option value="0">No Margin</option>
              <option value="20" selected>Standard (20pt)</option>
              <option value="36">Wide (36pt)</option>
            </select>
          </div>
        </div>
      `;

    case 'compress':
      return `
        <div class="tool-settings-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 15 6 6"/></svg>
          Compression Level
        </div>
        <div class="preset-grid">
          <div class="preset-card active" data-compress="recommended">
            <span class="preset-title">Standard</span>
            <span class="preset-desc">150 DPI, balanced JPEG</span>
          </div>
          <div class="preset-card" data-compress="extreme">
            <span class="preset-title">Smaller file</span>
            <span class="preset-desc">100 DPI, lower JPEG quality</span>
          </div>
        </div>
        <div class="form-hint">Pages may be rasterized and text may no longer be selectable. The smaller of the rasterized and lossless outputs is used.</div>
      `;

    case 'metadata':
      return `
        <div class="tool-settings-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
          Document Metadata Headers
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
          <div class="form-group">
            <label class="form-label" for="setting-meta-title">Title</label>
            <input type="text" class="form-control" id="setting-meta-title" placeholder="Document Title">
          </div>
          <div class="form-group">
            <label class="form-label" for="setting-meta-author">Author</label>
            <input type="text" class="form-control" id="setting-meta-author" placeholder="Author / Organization">
          </div>
        </div>
        <div class="form-group" style="margin-top: 10px;">
          <label class="form-label" for="setting-meta-subj">Subject</label>
          <input type="text" class="form-control" id="setting-meta-subj" placeholder="One-line description of the document">
        </div>
        <div class="form-group" style="margin-top: 10px;">
          <label class="form-label" for="setting-meta-keywords">Keywords</label>
          <input type="text" class="form-control" id="setting-meta-keywords" placeholder="Comma separated keywords">
          <div class="form-hint">Leave a field empty to keep its current value.</div>
        </div>
      `;

    case 'organize':
      return `<div class="form-group">
        <label class="form-label" for="setting-page-order">New page order</label>
        <input type="text" class="form-control" id="setting-page-order" placeholder="Example: 3, 1, 2">
        <div class="form-hint">Enter pages in the order you want them, separated by commas.</div>
      </div>`;

    case 'sign':
      return `<div class="form-group">
        <label class="form-label" for="setting-signature-name">Typed signature</label>
        <input type="text" class="form-control" id="setting-signature-name" placeholder="Your full name" maxlength="120">
        <div class="form-hint">Adds a typed electronic signature and date to the final page. This is not a certificate-based digital signature.</div>
      </div>`;

    case 'crop':
      return `<div class="form-group">
        <label class="form-label" for="setting-crop-margin">Crop equally from each edge</label>
        <select class="form-control" id="setting-crop-margin">
          <option value="5">5%</option>
          <option value="10">10%</option>
          <option value="15">15%</option>
          <option value="20">20%</option>
        </select>
        <div class="form-hint">Applies the same crop to all pages.</div>
      </div>`;

    case 'unlock':
    case 'protect':
      return `<div class="form-group">
        <label class="form-label" for="setting-pdf-password">${tool.workflow === 'protect' ? 'Open password' : 'PDF password'}</label>
        <input type="password" class="form-control" id="setting-pdf-password" autocomplete="${tool.workflow === 'protect' ? 'new-password' : 'current-password'}" ${tool.workflow === 'protect' ? 'minlength="8"' : ''}>
        ${tool.workflow === 'protect' ? '<div class="form-hint">Use at least 8 characters. Passwords are processed locally and not saved.</div>' : ''}
      </div>`;

    case 'create-pdf':
      return `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
        <div class="form-group">
          <label class="form-label" for="setting-blank-size">Page size</label>
          <select class="form-control" id="setting-blank-size">
            <option value="a4" selected>A4</option>
            <option value="letter">US Letter</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="setting-blank-count">Page count</label>
          <select class="form-control" id="setting-blank-count">
            <option value="1" selected>1 page</option>
            <option value="2">2 pages</option>
            <option value="5">5 pages</option>
            <option value="10">10 pages</option>
            <option value="20">20 pages</option>
          </select>
        </div>
      </div>`;

    default:
      return '';
  }
}

function bindModalEvents(tool) {
  const uploadZone = document.getElementById('modal-upload-zone');
  const fileInput = document.getElementById('modal-file-input');
  const clearBtn = document.getElementById('modal-clear-btn');
  const executeBtn = document.getElementById('modal-execute-btn');
  const restartBtn = document.getElementById('modal-restart-btn');
  const downloadBtn = document.getElementById('modal-download-btn');
  const showAlert = showModalAlert;
  const clearAlert = clearModalAlert;

  // File input change
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const input = /** @type {HTMLInputElement} */ (e.target);
      const files = Array.from(input.files || []);
      // Reset so choosing the same file again still fires a change event.
      input.value = '';
      handleFilesSelected(files, tool);
    });
  }

  // Drag and drop
  if (uploadZone) {
    ['dragenter', 'dragover'].forEach(eventName => {
      uploadZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      uploadZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
      });
    });

    uploadZone.addEventListener('drop', (e) => {
      const files = Array.from(/** @type {DragEvent} */ (e).dataTransfer?.files || []);
      if (files.length) handleFilesSelected(files, tool);
    });
  }

  // Preset clicks
  document.querySelectorAll('.preset-card').forEach(card => {
    card.addEventListener('click', () => {
      card.parentElement?.querySelectorAll('.preset-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
    });
  });

  // Clear button
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.selectedFiles = [];
      updateFilesQueue(tool);
      clearAlert();
    });
  }

  // Restart button
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      state.selectedFiles = [];
      state.processingResult = null;
      renderToolBody(tool);
    });
  }

  // Download button
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      if (state.processingResult) {
        triggerDownload(
          state.processingResult.data,
          state.processingResult.filename,
          state.processingResult.mimeType
        );
      }
    });
  }

  // Execute processing button
  if (executeBtn) {
    executeBtn.addEventListener('click', async () => {
      clearAlert();
      await executeToolOperation(tool, showAlert);
    });
  }
}

/**
 * Clear the dialog's alert banner.
 */
function clearModalAlert() {
  const alertEl = document.getElementById('modal-alert');
  if (!alertEl) return;
  alertEl.className = 'alert-banner';
  alertEl.textContent = '';
}

/**
 * @param {File[]} newFiles
 * @param {import('./tools.js').Tool} tool
 */
function handleFilesSelected(newFiles, tool) {
  clearModalAlert();

  const validFiles = [];
  for (const f of newFiles) {
    const check = validateFile(f, tool.accept);
    if (!check.valid) {
      showModalAlert(check.error || 'That file could not be used.');
      return;
    }
    validFiles.push(f);
  }

  if (tool.multiple) {
    state.selectedFiles = [...state.selectedFiles, ...validFiles];
  } else {
    state.selectedFiles = validFiles.slice(0, 1);
  }

  updateFilesQueue(tool);
}

function updateFilesQueue(tool) {
  const queueEl = document.getElementById('modal-file-queue');
  const settingsEl = document.getElementById('modal-tool-settings');
  const actionBarEl = document.getElementById('modal-action-bar');
  const uploadZone = document.getElementById('modal-upload-zone');

  if (!queueEl || !settingsEl || !actionBarEl) return;

  if (state.selectedFiles.length === 0) {
    queueEl.style.display = 'none';
    settingsEl.style.display = 'none';
    actionBarEl.style.display = 'none';
    if (uploadZone) uploadZone.style.display = 'block';
    return;
  }

  // If single file tool, hide upload zone to make room
  if (!tool.multiple && uploadZone) {
    uploadZone.style.display = 'none';
  }

  queueEl.style.display = 'flex';
  settingsEl.style.display = settingsEl.innerHTML.trim() ? 'block' : 'none';
  actionBarEl.style.display = 'flex';

  queueEl.replaceChildren();

  const queueHeader = document.createElement('div');
  queueHeader.className = 'file-queue-header';
  const headerLabel = document.createElement('span');
  headerLabel.textContent = `Selected ${tool.multiple ? 'Files' : 'Document'} (${state.selectedFiles.length})`;
  queueHeader.appendChild(headerLabel);

  if (tool.multiple) {
    const addMoreTrigger = document.createElement('button');
    addMoreTrigger.type = 'button';
    addMoreTrigger.id = 'add-more-files-trigger';
    addMoreTrigger.className = 'file-queue-add-trigger';
    addMoreTrigger.textContent = '+ Add more files';
    queueHeader.appendChild(addMoreTrigger);
  }
  queueEl.appendChild(queueHeader);

  state.selectedFiles.forEach((file, idx) => {
    const item = document.createElement('div');
    item.className = 'file-item';

    const left = document.createElement('div');
    left.className = 'file-item-left';
    const icon = document.createElement('div');
    icon.className = 'file-item-icon';
    icon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

    const info = document.createElement('div');
    info.className = 'file-item-info';
    const name = document.createElement('div');
    name.className = 'file-item-name';
    name.textContent = file.name;
    name.title = file.name;

    const meta = document.createElement('div');
    meta.className = 'file-item-meta';
    const size = document.createElement('span');
    size.textContent = formatBytes(file.size);
    meta.appendChild(size);
    if (tool.multiple) {
      const position = document.createElement('span');
      position.textContent = `#${idx + 1}`;
      meta.appendChild(position);
    }

    info.append(name, meta);
    left.append(icon, info);

    const actions = document.createElement('div');
    actions.className = 'file-item-actions';
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'btn-file-action';
    removeButton.dataset.removeIdx = String(idx);
    removeButton.title = 'Remove file';
    removeButton.setAttribute('aria-label', `Remove ${file.name}`);
    removeButton.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
    removeButton.addEventListener('click', () => {
      state.selectedFiles.splice(idx, 1);
      updateFilesQueue(tool);
    });
    actions.appendChild(removeButton);

    item.append(left, actions);
    queueEl.appendChild(item);
  });

  const addMoreTrigger = document.getElementById('add-more-files-trigger');
  const fileInput = document.getElementById('modal-file-input');
  if (addMoreTrigger && fileInput) {
    addMoreTrigger.addEventListener('click', () => fileInput.click());
  }
}

/**
 * Read a tool setting from the dialog.
 * @param {string} id
 * @param {string} fallback
 * @returns {string}
 */
function settingValue(id, fallback = '') {
  const element = document.getElementById(id);
  return element instanceof HTMLInputElement || element instanceof HTMLSelectElement
    ? element.value
    : fallback;
}

/**
 * Read a numeric tool setting from the dialog.
 * @param {string} id
 * @param {number} fallback
 * @returns {number}
 */
function settingNumber(id, fallback) {
  const value = Number.parseFloat(settingValue(id, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Read the value of the active preset card in the dialog.
 * @param {string} attribute
 * @param {string} fallback
 * @returns {string}
 */
function activePreset(attribute, fallback) {
  const card = document.querySelector('.preset-card.active');
  return card?.getAttribute(attribute) || fallback;
}

/**
 * Human-readable size of a tool result.
 * @param {ToolResult} result
 * @returns {number}
 */
function resultSize(result) {
  const data = result.data;
  if (typeof data === 'string') return data.length;
  if (data instanceof Blob) return data.size;
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  return 0;
}

/**
 * Check file-count requirements before doing any work.
 * @param {import('./tools.js').Tool} tool
 * @returns {string|null} an error message, or null when the selection is usable
 */
function validateSelection(tool) {
  const count = state.selectedFiles.length;
  if (tool.workflow === 'create-pdf') return null;
  if (count === 0) return 'Please choose at least one file to process.';
  if (tool.workflow === 'compare' && count !== 2) return 'Comparison needs exactly two PDF files.';
  if (tool.workflow === 'merge' && count < 2) {
    // A single PDF can be emitted unchanged by "Organize", but merging needs two.
    return 'Select at least two PDF files to merge. Use Split PDF to work with a single file.';
  }
  return null;
}

async function executeToolOperation(tool, showAlert) {
  const selectionError = validateSelection(tool);
  if (selectionError) {
    showAlert(selectionError);
    return;
  }

  const uploadZone = document.getElementById('modal-upload-zone');
  const queueEl = document.getElementById('modal-file-queue');
  const settingsEl = document.getElementById('modal-tool-settings');
  const actionBarEl = document.getElementById('modal-action-bar');
  const processingBox = document.getElementById('modal-processing-box');
  const progressFill = document.getElementById('modal-progress-fill');
  const progressDesc = document.getElementById('modal-progress-desc');
  const successBox = document.getElementById('modal-success-box');
  const statsEl = document.getElementById('modal-result-stats');
  const executeBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('modal-execute-btn'));

  // Switch to processing view
  if (uploadZone) uploadZone.style.display = 'none';
  if (queueEl) queueEl.style.display = 'none';
  if (settingsEl) settingsEl.style.display = 'none';
  if (actionBarEl) actionBarEl.style.display = 'none';
  if (processingBox) processingBox.classList.add('visible');
  if (executeBtn) executeBtn.disabled = true;

  /** @param {number} percent @param {string} [message] */
  function updateProgress(percent, message) {
    if (progressFill) progressFill.style.width = `${percent}%`;
    if (progressDesc && message) progressDesc.textContent = message;
  }

  try {
    const files = state.selectedFiles;
    /** @type {ToolResult} */
    let result;
    const engine = await loadPdfEngine();

    switch (tool.workflow) {
      case 'merge':
        result = await engine.processMergePDF(files, updateProgress);
        break;

      case 'split': {
        const range = settingValue('setting-page-range', '1');
        result = tool.id === 'split-pdf'
          ? await engine.processSplitToFilesPDF(files[0], range, updateProgress)
          : await engine.processSplitPDF(files[0], range, updateProgress);
        break;
      }

      case 'remove-pages':
        result = await engine.processRemovePages(files[0], settingValue('setting-page-range', '1'), updateProgress);
        break;

      case 'organize':
        result = await engine.processOrganizePDF(files[0], settingValue('setting-page-order'), updateProgress);
        break;

      case 'rotate': {
        const angle = Number.parseInt(activePreset('data-angle', '90'), 10);
        result = await engine.processRotatePDF(files[0], Number.isFinite(angle) ? angle : 90, updateProgress);
        break;
      }

      case 'watermark':
        result = await engine.processWatermarkPDF(files[0], {
          text: settingValue('setting-watermark-text', 'CONFIDENTIAL'),
          fontSize: settingNumber('setting-watermark-size', 54),
          opacity: settingNumber('setting-watermark-opacity', 0.3),
          angle: settingNumber('setting-watermark-angle', 45),
          color: settingValue('setting-watermark-color', '#e84c4f')
        }, updateProgress);
        break;

      case 'page-numbers':
        result = await engine.processPageNumbers(files[0], {
          position: settingValue('setting-page-pos', 'bottom-center'),
          format: settingValue('setting-page-fmt', 'Page {n} of {total}'),
          startFrom: Math.max(1, Math.trunc(settingNumber('setting-page-start', 1)))
        }, updateProgress);
        break;

      case 'images-to-pdf':
        result = await engine.processImagesToPDF(files, {
          orientation: settingValue('setting-img-orient', 'portrait'),
          pageSize: settingValue('setting-img-size', 'a4'),
          margin: settingNumber('setting-img-margin', 20)
        }, updateProgress);
        break;

      case 'html-to-pdf':
        result = await engine.processHtmlToPDF(files[0], updateProgress);
        break;

      case 'office-to-pdf':
        result = await engine.processOfficeToPDF(files[0], updateProgress);
        break;

      case 'pdf-to-images':
        result = await engine.processPDFToImages(files[0], tool.id === 'pdf-to-jpg' ? 'jpeg' : 'png', updateProgress);
        break;

      case 'pdf-to-office':
        result = await engine.processPdfToOffice(files[0], tool.id === 'pdf-to-excel' ? 'xlsx' : 'pptx', updateProgress);
        break;

      case 'compress':
        result = await engine.processCompressPDF(files[0], activePreset('data-compress', 'recommended'), updateProgress);
        break;

      case 'flatten':
        result = await engine.processFlattenPDF(files[0], updateProgress);
        break;

      case 'pdf-to-text':
        result = await engine.processPDFToText(files[0], updateProgress);
        break;

      case 'pdf-to-word':
        result = await engine.processPDFToWord(files[0], updateProgress);
        break;

      case 'sign':
        result = await engine.processSignPDF(files[0], settingValue('setting-signature-name'), updateProgress);
        break;

      case 'crop':
        result = await engine.processCropPDF(files[0], settingNumber('setting-crop-margin', 5), updateProgress);
        break;

      case 'compare':
        result = await engine.processComparePDF(files, updateProgress);
        break;

      case 'repair':
        result = await engine.processRepairPDF(files[0], updateProgress);
        break;

      case 'unlock':
        result = await engine.processUnlockPDF(files[0], settingValue('setting-pdf-password'), updateProgress);
        break;

      case 'protect':
        result = await engine.processProtectPDF(files[0], settingValue('setting-pdf-password'), updateProgress);
        break;

      case 'ocr':
        result = await engine.processOCRPDF(files[0], updateProgress);
        break;

      case 'pdf-to-zip':
        result = await engine.processPDFToZIP(files, updateProgress);
        break;

      case 'metadata':
        result = await engine.processPDFMetadata(files[0], {
          title: settingValue('setting-meta-title'),
          author: settingValue('setting-meta-author'),
          subject: settingValue('setting-meta-subj'),
          keywords: settingValue('setting-meta-keywords')
        }, updateProgress);
        break;

      case 'create-pdf':
        result = await engine.processCreateBlankPDF(
          Math.trunc(settingNumber('setting-blank-count', 1)),
          settingValue('setting-blank-size', 'a4'),
          updateProgress
        );
        break;

      default:
        throw new Error(`The "${tool.name}" tool is not available yet.`);
    }

    state.processingResult = result;

    // Display success view
    if (processingBox) processingBox.classList.remove('visible');
    if (successBox) successBox.classList.add('visible');

    if (statsEl) {
      if (result.newSize && result.originalSize) {
        statsEl.innerHTML = `
          <div class="file-stat-chip">
            <span>Original: ${formatBytes(result.originalSize)}</span>
            <span>&rarr;</span>
            <span>Optimized: <strong>${formatBytes(result.newSize)}</strong></span>
            ${(result.reductionRatio || 0) > 0 ? `<span>(${result.reductionRatio}% reduction)</span>` : ''}
          </div>
        `;
      } else if (result.pageCount) {
        const count = result.pageCount;
        const label = result.fileCount ? `${count} file${count === 1 ? '' : 's'}` : `${count} ${count === 1 ? 'Page' : 'Pages'}`;
        statsEl.innerHTML = `
          <div class="file-stat-chip">
            <span>Generated Document: <strong>${label}</strong></span>
            <span>&bull;</span>
            <span>Size: <strong>${formatBytes(resultSize(result))}</strong></span>
          </div>
        `;
      } else {
        statsEl.innerHTML = `
          <div class="file-stat-chip">
            <span>Status: <strong>Ready for download</strong></span>
          </div>
        `;
      }
    }

    // One explicit download action: the success view's "Download Document" button.
    // Previously the file was also downloaded automatically, which produced duplicate
    // saves when the button was clicked and looked like a silent failure when the
    // browser blocked the programmatic download.
    const downloadButton = /** @type {HTMLButtonElement|null} */ (document.getElementById('modal-download-btn'));
    if (downloadButton) downloadButton.focus({ preventScroll: true });

  } catch (err) {
    console.error('Error during document operation:', err);
    if (processingBox) processingBox.classList.remove('visible');
    if (successBox) successBox.classList.remove('visible');
    updateFilesQueue(tool);
    const message = err instanceof Error ? err.message : 'An error occurred while processing the document.';
    showAlert(message);
  } finally {
    if (executeBtn) executeBtn.disabled = false;
  }
}

// Exposed for the inline onclick handlers in the marketing pages.
appWindow.DocuFlowApp = {
  openToolStudio,
  closeToolStudio
};
