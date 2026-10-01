/**
 * 记忆系统：全部用 Markdown 文件，人和 AI 都能直接读改。
 *
 * 多用户支持：按 QQ 号隔离记忆。
 *
 *   data/
 *   ├── 苏念的日常.md              她自己的生活（全局共享，因为她只有一个人生）
 *   └── users/
 *       ├── <QQ号A>/
 *       │   ├── 用户档案.md        关于这个人的事实
 *       │   ├── 情绪日志.md        和这个人之间的时间线
 *       │   ├── 关系温度.md        和这个人最近的状态
 *       │   └── history.json       和这个人的对话历史
 *       └── <QQ号B>/
 *           └── ...
 *
 * 这样两个人同时聊，她也不会把 A 的私事说给 B 听。
 */
import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(HERE, '..', 'data');
export const USERS_DIR = join(DATA_DIR, 'users');

// 全局文件（所有用户共享）
const GLOBAL = {
  daily: join(DATA_DIR, '苏念的日常.md')
};

/** 某个用户的数据目录 */
export function userDir(userId) {
  return join(USERS_DIR, String(userId));
}

/** 某个用户的文件路径 */
export function userPaths(userId) {
  const d = userDir(userId);
  return {
    dir: d,
    profile: join(d, '用户档案.md'),
    log: join(d, '情绪日志.md'),
    warmth: join(d, '关系温度.md'),
    history: join(d, 'history.json')
  };
}

function pad(n) { return String(n).padStart(2, '0'); }

export function stamp(d) {
  const t = d || new Date();
  return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate())
    + ' ' + pad(t.getHours()) + ':' + pad(t.getMinutes());
}

export function dateOnly(d) {
  const t = d || new Date();
  return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
}

async function readOr(path, fallback) {
  try { return await readFile(path, 'utf8'); }
  catch { return fallback; }
}

/** 首次运行时创建目录与默认文件 */
export async function ensureDataDir() {
  await mkdir(USERS_DIR, { recursive: true });
  try { await readFile(GLOBAL.daily, 'utf8'); }
  catch {
    await writeFile(GLOBAL.daily, [
      '# 苏念的日常',
      '',
      '> 她自己的生活状态。全局共享 —— 她对每个人都是同一个苏念。',
      '',
      '## 今天',
      '',
      '- 还没开始',
      '',
      '## 最近在烦的',
      '',
      '- 期末论文选题还被导师压着',
      '',
      '## 一直在追的',
      '',
      '- 一部慢节奏日剧，看到第三集睡着了三次',
      '- 重读《人间失格》，不敢一次读完',
      '',
      '## 球球（多肉）',
      '',
      '- 活着，但状态一般',
      ''
    ].join('\n'), 'utf8');
  }
}

/** 为某个用户初始化数据文件 */
export async function ensureUserDir(userId, displayName) {
  const p = userPaths(userId);
  await mkdir(p.dir, { recursive: true });

  const who = displayName ? ('「' + displayName + '」') : '他';

  try { await readFile(p.profile, 'utf8'); }
  catch {
    await writeFile(p.profile, [
      '# 用户档案',
      '',
      '> 关于 ' + who + ' 的事实，慢慢积累。你可以直接编辑这个文件。',
      '',
      '## 基本情况',
      '',
      '（还没聊到）',
      '',
      '## 在意的人和事',
      '',
      '（还没聊到）',
      '',
      '## 他的习惯',
      '',
      '（还没聊到）',
      ''
    ].join('\n'), 'utf8');
  }

  try { await readFile(p.log, 'utf8'); }
  catch {
    await writeFile(p.log, [
      '# 情绪日志',
      '',
      '> 每次对话里值得记的事，程序会自动追加。',
      '',
      '| 时间 | 事情 | 情绪 | 强度 |',
      '|---|---|---|---|',
      ''
    ].join('\n'), 'utf8');
  }

  try { await readFile(p.warmth, 'utf8'); }
  catch {
    await writeFile(p.warmth, [
      '# 关系温度',
      '',
      '> 程序自动维护。',
      '',
      '- 最后一次说话：（还没聊过）',
      '- 已经几天没理她：0',
      '- 她此刻的心情：平静',
      '- 有没有在生他的气：没有',
      ''
    ].join('\n'), 'utf8');
  }
}

/**
 * 把「现在是什么时候」变成她能读懂的上下文。
 */
export async function buildTimeContext(userId) {
  const now = new Date();
  const week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
  const h = now.getHours();
  const mi = String(now.getMinutes()).padStart(2, '0');

  let period;
  if (h < 5) period = '凌晨';
  else if (h < 9) period = '早上';
  else if (h < 12) period = '上午';
  else if (h < 14) period = '中午';
  else if (h < 18) period = '下午';
  else if (h < 23) period = '晚上';
  else period = '深夜';

  const lines = [];
  lines.push('现在是 ' + now.getFullYear() + ' 年 ' + (now.getMonth() + 1) + ' 月 ' + now.getDate()
    + ' 日 星期' + week + '，' + period + ' ' + h + ':' + mi + '。');

  let mid = null;
  if (userId !== undefined && userId !== null) {
    try {
      const warmth = await readOr(userPaths(userId).warmth, '');
      const m = warmth.match(/最后一次说话：(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/);
      if (m) mid = new Date(m[1] + 'T' + m[2] + ':00');
    } catch { /* 忽略 */ }
  }

  if (mid && !isNaN(mid.getTime())) {
    const mins = Math.floor((now.getTime() - mid.getTime()) / 60000);
    if (mins < 2) lines.push('你们刚刚还在说话。');
    else if (mins < 60) lines.push('你们上一次说话是 ' + mins + ' 分钟前。');
    else if (mins < 60 * 24) lines.push('你们上一次说话是 ' + Math.floor(mins / 60) + ' 小时前。');
    else lines.push('上一次说话已经是 ' + Math.floor(mins / (60 * 24)) + ' 天前了。');
  } else {
    lines.push('你们还没正式聊过。');
  }

  lines.push('');
  lines.push('如果有人问你几点了，你会像真人一样看一眼手机再说——比如「都快十一点了」、');
  lines.push('「十点五十几，你问这个干嘛」。千万别说「我不知道」——你手上就有手机。');
  lines.push('');
  lines.push('平时不要动不动就报时间，那很假。时间感要藏在话里。');

  return lines.join('\n');
}

/** 拼出注入给模型的记忆上下文 */
export async function loadMemory(userId) {
  const p = userPaths(userId);
  const [profile, log, daily, warmth] = await Promise.all([
    readOr(p.profile, ''),
    readOr(p.log, ''),
    readOr(GLOBAL.daily, ''),
    readOr(p.warmth, '')
  ]);

  const logLines = log.split(/\r?\n/).filter(function (l) {
    const t = l.trim();
    return t.startsWith('|') && !t.includes('---') && !t.includes('时间');
  });
  const recent = logLines.slice(-20).join('\n');

  return [
    '## 现在是什么时候\n' + (await buildTimeContext(userId)),
    '## 关于他\n' + profile.trim(),
    '## 你们之间发生过的（越靠后越新）\n' + (recent || '（还没有记录）'),
    '## 你自己的生活\n' + daily.trim(),
    '## 你们现在的关系状态\n' + warmth.trim()
  ].join('\n\n');
}

/** 记一条情绪日志 */
export async function appendLog(userId, userText, state) {
  if (!state || !state.event) return false;
  const emo = state.his_emotion || '—';
  const inten = (state.intensity === null || state.intensity === undefined) ? '—' : state.intensity;
  const row = '| ' + stamp() + ' | ' + String(state.event).replace(/\|/g, '/') + ' | ' + emo + ' | ' + inten + ' |\n';
  await appendFile(userPaths(userId).log, row, 'utf8');
  return true;
}

/** 更新关系温度 */
export async function touchWarmth(userId, info) {
  const days = info.daysSilent === undefined ? 0 : info.daysSilent;
  const mood = info.mood || '平静';
  const angry = info.angry ? '有，正在生他的气' : '没有';
  const last = info.lastText ? ('「' + String(info.lastText).slice(0, 40) + '」') : '（还没聊过）';

  const body = [
    '# 关系温度',
    '',
    '> 程序自动维护。',
    '',
    '- 最后一次说话：' + stamp() + ' ' + last,
    '- 已经几天没理她：' + days,
    '- 她此刻的心情：' + mood,
    '- 有没有在生他的气：' + angry,
    ''
  ].join('\n');
  await writeFile(userPaths(userId).warmth, body, 'utf8');
}

/** 对话历史 */
export async function loadHistory(userId) {
  const raw = await readOr(userPaths(userId).history, '[]');
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export async function saveHistory(userId, history) {
  await writeFile(userPaths(userId).history, JSON.stringify(history, null, 2), 'utf8');
}

export async function clearHistory(userId) {
  await saveHistory(userId, []);
}

export const GLOBAL_PATHS = GLOBAL;
