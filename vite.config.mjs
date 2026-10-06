import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const entry = (name) => fileURLToPath(new URL(name, import.meta.url));
let outputDirectory;
export default defineConfig({
  plugins: [{
    name: 'pdfjs-assets',
    configResolved(config) { outputDirectory = resolve(config.root, config.build.outDir); },
    async closeBundle() {
      for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
        const dest = resolve(outputDirectory, 'pdfjs', directory);
        await mkdir(dest, { recursive: true });
        await cp(entry(`./node_modules/pdfjs-dist/${directory}`), dest, { recursive: true });
      }
    },
  }],
  build: {
    rollupOptions: { input: {
      archive: entry('./index.html'),
      admin: entry('./admin.html'),
      viewer: entry('./viewer.html'),
    } },
  },
  server: {
    host: '127.0.0.1',
    fs: { deny: ['.env', '.env.*', '**/.git/**', '**/.local-data/**'] },
  },
});
