export interface MediaTimeline {
  current: number;
  start: number;
  end: number;
  bufferedEnd: number;
  live: boolean;
}

export const emptyTimeline: MediaTimeline = { current: 0, start: 0, end: 0, bufferedEnd: 0, live: true };
export const LIVE_REPLAY_SECONDS = 180;

export function seekWindow(timeline: MediaTimeline): { start: number; end: number } {
  return { start: timeline.live ? timeline.end - LIVE_REPLAY_SECONDS : timeline.start, end: timeline.end };
}

export interface TimelineOptions { live?: boolean; bufferedOnly?: boolean }

export function isFlvSource(src: string): boolean {
  return /\.flv(?:[?#]|$)/i.test(src) || !/\.(m3u8|mp4|webm|ogg)(?:[?#]|$)/i.test(src);
}

export function timelineOptions(src: string, platform: string): TimelineOptions {
  const bufferedOnly = isFlvSource(src);
  return { live: platform !== "direct" || bufferedOnly ? true : undefined, bufferedOnly };
}

export function readMediaTimeline(video: HTMLVideoElement, options: TimelineOptions = {}): MediaTimeline {
  const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  const live = options.live ?? !Number.isFinite(video.duration);
  const range = options.bufferedOnly ? video.buffered : video.seekable;
  let start = 0, end = live ? 0 : video.duration;
  if (range.length) {
    // The latest edge must remain reachable while replaying an earlier disconnected range.
    start = range.start(0); end = range.end(range.length - 1);
  }
  if (live) start = Math.max(start, end - LIVE_REPLAY_SECONDS);
  let bufferedEnd = current;
  for (let i = 0; i < video.buffered.length; i++) {
    if (current >= video.buffered.start(i) && current <= video.buffered.end(i)) { bufferedEnd = video.buffered.end(i); break; }
  }
  return { current, start, end: Math.max(start, end), bufferedEnd, live };
}

export function seekInMedia(video: HTMLVideoElement, requested: number, options: TimelineOptions = {}): boolean {
  const ranges = options.bufferedOnly ? video.buffered : video.seekable;
  if (!Number.isFinite(requested) || !ranges.length) return false;
  const live = options.live ?? !Number.isFinite(video.duration);
  const oldest = live ? ranges.end(ranges.length - 1) - LIVE_REPLAY_SECONDS : -Infinity;
  let nearest = 0, distance = Infinity;
  for (let i = 0; i < ranges.length; i++) {
    const start = Math.max(ranges.start(i), oldest), end = ranges.end(i);
    if (end <= start) continue;
    // Stay inside the buffer: FLV cannot fetch evicted live data or an absent interval.
    const padding = Math.min(0.1, (end - start) / 2);
    const candidate = Math.max(start + padding, Math.min(end - padding, requested));
    const delta = Math.abs(candidate - requested);
    if (delta < distance) { nearest = candidate; distance = delta; }
  }
  if (!Number.isFinite(distance)) return false;
  try { video.currentTime = nearest; return true; }
  catch { return false; }
}

export function mediaTime(value: number): string {
  const seconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(seconds / 3600);
  return `${hours ? `${hours}:` : ""}${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
