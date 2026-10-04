"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChatCircleText, CornersOut, CornersIn, X, DotsThree, ArrowsClockwise, Copy, ArrowSquareOut, WarningCircle, DotsSixVertical, User } from "@phosphor-icons/react";
import type { IQnType, MonitorVideo } from "@/types";
import type { ResizeHandle } from "@/features/free-layout/layout-utils";
import { PlayerAdapter } from "@/features/video/PlayerAdapter";
import { DanmakuLayer, type DanmakuLayerHandle } from "@/features/danmaku/DanmakuLayer";
import { useRoomDanmaku } from "@/features/danmaku/useRoomDanmaku";
import { IconButton } from "@/components/live/IconButton";
import type { DanmakuPreferences } from "@/components/live/SettingsPanel";
import { qualities } from "./storage";
import { platformNames, roomLabel } from "@/lib/room-identity";
import { copyText } from "@/lib/utils";
import { PlaybackControls, type PlaybackControlsHandle } from "@/features/video/PlaybackControls";
import { seekInMedia, timelineOptions } from "@/features/video/media-timeline";
import { FollowButton } from "@/components/live/FollowButton";
import { usePlaybackRecovery } from "@/features/video/usePlaybackRecovery";
import type { RecoveryEvent, RecoveryPreferences } from "@/features/video/playback-watchdog";

interface Props {
  video: MonitorVideo;
  focused: boolean;
  thumbnail: boolean;
  hovered: boolean;
  danmaku: DanmakuPreferences;
  onFullscreenChange: (active: boolean) => void;
  onDrag: (event: React.PointerEvent) => void;
  onResize: (event: React.PointerEvent, handle: ResizeHandle) => void;
  onMute: () => void;
  onAudio: (muted: boolean, volume: number) => void;
  onFocus: () => void;
  onClose: () => void;
  onRefresh: () => void;
  onDanmaku: () => void;
  onFollow: (followed: boolean) => void;
  recovery: RecoveryPreferences;
  onRecoveryEvent: (key: number, event: RecoveryEvent) => void;
  onQuality: (rate?: number, qn?: IQnType) => void;
  onPlaybackError: (message: string) => void;
  onPaused: (paused: boolean) => void;
  onFollowingLive: (followingLive: boolean) => void;
  onPlaying: () => void;
  onReady: () => void;
}

// Full class names must be present in source so Tailwind keeps the handle geometry.
const handles: Record<ResizeHandle, string> = { nw: "resize-nw", ne: "resize-ne", sw: "resize-sw", se: "resize-se", n: "resize-n", s: "resize-s", w: "resize-w", e: "resize-e" };

export interface MonitorTileHandle {
  key: (key: string) => boolean;
  finishSeek: (commit: boolean) => void;
}

export const MonitorTile = forwardRef<MonitorTileHandle, Props>(function MonitorTile(props, ref) {
  const { video } = props;
  const latest = useRef(props);
  latest.current = props;
  const setPaused = useCallback((paused: boolean) => {
    latest.current.onPaused(paused);
  }, []);
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const [dimensions, setDimensions] = useState("");
  const playbackControls = useRef<PlaybackControlsHandle>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [idle, setIdle] = useState(false);
  const wakeControls = useRef<() => void>(() => {});
  const [touchActive, setTouchActive] = useState(false);
  const [controlError, setControlError] = useState("");
  const [feedback, setFeedback] = useState("");
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fullscreenActive = useRef(false);
  const focusAfterFullscreen = useRef(false);
  const focusRequested = useRef(props.onFocus);
  focusRequested.current = props.onFocus;
  const fullscreenChanged = useRef(props.onFullscreenChange);
  fullscreenChanged.current = props.onFullscreenChange;
  const media = useRef<HTMLVideoElement>(null);
  usePlaybackRecovery(media, video, props.recovery, props.onRecoveryEvent);
  const root = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const layer = useRef<DanmakuLayerHandle>(null);
  const comments = useRoomDanmaku(video.platform, video.rid, video.danmakuEnabled, layer, props.danmaku.douyuMinLevel);
  const nobleCount = comments.nobleCount;
  const nobleLabel = nobleCount === null ? "—" : nobleCount.toLocaleString("en-US");
  const audible = !video.muted && video.volume > 0 && !video.paused && video.status === "playing";
  const actualQuality = video.selectedQuality?.name ?? (video.platform === "douyu" ? "画质待确认" : video.platform === "bilibili" ? video.qnName : "自动");
  const mediaOptions = timelineOptions(video.stream, video.platform);
  const compact = (props.thumbnail && !fullscreen) || narrow;

  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    setNarrow(node.clientWidth <= 280);
    const observer = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width <= 280));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => {
      const active = document.fullscreenElement === root.current;
      setFullscreen(active);
      if (active !== fullscreenActive.current) {
        fullscreenActive.current = active;
        if (!active && focusAfterFullscreen.current) {
          focusAfterFullscreen.current = false;
          focusRequested.current();
        } else fullscreenChanged.current(active);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.fullscreenElement !== root.current || menuRef.current?.contains(event.target as Node)) return;
      event.preventDefault();
      void document.exitFullscreen().catch(() => setControlError("当前浏览器无法退出全屏"));
    };
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("fullscreenchange", update); document.removeEventListener("keydown", escape); clearTimeout(feedbackTimer.current); };
  }, []);

  useEffect(() => {
    const node = root.current;
    setIdle(false);
    if (!node || props.hovered || video.paused || menu || video.status === "error" || touchActive) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inside = node.matches(":hover");
    let pressed = false;
    let disposed = false;
    const wake = () => {
      if (disposed) return;
      setIdle(false);
      clearTimeout(timer);
      if (!inside || pressed || document.hidden) return;
      timer = setTimeout(() => {
        if (inside && !pressed && !document.hidden
          && !node.matches(":has(:focus-visible), :has(.playback-volume:focus-within), :has(.playback-controls[data-seeking])")) setIdle(true);
      }, 3000);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      inside = true;
      wake();
    };
    const leave = () => { inside = false; wake(); };
    const down = (event: PointerEvent) => {
      pressed = true;
      inside = event.pointerType !== "touch";
      wake();
    };
    wakeControls.current = wake;
    const up = (event: PointerEvent) => {
      if (!pressed) return;
      pressed = false;
      inside = event.pointerType !== "touch" && node.contains(document.elementFromPoint(event.clientX, event.clientY));
      wake();
    };
    const focus = () => queueMicrotask(wake);
    const clear = () => { pressed = false; inside = false; wake(); };
    const resume = () => { inside = node.matches(":hover"); wake(); };
    const visibility = () => { if (document.hidden) clear(); else resume(); };
    node.addEventListener("pointerenter", move);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerleave", leave);
    node.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", clear);
    node.addEventListener("keydown", wake);
    node.addEventListener("focusin", focus);
    node.addEventListener("focusout", focus);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", clear);
    window.addEventListener("focus", resume);
    wake();
    return () => {
      disposed = true;
      wakeControls.current = () => {};
      clearTimeout(timer);
      node.removeEventListener("pointerenter", move);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerleave", leave);
      node.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", clear);
      node.removeEventListener("keydown", wake);
      node.removeEventListener("focusin", focus);
      node.removeEventListener("focusout", focus);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", clear);
      window.removeEventListener("focus", resume);
    };
  }, [fullscreen, props.focused, props.thumbnail, props.hovered, video.paused, video.status, menu, touchActive]);

  useEffect(() => {
    if (!menu) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!menuRef.current?.contains(target) && !root.current?.querySelector('[aria-label="更多操作"]')?.contains(target)) setMenu(null);
    };
    const resize = () => setMenu(null);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", resize);
    menuRef.current?.querySelector<HTMLElement>("select, input, button")?.focus();
    return () => { document.removeEventListener("pointerdown", outside, true); window.removeEventListener("resize", resize); };
  }, [menu]);

  const toggleMenu = () => {
    if (menu) { setMenu(null); return; }
    const bounds = root.current?.getBoundingClientRect();
    if (!bounds) return;
    setCopyStatus("");
    setMenu({ left: Math.max(12, Math.min(bounds.right - 244, window.innerWidth - 256)), top: Math.max(12, Math.min(bounds.top + 38, window.innerHeight - 300)) });
  };
  const toggleFullscreen = async () => {
    setControlError("");
    setMenu(null);
    try {
      if (document.fullscreenElement === root.current) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
    } catch { setControlError("当前浏览器无法进入全屏"); }
  };
  const toggleFocus = async () => {
    setControlError("");
    setMenu(null);
    if (document.fullscreenElement !== root.current) { props.onFocus(); return; }
    focusAfterFullscreen.current = true;
    try { await document.exitFullscreen(); }
    catch { focusAfterFullscreen.current = false; setControlError("当前浏览器无法退出全屏"); }
  };
  const intercept = (event: React.MouseEvent | React.PointerEvent) => {
    if ((event.target as HTMLElement).closest("button, input, select, a, summary, .tile-menu")) return;
    if (event.button === 1) { event.preventDefault(); event.stopPropagation(); }
    if (event.type === "click" && event.button === 0 && event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && (event.target as HTMLElement).closest(".tile-video")) {
      event.preventDefault(); event.stopPropagation();
      if (!video.isRefreshing) { props.onRefresh(); if (fullscreen) showFeedback("正在刷新直播"); }
    } else if (event.type === "click" && event.button === 0 && event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
      event.preventDefault(); event.stopPropagation(); props.onMute();
      if (fullscreen) showFeedback(video.muted || video.volume === 0 ? "声音开启" : "已静音");
    } else if (event.type === "click" && event.button === 0 && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault(); event.stopPropagation(); setPaused(!video.paused);
      if (fullscreen) showFeedback(video.paused ? "播放" : "暂停");
    }
  };
  const showFeedback = (label: string) => { clearTimeout(feedbackTimer.current); setFeedback(label); feedbackTimer.current = setTimeout(() => setFeedback(""), 900); };
  useImperativeHandle(ref, () => ({
    key: (key) => {
      const value = latest.current;
      wakeControls.current();
      if (key === " ") {
        setPaused(!value.video.paused);
        showFeedback(value.video.paused ? "播放" : "暂停");
      } else if (key === "ArrowUp" || key === "ArrowDown") {
        const previous = value.video.muted ? 0 : value.video.volume;
        const volume = Math.max(0, Math.min(100, Math.round(previous * 100) + (key === "ArrowUp" ? 5 : -5))) / 100;
        value.onAudio(volume === 0, volume);
        showFeedback(volume === 0 ? "已静音" : `音量 ${Math.round(volume * 100)}%`);
      } else {
        if (value.video.isRefreshing) return false;
        const label = playbackControls.current?.previewSeek(key === "ArrowLeft" ? -5 : 5);
        showFeedback(label ?? "暂无可回看的缓存");
        return Boolean(label);
      }
      return true;
    },
    finishSeek: (commit) => { playbackControls.current?.finishSeek(commit); wakeControls.current(); },
  }), [setPaused]);

  const secondaryControls = <>
    <IconButton label="刷新直播" disabled={video.isRefreshing} onClick={props.onRefresh}><ArrowsClockwise size={17} className={video.isRefreshing ? "animate-spin" : ""} /></IconButton>
    <IconButton label={comments.status === "unsupported" ? "不支持弹幕" : video.danmakuEnabled ? "关闭弹幕" : "开启弹幕"}
      active={video.danmakuEnabled && comments.status !== "unsupported"} disabled={comments.status === "unsupported"} onClick={props.onDanmaku}>
      <ChatCircleText size={17} className={comments.status === "error" || comments.status === "connecting" ? "text-warning" : ""} />
    </IconButton>
    <FollowButton followed={video.followed} onChange={props.onFollow} />
    <IconButton label={props.focused ? "退出聚焦" : "聚焦房间"} active={props.focused} onClick={() => void toggleFocus()}>
      {props.focused ? <CornersIn size={17} /> : <CornersOut size={17} />}
    </IconButton>
  </>;

  return <section ref={root} className={`monitor-tile ${props.hovered ? "is-room-hovered" : ""} ${props.focused ? "is-focused" : ""} ${props.thumbnail ? "is-thumbnail" : ""} ${compact ? "is-compact" : ""} ${audible ? "is-audible" : ""} ${video.paused ? "is-paused" : ""} ${menu ? "is-menu-open" : ""} ${touchActive ? "is-touch-active" : ""} ${idle ? "is-idle" : ""}`}
    aria-label={roomLabel(video)} data-room-id={video.id} data-platform={video.platform} data-muted={video.muted} data-audible={audible} data-focused={props.focused} data-room-idle={idle} data-playback-key={video.playbackKey} data-danmaku-status={comments.status}
    onPointerDownCapture={intercept} onClickCapture={intercept}
    onPointerDown={(event) => { if (event.pointerType === "touch") setTouchActive(true); }}
    onPointerLeave={() => setTouchActive(false)}
    onAuxClick={(event) => {
      if (event.button === 1 && !(event.target as HTMLElement).closest("button, input, select, a, summary, .tile-menu")) {
        event.preventDefault(); event.stopPropagation(); void toggleFocus();
      }
    }}>
    <header className="tile-header" onPointerDown={(event) => {
      if (!fullscreen && !props.focused && !event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey && event.button === 0) props.onDrag(event);
    }}>
      <DotsSixVertical size={14} className="drag-mark" />
      <div className="tile-identity" title={`${roomLabel(video)}${video.title ? ` · ${video.title}` : ""}`}>
        <span>{roomLabel(video)}</span><small>{video.anchorName ? video.title : ""}</small>
      </div>
      <div className="tile-controls">
        {!compact && secondaryControls}
        <IconButton label="更多操作" active={Boolean(menu)} onClick={toggleMenu}><DotsThree size={17} /></IconButton>
        <IconButton label="关闭画面" onClick={props.onClose}><X size={17} /></IconButton>
      </div>
    </header>
    <div className="tile-video" onDoubleClick={(event) => {
      if (event.altKey || event.shiftKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement).closest("button, input, select, a, .playback-controls")) return;
      event.preventDefault(); void toggleFullscreen();
    }}>
      {video.stream && <PlayerAdapter src={video.stream} playbackKey={video.playbackKey} muted={video.muted} volume={video.volume} paused={video.paused} followingLive={video.followingLive} mediaRef={media} timelineOptions={mediaOptions}
        onAudioChange={props.onAudio} onError={props.onPlaybackError} onPlay={props.onPlaying} onReady={props.onReady} onPause={() => { if (video.paused) props.onPaused(true); }}
        onTimeline={(timeline) => playbackControls.current?.report(timeline)}
        onReplayExpired={() => showFeedback("较早的缓存已过期，已移到最早可播位置")}
        onDimensions={(w, h) => setDimensions(w && h ? `${w} × ${h}` : "")} />}
      {video.stream && <PlaybackControls ref={playbackControls} key={video.playbackKey} mediaRef={media} paused={video.paused} muted={video.muted} volume={video.volume} fullscreen={fullscreen}
        info={<>{video.platform === "douyu" && <span className="playback-nobles" aria-label={nobleCount === null ? "当前贵宾人数暂不可用" : `当前贵宾：${nobleCount} 人`} title={nobleCount === null ? comments.connectionStatus === "error" ? "贵宾数据连接中断，可在更多操作中重试" : "正在获取当前贵宾人数" : `当前贵宾：${nobleCount} 人`}><User size={13} weight="fill" aria-hidden />{nobleLabel}</span>}
          <span className="playback-quality" title={actualQuality}>{actualQuality}</span>
          {dimensions && <span className="actual-resolution">· {dimensions}</span>}{video.warning && <span title={video.warning} className="quality-warning"><WarningCircle size={14} /></span>}</>}
        onTogglePaused={() => setPaused(!video.paused)} onMute={props.onMute} onAudio={props.onAudio}
        onSeek={(time, follow = false) => {
          const player = media.current;
          if (!player || !seekInMedia(player, time, mediaOptions)) return false;
          props.onFollowingLive(follow);
          return true;
        }}
        onFullscreen={() => void toggleFullscreen()} />}
      {!video.stream && <div className="tile-placeholder">
        {video.status === "error" ? <><WarningCircle size={25} /><span>{platformNames[video.platform]} · {video.rid}</span><p>{video.errorMessage || "暂时无法播放"}</p>
          <button className="subtle-button" onClick={props.onRefresh}><ArrowsClockwise size={16} />重新获取</button></>
          : <><span className="loading-spinner" /><p>正在连接直播</p></>}
      </div>}
      {video.stream && video.status === "error" && <div className="tile-error-strip"><WarningCircle size={16} /><span>{video.errorMessage}</span><button onClick={props.onRefresh}>重试</button></div>}
      {video.danmakuEnabled && comments.status !== "unsupported" && <DanmakuLayer ref={layer} opacity={props.danmaku.opacity} density={props.danmaku.density} speed={props.danmaku.speed} fontSize={props.thumbnail && !fullscreen ? props.danmaku.thumbnailFontSize : props.danmaku.fontSize} className="danmaku-overlay" />}
      {video.isRefreshing && <span className="tile-refreshing"><ArrowsClockwise size={13} className="animate-spin" />更新中</span>}
    </div>
    {controlError && <span role="status" className="tile-error-strip">{controlError}</span>}
    {feedback && <span role="status" className="tile-feedback">{feedback}</span>}
    {menu && createPortal(<div ref={menuRef} className="tile-menu floating-menu" role="dialog" aria-label={`${roomLabel(video)}播放设置`}
      style={{ left: menu.left, top: menu.top, maxHeight: Math.max(160, window.innerHeight - menu.top - 12) }}
      onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setMenu(null); root.current?.querySelector<HTMLButtonElement>('[aria-label="更多操作"]')?.focus(); } }}>
      <div className="tile-menu-heading">{roomLabel(video)} · 画质与播放</div>
      {compact && <div className="tile-menu-actions">{secondaryControls}</div>}
      {video.platform === "douyu" && video.qualities.length > 0 ? <label>画质
        <select aria-label="斗鱼画质" value={video.preferredRate ?? "auto"} disabled={video.isRefreshing} onChange={(e) => props.onQuality(e.target.value === "auto" ? undefined : Number(e.target.value), "原画")}>
          <option value="auto">{video.qnName === "原画" ? "最高可用" : `自动 · ${video.qnName}`}</option>
          {video.qualities.map((q) => <option key={q.rate} value={q.rate}>{q.name}{q.bit ? ` · ${(q.bit / 1000).toFixed(1)}M` : ""}</option>)}
        </select>
      </label> : video.platform === "bilibili" ? <label>画质
        <select aria-label="画质" value={video.qnName} disabled={video.isRefreshing} onChange={(e) => props.onQuality(undefined, e.target.value as IQnType)}>
          {qualities.map((q) => <option key={q}>{q}</option>)}
        </select>
      </label> : null}
      <button onClick={async () => setCopyStatus(await copyText(video.stream) ? "播放地址已复制" : "复制失败，请检查剪贴板权限")} disabled={!video.stream}><Copy size={16} />复制播放地址</button>
      <button onClick={async () => setCopyStatus(await copyText(video.url) ? "直播间地址已复制" : "复制失败，请检查剪贴板权限")}><Copy size={16} />复制直播间地址</button>
      <a href={video.url} target="_blank" rel="noreferrer"><ArrowSquareOut size={16} />打开原始直播间</a>
      {copyStatus && <p role="status">{copyStatus}</p>}
      {video.warning && <p className="text-warning">{video.warning}</p>}
      {comments.connectionStatus === "error" && <button onClick={comments.retry}><ChatCircleText size={16} />{video.platform === "douyu" ? "重试贵宾与弹幕连接" : "重试弹幕连接"}</button>}
    </div>, fullscreen && root.current ? root.current : document.body)}
    {!fullscreen && !props.focused && !props.thumbnail && (Object.entries(handles) as [ResizeHandle, string][]).map(([handle, className]) => <button key={handle} className={`resize-handle ${className}`} aria-label={`调整大小 ${handle}`} title="拖动调整大小" onPointerDown={(event) => props.onResize(event, handle)} />)}
  </section>;
});
