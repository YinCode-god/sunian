/** 场景测试：验证「情绪未落地只共情 → 落地后才引导」这条核心规则。 */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Brain } from './src/brain.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(join(HERE, 'config.json'), 'utf8'));

const turns = [
  '今天被老板当着全组骂了，方案熬了三个通宵他说是垃圾',
  '他说我做的东西就是一堆垃圾，当着所有人说的，我脸都烧起来了',
  '我就是觉得我是不是不适合干这行',
  '行吧，你说得对，我先去洗个澡'
];

const brain = new Brain(config);
await brain.init();

for (const t of turns) {
  console.log('');
  console.log('你: ' + t);
  const r = await brain.respond(t);
  for (let i = 0; i < r.messages.length; i++) {
    console.log('   (' + (r.delays[i] / 1000).toFixed(1) + 's) ' + r.messages[i]);
  }
  console.log('   >> phase=' + (r.state.phase || '?')
    + '  情绪=' + (r.state.his_emotion || '-')
    + '  强度=' + (r.state.intensity === null || r.state.intensity === undefined ? '-' : r.state.intensity)
    + (r.state.event ? '  记下: ' + r.state.event : ''));
}

console.log('');
console.log('================ 情绪日志.md ================');
console.log(await readFile(join(HERE, 'data', '情绪日志.md'), 'utf8'));
console.log('================ 关系温度.md ================');
console.log(await readFile(join(HERE, 'data', '关系温度.md'), 'utf8'));
