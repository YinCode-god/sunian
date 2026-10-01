/**
 * 苏念的大脑。
 *
 * 每个聊天对象一个实例：记忆按 QQ 号隔离，人设按关系（女朋友 / 普通朋友）区分。
 */
import { Llm } from './llm.js';
import { buildSystemPrompt } from './persona.js';
import { loadOverrides } from './credentials.js';
import * as memory from './memory.js';
import { splitLong, planDelays } from './pacing.js';

/**
 * 模型有时候会裹上 markdown 代码块或者多说两句。
 * 尽量把它逼回一个 JSON 对象；实在不行就退化成「整段话当一条消息」。
 */
export function parseReply(raw) {
  let text = String(raw || '').trim();

  const fence = text.match(/^[\s\S]*?\x60\x60\x60(?:json)?\s*([\s\S]*?)\x60\x60\x60/);
  if (fence) text = fence[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const candidate = text.slice(start, end + 1);
    try {
      const obj = JSON.parse(candidate);
      const msgs = Array.isArray(obj.messages) ? obj.messages : null;
      if (msgs && msgs.length) {
        return {
          messages: msgs.map(function (m) { return String(m).trim(); }).filter(Boolean),
          delays: Array.isArray(obj.delays) ? obj.delays : [],
          state: obj.state || {},
          raw: raw
        };
      }
    } catch { /* 落到兜底 */ }
  }

  const fallback = text.replace(/^["']|["']$/g, '').trim();
  return {
    messages: fallback ? [fallback] : ['（没说话）'],
    delays: [],
    state: {},
    raw: raw,
    degraded: true
  };
}

export class Brain {
  /**
   * @param {object} config 完整配置
   * @param {string|number} userId 聊天对象的 QQ 号
   * @param {string} role 'girlfriend' | 'friend'
   * @param {string} displayName 称呼（写进档案模板用）
   */
  constructor(config, userId, role, displayName) {
    this.config = config;
    this.userId = userId === undefined || userId === null ? 'local' : String(userId);
    this.role = role === 'girlfriend' ? 'girlfriend' : 'friend';
    this.displayName = displayName || '';

    this.llm = new Llm({
      baseUrl: config.provider.baseUrl,
      model: config.provider.model,
      apiKeyRefs: config.provider.apiKeyRefs,
      temperature: config.generation.temperature,
      maxTokens: config.generation.maxTokens,
      timeoutMs: config.generation.timeoutMs,
      thinkingDisabled: config.generation.thinkingDisabled === true,
      minGapMs: config.generation.minGapMs
    });
    this.history = [];
    this.lastInteraction = null;
  }

  async init() {
    await memory.ensureDataDir();
    await memory.ensureUserDir(this.userId, this.displayName);

    const ov = await loadOverrides();
    if (ov.baseUrl) this.llm.baseUrl = ov.baseUrl.replace(/\/+$/, '');
    if (ov.model) this.llm.model = ov.model;
    if (typeof ov.temperature === 'number' && !Number.isNaN(ov.temperature)) {
      this.llm.temperature = ov.temperature;
    }

    this.history = await memory.loadHistory(this.userId);
    return this;
  }

  /** 回复一条消息 */
  /**
   * @param {string} userText 他说的话
   * @param {string[]} images 可选，图片 URL 列表（模型支持视觉时）
   */
  async respond(userText, images) {
    const memText = await memory.loadMemory(this.userId);
    const system = buildSystemPrompt(memText, this.role);

    const messages = this.history.slice(-this.config.history.maxTurns * 2);
    messages.push(this.llm.buildMessage(userText, images));

    const raw = await this.llm.complete({ system: system, messages: messages, jsonMode: true });
    const parsed = parseReply(raw);

    this.history.push({ role: 'user', content: userText });
    this.history.push({ role: 'assistant', content: raw });
    const cap = this.config.history.maxTurns * 2;
    if (this.history.length > cap) this.history = this.history.slice(-cap);
    await memory.saveHistory(this.userId, this.history);

    await memory.appendLog(this.userId, userText, parsed.state);
    const st = parsed.state || {};
    await memory.touchWarmth(this.userId, {
      lastText: userText,
      mood: st.phase === '危机' ? '很担心他' : '平静',
      angry: false,
      daysSilent: 0
    });
    this.lastInteraction = new Date();

    const expanded = [];
    for (const m of parsed.messages) {
      for (const piece of splitLong(m, 25)) expanded.push(piece);
    }
    parsed.messages = expanded;
    parsed.delays = planDelays(expanded, parsed.delays, this.config.pacing);
    return parsed;
  }
}
