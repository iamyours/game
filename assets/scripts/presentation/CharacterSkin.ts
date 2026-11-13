import { Graphics, JsonAsset, Node, Rect, Size, Sprite, SpriteFrame, Texture2D, UITransform, isValid, resources } from 'cc';
import type { RagdollInstance } from '../physics/RagdollFactory';
import type { RigDefinition } from '../physics/RigDefinition';
import { PhysicsAdapter as Physics } from '../physics/PhysicsAdapter';
import { armVisualLayout } from '../domain/archery';
import { drawNeckBridge } from './BattleArt';

interface FrameSpec { rect: [number, number, number, number]; anchor: [number, number] }
interface AtlasSpec { imageSize: [number, number]; frames: Record<string, FrameSpec> }

/** Only creates visual children. Body sizes, masses, joints and socket points are untouched. */
export class CharacterSkin {
  private disposed = false;
  private texture: Texture2D | null = null;
  private readonly frames: SpriteFrame[] = [];
  private readonly visuals: Node[] = [];
  private neck: Graphics | null = null;
  public constructor(private readonly actor: RagdollInstance, private readonly rig: RigDefinition) {}

  public async load(skin: 'hero' | 'enemy', style: 'classic' | 'ruins' = 'classic'): Promise<void> {
    if (style === 'ruins') {
      try { await this.loadAtlas(`${skin}-ruins-v2`, `${skin}-ruins-v2-frames`, skin === 'enemy'); return; }
      catch (error) { console.warn('[CharacterSkin] 遗迹皮肤未就绪，保留原角色资源：', error); }
    }
    await this.loadAtlas(`${skin}-atlas`, `${skin}-frames`, false);
  }

  private async loadAtlas(image: string, metadata: string, mirrorArt: boolean): Promise<void> {
    const [texture, spec] = await Promise.all([
      new Promise<Texture2D>((resolve, reject) => resources.load(`characters/${image}/texture`, Texture2D,
        (error, asset) => {
          if (error) return reject(error);
          if (!(asset instanceof Texture2D)) return reject(new Error('角色图集资源类型无效'));
          resolve(asset);
        })),
      new Promise<AtlasSpec>((resolve, reject) => resources.load(`characters/${metadata}`, JsonAsset,
        (error, asset) => error ? reject(error) : resolve(asset.json as AtlasSpec))),
    ]);
    if (this.disposed || !isValid(this.actor.root)) return;
    if (texture.width !== spec.imageSize[0] || texture.height !== spec.imageSize[1]) throw new Error('角色图集尺寸与切片表不一致');
    for (const part of this.rig.bodyDefinitions) {
      const frame = spec.frames[part.id];
      if (!frame || frame.rect.some(n => !Number.isFinite(n)) || frame.rect[2] <= 0 || frame.rect[3] <= 0 ||
        frame.rect[0] < 0 || frame.rect[1] < 0 || frame.rect[0] + frame.rect[2] > texture.width ||
        frame.rect[1] + frame.rect[3] > texture.height) throw new Error(`角色切片无效：${part.id}`);
    }
    texture.addRef();
    this.texture = texture;
    const neckNode = new Node('NeckUnderlay'); neckNode.layer = this.actor.root.layer;
    neckNode.parent = this.actor.bodyNodes.get('chest')!;
    this.neck = neckNode.addComponent(Graphics); this.visuals.push(neckNode);
    // Validate all frames before touching the existing grey-box fallback.
    for (const part of this.rig.bodyDefinitions) {
      const body = this.actor.bodyNodes.get(part.id)!;
      const specFrame = spec.frames[part.id]!;
      const frame = new SpriteFrame();
      frame.texture = texture;
      frame.rect = new Rect(...specFrame.rect);
      frame.originalSize = new Size(specFrame.rect[2], specFrame.rect[3]);
      frame.packable = false;
      this.frames.push(frame);
      const visual = new Node(`Skin_${part.id}`);
      visual.layer = body.layer; visual.parent = body;
      // Mirror the texture child only: the enemy's real mirrored rig is already built by the factory.
      if (mirrorArt) visual.setScale(-1, 1, 1);
      const sprite = visual.addComponent(Sprite);
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = frame;
      const transform = visual.getComponent(UITransform)!;
      transform.setAnchorPoint(...specFrame.anchor);
      const arm = armVisualLayout(this.rig, part);
      if (arm) {
        visual.setPosition(Physics.units(arm.xM), Physics.units(arm.yM));
        visual.setRotationFromEuler(0, 0, Physics.degrees(arm.angleRad));
      }
      transform.setContentSize(Physics.units(arm?.widthM ?? part.sizeM[0]), Physics.units(arm?.heightM ?? part.sizeM[1]));
      this.visuals.push(visual);
    }
    for (const body of this.actor.bodyNodes.values()) {
      const greyBox = body.getComponent(Graphics);
      if (greyBox) greyBox.enabled = false;
    }
    this.draw();
  }

  public draw(): void {
    if (this.disposed || !this.neck || !isValid(this.neck, true)) return;
    const joint = this.rig.jointDefinitions.find(j => j.id === 'neck');
    if (!joint) return;
    const g = this.neck; g.clear();
    const chest = this.actor.worldPointM('chest', [0, 0]);
    const headEnd = this.actor.worldPointM('head', [joint.childAnchorM[0], joint.childAnchorM[1] + 0.10]);
    const angle = -Physics.radians(this.actor.worldAngleDeg('chest')), dx = headEnd.x - chest.x, dy = headEnd.y - chest.y;
    drawNeckBridge(g, { x: joint.parentAnchorM[0], y: joint.parentAnchorM[1] - 0.13 },
      { x: dx * Math.cos(angle) - dy * Math.sin(angle), y: dx * Math.sin(angle) + dy * Math.cos(angle) }, 0.12);
  }

  public dispose(): void {
    this.disposed = true;
    for (const visual of this.visuals) visual.destroy();
    for (const frame of this.frames) frame.destroy();
    this.visuals.length = this.frames.length = 0;
    this.neck = null;
    this.texture?.decRef(); this.texture = null;
  }
}
