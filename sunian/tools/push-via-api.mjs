/**
 * 通过 GitHub API 推送仓库内容（绕过 git 和网络限制）。
 * 用法: node tools/push-via-api.mjs <token> [--dry]
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, dirname, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const TOKEN = process.argv[2];
const DRY = process.argv.includes('--dry');
const OWNER = 'YinCode-god';
const REPO = 'sunian';
const BRANCH = 'main';
const API = 'https://gh-proxy.com/https://api.github.com';

if (!TOKEN && !DRY) {
  console.log('用法: node tools/push-via-api.mjs <token> [--dry]');
  process.exit(1);
}

// 用 git 拿受跟踪的文件列表（.gitignore 已生效）
const listRaw = execFileSync('git', ['-C', ROOT, 'ls-files'], { encoding: 'utf8' });
const files = listRaw.split(/\r?\n/).filter(Boolean);
console.log('待推送文件: ' + files.length + ' 个');

// 二进制文件判断
function isBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

async function api(path, method, body) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30000);
  try {
    const res = await fetch(API + path, {
      method,
      signal: ac.signal,
      headers: {
        'Authorization': 'Bearer ' + TOKEN,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'sunian-push',
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    clearTimeout(timer);
    const txt = await res.text();
    let json = null;
    try { json = JSON.parse(txt); } catch {}
    return { status: res.status, json, text: txt };
  } catch (e) {
    clearTimeout(timer);
    return { status: 0, error: String(e.message).slice(0, 60) };
  }
}

// ── 干跑：只列出将推送的文件 ──
if (DRY) {
  console.log('');
  console.log('=== 干跑：将推送到 ' + OWNER + '/' + REPO + ' 的文件 ===');
  for (const f of files) {
    const s = await stat(join(ROOT, f));
    console.log('  ' + String(s.size).padStart(8) + '  ' + f);
  }
  console.log('');
  console.log('总计: ' + files.length + ' 个文件');
  process.exit(0);
}

// ── 真实推送 ──
console.log('');
let ok = 0, skip = 0, fail = 0;

for (const f of files) {
  const full = join(ROOT, f);
  const buf = await readFile(full);
  const binary = isBinary(buf);
  const posixPath = f.split(sep).join('/');

  // 先查是否已存在（拿 sha 用于更新）
  const head = await api('/repos/' + OWNER + '/' + REPO + '/contents/' + encodeURIComponent(posixPath).replace(/%2F/g, '/') + '?ref=' + BRANCH, 'GET');
  let sha = null;
  if (head.status === 200 && head.json && head.json.sha) sha = head.json.sha;

  const payload = {
    message: 'add ' + posixPath,
    content: buf.toString('base64'),
    branch: BRANCH
  };
  if (sha) payload.sha = sha;

  const res = await api('/repos/' + OWNER + '/' + REPO + '/contents/' + encodeURIComponent(posixPath).replace(/%2F/g, '/'), 'PUT', payload);

  if (res.status === 200 || res.status === 201) {
    ok++;
    console.log('  OK   ' + posixPath);
  } else if (res.status === 0) {
    fail++;
    console.log('  FAIL ' + posixPath + '  (' + res.error + ')');
  } else {
    fail++;
    console.log('  FAIL ' + posixPath + '  HTTP ' + res.status + '  ' + (res.text || '').slice(0, 120));
  }
}

console.log('');
console.log('完成: 成功 ' + ok + '，失败 ' + fail);
console.log('仓库地址: https://github.com/' + OWNER + '/' + REPO);
