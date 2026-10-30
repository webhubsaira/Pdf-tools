# iLovePDFs - Online PDF Tools Suite

iLovePDFs is a complete, modern, responsive PDF tools web platform engineered with plain HTML5, CSS3, and modern JavaScript. Inspired by the clean layout and intuitive tool discovery of premium SaaS document platforms, iLovePDFs runs supported PDF operations directly inside the client's browser, eliminating server uploads and protecting user data privacy.

---

## 🚀 Key Features

- **Original Brand Identity:** Custom DocuFlow document-flow logo and coral-red accent design system (`#E84C4F`).
- **Comprehensive Tool Directory:** 24+ tools arranged across 6 core categories:
  1. **Organize PDF:** Merge PDF, Split PDF, Remove Pages, Extract Pages, Organize PDF, Rotate PDF.
  2. **Optimize PDF:** Compress PDF, Unlock PDF, Protect PDF, Flatten PDF, Repair PDF.
  3. **Convert to PDF:** JPG to PDF, PNG to PDF, HTML to PDF, Word to PDF, Excel to PDF, PowerPoint to PDF.
  4. **Convert from PDF:** PDF to JPG, PDF to PNG, PDF to Text, PDF to Word, PDF to Excel, PDF to PowerPoint.
  5. **Edit PDF:** Watermark PDF, Page Numbers, Sign PDF, Crop PDF, Compare PDF.
  6. **Additional Utilities:** PDF Metadata, PDF to ZIP, Create Blank PDF, OCR PDF.
- **Real Client-Side Operations:** Powered by `pdf-lib` and `jszip` in browser memory:
  - **Merge PDF:** Combine multiple PDF files in any order.
  - **Split PDF:** Extract custom page spans (e.g., `1-3, 5`).
  - **Remove Pages:** Delete selected pages from documents.
  - **Rotate PDF:** Rotate 90°, 180°, or 270° clockwise or counter-clockwise.
  - **Watermark PDF:** Apply centered diagonal watermark text with opacity, custom font size, and color across every page.
  - **Page Numbers:** Insert clean `Page {n} of {total}` numbering at bottom or top corners.
  - **JPG / PNG to PDF:** Convert multiple images into multi-page PDFs with portrait/landscape and margins.
  - **Compress PDF:** Streamline PDF streams, strip unreferenced objects, and calculate byte savings.
  - **PDF to Text:** Extract text streams into `.txt` documents.
  - **PDF to Word:** Convert selectable PDF text into an editable `.docx` in the browser. Scanned PDFs require OCR and are not supported by this client-side converter.
  - **PDF to ZIP:** Archive multiple documents into a single `.zip` file.
  - **Metadata:** Read and update PDF Title, Author, and Subject.
- **Transparent Server Requirements:** Office conversions (Word, Excel, PPT) and OCR clearly state backend API requirements instead of creating fake downloads.
- **Accessible & Responsive:** Fluid layouts tested across mobile (320px, 375px, 430px), tablet (768px), and desktop (1280px+).

---

## 📁 Project Structure

```text
docuflow/
├── index.html            # Main homepage with hero, search, filterable grid, CTA
├── tools.html            # Full searchable PDF tools directory
├── about.html            # Platform mission, philosophy, and privacy explanation
├── privacy.html          # Privacy policy matching client-side architecture
├── terms.html            # Terms of service agreement
├── security.html         # Technical security whitepaper and sandboxing guide
├── favicon.svg           # High-resolution SVG favicon
├── robots.txt            # Search engine crawl directives
├── sitemap.xml           # XML sitemap for SEO discovery
├── assets/
│   └── logo.svg          # DocuFlow vector logo and typography
├── css/
│   ├── style.css         # Design tokens, typography, header, hero, footer
│   ├── responsive.css    # Mobile-first breakpoints and drawer styles
│   └── tools.css         # Upload area, file queue, progress, settings, and modal
└── js/
    ├── main.js           # App controller, tool modal, search & filter logic
    ├── navigation.js     # Hamburger menu drawer & scroll observers
    ├── tools.js          # Registry data for all 6 PDF tool categories
    ├── file-handler.js   # Drag & drop, validation, ArrayBuffer, Blob downloads
    ├── pdf-tools.js      # Real PDF-Lib and JSZip document transformations
```

---

## 🛠️ Local Development

To run the local preview server:

```bash
# Install dependencies
npm install

# Start local development server on port 3000
npm run dev

# Build production assets
npm run build
```

---

## 🌐 Deploying to Hostinger

DocuFlow is designed to be deployed to any standard **Hostinger Web Hosting**, **Hostinger Cloud**, or **Hostinger VPS** plan.

### Method 1: Deploying Production Build (Recommended)

1. Build the production bundle:
   ```bash
   npm run build
   ```
2. This generates a standalone `dist/` directory containing all HTML pages, minified CSS, bundled JS, and assets.
3. Log in to your **Hostinger hPanel**.
4. Navigate to **Websites** &rarr; select your domain &rarr; click **File Manager** (or connect via FTP/SFTP using FileZilla).
5. Open the `public_html` directory.
6. Upload the contents of the `dist/` folder directly into `public_html`.
7. Your site will be live immediately at `https://yourdomain.com`.

### Method 2: Deploying Static Files Directly

If you prefer unbundled static deployment:
1. Upload the root folder (`index.html`, `tools.html`, `about.html`, `privacy.html`, `terms.html`, `security.html`, `assets/`, `css/`, `js/`) into Hostinger's `public_html`. The HTML pages map `pdf-lib` and `jszip` to ESM CDN URLs with import maps, and the `assets/` directory contains the images referenced by the HTML pages.
2. Copy `public/favicon.svg` to `public_html/favicon.svg` so the favicon URL also resolves.

### Optional: Hostinger `.htaccess` Optimization

Create a `.htaccess` file inside `public_html` for compression, caching, and security headers:

```apache
# Enable Gzip Compression
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript application/javascript application/json image/svg+xml
</IfModule>

# Browser Caching Headers
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType image/svg+xml "access plus 1 month"
  ExpiresByType text/css "access plus 1 month"
  ExpiresByType application/javascript "access plus 1 month"
</IfModule>

# Security Headers
<IfModule mod_headers.c>
  Header set X-Content-Type-Options "nosniff"
  Header set X-Frame-Options "SAMEORIGIN"
  Header set Referrer-Policy "strict-origin-when-cross-origin"
</IfModule>
```

---

## 🔒 Security & Privacy Notice

DocuFlow processes supported operations (Merge, Split, Rotate, Watermark, Compress, Page Numbers, Images to PDF, etc.) locally on the client's device using JavaScript and WebAssembly. At no point are your document contents sent to our servers.
