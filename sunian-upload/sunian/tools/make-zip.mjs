/** 把仓库内容打包成 zip（备用方案：网页拖拽上传）。 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT_DIR = join(ROOT, '..', 'sunian-upload');
const ZIP = join(OUT_DIR, 'sunian.zip');

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

// 用 git archive 打包受跟踪文件（自动排除 gitignore 内容）
const head = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
console.log('打包提交: ' + head);

execSync('git archive --format=zip -o "' + ZIP + '" HEAD', { cwd: ROOT, stdio: 'inherit' });

const fs = await import('node:fs/promises');
const s = await fs.stat(ZIP);
console.log('');
console.log('已生成: ' + ZIP);
console.log('大小: ' + (s.size / 1024).toFixed(1) + ' KB');
console.log('');
console.log('这是备用方案：如果 token 一直搞不定，');
console.log('可以直接在 GitHub 网页上把 zip 拖进去，或者解压后拖文件夹。');
