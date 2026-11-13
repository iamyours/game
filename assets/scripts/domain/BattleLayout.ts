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

export function battlePauseLayout(safe: Rect, minimumTouchSize: number) {
  const touch = Math.ceil(minimumTouchSize), result = battleResultLayout(safe, minimumTouchSize);
  const cx = (safe.left + safe.right) / 2, cy = (safe.top + safe.bottom) / 2, height = Math.max(420, touch * 2 + 220);
  const panelWidth = Math.min(safe.right - safe.left - 40, Math.max(result.panel.right - result.panel.left, touch * 3 + 72));
  const panel = { left: cx - panelWidth / 2, right: cx + panelWidth / 2, top: cy - height / 2, bottom: cy + height / 2 };
  const width = (panel.right - panel.left - 72) / 3, h = Math.max(92, touch);
  const options = Array.from({ length: 3 }, (_, i) => ({ left: panel.left + 24 + i * (width + 12),
    right: panel.left + 24 + i * (width + 12) + width, top: panel.top + 130, bottom: panel.top + 130 + h }));
  return { panel, options, retry: { ...result.retry, top: panel.bottom - h - 28, bottom: panel.bottom - 28 },
    summary: { x: cx, y: panel.top + 68 } };
}
