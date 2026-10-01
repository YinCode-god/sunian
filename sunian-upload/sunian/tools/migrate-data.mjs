/**
 * 把旧版单用户记忆迁移到新的多用户结构。
 *
 * 旧:  data/用户档案.md  data/情绪日志.md  data/关系温度.md  data/history.json
 * 新:  data/users/<你的QQ号>/ 里同样的四个文件
 *
 * 用法: node tools/migrate-data.mjs <你的QQ号>
 */
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DATA = join(ROOT, 'data');

const qq = process.argv[2];
if (!qq) {
  console.log('用法: node tools/migrate-data.mjs <你的QQ号>');
  console.log('作用: 把 data/ 根目录下的旧记忆，搬进 data/users/<QQ号>/');
  process.exit(1);
}

const DEST = join(DATA, 'users', String(qq));
await mkdir(DEST, { recursive: true });

const pairs = [
  ['用户档案.md', '用户档案.md'],
  ['情绪日志.md', '情绪日志.md'],
  ['关系温度.md', '关系温度.md'],
  ['history.json', 'history.json']
];

let moved = 0;
for (const [from, to] of pairs) {
  const src = join(DATA, from);
  const dst = join(DEST, to);
  try {
    const content = await readFile(src, 'utf8');
    const s = await stat(src);
    await writeFile(dst, content, 'utf8');
    console.log('  迁移 ' + from + '  (' + s.size + ' bytes)');
    moved++;
  } catch {
    console.log('  跳过 ' + from + '（不存在）');
  }
}

// 苏念的日常.md 留在原地（全局共享）
console.log('');
console.log('已迁移 ' + moved + ' 个文件到: ' + DEST);
console.log('（苏念的日常.md 保留在 data/ 根目录，她对所有人都是同一个苏念）');
console.log('');
console.log('旧文件仍在原位，确认无误后可以手动删除。');
