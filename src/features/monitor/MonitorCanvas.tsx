"use client";

import { useRef, useState } from "react";
import type { MonitorVideo, VideoLayout, IQnType } from "@/types";
import type { ResizeHandle } from "@/features/free-layout/layout-utils";
import type { DanmakuPreferences } from "@/components/live/SettingsPanel";
import { MonitorTile } from "./MonitorTile";
import { clampRect, focusLayouts, type CanvasSize, type FocusLayout, type Rail } from "./geometry";
import type { RecoveryEvent, RecoveryPreferences } from "@/features/video/playback-watchdog";

interface Props {
  videos: MonitorVideo[];
  focusedId: string | null;
  size: CanvasSize;
  danmaku: DanmakuPreferences;
  onFullscreenChange: (id: string, active: boolean) => void;
  onLayout: (id: string, layout: VideoLayout) => void;
  onRaise: (id: string) => void;
  onFocus: (id: string) => void;
  onMute: (id: string) => void;
  onAudio: (id: string, muted: boolean, volume: number) => void;
  onClose: (id: string) => void;
  onRefresh: (id: string, rate?: number, qn?: IQnType) => void;
  onDanmaku: (id: string) => void;
  onFollow: (id: string, followed: boolean) => void;
  recovery: RecoveryPreferences;
  onRecoveryEvent: (id: string, key: number, event: RecoveryEvent) => void;
  onPlaybackError: (id: string, key: number, message: string) => void;
  onPaused: (id: string, paused: boolean) => void;
  onPlaying: (id: string, key: number) => void;
  onReady: (id: string, key: number) => void;
}

export function MonitorCanvas(props: Props) {
  const drag = useRef<{ id: string; x: number; y: number; origin: VideoLayout; handle?: ResizeHandle } | null>(null);
  const [scroll, setScroll] = useState<Record<Rail, number>>({ left: 0, right: 0, top: 0, bottom: 0 });
  const focus = props.focusedId ? focusLayouts(props.videos.map((v) => v.id), props.focusedId, props.size, scroll) : null;
  const begin = (event: React.PointerEvent, video: MonitorVideo, handle?: ResizeHandle) => {
    if (props.focusedId || event.button !== 0 || event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return;
    if (!handle && (event.target as HTMLElement).closest("button, input, select, a")) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: video.id, x: event.clientX, y: event.clientY,
      origin: { ...video.layout, zIndex: Math.max(0, ...props.videos.map((v) => v.layout.zIndex)) + 1 }, handle };
  };
  const move = (event: React.PointerEvent) => {
    const current = drag.current;
    if (!current) return;
    const dx = (event.clientX - current.x) / Math.max(1, props.size.width) * 100;
    const dy = (event.clientY - current.y) / Math.max(1, props.size.height) * 100;
    const next = { ...current.origin };
    if (!current.handle) { next.x += dx; next.y += dy; }
    else {
      if (current.handle.includes("e")) next.w += dx;
      if (current.handle.includes("s")) next.h += dy;
      if (current.handle.includes("w")) { next.x += dx; next.w -= dx; }
      if (current.handle.includes("n")) { next.y += dy; next.h -= dy; }
    }
    props.onLayout(current.id, clampRect(next, props.size));
  };
  const wheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!focus || event.ctrlKey || (event.target as HTMLElement).closest("input, select, .tile-menu")) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width * 100;
    const y = (event.clientY - bounds.top) / bounds.height * 100;
    const rail: Rail | null = x < 15 ? "left" : x > 85 ? "right" : y < 14 ? "top" : y > 86 ? "bottom" : null;
    if (rail && focus.limits[rail] > 0) setScroll((prev) => ({ ...prev,
      [rail]: Math.max(0, Math.min(focus.limits[rail], prev[rail] + event.deltaY / Math.max(1, rail === "left" || rail === "right" ? props.size.height : props.size.width) * 100)) }));
  };
  return <div className="monitor-canvas" onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onWheel={wheel}>
    {/* Keep DOM siblings stable when arranging changes the saved spatial order. */}
    {[...props.videos].sort((a, b) => a.id.localeCompare(b.id)).map((video) => {
      const rect: FocusLayout = focus?.layouts[video.id] ?? video.layout;
      return <div key={video.id} className="monitor-position" onPointerDownCapture={(event) => { if (event.button === 0 && !props.focusedId) props.onRaise(video.id); }} style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%`, zIndex: rect.zIndex, clipPath: rect.clipPath }}>
        <MonitorTile video={video} focused={video.id === props.focusedId} thumbnail={Boolean(props.focusedId) && video.id !== props.focusedId} danmaku={props.danmaku}
          onFullscreenChange={(active) => props.onFullscreenChange(video.id, active)}
          onDrag={(event) => begin(event, video)} onResize={(event, handle) => begin(event, video, handle)}
          onFocus={() => { setScroll({ left: 0, right: 0, top: 0, bottom: 0 }); props.onFocus(video.id); }}
          onMute={() => props.onMute(video.id)} onAudio={(muted, volume) => props.onAudio(video.id, muted, volume)}
          onClose={() => props.onClose(video.id)} onRefresh={() => props.onRefresh(video.id)} onQuality={(rate, qn) => props.onRefresh(video.id, rate, qn ?? "原画")}
          onDanmaku={() => props.onDanmaku(video.id)} onFollow={(followed) => props.onFollow(video.id, followed)}
          recovery={props.recovery} onRecoveryEvent={(key, event) => props.onRecoveryEvent(video.id, key, event)}
          onPlaybackError={(message) => props.onPlaybackError(video.id, video.playbackKey, message)}
          onPaused={(paused) => props.onPaused(video.id, paused)} onPlaying={() => props.onPlaying(video.id, video.playbackKey)} onReady={() => props.onReady(video.id, video.playbackKey)} />
      </div>;
    })}
  </div>;
}
