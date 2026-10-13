import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Ishlab chiqishda /api so'rovlari API'ga uzatiladi, shuning uchun panel va API bitta manzilda ko'rinadi
// (cookie va CSRF himoyasi ishlab chiqarishdagi kabi ishlaydi).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    port: 5173,
    // Konteynerlar orasidagi sinov uchun qo'shimcha xost nomlari (vergul bilan).
    allowedHosts: (process.env.DEV_ALLOWED_HOSTS ?? '').split(',').filter(Boolean),
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:4000',
        changeOrigin: false,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
