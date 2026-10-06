import type { FollowedRoom, MonitorState, MonitorVideo, VideoLayout, WorkspaceSnapshot } from "@/types";
import { defaultLayout } from "./geometry";
import { roomIdentity } from "@/lib/room-identity";
import { isPlatformEnabled } from "@/lib/platform-support";
import { followedRooms, retainRooms } from "./library";

export const initialMonitorState: MonitorState = { rooms: [], videos: [], manual: false, focus: null, fullscreen: null };

export function createVideo(room: FollowedRoom, layout = room.layout ?? defaultLayout): MonitorVideo {
  return { ...room, stream: "", streamType: "flv", playbackKey: 0, layout: { ...layout }, status: "idle", muted: true, paused: false, followingLive: true, qualities: [], isRefreshing: false, recoveryKey: 0 };
}

export type MonitorAction =
  | { type: "hydrate"; snapshot: WorkspaceSnapshot }
  | { type: "add"; room: FollowedRoom }
  | { type: "follow"; id: string; followed: boolean }
  | { type: "reorder-followed"; from: string; to: string }
  | { type: "played"; id: string; at: number }
  | { type: "visited"; id: string; at: number }
  | { type: "restore-follow"; room: FollowedRoom }
  | { type: "forget"; id: string }
  | { type: "clear-history" }
  | { type: "open"; id: string; layout: VideoLayout }
  | { type: "close" | "remove"; id: string }
  | { type: "close-all" }
  | { type: "restore-closed"; rooms: FollowedRoom[]; manual: boolean }
  | { type: "room"; id: string; patch: Partial<FollowedRoom> }
  | { type: "video"; id: string; patch: Partial<MonitorVideo> }
  | { type: "playing"; id: string; key: number; at: number }
  | { type: "danmaku"; id: string; enabled: boolean }
  | { type: "layout"; id: string; layout: VideoLayout }
  | { type: "raise"; id: string }
  | { type: "arrange"; layouts: Record<string, VideoLayout> }
  | { type: "audio"; id: string; muted: boolean; volume: number }
  | { type: "mute-all" }
  | { type: "focus"; id: string | null; autoAudio?: boolean; autoDanmaku?: boolean }
  | { type: "fullscreen"; id: string; active: boolean; autoAudio: boolean; autoDanmaku?: boolean }
  | { type: "audio-policy"; enabled: boolean }
  | { type: "danmaku-policy"; enabled: boolean };

function restoreViewingState(state: MonitorState, kind: "focus" | "fullscreen"): MonitorVideo[] {
  const session = state[kind];
  return state.videos.map((video) => {
    if (!session || video.id !== session.id) return video;
    return { ...video, ...(!session.adjusted ? { muted: session.muted, volume: session.volume } : {}),
      ...(!session.danmakuAdjusted ? { danmakuEnabled: session.danmakuEnabled } : {}) };
  });
}

function enterViewingMode(state: MonitorState, kind: "focus" | "fullscreen", id: string, autoAudio: boolean, autoDanmaku: boolean): MonitorState {
  const previous = state.focus ?? state.fullscreen;
  const sameRoom = previous?.id === id;
  const videos = sameRoom ? state.videos : restoreViewingState(state, state.focus ? "focus" : "fullscreen");
  const target = videos.find((video) => video.id === id);
  if (!target) return state;
  // Switching modes extends the same temporary audio session, including manual changes.
  const session = { id, muted: sameRoom ? previous!.muted : target.muted, volume: sameRoom ? previous!.volume : target.volume,
    adjusted: sameRoom ? previous!.adjusted : false, autoAudio, danmakuEnabled: sameRoom ? previous!.danmakuEnabled : target.danmakuEnabled,
    danmakuAdjusted: sameRoom ? previous!.danmakuAdjusted : false, autoDanmaku };
  const focused = state.focus;
  // Focus swaps own a temporary order; ordinary layouts and their saved order stay untouched.
  const focus = kind === "focus" ? { ...session, order: focused
    ? focused.order.map((roomId) => roomId === id ? focused.id : roomId === focused.id ? id : roomId)
    : videos.map((video) => video.id) } : null;
  return { ...state, focus, fullscreen: kind === "fullscreen" ? session : null,
    videos: videos.map((video) => video.id === id ? { ...video, paused: false,
      ...(!session.adjusted ? { muted: autoAudio ? false : session.muted, volume: autoAudio ? video.volume || video.lastVolume || 0.5 : session.volume } : {}),
      ...(!session.danmakuAdjusted ? { danmakuEnabled: autoDanmaku || session.danmakuEnabled } : {}),
    } : video) };
}

function changes<T extends object>(target: T, patch: Partial<T>): boolean {
  return Object.keys(patch).some((key) => !Object.is(target[key as keyof T], patch[key as keyof T]));
}

function updateRoom(state: MonitorState, id: string, patch: Partial<FollowedRoom>): MonitorState {
  const roomsChanged = state.rooms.some((room) => room.id === id && changes(room, patch));
  const videosChanged = state.videos.some((video) => video.id === id && changes(video, patch));
  if (!roomsChanged && !videosChanged) return state;
  return { ...state,
    rooms: roomsChanged ? state.rooms.map((room) => room.id === id ? { ...room, ...patch } : room) : state.rooms,
    videos: videosChanged ? state.videos.map((video) => video.id === id ? { ...video, ...patch, layout: patch.layout ?? video.layout } : video) : state.videos,
  };
}

export function monitorReducer(state: MonitorState, action: MonitorAction): MonitorState {
  switch (action.type) {
    case "hydrate": return {
      rooms: action.snapshot.rooms,
      videos: action.snapshot.openIds.flatMap((id) => { const room = action.snapshot.rooms.find((room) => room.id === id); return room && isPlatformEnabled(room.platform) ? [createVideo(room)] : []; }),
      manual: action.snapshot.manual, focus: null, fullscreen: null,
    };
    case "add": return !isPlatformEnabled(action.room.platform) || state.rooms.some((room) => roomIdentity(room) === roomIdentity(action.room))
      ? state : { ...state, rooms: [...state.rooms, action.room] };
    case "follow": {
      const room = state.rooms.find((item) => item.id === action.id);
      const next = updateRoom(state, action.id, { followed: action.followed, ...(action.followed && !room?.followed ? { followOrder: Math.max(-1, ...followedRooms(state.rooms).map((item) => item.followOrder ?? state.rooms.indexOf(item))) + 1 } : {}) });
      return { ...next, rooms: retainRooms(next.rooms, next.videos.map((v) => v.id)) };
    }
    case "reorder-followed": {
      const ordered = followedRooms(state.rooms).map((room) => room.id);
      const from = ordered.indexOf(action.from), to = ordered.indexOf(action.to);
      if (from < 0 || to < 0 || from === to) return state;
      ordered.splice(to, 0, ordered.splice(from, 1)[0]);
      const order = new Map(ordered.map((id, index) => [id, index]));
      return { ...state, rooms: state.rooms.map((room) => order.has(room.id) ? { ...room, followOrder: order.get(room.id) } : room) };
    }
    case "restore-follow": {
      const rooms = state.rooms.some((room) => room.id === action.room.id) ? state.rooms : [...state.rooms, action.room];
      return updateRoom({ ...state, rooms }, action.room.id, { followed: true, followOrder: action.room.followOrder });
    }
    case "played": case "visited": {
      if (action.type === "played" && !state.videos.some((v) => v.id === action.id)) return state;
      const next = updateRoom(state, action.id, { lastWatchedAt: action.at });
      return { ...next, rooms: retainRooms(next.rooms, next.videos.map((v) => v.id)) };
    }
    case "forget": case "clear-history": {
      const rooms = state.rooms.map((room) => (action.type === "clear-history" && isPlatformEnabled(room.platform)) || (action.type === "forget" && room.id === action.id)
        ? { ...room, lastWatchedAt: undefined } : room);
      return { ...state, rooms: retainRooms(rooms, state.videos.map((v) => v.id)),
        videos: state.videos.map((video) => action.type === "clear-history" || video.id === action.id ? { ...video, lastWatchedAt: undefined } : video) };
    }
    case "open": {
      const room = state.rooms.find((r) => r.id === action.id);
      return !room || !isPlatformEnabled(room.platform) || state.videos.some((v) => v.id === action.id) ? state : {
        ...state, rooms: state.rooms.map((r) => r.id === action.id ? { ...r, layout: action.layout } : r),
        videos: [...state.videos, createVideo(room, action.layout)],
        focus: state.focus ? { ...state.focus, order: [...state.focus.order, action.id] } : null,
      };
    }
    case "close": case "remove": {
      const videos = state.videos.filter((v) => v.id !== action.id);
      return { ...state,
        rooms: retainRooms(action.type === "remove" ? state.rooms.filter((r) => r.id !== action.id) : state.rooms, videos.map((v) => v.id)),
        videos, focus: state.focus ? state.focus.id === action.id ? null : { ...state.focus, order: state.focus.order.filter((id) => id !== action.id) } : null,
        fullscreen: state.fullscreen?.id === action.id ? null : state.fullscreen,
      };
    }
    case "close-all": return { ...state, rooms: retainRooms(state.rooms, []), videos: [], manual: false, focus: null, fullscreen: null };
    case "restore-closed": {
      const rooms = [...state.rooms];
      const videos = [...state.videos];
      const restoredIds: string[] = [];
      for (const saved of action.rooms) {
        if (!isPlatformEnabled(saved.platform) || videos.some((video) => video.id === saved.id)) continue;
        let room = rooms.find((room) => room.id === saved.id);
        if (!room) { room = saved; rooms.push(room); }
        videos.push(createVideo(room, saved.layout));
        restoredIds.push(room.id);
      }
      return { ...state, rooms, videos, manual: action.manual,
        focus: state.focus && restoredIds.length ? { ...state.focus, order: [...state.focus.order, ...restoredIds] } : state.focus };
    }
    case "room": return updateRoom(state, action.id, action.patch);
    case "video": return state.videos.some((v) => v.id === action.id && changes(v, action.patch))
      ? { ...state, videos: state.videos.map((v) => v.id === action.id ? { ...v, ...action.patch } : v) } : state;
    case "playing": {
      const video = state.videos.find((v) => v.id === action.id);
      if (!video || video.playbackKey !== action.key) return state;
      let next = monitorReducer(state, { type: "video", id: action.id, patch: { paused: false, status: "playing", errorMessage: undefined, lastPlayedKey: action.key } });
      if (video.lastPlayedKey !== action.key) next = monitorReducer(next, { type: "played", id: action.id, at: action.at });
      return next;
    }
    case "danmaku": {
      const next = updateRoom(state, action.id, { danmakuEnabled: action.enabled, danmakuPreferenceSet: true });
      return { ...next,
        focus: next.focus?.id === action.id ? { ...next.focus, danmakuAdjusted: true } : next.focus,
        fullscreen: next.fullscreen?.id === action.id ? { ...next.fullscreen, danmakuAdjusted: true } : next.fullscreen,
      };
    }
    case "layout": return { ...updateRoom(state, action.id, { layout: action.layout }), manual: true };
    case "raise": {
      if (state.focus || state.fullscreen) return state;
      const video = state.videos.find((item) => item.id === action.id);
      const top = Math.max(0, ...state.videos.filter((item) => item.id !== action.id).map((item) => item.layout.zIndex));
      return !video || video.layout.zIndex > top ? state : updateRoom(state, action.id, { layout: { ...video.layout, zIndex: top + 1 } });
    }
    case "arrange": return { ...state, manual: false,
      rooms: state.rooms.map((room) => action.layouts[room.id] ? { ...room, layout: action.layouts[room.id] } : room),
      videos: state.videos.map((video) => action.layouts[video.id] ? { ...video, layout: action.layouts[video.id] } : video)
        .sort((a, b) => a.layout.zIndex - b.layout.zIndex),
    };
    case "audio": {
      const volume = Math.max(0, Math.min(1, action.volume));
      return { ...state,
        rooms: state.rooms.map((r) => r.id === action.id ? { ...r, volume, lastVolume: volume > 0 ? volume : r.lastVolume } : r),
        videos: state.videos.map((v) => v.id === action.id ? { ...v, muted: action.muted, volume, lastVolume: volume > 0 ? volume : v.lastVolume } : v),
        focus: state.focus?.id === action.id ? { ...state.focus, adjusted: true } : state.focus,
        fullscreen: state.fullscreen?.id === action.id ? { ...state.fullscreen, adjusted: true } : state.fullscreen,
      };
    }
    case "mute-all": return { ...state, videos: state.videos.map((v) => ({ ...v, muted: true })), focus: state.focus ? { ...state.focus, adjusted: true } : null, fullscreen: state.fullscreen ? { ...state.fullscreen, adjusted: true } : null };
    case "focus": {
      if (!action.id || action.id === state.focus?.id) return state.focus ? { ...state, videos: restoreViewingState(state, "focus"), focus: null } : state;
      return enterViewingMode(state, "focus", action.id, action.autoAudio !== false, action.autoDanmaku !== false);
    }
    case "fullscreen": {
      if (!action.active) return state.fullscreen?.id === action.id ? { ...state, videos: restoreViewingState(state, "fullscreen"), fullscreen: null } : state;
      if (state.fullscreen?.id === action.id) return state;
      return enterViewingMode(state, "fullscreen", action.id, action.autoAudio, action.autoDanmaku !== false);
    }
    case "audio-policy": {
      const focus = state.focus ? { ...state.focus, autoAudio: action.enabled } : null;
      const fullscreen = state.fullscreen ? { ...state.fullscreen, autoAudio: action.enabled } : null;
      return { ...state, focus, fullscreen, videos: state.videos.map((video) => {
        const sessions = [focus, fullscreen].filter((session) => session?.id === video.id);
        const baseline = sessions[0];
        if (!baseline || sessions.some((session) => session?.adjusted)) return video;
        return { ...video, muted: action.enabled ? false : baseline.muted, volume: action.enabled ? baseline.volume || video.lastVolume || 0.5 : baseline.volume, ...(action.enabled ? { paused: false } : {}) };
      }) };
    }
    case "danmaku-policy": {
      const focus = state.focus ? { ...state.focus, autoDanmaku: action.enabled } : null;
      const fullscreen = state.fullscreen ? { ...state.fullscreen, autoDanmaku: action.enabled } : null;
      const session = focus ?? fullscreen;
      return { ...state, focus, fullscreen, videos: state.videos.map((video) => !session || session.id !== video.id || session.danmakuAdjusted
        ? video : { ...video, danmakuEnabled: action.enabled || session.danmakuEnabled }) };
    }
  }
}

export function workspaceSnapshot(state: MonitorState): WorkspaceSnapshot {
  return { version: 3, rooms: retainRooms(state.rooms, state.videos.map((v) => v.id)), openIds: state.videos.map((v) => v.id), manual: state.manual };
}
