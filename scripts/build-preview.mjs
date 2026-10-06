import { createHash } from 'node:crypto';
import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { createLocalRepository } from '../server/local-repository.mjs';
import { publicContent, validateContent } from '../server/content.mjs';

// Render static previews contain only the selected public records and their files.
// The regular Netlify build and local server keep using the full backend API.
const root = fileURLToPath(new URL('../', import.meta.url));
const source = await readFile(resolve(root, 'content/seminars.json'));
const repository = createLocalRepository(root);
const content = await validateContent(JSON.parse(source), repository);
const output = resolve(root, 'dist-preview');
process.env.VITE_STATIC_PREVIEW = 'true';
await build({ root, build: { outDir: output } });
await mkdir(resolve(output, 'preview'), { recursive: true });
await writeFile(resolve(output, 'preview/content.json'), JSON.stringify({
  content: publicContent(content, repository),
  revision: createHash('sha256').update(source).digest('hex'),
}));
const paths = new Set(content.talks.flatMap(talk => talk.attachments || []).map(file => file.path).filter(Boolean));
for (const path of paths) {
  const target = resolve(output, path);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, path), target);
}
console.log(`Static preview: ${content.talks.length} reports, ${paths.size} attachments. Online editing is disabled.`);
