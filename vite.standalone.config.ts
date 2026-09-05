import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'standalone-build',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/game.js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
});
