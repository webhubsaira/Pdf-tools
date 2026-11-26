import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    globals: false,
    // pdf.js and pdf-lib are heavy; give the document tests room to run.
    testTimeout: 30000
  }
});
