import { Color, Graphics, JsonAsset, Node, Rect, Size, Sprite, SpriteFrame, Texture2D, UITransform, isValid, resources } from 'cc';
import { PhysicsAdapter as P } from '../physics/PhysicsAdapter';
import type { BiomeId } from '../domain/Expedition';

interface Bounds { left: number; right: number; bottom: number; top: number }
interface ArtSpec { assets: {
  background: { imageSize: [number, number] };
  platform: { imageSize: [number, number]; rect: [number, number, number, number]; capWidthPx: number; capWidthM: number };
} }
interface ArtPack { background: SpriteFrame; platform: SpriteFrame[]; spec: ArtSpec }

/** Scene-owned generated art. Child sprites only; the existing physical nodes keep their geometry. */
export class RuinsArtAssets {
  private disposed = false;
  private pending: Promise<ArtPack | null> | null = null;
  private readonly textures: Texture2D[] = [];
  private readonly frames: SpriteFrame[] = [];
  private visuals: Node[] = [];
  private background: Node | null = null;
  private backgroundAspect = 16 / 9;
  private bounds: Bounds | null = null;
  private biome: BiomeId = 'storm';
  private readonly variants = new Map<BiomeId, Promise<SpriteFrame | null>>();

  public attachBackdrop(parent: Node): void {
    void this.load().then(pack => {
      if (!pack || this.disposed || !isValid(parent)) return;
      const node = this.sprite(parent, 'PaintedStormRuins', pack.background);
      this.background = node;
      this.backgroundAspect = pack.spec.assets.background.imageSize[0] / pack.spec.assets.background.imageSize[1];
      this.fitBackdrop();
      this.applyBiome();
    });
  }

  public resize(bounds: Bounds): void { this.bounds = { ...bounds }; this.fitBackdrop(); }

  public setBiome(id: BiomeId): void {
    if (this.biome === id) return;
    this.biome = id; this.applyBiome();
    for (const visual of this.visuals) if (visual.name.startsWith('PaintedPlatform_') && isValid(visual)) this.tintPlatform(visual);
  }

  private tintPlatform(node: Node): void {
    node.getComponent(Sprite)!.color = new Color().fromHEX(this.biome === 'frost' ? '#B9D3FF' : this.biome === 'ember' ? '#F4BE91' : '#FFFFFF');
  }

  private applyBiome(): void {
    if (!this.background || this.disposed) return;
    const id = this.biome;
    if (!this.variants.has(id)) {
      if (id === 'storm') this.variants.set(id, this.load().then(pack => pack?.background ?? null));
      else this.variants.set(id, new Promise(resolve => resources.load(`scenery/${id === 'frost' ? 'frost-sanctum-v1' : 'ember-citadel-v1'}/texture`, Texture2D, (error, texture) => {
        if (this.disposed) return resolve(null);
        if (error || !(texture instanceof Texture2D)) { console.warn('[Biome] 场景加载失败，保留现有背景', error); return resolve(null); }
        texture.addRef(); this.textures.push(texture);
        const frame = new SpriteFrame(); frame.texture = texture; frame.rect = new Rect(0, 0, texture.width, texture.height);
        frame.originalSize = new Size(texture.width, texture.height); frame.packable = false; this.frames.push(frame); resolve(frame);
      })));
    }
    void this.variants.get(id)!.then(frame => {
      if (!frame || this.disposed || this.biome !== id || !this.background || !isValid(this.background)) return;
      this.background.getComponent(Sprite)!.spriteFrame = frame;
      this.backgroundAspect = frame.rect.width / frame.rect.height; this.fitBackdrop();
    });
  }

  public attachPlatform(parent: Node, widthM: number): void {
    void this.load().then(pack => {
      if (!pack || this.disposed || !isValid(parent) || !parent.activeInHierarchy) return;
      const cap = Math.min(pack.spec.assets.platform.capWidthM, widthM / 3);
      const widths = [cap, widthM - cap * 2, cap];
      let x = -widthM / 2;
      for (let i = 0; i < 3; i++) {
        const width = widths[i]!;
        const node = this.sprite(parent, `PaintedPlatform_${i}`, pack.platform[i]!);
        node.setPosition(P.units(x + width / 2), 0);
        node.getComponent(UITransform)!.setContentSize(P.units(width), P.units(0.6));
        this.tintPlatform(node);
        x += width;
      }
      const fallback = parent.getComponent(Graphics); if (fallback) fallback.enabled = false;
    });
  }

  public dispose(): void {
    this.disposed = true; this.background = null;
    this.variants.clear();
    for (const node of this.visuals) if (isValid(node)) node.destroy();
    this.visuals.length = 0;
    for (const frame of this.frames) frame.destroy(); this.frames.length = 0;
    for (const texture of this.textures) texture.decRef(); this.textures.length = 0;
  }

  private fitBackdrop(): void {
    if (!this.background || !isValid(this.background) || !this.bounds) return;
    const b = this.bounds;
    const width = Math.max(b.right - b.left, (b.top - b.bottom) * this.backgroundAspect);
    const height = width / this.backgroundAspect;
    // Cover the current camera, preserving the painting's aspect. No physical transform is touched.
    this.background.setPosition(P.units((b.left + b.right) / 2), P.units((b.top + b.bottom) / 2));
    this.background.getComponent(UITransform)!.setContentSize(P.units(width), P.units(height));
  }

  private sprite(parent: Node, name: string, frame: SpriteFrame): Node {
    const node = new Node(name); node.layer = parent.layer; node.parent = parent;
    const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.spriteFrame = frame;
    node.getComponent(UITransform)!.setAnchorPoint(0.5, 0.5);
    this.visuals = this.visuals.filter(visual => isValid(visual)); this.visuals.push(node);
    return node;
  }

  private load(): Promise<ArtPack | null> {
    if (this.pending) return this.pending;
    const texture = (path: string) => new Promise<Texture2D>((resolve, reject) => resources.load(path, Texture2D,
      (error, asset) => error ? reject(error) : asset instanceof Texture2D ? resolve(asset) : reject(new Error('场景纹理资源类型无效'))));
    const spec = new Promise<ArtSpec>((resolve, reject) => resources.load('scenery/ruins-art-v2', JsonAsset,
      (error, asset) => error ? reject(error) : resolve(asset.json as ArtSpec)));
    this.pending = Promise.all([texture('scenery/storm-ruins-v2/texture'), texture('scenery/ruins-platform-v2/texture'), spec])
      .then(([background, platform, data]) => {
        if (this.disposed) return null;
        for (const [image, size] of [[background, data.assets.background.imageSize], [platform, data.assets.platform.imageSize]] as const)
          if (image.width !== size[0] || image.height !== size[1]) throw new Error('场景纹理尺寸与清单不一致');
        const [x, y, w, h] = data.assets.platform.rect, cap = data.assets.platform.capWidthPx;
        if (![x, y, w, h, cap, data.assets.platform.capWidthM].every(Number.isFinite) || x < 0 || y < 0 ||
          h <= 0 || cap <= 0 || w <= cap * 2 || x + w > platform.width || y + h > platform.height || data.assets.platform.capWidthM <= 0)
          throw new Error('平台切片超出纹理或尺寸无效');
        for (const image of [background, platform]) { image.addRef(); this.textures.push(image); }
        const frame = (image: Texture2D, rect: [number, number, number, number]) => {
          const result = new SpriteFrame(); this.frames.push(result); result.texture = image;
          result.rect = new Rect(...rect); result.originalSize = new Size(rect[2], rect[3]); result.packable = false;
          return result;
        };
        return { background: frame(background, [0, 0, background.width, background.height]), spec: data,
          platform: [frame(platform, [x, y, cap, h]), frame(platform, [x + cap, y, w - cap * 2, h]), frame(platform, [x + w - cap, y, cap, h])] };
      }).catch(error => {
        for (const frame of this.frames) frame.destroy(); this.frames.length = 0;
        for (const image of this.textures) image.decRef(); this.textures.length = 0;
        console.warn('[RuinsArt] 图片未就绪，保留程序场景：', error);
        return null;
      });
    return this.pending;
  }
}
