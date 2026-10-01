/**
 * 苏念 · 入口
 *
 *   node src/index.js --cli     本地对话（默认女朋友角色）
 *   node src/index.js           连 NapCat，按 QQ 号分角色
 *
 * 角色规则（config.json）：
 *   users: { "<QQ号>": { "role": "girlfriend", "nickname": "ybh" } }
 *   defaultRole: "friend"     ← 不在 users 里的人，一律当普通朋友
 */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { Brain } from './brain.js';
import { NapCatClient } from './napcat.js';
import { sleep } from './pacing.js';
import { stamp, clearHistory } from './memory.js';
import { loadApiKey, maskKey } from './credentials.js';
import { shouldReachOut, composeReachOut, markReachedOut } from './proactive.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

function line(s) { process.stdout.write(s + '\n'); }
function ts() { return new Date().toLocaleTimeString('zh-CN', { hour12: false }); }
function log(s) { line('[' + ts() + '] ' + s); }

async function loadConfig() {
  const raw = await readFile(join(ROOT, 'config.json'), 'utf8');
  return JSON.parse(raw);
}

/** 这个 QQ 号对应什么角色 */
export function roleOf(config, userId) {
  const key = String(userId);
  const users = config.users || {};
  if (users[key] && users[key].role) return users[key].role;
  // 兼容旧的单用户配置
  if (config.owner && config.owner.qq && String(config.owner.qq) === key) return 'girlfriend';
  return config.defaultRole || 'friend';
}

/** 这个 QQ 号的昵称（写档案模板用） */
export function nicknameOf(config, userId) {
  const key = String(userId);
  const users = config.users || {};
  if (users[key] && users[key].nickname) return users[key].nickname;
  if (config.owner && String(config.owner.qq) === key) return config.owner.nickname || '';
  return '';
}

async function deliver(parsed) {
  for (let i = 0; i < parsed.messages.length; i++) {
    await sleep(parsed.delays[i]);
    line('');
    line('  ' + stamp() + '  (' + (parsed.delays[i] / 1000).toFixed(1) + 's)');
    line('  ' + parsed.messages[i]);
  }
  line('');
  if (parsed.degraded) line('  [!] 模型这次没按 JSON 返回，已降级处理');
  line('');
}

/* ---------------------------------- CLI ---------------------------------- */

async function cli() {
  const config = await loadConfig();
  line('======================================');
  line('  苏念 · 本地对话测试');
  line('======================================');

  const role = process.argv.includes('--friend') ? 'friend' : 'girlfriend';
  const brain = new Brain(config, 'local', role, config.owner ? config.owner.nickname : '');
  await brain.init();

  const { key, source } = await loadApiKey(config.provider.apiKeyRefs);
  line('模型    : ' + brain.llm.model);
  line('接口    : ' + brain.llm.baseUrl);
  line('密钥    : ' + maskKey(key) + '  (' + source + ')');
  line('角色    : ' + (role === 'girlfriend' ? '女朋友' : '普通朋友') + (process.argv.includes('--friend') ? '（--friend 指定）' : ''));
  line('记忆    : data/users/local/');
  line('历史    : ' + brain.history.length + ' 条');
  line('');
  line('直接打字和她说话。/quit 退出，/clear 清空历史。');
  line('（加 --friend 参数可以体验「普通朋友」模式）');
  line('--------------------------------------');

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  const queue = [];
  let running = true;
  rl.on('line', (raw) => queue.push(raw));

  while (running) {
    if (queue.length === 0) { await sleep(80); continue; }
    const text = String(queue.shift()).trim();
    if (!text) continue;
    if (text === '/quit' || text === '/exit') break;
    if (text === '/clear') {
      await clearHistory(brain.userId);
      brain.history = [];
      line('  （对话历史已清空，档案和情绪日志保留）');
      continue;
    }
    line('');
    line('  你 ' + stamp());
    line('  ' + text);
    try {
      await deliver(await brain.respond(text));
    } catch (err) {
      line('');
      line('  [x] ' + err.message);
      line('');
    }
  }
  rl.close();
  line('（苏念下线了）');
}

/** 她是不是在睡觉 */
function isSleeping(config) {
  const s = config.schedule || {};
  const sleepHour = s.sleepHour === undefined ? 1 : s.sleepHour;
  const wakeHour = s.wakeHour === undefined ? 8 : s.wakeHour;
  const h = new Date().getHours();
  return h >= sleepHour && h < wakeHour;
}

/** 现在是她的安静时段吗（不主动打扰） */
function isQuietHour(config) {
  const q = (config.proactive && config.proactive.quietHours) || [];
  return q.indexOf(new Date().getHours()) >= 0;
}

/** 今天日期字符串 */
function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

/* ---------------------------------- QQ ----------------------------------- */

async function qq() {
  const config = await loadConfig();
  const { key, source } = await loadApiKey(config.provider.apiKeyRefs);
  log('模型 ' + config.provider.model + '  密钥 ' + maskKey(key) + ' (' + source + ')');

  const brains = new Map();       // userId -> Brain
  const pendingMorning = new Map(); // userId -> 她睡觉时收到的消息
  const proactiveState = { date: null, count: 0 };  // 今天主动找过几次

  const queues = new Map();    // userId -> 待处理消息
  const working = new Set();   // 正在回复的 userId

  async function getBrain(userId) {
    const k = String(userId);
    if (brains.has(k)) return brains.get(k);
    const role = roleOf(config, k);
    const b = new Brain(config, k, role, nicknameOf(config, k));
    await b.init();
    brains.set(k, b);
    log('新会话: ' + k + '  角色=' + (role === 'girlfriend' ? '女朋友' : '普通朋友')
      + '  历史 ' + b.history.length + ' 条');
    return b;
  }

  async function pump(userId) {
    const k = String(userId);
    if (working.has(k)) return;
    working.add(k);
    try {
      const q = queues.get(k) || [];
      while (q.length) {
        const msg = q.shift();
        try {
          const brain = await getBrain(k);
          const parsed = await brain.respond(msg.text, msg.images);
          log('-> ' + k + '  (' + parsed.messages.length + ' 条)');
          parsed.messages.forEach(m => log('   ' + (brain.role === 'girlfriend' ? '女友' : '朋友') + ': ' + m));
          await client.sendSequence(msg.userId, parsed.messages, parsed.delays, {
            onSent: () => {}
          });
        } catch (err) {
          log('[x] 处理 ' + k + ' 失败: ' + err.message);
        }
      }
    } finally {
      working.delete(k);
    }
  }

  const client = new NapCatClient({
    url: config.qq.wsUrl,
    token: config.qq.token,
    onLog: log,
    onPrivate: (ev) => {
      if (!ev.text || !ev.text.trim()) return;
      const k = String(ev.userId);

      // 她在睡觉：先收着，等早上醒来再回（比当场秒回真实得多）
      if (isSleeping(config) && config.schedule && config.schedule.sleepReply === false) {
        if (!pendingMorning.has(k)) pendingMorning.set(k, []);
        pendingMorning.get(k).push(ev);
        log("<- " + k + " [她在睡觉，先收着] " + ev.text);
        return;
      }
      const allowed = config.allowStrangers !== false;
      const role = roleOf(config, k);
      if (!allowed && role !== 'girlfriend') {
        log('忽略陌生人: ' + k);
        return;
      }
      log('<- ' + k + '  [' + (role === 'girlfriend' ? '女友' : '朋友') + ']: ' + ev.text + (ev.images && ev.images.length ? '  [图片 x' + ev.images.length + ']' : ''));
      if (!queues.has(k)) queues.set(k, []);
      queues.get(k).push(ev);
      pump(k);
    }
  });

  client.connect();

  // ── 定时任务：早上补回夜里攒下的消息 + 主动找他 ──
  const TICK = (config.proactive && config.proactive.checkIntervalMinutes || 30) * 60 * 1000;

  async function tick() {
    if (isSleeping(config)) return;   // 她还在睡，什么都不做

    // 1) 夜里攒下的消息，趁刚醒补回
    for (const [k, list] of [...pendingMorning.entries()]) {
      if (!list.length) continue;
      pendingMorning.delete(k);
      try {
        const brain = await getBrain(k);
        const merged = list.map(m => m.text).join(String.fromCharCode(10));
        const withHint = "（这些是他昨晚发的，你刚醒才看到）" + String.fromCharCode(10) + merged;
        log("<- " + k + " [早上补回] " + merged.slice(0, 40));
        const parsed = await brain.respond(withHint);
        await client.sendSequence(k, parsed.messages, parsed.delays, {});
        parsed.messages.forEach(m => log("   补回: " + m));
      } catch (e) {
        log("[x] 补回 " + k + " 失败: " + e.message);
      }
    }

    // 2) 主动找他
    for (const [k, brain] of brains.entries()) {
      if (brain.role !== "girlfriend") continue;
      const gate = await shouldReachOut(config, k);
      if (!gate.should) continue;
      try {
        log("主动找他: " + k + "  (" + gate.reason + ")");
        const raw = await composeReachOut(brain.llm, config, k, brain.role);
        const parsed = (await import("./brain.js")).parseReply(raw);
        const { splitLong, planDelays } = await import("./pacing.js");
        const msgs = [];
        for (const m of parsed.messages) for (const piece of splitLong(m, 25)) msgs.push(piece);
        const delays = planDelays(msgs, parsed.delays, config.pacing);
        await client.sendSequence(k, msgs, delays, {});
        await markReachedOut();
        msgs.forEach(m => log("   [主动] " + m));
      } catch (e) {
        log("[x] 主动消息失败: " + e.message);
      }
    }
  }

  setInterval(tick, TICK);
  setTimeout(tick, 60000);   // 启动 1 分钟后先跑一次

  process.on('SIGINT', () => {
    log('收到退出信号，正在断开');
    client.close();
    process.exit(0);
  });

  setInterval(() => {
    if (client.connected) {
      log('在线 · 会话 ' + brains.size + ' 个 · 队列中 ' + [...queues.values()].reduce((a, q) => a + q.length, 0));
    }
  }, 10 * 60 * 1000);
}

/* --------------------------------- 启动 ---------------------------------- */

const mode = process.argv.includes('--cli') ? 'cli' : 'qq';
if (mode === 'cli') {
  cli().catch((err) => { console.error('启动失败：' + err.message); process.exit(1); });
} else {
  qq().catch((err) => { console.error('启动失败：' + err.message); process.exit(1); });
}
