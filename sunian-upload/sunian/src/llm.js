/**
 * 全局请求节流。
 * Kimi 低等级账号有 RPM 限制（实测每分钟 3 次），超了会直接 429。
 * 所有请求共用这一个闸门，保证任何时刻都不会超过设定速率。
 */
const gate = {
  lastAt: 0,
  minGapMs: 21000,   // 20 秒 + 1 秒余量
  chain: Promise.resolve()
};

export function setMinGap(ms) {
  gate.minGapMs = Math.max(0, Number(ms) || 0);
}

function throttle() {
  const run = gate.chain.then(async () => {
    const wait = gate.lastAt + gate.minGapMs - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    gate.lastAt = Date.now();
  });
  gate.chain = run.catch(() => {});
  return run;
}

/**
 * 模型调用：OpenAI 兼容的 chat/completions 接口。
 * 只用 Node 24 自带的 fetch，不依赖任何第三方库。
 */
import { loadApiKey } from './credentials.js';

export class Llm {
  constructor(cfg) {
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, '');
    this.model = cfg.model;
    this.temperature = cfg.temperature;
    this.maxTokens = cfg.maxTokens;
    this.timeoutMs = cfg.timeoutMs || 60000;
    this.apiKeyRefs = cfg.apiKeyRefs || [];
    this.apiKey = null;
    this.apiKeySource = null;
    // 关掉思考能快 3-5 倍（Kimi K3/K2.6 是思考模型）
    this.thinkingDisabled = cfg.thinkingDisabled === true;
    if (cfg.minGapMs !== undefined) setMinGap(cfg.minGapMs);
  }

  async ready() {
    if (!this.apiKey) {
      const { key, source } = await loadApiKey(this.apiKeyRefs);
      this.apiKey = key;
      this.apiKeySource = source;
    }
    return this;
  }

  /**
   * @param {{system: string, messages: Array<{role:string, content:string}>, jsonMode?: boolean}} opts
   * @returns {Promise<string>} 模型返回的文本
   */
  /**
   * 把纯文本消息转成多模态格式（有图时用）
   */
  buildMessage(content, images) {
    if (!images || !images.length) return { role: 'user', content: content };
    const parts = [];
    if (content && content.trim()) parts.push({ type: 'text', text: content });
    for (const url of images) {
      parts.push({ type: 'image_url', image_url: { url: url } });
    }
    return { role: 'user', content: parts };
  }

  async complete(opts) {
    await this.ready();

    const body = {
      model: this.model,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      messages: [{ role: 'system', content: opts.system }, ...opts.messages]
    };

    if (this.thinkingDisabled) {
      body.thinking = { type: 'disabled' };
      // 官方要求：关思考时 temperature 只能是 0.6
      body.temperature = 0.6;
    }
    if (opts.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res;
    try {
      await throttle();   // 排队，避免撞 RPM 限制
      res = await fetch(this.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + this.apiKey
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timer);
      throw new Error('连接模型失败：' + err.message);
    }
    clearTimeout(timer);

    const text = await res.text();
    if (!res.ok) {
      // 429：撞到速率限制，等一会儿自己重试一次
      if (res.status === 429) {
        const wait = this.minGapMs || 21000;
        await new Promise(r => setTimeout(r, wait));
        return this.complete(opts);
      }
      throw new Error('模型返回 ' + res.status + '：' + text.slice(0, 400));
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('模型返回的不是 JSON：' + text.slice(0, 400));
    }

    const choice = data.choices && data.choices[0];
    const content = choice && choice.message && choice.message.content;
    if (!content) {
      throw new Error('模型没有返回内容：' + text.slice(0, 400));
    }
    return content;
  }
}
