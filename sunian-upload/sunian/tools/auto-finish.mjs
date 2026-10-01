/**
 * 无人值守收尾：等下载完成 → 自动解压 → 生成一键启动脚本。
 * 用户睡觉期间自动跑完。
 */
import { stat, mkdir, rm, writeFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const ZIP = join(ROOT, 'napcat', 'NapCat.Shell.Windows.Node.zip');
const DEST = join(ROOT, 'napcat', 'NapCat-Node');

function log(m) { console.log('[' + new Date().toLocaleTimeString('zh-CN', { hour12: false }) + '] ' + m); }

log('等待下载完成（目标 100MB+，且 20 秒内大小不变）...');
const TARGET = 100 * 1024 * 1024;
let last = 0, stable = 0, size = 0;
const deadline = Date.now() + 45 * 60 * 1000;

while (Date.now() < deadline) {
  try { size = (await stat(ZIP)).size; } catch { size = 0; }
  if (size >= TARGET) {
    if (size === last) stable++; else stable = 0;
    last = size;
    if (stable >= 10) break;
  }
  const mb = (size / 1048576).toFixed(1);
  process.stdout.write('\r  已下载 ' + mb + ' MB / ~111.3 MB');
  await new Promise(function (r) { setTimeout(r, 2000); });
}
console.log('');

if (size < TARGET) {
  log('超时或下载不完整（只有 ' + (size / 1048576).toFixed(1) + ' MB），放弃自动解压');
  process.exit(1);
}

log('下载完成：' + (size / 1048576).toFixed(1) + ' MB，开始解压...');
await rm(DEST, { recursive: true, force: true });
await mkdir(DEST, { recursive: true });

try {
  execFileSync('powershell', ['-NoProfile', '-Command',
    'Expand-Archive -Path "' + ZIP + '" -DestinationPath "' + DEST + '" -Force'
  ], { stdio: 'ignore' });
  log('解压完成');
} catch (e) {
  log('解压失败: ' + e.message);
  process.exit(1);
}

// 看看解压出来什么
const top = await readdir(DEST, { withFileTypes: true });
log('顶层内容: ' + top.map(function (d) { return d.name + (d.isDirectory() ? '/' : ''); }).join(', '));

// 找启动器
const launchers = top.filter(function (d) { return d.isFile() && /\.(bat|cmd|exe)$/i.test(d.name); }).map(function (d) { return d.name; });
log('启动器候选: ' + (launchers.length ? launchers.join(', ') : '（无，可能在子目录）'));

// 生成一键启动脚本
const bat = [
  '@echo off',
  'chcp 65001 >nul',
  'title Sunian QQ',
  'cd /d "%~dp0napcat\\NapCat-Node"',
  'echo Starting NapCat (bundled QQ)...',
  'echo.',
  'echo If a QR code appears, scan it with YOUR ALT QQ ACCOUNT.',
  'echo Keep this window open.',
  'echo.',
  launchers.length ? 'call "' + launchers[0] + '"' : 'echo No launcher found.',
  'pause'
].join('\r\n');

await writeFile(join(ROOT, '..', 'Start-Sunian-QQ.bat'), bat, 'utf8');
log('已生成一键启动脚本: Start-Sunian-QQ.bat（在工作区根目录）');

await writeFile(join(ROOT, 'napcat', 'READY.txt'),
  'NapCat 内置QQ版已解压完成\n时间: ' + new Date().toISOString() + '\n启动器: ' + launchers.join(', ') + '\n', 'utf8');

log('全部就绪。等你醒来扫码登录即可。');
