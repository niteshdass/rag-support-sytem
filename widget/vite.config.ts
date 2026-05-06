import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        iframe: resolve(__dirname, 'iframe.html'),
      },
    },
    outDir: 'dist',
  },
});
