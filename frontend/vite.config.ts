import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        // Node API (see ../api): `cd api && npm run dev` → default port 3000
        // Python FastAPI: `uvicorn ... --port 8000` — switch target if you use Python
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});
