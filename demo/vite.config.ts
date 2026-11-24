import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

// Check if source files exist, otherwise fallback to package root or build
const coreSrc = path.resolve(__dirname, '../web/packages/core/src/index.ts');
const canvasSrc = path.resolve(__dirname, '../web/packages/canvas/src/index.ts');

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@capsule-wave/core',
        replacement: fs.existsSync(coreSrc) ? coreSrc : path.resolve(__dirname, '../web/packages/core'),
      },
      {
        find: '@capsule-wave/canvas',
        replacement: fs.existsSync(canvasSrc) ? canvasSrc : path.resolve(__dirname, '../web/packages/canvas'),
      },
    ],
  },
  server: {
    port: 3000,
  },
});
