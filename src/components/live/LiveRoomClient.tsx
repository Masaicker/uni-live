"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { SquaresFour, SidebarSimple, Plus } from "@phosphor-icons/react";
import type { FollowedRoom, IQnType, MonitorVideo, PlaybackResult, RoomInfo } from "@/types";
import { apiGetRoomInfo } from "@/apis";
import { RoomSidebar } from "./RoomSidebar";
import { useRoomKeyboard } from "./useRoomKeyboard";
import { useRoomHover } from "./useRoomHover";
import { SettingsPanel, DEFAULT_DANMAKU_PREFERENCES, type DanmakuPreferences } from "./SettingsPanel";
import { MonitorCanvas } from "@/features/monitor/MonitorCanvas";
import { autoLayouts, arrangeByPosition, insertionLayout, type CanvasSize } from "@/features/monitor/geometry";
import { initialMonitorState, monitorReducer, workspaceSnapshot, type MonitorAction } from "@/features/monitor/state";
import { createRoom, qualities, restoreWorkspace, shareWorkspace, WORKSPACE_KEY, type LegacyShare } from "@/features/monitor/storage";
import { getStreamErrorMessage, resolveStreamUrl } from "@/features/video/stream-service";
import { copyText, detectStreamType } from "@/lib/utils";
import { roomIdentity, roomLabel } from "@/lib/room-identity";
import { assertPlatformEnabled, isPlatformEnabled } from "@/lib/platform-support";
import { DOUYU_COOKIE_EVENT } from "@/lib/douyu-cookie";
import { DEFAULT_RECOVERY_PREFERENCES, normalizeRecoveryPreferences, type RecoveryEvent, type RecoveryPreferences } from "@/features/video/playback-watchdog";

const PREFERENCES_KEY = "uni-live.preferences.v2";
type StreamSelection = { rate?: number; qn: IQnType };
type PlaybackBackup = Pick<MonitorVideo, "stream" | "qnName" | "preferredRate" | "selectedQuality" | "qualities" | "warning"> & { key: number; expires: number };

export function LiveRoomClient(share: LegacyShare) {
  const [state, reactDispatch] = useReducer(monitorReducer, initialMonitorState);
  const current = useRef(state);
  current.current = state;
  // Async operations and consecutive UI actions must observe the same reducer state.
  const send = useCallback((action: MonitorAction) => {
    const next = monitorReducer(current.current, action);
    if (next === current.current) return;
    current.current = next;
    reactDispatch(action);
  }, []);
  const [ready, setReady] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [libraryView, setLibraryView] = useState<"list" | "avatars">("list");
  const [autoFocusAudio, setAutoFocusAudio] = useState(true);
  const [autoFocusDanmaku, setAutoFocusDanmaku] = useState(true);
  const [recovery, setRecovery] = useState<RecoveryPreferences>(DEFAULT_RECOVERY_PREFERENCES);
  const recoveryPreferences = useRef(recovery);
  recoveryPreferences.current = recovery;
  const [mobile, setMobile] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [settings, setSettings] = useState(false);
  const [adding, setAdding] = useState(false);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const refreshAllActive = useRef(false);
  const [toast, setToast] = useState<string | null>(null);
  const [closedRooms, setClosedRooms] = useState<{ rooms: FollowedRoom[]; manual: boolean } | null>(null);
  const [unfollowedRoom, setUnfollowedRoom] = useState<FollowedRoom | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [quality, setQuality] = useState<IQnType>("原画");
  const [danmaku, setDanmaku] = useState<DanmakuPreferences>({ ...DEFAULT_DANMAKU_PREFERENCES });
  const [size, setSize] = useState<CanvasSize>({ width: 1, height: 1 });
  const canvas = useRef<HTMLDivElement>(null);
  const streamRequests = useRef(new Map<string, AbortController>());
  const metadataRequests = useRef(new Map<string, AbortController>());
  const playbackBackups = useRef(new Map<string, PlaybackBackup>());
  const recoveryRequests = useRef(new Map<string, AbortController>());
  const addRequest = useRef<AbortController | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const initialShare = useRef(share);
  const streamType = useRef<ReturnType<typeof detectStreamType>>("flv");
  const workspace = useRef<HTMLDivElement>(null);
  const hoveredId = useRoomHover(workspace, `${libraryView}:${collapsed}:${drawer}:${settings}`);
  const controlRef = useRoomKeyboard({ videos: state.videos, focusedId: state.focus?.id ?? null, fullscreenId: state.fullscreen?.id ?? null, blocked: settings });

  const dismissUndo = useCallback(() => { clearTimeout(undoTimer.current); setClosedRooms(null); setUnfollowedRoom(null); }, []);

  const notify = useCallback((message: string) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    streamType.current = detectStreamType();
    try {
      send({ type: "hydrate", snapshot: restoreWorkspace(localStorage, initialShare.current) });
      const saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || "null");
      if (saved) {
        setCollapsed(saved.collapsed === true);
        setLibraryView(saved.libraryView === "avatars" ? "avatars" : "list");
        setAutoFocusAudio(saved.autoFocusAudio !== false);
        setAutoFocusDanmaku(saved.autoFocusDanmaku !== false);
        setRecovery(normalizeRecoveryPreferences(saved.recovery));
        if (qualities.includes(saved.quality)) setQuality(saved.quality);
      }
      const bounded = (key: string, fallback: number, min: number, max: number) => {
        const raw = saved?.danmaku?.[key] ?? localStorage.getItem(`danmaku${key[0].toUpperCase()}${key.slice(1)}`);
        const value = raw === null || raw === undefined ? fallback : Number(raw);
        return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
      };
      setDanmaku({ opacity: bounded("opacity", DEFAULT_DANMAKU_PREFERENCES.opacity, 0, 100), density: bounded("density", DEFAULT_DANMAKU_PREFERENCES.density, 0, 300), speed: bounded("speed", DEFAULT_DANMAKU_PREFERENCES.speed, 40, 400), fontSize: bounded("fontSize", DEFAULT_DANMAKU_PREFERENCES.fontSize, 12, 40), thumbnailFontSize: bounded("thumbnailFontSize", DEFAULT_DANMAKU_PREFERENCES.thumbnailFontSize, 10, 24) });
    } catch { notify("本地设置读取失败，仍可添加直播间"); }
    setReady(true);
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [notify, send]);

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const videoIds = state.videos.map((v) => v.id).join(",");
  useEffect(() => {
    if (!ready || current.current.manual || size.width < 2 || size.height < 2) return;
    send({ type: "arrange", layouts: autoLayouts(current.current.videos.map((v) => v.id), size) });
  }, [videoIds, size, ready, state.manual, send]);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspaceSnapshot(current.current))); }
    catch { notify("浏览器存储空间不足，本次修改未能保存"); }
  }, [state.rooms, state.manual, videoIds, ready, notify]); // Runtime-only changes need no storage write.

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ collapsed, quality, danmaku, libraryView, autoFocusAudio, autoFocusDanmaku, recovery })); }
    catch { notify("观看偏好未能保存"); }
  }, [collapsed, quality, danmaku, libraryView, autoFocusAudio, autoFocusDanmaku, recovery, ready, notify]);

  const stopWatching = useCallback((id: string, remove = false) => {
    recoveryRequests.current.get(id)?.abort();
    recoveryRequests.current.delete(id);
    streamRequests.current.get(id)?.abort();
    streamRequests.current.delete(id);
    playbackBackups.current.delete(id);
    send({ type: remove ? "remove" : "close", id });
    if (!current.current.rooms.some((room) => room.id === id)) { metadataRequests.current.get(id)?.abort(); metadataRequests.current.delete(id); }
  }, [send]);

  const applyIdentity = useCallback((id: string, info: Partial<RoomInfo> & { lastStatusAt?: number }) => {
    const room = current.current.rooms.find((r) => r.id === id);
    if (!room) return false;
    const resolved = { ...room, ...info };
    const existing = current.current.rooms.find((r) => r.id !== id && roomIdentity(r) === roomIdentity(resolved));
    if (existing) {
      const wasOpen = current.current.videos.some((v) => v.id === id);
      send({ type: "room", id: existing.id, patch: { ...info, followed: existing.followed || room.followed, followOrder: existing.followed ? existing.followOrder : room.followOrder, lastWatchedAt: Math.max(existing.lastWatchedAt ?? 0, room.lastWatchedAt ?? 0) || undefined } });
      stopWatching(id, true);
      if (wasOpen && !current.current.videos.some((v) => v.id === existing.id)) {
        send({ type: "open", id: existing.id, layout: insertionLayout(current.current.videos.map((v) => v.layout), size) });
      }
      return false;
    }
    send({ type: "room", id, patch: info });
    return true;
  }, [send, size, stopWatching]);

  const loadMetadata = useCallback(async (id: string, signal?: AbortSignal) => {
    const room = current.current.rooms.find((r) => r.id === id);
    if (signal?.aborted || !room || !isPlatformEnabled(room.platform) || room.platform === "direct" || room.platform === "unknown" || metadataRequests.current.has(id)) return;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    metadataRequests.current.set(id, controller);
    try {
      const info = await apiGetRoomInfo(room.platform, room.rid, controller.signal);
      if (!controller.signal.aborted && metadataRequests.current.get(id) === controller) { applyIdentity(id, { ...info, lastStatusAt: Date.now() }); return info; }
    } catch {
      if (!controller.signal.aborted) send({ type: "room", id, patch: { liveStatus: null, lastStatusAt: Date.now() } });
    } finally {
      signal?.removeEventListener("abort", abort);
      if (metadataRequests.current.get(id) === controller) metadataRequests.current.delete(id);
    }
  }, [applyIdentity, send]);

  const followedIds = state.rooms.filter((room) => room.followed).map((room) => room.id).join(",");
  useEffect(() => {
    if (!ready) return;
    let disposed = false, refreshing = false;
    const refreshFollowed = async () => {
      if (disposed || refreshing || document.visibilityState === "hidden") return;
      refreshing = true;
      const queue = current.current.rooms.filter((room) => room.followed && isPlatformEnabled(room.platform) && room.platform !== "direct").map((room) => room.id);
      const worker = async () => { while (!disposed && queue.length) { const id = queue.shift(); if (id) await loadMetadata(id); } };
      try { await Promise.all([worker(), worker(), worker()]); } finally { refreshing = false; }
    };
    void refreshFollowed();
    const timer = setInterval(() => void refreshFollowed(), 60000);
    const visible = () => { if (document.visibilityState === "visible") void refreshFollowed(); };
    document.addEventListener("visibilitychange", visible);
    return () => { disposed = true; clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [followedIds, ready, loadMetadata]);

  const loadStream = useCallback(async (id: string, selection?: StreamSelection, signal?: AbortSignal) => {
    const target = current.current.videos.find((v) => v.id === id);
    if (!target || signal?.aborted) return;
    streamRequests.current.get(id)?.abort();
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    streamRequests.current.set(id, controller);
    const requested = selection ?? { rate: target.preferredRate, qn: target.qnName };
    send({ type: "video", id, patch: { isRefreshing: true, status: target.stream ? target.status : "loading", errorMessage: undefined } });
    try {
      const result = await resolveStreamUrl(target.url, requested.qn, streamType.current, requested.rate, controller.signal);
      if (controller.signal.aborted || streamRequests.current.get(id) !== controller) return;
      const active = current.current.videos.find((v) => v.id === id);
      if (!active) return;
      const error = getStreamErrorMessage(result.stream, result.platform);
      if (error) throw new Error(error);
      if (!applyIdentity(id, { rid: result.rid, platform: result.platform })) return;
      const key = active.playbackKey + 1;
      if (selection && active.stream) playbackBackups.current.set(id, { stream: active.stream, qnName: active.qnName, preferredRate: active.preferredRate, selectedQuality: active.selectedQuality, qualities: active.qualities, warning: active.warning, key, expires: Date.now() + 20000 });
      const playback: PlaybackResult = result;
      send({ type: "room", id, patch: { qnName: requested.qn, preferredRate: requested.rate } });
      send({ type: "video", id, patch: { stream: playback.stream, streamType: streamType.current, playbackKey: key, qualities: playback.qualities ?? [], selectedQuality: playback.selectedQuality, warning: playback.warning, isRefreshing: false, status: "loading", errorMessage: undefined } });
    } catch (error) {
      if (controller.signal.aborted || streamRequests.current.get(id) !== controller) return;
      const active = current.current.videos.find((v) => v.id === id);
      const apiError = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      const message = apiError || (error instanceof Error && !error.message.includes("status code") ? error.message : "取流失败，请稍后刷新或检查登录状态");
      send({ type: "video", id, patch: { isRefreshing: false, status: active?.stream ? active.status : "error", errorMessage: active?.stream ? undefined : message } });
      notify(`${roomIdentity(target)} · ${active?.stream ? `更新失败，保留原画面：${message}` : message}`);
    } finally {
      signal?.removeEventListener("abort", abort);
      if (streamRequests.current.get(id) === controller) streamRequests.current.delete(id);
    }
  }, [applyIdentity, notify, send]);

  // Only newly opened idle videos start a request; geometry/audio changes never refresh streams.
  useEffect(() => {
    if (!ready) return;
    for (const video of state.videos) if (video.status === "idle" && !streamRequests.current.has(video.id)) {
      void loadMetadata(video.id);
      void loadStream(video.id);
    }
  }, [state.videos, ready, loadMetadata, loadStream]);

  useEffect(() => {
    const refreshAccount = () => {
      for (const video of current.current.videos) if (video.platform === "douyu") {
        recoveryRequests.current.get(video.id)?.abort(); recoveryRequests.current.delete(video.id);
        send({ type: "video", id: video.id, patch: { recoveryKey: video.recoveryKey + 1, recoveryStopped: false } });
        void loadStream(video.id);
      }
      notify("斗鱼登录状态已更新，正在重新获取直播画质");
    };
    const storageChanged = (event: StorageEvent) => { if (event.key === "uni-live.douyu-cookie") refreshAccount(); };
    window.addEventListener(DOUYU_COOKIE_EVENT, refreshAccount);
    window.addEventListener("storage", storageChanged);
    return () => { window.removeEventListener(DOUYU_COOKIE_EVENT, refreshAccount); window.removeEventListener("storage", storageChanged); };
  }, [loadStream, notify, send]);

  useEffect(() => {
    const suspend = () => {
      if (document.visibilityState === "visible" && navigator.onLine) return;
      for (const [id, controller] of recoveryRequests.current) { controller.abort(); send({ type: "video", id, patch: { isRefreshing: false } }); }
      recoveryRequests.current.clear();
    };
    document.addEventListener("visibilitychange", suspend);
    window.addEventListener("offline", suspend);
    return () => { document.removeEventListener("visibilitychange", suspend); window.removeEventListener("offline", suspend); };
  }, [send]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.fullscreenElement || settings || (event.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (drawer) setDrawer(false);
      else send({ type: "focus", id: null });
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [drawer, settings, send]);

  useEffect(() => {
    const streams = streamRequests.current, metadata = metadataRequests.current;
    const recoveries = recoveryRequests.current;
    return () => {
      refreshAllActive.current = false;
      for (const controller of streams.values()) controller.abort();
      for (const controller of metadata.values()) controller.abort();
      for (const controller of recoveries.values()) controller.abort();
      addRequest.current?.abort();
      streams.clear(); metadata.clear(); clearTimeout(toastTimer.current); clearTimeout(undoTimer.current);
    };
  }, []);

  const openRoom = (id: string) => {
    const room = current.current.rooms.find((r) => r.id === id);
    if (!room || !isPlatformEnabled(room.platform)) return;
    dismissUndo();
    if (!current.current.videos.some((v) => v.id === id)) send({ type: "open", id, layout: current.current.manual && room?.layout ? room.layout : insertionLayout(current.current.videos.map((v) => v.layout), size) });
    if (mobile) setDrawer(false);
  };
  const addRoom = async (url: string) => {
    if (addRequest.current) return false;
    const controller = new AbortController();
    addRequest.current = controller;
    setAdding(true);
    try {
      let room: FollowedRoom = { ...createRoom(url), qnName: quality };
      assertPlatformEnabled(room.platform);
      if (room.platform !== "direct") {
        const info = await apiGetRoomInfo(room.platform, room.rid, controller.signal);
        if (controller.signal.aborted) return false;
        room = { ...room, ...info, lastStatusAt: Date.now() };
      }
      dismissUndo();
      const existing = current.current.rooms.find((r) => roomIdentity(r) === roomIdentity(room));
      if (!existing) send({ type: "add", room });
      else if (room.platform !== "direct") send({ type: "room", id: existing.id, patch: { platform: room.platform, rid: room.rid, anchorName: room.anchorName, title: room.title, avatarUrl: room.avatarUrl, liveStatus: room.liveStatus, lastStatusAt: room.lastStatusAt } });
      if (room.platform !== "direct") send({ type: "visited", id: existing?.id ?? room.id, at: Date.now() });
      if (room.liveStatus === false) { notify(`${roomLabel(room)} · 未开播，已保存到历史`); return "history" as const; }
      openRoom(existing?.id ?? room.id);
      if (existing) notify("已定位到这个直播间");
      return "layout" as const;
    } catch (error) {
      if (!controller.signal.aborted) {
        const apiError = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
        notify(apiError || (error instanceof Error && !error.message.includes("status code") && !error.message.includes("timeout") ? error.message : "暂时无法验证房间，请稍后重试"));
      }
      return false;
    } finally { addRequest.current = null; if (!controller.signal.aborted) setAdding(false); }
  };
  const changeFollow = (id: string, followed: boolean) => {
    const room = current.current.rooms.find((room) => room.id === id);
    if (!room || room.followed === followed) return;
    dismissUndo();
    send({ type: "follow", id, followed });
    if (!followed) {
      setUnfollowedRoom({ ...room });
      undoTimer.current = setTimeout(() => setUnfollowedRoom(null), 8000);
    }
  };
  const undoUnfollow = () => {
    if (!unfollowedRoom) return;
    send({ type: "restore-follow", room: unfollowedRoom });
    dismissUndo();
  };
  const arrange = () => send({ type: "arrange", layouts: arrangeByPosition(current.current.videos, size) });
  const closeAll = async () => {
    if (!current.current.videos.length) return;
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); }
      catch { notify("无法退出全屏，请退出全屏后关闭全部画面"); return; }
    }
    const backup = { rooms: current.current.videos.map((video) => ({ ...current.current.rooms.find((room) => room.id === video.id)!, layout: { ...video.layout } })), manual: current.current.manual };
    if (!backup.rooms.length) return;
    dismissUndo();
    for (const controller of recoveryRequests.current.values()) controller.abort();
    recoveryRequests.current.clear();
    for (const controller of streamRequests.current.values()) controller.abort();
    streamRequests.current.clear(); playbackBackups.current.clear();
    send({ type: "close-all" });
    for (const [id, controller] of metadataRequests.current) if (!current.current.rooms.some((room) => room.id === id)) { controller.abort(); metadataRequests.current.delete(id); }
    clearTimeout(toastTimer.current); setToast(null);
    clearTimeout(undoTimer.current); setClosedRooms(backup);
    undoTimer.current = setTimeout(() => setClosedRooms(null), 8000);
  };
  const undoCloseAll = () => {
    if (!closedRooms || current.current.videos.length) return;
    send({ type: "restore-closed", ...closedRooms });
    dismissUndo();
    notify("已恢复布局，正在重新连接直播");
  };
  const cleanTemporary = () => {
    const temporary = current.current.videos.filter((video) => !video.followed);
    if (!temporary.length) return;
    send({ type: "focus", id: null });
    for (const video of temporary) stopWatching(video.id);
    arrange();
    notify(`已关闭 ${temporary.length} 个临时房间，剩余画面已整理`);
  };
  const toggleMute = (id: string) => {
    const video = current.current.videos.find((v) => v.id === id);
    if (!video) return;
    const turnOn = video.muted || video.volume === 0;
    send({ type: "audio", id, muted: !turnOn, volume: turnOn ? video.volume || video.lastVolume || 0.5 : video.volume });
  };
  const refresh = (id: string, rate?: number, qn?: IQnType) => {
    if (streamRequests.current.has(id)) return;
    const video = current.current.videos.find((video) => video.id === id);
    if (!video) return;
    recoveryRequests.current.get(id)?.abort();
    recoveryRequests.current.delete(id);
    send({ type: "video", id, patch: { recoveryKey: video.recoveryKey + 1, recoveryStopped: false } });
    if (rate !== undefined || qn !== undefined) void loadStream(id, { rate, qn: qn ?? "原画" });
    else { void loadMetadata(id); void loadStream(id); }
  };
  const refreshAll = async () => {
    if (refreshAllActive.current) return;
    refreshAllActive.current = true;
    setRefreshingAll(true);
    const queue = current.current.rooms.filter((room) => isPlatformEnabled(room.platform)).map((room) => room.id);
    const worker = async () => {
      while (refreshAllActive.current && queue.length) {
        const id = queue.shift()!;
        const watching = current.current.videos.some((video) => video.id === id);
        const video = current.current.videos.find((video) => video.id === id);
        if (video) { recoveryRequests.current.get(id)?.abort(); recoveryRequests.current.delete(id); send({ type: "video", id, patch: { recoveryKey: video.recoveryKey + 1, recoveryStopped: false } }); }
        await Promise.all([loadMetadata(id), ...(watching ? [loadStream(id)] : [])]);
      }
    };
    try { await Promise.all([worker(), worker(), worker()]); }
    finally { refreshAllActive.current = false; setRefreshingAll(false); }
  };
  const playbackError = (id: string, key: number, message: string) => {
    const video = current.current.videos.find((v) => v.id === id);
    if (!video || video.playbackKey !== key) return;
    const backup = playbackBackups.current.get(id);
    playbackBackups.current.delete(id);
    if (backup && backup.key === key && backup.expires >= Date.now()) {
      const original = { stream: backup.stream, qnName: backup.qnName, preferredRate: backup.preferredRate, selectedQuality: backup.selectedQuality, qualities: backup.qualities, warning: backup.warning };
      send({ type: "room", id, patch: { qnName: original.qnName, preferredRate: original.preferredRate } });
      send({ type: "video", id, patch: { ...original, playbackKey: key + 1, status: "loading", errorMessage: undefined } });
      notify("所选画质无法播放，已恢复原画质");
    } else send({ type: "video", id, patch: { status: "error", errorMessage: message } });
  };
  const shareCurrent = async () => {
    const copied = await copyText(shareWorkspace(location.origin, workspaceSnapshot(current.current)));
    notify(copied ? "当前观看的分享链接已复制" : "复制失败，请检查浏览器剪贴板权限");
  };
  const changeAutoFocusAudio = (enabled: boolean) => { setAutoFocusAudio(enabled); send({ type: "audio-policy", enabled }); };
  const changeAutoFocusDanmaku = (enabled: boolean) => { setAutoFocusDanmaku(enabled); send({ type: "danmaku-policy", enabled }); };
  const changeRecovery = (value: RecoveryPreferences) => {
    setRecovery(normalizeRecoveryPreferences(value));
    for (const [id, controller] of recoveryRequests.current) { controller.abort(); send({ type: "video", id, patch: { isRefreshing: false } }); }
    recoveryRequests.current.clear();
  };
  const recoveryEvent = async (id: string, key: number, event: RecoveryEvent) => {
    const video = current.current.videos.find((video) => video.id === id);
    if (!video || video.playbackKey !== key || !recoveryPreferences.current.enabled) return;
    if (event === "recovered") { send({ type: "video", id, patch: { status: "playing", errorMessage: undefined } }); return; }
    if (event === "exhausted") { send({ type: "video", id, patch: { status: "error", errorMessage: `自动恢复已尝试 ${recoveryPreferences.current.maxAttempts} 次，请手动重试` } }); return; }
    if (video.paused || video.isRefreshing || streamRequests.current.has(id) || recoveryRequests.current.has(id) || document.visibilityState !== "visible" || !navigator.onLine) return;
    const controller = new AbortController();
    recoveryRequests.current.set(id, controller);
    send({ type: "video", id, patch: { isRefreshing: true } });
    try {
      const info = await loadMetadata(id, controller.signal);
      const active = current.current.videos.find((video) => video.id === id);
      if (controller.signal.aborted || !active || active.playbackKey !== key || active.paused || document.visibilityState !== "visible" || !navigator.onLine) return;
      if (info?.liveStatus === false) { send({ type: "video", id, patch: { recoveryStopped: true, status: "error", errorMessage: "主播已下播，已停止自动恢复" } }); return; }
      await loadStream(id, undefined, controller.signal);
    } finally {
      if (recoveryRequests.current.get(id) === controller) { recoveryRequests.current.delete(id); send({ type: "video", id, patch: { isRefreshing: false } }); }
    }
  };
  const sidebarProps = {
    rooms: state.rooms.filter((room) => isPlatformEnabled(room.platform)), videos: state.videos, hoveredId, collapsed: mobile ? false : collapsed, adding, focused: Boolean(state.focus), view: libraryView, onViewChange: setLibraryView,
    onCollapse: (value: boolean) => mobile ? setDrawer(!value) : setCollapsed(value), onAdd: addRoom, onOpen: openRoom,
    onClose: stopWatching, onCloseAll: () => void closeAll(), onFollow: changeFollow,
    onForget: (id: string) => { dismissUndo(); send({ type: "forget", id }); }, onClearHistory: () => { dismissUndo(); send({ type: "clear-history" }); },
    onArrange: arrange, onMuteAll: () => send({ type: "mute-all" }), onClean: cleanTemporary, onExitFocus: () => send({ type: "focus", id: null }),
    onSettings: () => { setSettings(true); setDrawer(false); },
    onReorder: (from: string, to: string) => send({ type: "reorder-followed", from, to }),
    refreshingAll, onRefreshAll: () => void refreshAll(),
  };

  return <div ref={workspace} className="live-workspace">
    <div className={`sidebar-container ${drawer ? "drawer-open" : ""}`}><RoomSidebar {...sidebarProps} /></div>
    {mobile && drawer && <button className="sidebar-scrim" aria-label="关闭房间列表" onClick={() => setDrawer(false)} />}
    {mobile && !drawer && <button className="mobile-sidebar-toggle" aria-label="打开房间列表" onClick={() => setDrawer(true)}><SidebarSimple size={20} /></button>}
    <main className="workspace-main">
      <div className="workspace-canvas" ref={canvas} tabIndex={0} aria-label="直播布局"
        onPointerDownCapture={(event) => { if (!(event.target as HTMLElement).closest("button, input, textarea, select, a, [contenteditable], [role='dialog'], [role='menu']")) event.currentTarget.focus({ preventScroll: true }); }}
        onKeyDown={(event) => {
          if (event.key.toLowerCase() === "r" && !event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && !settings && !(event.target as HTMLElement).closest("input, textarea, select, [contenteditable], [role='dialog'], [role='menu']")) { event.preventDefault(); arrange(); }
        }}>
        {state.videos.length ? <MonitorCanvas videos={state.videos} focusedId={state.focus?.id ?? null} hoveredId={hoveredId} onControlRef={controlRef} size={size} danmaku={danmaku}
          onFullscreenChange={(id, active) => send({ type: "fullscreen", id, active, autoAudio: autoFocusAudio, autoDanmaku: autoFocusDanmaku })}
          onLayout={(id, layout) => send({ type: "layout", id, layout })} onRaise={(id) => send({ type: "raise", id })} onFocus={(id) => send({ type: "focus", id, autoAudio: autoFocusAudio, autoDanmaku: autoFocusDanmaku })} onMute={toggleMute}
          onAudio={(id, muted, volume) => send({ type: "audio", id, muted, volume })} onClose={stopWatching} onRefresh={refresh}
          onDanmaku={(id) => { const video = current.current.videos.find((v) => v.id === id); if (video) send({ type: "danmaku", id, enabled: !video.danmakuEnabled }); }}
          onFollow={changeFollow} recovery={recovery} onRecoveryEvent={(id, key, event) => void recoveryEvent(id, key, event)}
          onPlaybackError={playbackError} onPaused={(id, paused) => send({ type: "video", id, patch: { paused } })}
          onReady={(id, key) => { const video = current.current.videos.find((video) => video.id === id); if (video?.playbackKey === key && video.paused) send({ type: "video", id, patch: { status: "playing", errorMessage: undefined } }); }}
          onPlaying={(id, key) => send({ type: "playing", id, key, at: Date.now() })} />
          : <div className="workspace-empty"><div className="empty-icon"><SquaresFour size={30} weight="light" /></div>
            <span className="empty-eyebrow">YOUR LIVE DESK</span><h1>把喜欢的直播，放在一起</h1>
            <button className="primary-button" onClick={() => { if (mobile) setDrawer(true); else setCollapsed(false); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[aria-label="直播间地址"]')?.focus()); }}><Plus size={17} />添加第一个房间</button>
          </div>}
      </div>
    </main>
    <SettingsPanel open={settings} onClose={() => setSettings(false)} quality={quality} onQualityChange={setQuality} danmaku={danmaku} onDanmakuChange={setDanmaku} autoFocusAudio={autoFocusAudio} onAutoFocusAudioChange={changeAutoFocusAudio} autoFocusDanmaku={autoFocusDanmaku} onAutoFocusDanmakuChange={changeAutoFocusDanmaku} recovery={recovery} onRecoveryChange={changeRecovery} onShare={() => void shareCurrent()} hasVideos={state.videos.length > 0} />
    {(toast || closedRooms || unfollowedRoom) && <div role="status" className="workspace-toast">{unfollowedRoom ? <><span>已取消关注 {roomLabel(unfollowedRoom)}</span><button type="button" className="toast-undo" onClick={undoUnfollow}>撤销</button></> : closedRooms ? <><span>已关闭 {closedRooms.rooms.length} 个画面</span><button type="button" className="toast-undo" onClick={undoCloseAll}>撤销</button></> : toast}</div>}
  </div>;
}
