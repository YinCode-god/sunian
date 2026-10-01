/** 写入 OneBot 配置 + 用正确授权探测 WebUI。 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = 'C:/Users/yinbe/Documents/ds-harness-desktop/WorkSpace/sunian/napcat';
const TOKEN = '088a0a9d2a4a';

const cfg = {
  network: {
    httpServers: [],
    httpSseServers: [],
    httpClients: [],
    websocketServers: [
      {
        name: 'sunian',
        enable: true,
        host: '127.0.0.1',
        port: 3001,
        messagePostFormat: 'array',
        reportSelfMessage: false,
        token: '',
        enableForcePushEvent: true,
        debug: false,
        heartInterval: 30000
      }
    ],
    websocketClients: [],
    plugins: []
  },
  musicSignUrl: '',
  enableLocalFile2Url: false,
  parseMultMsg: false
};

// 1. 找到所有 onebot11_*.json 并写入
console.log('=== 写入 OneBot 配置 ===');
for (const ver of ['NapCat-v4.8.124', 'NapCat-v4.9.14']) {
  const dir = join(BASE, 'old', ver, 'config');
  let files;
  try { files = await readdir(dir); } catch { continue; }
  for (const f of files) {
    if (!/^onebot11_.*\.json$/.test(f)) continue;
    await writeFile(join(dir, f), JSON.stringify(cfg, null, 2) + '\n', 'utf8');
    console.log('  已写入 ' + ver + '/' + f);
  }
}

// 2. 用 Bearer 授权探测 WebUI
console.log('');
console.log('=== WebUI 探测（Bearer 授权）===');
const endpoints = [
  ['/api/base/GetQQLoginInfo', 'GET'],
  ['/api/QQLogin/GetQQLoginInfo', 'GET'],
  ['/api/base/GetConfig', 'GET']
];
for (const [p, method] of endpoints) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 6000);
  try {
    const res = await fetch('http://127.0.0.1:6099' + p, {
      method,
      signal: ac.signal,
      headers: { Authorization: 'Bearer ' + TOKEN }
    });
    clearTimeout(t);
    const text = await res.text();
    console.log('  ' + p + ' -> HTTP ' + res.status + '  ' + text.slice(0, 300));
  } catch (e) {
    clearTimeout(t);
    console.log('  ' + p + ' -> 失败 ' + e.message.slice(0, 40));
  }
}
