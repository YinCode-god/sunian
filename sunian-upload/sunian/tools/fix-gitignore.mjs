/** 用 UTF-8 修正 .gitignore，并把本机备忘移出跟踪。 */
import { readFile, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

const ROOT = 'C:/Users/yinbe/Documents/ds-harness-desktop/WorkSpace/sunian';

const gitignore = [
  '# ── 隐私：她的记忆和你们的对话，绝不外传 ──',
  'data/',
  '*.credentials.yaml',
  '',
  '# ── 本机专属信息（QQ号、路径、部署备忘）──',
  '本机配置备忘.md',
  '',
  '# ── 你自己的 API 密钥（模板 .env.example 会提交，.env 不会）──',
  '.env',
  '.env.local',
  '.env.*.local',
  '',
  '# ── 大文件 / 二进制 ──',
  'napcat/',
  'qq-installer/',
  '*.zip',
  '*.7z',
  '*.exe',
  '*.node',
  '*.dll',
  '',
  '# ── 运行时输出 ──',
  'logs/',
  '*.log',
  'console.txt',
  'napcat_console.txt',
  '主动性状态.json',
  '',
  '# ── 编辑器 / 系统 ──',
  '.vscode/',
  '.idea/',
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
  ''
].join('\n');

await writeFile(ROOT + '/.gitignore', gitignore, 'utf8');
console.log('OK .gitignore 已用 UTF-8 重写');

// 把本机备忘移出跟踪（保留本地文件）
const run = (cmd) => {
  try { return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }); }
  catch (e) { return 'ERR: ' + String(e.message).slice(0, 100); }
};

console.log(run('git rm --cached "本机配置备忘.md"'));
console.log(run('git add -A'));
console.log(run('git commit -q -m "修正 .gitignore 编码，排除本机专属信息"'));
console.log('');
console.log('=== 受跟踪文件 ===');
const files = run('git ls-files').split(/\r?\n/).filter(Boolean);
console.log('共 ' + files.length + ' 个');
const risky = files.filter(f => /^data\/|^\.env$|本机配置备忘|历史/.test(f));
console.log(risky.length ? ('!! 仍含敏感文件: ' + risky.join(', ')) : 'OK 无敏感文件');
console.log('');
files.forEach(f => console.log('  ' + f));
