"use client";

import { useEffect, useRef } from "react";
import type flvjs from "flv.js";
import type { PlayerAdapterProps } from "./PlayerAdapter";
import { emptyTimeline, LIVE_REPLAY_SECONDS, readMediaTimeline } from "./media-timeline";
import { createFlvHttpLoader } from "./flv-http-loader";
import { LiveBufferWatchdog, supportsPlaybackWorker } from "./live-buffer-watchdog";
import { bindLiveReplayWindow, bufferedLiveEdge, restoreReplayPosition } from "./live-replay-window";

export default function FlvPlayer(props: PlayerAdapterProps) {
  const element = useRef<HTMLVideoElement>(null);
  const engine = useRef<flvjs.Player | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const started = useRef(false);
  const failure = useRef<((message: string) => void) | undefined>(undefined);

  useEffect(() => {
    const video = element.current!;
    const mediaRef = latest.current.mediaRef;
    if (mediaRef) mediaRef.current = video;
    latest.current.onTimeline?.(emptyTimeline);
    let disposed = false;
    let failed = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let bufferWindow: ReturnType<typeof bindLiveReplayWindow> | undefined;
    const fail = (message: string) => {
      if (disposed || failed) return;
      failed = true;
      queueMicrotask(() => {
        if (disposed) return;
        clearInterval(timer);
        bufferWindow?.dispose();
        engine.current?.destroy(); engine.current = null;
        latest.current.onError?.(message);
      });
    };
    failure.current = fail;
    const play = () => { if (!latest.current.paused) void video.play().catch((error: Error) => { if (!disposed && !latest.current.paused && error.name !== "AbortError") latest.current.onError?.("播放未能启动，请手动播放或刷新重试"); }); };
    const worker = supportsPlaybackWorker();
    void (worker ? import("mpegts.js") : import("flv.js")).then(({ default: flv }) => {
      if (disposed) return;
      if (!flv.isSupported()) { latest.current.onError?.("当前浏览器不支持这个 FLV 直播流"); return; }
      const player = flv.createPlayer({ type: "flv", url: props.src, isLive: true }, {
        lazyLoad: false, autoCleanupSourceBuffer: true,
        autoCleanupMaxBackwardDuration: LIVE_REPLAY_SECONDS + 5, autoCleanupMinBackwardDuration: LIVE_REPLAY_SECONDS,
        accurateSeek: false, statisticsInfoReportInterval: 1000,
        // Worker configuration must contain only structured-cloneable values.
        // Keep MSE on the page: 1.8.2's MSE Worker can flush after attachment closes.
        ...(worker ? { enableWorker: true } : {
          customLoader: /^wss?:/i.test(props.src) ? undefined : createFlvHttpLoader(flv as typeof flvjs),
        }),
      });
      engine.current = player as flvjs.Player;
      video.dataset.playbackEngine = worker ? "mpegts-worker" : "flv-inline";
      player.on(flv.Events.ERROR, (type: string) => {
        fail(type === flv.ErrorTypes.MEDIA_ERROR ? "浏览器无法解码这个直播流，可切换画质或刷新重试" : "播放连接中断，请刷新直播或检查网络");
      });
      player.attachMediaElement(video);
      bufferWindow = bindLiveReplayWindow(player, video, () => { if (started.current) latest.current.onReplayExpired?.(); });
      let complete = false;
      const monitor = new LiveBufferWatchdog(performance.now());
      player.on(flv.Events.LOADING_COMPLETE, () => { complete = true; });
      timer = setInterval(() => {
        if (disposed || failed) return;
        try {
          bufferWindow?.maintain();
          if (worker && monitor.sample(performance.now(), bufferedLiveEdge(video), video.currentTime,
            latest.current.paused === true || document.visibilityState !== "visible" || !navigator.onLine, complete)) {
            fail("直播接收长时间没有进展，请刷新直播或检查网络");
          }
        } catch { fail("直播缓冲维护失败，请刷新重试"); }
      }, 1000);
      player.load();
      play();
    }).catch(() => fail("直播播放器加载失败，请刷新重试"));
    return () => {
      disposed = true;
      failure.current = undefined;
      clearInterval(timer);
      bufferWindow?.dispose();
      engine.current?.destroy(); engine.current = null;
      if (mediaRef?.current === video) mediaRef.current = null;
    };
  }, [props.src]);

  useEffect(() => {
    const video = element.current;
    if (!video) return;
    video.muted = props.muted ?? true;
    video.volume = props.volume ?? 0.5;
  }, [props.muted, props.volume]);

  useEffect(() => {
    const video = element.current;
    if (!video) return;
    if (props.paused) video.pause();
    else if (engine.current) {
      if (restoreReplayPosition(video) && started.current) latest.current.onReplayExpired?.();
      void video.play().catch((error: Error) => { if (video.isConnected && !latest.current.paused && error.name !== "AbortError") latest.current.onError?.("播放未能启动，请手动播放或刷新重试"); });
    }
  }, [props.paused]);

  const report = () => { if (element.current && latest.current.onTimeline) latest.current.onTimeline(readMediaTimeline(element.current, { live: true, bufferedOnly: true })); };
  return <video ref={element} playsInline muted={props.muted ?? true} style={{ width: "100%", height: "100%" }}
    onLoadedMetadata={() => { const video = element.current!; latest.current.onDimensions?.(video.videoWidth, video.videoHeight); report(); latest.current.onReady?.(); }}
    onPlaying={() => { started.current = true; latest.current.onPlay?.(); }}
    onPause={() => { if (started.current) latest.current.onPause?.(); }}
    onTimeUpdate={props.onTimeline ? report : undefined} onProgress={props.onTimeline ? report : undefined}
    onDurationChange={props.onTimeline ? report : undefined} onSeeked={props.onTimeline ? report : undefined}
    onError={() => failure.current?.("浏览器无法播放这个直播流，可切换画质或刷新重试")}
    onVolumeChange={() => { const video = element.current!; queueMicrotask(() => {
      const desired = latest.current;
      if (video.isConnected && video.readyState >= 1 && (video.muted !== (desired.muted ?? true) || Math.abs(video.volume - (desired.volume ?? 0.5)) > 0.001)) desired.onAudioChange?.(video.muted, video.volume);
    }); }} />;
}
