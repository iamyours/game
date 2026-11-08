import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function readJsonIfPresent(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

export function projectBlockers(root, { requireScene = false } = {}) {
  const blockers = [];
  const lock = readJsonIfPresent(join(root, 'configs/engine.lock.json'));
  const pkg = readJsonIfPresent(join(root, 'package.json'));
  if (!lock || typeof lock.patch !== 'string' || !/^3\.8\.\d+$/.test(lock.patch)) {
    blockers.push('configs/engine.lock.json 尚未锁定实际 Creator 3.8.x 小版本');
  }
  const version = pkg?.creator?.version;
  if (typeof version !== 'string') blockers.push('当前目录不是编辑器生成的 Creator 工程（package.json 缺少 creator.version）');
  else if (version !== lock?.patch) blockers.push(`工程版本 ${version} 与引擎锁 ${lock?.patch} 不一致`);
  if (!existsSync(join(root, 'temp/tsconfig.cocos.json'))) blockers.push('缺少编辑器实际导入生成的 temp/tsconfig.cocos.json');
  if (requireScene) {
    const scenePath = join(root, 'assets/scenes/Boot.scene');
    if (!existsSync(scenePath)) blockers.push('缺少编辑器生成的 assets/scenes/Boot.scene');
    const meta = readJsonIfPresent(`${scenePath}.meta`);
    if (typeof meta?.uuid !== 'string' || meta.uuid.length === 0) blockers.push('缺少 Boot.scene 的合法 meta UUID');
  }
  return blockers;
}

/** Creator 3.8 documents status 36 as build success; ordinary zero is not accepted as proof of a build. */
export function normalizeCreatorBuildStatus(status) {
  return status === 36 ? 0 : status === 0 || status === null ? 1 : status;
}

export function creatorBuildArgs(root, bootUuid) {
  return ['--project', root, '--build', `platform=web-desktop;debug=true;startScene=${bootUuid}`];
}
