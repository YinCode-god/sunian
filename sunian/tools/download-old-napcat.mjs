/** 下载两个候选版本的 NapCat Shell。 */
import { createWriteStream } from 'node:fs';
import { mkdir, stat, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'napcat', 'old');
await mkdir(OUT, { recursive: true });

const TARGETS = [
  { ver: 'v4.9.14', note: '适配 QQ 9.9.22（与你的 9.9.21 最接近）' },
  { ver: 'v4.8.124', note: '适配 QQ 9.9.19（备选）' }
];
const MIRRORS = ['https://gh-proxy.com/', 'https://ghproxy.net/'];

async function download(ver, url, dest) {
  const ac = new AbortController();
  const res = await fetch(url, { signal: ac.signal });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const total = Number(res.headers.get('content-length') || 0);
  const started = Date.now();
  let got = 0, last = 0;
  const source = Readable.fromWeb(res.body);
  source.on('data', (c) => {
    got += c.length;
    const now = Date.now();
    if (now - last > 5000) {
      last = now;
      const mb = got / 1048576;
      console.log('    ' + (total ? (got / total * 100).toFixed(0) + '%' : '?') + '  ' + mb.toFixed(1) + ' MB  ' + (mb / ((now - started) / 1000)).toFixed(2) + ' MB/s');
    }
  });
  await pipeline(source, createWriteStream(dest));
  return { size: got, secs: (Date.now() - started) / 1000 };
}

for (const t of TARGETS) {
  console.log('');
  console.log('=== ' + t.ver + '  ' + t.note + ' ===');
  const dest = join(OUT, 'NapCat.Shell.' + t.ver + '.zip');
  await rm(dest, { force: true });

  let done = false;
  for (const m of MIRRORS) {
    const url = m + 'https://github.com/NapNeko/NapCatQQ/releases/download/' + t.ver + '/NapCat.Shell.zip';
    try {
      console.log('  通道 ' + m);
      const r = await download(t.ver, url, dest);
      console.log('  完成: ' + (r.size / 1048576).toFixed(1) + ' MB / ' + r.secs.toFixed(0) + ' 秒');
      done = true;
      break;
    } catch (e) {
      console.log('  失败: ' + e.message.slice(0, 50));
    }
  }
  if (!done) console.log('  !! ' + t.ver + ' 下载失败');
}

console.log('');
console.log('=== 结果 ===');
const files = await import('node:fs/promises').then(fs => fs.readdir(OUT));
for (const f of files) {
  const s = await stat(join(OUT, f));
  console.log('  ' + f + '  ' + (s.size / 1048576).toFixed(1) + ' MB');
}
