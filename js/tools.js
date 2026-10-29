/**
 * DocuFlow - PDF Tools Registry & Directory Data
 * Structured catalog of all PDF tools across 6 core categories
 */

export const CATEGORIES = [
  { id: 'all', name: 'All Tools' },
  { id: 'organize', name: 'Organize PDF' },
  { id: 'optimize', name: 'Optimize PDF' },
  { id: 'convert-to', name: 'Convert to PDF' },
  { id: 'convert-from', name: 'Convert from PDF' },
  { id: 'edit', name: 'Edit PDF' },
  { id: 'utilities', name: 'Additional Utilities' }
];

export const TOOLS = [
  /* Category 1: Organize PDF */
  {
    id: 'merge-pdf',
    name: 'Merge PDF',
    category: 'organize',
    categoryName: 'Organize PDF',
    desc: 'Combine multiple PDF files into a single, cohesive document in your desired page sequence.',
    badge: 'Popular',
    accept: '.pdf',
    multiple: true,
    workflow: 'merge',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="16" height="18" x="4" y="4" rx="2"/><path d="M8 10h8"/><path d="M8 14h8"/><path d="M8 18h5"/></svg>`
  },
  {
    id: 'split-pdf',
    name: 'Split PDF',
    category: 'organize',
    categoryName: 'Organize PDF',
    desc: 'Extract specific page ranges or split a large document into independent PDF files.',
    badge: 'Popular',
    accept: '.pdf',
    multiple: false,
    workflow: 'split',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" x2="8.12" y1="4" y2="9.88"/><line x1="14.47" x2="20" y1="14.48" y2="20"/><line x1="8.12" x2="12" y1="14.12" y2="12"/></svg>`
  },
  {
    id: 'remove-pages',
    name: 'Remove Pages',
    category: 'organize',
    categoryName: 'Organize PDF',
    desc: 'Delete unnecessary or blank pages from your PDF document in seconds.',
    badge: null,
    accept: '.pdf',
    multiple: false,
    workflow: 'remove-pages',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`
  },
  {
    id: 'extract-pages',
    name: 'Extract Pages',
    category: 'organize',
    categoryName: 'Organize PDF',
    desc: 'Select individual pages or ranges and export them into a fresh PDF file.',
    badge: null,
    accept: '.pdf',
    multiple: false,
    workflow: 'split',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`
  },
  {
    id: 'organize-pdf',
    name: 'Organize PDF',
    category: 'organize',
    categoryName: 'Organize PDF',
    desc: 'Rearrange and reorder pages in your PDF by custom sequence or reverse order.',
    badge: null,
    accept: '.pdf',
    multiple: false,
    workflow: 'organize',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></svg>`
  },
  {
    id: 'rotate-pdf',
    name: 'Rotate PDF',
    category: 'organize',
    categoryName: 'Organize PDF',
    desc: 'Rotate single pages or an entire PDF document 90, 180, or 270 degrees.',
    badge: 'Popular',
    accept: '.pdf',
    multiple: false,
    workflow: 'rotate',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>`
  },

  /* Category 2: Optimize PDF */
  {
    id: 'compress-pdf',
    name: 'Compress PDF',
    category: 'optimize',
    categoryName: 'Optimize PDF',
    desc: 'Reduce file size while preserving high document quality and visual sharpness.',
    badge: 'Popular',
    accept: '.pdf',
    multiple: false,
    workflow: 'compress',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 15 6 6m-6-6v4.8m0-4.8h4.8"/><path d="M9 19.8V15m0 0H4.2M9 15l-6 6"/><path d="M15 4.2V9m0 0h4.8M15 9l6-6"/><path d="M9 4.2V9m0 0H4.2M9 9 3 3"/></svg>`
  },
  {
    id: 'unlock-pdf',
    name: 'Unlock PDF',
    category: 'optimize',
    categoryName: 'Optimize PDF',
    desc: 'Remove restrictions and usage permissions from PDF documents.',
    badge: null,
    accept: '.pdf',
    multiple: false,
    workflow: 'unlock',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`
  },
  {
    id: 'protect-pdf',
    name: 'Protect PDF',
    category: 'optimize',
    categoryName: 'Optimize PDF',
    desc: 'Encrypt and password-protect sensitive documents with strong security.',
    badge: 'Security',
    accept: '.pdf',
    multiple: false,
    workflow: 'protect',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
  },
  {
    id: 'flatten-pdf',
    name: 'Flatten PDF',
    category: 'optimize',
    categoryName: 'Optimize PDF',
    desc: 'Flatten interactive fillable forms and annotations into permanent document content.',
    badge: null,
    accept: '.pdf',
    multiple: false,
    workflow: 'flatten',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m8 17 4 4 4-4"/></svg>`
  },
  {
    id: 'repair-pdf',
    name: 'Repair PDF',
    category: 'optimize',
    categoryName: 'Optimize PDF',
    desc: 'Analyze and salvage corrupted or unreadable PDF document cross-reference tables.',
    badge: null,
    accept: '.pdf',
    multiple: false,
    workflow: 'repair',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`
  },

  /* Category 3: Convert to PDF */
  {
    id: 'jpg-to-pdf',
    name: 'JPG to PDF',
    category: 'convert-to',
    categoryName: 'Convert to PDF',
    desc: 'Convert JPG images into clean PDF pages with configurable layout and margins.',
    badge: 'Popular',
    accept: 'image/jpeg,.jpg,.jpeg',
    multiple: true,
    workflow: 'images-to-pdf',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`
  },
  {
    id: 'png-to-pdf',
    name: 'PNG to PDF',
    category: 'convert-to',
    categoryName: 'Convert to PDF',
    desc: 'Convert transparent or opaque PNG graphics into professional PDF documents.',
    badge: 'Popular',
    accept: 'image/png,.png',
    multiple: true,
    workflow: 'images-to-pdf',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16l4.586-4.586a2 2 0 0 1 2.828 0L16 16m-2-2l1.586-1.586a2 2 0 0 1 2.828 0L20 14m-6-6h.01M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"/></svg>`
  },
  {
    id: 'html-to-pdf',
    name: 'HTML to PDF',
    category: 'convert-to',
    categoryName: 'Convert to PDF',
    desc: 'Convert HTML code snippets, web pages, or rich text files directly into clean PDF documents.',
    badge: 'New',
    accept: '.html,.htm,.txt',
    multiple: false,
    workflow: 'html-to-pdf',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`
  },
  {
    id: 'word-to-pdf',
    name: 'Word to PDF',
    category: 'convert-to',
    categoryName: 'Convert to PDF',
    desc: 'Convert Microsoft Word DOC and DOCX files into universally readable PDF files.',
    badge: null,
    accept: '.doc,.docx',
    multiple: false,
    workflow: 'office-to-pdf',
    isClientReady: false,
    serverRequiredNote: 'Word document conversion engine requires the serverless Office rendering pipeline.',
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h8"/><path d="M8 17h8"/><path d="M8 9h2"/></svg>`
  },
  {
    id: 'excel-to-pdf',
    name: 'Excel to PDF',
    category: 'convert-to',
    categoryName: 'Convert to PDF',
    desc: 'Transform Excel XLS and XLSX spreadsheets into cleanly formatted PDF reports.',
    badge: null,
    accept: '.xls,.xlsx',
    multiple: false,
    workflow: 'office-to-pdf',
    isClientReady: false,
    serverRequiredNote: 'Spreadsheet rendering requires the server-side workbook calculation engine.',
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16h8"/><path d="M7 11h12"/><path d="M7 6h3"/></svg>`
  },
  {
    id: 'powerpoint-to-pdf',
    name: 'PowerPoint to PDF',
    category: 'convert-to',
    categoryName: 'Convert to PDF',
    desc: 'Export PPT and PPTX slide presentation decks into high-resolution PDF handouts.',
    badge: null,
    accept: '.ppt,.pptx',
    multiple: false,
    workflow: 'office-to-pdf',
    isClientReady: false,
    serverRequiredNote: 'Slide deck rendering pipeline requires server-side font and slide rasterization.',
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="14" x="3" y="3" rx="2"/><path d="M21 12H3"/><path d="M12 21V3"/></svg>`
  },

  /* Category 4: Convert from PDF */
  {
    id: 'pdf-to-jpg',
    name: 'PDF to JPG',
    category: 'convert-from',
    categoryName: 'Convert from PDF',
    desc: 'Extract and render each page of your PDF file into high-quality JPG images.',
    badge: 'Popular',
    accept: '.pdf',
    multiple: false,
    workflow: 'pdf-to-images',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16l4.586-4.586a2 2 0 0 1 2.828 0L16 16m-2-2l1.586-1.586a2 2 0 0 1 2.828 0L20 14m-6-6h.01M6 20h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"/></svg>`
  },
  {
    id: 'pdf-to-png',
    name: 'PDF to PNG',
    category: 'convert-from',
    categoryName: 'Convert from PDF',
    desc: 'Export crisp, lossless PNG graphics from every page or selected pages of your PDF.',
    badge: null,
    accept: '.pdf',
    multiple: false,
    workflow: 'pdf-to-images',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`
  },
  {
    id: 'pdf-to-text',
    name: 'PDF to Text',
    category: 'convert-from',
    categoryName: 'Convert from PDF',
    desc: 'Extract raw text, paragraphs, and contents from PDF files directly in your browser.',
    badge: 'Fast',
    accept: '.pdf',
    multiple: false,
    workflow: 'pdf-to-text',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`
  },
  {
    id: 'pdf-to-word',
    name: 'PDF to Word',
    category: 'convert-from',
    categoryName: 'Convert from PDF',
    desc: 'Convert PDF files into editable Microsoft Word (.docx) documents with layout recognition.',
    badge: null,
    accept: '.pdf',
    multiple: false,
    workflow: 'pdf-to-office',
    isClientReady: false,
    serverRequiredNote: 'Editable Word layout reconstruction requires the document OCR/layout analysis service.',
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h6"/><path d="M9 11h6"/><path d="M9 7h1"/></svg>`
  },
  {
    id: 'pdf-to-excel',
    name: 'PDF to Excel',
    category: 'convert-from',
    categoryName: 'Convert from PDF',
    desc: 'Extract tabular data and financial statements from PDF into editable Excel sheets.',
    badge: null,
    accept: '.pdf',
    multiple: false,
    workflow: 'pdf-to-office',
    isClientReady: false,
    serverRequiredNote: 'Table detection and spreadsheet extraction engine requires the server-side analysis API.',
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>`
  },
  {
    id: 'pdf-to-powerpoint',
    name: 'PDF to PowerPoint',
    category: 'convert-from',
    categoryName: 'Convert from PDF',
    desc: 'Convert PDF pages into editable PowerPoint (.pptx) presentation slides.',
    badge: null,
    accept: '.pdf',
    multiple: false,
    workflow: 'pdf-to-office',
    isClientReady: false,
    serverRequiredNote: 'Vector-to-slide decomposition pipeline requires the serverless presentation generator.',
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="14" x="3" y="5" rx="2"/><path d="M7 15h4"/><path d="M9 9h6"/></svg>`
  },

  /* Category 5: Edit PDF */
  {
    id: 'watermark-pdf',
    name: 'Watermark PDF',
    category: 'edit',
    categoryName: 'Edit PDF',
    desc: 'Apply custom text watermarks with control over position, opacity, font size, and angle.',
    badge: 'Popular',
    accept: '.pdf',
    multiple: false,
    workflow: 'watermark',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`
  },
  {
    id: 'page-numbers',
    name: 'Page Numbers',
    category: 'edit',
    categoryName: 'Edit PDF',
    desc: 'Insert formatted page numbers (e.g. Page 1 of N) at chosen header or footer positions.',
    badge: null,
    accept: '.pdf',
    multiple: false,
    workflow: 'page-numbers',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M8 7h6"/><path d="M8 11h4"/><circle cx="16" cy="16" r="2"/></svg>`
  },
  {
    id: 'sign-pdf',
    name: 'Sign PDF',
    category: 'edit',
    categoryName: 'Edit PDF',
    desc: 'Create and place your signature directly onto PDF document pages.',
    badge: 'Popular',
    accept: '.pdf',
    multiple: false,
    workflow: 'sign',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>`
  },
  {
    id: 'crop-pdf',
    name: 'Crop PDF',
    category: 'edit',
    categoryName: 'Edit PDF',
    desc: 'Trim page margins and adjust visible document crop boxes.',
    badge: null,
    accept: '.pdf',
    multiple: false,
    workflow: 'crop',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>`
  },
  {
    id: 'compare-pdf',
    name: 'Compare PDF',
    category: 'edit',
    categoryName: 'Edit PDF',
    desc: 'Inspect differences and page revisions side-by-side between two PDF files.',
    badge: null,
    accept: '.pdf',
    multiple: true,
    workflow: 'compare',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="14" x="3" y="5" rx="1"/><rect width="8" height="14" x="13" y="5" rx="1"/><path d="M8 2v3"/><path d="M16 2v3"/></svg>`
  },

  /* Category 6: Additional Utilities */
  {
    id: 'pdf-metadata',
    name: 'PDF Metadata',
    category: 'utilities',
    categoryName: 'Additional Utilities',
    desc: 'Inspect and update document title, author, subject, keywords, and creator details.',
    badge: 'Utility',
    accept: '.pdf',
    multiple: false,
    workflow: 'metadata',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
  },
  {
    id: 'pdf-to-zip',
    name: 'PDF to ZIP',
    category: 'utilities',
    categoryName: 'Additional Utilities',
    desc: 'Bundle multiple PDF documents into a compact, compressed ZIP archive.',
    badge: null,
    accept: '.pdf',
    multiple: true,
    workflow: 'pdf-to-zip',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m8 17 4 4 4-4"/></svg>`
  },
  {
    id: 'ocr-pdf',
    name: 'OCR PDF',
    category: 'utilities',
    categoryName: 'Additional Utilities',
    desc: 'Extract searchable and selectable text from scanned paper PDF documents.',
    badge: 'Pro',
    accept: '.pdf',
    multiple: false,
    workflow: 'ocr',
    isClientReady: false,
    serverRequiredNote: 'Optical Character Recognition (OCR) model requires the server-side Tesseract/Vision API pipeline.',
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/></svg>`
  },
  {
    id: 'create-pdf',
    name: 'Create Blank PDF',
    category: 'utilities',
    categoryName: 'Additional Utilities',
    desc: 'Generate a new blank or custom sized PDF document ready for drafting.',
    badge: 'New',
    accept: '.pdf',
    multiple: false,
    workflow: 'create-pdf',
    isClientReady: true,
    icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>`
  }
];

export function getToolById(id) {
  return TOOLS.find(t => t.id === id);
}

export function filterTools(query = '', category = 'all') {
  const normalizedQuery = query.trim().toLowerCase();
  return TOOLS.filter(tool => {
    const matchesCategory = category === 'all' || tool.category === category;
    if (!matchesCategory) return false;
    if (!normalizedQuery) return true;

    return (
      tool.name.toLowerCase().includes(normalizedQuery) ||
      tool.desc.toLowerCase().includes(normalizedQuery) ||
      tool.categoryName.toLowerCase().includes(normalizedQuery) ||
      tool.id.toLowerCase().includes(normalizedQuery)
    );
  });
}
