import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  appType: 'mpa',
  base: './',
  server: {
    fs: {
      deny: ['context', 'context/**'],
    },
    watch: {
      ignored: ['context/**'],
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'esnext',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        avbdRegression: path.resolve(__dirname, 'avbd-regression.html'),
      },
    },
  },
});
