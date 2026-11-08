export interface BootManifest {
  configVersion: 2;
  sourceKind: 'unverified_seed';
  runtimeVerified: false;
  seedHash: string;
  summary: {
    designWidth: number;
    designHeight: number;
    worldWidthM: number;
    worldHeightM: number;
    bodyCount: number;
    arrowIds: string[];
    levelIds: string[];
  };
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('启动清单必须是对象');
  return value as Record<string, unknown>;
}
function positive(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error('启动清单包含无效尺寸/数量');
  return value;
}
function ids(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((id) => typeof id === 'string' && id.length > 0)) {
    throw new Error('启动清单缺少有效 ID 列表');
  }
  return [...value] as string[];
}

/** Small engine-facing boundary. Full seed validation is performed by tools/config, not a bundled dev dependency. */
export function readBootManifest(raw: unknown): BootManifest {
  const manifest = object(raw);
  if (manifest.formatVersion !== 1 || manifest.configVersion !== 2 || manifest.sourceKind !== 'unverified_seed' || manifest.runtimeVerified !== false) {
    throw new Error('不支持的启动清单版本/验证状态；请重新生成种子配置');
  }
  if (typeof manifest.seedHash !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.seedHash)) throw new Error('启动清单缺少 SHA-256');
  const summary = object(manifest.summary);
  const result: BootManifest = {
    configVersion: 2, sourceKind: 'unverified_seed', runtimeVerified: false, seedHash: manifest.seedHash,
    summary: {
      designWidth: positive(summary.designWidth), designHeight: positive(summary.designHeight),
      worldWidthM: positive(summary.worldWidthM), worldHeightM: positive(summary.worldHeightM),
      bodyCount: positive(summary.bodyCount), arrowIds: ids(summary.arrowIds), levelIds: ids(summary.levelIds),
    },
  };
  if (result.summary.designWidth <= result.summary.designHeight) throw new Error('启动画布必须横屏');
  return result;
}

export function describeBoot(manifest: BootManifest): string {
  const { summary } = manifest;
  return ['风暴弓手 · 配置清单',
    `${summary.designWidth} × ${summary.designHeight}  |  ${summary.worldWidthM} × ${summary.worldHeightM} m`,
    `种子配置 V${manifest.configVersion}  |  ${manifest.seedHash.slice(0, 12)}`,
    `${summary.bodyCount} 刚体规格  |  ${summary.arrowIds.length} 箭种  |  ${summary.levelIds.length} 关卡种子`,
    '配置加载完成；完整玩法与手感尚未实现/验证。',
    '当前入口：Boot → PhysicsLab；清单不代表完整种子验收。',
  ].join('\n');
}
