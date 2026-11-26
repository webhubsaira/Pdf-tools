/// <reference types="vite/client" />

// `pdfjs-dist/build/pdf.worker.min.mjs?url` is resolved by Vite to an asset URL string.
declare module '*?url' {
  const src: string;
  export default src;
}
