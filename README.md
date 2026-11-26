# pdfilove - Online PDF Tools Suite

pdfilove is a browser-side PDF toolkit: 30+ tools built with plain HTML, CSS and modern JavaScript. Supported operations run entirely inside the visitor's browser with `pdf-lib`, `pdf.js`, `jszip`, `tesseract.js` and `pptxgenjs` - documents are never uploaded to a server.

- **Brand:** pdfilove, coral accent `#E84C4F`
- **Stack:** Vite + vanilla ES modules (no framework), `tsc` with `checkJs` for type checking
- **Tests:** Vitest + jsdom, 210 tests covering the PDF engine, every registered tool, page-range parsing, file validation, the dialog UI and real-format Office round trips

---

## Features

**Organize PDF** - Merge, Split (one file per page), Extract Pages, Remove Pages, Organize (reorder), Rotate.
**Optimize PDF** - Compress (rasterized or lossless, whichever is smaller), Unlock, Protect (AES-256), Flatten, Repair.
**Convert to PDF** - JPG, PNG, HTML/TXT, Word (DOCX), Excel (XLSX), PowerPoint (PPTX).
**Convert from PDF** - JPG, PNG, Text, Word, Excel, PowerPoint (selectable text only; scanned pages need OCR).
**Edit PDF** - Watermark (text, size, opacity, angle, colour), Page Numbers (five positions, custom start), Sign (typed e-signature), Crop, Compare.
**Utilities** - PDF Metadata (title/author/subject/keywords), PDF to ZIP, Create Blank PDF, OCR (English, on-device).

### Known limitations

- Standard PDF fonts are WinAnsi-only, so watermark/signature/page-number text must be Latin. Non-Latin input fails with a clear message instead of drawing `?`.
- Password-protected PDFs must be unlocked first: editing an encrypted file would silently produce a corrupt document, so the engine refuses it.
- DOCX/XLSX/PPTX layout is an approximation of Microsoft Office pagination.
- PDF to Word/Excel/PowerPoint handles selectable text; images and scanned pages are not included.
- Office to PDF renders exact layout in browsers (hidden frame + canvas). Where the browser
  cannot rasterise pages, the same content is emitted as a PDF with real, selectable text
  (tables keep their cell separators, each slide or worksheet starts a new page).
- PDF to Excel writes numbers as numbers (with currency and percentage formats where the PDF
  used them) and one worksheet per page; codes like `007` or `1.2.3` stay text.
- PDF to Word writes aligned rows as real Word tables, prose as paragraphs, and one Word
  section per PDF page, so page size, orientation and page breaks match the original.

---

## Project structure

```text
.
├── index.html            # Home: hero, uploader, featured cards, tool grid
├── tools.html            # Full searchable tool directory
├── about.html            # Mission and privacy philosophy
├── privacy.html          # Privacy policy
├── terms.html            # Terms and conditions
├── contact.html          # Support contact
├── security.html         # Security architecture write-up
├── robots.txt            # Crawl directives (absolute sitemap URL)
├── sitemap.xml           # Canonical URLs for search engines
├── assets/
│   ├── logo-512.webp     # Header/footer logo (also .png for social cards)
│   ├── logo-96.png       # Small logo
│   └── aistudio/         # Featured banner artwork
├── public/
│   ├── favicon.svg       # Primary favicon
│   └── favicon-96.png    # PNG fallback + apple-touch-icon
├── css/
│   ├── style.css         # Design tokens, header, hero, footer, scroll lock
│   ├── responsive.css    # Breakpoints, drawer, reduced motion
│   └── tools.css         # Upload zone, queue, settings, processing, modal
├── js/
│   ├── main.js           # App controller: grid, search, modal, tool execution
│   ├── navigation.js     # Mobile drawer, header elevation, year sync
│   ├── tools.js          # Tool registry (single source of truth) + JSDoc types
│   ├── file-handler.js   # Validation, ArrayBuffer/DataURL/text reading, downloads
│   ├── runtime-compat.js # Polyfills for the new APIs pdf.js 6 relies on
│   ├── pdf-worker.js     # pdf.js worker entry (shims + worker, one bundled file)
│   └── pdf-tools.js      # PDF engine (lazy-loaded chunk)
├── tests/
│   ├── pdf-tools.test.js      # Engine: merge, split, rotate, watermark, metadata…
│   ├── page-ranges.test.js    # parsePageRanges happy path + every rejection
│   ├── file-handler.test.js   # validateFile, formatBytes, downloads
│   ├── ui.test.js             # Hero routing, filter ARIA, dialog focus trap
│   ├── tool-matrix.test.js    # Every registered tool through the real engine
│   ├── tool-ui.test.js        # Every tool's dialog, settings and validation
│   ├── office-roundtrip.test.js # PDF↔DOCX/XLSX/PPTX opened with real Office parsers
│   ├── runtime-compat.test.js # pdf.js shims on engines without Promise.try & co.
│   └── fixtures/              # python-docx/openpyxl/python-pptx fixtures (+ _gen.py)
├── types/vite-env.d.ts   # Ambient types (including `*?url` imports)
├── vitest.config.ts      # jsdom test environment
└── vite.config.ts        # Multi-page build
```

### Bundle shape

`js/pdf-tools.js` is imported dynamically, so the entry chunk stays small and the legal/marketing pages do not download the PDF engine:

| chunk | size | loaded by |
| --- | --- | --- |
| `assets/main-*.js` | ~58 kB | every page |
| `assets/pdf-tools-*.js` | ~570 kB | first tool run |
| `assets/pdf-*.js` + `assets/pdf-worker-*.js` | ~1.6 MB | first pdf.js operation |

CI fails if the entry chunk grows past 200 kB, which is what happens if the engine is ever imported statically again.

---

## Local development

```bash
npm ci            # install exact dependency versions
npm run dev       # http://localhost:3000 (binds 0.0.0.0)
npm run typecheck # tsc --noEmit over js/ (checkJs enabled)
npm test          # Vitest + jsdom
npm run build     # production bundle in dist/
npm run preview   # serve dist/ on 0.0.0.0
```

Requirements: Node.js >= 20.19.

Only `package-lock.json` is committed. If you use Bun or pnpm, do not commit a second lockfile - mixed lockfiles drift and break `npm ci`.

### Conventions

- Every new tool needs an entry in `js/tools.js` (`workflow`, `accept`, `multiple`) plus a `case` in `getToolActionBtnLabel`, `getToolSpecificSettingsHTML` and `executeToolOperation` in `js/main.js`.
- The engine must refuse encrypted input through `loadEditablePdf()` and draw standard-font text through `drawStandardText()`/`measureStandardText()`.
- Add a test next to the behaviour you changed. `npm test` must pass before a PR is merged.
- Any new code that runs inside the pdf.js worker must import `js/runtime-compat.js` first;
  otherwise it breaks on engines without `Promise.try`, `Uint8Array#toHex` and friends.
- Conversion output must be checked with a real parser (see `tests/office-roundtrip.test.js`),
  not just "the ZIP has these parts".

---

## Deployment

### Vercel

`vercel.json` builds with `npm run build` and serves `dist/`.

### Hostinger / any static host

```bash
npm run build
```

Upload the **contents** of `dist/` into `public_html`. The build emits `index.html`, `tools.html`, the legal pages and hashed assets, so no bundler is needed on the host.

Recommended `.htaccess` additions:

```apache
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json image/svg+xml
</IfModule>

<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType image/svg+xml "access plus 1 month"
  ExpiresByType image/webp "access plus 1 month"
  ExpiresByType text/css "access plus 1 year"
  ExpiresByType application/javascript "access plus 1 year"
</IfModule>

<IfModule mod_headers.c>
  Header set X-Content-Type-Options "nosniff"
  Header set X-Frame-Options "SAMEORIGIN"
  Header set Referrer-Policy "strict-origin-when-cross-origin"
</IfModule>
```

Serve over HTTPS: `PDF Protect` uses `crypto.subtle`, which browsers only expose in secure contexts.

Update `sitemap.xml`, `robots.txt` and the `canonical`/`og:url` tags if you deploy to a domain other than `https://pdfilove.com`.

---

## Security and privacy

- Documents are read into memory in the browser and never transmitted. There is no backend in this repository.
- No API keys are needed. `.env.example` documents optional settings only; keep real values in an ignored `.env`.
- Never put secrets in browser code or `VITE_*` variables - they are shipped to visitors.
- `.github/workflows/secret-scan.yml` runs Gitleaks on pushes and pull requests. A scan is a safety net, not a guarantee; rotate any credential that was ever committed.

---

## License

MIT - see [LICENSE](LICENSE).
