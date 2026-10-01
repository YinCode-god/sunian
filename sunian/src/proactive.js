/**
 * 主动消息：她每天至少找他一次。
 *
 * 原则：
 *   - 每天至少 1 次，最多 3 次（不烦人）
 *   - 安静时段（她的睡觉时间）不发
 *   - 优先接上次聊过的话题；也可以直接说她自己想说的
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMemory } from './memory.js';
import { buildSystemPrompt } from './persona.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATE = join(ROOT, 'data', '主动性状态.json');

function pad(n) { return String(n).padStart(2, '0'); }
function today() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

async function readState() {
  try {
    return JSON.parse(await readFile(STATE, 'utf8'));
  } catch {
    return { date: null, count: 0, lastAt: null };
  }
}

async function writeState(s) {
  await writeFile(STATE, JSON.stringify(s, null, 2), 'utf8');
}

/** 记一次主动 */
export async function markReachedOut() {
  const s = await readState();
  const t = today();
  if (s.date !== t) { s.date = t; s.count = 0; }
  s.count += 1;
  s.lastAt = new Date().toISOString();
  await writeState(s);
}

/** 今天主动过几次 */
export async function countToday() {
  const s = await readState();
  return s.date === today() ? s.count : 0;
}

/**
 * 现在该主动找他吗？
 * @returns {{should: boolean, reason: string}}
 */
export async function shouldReachOut(config, userId) {
  const c = config.proactive || {};
  if (!c.enabled) return { should: false, reason: '主动消息未开启' };

  const hour = new Date().getHours();
  const quiet = c.quietHours || [];
  if (quiet.indexOf(hour) >= 0) return { should: false, reason: '她的睡觉时间（' + hour + ' 点）' };

  const n = await countToday();
  const max = c.maxPerDay === undefined ? 3 : c.maxPerDay;
  if (n >= max) return { should: false, reason: '今天已经找过 ' + n + ' 次了' };

  const s = await readState();
  if (s.lastAt) {
    const gap = (Date.now() - new Date(s.lastAt).getTime()) / 3600000;
    const minGap = c.minSilentHours === undefined ? 3 : c.minSilentHours;
    if (gap < minGap) return { should: false, reason: '距上次主动才 ' + gap.toFixed(1) + ' 小时' };
  }

  return { should: true, reason: '可以找他了（今天第 ' + (n + 1) + ' 次）' };
}

/** 生成一条主动消息 */
export async function composeReachOut(llm, config, userId, role) {
  const memText = await loadMemory(userId);
  const now = new Date();
  const hour = now.getHours();
  const when = hour < 5 ? '凌晨' : hour < 9 ? '早上' : hour < 12 ? '上午'
    : hour < 14 ? '中午' : hour < 18 ? '下午' : hour < 23 ? '晚上' : '深夜';

  const system = buildSystemPrompt(memText, role) + [
    '',
    '---',
    '',
    '# 现在的情况',
    '',
    '现在是' + when + ' ' + pad(hour) + ':' + pad(now.getMinutes()) + '，你想主动找他说话。',
    '',
    '要求：',
    '- 优先接上你们上次聊过的话题——但要自然，不是复读。',
    '- 也可以直接说你自己想说的：今天遇到的事、突然想到的、你自己的心情。',
    '- 不要发「在吗」「最近怎么样」这种空话。',
    '- 一到两条就够，短。'
  ].join('\n');

  return llm.complete({
    system: system,
    messages: [{ role: 'user', content: '（现在轮到你主动开口了）' }],
    jsonMode: true
  });
}
