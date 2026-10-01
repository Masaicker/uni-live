import axios from "axios";
import type { IQnType, IStreamType } from "@/types";

const QN_BILIBILI: Record<IQnType, number> = { 原画: 20000, 蓝光: 400, 超清: 250, 高清: 150, 流畅: 80 };
interface BilibiliPlayResponse {
  code?: number;
  data?: {
    live_status?: number;
    durl?: { url?: string }[];
    playurl_info?: { playurl?: { stream?: {
      format?: { format_name?: string; codec?: {
        codec_name?: string; base_url?: string; url_info?: { host?: string; extra?: string }[];
      }[] }[];
    }[] } };
  };
}

export function selectBilibiliStreams(response: BilibiliPlayResponse, type: IStreamType): string[] {
  const candidates: { url: string; format: string }[] = [];
  for (const stream of response.data?.playurl_info?.playurl?.stream ?? []) {
    for (const format of stream.format ?? []) {
      for (const codec of format.codec ?? []) {
        if (codec.codec_name && !["avc", "h264"].includes(codec.codec_name)) continue;
        for (const info of codec.url_info ?? []) {
          if (/^https?:\/\//i.test(info.host ?? "") && codec.base_url) candidates.push({ url: `${info.host}${codec.base_url}${info.extra ?? ""}`, format: format.format_name ?? "" });
        }
      }
    }
  }
  const priority = (format: string) => type === "flv" ? format === "flv" ? 0 : 1 : format === "ts" ? 0 : format !== "flv" ? 1 : 2;
  candidates.sort((a, b) => priority(a.format) - priority(b.format) || Number(a.url.includes("mcdn")) - Number(b.url.includes("mcdn")));
  const urls = candidates.map((item) => item.url);
  if (!urls.length) for (const item of response.data?.durl ?? []) if (/^https?:\/\//i.test(item.url ?? "")) urls.push(item.url!);
  return [...new Set(urls)];
}

export function selectBilibiliStream(response: BilibiliPlayResponse, type: IStreamType): string {
  return selectBilibiliStreams(response, type)[0] ?? "";
}

export async function getRealLive_Bilibili(roomId: string, qn: IQnType, type: IStreamType): Promise<string> {
  let response: BilibiliPlayResponse;
  try {
    const result = await axios.get<BilibiliPlayResponse>("https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo", {
      proxy: false, timeout: 15000,
      params: { room_id: roomId, platform: "web", qn: QN_BILIBILI[qn], protocol: "0,1", format: "0,1,2", codec: "0" },
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36", Referer: `https://live.bilibili.com/${roomId}` },
    });
    response = result.data;
  } catch { throw new Error("哔哩哔哩播放接口连接失败或超时，请稍后刷新"); }
  if (response?.code !== 0) throw new Error("哔哩哔哩播放接口拒绝请求，请稍后刷新或尝试其他画质");
  if (response.data?.live_status === 0) throw new Error("哔哩哔哩房间尚未开播");
  const stream = selectBilibiliStream(response, type);
  if (!stream) throw new Error("哔哩哔哩未返回可播放的 H.264 直播流，请确认房间已开播或切换画质");
  return stream;
}
