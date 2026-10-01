/** 用 Node 的 fetch 测真实网络可达性（PowerShell 那套在沙箱里不准）。 */
const targets = [
  ['基准·模型API', 'https://dsh-api.fanqiesoft.cn/chat/api/ai/openai/v1/models'],
  ['gitee', 'https://gitee.com'],
  ['npmmirror', 'https://registry.npmmirror.com'],
  ['napneko文档站', 'https://napneko.github.io/guide/boot/Shell'],
  ['github直连', 'https://github.com'],
  ['ghfast.top', 'https://ghfast.top/'],
  ['ghproxy.net', 'https://ghproxy.net/'],
  ['gh-proxy.com', 'https://gh-proxy.com/'],
  ['gh.llkk.cc', 'https://gh.llkk.cc/'],
  ['ghproxy.cc', 'https://ghproxy.cc/'],
  ['ghpxy.hwinzniej.top', 'https://ghpxy.hwinzniej.top/'],
  ['gitmirror', 'https://hub.gitmirror.com/']
];

async function probe(name, url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10000);
  const started = Date.now();
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: ac.signal, headers: { 'Range': 'bytes=0-64' } });
    clearTimeout(t);
    return { name, ok: true, status: res.status, ms: Date.now() - started };
  } catch (e) {
    clearTimeout(t);
    const msg = (e && e.cause && e.cause.code) ? e.cause.code : (e.name === 'AbortError' ? 'TIMEOUT' : e.message);
    return { name, ok: false, err: String(msg).slice(0, 60), ms: Date.now() - started };
  }
}

const results = await Promise.all(targets.map(([n, u]) => probe(n, u)));
for (const r of results) {
  if (r.ok) console.log('OK    ' + r.name.padEnd(20) + ' status=' + r.status + '  ' + r.ms + 'ms');
  else console.log('FAIL  ' + r.name.padEnd(20) + ' ' + r.err + '  ' + r.ms + 'ms');
}
