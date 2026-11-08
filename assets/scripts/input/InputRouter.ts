export interface Point { x: number; y: number }
export interface Rect { left: number; top: number; right: number; bottom: number }
export interface InputLayout { aim: Rect; arrowSwitch: Rect }
export interface AimRules {
  deadzoneDesign: number;
  initialRad: number;
  minRad: number;
  maxRad: number;
  firstShotDelaySec: number;
  pullBackToAim: boolean;
  fullDrawDistanceDesign: number;
}
export interface ArrowCadence { id: string; intervalSec: number }
export interface ShotIntent { arrowId: string; aimRad: number; strength: number }

export function contains(r: Rect, p: Point): boolean {
  return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
}

/** Input only records intent. A single fixed-step consumer decides if/when to emit a shot. */
export class InputRouter {
  private aimTouch: { id: number; origin: Point; point: Point; dragDirection: 1 | -1 | null } | null = null;
  private switchTouch: number | null = null;
  private selected = 0;
  private elapsed = 0;
  private firstShotAt = 0;
  private cooldownUntil = 0;
  private drawStartAt = 0;
  private pendingRelease: ShotIntent | null = null;
  private blocked = false;
  private direction: number;

  public constructor(private readonly rules: AimRules, private readonly arrows: readonly ArrowCadence[]) {
    if (arrows.length === 0) throw new Error('至少装备一种箭');
    this.direction = rules.initialRad;
  }

  public get aimId(): number | null { return this.aimTouch?.id ?? null; }
  public get aimRad(): number { return this.direction; }
  public get drag() { return this.aimTouch; }
  /** Spatial draw, not a timer: staying held never increases strength by itself. */
  public get drawProgress(): number {
    const drag = this.aimTouch;
    if (!drag || this.blocked) return 0;
    const dx = drag.point.x - drag.origin.x, dy = drag.point.y - drag.origin.y;
    if (drag.dragDirection !== null && dx * drag.dragDirection < -this.rules.deadzoneDesign) return 0;
    const travel = Math.hypot(dx, dy) - this.rules.deadzoneDesign;
    return Math.max(0, Math.min(1, travel / Math.max(1, this.rules.fullDrawDistanceDesign - this.rules.deadzoneDesign)));
  }
  public get selectedArrow(): ArrowCadence { return this.arrows[this.selected]!; }
  public get canSwitch(): boolean { return this.arrows.length > 1; }

  public press(id: number, point: Point, layout: InputLayout): void {
    if (this.blocked || id === this.aimId || id === this.switchTouch) return;
    if (this.canSwitch && this.switchTouch === null && contains(layout.arrowSwitch, point)) {
      this.switchTouch = id;
    } else if (this.aimTouch === null && contains(layout.aim, point)) {
      this.aimTouch = { id, origin: point, point, dragDirection: null };
      this.drawStartAt = this.elapsed;
      this.firstShotAt = this.elapsed + this.rules.firstShotDelaySec;
    }
  }

  public move(id: number, point: Point): void {
    if (this.aimTouch?.id !== id) return;
    this.aimTouch.point = point;
    const dx = point.x - this.aimTouch.origin.x;
    const dy = this.aimTouch.origin.y - point.y; // design y down, world y up
    if (Math.hypot(dx, dy) <= this.rules.deadzoneDesign) return;
    // Lock push/pull to the first intentional drag; crossing to the opposite side does not flip it.
    const dragDirection = this.aimTouch.dragDirection ??= this.rules.pullBackToAim && dx < -this.rules.deadzoneDesign ? -1 : 1;
    if (this.rules.pullBackToAim && dx * dragDirection < -this.rules.deadzoneDesign) return;
    this.direction = Math.min(this.rules.maxRad, Math.max(this.rules.minRad, Math.atan2(dy * dragDirection, dx * dragDirection)));
  }

  public release(id: number, point: Point, layout: InputLayout): void {
    if (this.aimId === id) {
      this.move(id, point);
      if (!this.blocked && this.elapsed + 1e-9 >= Math.max(this.firstShotAt, this.cooldownUntil)) {
        this.pendingRelease = { arrowId: this.selectedArrow.id, aimRad: this.direction, strength: this.drawProgress };
      }
      this.aimTouch = null;
    }
    if (this.switchTouch !== id) return;
    this.switchTouch = null;
    if (contains(layout.arrowSwitch, point)) this.selected = (this.selected + 1) % this.arrows.length;
  }

  public cancel(): void {
    this.aimTouch = null;
    this.switchTouch = null;
    this.firstShotAt = 0;
    this.pendingRelease = null;
  }

  public setBlocked(blocked: boolean): void {
    if (blocked === this.blocked) return;
    this.blocked = blocked;
    this.cancel();
  }

  public step(dt: number): ShotIntent | null {
    if (this.blocked) return null;
    this.elapsed += dt;
    const shot = this.pendingRelease;
    this.pendingRelease = null;
    if (!shot) return null; // Holding, even at full draw, NEVER emits an arrow.
    const arrow = this.arrows.find(value => value.id === shot.arrowId)!;
    this.cooldownUntil = this.elapsed + arrow.intervalSec;
    return shot;
  }
}
