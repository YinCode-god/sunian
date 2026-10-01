/**
 * NapCat / OneBot 11 接入层。
 * 用 Node 24 自带的 WebSocket，不依赖任何第三方库。
 *
 * 前置：NapCat 里开一个「正向 WebSocket」服务端，默认 ws://127.0.0.1:3001
 */
import { sleep } from './pacing.js';

export class NapCatClient {
  constructor(opts) {
    const o = opts || {};
    this.url = o.url || 'ws://127.0.0.1:3001';
    this.token = o.token || '';
    this.onPrivate = o.onPrivate || (function () {});
    this.onLog = o.onLog || (function () {});
    this.ws = null;
    this.seq = 1;
    this.pending = new Map();
    this.connected = false;
    this.closing = false;
    this.selfId = null;
  }

  connect() {
    const url = this.token
      ? this.url + (this.url.indexOf('?') >= 0 ? '&' : '?') + 'access_token=' + encodeURIComponent(this.token)
      : this.url;

    this.onLog('正在连接 ' + url);
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.connected = true;
      this.onLog('已连上 NapCat');
    };

    ws.onmessage = (ev) => {
      let payload;
      try { payload = JSON.parse(String(ev.data)); }
      catch { return; }

      // 是 API 调用的回执
      if (payload.echo !== undefined && payload.echo !== null) {
        const waiter = this.pending.get(String(payload.echo));
        if (waiter) {
          this.pending.delete(String(payload.echo));
          if (payload.status === 'ok' || payload.retcode === 0) waiter.resolve(payload.data);
          else waiter.reject(new Error('OneBot 返回失败: ' + JSON.stringify(payload).slice(0, 200)));
        }
        return;
      }

      // 生命周期
      if (payload.post_type === 'meta_event') {
        if (payload.meta_event_type === 'lifecycle' && payload.self_id) {
          this.selfId = payload.self_id;
          this.onLog('登录身份 QQ ' + this.selfId);
        }
        return;
      }

      // 私聊消息
      if (payload.post_type === 'message' && payload.message_type === 'private') {
        const text = payload.raw_message || '';

        // 从消息段里提取图片（OneBot 11 的 message 数组格式）
        const images = [];
        if (Array.isArray(payload.message)) {
          for (const seg of payload.message) {
            if (seg && seg.type === 'image' && seg.data) {
              const url = seg.data.url || seg.data.file || '';
              if (url) images.push(url);
            }
          }
        }

        this.onPrivate({
          userId: payload.user_id,
          text: text,
          images: images,
          time: payload.time,
          messageId: payload.message_id,
          raw: payload
        });
      }
    };

    ws.onclose = () => {
      this.connected = false;
      if (this.closing) return;
      this.onLog('连接断开，5 秒后重连');
      setTimeout(() => this.connect(), 5000);
    };

    ws.onerror = () => {
      this.onLog('WebSocket 出错（可能 NapCat 还没启动）');
    };
  }

  /** 调一个 OneBot API */
  call(action, params) {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.ws) {
        reject(new Error('还没连上 NapCat'));
        return;
      }
      const echo = String(this.seq++);
      this.pending.set(echo, { resolve: resolve, reject: reject });
      try {
        this.ws.send(JSON.stringify({ action: action, params: params || {}, echo: echo }));
      } catch (err) {
        this.pending.delete(echo);
        reject(err);
        return;
      }
      setTimeout(() => {
        if (this.pending.has(echo)) {
          this.pending.delete(echo);
          reject(new Error('OneBot 调用超时: ' + action));
        }
      }, 15000);
    });
  }

  sendPrivate(userId, text) {
    return this.call('send_private_msg', { user_id: userId, message: text });
  }

  /** 按算好的节奏把多条消息逐条发出去 */
  async sendSequence(userId, messages, delays, hooks) {
    const h = hooks || {};
    for (let i = 0; i < messages.length; i++) {
      if (h.shouldAbort && h.shouldAbort()) return false;
      await sleep(delays[i]);
      if (h.shouldAbort && h.shouldAbort()) return false;
      await this.sendPrivate(userId, messages[i]);
      if (h.onSent) h.onSent(messages[i], i);
    }
    return true;
  }

  close() {
    this.closing = true;
    if (this.ws) this.ws.close();
  }
}
