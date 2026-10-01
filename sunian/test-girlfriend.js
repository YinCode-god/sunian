/** 女朋友版人格实测。 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Brain } from './src/brain.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(join(HERE, 'config.json'), 'utf8'));

// 清掉旧关系留下的上下文
await writeFile(join(HERE, 'data', 'history.json'), '[]', 'utf8');

const turns = [
  '今天特别累，什么都不想干',
  '今天跟一个女同事一起加班到十点',
  '想你了'
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
  console.log('   >> ' + (r.state.phase || '?') + ' | ' + (r.state.his_emotion || '-'));
}
