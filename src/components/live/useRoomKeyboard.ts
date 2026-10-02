"use client";

import { useCallback, useEffect, useRef } from "react";
import type { MonitorVideo } from "@/types";
import { KeyboardRoomTarget } from "@/features/monitor/keyboard-target";
import type { MonitorTileHandle } from "@/features/monitor/MonitorTile";

interface Options {
  videos: MonitorVideo[];
  focusedId: string | null;
  fullscreenId: string | null;
  blocked: boolean;
}

const roomKeys = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "]);
const seekKeys = new Set(["ArrowLeft", "ArrowRight"]);
const excluded = "textarea, select, [contenteditable]:not([contenteditable='false']), input:not([type='range']), [role='dialog'], [role='menu'], [data-sorting='true']";

export function useRoomKeyboard(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const target = useRef(new KeyboardRoomTarget());
  const controls = useRef(new Map<string, MonitorTileHandle>());
  const seeking = useRef<{ id: string; playbackKey: number; keys: Set<string> } | null>(null);
  const held = useRef(new Set<string>());
  const canceledKeys = useRef(new Set<string>());
  const cancel = useCallback(() => {
    if (seeking.current) controls.current.get(seeking.current.id)?.finishSeek(false);
    seeking.current = null;
    for (const key of held.current) canceledKeys.current.add(key);
    held.current.clear();
  }, []);
  const register = useCallback((id: string, handle: MonitorTileHandle | null) => {
    if (handle) controls.current.set(id, handle);
    else { if (seeking.current?.id === id) cancel(); controls.current.delete(id); }
  }, [cancel]);

  useEffect(() => {
    const { videos, focusedId, fullscreenId, blocked } = latest.current;
    const id = target.current.update(videos.map((video) => video.id), focusedId, fullscreenId);
    const gesture = seeking.current;
    if (blocked || (gesture && (id !== gesture.id || !videos.some((video) => video.id === gesture.id && video.playbackKey === gesture.playbackKey)))) cancel();
  }, [options.videos, options.focusedId, options.fullscreenId, options.blocked, cancel]);

  useEffect(() => {
    const resolve = () => {
      const value = latest.current;
      return target.current.update(value.videos.map((video) => video.id), value.focusedId, value.fullscreenId);
    };
    const select = (event: Event) => {
      if (event instanceof PointerEvent && event.button !== 0) return;
      const node = event.target instanceof Element ? event.target : null;
      const tile = node?.closest<HTMLElement>(".monitor-tile[data-room-id]");
      if (!tile || node?.closest(excluded)) { cancel(); return; }
      const before = resolve();
      const id = tile.dataset.roomId!;
      if (!latest.current.videos.some((video) => video.id === id)) return;
      target.current.select(id);
      if (before !== resolve() || event.type === "pointerdown") cancel();
    };
    const allowed = (event: KeyboardEvent) => {
      const node = event.target instanceof Element ? event.target : null;
      return !latest.current.blocked && !document.hidden && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey
        && node?.closest(".workspace-canvas") && !node.closest(excluded)
        && !document.querySelector("[role='dialog'], [role='menu'], [data-sorting='true']");
    };
    const down = (event: KeyboardEvent) => {
      if (event.key === "Escape") { cancel(); return; }
      if (!roomKeys.has(event.key) || !allowed(event)) return;
      const id = resolve();
      const handle = id ? controls.current.get(id) : null;
      if (!id || !handle) return;
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat) canceledKeys.current.delete(event.key);
      else if (canceledKeys.current.has(event.key)) return;
      if (event.key === " " && (event.repeat || held.current.has(event.key))) return;
      held.current.add(event.key);
      if (seekKeys.has(event.key)) {
        const video = latest.current.videos.find((video) => video.id === id)!;
        if (seeking.current && seeking.current.id !== id) cancel();
        if (handle.key(event.key)) {
          seeking.current ??= { id, playbackKey: video.playbackKey, keys: new Set() };
          seeking.current.keys.add(event.key);
        }
      } else handle.key(event.key);
    };
    const up = (event: KeyboardEvent) => {
      const wasHeld = held.current.delete(event.key) || canceledKeys.current.has(event.key);
      canceledKeys.current.delete(event.key);
      // Suppress native button activation on Space keyup, even after focus moves.
      if (wasHeld && event.key === " ") { event.preventDefault(); event.stopPropagation(); }
      const gesture = seeking.current;
      if (!gesture || !gesture.keys.delete(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      if (gesture.keys.size) return;
      controls.current.get(gesture.id)?.finishSeek(Boolean(allowed(event) && resolve() === gesture.id));
      seeking.current = null;
    };
    const visibility = () => { if (document.hidden) cancel(); };
    document.addEventListener("pointerdown", select, true);
    document.addEventListener("focusin", select, true);
    document.addEventListener("keydown", down, true);
    document.addEventListener("keyup", up, true);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", cancel);
    return () => {
      cancel();
      document.removeEventListener("pointerdown", select, true);
      document.removeEventListener("focusin", select, true);
      document.removeEventListener("keydown", down, true);
      document.removeEventListener("keyup", up, true);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", cancel);
    };
  }, [cancel]);
  return register;
}
