/**
 * 配置与密钥的加载。
 *
 * 密钥查找顺序（先找到的先用）：
 *   1. 项目根目录的 .env 文件      ← 推荐：clone 之后自己填自己的 key
 *   2. 系统环境变量                ← CI / 临时使用
 *   3. DSH 的凭据文件              ← 本机开发时的默认来源
 *
 * .env 支持的写法（任选一种 key 名）：
 *
 *   SUNIAN_API_KEY=sk-xxxxxxxx          # 推荐
 *   DEEPSEEK_API_KEY=sk-xxxxxxxx
 *   OPENAI_API_KEY=sk-xxxxxxxx
 *
 *   # 可选：换接口地址和模型（不写就用 config.json 里的）
 *   SUNIAN_BASE_URL=https://api.deepseek.com/v1
 *   SUNIAN_MODEL=deepseek-chat
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = join(HERE, '..');
export const ENV_PATH = join(PROJECT_ROOT, '.env');

/** DSH 的数据目录，环境变量优先，其次用默认位置 */
export function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.ds-harness-desktop', 'dsh-home');
}

/**
 * 解析 .env 文件。
 * 支持: KEY=VALUE、带引号的值、# 注释、空行。
 */
export async function loadEnvFile() {
  let raw;
  try {
    raw = await readFile(ENV_PATH, 'utf8');
  } catch {
    return {};
  }

  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (k) out[k] = v;
  }
  return out;
}

/** 解析 DSH 凭据文件里 refs: 段下的键值对 */
export async function loadRefs() {
  const file = join(dshHome(), '.credentials.yaml');
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    throw new Error('读不到 DSH 凭据文件：' + file + '（' + err.message + '）');
  }

  const refs = {};
  let inRefs = false;
  for (const line of raw.split(/\r?\n/)) {
    if (/^refs:\s*$/.test(line)) { inRefs = true; continue; }
    if (/^\S/.test(line)) { inRefs = false; }
    if (!inRefs) continue;
    const m = line.match(/^\s+([A-Za-z0-9_]+):\s*(\S+)\s*$/);
    if (m) refs[m[1]] = m[2];
  }
  return refs;
}

/**
 * 找可用的 API key。
 * @param {string[]} candidates 候选的键名，按顺序尝试
 * @returns {Promise<{key: string, source: string}>}
 */
export async function loadApiKey(candidates) {
  const names = candidates && candidates.length
    ? candidates
    : ['SUNIAN_API_KEY', 'DEEPSEEK_API_KEY', 'OPENAI_API_KEY'];

  // 1. .env 文件
  const env = await loadEnvFile();
  for (const n of names) {
    if (env[n]) return { key: env[n], source: '.env (' + n + ')' };
  }

  // 2. 系统环境变量
  for (const n of names) {
    if (process.env[n]) return { key: process.env[n], source: 'env:' + n };
  }

  // 3. DSH 凭据文件
  try {
    const refs = await loadRefs();
    for (const n of names) {
      if (refs[n]) return { key: refs[n], source: 'DSH 凭据 (' + n + ')' };
    }
  } catch {
    // 没有 DSH 环境也正常
  }

  throw new Error(
    '没有找到 API key。请任选一种方式配置：\n' +
    '  1) 在 ' + ENV_PATH + ' 里写一行：SUNIAN_API_KEY=你的密钥\n' +
    '  2) 设置环境变量 SUNIAN_API_KEY\n' +
    '  3) 复制 .env.example 为 .env 再填'
  );
}

/**
 * .env 里可选的接口覆盖（baseUrl / model）。
 * 没写就返回空对象，由 config.json 决定。
 */
export async function loadOverrides() {
  const env = await loadEnvFile();
  const out = {};
  if (env.SUNIAN_BASE_URL) out.baseUrl = env.SUNIAN_BASE_URL;
  if (env.SUNIAN_MODEL) out.model = env.SUNIAN_MODEL;
  if (env.SUNIAN_TEMPERATURE) out.temperature = Number(env.SUNIAN_TEMPERATURE);
  return out;
}

/** 只用于打印，绝不返回完整密钥 */
export function maskKey(key) {
  if (!key) return '(空)';
  if (key.length <= 10) return '***';
  return key.slice(0, 4) + '***' + key.slice(-4);
}

/** 查配置是否就绪（给启动自检用） */
export async function describeSources(candidates) {
  const env = await loadEnvFile();
  const hasEnvFile = Object.keys(env).length > 0;
  const names = candidates && candidates.length ? candidates : ['SUNIAN_API_KEY', 'DEEPSEEK_API_KEY', 'OPENAI_API_KEY'];
  return {
    envFile: hasEnvFile ? ENV_PATH : null,
    envVars: names.filter(n => process.env[n]),
    dshHome: dshHome()
  };
}
