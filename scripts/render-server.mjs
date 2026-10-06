import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createApi } from '../server/api.mjs';
import { createGithubRepository } from '../server/github-repository.mjs';
import { createLocalStore } from '../server/local-store.mjs';
import { createEnvironmentPassword } from '../server/environment-password.mjs';
import { createRenderPasswordSource } from '../server/render-password-source.mjs';
import { createRenderServer } from '../server/render-http.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = { ...process.env, NODE_ENV: 'production' };
if (env.RENDER !== 'true') throw new Error('This entry point requires a Render environment.');
const repository = createGithubRepository({ env });
// Only sessions, rate counters and unfinished uploads use this ephemeral store.
// Published report data and attachments are committed to GitHub; the password
// is read from Render's environment API on every authentication check.
const store = { ...createLocalStore(resolve(root, '.local-data/render-state')), mode: 'render' };
const passwords = createEnvironmentPassword({ source: createRenderPasswordSource({ env }), store, secret: env.SESSION_SECRET });
const api = createApi({ repository: { ...repository, publicUrl: path => '/' + path.split('/').map(encodeURIComponent).join('/') }, store, env, passwords });
const server = createRenderServer({ origin: env.RENDER_EXTERNAL_URL, staticRoot: resolve(root, 'dist'), api, attachmentUrl: path => repository.publicUrl(path) });
server.listen(Number(env.PORT || 10000), '0.0.0.0', () => console.log('Seminar web service is ready.'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
