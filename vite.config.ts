import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

function mediapipeWasmPlugin() {
  return {
    name: 'mediapipe-wasm',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (!req.url?.startsWith('/wasm/')) return next();
        const cleanPath = req.url.replace(/\?.*$/, '');
        const filePath = path.resolve(__dirname, 'public', cleanPath.startsWith('/') ? cleanPath.slice(1) : cleanPath);
        try {
          const content = fs.readFileSync(filePath);
          if (filePath.endsWith('.wasm'))
            res.setHeader('Content-Type', 'application/wasm');
          else if (filePath.endsWith('.js'))
            res.setHeader('Content-Type', 'application/javascript');
          else if (filePath.endsWith('.task'))
            res.setHeader('Content-Type', 'application/octet-stream');
          // Allow cross-origin embedding as credentialless
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(content);
        } catch {
          res.statusCode = 404;
          res.end('Not found');
        }
      });
    },
    configurePreviewServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (!req.url?.startsWith('/wasm/')) return next();
        const cleanPath = req.url.replace(/\?.*$/, '');
        const filePath = path.resolve(__dirname, 'dist', cleanPath.startsWith('/') ? cleanPath.slice(1) : cleanPath);
        try {
          const content = fs.readFileSync(filePath);
          if (filePath.endsWith('.wasm'))
            res.setHeader('Content-Type', 'application/wasm');
          else if (filePath.endsWith('.js'))
            res.setHeader('Content-Type', 'application/javascript');
          else if (filePath.endsWith('.task'))
            res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(content);
        } catch {
          res.statusCode = 404;
          res.end('Not found');
        }
      });
    },
  }
}

export default defineConfig({
  plugins: [mediapipeWasmPlugin(), react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  worker: {
    format: 'es',
  },
})
