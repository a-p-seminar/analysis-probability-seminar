import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function shouldSkipBuild(paths) {
  return paths.length > 0 && paths.every(path => /^(content|attachments|sources|docs)\//.test(path) || /^(README\.md|render\.yaml)$/.test(path));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const before = process.env.CACHED_COMMIT_REF;
  const after = process.env.COMMIT_REF;
  if (!before || !after) process.exit(1);
  try {
    const output = execFileSync('git', ['diff', '--name-only', '-z', before, after], { encoding: 'utf8' });
    const skip = shouldSkipBuild(output.split('\0').filter(Boolean));
    console.log(skip ? 'Only seminar content or documentation changed: deployment skipped.' : 'Application changed: build required.');
    process.exit(skip ? 0 : 1);
  } catch {
    // Missing refs and shallow history must never prevent an application release.
    process.exit(1);
  }
}
