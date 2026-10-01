import axios from "axios";
import type { IStreamType } from "@/types";

export async function getRealLive_Huya(roomId: string, type: IStreamType = "flv"): Promise<string> {
  let room;
  try {
    const response = await axios.get("https://mp.huya.com/cache.php", {
      params: { m: "Live", do: "profileRoom", roomid: roomId }, proxy: false, timeout: 15000,
      headers: { "User-Agent": "Mozilla/5.0", Referer: `https://www.huya.com/${roomId}` },
    });
    room = response.data?.data;
  } catch { throw new Error("虎牙播放接口连接失败或超时，请稍后刷新"); }
  if (room?.liveStatus === "OFF" || Number(room?.liveData?.isOn) === 0) throw new Error("虎牙房间尚未开播");
  const lines = room?.stream?.[type === "hls" ? "hls" : "flv"]?.multiLine;
  const stream = Array.isArray(lines) ? lines.find((item: { url?: string }) => /^https?:\/\//i.test(item?.url ?? ""))?.url : "";
  if (!stream) throw new Error("虎牙未返回可播放的直播流，请确认房间地址和开播状态");
  return stream;
}
