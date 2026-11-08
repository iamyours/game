import { _decorator, Canvas, Component, JsonAsset, Label, Node, isValid, resources } from 'cc';
import { BootRuntime } from './BootRuntime';
import { readBootManifest, type BootManifest } from './BootManifest';
import { readPhysicsLabConfig, type PhysicsLabConfig } from './PhysicsLabConfig';
import { readRigDefinition } from '../physics/RigDefinition';
import { PhysicsLab } from '../presentation/PhysicsLab';
const { ccclass, property } = _decorator;

/** Editor-facing entry point; PhysicsLab nodes are built at runtime. */
@ccclass('StormArchersBoot')
export class Boot extends Component {
  @property(Label)
  public statusLabel: Label | null = null;
  private runtime: BootRuntime<{ manifest: BootManifest; config: PhysicsLabConfig }> | null = null;

  public start(): void {
    this.show('正在加载风暴弓手种子配置…');
    this.runtime = new BootRuntime({
      loadConfig: async () => {
        const manifest = readBootManifest(await this.loadJson('config/manifest'));
        const config = readPhysicsLabConfig(await this.loadJson('config/combat'), manifest);
        const rig = readRigDefinition(await this.loadJson('config/rig'), manifest);
        return { manifest, config: { ...config, rig } };
      },
      onReady: ({ manifest, config }) => {
        const scene = this.node.scene;
        const canvas = scene?.getComponentInChildren(Canvas);
        if (!scene || !canvas) throw new Error('Boot 场景缺少 Canvas');
        const root = new Node('PhysicsLab');
        root.parent = scene;
        try { root.addComponent(PhysicsLab).setup(canvas, config, manifest.seedHash); }
        catch (error) { root.destroy(); throw error; }
        if (this.statusLabel) this.statusLabel.node.active = false;
      },
    });
    void this.runtime.start().catch((error: unknown) => {
      if (isValid(this)) this.show(`启动失败：${error instanceof Error ? error.message : String(error)}`);
      console.error('[StormArchersBoot]', error);
    });
  }

  private loadJson(path: string): Promise<unknown> {
    return new Promise((resolve, reject) => resources.load(path, JsonAsset, (error, asset) => {
      if (error) reject(error);
      else resolve(asset.json);
    }));
  }

  public onDestroy(): void { this.runtime?.dispose(); }
  private show(message: string): void {
    if (this.statusLabel !== null) this.statusLabel.string = message;
    console.info('[StormArchersBoot]', message);
  }
}
