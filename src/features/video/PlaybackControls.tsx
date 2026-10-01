"use client";

import type { CSSProperties, ReactNode } from "react";
import { Play, Pause, SpeakerHigh, SpeakerSlash, ArrowsOut, ArrowsIn } from "@phosphor-icons/react";
import { IconButton } from "@/components/live/IconButton";
import { mediaTime, type MediaTimeline } from "./media-timeline";

interface Props {
  paused: boolean;
  muted: boolean;
  volume: number;
  timeline: MediaTimeline;
  fullscreen: boolean;
  info?: ReactNode;
  onTogglePaused: () => void;
  onMute: () => void;
  onAudio: (muted: boolean, volume: number) => void;
  onSeek: (time: number) => void;
  onFullscreen: () => void;
}

export function PlaybackControls(props: Props) {
  const { timeline } = props;
  const seekable = timeline.end - timeline.start > 0.2;
  const liveDelay = Math.max(0, timeline.end - timeline.current);
  const percent = (value: number) => seekable ? Math.max(0, Math.min(100, (value - timeline.start) / (timeline.end - timeline.start) * 100)) : 0;
  return <div className="playback-controls" aria-label="播放控制" onPointerDown={(event) => event.stopPropagation()}>
    {seekable && <input className="playback-seek" aria-label={timeline.live ? "缓冲回看" : "播放进度"} type="range"
      min={timeline.start} max={timeline.end} step={0.1} value={Math.max(timeline.start, Math.min(timeline.end, timeline.current))}
      style={{ "--played": `${percent(timeline.current)}%`, "--buffered": `${percent(timeline.bufferedEnd)}%` } as CSSProperties}
      onChange={(event) => props.onSeek(Number(event.target.value))} />}
    <div className="playback-buttons">
      <IconButton label={props.paused ? "播放" : "暂停"} onClick={props.onTogglePaused}>{props.paused ? <Play size={16} weight="fill" /> : <Pause size={16} weight="fill" />}</IconButton>
      <div className="playback-volume">
        <IconButton label={props.muted || props.volume === 0 ? "开启声音" : "静音"} onClick={props.onMute}>{props.muted || props.volume === 0 ? <SpeakerSlash size={17} /> : <SpeakerHigh size={17} />}</IconButton>
        <input aria-label="音量" type="range" min={0} max={1} step={0.05} value={props.muted ? 0 : props.volume}
          onChange={(event) => props.onAudio(Number(event.target.value) === 0, Number(event.target.value))} />
      </div>
      {timeline.live ? <button className={`playback-live ${liveDelay <= 3 ? "at-live" : ""}`} title="返回直播位置"
        disabled={!seekable} onClick={() => { props.onSeek(timeline.end - 0.2); if (props.paused) props.onTogglePaused(); }}><span />{seekable && liveDelay > 3 ? `-${mediaTime(liveDelay)}` : "直播"}</button>
        : <span className="playback-time">{mediaTime(timeline.current)} / {mediaTime(timeline.end)}</span>}
      <div className="playback-details">{props.info}</div>
      <IconButton label={props.fullscreen ? "退出全屏" : "全屏"} onClick={props.onFullscreen}>{props.fullscreen ? <ArrowsIn size={17} /> : <ArrowsOut size={17} />}</IconButton>
    </div>
  </div>;
}
