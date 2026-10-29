/**
 * DocuFlow - File Handling & Validation
 * Secure drag-and-drop, format validation, size checks, and blob download management
 */

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB max per file
const activeObjectURLs = new Set();

/**
 * Format bytes into human-readable string (KB, MB, GB)
 */
export function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Validate file against allowed types and max size limit
 */
export function validateFile(file, acceptTypes = '.pdf') {
  if (!file) {
    return { valid: false, error: 'No file provided.' };
  }

  if (file.size === 0) {
    return { valid: false, error: `File "${file.name}" is empty (0 bytes).` };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { 
      valid: false, 
      error: `File "${file.name}" exceeds the maximum allowed limit of ${formatBytes(MAX_FILE_SIZE)}.` 
    };
  }

  // Type checks
  const acceptedList = acceptTypes.split(',').map(s => s.trim().toLowerCase());
  const fileName = file.name.toLowerCase();
  const fileType = (file.type || '').toLowerCase();

  const matchesExt = acceptedList.some(acc => {
    if (acc.startsWith('.')) {
      return fileName.endsWith(acc);
    }
    // MIME type check like image/* or application/pdf
    if (acc.includes('/*')) {
      const prefix = acc.replace('/*', '');
      return fileType.startsWith(prefix);
    }
    return fileType === acc;
  });

  if (!matchesExt) {
    return {
      valid: false,
      error: `"${file.name}" is not a supported file type. Accepted: ${acceptTypes}`
    };
  }

  return { valid: true };
}

/**
 * Read File object as ArrayBuffer
 */
export async function readFileAsArrayBuffer(file) {
  if (file.arrayBuffer) {
    return await file.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file contents.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Read File object as Data URL
 */
export async function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read image contents.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Read File object as Text
 */
export async function readFileAsText(file) {
  if (file.text) {
    return await file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read text contents.'));
    reader.readAsText(file);
  });
}

/**
 * Trigger immediate browser download of a Blob or Uint8Array
 */
export function triggerDownload(data, filename, mimeType = 'application/pdf') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  activeObjectURLs.add(url);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Auto-revoke after 60 seconds
  setTimeout(() => {
    if (activeObjectURLs.has(url)) {
      URL.revokeObjectURL(url);
      activeObjectURLs.delete(url);
    }
  }, 60000);

  return url;
}

/**
 * Clean up all tracked object URLs
 */
export function cleanupObjectURLs() {
  activeObjectURLs.forEach(url => URL.revokeObjectURL(url));
  activeObjectURLs.clear();
}
