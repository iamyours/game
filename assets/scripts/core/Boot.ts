import { _decorator, Asset, BlockInputEvents, Canvas, Color, Component, Director, Graphics, JsonAsset, Label, Node,
  Texture2D, UITransform, director, isValid, resources, view } from 'cc';
import { BootRuntime } from './BootRuntime';
import { readBootManifest, type BootManifest } from './BootManifest';
import { readPhysicsLabConfig, type PhysicsLabConfig } from './PhysicsLabConfig';
import { readRigDefinition } from '../physics/RigDefinition';
import { loadStartupAssets, startupAssets, type StartupAsset } from '../domain/StartupLoading';
import { PhysicsLab } from '../presentation/PhysicsLab';
const { ccclass, property } = _decorator;

/** Small boot scene; actual textures and attached visuals gate the first physics step. */
@ccclass('StormArchersBoot')
export class Boot extends Component {
  @property(Label)
  public statusLabel: Label | null = null;
  private runtime: BootRuntime<{ manifest: BootManifest; config: PhysicsLabConfig }> | null = null;
  private readonly held = new Map<string, Asset>();
  private readonly cancelLoads = new Set<() => void>();
  private readonly frameWaits = new Set<() => void>();
  private loadingRoot: Node | null = null;
  private background!: Graphics;
  private heading!: Label;
  private detail!: Label;
  private hint!: Label;
  private fraction = 0;
  private message = '准备战场';
  private disposed = false;
  private failure = false;

  public start(): void {
    const canvas = this.node.scene?.getComponentInChildren(Canvas);
    if (!canvas) { this.showError(new Error('Boot 场景缺少 Canvas')); return; }
    if (this.statusLabel) this.statusLabel.node.active = false;
    this.createLoadingScreen(canvas.node);
    this.runtime = new BootRuntime({
      loadConfig: async () => {
        const arcade = typeof location === 'undefined' || new URLSearchParams(location.search).get('practice') !== '1';
        await loadStartupAssets(startupAssets(arcade), asset => this.loadAsset(asset), (fraction, label) => this.progress(fraction * 0.9, `正在准备${label}`));
        if (this.disposed) throw new Error('启动已取消');
        const json = (path: string): unknown => (this.held.get(path) as JsonAsset).json;
        const manifest = readBootManifest(json('config/manifest'));
        const config = readPhysicsLabConfig(json('config/combat'), manifest);
        const rig = readRigDefinition(json('config/rig'), manifest);
        return { manifest, config: { ...config, rig } };
      },
      onReady: async ({ manifest, config }) => {
        const scene = this.node.scene;
        if (!scene || this.disposed) return;
        this.progress(0.92, '组装人物与弓箭');
        const root = new Node('PhysicsLab'); root.parent = scene;
        try {
          const lab = root.addComponent(PhysicsLab);
          lab.setup(canvas, config, manifest.seedHash, true);
          this.drawLoading();
          await lab.ready;
          if (this.disposed || !isValid(root)) return;
          this.progress(0.98, '准备进入遗迹');
          // Render the complete battlefield under the loading scrim, including the segmented bow.
          // Two actual draws allow its sprite/material uploads before simulation and input begin.
          await this.afterDraw(); await this.afterDraw();
          if (this.disposed || !isValid(root)) return;
          lab.beginBattle();
          this.progress(1, '准备完成');
          this.loadingRoot?.destroy(); this.loadingRoot = null;
          view.off('canvas-resize', this.drawLoading, this);
        } catch (error) { if (isValid(root)) root.destroy(); throw error; }
      },
    });
    this.run();
  }

  private run = (): void => {
    if (!this.runtime || this.disposed || (this.runtime.state !== 'idle' && this.runtime.state !== 'failed')) return;
    this.failure = false; this.progress(0, '准备战场');
    void this.runtime.start().catch(error => { if (!this.disposed) this.showError(error); });
  };

  private loadAsset(item: StartupAsset): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('启动已取消'));
    if (this.held.has(item.path)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error: Error | null, asset?: Asset): void => {
        if (settled) return;
        settled = true; clearTimeout(timer); this.cancelLoads.delete(cancel);
        if (error) reject(error);
        else if (!asset || this.disposed) reject(new Error('启动已取消'));
        else { asset.addRef(); this.held.set(item.path, asset); resolve(); }
      };
      const cancel = (): void => finish(new Error('启动已取消'));
      const timer = setTimeout(() => finish(new Error(`${item.label}加载超时`)), 20000);
      this.cancelLoads.add(cancel);
      const callback = (error: Error | null, asset: Asset): void => finish(error ? new Error(`${item.label}加载失败`) : null, asset);
      if (item.kind === 'texture') resources.load(item.path, Texture2D, callback);
      else resources.load(item.path, JsonAsset, callback);
    });
  }

  private afterDraw(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return new Promise(resolve => {
      const done = (): void => { director.off(Director.EVENT_AFTER_DRAW, done); this.frameWaits.delete(done); resolve(); };
      this.frameWaits.add(done); director.once(Director.EVENT_AFTER_DRAW, done);
    });
  }

  private createLoadingScreen(canvas: Node): void {
    const root = new Node('BattleLoading'); root.layer = canvas.layer; root.parent = canvas;
    root.addComponent(UITransform); root.addComponent(BlockInputEvents);
    root.on(Node.EventType.TOUCH_END, () => { if (this.failure) this.run(); });
    this.loadingRoot = root;
    this.background = root.addComponent(Graphics);
    const text = (name: string, fontSize: number, hex: string): Label => {
      const node = new Node(name); node.layer = root.layer; node.parent = root;
      const label = node.addComponent(Label); label.fontSize = fontSize; label.lineHeight = fontSize * 1.4;
      label.color = new Color().fromHEX(hex); label.overflow = Label.Overflow.SHRINK; return label;
    };
    this.heading = text('Title', 76, '#E9F3EE'); this.heading.string = '风 暴 弓 手';
    this.detail = text('Progress', 30, '#AFC8CD');
    this.hint = text('Hint', 29, '#8CAAB6');
    view.on('canvas-resize', this.drawLoading, this); this.drawLoading();
  }

  private progress(fraction: number, message: string): void {
    this.fraction = fraction; this.message = message; this.drawLoading();
  }

  private drawLoading = (): void => {
    if (!this.loadingRoot || this.disposed) return;
    const { width: w, height: h } = view.getVisibleSize(), g = this.background;
    this.loadingRoot.setSiblingIndex(this.loadingRoot.parent!.children.length - 1);
    this.loadingRoot.getComponent(UITransform)!.setContentSize(w, h);
    g.clear(); g.fillColor = new Color().fromHEX('#102936'); g.rect(-w / 2, -h / 2, w, h); g.fill();
    // A small drawn bow needs no network asset to appear on the very first Boot frame.
    g.strokeColor = new Color().fromHEX('#DDBB78'); g.lineWidth = 5;
    g.moveTo(-34, 115); g.quadraticCurveTo(80, 195, -34, 275); g.stroke();
    g.strokeColor = new Color().fromHEX('#86CBD1'); g.lineWidth = 2;
    g.moveTo(-34, 115); g.lineTo(-58, 195); g.lineTo(-34, 275); g.stroke();
    const width = Math.min(660, w * 0.65), y = -100;
    g.fillColor = new Color().fromHEX('#294754'); g.roundRect(-width / 2, y, width, 8, 4); g.fill();
    if (this.fraction > 0) { g.fillColor = new Color().fromHEX('#8BCCC8'); g.roundRect(-width / 2, y, width * this.fraction, 8, 4); g.fill(); }
    this.heading.node.setPosition(0, 30); this.detail.node.setPosition(0, -58); this.hint.node.setPosition(0, -158);
    for (const label of [this.heading, this.detail, this.hint]) label.node.getComponent(UITransform)!.setContentSize(w * 0.9, 100);
    this.detail.string = this.failure ? this.message : `${this.message}  ${Math.floor(this.fraction * 100)}%`;
    this.hint.string = this.failure ? '点击屏幕重试' : '拖动拉弓，松手放箭 · 每 5 次击败选择强化';
  };

  private showError(error: unknown): void {
    this.failure = true;
    this.message = error instanceof Error ? error.message : '资源准备失败';
    this.drawLoading();
    if (!this.loadingRoot && this.statusLabel) { this.statusLabel.node.active = true; this.statusLabel.string = '资源准备失败，请重新进入'; }
    console.error('[StormArchersBoot]', error);
  }

  public onDestroy(): void {
    this.disposed = true; this.runtime?.dispose();
    for (const cancel of this.cancelLoads) cancel(); this.cancelLoads.clear();
    for (const done of this.frameWaits) done(); this.frameWaits.clear();
    view.off('canvas-resize', this.drawLoading, this);
    this.loadingRoot?.destroy(); this.loadingRoot = null;
    for (const asset of this.held.values()) asset.decRef(); this.held.clear();
  }
}
