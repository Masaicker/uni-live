export interface MediaTimeline {
  current: number;
  start: number;
  end: number;
  bufferedEnd: number;
  live: boolean;
}

export const emptyTimeline: MediaTimeline = { current: 0, start: 0, end: 0, bufferedEnd: 0, live: true };

export function readMediaTimeline(video: HTMLVideoElement): MediaTimeline {
  const current = Number.isFinite(video.currentTime) ? video.currentTime : 0;
  const live = !Number.isFinite(video.duration);
  const range = video.seekable;
  let start = 0, end = live ? 0 : video.duration;
  if (range.length) {
    // Seek within a real media range; do not offer gaps between disconnected buffers.
    let index = range.length - 1;
    for (let i = 0; i < range.length; i++) if (current >= range.start(i) && current <= range.end(i)) { index = i; break; }
    start = range.start(index); end = range.end(index);
  }
  let bufferedEnd = current;
  for (let i = 0; i < video.buffered.length; i++) {
    if (current >= video.buffered.start(i) && current <= video.buffered.end(i)) { bufferedEnd = video.buffered.end(i); break; }
  }
  return { current, start, end: Math.max(start, end), bufferedEnd, live };
}

export function seekInMedia(video: HTMLVideoElement, requested: number): boolean {
  if (!Number.isFinite(requested) || !video.seekable.length) return false;
  const timeline = readMediaTimeline(video);
  try { video.currentTime = Math.max(timeline.start, Math.min(timeline.end - 0.1, requested)); return true; }
  catch { return false; }
}

export function mediaTime(value: number): string {
  const seconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(seconds / 3600);
  return `${hours ? `${hours}:` : ""}${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
