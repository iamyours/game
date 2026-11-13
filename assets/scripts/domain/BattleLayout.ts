import type { Rect } from '../input/InputRouter';

/** Fixed encounter framing; keeps both platforms and the fall space visible without chasing arrows. */
export function battleFrame(aspect: number) {
  if (!Number.isFinite(aspect) || aspect <= 0) throw new Error('Invalid battlefield aspect');
  const width = 21.8, minimumHeight = 11.7;
  const height = Math.max(minimumHeight, width / aspect);
  return { centerX: 11.6, centerY: 4.55, width: height * aspect, height };
}
/** The character and open left battlefield are touchable; the header and right controls stay separate. */
export function battleAimRect(safe: Rect): Rect {
  const w = safe.right - safe.left, h = safe.bottom - safe.top;
  return { left: safe.left + w * 0.02, right: safe.left + w * 0.72,
    top: safe.top + h * 0.18, bottom: safe.top + h * 0.97 };
}

/** Presentation reads the existing shared cooldown; switching arrows cannot reset this progress. */
export function cooldownProgress(remainingSec: number, lastIntervalSec: number): number {
  if (!Number.isFinite(remainingSec) || !Number.isFinite(lastIntervalSec) || lastIntervalSec <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - remainingSec / lastIntervalSec));
}

export function battleResultLayout(safe: Rect, minimumTouchSize: number) {
  const touchSize = Math.ceil(minimumTouchSize);
  const cx = (safe.left + safe.right) / 2, cy = (safe.top + safe.bottom) / 2;
  const width = Math.min(620, safe.right - safe.left - 40), height = Math.max(320, touchSize + 200);
  const panel = { left: cx - width / 2, right: cx + width / 2, top: cy - height / 2, bottom: cy + height / 2 };
  const retryWidth = Math.min(Math.max(280, touchSize * 2), width - 48), retryHeight = Math.max(92, touchSize);
  const retry = { left: cx - retryWidth / 2, right: cx + retryWidth / 2,
    top: panel.bottom - retryHeight - 28, bottom: panel.bottom - 28 };
  return { panel, retry, summary: { x: cx, y: panel.top + 88 } };
}
