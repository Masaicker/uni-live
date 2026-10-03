import axios from "axios";
import { NextResponse } from "next/server";
import { getDouyuRoom } from "@/lib/reallive/douyu/realrid";
import { getRealRid_Bilibili } from "@/lib/reallive/bilibili/realrid";
import type { RoomInfo } from "@/types";
import { BILIBILI_DISABLED_MESSAGE, isPlatformEnabled } from "@/lib/platform-support";

const options = { proxy: false as const, timeout: 10000, headers: { "User-Agent": "Mozilla/5.0", Referer: "https://www.douyu.com/" } };

export async function POST(request: Request) {
  try {
    const { platform, rid } = await request.json();
    if (platform === "bilibili" && !isPlatformEnabled(platform)) return NextResponse.json({ error: BILIBILI_DISABLED_MESSAGE }, { status: 503 });
    if (!["douyu", "bilibili", "huya"].includes(platform) || typeof rid !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(rid)) {
      return NextResponse.json({ error: "房间地址不正确" }, { status: 400 });
    }
    let info: RoomInfo;
    if (platform === "douyu") {
      const room = await getDouyuRoom(rid);
      const realRid = String(room.room_id);
      if (!String(room.owner_name ?? "").trim()) throw new Error("Room metadata unavailable");
      info = { platform, rid: realRid, anchorName: String(room.owner_name ?? ""), title: String(room.room_name ?? ""), avatarUrl: String(room.owner_avatar ?? ""), liveStatus: room.show_status !== undefined ? Number(room.show_status) === 1 && Number(room.videoLoop) !== 1 : null };
    } else if (platform === "bilibili") {
      const realRid = String(await getRealRid_Bilibili(rid));
      const { data } = await axios.get(`https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${realRid}`, { ...options, headers: { ...options.headers, Referer: "https://live.bilibili.com/" } });
      const room = data?.data;
      if (data?.code !== 0 || !room) throw new Error("Room metadata unavailable");
      let anchorName = "";
      let avatarUrl = "";
      try {
        const response = await axios.get(`https://api.live.bilibili.com/live_user/v1/Master/info?uid=${room.uid}`, options);
        anchorName = response.data?.data?.info?.uname ?? "";
        avatarUrl = response.data?.data?.info?.face ?? "";
      } catch { /* Room title remains useful when the user endpoint fails. */ }
      info = { platform, rid: realRid, anchorName, title: String(room.title ?? ""), avatarUrl, liveStatus: room.live_status !== undefined ? Number(room.live_status) === 1 : null };
    } else {
      const { data } = await axios.get(`https://mp.huya.com/cache.php?m=Live&do=profileRoom&roomid=${rid}`, options);
      const room = data?.data;
      if (!room) throw new Error("Room metadata unavailable");
      const profile = room.profileInfo ?? {};
      const live = room.liveData ?? {};
      if (!/^\d+$/.test(String(profile.profileRoom)) || Number(profile.profileRoom) <= 0 || !String(profile.nick ?? "").trim()) throw new Error("Room metadata unavailable");
      info = { platform, rid: String(profile.profileRoom ?? rid), anchorName: String(profile.nick ?? ""), title: String(live.introduction ?? live.roomName ?? ""), avatarUrl: String(profile.avatar180 ?? profile.avatar ?? ""), liveStatus: live.isOn !== undefined ? Number(live.isOn) === 1 : room.liveStatus !== undefined ? String(room.liveStatus) === "ON" : null };
    }
    if (info.avatarUrl?.startsWith("//")) info.avatarUrl = `https:${info.avatarUrl}`;
    if (!/^https?:\/\//i.test(info.avatarUrl ?? "")) info.avatarUrl = undefined;
    return NextResponse.json(info);
  } catch {
    return NextResponse.json({ error: "暂时无法获取房间信息" }, { status: 502 });
  }
}
