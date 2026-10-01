"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef } from "react";
import { readMediaTimeline, type MediaTimeline } from "./media-timeline";

const ReactPlayer = dynamic(() => import("react-player"), { ssr: false });

interface PlayerAdapterProps {
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
  onTimeline?: (timeline: MediaTimeline) => void;
}

export function PlayerAdapter({ src, playbackKey, muted = true, volume = 0.5, paused = false, mediaRef, onError, onAudioChange, onPlay, onReady, onPause, onDimensions, onTimeline }: PlayerAdapterProps) {
  const started = useRef<number | null>(null);
  const desiredAudio = useRef({ muted, volume });
  desiredAudio.current = { muted, volume };
  const handleError = useCallback((event: unknown) => {
    const code = (event as { target?: HTMLVideoElement })?.target?.error?.code;
    onError?.(code === 3 || code === 4 ? "浏览器无法解码这个直播流，可切换画质或刷新重试" : "播放连接中断，请刷新直播或检查网络");
  }, [onError]);
  const reportMedia = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    if (mediaRef) mediaRef.current = video;
    onTimeline?.(readMediaTimeline(video));
  };

  if (!src) return null;
  return <div className="player-adapter absolute inset-0">
    <ReactPlayer key={playbackKey} url={src} playing={!paused} muted={muted} volume={volume} controls={false}
      width="100%" height="100%" style={{ position: "absolute", top: 0, left: 0 }}
      onError={handleError}
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
          onTimeUpdate: reportMedia, onProgress: reportMedia, onDurationChange: reportMedia,
        },
        forceHLS: src.includes(".m3u8"),
        forceFLV: src.includes(".flv") || (!/\.(m3u8|mp4|webm|ogg)(?:[?#]|$)/i.test(src)),
      } }} />
  </div>;
}
