import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const imagesDir = path.resolve(rootDir, 'images')

function contentType(file: string): string {
  const ext = path.extname(file).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.svg') return 'image/svg+xml'
  return 'application/octet-stream'
}

/** Sirve /images/* desde la carpeta images/ del proyecto (dev y preview) y la copia al build. */
function serveProjectImages(): Plugin {
  return {
    name: 'serve-project-images',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/images/')) return next()
        const rel = decodeURIComponent((req.url.split('?')[0] ?? '').slice('/images/'.length))
        const file = path.normalize(path.join(imagesDir, rel))
        if (!file.startsWith(imagesDir + path.sep) && file !== imagesDir) {
          res.statusCode = 403
          res.end('Forbidden')
          return
        }
        if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
          res.statusCode = 404
          res.end('Not found')
          return
        }
        res.setHeader('Content-Type', contentType(file))
        fs.createReadStream(file).pipe(res)
      })
    },
    closeBundle() {
      if (!fs.existsSync(imagesDir)) return
      const out = path.resolve(rootDir, 'dist/images')
      fs.mkdirSync(path.dirname(out), { recursive: true })
      fs.cpSync(imagesDir, out, { recursive: true })
    },
  }
}

export default defineConfig({
  plugins: [react(), serveProjectImages()],
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['@3d-dice/dice-box'],
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
