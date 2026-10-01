import type { FollowedRoom } from "@/types";
import { isPlatformEnabled } from "@/lib/platform-support";

export const HISTORY_LIMIT = 50;

export function followedRooms(rooms: FollowedRoom[], prioritizeLive = false): FollowedRoom[] {
  const priority = (room: FollowedRoom) => room.liveStatus === true ? 0 : room.liveStatus === false ? 1 : 2;
  return rooms.filter((room) => room.followed).sort((a, b) =>
    (prioritizeLive ? priority(a) - priority(b) : 0) || (a.followOrder ?? rooms.indexOf(a)) - (b.followOrder ?? rooms.indexOf(b)));
}

export function watchingHistory(rooms: FollowedRoom[]): FollowedRoom[] {
  return rooms.filter((room) => room.lastWatchedAt !== undefined)
    .sort((a, b) => b.lastWatchedAt! - a.lastWatchedAt!).slice(0, HISTORY_LIMIT);
}

// History retention never removes a room that is followed or currently open.
export function retainRooms(rooms: FollowedRoom[], openIds: string[]): FollowedRoom[] {
  const historyIds = new Set(watchingHistory(rooms.filter((room) => isPlatformEnabled(room.platform))).map((room) => room.id));
  return rooms.filter((room) => !isPlatformEnabled(room.platform) || room.followed || openIds.includes(room.id) || historyIds.has(room.id))
    .map((room) => !isPlatformEnabled(room.platform) || historyIds.has(room.id) ? room : { ...room, lastWatchedAt: undefined });
}
