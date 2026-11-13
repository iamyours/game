/** Fixed encounter framing; keeps both platforms and the fall space visible without chasing arrows. */
export function battleFrame(aspect: number) {
  if (!Number.isFinite(aspect) || aspect <= 0) throw new Error('Invalid battlefield aspect');
  const width = 21.8, minimumHeight = 11.7;
  const height = Math.max(minimumHeight, width / aspect);
  return { centerX: 11.6, centerY: 4.55, width: height * aspect, height };
}
