import { spawnSync } from 'node:child_process';

const commands = [
  ['check:config', ['run', 'check:config']],
  ['config:check-generated', ['run', 'config:check-generated']],
  ['test:unit', ['run', 'test:unit']],
  ['typecheck', ['run', 'typecheck']],
];
for (const [name, args] of commands) {
  console.log(`\n=== npm ${args.join(' ')} ===`);
  const result = spawnSync('npm', args, { stdio: 'inherit', shell: false });
  if (result.error) {
    console.error(`${name} 无法启动：${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${name} 失败，退出码 ${result.status ?? 'unknown'}`);
    process.exit(result.status ?? 1);
  }
}
console.log('\nverify passed: seed validation, generated drift check, unit tests, portable typecheck.\nCreator component typing / import / build / runtime are NOT covered.');
