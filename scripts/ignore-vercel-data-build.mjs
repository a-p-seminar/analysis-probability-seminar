import { execFileSync } from 'node:child_process';

// Exit 0 skips a Vercel build; exit 1 requests a build.
try {
  const files = execFileSync('git', ['diff', '--name-only', 'HEAD^', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').filter(Boolean);
  process.exit(files.length && files.every(path => /^(content|attachments|sources|docs|tests)\//.test(path) || path === 'README.md') ? 0 : 1);
} catch { process.exit(1); }
