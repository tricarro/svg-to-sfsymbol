import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        // Node server (see ../server): `cd server && npm run dev` → default port 3000
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});
