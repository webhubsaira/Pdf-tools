import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const rootDir = import.meta.dirname;

  return {
    root: rootDir,
    resolve: {
      alias: {
        '@': rootDir,
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(rootDir, 'index.html'),
          tools: path.resolve(rootDir, 'tools.html'),
          about: path.resolve(rootDir, 'about.html'),
          privacy: path.resolve(rootDir, 'privacy.html'),
          terms: path.resolve(rootDir, 'terms.html'),
          security: path.resolve(rootDir, 'security.html'),
        },
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
