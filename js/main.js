/**
 * DocuFlow - Main Application Controller
 * Dynamic tool cards rendering, search & category filtering, and interactive Tool Studio modal
 */

import { initNavigation } from './navigation.js';
import { TOOLS, CATEGORIES, filterTools, getToolById } from './tools.js';
import { formatBytes, validateFile, triggerDownload, cleanupObjectURLs } from './file-handler.js';
import {
  processMergePDF,
  processSplitPDF,
  processRemovePages,
  processRotatePDF,
  processWatermarkPDF,
  processPageNumbers,
  processImagesToPDF,
  processCompressPDF,
  processFlattenPDF,
  processPDFToText,
  processPDFToZIP,
  processPDFMetadata,
  processCreateBlankPDF
} from './pdf-tools.js';

// Application state
const state = {
  activeCategory: 'all',
  searchQuery: '',
  selectedTool: null,
  selectedFiles: [],
  processingResult: null
};

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
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

  if (filtered.length === 0) {
    gridContainer.innerHTML = '';
    if (emptyState) emptyState.classList.add('visible');
    return;
  }

  if (emptyState) emptyState.classList.remove('visible');

  gridContainer.innerHTML = filtered.map(tool => {
    return `
      <article class="tool-card" data-id="${tool.id}" data-cat="${tool.category}" role="button" tabindex="0" aria-label="Open ${tool.name}">
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
  }).join('');

  // Attach click & enter key handlers to cards
  gridContainer.querySelectorAll('.tool-card').forEach(card => {
    const toolId = card.getAttribute('data-id');
    const openHandler = () => openToolStudio(toolId);

    card.addEventListener('click', openHandler);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
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
  const searchInput = document.getElementById('tools-search');
  const clearBtn = document.getElementById('search-clear');
  const filterButtons = document.querySelectorAll('.filter-btn');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
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
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeCategory = btn.getAttribute('data-category');
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
      const files = Array.from(e.target.files);
      if (files.length > 0) {
        // Open Merge or first tool with selected files
        const defaultToolId = files.length > 1 ? 'merge-pdf' : 'compress-pdf';
        openToolStudio(defaultToolId, files);
      }
    });
  }
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
      if (e.key === 'Escape' && modalOverlay.classList.contains('open')) {
        closeToolStudio();
      }
    });
  }
}

export function openToolStudio(toolId, preloadedFiles = []) {
  const tool = getToolById(toolId);
  if (!tool) return;

  state.selectedTool = tool;
  state.selectedFiles = [...preloadedFiles];
  state.processingResult = null;

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
  document.body.style.overflow = 'hidden';
}

export function closeToolStudio() {
  const modalOverlay = document.getElementById('tool-modal-overlay');
  if (!modalOverlay) return;

  modalOverlay.classList.remove('open');
  modalOverlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  state.selectedFiles = [];
  state.processingResult = null;
  cleanupObjectURLs();
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
            To preserve user privacy and maintain 100% serverless browser processing, iLovePDFs runs all PDF organizing, splitting, merging, watermarking, rotating, compression, and image conversion entirely on client-side WebAssembly and JS. For proprietary Office conversion, connect your Hostinger Node.js backend or LibreOffice microservice endpoint.
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
    <div class="upload-zone" id="modal-upload-zone" tabindex="0" role="region" aria-label="Upload files area">
      <input type="file" class="upload-file-input" id="modal-file-input" ${tool.multiple ? 'multiple' : ''} accept="${tool.accept}">
      <div class="upload-icon-circle" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      </div>
      <div class="upload-main-text">Click or drag & drop ${tool.multiple ? 'files' : 'your file'} here</div>
      <div class="upload-sub-text">Supported format: ${tool.accept} (Max 100 MB per file)</div>
      <button type="button" class="btn btn-secondary btn-sm" style="pointer-events: none;">Select from Computer</button>
    </div>

    <!-- Selected Files Queue -->
    <div class="file-queue" id="modal-file-queue" style="display: none;"></div>

    <!-- Tool Specific Settings Panel -->
    <div class="tool-settings-card" id="modal-tool-settings" style="display: none;">
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
      <div class="success-title">Your PDF is Ready!</div>
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
    <div id="modal-action-bar" style="margin-top: 24px; display: none; justify-content: flex-end; gap: 12px;">
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

function getToolActionBtnLabel(tool) {
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
          ${tool.workflow === 'split' ? 'Select Pages to Extract' : 'Select Pages to Delete'}
        </div>
        <div class="form-group">
          <label class="form-label" for="setting-page-range">Page Numbers or Ranges</label>
          <input type="text" class="form-control" id="setting-page-range" placeholder="e.g. 1-3, 5, 8-10" value="1">
          <div class="form-hint">Separate individual pages with commas or specify spans with hyphens.</div>
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
              <option value="bottom-right">Bottom Right</option>
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
            <span class="preset-title">Recommended</span>
            <span class="preset-desc">Balanced quality & size</span>
          </div>
          <div class="preset-card" data-compress="extreme">
            <span class="preset-title">High Efficiency</span>
            <span class="preset-desc">Max stream reduction</span>
          </div>
        </div>
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
          <label class="form-label" for="setting-meta-subject">Subject / Keywords</label>
          <input type="text" class="form-control" id="setting-meta-subject" placeholder="Comma separated keywords">
        </div>
      `;

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
  const alertEl = document.getElementById('modal-alert');

  function showAlert(msg, isError = true) {
    if (!alertEl) return;
    alertEl.className = `alert-banner ${isError ? 'alert-error' : 'alert-info'} visible`;
    alertEl.textContent = msg;
  }

  function clearAlert() {
    if (!alertEl) return;
    alertEl.className = 'alert-banner';
    alertEl.textContent = '';
  }

  // File input change
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      handleFilesSelected(Array.from(e.target.files), tool);
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
      const files = Array.from(e.dataTransfer.files);
      handleFilesSelected(files, tool);
    });
  }

  // Preset clicks
  document.querySelectorAll('.preset-card').forEach(card => {
    card.addEventListener('click', () => {
      card.parentElement.querySelectorAll('.preset-card').forEach(c => c.classList.remove('active'));
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

function handleFilesSelected(newFiles, tool) {
  const alertEl = document.getElementById('modal-alert');
  if (alertEl) {
    alertEl.className = 'alert-banner';
    alertEl.textContent = '';
  }

  const validFiles = [];
  for (const f of newFiles) {
    const check = validateFile(f, tool.accept);
    if (!check.valid) {
      if (alertEl) {
        alertEl.className = 'alert-banner alert-error visible';
        alertEl.textContent = check.error;
      }
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

async function executeToolOperation(tool, showAlert) {
  if (state.selectedFiles.length === 0) {
    showAlert('Please choose at least one file to process.');
    return;
  }

  const uploadZone = document.getElementById('modal-upload-zone');
  const queueEl = document.getElementById('modal-file-queue');
  const settingsEl = document.getElementById('modal-tool-settings');
  const actionBarEl = document.getElementById('modal-action-bar');
  const processingBox = document.getElementById('modal-processing-box');
  const progressFill = document.getElementById('modal-progress-fill');
  const progressTitle = document.getElementById('modal-progress-title');
  const progressDesc = document.getElementById('modal-progress-desc');
  const successBox = document.getElementById('modal-success-box');
  const statsEl = document.getElementById('modal-result-stats');

  // Switch to processing view
  if (uploadZone) uploadZone.style.display = 'none';
  if (queueEl) queueEl.style.display = 'none';
  if (settingsEl) settingsEl.style.display = 'none';
  if (actionBarEl) actionBarEl.style.display = 'none';
  if (processingBox) processingBox.classList.add('visible');

  function updateProgress(percent, message) {
    if (progressFill) progressFill.style.width = `${percent}%`;
    if (progressDesc && message) progressDesc.textContent = message;
  }

  try {
    let result;

    switch (tool.workflow) {
      case 'merge':
        result = await processMergePDF(state.selectedFiles, updateProgress);
        break;

      case 'split': {
        const range = document.getElementById('setting-page-range')?.value || '1';
        result = await processSplitPDF(state.selectedFiles[0], range, updateProgress);
        break;
      }

      case 'remove-pages': {
        const pagesToRemove = document.getElementById('setting-page-range')?.value || '1';
        result = await processRemovePages(state.selectedFiles[0], pagesToRemove, updateProgress);
        break;
      }

      case 'rotate': {
        const activeAngle = document.querySelector('.preset-card.active')?.getAttribute('data-angle') || 90;
        result = await processRotatePDF(state.selectedFiles[0], parseInt(activeAngle, 10), updateProgress);
        break;
      }

      case 'watermark': {
        const text = document.getElementById('setting-watermark-text')?.value || 'CONFIDENTIAL';
        const fontSize = parseInt(document.getElementById('setting-watermark-size')?.value || '54', 10);
        const opacity = parseFloat(document.getElementById('setting-watermark-opacity')?.value || '0.3');
        result = await processWatermarkPDF(state.selectedFiles[0], { text, fontSize, opacity }, updateProgress);
        break;
      }

      case 'page-numbers': {
        const pos = document.getElementById('setting-page-pos')?.value || 'bottom-center';
        const fmt = document.getElementById('setting-page-fmt')?.value || 'Page {n} of {total}';
        result = await processPageNumbers(state.selectedFiles[0], { position: pos, format: fmt }, updateProgress);
        break;
      }

      case 'images-to-pdf': {
        const orient = document.getElementById('setting-img-orient')?.value || 'portrait';
        const pSize = document.getElementById('setting-img-size')?.value || 'a4';
        const margin = parseInt(document.getElementById('setting-img-margin')?.value || '20', 10);
        result = await processImagesToPDF(state.selectedFiles, { orientation: orient, pageSize: pSize, margin }, updateProgress);
        break;
      }

      case 'compress': {
        const level = document.querySelector('.preset-card.active')?.getAttribute('data-compress') || 'recommended';
        result = await processCompressPDF(state.selectedFiles[0], level, updateProgress);
        break;
      }

      case 'flatten':
        result = await processFlattenPDF(state.selectedFiles[0], updateProgress);
        break;

      case 'pdf-to-text':
        result = await processPDFToText(state.selectedFiles[0], updateProgress);
        break;

      case 'pdf-to-zip':
        result = await processPDFToZIP(state.selectedFiles, updateProgress);
        break;

      case 'metadata': {
        const title = document.getElementById('setting-meta-title')?.value;
        const author = document.getElementById('setting-meta-author')?.value;
        const keywords = document.getElementById('setting-meta-subject')?.value;
        result = await processPDFMetadata(state.selectedFiles[0], { title, author, keywords }, updateProgress);
        break;
      }

      case 'create-pdf':
        result = await processCreateBlankPDF(1, 'a4', updateProgress);
        break;

      default:
        throw new Error(`Execution for workflow "${tool.workflow}" is in progress.`);
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
            ${result.reductionRatio > 0 ? `<span>(${result.reductionRatio}% reduction)</span>` : ''}
          </div>
        `;
      } else if (result.pageCount) {
        statsEl.innerHTML = `
          <div class="file-stat-chip">
            <span>Generated Document: <strong>${result.pageCount} ${result.pageCount === 1 ? 'Page' : 'Pages'}</strong></span>
            <span>&bull;</span>
            <span>Size: <strong>${formatBytes(result.data.byteLength || result.data.size || 0)}</strong></span>
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

    // Automatically trigger file download
    triggerDownload(result.data, result.filename, result.mimeType);

  } catch (err) {
    console.error('Error during document operation:', err);
    if (processingBox) processingBox.classList.remove('visible');
    updateFilesQueue(tool);
    showAlert(err.message || 'An error occurred while processing the document.');
  }
}

// Attach to window for inline onclick handlers if needed
window.DocuFlowApp = {
  openToolStudio,
  closeToolStudio
};
