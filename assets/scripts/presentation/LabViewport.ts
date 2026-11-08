import { Camera, ResolutionPolicy, Vec3, screen, sys, view } from 'cc';
import type { Point, Rect } from '../input/InputRouter';
import { PhysicsAdapter } from '../physics/PhysicsAdapter';
import type { PhysicsLabConfig } from '../core/PhysicsLabConfig';

/** Converts between Cocos bottom-left UI, top-left design space, and a fixed orthographic battle view. */
export class LabViewport {
  public safe: Rect = { left: 0, top: 0, right: 0, bottom: 0 };
  public width = 0;
  public height = 0;
  public portrait = false;

  public constructor(private readonly camera: Camera, private readonly config: PhysicsLabConfig['viewport']) {}

  public resize(): void {
    const { designWidth, designHeight, worldWidthM, worldHeightM, worldCenterM } = this.config;
    const size = screen.windowSize;
    const aspect = size.width / size.height;
    this.portrait = aspect < 1;
    view.setDesignResolutionSize(designWidth, designHeight,
      aspect >= designWidth / designHeight ? ResolutionPolicy.FIXED_HEIGHT : ResolutionPolicy.FIXED_WIDTH);
    this.width = size.width / view.getScaleX();
    this.height = size.height / view.getScaleY();
    PhysicsAdapter.place(this.camera.node, worldCenterM[0], worldCenterM[1], 30);
    this.camera.orthoHeight = PhysicsAdapter.units(Math.max(worldHeightM, worldWidthM / aspect) / 2);
    const safe = sys.getSafeAreaRect();
    // Anchor controls to the intersection of the device safe area and centered core UI.
    const left = (this.width - designWidth) / 2;
    const top = (this.height - designHeight) / 2;
    this.safe = {
      left: Math.max(left, safe.x), top: Math.max(top, this.height - safe.yMax),
      right: Math.min(left + designWidth, safe.xMax), bottom: Math.min(top + designHeight, this.height - safe.y),
    };
  }

  public fromUILocation(location: Point): Point { return { x: location.x, y: this.height - location.y }; }
  public toLocal(point: Point): Point { return { x: point.x - this.width / 2, y: this.height / 2 - point.y }; }

  public worldToUI(xM: number, yM: number): Point {
    const p = this.camera.worldToScreen(new Vec3(PhysicsAdapter.units(xM), PhysicsAdapter.units(yM), 0));
    return this.fromUILocation({ x: p.x / view.getScaleX(), y: p.y / view.getScaleY() });
  }

  public uiToWorld(point: Point): Point {
    const z = this.camera.worldToScreen(new Vec3()).z;
    const p = this.camera.screenToWorld(new Vec3(point.x * view.getScaleX(), (this.height - point.y) * view.getScaleY(), z));
    return { x: PhysicsAdapter.meters(p.x), y: PhysicsAdapter.meters(p.y) };
  }
}
