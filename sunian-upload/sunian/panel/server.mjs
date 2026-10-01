/**
 * 苏念 · 控制台后端
 *
 *   node panel/server.mjs          启动控制台（默认 5757 端口）
 *
 * 提供：配置读写、模型查询、进程启停、状态查看
 */
import { createServer } from 'node:http';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PORT = Number(process.env.SUNIAN_PANEL_PORT || 5757);

// ── 小工具 ──
async function exists(p) { try { await access(p); return true; } catch { return false; } }

async function readJson(p, fallback) {
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return fallback; }
}

async function readEnv() {
  const p = join(ROOT, '.env');
  const out = {};
  try {
    const raw = await readFile(p, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 1) continue;
      out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
  } catch { /* 没有 .env */ }
  return out;
}

function maskKey(k) {
  if (!k) return '';
  if (k.length <= 12) return '***';
  return k.slice(0, 6) + '...' + k.slice(-4);
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    });
  });
}

// ── 已知的接口预设 ──
const PRESETS = [
  { name: 'Kimi（国内）', baseUrl: 'https://api.moonshot.cn/v1', models: ['kimi-k3', 'kimi-k2.6'] },
  { name: 'Kimi（国际）', baseUrl: 'https://api.moonshot.ai/v1', models: ['kimi-k3'] },
  { name: 'DeepSeek 官方', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-flash', 'deepseek-v4-pro'] },
  { name: '智谱', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4-plus'] },
  { name: 'DSH 代理', baseUrl: 'https://dsh-api.fanqiesoft.cn/chat/api/ai/openai/v1', models: ['deepseek-v4-flash', 'deepseek-v4-pro'] }
];

// ── 进程管理 ──
const procs = { napcat: null, sunian: null };

function startProc(name) {
  if (procs[name]) return { ok: false, msg: name + ' 已经在运行' };

  const NODE = join(ROOT, 'napcat', 'NapCat-Node', 'node.exe');
  let cmd, args, cwd, title;

  if (name === 'napcat') {
    cwd = join(ROOT, 'napcat', 'old', 'NapCat-v4.8.124');
    cmd = 'cmd.exe';
    args = ['/c', 'start', '"NapCat"', 'cmd', '/k', 'launcher-win10-user.bat'];
  } else {
    cwd = ROOT;
    cmd = 'cmd.exe';
    args = ['/c', 'start', '"Sunian"', 'cmd', '/k', '"' + NODE + '"', 'src/index.js'];
  }

  try {
    const p = spawn(cmd, args, { cwd, detached: true, stdio: 'ignore', windowsHide: false });
    p.unref();
    procs[name] = { pid: p.pid, at: Date.now() };
    return { ok: true, msg: name + ' 已启动' };
  } catch (e) {
    return { ok: false, msg: '启动失败: ' + e.message };
  }
}

// ── 路由 ──
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  // 界面
  if (path === '/' || path === '/index.html') {
    try {
      const html = await readFile(join(HERE, 'ui.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('读不到 ui.html: ' + e.message);
    }
    return;
  }

  // 状态
  if (path === '/api/status') {
    const cfg = await readJson(join(ROOT, 'config.json'), {});
    const env = await readEnv();
    const key = env.SUNIAN_API_KEY || '';
    const users = cfg.users || {};
    return json(res, 200, {
      ok: true,
      config: {
        baseUrl: env.SUNIAN_BASE_URL || (cfg.provider && cfg.provider.baseUrl) || '',
        model: env.SUNIAN_MODEL || (cfg.provider && cfg.provider.model) || '',
        temperature: env.SUNIAN_TEMPERATURE || String((cfg.generation && cfg.generation.temperature) || 1.0),
        maxTokens: (cfg.generation && cfg.generation.maxTokens) || 1200,
        thinkingDisabled: !!(cfg.generation && cfg.generation.thinkingDisabled),
        minGapMs: (cfg.generation && cfg.generation.minGapMs) || 0,
        keySet: !!key,
        keyMask: maskKey(key),
        keyFromEnvFile: !!env.SUNIAN_API_KEY,
        users: Object.keys(users).filter(k => !k.includes('填')),
        defaultRole: cfg.defaultRole || 'friend',
        allowStrangers: cfg.allowStrangers !== false,
        anniversary: (cfg.anniversary && cfg.anniversary.date) || '',
        sleep: cfg.schedule ? (cfg.schedule.sleepHour + ':00 - ' + cfg.schedule.wakeHour + ':00') : '',
        proactive: cfg.proactive ? cfg.proactive.enabled : false,
        proactiveRange: cfg.proactive ? (cfg.proactive.minPerDay + '-' + cfg.proactive.maxPerDay + ' 次/天') : ''
      },
      presets: PRESETS,
      procs: {
        napcat: procs.napcat ? 'running' : 'stopped',
        sunian: procs.sunian ? 'running' : 'stopped'
      },
      hasEnvFile: await exists(join(ROOT, '.env'))
    });
  }

  // 保存配置
  if (path === '/api/save' && req.method === 'POST') {
    const body = await readBody(req);

    // 写 .env
    const envLines = ['# 苏念的 API 配置（由控制台生成，不进 git）'];
    if (body.apiKey) envLines.push('SUNIAN_API_KEY=' + body.apiKey);
    else {
      const old = await readEnv();
      if (old.SUNIAN_API_KEY) envLines.push('SUNIAN_API_KEY=' + old.SUNIAN_API_KEY);
    }
    if (body.baseUrl) envLines.push('SUNIAN_BASE_URL=' + body.baseUrl);
    if (body.model) envLines.push('SUNIAN_MODEL=' + body.model);
    if (body.temperature) envLines.push('SUNIAN_TEMPERATURE=' + body.temperature);
    await writeFile(join(ROOT, '.env'), envLines.join('\n') + '\n', 'utf8');

    // 写 config.json 里的其它设置
    const cfg = await readJson(join(ROOT, 'config.json'), {});
    if (body.defaultRole) cfg.defaultRole = body.defaultRole;
    if (body.allowStrangers !== undefined) cfg.allowStrangers = body.allowStrangers;
    if (body.proactiveEnabled !== undefined && cfg.proactive) cfg.proactive.enabled = body.proactiveEnabled;
    if (body.maxTokens) cfg.generation.maxTokens = Number(body.maxTokens);
    if (body.thinkingDisabled !== undefined) cfg.generation.thinkingDisabled = body.thinkingDisabled;
    if (body.minGapMs !== undefined) cfg.generation.minGapMs = Number(body.minGapMs);
    if (body.sleepHour !== undefined && cfg.schedule) cfg.schedule.sleepHour = Number(body.sleepHour);
    if (body.wakeHour !== undefined && cfg.schedule) cfg.schedule.wakeHour = Number(body.wakeHour);
    if (body.anniversary) cfg.anniversary = { date: body.anniversary };
    await writeFile(join(ROOT, 'config.json'), JSON.stringify(cfg, null, 2) + '\n', 'utf8');

    return json(res, 200, { ok: true, msg: '已保存。改完记得重启苏念才生效。' });
  }

  // 查询模型
  if (path === '/api/models' && req.method === 'POST') {
    const body = await readBody(req);
    const env = await readEnv();
    const key = body.apiKey || env.SUNIAN_API_KEY;
    const base = (body.baseUrl || env.SUNIAN_BASE_URL || '').replace(/\/+$/, '');
    if (!key || !base) return json(res, 200, { ok: false, msg: '缺少密钥或接口地址' });

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 30000);
    try {
      const r = await fetch(base + '/models', { signal: ac.signal, headers: { Authorization: 'Bearer ' + key } });
      clearTimeout(timer);
      const txt = await r.text();
      if (!r.ok) return json(res, 200, { ok: false, msg: 'HTTP ' + r.status + '  ' + txt.slice(0, 150) });
      const j = JSON.parse(txt);
      const list = (j.data || []).map(m => m.id).sort();
      return json(res, 200, { ok: true, models: list });
    } catch (e) {
      clearTimeout(timer);
      return json(res, 200, { ok: false, msg: '连接失败: ' + String(e.message).slice(0, 80) });
    }
  }

  // 测试对话
  if (path === '/api/test' && req.method === 'POST') {
    const env = await readEnv();
    const key = env.SUNIAN_API_KEY;
    const base = (env.SUNIAN_BASE_URL || '').replace(/\/+$/, '');
    const model = env.SUNIAN_MODEL || 'kimi-k3';
    if (!key || !base) return json(res, 200, { ok: false, msg: '先在界面里填好密钥和接口地址并保存' });

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 90000);
    try {
      const r = await fetch(base + '/chat/completions', {
        method: 'POST',
        signal: ac.signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({
          model: model,
          max_tokens: 4000,
          messages: [
            { role: 'system', content: '你是苏念，19岁，用户的女朋友，异地恋。用 JSON 回复：{"messages":["..."],"delays":[3000]}' },
            { role: 'user', content: '今天好累啊' }
          ]
        })
      });
      clearTimeout(timer);
      const txt = await r.text();
      if (!r.ok) return json(res, 200, { ok: false, msg: 'HTTP ' + r.status + '  ' + txt.slice(0, 200) });
      const j = JSON.parse(txt);
      const ch = j.choices && j.choices[0];
      const content = ch && ch.message && ch.message.content;
      if (!content) return json(res, 200, { ok: false, msg: '模型没返回正文（可能是 max_tokens 太小，思考过程吃光了配额）' });
      let msgs = [];
      try { msgs = JSON.parse(content).messages || []; } catch { msgs = [content]; }
      return json(res, 200, { ok: true, model: model, reply: msgs, usage: j.usage || {} });
    } catch (e) {
      clearTimeout(timer);
      return json(res, 200, { ok: false, msg: '调用失败: ' + String(e.message).slice(0, 100) });
    }
  }

  // 启动 / 停止
  if (path === '/api/start' && req.method === 'POST') {
    const body = await readBody(req);
    return json(res, 200, startProc(body.target));
  }

  if (path === '/api/stop' && req.method === 'POST') {
    const body = await readBody(req);
    const p = procs[body.target];
    if (!p) return json(res, 200, { ok: false, msg: '没有记录到进程' });
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(p.pid), '/t', '/f'], { stdio: 'ignore' });
      } else {
        process.kill(p.pid);
      }
      delete procs[body.target];
      return json(res, 200, { ok: true, msg: '已请求停止（窗口可能需要手动关闭）' });
    } catch (e) {
      return json(res, 200, { ok: false, msg: e.message });
    }
  }

  // 打开文件夹
  if (path === '/api/open' && req.method === 'POST') {
    const body = await readBody(req);
    const map = {
      data: join(ROOT, 'data'),
      root: ROOT,
      log: join(ROOT, 'logs')
    };
    const target = map[body.what] || ROOT;
    spawn('explorer.exe', [target], { stdio: 'ignore', detached: true }).unref();
    return json(res, 200, { ok: true, msg: '已打开 ' + target });
  }

  json(res, 404, { ok: false, msg: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║        苏念 · 控制台已启动           ║');
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
  console.log('  地址:  http://127.0.0.1:' + PORT);
  console.log('  关闭:  按 Ctrl+C');
  console.log('');
});
