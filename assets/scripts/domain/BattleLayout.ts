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
  const width = Math.min(620, safe.right - safe.left - 40), height = Math.max(380, touchSize + 240);
  const panel = { left: cx - width / 2, right: cx + width / 2, top: cy - height / 2, bottom: cy + height / 2 };
  const retryWidth = Math.min(Math.max(280, touchSize * 2), width - 48), retryHeight = Math.max(92, touchSize);
  const retry = { left: cx - retryWidth / 2, right: cx + retryWidth / 2,
    top: panel.bottom - retryHeight - 28, bottom: panel.bottom - 28 };
  return { panel, retry, summary: { x: cx, y: panel.top + 88 } };
}

export function battlePauseLayout(safe: Rect, minimumTouchSize: number) {
  const touch = Math.ceil(minimumTouchSize), result = battleResultLayout(safe, minimumTouchSize);
  const cx = (safe.left + safe.right) / 2, cy = (safe.top + safe.bottom) / 2, height = Math.max(420, touch * 2 + 220);
  const panelWidth = Math.min(safe.right - safe.left - 40, Math.max(result.panel.right - result.panel.left, touch * 4 + 84));
  const panel = { left: cx - panelWidth / 2, right: cx + panelWidth / 2, top: cy - height / 2, bottom: cy + height / 2 };
  const width = (panel.right - panel.left - 84) / 4, h = Math.max(92, touch);
  const options = Array.from({ length: 4 }, (_, i) => ({ left: panel.left + 24 + i * (width + 12),
    right: panel.left + 24 + i * (width + 12) + width, top: panel.top + 130, bottom: panel.top + 130 + h }));
  return { panel, options, retry: { ...result.retry, top: panel.bottom - h - 28, bottom: panel.bottom - 28 },
    summary: { x: cx, y: panel.top + 68 } };
}

export function battleRewardLayout(safe: Rect, minimumTouchSize: number) {
  const w = safe.right - safe.left, h = safe.bottom - safe.top;
  const width = Math.min(1460, w - 48), height = Math.min(580, h - 48);
  const cx = (safe.left + safe.right) / 2, cy = (safe.top + safe.bottom) / 2;
  const panel = { left: cx - width / 2, right: cx + width / 2, top: cy - height / 2, bottom: cy + height / 2 };
  const gap = 20, cardWidth = (width - 64 - gap * 2) / 3;
  const cards = Array.from({ length: 3 }, (_, i) => ({ left: panel.left + 32 + i * (cardWidth + gap),
    right: panel.left + 32 + i * (cardWidth + gap) + cardWidth,
    top: panel.top + 140, bottom: panel.bottom - 36 }));
  if (cards.some(r => r.right - r.left < minimumTouchSize || r.bottom - r.top < minimumTouchSize)) throw new Error('强化选项触控区域不足');
  return { panel, cards, title: { x: cx, y: panel.top + 64 } };
}

export function battleEquipmentLayout(safe: Rect, minimumTouchSize: number) {
  const w = Math.max(200, Math.ceil(minimumTouchSize)), h = Math.max(104, Math.ceil(minimumTouchSize)), gap = 12;
  const cell = (column: number, row: number): Rect => ({ right: safe.right - 24 - column * (w + gap),
    left: safe.right - 24 - column * (w + gap) - w, bottom: safe.bottom - 28 - row * (h + gap),
    top: safe.bottom - 28 - row * (h + gap) - h });
  return { bow: cell(0, 1), skill: cell(1, 0), potion: cell(1, 1), rune: cell(1, 2) };
}
