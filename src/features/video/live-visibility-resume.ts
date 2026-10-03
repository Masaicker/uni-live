import { bufferedLiveEdge } from "./live-replay-window";
import { seekInMedia } from "./media-timeline";

interface PlaybackIntent { paused?: boolean; followingLive?: boolean }
type Visibility = Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;

export function bindLiveVisibilityResume(video: HTMLVideoElement, intent: () => PlaybackIntent,
  play: () => void, visibility: Visibility = document): () => void {
  let pending: { edge: number; delay: number } | undefined;
  const followsLive = () => intent().paused !== true && intent().followingLive !== false;
  const restore = () => {
    if (!pending || visibility.visibilityState !== "visible") return;
    if (!followsLive()) { pending = undefined; return; }
    const edge = bufferedLiveEdge(video);
    // A frozen page may receive its next buffer only after becoming visible.
    if (!edge || edge <= pending.edge || video.readyState < 2) return;
    // Compare added lag, so normal startup buffering and audible playback stay put.
    if (edge - video.currentTime > pending.delay + 2
      && !seekInMedia(video, edge - 1, { live: true, bufferedOnly: true })) return;
    pending = undefined;
  };
  const changed = () => {
    if (visibility.visibilityState !== "visible") {
      const edge = bufferedLiveEdge(video);
      pending = followsLive() ? { edge, delay: Math.max(0, edge - video.currentTime) } : undefined;
    } else if (pending) {
      restore();
      if (followsLive() && video.paused) play();
    }
  };
  visibility.addEventListener("visibilitychange", changed);
  video.addEventListener("progress", restore);
  video.addEventListener("loadeddata", restore);
  if (visibility.visibilityState !== "visible") changed();
  return () => {
    pending = undefined;
    visibility.removeEventListener("visibilitychange", changed);
    video.removeEventListener("progress", restore);
    video.removeEventListener("loadeddata", restore);
  };
}
