import { defineConfig } from 'vite';

// Vite config tuned for Phaser + Cloudflare Pages.
// `dist` is the default build output directory that Cloudflare Pages serves.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Phaser is large; raise the warning ceiling and split it into its own chunk.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
