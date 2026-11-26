/**
 * pdfilove - Runtime compatibility shims
 *
 * pdf.js 6 is built for very recent engines and calls a handful of APIs that are
 * missing from Node (which our tests use) and from browsers older than roughly
 * 2024/2025. Without them, PDF text extraction and rendering fail with cryptic
 * errors such as `Promise.try is not a function`, which silently broke PDF to
 * Word / Excel / PowerPoint and OCR on older browsers.
 *
 * Every shim is additive: if the engine already provides the API, nothing is
 * touched. Each one is a small, well-specified polyfill.
 *
 * The same file is imported by the pdf.js worker shim (public/pdf-worker-shim.mjs)
 * so in-worker code sees the same APIs.
 */

/* eslint-disable no-extend-native */

/**
 * TypeScript's bundled lib files only know these APIs from ES2025, but they are
 * exactly the ones missing on older engines, so declare them locally.
 *
 * @typedef {{ try?: <T>(callback: (...args: any[]) => T, ...args: any[]) => Promise<Awaited<T>> }} PromiseWithTry
 * @typedef {{
 *   toHex?: () => string,
 *   toBase64?: () => string,
 *   fromBase64?: (text: string) => Uint8Array,
 *   fromHex?: (text: string) => Uint8Array
 * }} TypedArrayExtras
 */

/** @type {any} */
const promiseConstructor = Promise;

/** `Promise.try(fn, ...args)` — call synchronously, wrap the result in a promise. */
if (typeof promiseConstructor.try !== 'function') {
  Object.defineProperty(promiseConstructor, 'try', {
    configurable: true,
    writable: true,
    value: function promiseTry(callback, ...args) {
      return new Promise((resolve) => resolve(callback(...args)));
    }
  });
}

/** @returns {string} lowercase hex for the given bytes */
function bytesToHex(bytes) {
  let output = '';
  for (let index = 0; index < bytes.length; index += 1) {
    output += bytes[index].toString(16).padStart(2, '0');
  }
  return output;
}

/** @returns {string} base64 for the given bytes, without relying on Buffer */
function bytesToBase64(bytes) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    const triple = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    output += alphabet[(triple >> 18) & 63];
    output += alphabet[(triple >> 12) & 63];
    output += b === undefined ? '=' : alphabet[(triple >> 6) & 63];
    output += c === undefined ? '=' : alphabet[triple & 63];
  }
  return output;
}

/** @returns {Uint8Array} decoded bytes */
function base64ToBytes(text) {
  const clean = String(text).replace(/[^A-Za-z0-9+/=]/g, '');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const output = new Uint8Array(Math.floor((clean.length * 3) / 4) - (clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0));
  let cursor = 0;
  for (let index = 0; index < clean.length; index += 4) {
    const chunk = [0, 1, 2, 3].map((offset) => {
      const character = clean[index + offset];
      return character === '=' || character === undefined ? 0 : alphabet.indexOf(character);
    });
    const triple = (chunk[0] << 18) | (chunk[1] << 12) | (chunk[2] << 6) | chunk[3];
    if (cursor < output.length) output[cursor++] = (triple >> 16) & 255;
    if (cursor < output.length) output[cursor++] = (triple >> 8) & 255;
    if (cursor < output.length) output[cursor++] = triple & 255;
  }
  return output;
}

/** @returns {Uint8Array} decoded bytes */
function hexToBytes(text) {
  const clean = String(text).replace(/[^0-9a-f]/gi, '');
  const output = new Uint8Array(Math.floor(clean.length / 2));
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

const typedArrayPrototype = /** @type {any} */ (Uint8Array.prototype);

if (typeof typedArrayPrototype.toHex !== 'function') {
  Object.defineProperty(typedArrayPrototype, 'toHex', {
    configurable: true,
    writable: true,
    value: function toHex() {
      return bytesToHex(this);
    }
  });
}

if (typeof typedArrayPrototype.toBase64 !== 'function') {
  Object.defineProperty(typedArrayPrototype, 'toBase64', {
    configurable: true,
    writable: true,
    value: function toBase64() {
      return bytesToBase64(this);
    }
  });
}

const Uint8ArrayWithStatics = /** @type {any} */ (Uint8Array);

if (typeof Uint8ArrayWithStatics.fromBase64 !== 'function') {
  Object.defineProperty(Uint8ArrayWithStatics, 'fromBase64', {
    configurable: true,
    writable: true,
    value: function fromBase64(text) {
      return base64ToBytes(text);
    }
  });
}

if (typeof Uint8ArrayWithStatics.fromHex !== 'function') {
  Object.defineProperty(Uint8ArrayWithStatics, 'fromHex', {
    configurable: true,
    writable: true,
    value: function fromHex(text) {
      return hexToBytes(text);
    }
  });
}

/** True when the engine is missing something pdf.js needs. */
export const needsRuntimeCompat = typeof promiseConstructor.try !== 'function'
  || typeof typedArrayPrototype.toHex !== 'function'
  || typeof typedArrayPrototype.toBase64 !== 'function'
  || typeof Uint8ArrayWithStatics.fromBase64 !== 'function'
  || typeof Uint8ArrayWithStatics.fromHex !== 'function';

/**
 * The pdf.js worker runs in its own realm, so it needs the same shims before the
 * worker bundle is imported. Vite cannot inline this into a classic worker, so we
 * hand pdf.js a tiny module worker (public/pdf-worker-shim.mjs) that imports this
 * shim and then the real worker, and forwards its exports.
 *
 * @returns {string} worker src to use instead of the stock worker bundle
 */
export function createCompatWorkerUrl() {
  return new URL('/pdf-worker-shim.mjs', globalThis.location?.href ?? 'http://localhost/').href;
}
