/**
 * pdfilove - pdf.js worker entry
 *
 * pdf.js 6 needs a few APIs that older engines do not have (see runtime-compat.js), and
 * the worker runs in its own realm, so it needs those shims installed before the worker
 * bundle is evaluated. Importing the compat module first guarantees that.
 *
 * In a dedicated worker this module also starts the message handler on the worker's own
 * port; that is what turns the bundled file into a working pdf.js worker. On the main
 * thread it only publishes `globalThis.pdfjsWorker`, which is how pdf.js finds the
 * handler when Web Workers are unavailable and it falls back to the main thread.
 */
import './runtime-compat.js';
import { WorkerMessageHandler } from 'pdfjs-dist/build/pdf.worker.min.mjs';

globalThis.pdfjsWorker = { WorkerMessageHandler };

// `WorkerGlobalScope` is not in the DOM typings, hence the local narrowing.
const workerScope = /** @type {any} */ (globalThis).WorkerGlobalScope;
const inDedicatedWorker = typeof workerScope === 'function' &&
  typeof self !== 'undefined' &&
  self instanceof workerScope;

if (inDedicatedWorker) {
  WorkerMessageHandler.initializeFromPort(self);
}
