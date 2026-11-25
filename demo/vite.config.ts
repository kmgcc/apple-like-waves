import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

// Check if source files exist, otherwise fallback to package root or build
const coreSrc = path.resolve(__dirname, '../web/packages/core/src/index.ts');
const canvasSrc = path.resolve(__dirname, '../web/packages/canvas/src/index.ts');

export default defineConfig({
  base: './',
  resolve: {
    alias: [
      {
        find: '@alwave/core',
        replacement: fs.existsSync(coreSrc) ? coreSrc : path.resolve(__dirname, '../web/packages/core'),
      },
      {
        find: '@alwave/canvas',
        replacement: fs.existsSync(canvasSrc) ? canvasSrc : path.resolve(__dirname, '../web/packages/canvas'),
      },
    ],
  },
  server: {
    port: 3000,
  },
});
