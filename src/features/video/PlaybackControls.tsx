"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { Play, Pause, SpeakerHigh, SpeakerSlash, ArrowsOut, ArrowsIn } from "@phosphor-icons/react";
import { IconButton } from "@/components/live/IconButton";
import { emptyTimeline, mediaTime, seekWindow, type MediaTimeline } from "./media-timeline";

interface Props {
  paused: boolean;
  muted: boolean;
  volume: number;
  fullscreen: boolean;
  mediaRef: React.RefObject<HTMLVideoElement | null>;
  info?: ReactNode;
  onTogglePaused: () => void;
  onMute: () => void;
  onAudio: (muted: boolean, volume: number) => void;
  onSeek: (time: number, followingLive?: boolean) => boolean;
  onFullscreen: () => void;
}

export interface PlaybackControlsHandle {
  report: (timeline: MediaTimeline) => void;
  previewSeek: (seconds: number) => string | null;
  finishSeek: (commit: boolean) => void;
}

export const PlaybackControls = forwardRef<PlaybackControlsHandle, Props>(function PlaybackControls(props, ref) {
  const root = useRef<HTMLDivElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLSpanElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const actual = useRef(emptyTimeline);
  const frozen = useRef<{ start: number; end: number } | null>(null);
  const drag = useRef<{ id: number; canceled: boolean } | null>(null);
  const cancelDrag = useRef<() => void>(() => {});
  const releaseDrag = useRef<(commit: boolean) => void>(() => {});
  const preview = useRef<number | undefined>(undefined);
  const keyboardSeeking = useRef(false);
  const wake = useRef<(force?: boolean) => void>(() => {});
  const [timeline, setTimeline] = useState(emptyTimeline);
  useImperativeHandle(ref, () => ({
    report: (next) => { actual.current = next; wake.current(); },
    previewSeek: (seconds) => {
      const next = actual.current;
      if (drag.current || next.end - next.start <= 0.2) return null;
      keyboardSeeking.current = true;
      frozen.current ??= seekWindow(next);
      const current = preview.current ?? latest.current.mediaRef.current?.currentTime ?? next.current;
      preview.current = Math.max(next.start + 0.1, Math.min(next.end - 0.1, current + seconds));
      root.current?.setAttribute("data-seeking", "true");
      wake.current(true);
      return next.live ? `距直播 ${mediaTime(next.end - preview.current)}` : mediaTime(preview.current);
    },
    finishSeek: (commit) => { if (keyboardSeeking.current) releaseDrag.current(commit); },
  }), []);

  useEffect(() => {
    const tile = root.current?.closest(".monitor-tile");
    if (!tile) return;
    let frame = 0, lastFrame = 0, lastText = 0, lastFill = 0, labelKey = "", edge = 0, live = true;
    let labelLive = true, labelAvailable = false, seekVisible = false;
    const visible = () => !document.hidden && !tile.classList.contains("is-fullscreen-idle")
      && seekVisible
      && (Boolean(frozen.current) || tile.matches(":hover, :has(:focus-visible), :has(.playback-volume:focus-within), .is-room-hovered, .is-menu-open, .is-paused, .is-touch-active"));
    const snapshot = () => ({ ...actual.current, current: preview.current ?? latest.current.mediaRef.current?.currentTime ?? actual.current.current });
    const publish = (now: number, force = false) => {
      const next = snapshot();
      const seekable = next.end - next.start > 0.2;
      const key = `${next.live}:${seekable}:${Math.floor(next.current)}:${Math.floor(next.start)}:${Math.floor(next.end)}`;
      if (key === labelKey || (!force && now - lastText < 1000 && next.live === labelLive && seekable === labelAvailable)) return;
      lastText = now; labelKey = key; labelLive = next.live; labelAvailable = seekable; setTimeline(next);
    };
    const draw = (now: number) => {
      frame = 0;
      if (!visible()) return;
      const next = snapshot();
      if (!lastFrame || next.live !== live || Math.abs(next.end - edge) > 10) edge = next.end;
      else edge += (next.end - edge) * (1 - Math.exp(-(now - lastFrame) / 100));
      lastFrame = now; live = next.live;
      const view = frozen.current ?? seekWindow({ ...next, end: next.live ? edge : next.end });
      const duration = view.end - view.start;
      const percent = (time: number) => duration > 0 ? Math.max(0, Math.min(100, (time - view.start) / duration * 100)) : 0;
      const position = Math.max(percent(next.start), percent(next.current));
      if (cursor.current) cursor.current.style.transform = `translateX(${position}%)`;
      if (slider.current && !frozen.current) slider.current.value = String(position * 10);
      if (track.current && now - lastFill >= 100) {
        lastFill = now;
        track.current.style.setProperty("--available-start", `${percent(next.start)}%`);
        track.current.style.setProperty("--played", `${position}%`);
        track.current.style.setProperty("--buffered", `${next.live ? 100 : Math.max(position, percent(next.bufferedEnd))}%`);
      }
      publish(now);
      frame = requestAnimationFrame(draw);
    };
    const update = (force = false) => {
      seekVisible = Boolean(slider.current?.getClientRects().length);
      const now = performance.now();
      const next = snapshot();
      // Hidden controls only publish mode/availability changes; no idle frame loop.
      const availability = next.end - next.start > 0.2;
      if (force || visible() || next.live !== labelLive || availability !== labelAvailable) publish(now, force || !visible());
      if (!visible()) { cancelAnimationFrame(frame); frame = 0; lastFrame = 0; return; }
      if (!frame) frame = requestAnimationFrame(draw);
    };
    wake.current = update;
    const changed = () => { if (document.hidden) cancelDrag.current(); update(true); };
    const cancel = () => cancelDrag.current();
    const release = (event: PointerEvent) => { if (event.pointerId === drag.current?.id) releaseDrag.current(event.type === "pointerup"); };
    for (const event of ["pointerenter", "pointerleave", "focusin", "focusout"]) tile.addEventListener(event, changed);
    document.addEventListener("visibilitychange", changed);
    document.addEventListener("pointerup", release); document.addEventListener("pointercancel", release);
    window.addEventListener("blur", cancel);
    const observer = new MutationObserver(() => update());
    observer.observe(tile, { attributes: true, attributeFilter: ["class"] });
    const resize = new ResizeObserver(() => update());
    resize.observe(tile);
    update(true);
    return () => {
      wake.current = () => {}; cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect();
      for (const event of ["pointerenter", "pointerleave", "focusin", "focusout"]) tile.removeEventListener(event, changed);
      document.removeEventListener("visibilitychange", changed);
      document.removeEventListener("pointerup", release); document.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", cancel);
    };
  }, []);

  const seekable = timeline.end - timeline.start > 0.2;
  const delay = Math.max(0, timeline.end - timeline.current);
  const expired = timeline.live && seekable && timeline.current < timeline.start - 0.1;
  const finish = (commit: boolean) => {
    if (!frozen.current) return;
    if (!commit && drag.current) drag.current.canceled = true;
    const requested = preview.current;
    frozen.current = null; preview.current = undefined;
    keyboardSeeking.current = false;
    root.current?.removeAttribute("data-seeking");
    if (commit && requested !== undefined) latest.current.onSeek(requested);
    wake.current(true);
  };
  cancelDrag.current = () => finish(false);
  releaseDrag.current = (commit) => { finish(commit && !drag.current?.canceled); drag.current = null; };
  return <div ref={root} className="playback-controls" aria-label="播放控制" onPointerDown={(event) => event.stopPropagation()}>
    <div className="playback-seek-wrap" title={timeline.live ? `已缓存 ${mediaTime(timeline.end - timeline.start)}；暗色区域尚无缓存` : "拖动跳转播放位置"}>
      <div ref={track} className="playback-seek-track"><span ref={cursor} className="playback-cursor" /></div>
      <input ref={slider} className="playback-seek" aria-label={timeline.live ? "缓冲回看" : "播放进度"} type="range"
        min={0} max={1000} step={1} defaultValue={1000} disabled={!seekable}
        aria-valuetext={timeline.live ? expired ? "暂停位置已过期" : delay <= 3 ? "直播" : `距直播 ${mediaTime(delay)}` : mediaTime(timeline.current)}
        onPointerDown={(event) => {
          if (event.button !== 0 || !seekable) return;
          drag.current = { id: event.pointerId, canceled: false };
          frozen.current = seekWindow(actual.current); preview.current = latest.current.mediaRef.current?.currentTime ?? actual.current.current;
          event.currentTarget.setPointerCapture(event.pointerId); root.current?.setAttribute("data-seeking", "true");
        }}
        onPointerUp={() => releaseDrag.current(true)} onPointerCancel={() => releaseDrag.current(false)} onLostPointerCapture={() => finish(false)} onBlur={() => finish(false)}
        onChange={(event) => {
          if (drag.current?.canceled) return;
          const view = frozen.current ?? seekWindow(actual.current);
          const requested = Math.max(actual.current.start, view.start + Number(event.target.value) / 1000 * (view.end - view.start));
          if (frozen.current) preview.current = requested;
          else latest.current.onSeek(requested);
          wake.current(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && frozen.current) { event.preventDefault(); event.stopPropagation(); finish(false); return; }
          const requested = event.key === "Home" ? actual.current.start + 0.1 : event.key === "End" ? actual.current.end - 0.5 : undefined;
          if (requested !== undefined) { event.preventDefault(); latest.current.onSeek(requested, event.key === "End"); wake.current(true); }
        }} />
    </div>
    <div className="playback-buttons">
      <IconButton label={props.paused ? "播放" : "暂停"} onClick={props.onTogglePaused}>{props.paused ? <Play size={16} weight="fill" /> : <Pause size={16} weight="fill" />}</IconButton>
      <div className="playback-volume">
        <IconButton label={props.muted || props.volume === 0 ? "开启声音" : "静音"} onClick={props.onMute}>{props.muted || props.volume === 0 ? <SpeakerSlash size={17} /> : <SpeakerHigh size={17} />}</IconButton>
        <div className="volume-popover"><input aria-label="音量" aria-orientation="vertical" type="range" min={0} max={1} step={0.05} value={props.muted ? 0 : props.volume}
          onChange={(event) => props.onAudio(Number(event.target.value) === 0, Number(event.target.value))} /></div>
      </div>
      {timeline.live ? <button className={`playback-live ${delay <= 3 && !expired ? "at-live" : ""}`} title="返回直播位置" disabled={!seekable}
        onClick={() => { if (props.onSeek(actual.current.end - 0.5, true) && props.paused) props.onTogglePaused(); wake.current(true); }}><span />{expired ? "已过期" : delay <= 3 ? "直播" : `-${mediaTime(delay)}`}</button>
        : <span className="playback-time">{mediaTime(timeline.current)} / {mediaTime(timeline.end)}</span>}
      <div className="playback-details">{props.info}</div>
      <IconButton label={props.fullscreen ? "退出全屏" : "全屏"} onClick={props.onFullscreen}>{props.fullscreen ? <ArrowsIn size={17} /> : <ArrowsOut size={17} />}</IconButton>
    </div>
  </div>;
});
