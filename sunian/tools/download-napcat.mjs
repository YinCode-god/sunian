/** 从可达的镜像下载 NapCat 安装包。用法: node tools/download-napcat.mjs [文件名] */
import { createWriteStream } from 'node:fs';
import { mkdir, stat, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'napcat');

const VER = 'v4.18.28';
const FILE = process.argv[2] || 'NapCat.Shell.zip';

// 按测速结果排序：gh-proxy.com 最快
const MIRRORS = ['https://gh-proxy.com/', 'https://ghproxy.net/'];
const ORIGINAL = 'https://github.com/NapNeko/NapCatQQ/releases/download/' + VER + '/' + FILE;

await mkdir(OUT_DIR, { recursive: true });
const dest = join(OUT_DIR, FILE);

async function attempt(prefix) {
  const ac = new AbortController();
  const res = await fetch(prefix + ORIGINAL, { signal: ac.signal });
  if (!res.ok) throw new Error('HTTP ' + res.status);

  const total = Number(res.headers.get('content-length') || 0);
  const started = Date.now();
  let got = 0;
  let lastReport = 0;

  const source = Readable.fromWeb(res.body);
  source.on('data', (chunk) => {
    got += chunk.length;
    const now = Date.now();
    if (now - lastReport > 3000) {
      lastReport = now;
      const mb = got / 1048576;
      const speed = mb / ((now - started) / 1000);
      const pct = total ? (got / total * 100).toFixed(1) + '%' : '?';
      console.log('  ' + pct.padStart(6) + '  ' + mb.toFixed(1) + ' MB  ' + speed.toFixed(2) + ' MB/s');
    }
  });

  await pipeline(source, createWriteStream(dest));
  const secs = (Date.now() - started) / 1000;
  return { source: prefix, secs, total, got };
}

// 清掉之前的残缺文件
await rm(dest, { force: true });
for (const f of ['NapCat.Shell.Windows.Node.zip']) {
  await rm(join(OUT_DIR, f), { force: true });
}

let result = null;
for (const m of MIRRORS) {
  try {
    console.log('尝试通道 ' + m);
    result = await attempt(m);
    break;
  } catch (e) {
    console.log('  失败: ' + e.message);
  }
}

if (!result) {
  console.log('全部通道失败');
  process.exit(1);
}

const s = await stat(dest);
console.log('');
console.log('下载完成: ' + FILE);
console.log('  大小: ' + (s.size / 1048576).toFixed(1) + ' MB');
console.log('  用时: ' + result.secs.toFixed(1) + ' 秒');
console.log('  通道: ' + result.source);
console.log('  位置: ' + dest);
