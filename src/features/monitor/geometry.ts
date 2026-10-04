import type { VideoLayout } from "@/types";

export type CanvasSize = { width: number; height: number };
export type Rail = "left" | "right" | "top" | "bottom";
export type FocusLayout = VideoLayout & { clipPath?: string };
export const defaultLayout: VideoLayout = { x: 0, y: 0, w: 100, h: 100, zIndex: 1, visible: true };

export function autoLayouts(ids: string[], size: CanvasSize): Record<string, VideoLayout> {
  if (!ids.length) return {};
  if (ids.length === 1) return { [ids[0]]: { ...defaultLayout } };
  const width = Math.max(1, size.width), height = Math.max(1, size.height), gap = 8;
  let best = { cols: 1, rows: ids.length, score: -1, empty: ids.length };
  for (let cols = 1; cols <= ids.length; cols++) {
    if (ids.length === 2 && cols !== (width >= height ? 2 : 1)) continue;
    const rows = Math.ceil(ids.length / cols);
    const w = (width - gap * (cols - 1)) / cols;
    const h = (height - gap * (rows - 1)) / rows;
    const score = Math.max(0, Math.min(w, h * 16 / 9)) ** 2;
    const empty = rows * cols - ids.length;
    if (score > best.score + 0.01 || (Math.abs(score - best.score) < 0.01 && empty < best.empty)) best = { cols, rows, score, empty };
  }
  const w = (width - gap * (best.cols - 1)) / best.cols;
  const h = (height - gap * (best.rows - 1)) / best.rows;
  return Object.fromEntries(ids.map((id, index) => {
    const row = Math.floor(index / best.cols), col = index % best.cols;
    const inRow = Math.min(best.cols, ids.length - row * best.cols);
    const offset = (width - (inRow * w + (inRow - 1) * gap)) / 2;
    return [id, { x: (offset + col * (w + gap)) / width * 100, y: row * (h + gap) / height * 100, w: w / width * 100, h: h / height * 100, zIndex: index + 1, visible: true }];
  }));
}

export function arrangeByPosition(videos: { id: string; layout: VideoLayout }[], size: CanvasSize): Record<string, VideoLayout> {
  const grid = autoLayouts(videos.map((video) => video.id), size);
  const slots = videos.map((video) => grid[video.id]);
  const count = videos.length;
  if (!count) return {};
  const costs = videos.map(({ layout }) => slots.map((slot) =>
    ((layout.x + layout.w / 2 - slot.x - slot.w / 2) * Math.max(1, size.width) / 100) ** 2 +
    ((layout.y + layout.h / 2 - slot.y - slot.h / 2) * Math.max(1, size.height) / 100) ** 2));
  // Minimum-cost assignment considers every window together, avoiding greedy slot conflicts.
  const rowCost = Array(count + 1).fill(0), slotCost = Array(count + 1).fill(0);
  const owner = Array(count + 1).fill(0), previous = Array(count + 1).fill(0);
  for (let row = 1; row <= count; row++) {
    owner[0] = row;
    let slot = 0;
    const best = Array(count + 1).fill(Infinity), used = Array(count + 1).fill(false);
    do {
      used[slot] = true;
      const currentRow = owner[slot];
      let delta = Infinity, next = 0;
      for (let candidate = 1; candidate <= count; candidate++) if (!used[candidate]) {
        const cost = costs[currentRow - 1][candidate - 1] - rowCost[currentRow] - slotCost[candidate];
        if (cost < best[candidate]) { best[candidate] = cost; previous[candidate] = slot; }
        if (best[candidate] < delta) { delta = best[candidate]; next = candidate; }
      }
      for (let candidate = 0; candidate <= count; candidate++) {
        if (used[candidate]) { rowCost[owner[candidate]] += delta; slotCost[candidate] -= delta; }
        else best[candidate] -= delta;
      }
      slot = next;
    } while (owner[slot] !== 0);
    do { const next = previous[slot]; owner[slot] = owner[next]; slot = next; } while (slot !== 0);
  }
  return Object.fromEntries(slots.map((slot, index) => [videos[owner[index + 1] - 1].id, slot]));
}

export function needsArrangement(videos: { id: string; layout: VideoLayout }[], size: CanvasSize): boolean {
  if (size.width < 2 || size.height < 2) return false;
  const layouts = arrangeByPosition(videos, size);
  return videos.some(({ id, layout }) => {
    const target = layouts[id];
    return Math.abs(layout.x - target.x) * size.width / 100 > .5
      || Math.abs(layout.y - target.y) * size.height / 100 > .5
      || Math.abs(layout.w - target.w) * size.width / 100 > .5
      || Math.abs(layout.h - target.h) * size.height / 100 > .5;
  });
}

export function clampRect(rect: VideoLayout, size: CanvasSize): VideoLayout {
  const w = Math.min(100, Math.max(100 * Math.min(160, size.width) / Math.max(1, size.width), rect.w));
  const h = Math.min(100, Math.max(100 * Math.min(90, size.height) / Math.max(1, size.height), rect.h));
  return { ...rect, w, h, x: Math.max(0, Math.min(100 - w, rect.x)), y: Math.max(0, Math.min(100 - h, rect.y)) };
}

export function insertionLayout(existing: VideoLayout[], size: CanvasSize): VideoLayout {
  const width = Math.max(1, size.width), height = Math.max(1, size.height);
  const pixelW = Math.min(width * 0.3, height * 0.6 * 16 / 9);
  const w = pixelW / width * 100, h = pixelW * 9 / 16 / height * 100;
  const gx = 800 / width, gy = 800 / height;
  const zIndex = Math.max(0, ...existing.map((r) => r.zIndex)) + 1;
  const xs = [0, ...existing.map((r) => r.x + r.w + gx)].sort((a, b) => a - b);
  const ys = [0, ...existing.map((r) => r.y + r.h + gy)].sort((a, b) => a - b);
  for (const y of ys) for (const x of xs) {
    if (x + w > 100 || y + h > 100) continue;
    if (!existing.some((r) => x < r.x + r.w + gx && x + w + gx > r.x && y < r.y + r.h + gy && y + h + gy > r.y)) return { x, y, w, h, zIndex, visible: true };
  }
  const offset = (existing.length % 5) * 2;
  return { x: Math.max(0, 100 - w - offset), y: Math.max(0, 100 - h - offset), w, h, zIndex, visible: true };
}

export function focusLayouts(ids: string[], focusId: string, size: CanvasSize, scroll: Record<Rail, number>) {
  const layouts: Record<string, FocusLayout> = {};
  const limits: Record<Rail, number> = { left: 0, right: 0, top: 0, bottom: 0 };
  if (ids.length === 1) return { layouts: { [focusId]: { ...defaultLayout } }, limits };
  layouts[focusId] = { ...defaultLayout, x: 15, y: 14, w: 70, h: 72, zIndex: 2 };
  const gapX = 800 / Math.max(size.width, 1), gapY = 800 / Math.max(size.height, 1);
  const sideW = Math.max(1, 15 - gapX * 2), sideH = sideW * size.width * 9 / 16 / Math.max(size.height, 1);
  const capacity = Math.max(1, Math.floor((100 + gapY) / (sideH + gapY)));
  const groups: Record<Rail, string[]> = { left: [], right: [], top: [], bottom: [] };
  ids.filter((id) => id !== focusId).forEach((id, index) => {
    const rail: Rail = index < capacity * 2 ? (index % 2 ? "right" : "left") : (index % 2 ? "bottom" : "top");
    groups[rail].push(id);
  });
  for (const rail of ["left", "right", "top", "bottom"] as const) {
    const vertical = rail === "left" || rail === "right";
    const h = vertical ? sideH : Math.max(1, 14 - gapY * 2);
    const w = vertical ? sideW : h * size.height * 16 / 9 / Math.max(size.width, 1);
    const span = groups[rail].length * ((vertical ? h : w) + (vertical ? gapY : gapX));
    const available = vertical ? 100 : 70;
    limits[rail] = Math.max(0, span - available);
    const offset = Math.min(scroll[rail], limits[rail]);
    const origin = Math.max(0, (available - span) / 2);
    groups[rail].forEach((id, index) => {
      const x = vertical ? (rail === "left" ? gapX : 85 + gapX) : 15 + origin + index * (w + gapX) - offset;
      const y = vertical ? origin + index * (h + gapY) - offset : (rail === "top" ? gapY : 86 + gapY);
      const left = vertical ? 0 : Math.max(0, 15 - x) / w * 100;
      const right = vertical ? 0 : Math.max(0, x + w - 85) / w * 100;
      layouts[id] = { x, y, w, h, zIndex: 1, visible: true, clipPath: left + right >= 100 ? "inset(100%)" : `inset(0 ${right}% 0 ${left}%)` };
    });
  }
  return { layouts, limits };
}
