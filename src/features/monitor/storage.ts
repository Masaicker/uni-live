import type { FollowedRoom, GridLayoutState, IQnType, VideoLayout, WorkspaceSnapshot } from "@/types";
import { parseRoomAddress, roomIdentity } from "@/lib/room-identity";
import { parseShareDanmakuList, parseShareGridLayout, parseShareVideoList } from "@/features/free-layout/layout-utils";
import { slotRect } from "@/features/grid-layout/grid-utils";
import { defaultLayout } from "./geometry";
import { retainRooms } from "./library";

export const WORKSPACE_KEY = "uni-live.workspace.v3";
export const qualities: IQnType[] = ["原画", "蓝光", "超清", "高清", "流畅"];

function createRoomId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === "function") cryptoApi.getRandomValues(bytes);
  // These IDs identify local rooms; they are not credentials or login tokens.
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createRoom(url: string, id = createRoomId()): FollowedRoom {
  const address = parseRoomAddress(url);
  return { id, ...address, anchorName: "", title: "", liveStatus: null, followed: false, qnName: "原画", danmakuEnabled: true, volume: 0.5, lastVolume: 0.5 };
}

function safeJson(value: string | null): unknown {
  try { return value ? JSON.parse(value) : null; } catch { return null; }
}

function validLayout(value: unknown): value is VideoLayout {
  if (!value || typeof value !== "object") return false;
  const r = value as VideoLayout;
  return [r.x, r.y, r.w, r.h, r.zIndex].every(Number.isFinite) && r.w > 0 && r.w <= 100 && r.h > 0 && r.h <= 100 && r.x >= 0 && r.y >= 0 && r.x + r.w <= 100.01 && r.y + r.h <= 100.01;
}

export function normalizeSnapshot(value: unknown): WorkspaceSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Omit<WorkspaceSnapshot, "version"> & { version: number };
  if (![2, 3].includes(raw.version) || !Array.isArray(raw.rooms) || !Array.isArray(raw.openIds)) return null;
  const rooms: FollowedRoom[] = [];
  for (const item of raw.rooms) {
    try {
      if (!item || typeof item.url !== "string") continue;
      const room = createRoom(item.url, typeof item.id === "string" && item.id ? item.id : undefined);
      room.rid = typeof item.rid === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(item.rid) ? item.rid : room.rid;
      room.anchorName = typeof item.anchorName === "string" ? item.anchorName : "";
      room.title = typeof item.title === "string" ? item.title : "";
      room.liveStatus = typeof item.liveStatus === "boolean" ? item.liveStatus : null;
      room.avatarUrl = typeof item.avatarUrl === "string" && /^https?:\/\//i.test(item.avatarUrl) ? item.avatarUrl : undefined;
      room.followed = raw.version === 3 && item.followed === true;
      room.followOrder = Number.isFinite(item.followOrder) && item.followOrder! >= 0 ? item.followOrder : rooms.length;
      room.lastWatchedAt = raw.version === 2 ? Date.now() - rooms.length : Number.isFinite(item.lastWatchedAt) && item.lastWatchedAt! > 0 ? item.lastWatchedAt : undefined;
      room.lastStatusAt = Number.isFinite(item.lastStatusAt) ? item.lastStatusAt : undefined;
      room.qnName = qualities.includes(item.qnName) ? item.qnName : "原画";
      room.preferredRate = Number.isInteger(item.preferredRate) && item.preferredRate! >= 0 ? item.preferredRate : undefined;
      room.danmakuEnabled = item.danmakuEnabled !== false;
      room.volume = Number.isFinite(item.volume) ? Math.max(0, Math.min(1, item.volume)) : 0.5;
      room.lastVolume = Number.isFinite(item.lastVolume) && item.lastVolume > 0 ? Math.min(1, item.lastVolume) : 0.5;
      room.layout = validLayout(item.layout) ? { ...item.layout, visible: true } : undefined;
      if (!rooms.some((r) => r.id === room.id || roomIdentity(r) === roomIdentity(room))) rooms.push(room);
    } catch { /* Preserve valid rooms if a single saved entry is malformed. */ }
  }
  const openIds = [...new Set(raw.openIds)].filter((id) => typeof id === "string" && rooms.some((room) => room.id === id));
  return { version: 3, rooms: retainRooms(rooms, openIds), openIds, manual: raw.manual === true };
}

export interface LegacyShare { shareVideo?: string | null; shareDanmaku?: string | null; shareLayoutMode?: string | null; shareLineCount?: string | null; shareGrid?: string | null; legacyShowType?: string | null }

export function restoreWorkspace(storage: Pick<Storage, "getItem">, share: LegacyShare): WorkspaceSnapshot {
  if (!share.shareVideo) {
    const current = normalizeSnapshot(safeJson(storage.getItem(WORKSPACE_KEY))) ?? normalizeSnapshot(safeJson(storage.getItem("uni-live.workspace.v2")));
    if (current) return current;
  }
  const list = share.shareVideo ? parseShareVideoList(share.shareVideo) : safeJson(storage.getItem("videoOrderList"));
  const mode = share.shareLayoutMode ?? share.legacyShowType ?? (share.shareVideo ? "free" : storage.getItem("layoutMode") ?? storage.getItem("showType"));
  const rawGrid = share.shareGrid ? parseShareGridLayout(share.shareGrid) : safeJson(storage.getItem("gridLayout"));
  const grid = rawGrid as GridLayoutState | null;
  const rooms: FollowedRoom[] = [];
  const openIds: string[] = [];
  if (Array.isArray(list)) for (const item of list) {
    try {
      const room = createRoom(item.url, typeof item.id === "string" ? item.id : undefined);
      room.qnName = qualities.includes(item.qnName) ? item.qnName : "原画";
      if (typeof item.danmakuEnabled === "boolean") room.danmakuEnabled = item.danmakuEnabled;
      if (Number.isInteger(item.preferredRate) && item.preferredRate >= 0) room.preferredRate = item.preferredRate;
      room.layout = validLayout(item.layout) ? { ...item.layout, visible: true } : undefined;
      if (!share.shareVideo) room.lastWatchedAt = Date.now() - rooms.length;
      if (mode === "grid" && grid && Number.isInteger(grid.rows) && grid.rows > 0 && Number.isInteger(grid.cols) && grid.cols > 0 && Array.isArray(grid.slots)) {
        const slot = grid.slots.find((s) => s.videoId === room.id);
        if (slot) {
          const rect = { ...defaultLayout, ...slotRect(slot, grid.rows, grid.cols, grid.gap) };
          if (validLayout(rect)) room.layout = rect;
        }
      }
      if (rooms.some((r) => roomIdentity(r) === roomIdentity(room))) continue;
      rooms.push(room);
      if (item.layout?.visible !== false) openIds.push(room.id);
    } catch { /* Ignore malformed legacy entries without deleting their source. */ }
  }
  const danmaku = share.shareDanmaku ? parseShareDanmakuList(share.shareDanmaku) : share.shareVideo ? [] : safeJson(storage.getItem("danmakuList"));
  if (Array.isArray(danmaku)) for (const item of danmaku) {
    try {
      const room = createRoom(item.url);
      if (!share.shareVideo) room.lastWatchedAt = Date.now() - rooms.length;
      if (!rooms.some((r) => roomIdentity(r) === roomIdentity(room))) rooms.push(room);
    } catch { /* Invalid legacy source. */ }
  }
  if (share.shareVideo) {
    const local = normalizeSnapshot(safeJson(storage.getItem(WORKSPACE_KEY))) ?? normalizeSnapshot(safeJson(storage.getItem("uni-live.workspace.v2")));
    if (local) {
      for (let i = 0; i < rooms.length; i++) {
        const imported = rooms[i];
        const existing = local.rooms.find((room) => roomIdentity(room) === roomIdentity(imported));
        if (existing) {
          const openIndex = openIds.indexOf(imported.id);
          rooms[i] = { ...existing, ...imported, id: existing.id, followed: existing.followed, lastWatchedAt: existing.lastWatchedAt, anchorName: existing.anchorName, title: existing.title, avatarUrl: existing.avatarUrl, volume: existing.volume, lastVolume: existing.lastVolume };
          if (openIndex >= 0) openIds[openIndex] = existing.id;
        } else if (local.rooms.some((room) => room.id === imported.id)) {
          const openIndex = openIds.indexOf(imported.id);
          rooms[i] = { ...imported, id: createRoomId() };
          if (openIndex >= 0) openIds[openIndex] = rooms[i].id;
        }
      }
      for (const room of local.rooms) if (!rooms.some((imported) => roomIdentity(imported) === roomIdentity(room))) rooms.push(room);
    }
  }
  return { version: 3, rooms: retainRooms(rooms, openIds), openIds, manual: (mode === "free" || mode === "grid") && rooms.some((r) => r.layout !== undefined) };
}

export function shareWorkspace(origin: string, snapshot: WorkspaceSnapshot): string {
  const video = snapshot.openIds.flatMap((id) => {
    const room = snapshot.rooms.find((room) => room.id === id);
    if (!room) return [];
    return [{ id: room.id, url: room.url, qnName: room.qnName, preferredRate: room.preferredRate, danmakuEnabled: room.danmakuEnabled, layout: room.layout }];
  });
  const params = new URLSearchParams({ video: btoa(encodeURIComponent(JSON.stringify(video))), layoutMode: snapshot.manual ? "free" : "auto" });
  return `${origin}?${params}`;
}
