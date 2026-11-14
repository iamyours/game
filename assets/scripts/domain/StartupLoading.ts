export type StartupAssetKind = 'json' | 'texture';
export interface StartupAsset { path: string; kind: StartupAssetKind; label: string; weight: number }

/** Only first-battle assets. Later biomes and music must not delay the first shot. */
export function startupAssets(arcade: boolean): StartupAsset[] {
  const json = (path: string, label: string): StartupAsset => ({ path, kind: 'json', label, weight: 1 });
  const texture = (path: string, label: string): StartupAsset => ({ path: `${path}/texture`, kind: 'texture', label, weight: 5 });
  const result = [json('config/manifest', '战斗配置'), json('config/combat', '战斗配置'), json('config/rig', '角色骨架')];
  if (arcade) result.push(texture('scenery/storm-ruins-v2', '遗迹背景'), texture('scenery/ruins-platform-v2', '符文平台'), json('scenery/ruins-art-v2', '场景切片'));
  for (const skin of ['hero', 'enemy']) {
    const name = arcade ? `${skin}-ruins-v2` : `${skin}-atlas`;
    result.push(texture(`characters/${name}`, skin === 'hero' ? '主角' : '敌人'), json(`characters/${arcade ? `${skin}-ruins-v2-frames` : `${skin}-frames`}`, '角色切片'));
  }
  for (const id of ['thunder', 'gale', 'moon']) {
    result.push(json(`weapons/${id}-art`, '弓箭切片'), texture(`weapons/${id === 'thunder' ? 'thunder-bow' : `${id}-weapon`}`, '弓箭装备'));
    if (id === 'thunder') result.push(texture('weapons/thunder-arrow', '箭矢'));
  }
  return result;
}

/** Bound parsing/downloads and drain in-flight tasks before exposing retry. */
export async function loadStartupAssets(assets: readonly StartupAsset[], load: (asset: StartupAsset) => Promise<void>,
  progress: (fraction: number, label: string) => void, concurrency = 4): Promise<void> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Invalid loading concurrency');
  let next = 0, completed = 0;
  const total = assets.reduce((sum, asset) => sum + asset.weight, 0);
  let failure: unknown;
  let failed = false;
  progress(0, '准备战场');
  await Promise.all(Array.from({ length: Math.min(concurrency, assets.length) }, async () => {
    while (!failed && next < assets.length) {
      const asset = assets[next++]!;
      try { await load(asset); completed += asset.weight; progress(total ? completed / total : 1, asset.label); }
      catch (error) { if (!failed) failure = error; failed = true; }
    }
  }));
  if (failed) throw failure;
  if (!assets.length) progress(1, '准备完成');
}
