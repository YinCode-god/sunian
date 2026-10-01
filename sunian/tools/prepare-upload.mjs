/** 打包待上传内容到 sunian-upload/（不捕获子进程输出，避开沙箱限制）。 */
import { execFileSync } from 'node:child_process';
import { rm, mkdir, readdir, stat, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const WS = join(ROOT, '..');
const UP = join(WS, 'sunian-upload');
const DEST = join(UP, 'sunian');
const ZIP = join(UP, 'sunian.zip');

console.log('');
console.log('  正在准备上传内容...');
console.log('');

// 读 .git/HEAD 拿当前分支（不调子进程）
let branch = 'main';
try {
  const head = (await readFile(join(ROOT, '.git', 'HEAD'), 'utf8')).trim();
  const m = head.match(/ref:\s*refs\/heads\/(.+)/);
  if (m) branch = m[1];
} catch { /* 用默认 */ }
console.log('  当前分支: ' + branch);

// 1. 清理
await rm(UP, { recursive: true, force: true });
await mkdir(DEST, { recursive: true });

// 2. git archive（stdio 全 ignore）
console.log('  正在打包...');
execFileSync('git', ['-C', ROOT, 'archive', '--format=zip', '-o', ZIP, 'HEAD'], { stdio: 'ignore' });

// 3. 解压
console.log('  正在解压...');
execFileSync('powershell', ['-NoProfile', '-Command',
  'Expand-Archive -LiteralPath "' + ZIP + '" -DestinationPath "' + DEST + '" -Force'
], { stdio: 'ignore' });

// 4. 统计
let count = 0;
async function walk(dir) {
  for (const it of await readdir(dir, { withFileTypes: true })) {
    if (it.isDirectory()) await walk(join(dir, it.name));
    else count++;
  }
}
await walk(DEST);

const zipSize = (await stat(ZIP)).size;
const top = await readdir(DEST, { withFileTypes: true });

console.log('');
console.log('  完成！');
console.log('');
console.log('  文件数 : ' + count + ' 个');
console.log('  压缩包 : ' + (zipSize / 1024).toFixed(1) + ' KB');
console.log('  文件夹 : ' + DEST);
console.log('');
console.log('  内容:');
for (const f of top) {
  console.log('    ' + (f.isDirectory() ? '[目录] ' : '       ') + f.name);
}
