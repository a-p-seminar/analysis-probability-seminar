import { randomBytes } from 'node:crypto';
import { mkdir, access, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../server/auth.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const envPath = resolve(root, '.env.local');
const credentials = resolve(root, '.local-data/admin-login.txt');
try {
  await access(envPath);
  if (!process.argv.includes('--rotate')) {
    console.log(`Local administrator is already configured. Credentials: ${credentials}`);
    process.exit(0);
  }
} catch {}

const password = randomBytes(20).toString('base64url');
const hash = await hashPassword(password);
const secret = randomBytes(48).toString('base64url');
await mkdir(resolve(root, '.local-data'), { recursive: true });
await writeFile(envPath, [
  '# Private configuration. Never commit this file.',
  `ADMIN_PASSWORD_HASH=${hash}`,
  `SESSION_SECRET=${secret}`,
  'GITHUB_OWNER=a-p-seminar',
  'GITHUB_REPO=analysis-probability-seminar',
  'GITHUB_BRANCH=main',
  '',
].join('\n'), { mode: 0o600 });
await writeFile(credentials, [
  '讨论班网站 · 本地管理员登录',
  '',
  '登录页面：http://127.0.0.1:5173/admin.html',
  `密码：${password}`,
  '',
  '本地模式仅修改本机数据，不会自动推送 GitHub。',
  '上线时把 .env.local 的 ADMIN_PASSWORD_HASH 和 SESSION_SECRET 配置到 Netlify。',
  'GitHub 写入令牌另行在 Netlify 配置，不能放入网页代码。',
  '此文件和 .env.local 均已被 .gitignore 排除，请妥善保存。',
  '',
].join('\n'), { mode: 0o600 });
console.log(`Administrator configured. Private login details: ${credentials}`);
console.log(`Netlify administrator environment values: ${envPath}`);
