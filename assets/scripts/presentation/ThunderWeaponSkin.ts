import { Color, Graphics, JsonAsset, Node, Rect, Size, Sprite, SpriteFrame, Texture2D, UITransform, isValid, resources } from 'cc';
import { PhysicsAdapter as P } from '../physics/PhysicsAdapter';
import { bowArtPoint, bowArtStrip, nockedArrowTip, spriteShear, validateThunderArt, type ThunderArtSpec } from '../domain/weaponGeometry';
import type { PointM } from '../domain/archery';
import type { PhysicsLabConfig } from '../core/PhysicsLabConfig';
import { WEAPON_STYLES, type WeaponKind } from './WeaponVisual';

export const thunderArrowLength = (id: string): number => (WEAPON_STYLES[id as WeaponKind] ?? WEAPON_STYLES.normal).arrowLength;
const loadTexture = (path: string): Promise<Texture2D> => new Promise((resolve, reject) => resources.load(path, Texture2D, (error, asset) => {
  if (error) return reject(error);
  if (!(asset instanceof Texture2D)) return reject(new Error('雷霆武器资源不是纹理'));
  resolve(asset);
}));
const loadSpec = (): Promise<JsonAsset> => new Promise((resolve, reject) => resources.load('weapons/thunder-art', JsonAsset,
  (error, asset) => error ? reject(error) : resolve(asset)));

/** One scene owner for both textures and all shared UV frames. No per-arrow asynchronous callbacks. */
export class ThunderWeaponAssets {
  public spec: ThunderArtSpec | null = null;
  public readonly bowFrames: SpriteFrame[] = [];
  public arrowFrame: SpriteFrame | null = null;
  private textures: Texture2D[] = [];
  private disposed = false;
  public get ready(): boolean { return !this.disposed && this.spec !== null && this.arrowFrame !== null; }
  public async load(): Promise<void> {
    const [bow, arrow, json] = await Promise.all([
      loadTexture('weapons/thunder-bow/texture'), loadTexture('weapons/thunder-arrow/texture'), loadSpec(),
    ]);
    if (this.disposed) return;
    const spec = json.json as ThunderArtSpec;
    validateThunderArt(spec);
    if (!(bow instanceof Texture2D) || !(arrow instanceof Texture2D) ||
      bow.width <= 0 || bow.height <= 0 || arrow.width <= 0 || arrow.height <= 0) throw new Error('雷霆武器纹理与切片不匹配');
    for (const texture of [bow, arrow]) { texture.addRef(); this.textures.push(texture); }
    try {
      for (let i = 0; i < spec.bow.strips; i++) this.bowFrames.push(this.frame(bow, bowArtStrip(i, spec.bow, 0.64, 0.55, 0).rect, spec.bow.imageSize));
      this.arrowFrame = this.frame(arrow, spec.arrow.rect, spec.arrow.imageSize);
      this.spec = spec;
    } catch (error) { this.dispose(); throw error; }
  }
  private frame(texture: Texture2D, rect: readonly [number, number, number, number], sourceSize: readonly [number, number]): SpriteFrame {
    const sx = texture.width / sourceSize[0], sy = texture.height / sourceSize[1];
    const frame = new SpriteFrame(); frame.texture = texture; frame.rect = new Rect(rect[0] * sx, rect[1] * sy, rect[2] * sx, rect[3] * sy);
    frame.originalSize = new Size(rect[2] * sx, rect[3] * sy); frame.packable = false; return frame;
  }
  public dispose(): void {
    this.disposed = true; this.spec = null;
    for (const frame of this.bowFrames) frame.destroy(); this.bowFrames.length = 0;
    this.arrowFrame?.destroy(); this.arrowFrame = null;
    for (const texture of this.textures) texture.decRef(); this.textures.length = 0;
  }
}

function visual(parent: Node, name: string, frame: SpriteFrame, anchorX = 0.5): Sprite {
  const node = new Node(name); node.layer = parent.layer; node.parent = parent;
  const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.spriteFrame = frame;
  node.getComponent(UITransform)!.setAnchorPoint(anchorX, 0.5); return sprite;
}

export class ThunderArrowSkin {
  private sprite: Sprite | null = null;
  public constructor(private readonly parent: Node, private readonly assets: ThunderWeaponAssets) {}
  public hide(): void { if (this.sprite && isValid(this.sprite.node)) this.sprite.node.active = false; }
  public show(id: string): boolean {
    if (!this.assets.ready || !isValid(this.parent)) { this.hide(); return false; }
    if (!this.sprite) this.sprite = visual(this.parent, 'ThunderArrowArt', this.assets.arrowFrame!, 1);
    const length = thunderArrowLength(id), rect = this.assets.spec!.arrow.rect;
    this.sprite.node.active = true;
    this.sprite.color = id === 'impact' ? new Color(255, 180, 145, 255) : id === 'piercing' ? new Color(200, 180, 255, 255) : Color.WHITE;
    this.sprite.node.getComponent(UITransform)!.setContentSize(P.units(length), P.units(length * rect[3] / rect[2]));
    return true;
  }
}

/** Visual children only: the actual arms are still driven by constrained Box2D hinge motors. */
export class ThunderBowSkin {
  private readonly root: Node;
  private readonly string: Graphics;
  private readonly arrowNode: Node;
  private readonly arrow: ThunderArrowSkin;
  private readonly strips: Sprite[] = [];
  private lastDraw: { flex: number; tipM: PointM | null; handM: PointM | null } = { flex: 0, tipM: null, handM: null };
  public constructor(parent: Node, private readonly assets: ThunderWeaponAssets) {
    this.root = new Node('ThunderBowArt'); this.root.layer = parent.layer; this.root.parent = parent; this.root.active = false;
    const string = new Node('DynamicBowstring'); string.layer = parent.layer; string.parent = this.root; this.string = string.addComponent(Graphics);
    this.arrowNode = new Node('NockedArrowTip'); this.arrowNode.layer = parent.layer; this.arrowNode.parent = this.root;
    this.arrow = new ThunderArrowSkin(this.arrowNode, assets);
  }
  public hide(): void { if (isValid(this.root)) this.root.active = false; }
  public get snapshot() { return { loaded: this.assets.ready, strips: this.strips.length, ...this.lastDraw, visible: isValid(this.root) && this.root.active }; }
  public draw(socket: PointM & { angleRad: number }, control: PhysicsLabConfig['bowControl'], id: string, flex: number, hand?: PointM, showArrow = true): boolean {
    if (!this.assets.ready || !isValid(this.root)) { this.hide(); return false; }
    const art = this.assets.spec!.bow;
    if (!this.strips.length) for (const frame of this.assets.bowFrames) {
      const warp = new Node('BowStripWarp'); warp.layer = this.root.layer; warp.parent = this.root;
      const sprite = visual(warp, 'FlexibleBowStrip', frame); sprite.node.setScale(-1, 1, 1); this.strips.push(sprite);
    }
    this.root.active = true; P.place(this.root, socket.x, socket.y); this.root.setRotationFromEuler(0, 0, P.degrees(socket.angleRad));
    for (let i = 0; i < this.strips.length; i++) {
      const strip = bowArtStrip(i, art, control.bowHalfHeightM, control.braceDepthM, flex), node = this.strips[i]!.node, warp = node.parent!;
      const transform = spriteShear(strip.shearX, strip.verticalScale);
      warp.setPosition(P.units(strip.xM), P.units(strip.yM));
      warp.setRotationFromEuler(0, 0, P.degrees(transform.rotationRad)); warp.setScale(transform.scaleX, transform.scaleY, 1);
      node.setRotationFromEuler(0, 0, P.degrees(transform.childRotationRad));
      node.getComponent(UITransform)!.setContentSize(P.units(strip.widthM), P.units(strip.baseHeightM));
    }
    // Keep the string and ready shaft over the segmented skin.
    this.string.node.setSiblingIndex(this.root.children.length - 1); this.arrowNode.setSiblingIndex(this.root.children.length - 1);
    const top = bowArtPoint(art.upperTip, art, control.bowHalfHeightM, control.braceDepthM, flex);
    const bottom = bowArtPoint(art.lowerTip, art, control.bowHalfHeightM, control.braceDepthM, flex);
    const dx = Math.cos(socket.angleRad), dy = Math.sin(socket.angleRad);
    const local = (p: PointM) => ({ x: (p.x - socket.x) * dx + (p.y - socket.y) * dy, y: -(p.x - socket.x) * dy + (p.y - socket.y) * dx });
    const nock = hand ? local(hand) : { x: (top.x + bottom.x) / 2, y: 0 };
    const g = this.string; g.clear(); g.lineWidth = P.units(0.018); g.strokeColor = new Color(195, 242, 255, 255);
    g.moveTo(P.units(top.x), P.units(top.y)); g.lineTo(P.units(nock.x), P.units(nock.y)); g.lineTo(P.units(bottom.x), P.units(bottom.y)); g.stroke();
    this.lastDraw = { flex, handM: hand ? { x: hand.x, y: hand.y } : null,
      tipM: hand && showArrow ? nockedArrowTip(hand, socket.angleRad, thunderArrowLength(id)) : null };
    if (hand && showArrow) {
      const tip = local(this.lastDraw.tipM!);
      this.arrowNode.setPosition(P.units(tip.x), P.units(tip.y)); this.arrow.show(id);
    } else this.arrow.hide();
    return true;
  }
  public dispose(): void { if (isValid(this.root)) this.root.destroy(); this.strips.length = 0; }
}
