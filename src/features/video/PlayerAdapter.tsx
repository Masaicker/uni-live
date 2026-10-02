"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef } from "react";
import { isFlvSource, readMediaTimeline, type MediaTimeline, type TimelineOptions } from "./media-timeline";

const ReactPlayer = dynamic(() => import("react-player"), { ssr: false });
const FlvPlayer = dynamic(() => import("./FlvPlayer"), { ssr: false });

export interface PlayerAdapterProps {
  src: string;
  playbackKey: number;
  muted?: boolean;
  volume?: number;
  paused?: boolean;
  mediaRef?: React.RefObject<HTMLVideoElement | null>;
  onError?: (message: string) => void;
  onAudioChange?: (muted: boolean, volume: number) => void;
  onPlay?: () => void;
  onReady?: () => void;
  onPause?: () => void;
  onDimensions?: (width: number, height: number) => void;
  onReplayExpired?: () => void;
  onTimeline?: (timeline: MediaTimeline) => void;
  timelineOptions?: TimelineOptions;
}

export function PlayerAdapter({ src, playbackKey, muted = true, volume = 0.5, paused = false, mediaRef, onError, onAudioChange, onPlay, onReady, onPause, onDimensions, onReplayExpired, onTimeline, timelineOptions }: PlayerAdapterProps) {
  const started = useRef<number | null>(null);
  const hls = useRef<{ src: string; key: number; engine: { levels?: { details?: { live: boolean } }[] } | null } | null>(null);
  const desiredAudio = useRef({ muted, volume });
  desiredAudio.current = { muted, volume };
  const handleError = useCallback((event: unknown) => {
    const code = (event as { target?: HTMLVideoElement })?.target?.error?.code;
    onError?.(code === 3 || code === 4 ? "浏览器无法解码这个直播流，可切换画质或刷新重试" : "播放连接中断，请刷新直播或检查网络");
  }, [onError]);
  const reportMedia = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    if (mediaRef) mediaRef.current = video;
    if (!onTimeline) return;
    const manifestLive = hls.current?.src === src && hls.current.key === playbackKey ? hls.current.engine?.levels?.find((level) => level.details)?.details?.live : undefined;
    onTimeline?.(readMediaTimeline(video, { ...timelineOptions, live: timelineOptions?.live ?? manifestLive }));
  };

  if (!src) return null;
  if (isFlvSource(src)) return <div className="player-adapter absolute inset-0"><FlvPlayer key={`${src}:${playbackKey}`} src={src} playbackKey={playbackKey}
    muted={muted} volume={volume} paused={paused} mediaRef={mediaRef} onError={onError} onAudioChange={onAudioChange}
    onPlay={onPlay} onReady={onReady} onPause={onPause} onDimensions={onDimensions} onReplayExpired={onReplayExpired} onTimeline={onTimeline} timelineOptions={timelineOptions} /></div>;
  return <div className="player-adapter absolute inset-0">
    <ReactPlayer key={playbackKey} url={src} playing={!paused} muted={muted} volume={volume} controls={false}
      width="100%" height="100%" style={{ position: "absolute", top: 0, left: 0 }}
      onError={handleError}
      onReady={(player) => { hls.current = { src, key: playbackKey, engine: player.getInternalPlayer("hls") }; }}
      onPlay={() => { started.current = playbackKey; onPlay?.(); }}
      onPause={() => { if (started.current === playbackKey) onPause?.(); }}
      config={{ file: {
        attributes: {
          playsInline: true,
          onVolumeChange: (event: React.SyntheticEvent<HTMLVideoElement>) => {
            const video = event.currentTarget;
            queueMicrotask(() => {
              const desired = desiredAudio.current;
              if (video.isConnected && video.readyState >= 1 && (video.muted !== desired.muted || Math.abs(video.volume - desired.volume) > 0.001)) onAudioChange?.(video.muted, video.volume);
            });
          },
          onLoadedMetadata: (event: React.SyntheticEvent<HTMLVideoElement>) => {
            // ReactPlayer skips initial volume when muted; synchronize before temporary unmuting.
            event.currentTarget.volume = desiredAudio.current.volume;
            event.currentTarget.muted = desiredAudio.current.muted;
            onDimensions?.(event.currentTarget.videoWidth, event.currentTarget.videoHeight); reportMedia(event);
            onReady?.();
          },
          onTimeUpdate: onTimeline ? reportMedia : undefined, onProgress: onTimeline ? reportMedia : undefined,
          onDurationChange: onTimeline ? reportMedia : undefined, onSeeked: onTimeline ? reportMedia : undefined,
        },
        forceHLS: /\.m3u8(?:[?#]|$)/i.test(src),
        hlsOptions: { backBufferLength: 180 },
      } }} />
  </div>;
}
