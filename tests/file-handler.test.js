import { describe, expect, it } from 'vitest';
import { formatBytes, readFileAsArrayBuffer, triggerDownload, validateFile } from '../js/file-handler.js';

const MAX_MB = 100;

function file(name, { size = 4, type = 'application/pdf' } = {}) {
  return new File([new Uint8Array(size)], name, { type });
}

describe('validateFile', () => {
  it('accepts matching extensions', () => {
    expect(validateFile(file('report.pdf'), '.pdf').valid).toBe(true);
    expect(validateFile(file('photo.JPG', { type: 'image/jpeg' }), '.jpg,.jpeg').valid).toBe(true);
  });

  it('accepts wildcard MIME types', () => {
    expect(validateFile(file('photo.png', { type: 'image/png' }), 'image/*').valid).toBe(true);
    expect(validateFile(file('doc.pdf'), 'image/*').valid).toBe(false);
  });

  it('rejects the wrong type with the accepted list in the message', () => {
    const result = validateFile(file('notes.txt', { type: 'text/plain' }), '.pdf');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not a supported file type.*\.pdf/i);
  });

  it('rejects empty files', () => {
    expect(validateFile(file('empty.pdf', { size: 0 }), '.pdf')).toMatchObject({ valid: false });
    expect(validateFile(file('empty.pdf', { size: 0 }), '.pdf').error).toMatch(/empty/i);
  });

  it('rejects files over the size limit', () => {
    const huge = { name: 'huge.pdf', type: 'application/pdf', size: (MAX_MB + 1) * 1024 * 1024 };
    expect(validateFile(huge, '.pdf').error).toMatch(/exceeds the maximum/i);
  });

  it('rejects a missing file', () => {
    expect(validateFile(null, '.pdf')).toMatchObject({ valid: false });
  });
});

describe('formatBytes', () => {
  it('formats common sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
  });
});

describe('readFileAsArrayBuffer', () => {
  it('reads the bytes of a File', async () => {
    const buffer = await readFileAsArrayBuffer(file('a.pdf', { size: 3 }));
    expect(new Uint8Array(buffer)).toHaveLength(3);
  });
});

describe('triggerDownload', () => {
  it('creates and revokes an object URL', () => {
    const created = [];
    const revoked = [];
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = (blob) => {
      created.push(blob);
      return `blob:test/${created.length}`;
    };
    URL.revokeObjectURL = (url) => revoked.push(url);

    try {
      const url = triggerDownload(new Blob(['x']), 'file.pdf', 'application/pdf');
      expect(created).toHaveLength(1);
      expect(url).toMatch(/^blob:test\//);
    } finally {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});
