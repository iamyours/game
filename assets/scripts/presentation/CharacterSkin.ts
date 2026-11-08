import { Graphics, JsonAsset, Node, Rect, Size, Sprite, SpriteFrame, Texture2D, UITransform, isValid, resources } from 'cc';
import type { RagdollInstance } from '../physics/RagdollFactory';
import type { RigDefinition } from '../physics/RigDefinition';
import { PhysicsAdapter as Physics } from '../physics/PhysicsAdapter';
import { armVisualLayout } from '../domain/archery';

interface FrameSpec { rect: [number, number, number, number]; anchor: [number, number] }
interface AtlasSpec { imageSize: [number, number]; frames: Record<string, FrameSpec> }

/** Only creates visual children. Body sizes, masses, joints and socket points are untouched. */
export class CharacterSkin {
  private disposed = false;
  private texture: Texture2D | null = null;
  private readonly frames: SpriteFrame[] = [];
  private readonly visuals: Node[] = [];
  public constructor(private readonly actor: RagdollInstance, private readonly rig: RigDefinition) {}

  public async load(skin: 'hero' | 'enemy'): Promise<void> {
    const [texture, spec] = await Promise.all([
      new Promise<Texture2D>((resolve, reject) => resources.load(`characters/${skin}-atlas/texture`, Texture2D,
        (error, asset) => {
          if (error) return reject(error);
          if (!(asset instanceof Texture2D)) return reject(new Error('角色图集资源类型无效'));
          resolve(asset);
        })),
      new Promise<AtlasSpec>((resolve, reject) => resources.load(`characters/${skin}-frames`, JsonAsset,
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
  }

  public dispose(): void {
    this.disposed = true;
    for (const visual of this.visuals) visual.destroy();
    for (const frame of this.frames) frame.destroy();
    this.visuals.length = this.frames.length = 0;
    this.texture?.decRef(); this.texture = null;
  }
}
