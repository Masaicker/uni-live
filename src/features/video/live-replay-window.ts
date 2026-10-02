import { LIVE_REPLAY_SECONDS, seekInMedia } from "./media-timeline";

interface CleanupController {
  _config: { autoCleanupMaxBackwardDuration: number; autoCleanupMinBackwardDuration: number };
  _sourceBuffers: Record<string, SourceBuffer | null>;
  _isBufferFull: boolean;
  _needCleanupSourceBuffer: () => boolean;
  _doCleanupSourceBuffer: () => void;
  _hasPendingRemoveRanges: () => boolean;
  _hasPendingSegments: () => boolean;
  on: (event: string, listener: () => void) => void;
  off: (event: string, listener: () => void) => void;
  _mediaElementProxy?: { getCurrentTime: () => number };
  _mediaElement?: HTMLVideoElement;
}

export function bufferedLiveEdge(video: HTMLVideoElement): number {
  return video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
}

export function restoreReplayPosition(video: HTMLVideoElement, seconds = LIVE_REPLAY_SECONDS): boolean {
  const edge = bufferedLiveEdge(video);
  const start = edge ? Math.max(video.buffered.start(0), edge - seconds) : 0;
  if (!edge || video.currentTime >= start - 0.1) return false;
  return seekInMedia(video, start + 1, { live: true, bufferedOnly: true });
}

// These internals are verified against the exact pinned versions; all overrides
// are instance-local and restored before destroy. MSE stays on the main thread.
export function bindLiveReplayWindow(player: unknown, video: HTMLVideoElement, expired: () => void) {
  const instance = player as {
    _player_engine?: { _mse_controller?: CleanupController; _loading_controller?: { resumeTransmuxer: () => void } };
    _msectl?: CleanupController;
    _transmuxer?: { resume: () => void };
    _progressChecker?: ReturnType<typeof setInterval> | null;
  };
  const controller = instance._player_engine?._mse_controller ?? instance._msectl;
  if (!controller || typeof controller._needCleanupSourceBuffer !== "function"
    || typeof controller._doCleanupSourceBuffer !== "function" || typeof controller._hasPendingRemoveRanges !== "function"
    || typeof controller._hasPendingSegments !== "function" || typeof controller._isBufferFull !== "boolean"
    || !controller._sourceBuffers || !controller._config || typeof controller.on !== "function" || typeof controller.off !== "function"
    || !Number.isFinite(controller._config.autoCleanupMaxBackwardDuration) || !Number.isFinite(controller._config.autoCleanupMinBackwardDuration)) {
    throw new Error("Unsupported live buffer controller");
  }
  const config = controller._config;
  const originalMax = config.autoCleanupMaxBackwardDuration, originalMin = config.autoCleanupMinBackwardDuration;
  let retained = LIVE_REPLAY_SECONDS, recovering = false, quotaRequested = false, disposed = false;
  const bufferFull = () => { quotaRequested = true; };
  const cleanupPosition = () => {
    // Move an expired running playhead before the asynchronous removal reaches it.
    if (!video.paused && restoreReplayPosition(video, retained)) expired();
    return bufferedLiveEdge(video) || video.currentTime;
  };
  const proxy = controller._mediaElementProxy;
  const media = controller._mediaElement;
  let dispose: () => void;
  if (proxy && typeof proxy.getCurrentTime === "function") {
    const previous = proxy.getCurrentTime;
    proxy.getCurrentTime = cleanupPosition;
    dispose = () => { if (proxy.getCurrentTime === cleanupPosition) proxy.getCurrentTime = previous; };
  } else if (media === video) {
    const wrapped = new Proxy(video, {
      get: (target, property) => {
        if (property === "currentTime") return cleanupPosition();
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
      set: (target, property, value) => Reflect.set(target, property, value, target),
    });
    controller._mediaElement = wrapped;
    dispose = () => { if (controller._mediaElement === wrapped) controller._mediaElement = media; };
  } else throw new Error("Unsupported live buffer clock");
  controller.on("buffer_full", bufferFull);
  return {
    maintain: () => {
      if (disposed) return;
      cleanupPosition();
      if (controller._hasPendingRemoveRanges() || Object.values(controller._sourceBuffers).some((buffer) => buffer?.updating)) return;
      if (quotaRequested || (recovering && controller._isBufferFull)) {
        // A browser quota can be reached before three minutes. Trim through the
        // library's queue, then resume its suspended loader after append succeeds.
        const span = video.buffered.length ? bufferedLiveEdge(video) - video.buffered.start(0) : 0;
        if (retained <= 10 || span <= 11) throw new Error("Live buffer quota cannot be recovered");
        retained = Math.max(10, Math.min(retained, span) / 2);
        config.autoCleanupMinBackwardDuration = retained;
        config.autoCleanupMaxBackwardDuration = retained + 1;
        quotaRequested = false; recovering = true;
        cleanupPosition();
        controller._doCleanupSourceBuffer();
        return;
      }
      if (recovering && !controller._isBufferFull && !controller._hasPendingSegments()) {
        const loader = instance._player_engine?._loading_controller;
        if (loader) loader.resumeTransmuxer();
        else if (instance._transmuxer) {
          if (instance._progressChecker != null) clearInterval(instance._progressChecker);
          instance._progressChecker = null;
          instance._transmuxer.resume();
        } else throw new Error("Unsupported live buffer recovery");
        recovering = false;
      }
      if (controller._needCleanupSourceBuffer()) controller._doCleanupSourceBuffer();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true; controller.off("buffer_full", bufferFull); dispose();
      if (config.autoCleanupMaxBackwardDuration === retained + 1) config.autoCleanupMaxBackwardDuration = originalMax;
      if (config.autoCleanupMinBackwardDuration === retained) config.autoCleanupMinBackwardDuration = originalMin;
    },
  };
}
