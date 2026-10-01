/** 烟雾测试：不做交互，直接问一句，看苏念怎么回。 */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Brain } from './src/brain.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(join(HERE, 'config.json'), 'utf8'));

const input = process.argv.slice(2).join(' ') || '今天被老板当着全组骂了，方案熬了三个通宵他说是垃圾';

const brain = new Brain(config);
await brain.init();

console.log('输入: ' + input);
console.log('模型: ' + config.provider.model);
console.log('---');

const t0 = Date.now();
const r = await brain.respond(input);
console.log('耗时: ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
console.log('降级: ' + (r.degraded ? '是（模型没按 JSON 返回）' : '否'));
console.log('阶段: ' + JSON.stringify(r.state));
console.log('消息条数: ' + r.messages.length);
console.log('---');
for (let i = 0; i < r.messages.length; i++) {
  console.log('[' + (r.delays[i] / 1000).toFixed(1) + 's] ' + r.messages[i]);
}
