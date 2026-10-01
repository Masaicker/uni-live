import type { Platform } from "@/types";

export function parseRoomAddress(input: string): { url: string; platform: Platform; rid: string } {
  let value = input.trim();
  if (/^\d+$/.test(value)) value = `https://www.douyu.com/${value}`;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  const address = new URL(value);
  if (!["http:", "https:"].includes(address.protocol)) throw new Error("请输入直播间或直播流的 HTTP 地址");
  const host = address.hostname.toLowerCase();
  const platform: Platform = host === "douyu.com" || host.endsWith(".douyu.com") ? "douyu"
    : host === "bilibili.com" || host.endsWith(".bilibili.com") ? "bilibili"
    : host === "huya.com" || host.endsWith(".huya.com") ? "huya" : "direct";
  const rid = address.searchParams.get("rid") || address.pathname.split("/").filter(Boolean).pop() || "";
  if (platform !== "direct" && !/^[a-zA-Z0-9_-]{1,80}$/.test(rid)) throw new Error("直播间地址中没有有效的房间号");
  return { url: address.href, platform, rid: platform === "direct" ? "" : rid };
}

export function roomIdentity(room: { platform: Platform; rid: string; url: string }): string {
  return room.rid && room.platform !== "direct" && room.platform !== "unknown" ? `${room.platform}:${room.rid}` : room.url;
}

export const platformNames: Record<Platform, string> = { douyu: "斗鱼", bilibili: "哔哩哔哩", huya: "虎牙", direct: "直播流", unknown: "直播" };

export function roomLabel(room: { platform: Platform; rid: string; anchorName: string; title: string }): string {
  return room.anchorName || room.title || (room.rid ? `${platformNames[room.platform]} ${room.rid}` : "自定义直播");
}
