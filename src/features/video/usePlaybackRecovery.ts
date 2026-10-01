"use client";

import { useEffect, useRef } from "react";
import type { MonitorVideo } from "@/types";
import { PlaybackWatchdog, type RecoveryEvent, type RecoveryPreferences } from "./playback-watchdog";

export function usePlaybackRecovery(media: React.RefObject<HTMLVideoElement | null>, video: MonitorVideo,
  preferences: RecoveryPreferences, onEvent: (key: number, event: RecoveryEvent) => void) {
  const watchdog = useRef(new PlaybackWatchdog());
  const latest = useRef({ video, onEvent });
  latest.current = { video, onEvent };
  useEffect(() => {
    const monitor = watchdog.current;
    monitor.reset(preferences.enabled);
    if (!preferences.enabled) return;
    let observed: HTMLVideoElement | null = null;
    const suspend = () => { monitor.tick(Date.now(), { key: latest.current.video.playbackKey, blocked: true }, preferences); };
    const check = () => {
      const { video: current, onEvent: report } = latest.current;
      const player = media.current;
      if (observed !== player) {
        observed?.removeEventListener("seeking", suspend);
        observed = player;
        observed?.addEventListener("seeking", suspend);
      }
      const available = player?.isConnected === true;
      const event = monitor.tick(Date.now(), {
        key: current.playbackKey,
        time: available ? player.currentTime : undefined,
        frames: available ? player.getVideoPlaybackQuality?.().totalVideoFrames : undefined,
        blocked: current.paused || current.isRefreshing || current.recoveryStopped === true
          || document.visibilityState !== "visible" || !navigator.onLine
          || (available && player.seeking),
      }, preferences);
      if (event) report(current.playbackKey, event);
    };
    const timer = setInterval(check, 1000);
    document.addEventListener("visibilitychange", suspend);
    window.addEventListener("offline", suspend);
    window.addEventListener("online", suspend);
    return () => {
      clearInterval(timer);
      observed?.removeEventListener("seeking", suspend);
      document.removeEventListener("visibilitychange", suspend);
      window.removeEventListener("offline", suspend);
      window.removeEventListener("online", suspend);
    };
  }, [media, preferences, video.recoveryKey]);
}
