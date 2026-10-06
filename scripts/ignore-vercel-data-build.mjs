import { execFileSync } from 'node:child_process';

// Exit 0 skips a Vercel build; exit 1 requests a build.
try {
  const before = process.env.VERCEL_GIT_PREVIOUS_SHA;
  if (!before || !/^[a-f0-9]{40}$/.test(before)) process.exit(1);
  const files = execFileSync('git', ['diff', '--name-only', '-z', before, 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean);
  process.exit(files.length && files.every(path => /^(content|attachments|sources|docs|tests)\//.test(path) || path === 'README.md') ? 0 : 1);
} catch { process.exit(1); }
