/**
 * 节奏控制：真人不会秒回，也不会一次把话全说完。
 */
export function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

function randInt(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

/**
 * 根据消息长度和模型建议，算出每条消息的延迟。
 * 模型给的 delays 只作为参考，程序会按字数再修正一次，
 * 避免出现「一句话配 5 秒延迟」这种明显不像人的节奏。
 */
export function planDelays(messages, modelDelays, cfg) {
  const p = cfg || {};
  const min = p.minDelayMs === undefined ? 1000 : p.minDelayMs;
  const max = p.maxDelayMs === undefined ? 5000 : p.maxDelayMs;
  const cpsMin = p.minTypingCps === undefined ? 6 : p.minTypingCps;
  const cpsMax = p.maxTypingCps === undefined ? 11 : p.maxTypingCps;
  const extra = p.betweenMessagesExtraMs === undefined ? 400 : p.betweenMessagesExtraMs;

  const out = [];
  for (let i = 0; i < messages.length; i++) {
    const len = messages[i].length;
    const cps = randInt(cpsMin, cpsMax);
    // 按字数估算打字时间，1 个汉字约等于 1 次按键
    let t = Math.round((len / cps) * 1000);
    // 加上「看到消息、想一下」的反应时间
    t += randInt(300, 1200);
    if (i > 0) t += extra;
    if (t < min) t = min;
    if (t > max) t = max;
    out.push(t);
  }
  return out;
}

/**
 * 把过长的消息拆开——真人不会一口气打 80 个字。
 */
export function splitLong(text, limit) {
  const maxLen = limit || 25;
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let rest = text;
  while (rest.length > maxLen) {
    let cut = -1;
    // 优先在标点处断开
    const marks = ['，', '。', '！', '？', '、', ' ', '…'];
    for (let i = Math.min(maxLen, rest.length - 1); i > maxLen * 0.5; i--) {
      if (marks.indexOf(rest[i]) >= 0) { cut = i + 1; break; }
    }
    if (cut < 0) cut = maxLen;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks.filter(function (c) { return c.length > 0; });
}
